import Link from "next/link";
import { subDays } from "date-fns";
import { Clock, Mail, PackageOpen, Undo2 } from "lucide-react";
import { canEdit, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStoreScope } from "@/lib/stores";
import { validTimezone } from "@/lib/scope";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { DEFAULT_CLOSING, refundEmail } from "@/lib/refunds/email";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { CheckRefundsButton, ClosingForm, PlannedRefunds, RefundActions } from "./RefundsClient";

const STATUS: Record<string, { label: string; tone: string }> = {
  processed: { label: "Processed", tone: "text-good-text" },
  pending: { label: "Pending in Shopify", tone: "text-warn-text" },
  failed: { label: "Failed", tone: "text-bad-text" },
};

export default async function RefundsPage() {
  const me = await requireUser();
  const scope = await getStoreScope(me);
  const editor = canEdit(me.role);
  const tz = validTimezone(me.timeZone ?? scope.timezone);
  const inScope = { storeId: { in: scope.storeIds } };
  const since = subDays(new Date(), 90);
  const [refunds, planned] = await Promise.all([
    db.refund.findMany({ where: { ...inScope, refundedAt: { gte: since } }, orderBy: { refundedAt: "desc" }, take: 300 }),
    db.plannedRefund.findMany({
      where: { ...inScope, OR: [{ doneAt: null }, { doneAt: { gte: subDays(new Date(), 7) } }] },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Customers whose conversation is about the paperback/hardcover format: their email includes that paragraph by default.
  const emails = [...new Set(refunds.map((r) => r.customerEmail).filter((e): e is string => Boolean(e)))];
  const threads = emails.length
    ? await db.supportThread.findMany({ where: { ...inScope, customerEmail: { in: emails } }, select: { customerEmail: true, topic: true, summary: true, subject: true } })
    : [];
  const formatTalk = new Set(
    threads.filter((t) => t.topic === "edition_format" || /paperback|hard ?cover|soft ?cover/i.test(`${t.summary ?? ""} ${t.subject}`)).map((t) => t.customerEmail),
  );
  const month = refunds.filter((r) => r.refundedAt >= subDays(new Date(), 30) && r.status !== "failed");
  const pending = refunds.filter((r) => r.status === "pending");
  const toEmail = refunds.filter((r) => r.status === "processed" && !r.emailDraftedAt && r.refundedAt >= subDays(new Date(), 30));
  const returns = refunds.filter((r) => r.returnStatus === "needed" || r.returnStatus === "instructions_sent");
  const storeOf = new Map(scope.stores.map((s) => [s.id, s]));
  const many = scope.storeIds.length > 1;
  const sum = (rs: typeof refunds) => rs.reduce((s, r) => s + r.amount, 0);
  const store = scope.store;
  const sample = store
    ? refundEmail(
        { customerName: "Jane Smith", orderName: "#LW001234", amount: 124.98, currency: store.currency, full: true, items: "2× Winnie the Pooh: The Complete Stories and Poems", status: "processed" },
        { choice: "needed", apology: true, extra: Boolean(store.refundEmailExtra) },
        { closing: store.refundEmailClosing, extra: store.refundEmailExtra, itemsWord: store.refundItemsWord },
      )
    : null;

  return (
    <div>
      <PageHeader title="Refunds" description="Every refund made in Shopify, and what the team still has to do: the customer's email and getting the items back.">
        {editor && <CheckRefundsButton storeIds={scope.storeIds} />}
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Refunded, last 30 days" value={fmtMoney(sum(month))} sub={`${month.length} refund${month.length === 1 ? "" : "s"}`} icon={Undo2} tint="orange" />
        <KpiCard label="Pending in Shopify" value={fmtMoney(sum(pending))} sub={`${pending.length} not processed yet`} icon={Clock} />
        <KpiCard label="Emails to write" value={String(toEmail.length)} sub="processed, customer not told" icon={Mail} />
        <KpiCard label="Returns in progress" value={String(returns.length)} sub="items still to come back" icon={PackageOpen} tint="good" />
      </div>

      <PlannedRefunds
        storeId={store?.id ?? null}
        editor={editor}
        items={planned.map((p) => ({ id: p.id, orderName: p.orderName, note: p.note, addedBy: p.addedBy, done: Boolean(p.doneAt), added: fmtDateTime(p.createdAt, tz) }))}
      />

      <div className="card mt-6 divide-y divide-border overflow-hidden">
        {refunds.map((r) => {
          const s = STATUS[r.status] ?? STATUS.pending;
          const st = storeOf.get(r.storeId);
          return (
            <div key={r.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-semibold">{r.orderName}</span>
                  <span className="text-sm text-ink-2">{r.customerName ?? r.customerEmail ?? "Unknown customer"}</span>
                  <span className="text-xs text-ink-3">{fmtDateTime(r.refundedAt, tz)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold tabular-nums">{fmtMoney(r.amount, r.currency)}</span>
                  <span className="badge">{r.full ? "Full refund" : "Partial refund"}</span>
                  <span className={`badge ${s.tone}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {s.label}
                  </span>
                  {many && st && (
                    <span className="badge">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} aria-hidden="true" />
                      {st.name}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-ink-2">
                  {r.items ?? "No items recorded with this refund"}
                  {r.note ? ` · Note: ${r.note}` : ""}
                </div>
              </div>
              <RefundActions
                editor={editor}
                refund={{
                  id: r.id,
                  status: r.status,
                  hasEmail: Boolean(r.customerEmail),
                  returnStatus: r.returnStatus,
                  threadId: r.emailThreadId,
                  drafted: Boolean(r.emailDraftedAt),
                  sentAt: r.emailSentAt ? fmtDateTime(r.emailSentAt, tz) : null,
                }}
                extra={storeOf.get(r.storeId)?.refundEmailExtra ?? null}
                suggestExtra={Boolean(r.customerEmail && formatTalk.has(r.customerEmail))}
              />
            </div>
          );
        })}
        {refunds.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-ink-3">
            No refunds in the last 90 days{editor ? ". New refunds appear here after the next Shopify check, or click Check Shopify now." : "."}
          </div>
        )}
      </div>

      {store && editor && sample && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ClosingForm
            storeId={store.id}
            storeName={store.name}
            closing={store.refundEmailClosing ?? DEFAULT_CLOSING}
            extra={store.refundEmailExtra ?? ""}
            itemsWord={store.refundItemsWord ?? ""}
          />
          <div className="card min-w-0 p-4">
            <h2 className="text-sm font-semibold">What the email looks like (example)</h2>
            <p className="mt-1 text-xs text-ink-2">
              Filled in from Shopify: exact amount, order and items. It becomes a draft in Support; someone checks it and clicks Send. The signature is added there.
            </p>
            <div className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm leading-relaxed">{sample}</div>
          </div>
        </div>
      )}
      {!store && editor && <p className="mt-6 text-xs text-ink-3">Pick a store above to change the last paragraph of its refund emails.</p>}
      <p className="mt-4 text-xs text-ink-3">
        Refund emails are written in <Link href="/support" className="underline">Support</Link>, in the customer&apos;s conversation.
      </p>
    </div>
  );
}
