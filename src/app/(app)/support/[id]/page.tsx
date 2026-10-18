import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, ExternalLink, Package, User } from "lucide-react";
import { requireSupport } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { validTimezone } from "@/lib/scope";
import { fmtDateTime } from "@/lib/format";
import { findOrders } from "@/lib/support/orders";
import { DEFAULT_SIGNATURE } from "@/lib/support/knowledge";
import { StatusBadge } from "@/components/support/StatusBadge";
import { ReplyPanel } from "./ReplyPanel";

export default async function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSupport();
  const { id } = await params;
  const thread = await db.supportThread.findUnique({ where: { id }, include: { messages: { orderBy: [{ createdAt: "asc" }, { sentAt: "asc" }] } } });
  if (!thread) notFound();
  if (thread.unread) await db.supportThread.update({ where: { id }, data: { unread: false } });

  const [settings, article, { orders, unmatched }] = await Promise.all([
    getSettingsRow(),
    thread.topic ? db.kbArticle.findUnique({ where: { key: thread.topic }, select: { title: true } }) : Promise.resolve(null),
    findOrders(thread.customerEmail, thread.messages.filter((m) => m.direction === "in").map((m) => `${m.subject}\n${m.text}`).join("\n")),
  ]);
  const tz = validTimezone(settings.timezone);
  const first = (thread.customerName ?? "").split(/\s+/)[0];
  const blank = `Hi${first ? ` ${first}` : ""},\n\n\n\n${(settings.supportSignature || DEFAULT_SIGNATURE).trim()}`;

  return (
    <div>
      <Link href="/support" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Inbox
      </Link>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">{thread.subject}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span>
            {thread.customerName ? `${thread.customerName} · ` : ""}
            {thread.customerEmail}
          </span>
          <StatusBadge status={thread.status} category={thread.category} />
          {article && <span className="badge">{article.title}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-3 lg:col-span-2">
          {thread.messages.map((m) => {
            const ours = m.direction === "out";
            return (
              <div key={m.id} className={`card p-4 ${ours ? "border-accent/30 bg-accent-soft/40 sm:ml-10" : "sm:mr-10"}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                    {ours ? m.sentBy === "AI" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" /> : null}
                    {ours ? (m.sentBy === "AI" ? "Sent by AI" : `Sent by ${m.sentBy ?? "the team"}`) : m.fromName || m.fromEmail}
                  </span>
                  <span>{fmtDateTime(m.sentAt, tz)}</span>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.text || "(empty message)"}</div>
              </div>
            );
          })}

          <ReplyPanel
            threadId={thread.id}
            category={thread.category}
            status={thread.status}
            draft={thread.draft}
            blank={blank}
            holdReason={thread.status === "needs_reply" ? thread.holdReason : null}
            actionNote={thread.status === "needs_action" ? thread.actionNote : null}
          />
        </div>

        <aside className="min-w-0 space-y-3">
          {thread.summary && (
            <div className="card p-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">What they want</div>
              <p className="text-sm">{thread.summary}</p>
            </div>
          )}
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              <Package className="h-3.5 w-3.5" /> Their orders
            </div>
            {orders.length === 0 && <p className="text-sm text-ink-2">No orders under this email.</p>}
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.name} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-xs text-ink-3">{fmtDateTime(o.placedAt, tz)}</span>
                  </div>
                  <div className="text-xs text-ink-2">{o.items.join(" · ")}</div>
                  <div className="mt-0.5 text-xs text-ink-3">
                    {o.cancelled ? "Cancelled · " : ""}
                    {o.total} · {o.paymentStatus} · {o.fulfillmentStatus}
                    {o.shipTo ? ` · ${o.shipTo}` : ""}
                  </div>
                  {o.shipments.map((s, i) => (
                    <div key={i} className="mt-1 text-xs">
                      Shipped {fmtDateTime(s.shippedAt, tz)}
                      {s.carrier ? ` · ${s.carrier}` : ""}
                      {s.tracking &&
                        (s.trackingUrl ? (
                          <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-accent hover:underline">
                            {s.tracking} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          ` · ${s.tracking}`
                        ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {unmatched.length > 0 && (
              <p className="mt-3 text-xs text-warn-text">
                They mentioned {unmatched.join(", ")}, which is not under this email. Check in Shopify before sharing details.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
