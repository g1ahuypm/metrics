import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import { subDays } from "date-fns";
import { db } from "../db";
import { decrypt } from "../crypto";

/**
 * The support mailbox, read over IMAP and written over SMTP with a Gmail app
 * password. Hosts default to Gmail; the env overrides exist for other providers
 * (and for testing against a local mail server).
 */
export type MailConfig = {
  email: string;
  password: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
};

const bool = (v: string | undefined, d: boolean) => (v === undefined ? d : v === "true");

export function mailServers(): Pick<MailConfig, "imap" | "smtp"> {
  return {
    imap: {
      host: process.env.SUPPORT_IMAP_HOST || "imap.gmail.com",
      port: Number(process.env.SUPPORT_IMAP_PORT || 993),
      secure: bool(process.env.SUPPORT_IMAP_SECURE, true),
    },
    smtp: {
      host: process.env.SUPPORT_SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SUPPORT_SMTP_PORT || 465),
      secure: bool(process.env.SUPPORT_SMTP_SECURE, true),
    },
  };
}

export async function getMailConfig(): Promise<MailConfig | null> {
  const s = await db.settings.findUnique({ where: { id: "default" }, select: { supportEmail: true, supportAppPassword: true } });
  const password = decrypt(s?.supportAppPassword);
  if (!s?.supportEmail || !password) return null;
  return { email: s.supportEmail, password, ...mailServers() };
}

function imapClient(cfg: MailConfig) {
  return new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: cfg.imap.secure,
    auth: { user: cfg.email, pass: cfg.password },
    logger: false,
    tls: { rejectUnauthorized: cfg.imap.secure },
  });
}

function smtpTransport(cfg: MailConfig) {
  return nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: { user: cfg.email, pass: cfg.password },
    tls: { rejectUnauthorized: cfg.smtp.secure },
  });
}

/** Plain-language reason a login failed, for the Settings page. */
function explain(err: unknown): string {
  const text = err instanceof Error ? `${err.message} ${(err as { responseText?: string }).responseText ?? ""}` : String(err);
  if (/auth|credential|password|535|invalid/i.test(text)) {
    return "Gmail rejected the login. Check the address, and that the app password is the 16-letter one from Google (not your normal password).";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(text)) return "Could not reach Gmail. Try again in a minute.";
  return text.slice(0, 200);
}

