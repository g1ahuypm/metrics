import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { canEdit, requireSupport } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { validTimezone } from "@/lib/scope";
import { maybeCheckSupport } from "@/lib/autosync";
import { fmtDateTime } from "@/lib/format";
import { SupportHeader } from "@/components/support/SupportHeader";
import { StatusBadge } from "@/components/support/StatusBadge";

const TABS = [
  { key: "needs", label: "Needs you", where: { category: { not: "other" }, status: { in: ["new", "needs_reply", "needs_action"] } } },
  { key: "answered", label: "Answered", where: { category: "customer", status: { in: ["auto_replied", "replied"] } } },
  { key: "done", label: "Done", where: { category: { not: "other" }, status: "done" } },
  { key: "other", label: "Not customers", where: { category: "other" } },
] satisfies { key: string; label: string; where: Prisma.SupportThreadWhereInput }[];

export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requireSupport();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const q = (sp.q ?? "").trim();
  const search: Prisma.SupportThreadWhereInput = q
    ? { OR: [{ customerEmail: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { orderNames: { contains: q, mode: "insensitive" } }] }
    : {};
  await maybeCheckSupport();
  const [settings, threads, counts, articles] = await Promise.all([
    getSettingsRow(),
    db.supportThread.findMany({
      where: { ...tab.where, ...search },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      include: { messages: { orderBy: { sentAt: "desc" }, take: 1, select: { text: true, direction: true } } },
    }),
    Promise.all(TABS.map((t) => db.supportThread.count({ where: t.where }))),
    db.kbArticle.findMany({ select: { key: true, title: true } }),
  ]);
  const tz = validTimezone(settings.timezone);
  const topicTitle = new Map(articles.map((a) => [a.key, a.title]));
  const connected = Boolean(settings.supportEmail && settings.supportAppPassword);

  return (
    <div>
      <SupportHeader active="inbox" mailbox={connected ? settings.supportEmail : null} lastCheck={settings.lastSupportSyncAt} timeZone={tz} />

      {!connected && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-ink-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-text" />
            The support Gmail is not connected yet.{canEdit(user.role) ? "" : " Ask the owner to connect it."}
          </div>
          {canEdit(user.role) && (
            <Link href="/settings#support" className="btn-secondary py-1.5 text-xs">
              Connect Gmail
            </Link>
          )}
        </div>
      )}
      {connected && !process.env.ANTHROPIC_API_KEY && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-text" />
          The AI is not set up yet, so emails are not sorted or answered automatically. Add ANTHROPIC_API_KEY in Vercel.
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t, i) => (
            <Link
              key={t.key}
              href={`/support?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${t.key === tab.key ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2"}`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] ${t.key === "needs" && counts[i] > 0 ? "bg-warn/20 text-warn-text" : "bg-surface-2 text-ink-3"}`}>{counts[i]}</span>
            </Link>
          ))}
        </nav>
        <form className="sm:w-64">
          <input type="hidden" name="tab" value={tab.key} />
          <input name="q" defaultValue={q} className="input py-1.5" placeholder="Search name, email, order #" />
        </form>
      </div>

      <div className="card divide-y divide-border overflow-hidden">
        {threads.map((t) => {
          const last = t.messages[0];
          const preview = t.summary || last?.text.replace(/\s+/g, " ").slice(0, 160) || "";
          return (
            <Link key={t.id} href={`/support/${t.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${t.unread ? "bg-accent" : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`truncate text-sm ${t.unread ? "font-semibold" : "font-medium"}`}>{t.customerName || t.customerEmail}</span>
                  <span className="shrink-0 text-xs text-ink-3">{fmtDateTime(t.lastMessageAt, tz)}</span>
                </span>
                <span className="block truncate text-sm text-ink">{t.subject}</span>
                <span className="block truncate text-xs text-ink-3">{preview}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={t.status} category={t.category} />
                  {t.topic && <span className="badge">{topicTitle.get(t.topic) ?? t.topic}</span>}
                  {t.orderNames && <span className="badge">{t.orderNames}</span>}
                  {t.status === "needs_action" && t.actionNote && <span className="truncate text-xs text-accent">To do: {t.actionNote}</span>}
                  {t.status === "needs_reply" && t.holdReason && <span className="truncate text-xs text-ink-3">{t.holdReason}</span>}
                </span>
              </span>
            </Link>
          );
        })}
        {threads.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-ink-3">
            {q ? "Nothing matches that search." : tab.key === "needs" ? "All caught up. Nothing needs you right now." : "Nothing here yet."}
          </div>
        )}
      </div>
    </div>
  );
}