/** Logs in to both IMAP and SMTP without reading or sending anything. */
export async function testMailbox(cfg: MailConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const imap = imapClient(cfg);
  try {
    await imap.connect();
    await imap.logout();
    await smtpTransport(cfg).verify();
    return { ok: true };
  } catch (err) {
    try {
      imap.close();
    } catch {
      /* already closed */
    }
    return { ok: false, error: explain(err) };
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type IncomingMail = {
  uid: number;
  gmailThreadId: string | null;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  text: string; // the new part of the message, quoted history removed
  sentAt: Date;
  automated: boolean; // newsletters, notifications, auto-replies: never worth an AI call
};

const first = (a: AddressObject | AddressObject[] | undefined) => (Array.isArray(a) ? a[0] : a)?.value[0];

/** Drops quoted replies ("On Mon, X wrote:", "> ..." lines, forwarded originals). */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    if (/^\s*On .{3,200}wrote:\s*$/i.test(line) || (/^\s*On .{3,200}$/i.test(line) && /wrote:\s*$/i.test(next))) break;
    if (/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}/i.test(line)) break;
    if (/^\s*From: .+$/i.test(line) && /^\s*(Sent|Date): /i.test(next)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isAutomated(p: ParsedMail, fromEmail: string): boolean {
  const h = (k: string) => {
    const v = p.headers.get(k);
    return v === undefined ? "" : String(typeof v === "object" && v !== null && "value" in v ? (v as { value: unknown }).value : v).toLowerCase();
  };
  const auto = h("auto-submitted");
  return (
    (auto !== "" && auto !== "no") ||
    p.headers.has("list-unsubscribe") ||
    p.headers.has("list-id") ||
    ["bulk", "list", "junk"].includes(h("precedence")) ||
    p.headers.has("x-autoreply") ||
    p.headers.has("x-autorespond") ||
    /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce)/i.test(fromEmail)
  );
}

function parse(uid: number, threadId: string | undefined, p: ParsedMail, mailbox: string): IncomingMail | null {
  const sender = first(p.from);
  if (!sender?.address) return null;
  if (sender.address.toLowerCase() === mailbox.toLowerCase()) return null; // our own messages
  // The store's contact form (and similar relays) sends from its own address with the
  // customer in Reply-To: the customer is who we answer.
  const replyTo = first(p.replyTo);
  const from = replyTo?.address && replyTo.address.toLowerCase() !== mailbox.toLowerCase() ? replyTo : sender;
  const fromEmail = from.address!.toLowerCase();
  const refs = p.references === undefined ? [] : Array.isArray(p.references) ? p.references : [p.references];
  const full = (p.text ?? "").trim();
  return {
    uid,
    gmailThreadId: threadId ?? null,
    messageId: p.messageId ?? `<uid-${uid}-${(p.date ?? new Date()).getTime()}@local>`,
    inReplyTo: p.inReplyTo ?? null,
    references: refs,
    fromEmail,
    fromName: from.name || null,
    toEmail: first(p.to)?.address?.toLowerCase() ?? mailbox,
    subject: (p.subject ?? "(no subject)").trim() || "(no subject)",
    text: stripQuoted(full) || full,
    sentAt: p.date ?? new Date(),
    automated: isAutomated(p, sender.address.toLowerCase()) && from === sender,
  };
}

/**
 * New INBOX messages since the last run (the last 14 days on the first run).
 * Gmail's Spam folder is never read. Returns the mail and the new UID watermark.
 */
export async function fetchNewMail(
  cfg: MailConfig,
  state: { uidValidity: string | null; lastUid: number | null },
  limit = 200,
): Promise<{ mail: IncomingMail[]; uidValidity: string; lastUid: number }> {
  const client = imapClient(cfg);
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = client.mailbox;
    if (!box) throw new Error("INBOX not available");
    const uidValidity = String(box.uidValidity);
    const fresh = state.uidValidity !== uidValidity || state.lastUid === null;
    const found = fresh
      ? await client.search({ since: subDays(new Date(), 14) }, { uid: true })
      : await client.search({ uid: `${state.lastUid! + 1}:*` }, { uid: true });
    const uids = (Array.isArray(found) ? found : [])
      .filter((u) => fresh || u > state.lastUid!)
      .sort((a, b) => a - b)
      .slice(0, limit);
    const mail: IncomingMail[] = [];
    let lastUid = fresh ? 0 : state.lastUid!;
    if (uids.length) {
      for await (const msg of client.fetch(uids.join(","), { uid: true, source: true, threadId: true }, { uid: true })) {
        lastUid = Math.max(lastUid, msg.uid);
        if (!msg.source) continue;
        const parsed = parse(msg.uid, msg.threadId, await simpleParser(msg.source), cfg.email);
        if (parsed) mail.push(parsed);
      }
    }
    if (fresh && !uids.length) lastUid = Math.max(0, Number(box.uidNext ?? 1) - 1);
    return { mail, uidValidity, lastUid };
  } finally {
    lock.release();
    await client.logout().catch(() => client.close());
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type OutgoingReply = {
  to: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
};

/** Sends a reply from the support address, threaded under the customer's email. Gmail files it in Sent. */
export async function sendMail(cfg: MailConfig, senderName: string, reply: OutgoingReply): Promise<{ messageId: string }> {
  const info = await smtpTransport(cfg).sendMail({
    from: { name: senderName, address: cfg.email },
    to: reply.to,
    subject: /^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`,
    text: reply.text,
    inReplyTo: reply.inReplyTo ?? undefined,
    references: reply.references.length ? reply.references : undefined,
  });
  return { messageId: info.messageId };
}
