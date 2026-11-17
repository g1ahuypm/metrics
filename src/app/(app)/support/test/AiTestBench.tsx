"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Loader2, Play, X } from "lucide-react";
import { runAiTestAction, type AiTestResult } from "@/lib/actions/support";
import type { Fixture } from "@/lib/support/fixtures";
import type { TestOutcome } from "@/lib/support/aitest";

type Run = { running: boolean; result?: AiTestResult };

export function AiTestBench({ storeId, kbKeys, fixtures }: { storeId: string; kbKeys: string[]; fixtures: Fixture[] }) {
  const [compare, setCompare] = useState(true);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [all, setAll] = useState(false);
  const [custom, setCustom] = useState({ name: "", email: "", subject: "", earlier: "", message: "", realOrders: true });

  async function run(key: string, input: Parameters<typeof runAiTestAction>[1]) {
    setRuns((r) => ({ ...r, [key]: { running: true } }));
    let result: AiTestResult;
    try {
      result = await runAiTestAction(storeId, input, compare);
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "The test could not run" };
    }
    setRuns((r) => ({ ...r, [key]: { running: false, result } }));
  }

  async function runAll() {
    setAll(true);
    for (const f of fixtures) await run(f.id, { fixtureId: f.id });
    setAll(false);
  }

  const busy = all || Object.values(runs).some((r) => r.running);

  return (
    <div className="space-y-6">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
        <span>
          <strong className="font-medium">Compare with the previous instructions.</strong>{" "}
          <span className="text-ink-2">Shows the old draft next to the new one.</span>
        </span>
      </label>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Try any email</h2>
        <p className="mt-1 text-xs text-ink-2">Paste a real or made-up customer email. With &quot;real orders&quot; ticked, the AI sees this customer&apos;s Shopify orders, as it would in the inbox.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="t-name">Customer name</label>
            <input id="t-name" className="input" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Jane Mitchell" />
          </div>
          <div>
            <label className="label" htmlFor="t-email">Customer email</label>
            <input id="t-email" className="input" value={custom.email} onChange={(e) => setCustom({ ...custom, email: e.target.value })} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="t-subject">Subject</label>
            <input id="t-subject" className="input" value={custom.subject} onChange={(e) => setCustom({ ...custom, subject: e.target.value })} />
          </div>
        </div>
        <div className="mt-3">
          <label className="label" htmlFor="t-earlier">An earlier email from them that wasn&apos;t answered (optional)</label>
          <textarea id="t-earlier" className="input min-h-[60px]" value={custom.earlier} onChange={(e) => setCustom({ ...custom, earlier: e.target.value })} />
        </div>
        <div className="mt-3">
          <label className="label" htmlFor="t-message">Their latest email</label>
          <textarea id="t-message" className="input min-h-[120px]" value={custom.message} onChange={(e) => setCustom({ ...custom, message: e.target.value })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run("custom", { custom })}>
            {runs.custom?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Write the draft
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={custom.realOrders} onChange={(e) => setCustom({ ...custom, realOrders: e.target.checked })} />
            Use this customer&apos;s real orders
          </label>
        </div>
        <Results run={runs.custom} compare={compare} />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Standard tests ({fixtures.length})</h2>
            <p className="text-xs text-ink-2">Made-up customers covering the hard cases. Use them after every change to the instructions or the knowledge base.</p>
          </div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={runAll}>
            {all ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run all {fixtures.length}
          </button>
        </div>
        <div className="space-y-3">
          {fixtures.map((f) => (
            <div key={f.id} className="card p-4" data-test={f.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    {f.id}. {f.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-2">
                    <strong className="font-medium text-ink">Good answer:</strong> {f.checks}
                  </p>
                </div>
                <button type="button" className="btn-secondary py-1.5 text-sm" disabled={busy} onClick={() => run(f.id, { fixtureId: f.id })}>
                  {runs[f.id]?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run
                </button>
              </div>
              <details className="mt-2 text-xs">
                <summary className="inline-flex cursor-pointer items-center gap-1 text-ink-3 hover:text-ink">
                  <ChevronDown className="h-3.5 w-3.5" /> The email and order
                </summary>
                <div className="mt-2 space-y-2 rounded-xl bg-surface-2 p-3">
                  <div className="text-ink-2">
                    {f.customerName} · {f.customerEmail} · &quot;{f.subject}&quot;
                  </div>
                  {f.thread.map((m, i) => (
                    <div key={i} className="whitespace-pre-wrap">
                      <span className="font-medium">{m.direction === "in" ? "Customer" : "Us"}</span> <span className="text-ink-3">{m.sentAt.slice(0, 16).replace("T", " ")} UTC</span>
                      {"\n"}
                      {m.text}
                    </div>
                  ))}
                  <div className="text-ink-2">
                    {f.orders.length
                      ? f.orders.map((o) => `${o.name}: ${o.items.join(", ")} · ${o.total} · ${o.paymentStatus} · ${o.fulfillmentStatus}${o.shipments[0] ? ` · ${o.shipments[0].status}` : ""}`).join(" | ")
                      : "No orders under this email."}
                  </div>
                </div>
              </details>
              <Results run={runs[f.id]} compare={compare} expected={f.expected} kbKeys={kbKeys} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Results({ run, compare, expected, kbKeys }: { run?: Run; compare: boolean; expected?: Fixture["expected"]; kbKeys?: string[] }) {
  if (!run) return null;
  if (run.running) {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-ink-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> The AI is reading the email (up to 40 seconds)…
      </p>
    );
  }
  const r = run.result;
  if (!r || r.error) return <p className="mt-3 text-xs text-bad-text">{r?.error ?? "The test could not run"}</p>;
  return (
    <div className={`mt-3 grid grid-cols-1 gap-3 ${compare && r.previous ? "lg:grid-cols-2" : ""}`}>
      {r.current && <Outcome label="New instructions" outcome={r.current} expected={expected} kbKeys={kbKeys} />}
      {r.previous && <Outcome label="Previous instructions" outcome={r.previous} muted />}
    </div>
  );
}

function Outcome({ label, outcome, expected, kbKeys, muted }: { label: string; outcome: TestOutcome; expected?: Fixture["expected"]; kbKeys?: string[]; muted?: boolean }) {
  if (!outcome.ok) {
    return (
      <div className="rounded-xl border border-bad/40 p-3 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
        <p className="mt-1 text-bad-text">{outcome.error}</p>
      </div>
    );
  }
  const d = outcome.decision;
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${muted ? "border-border bg-surface-2/60" : "border-accent/30 bg-accent-soft/30"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
        <span className="text-[11px] text-ink-3">{outcome.seconds}s</span>
      </div>
      {outcome.decisionNeeded ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-warn-text">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Needs a decision:</strong> {outcome.decisionNeeded}
          </span>
        </p>
      ) : (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-good-text">
          <CheckCircle2 className="h-3.5 w-3.5" /> Draft ready
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="badge">{outcome.topicTitle ?? "No topic"}</span>
        <span className="badge">Sure: {d.confidence}</span>
        {d.upset && <span className="badge border-bad/40 text-bad-text">Upset</span>}
      </div>
      {expected && <Checks d={d} expected={expected} kbKeys={kbKeys ?? []} />}
      <dl className="mt-2 space-y-1 text-xs">
        <div>
          <dt className="inline font-semibold">What they want: </dt>
          <dd className="inline text-ink-2">{d.summary || "—"}</dd>
        </div>
        {d.teamAction.trim() && (
          <div>
            <dt className="inline font-semibold">Team to do: </dt>
            <dd className="inline text-ink-2">{d.teamAction}</dd>
          </div>
        )}
      </dl>
      <div className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface p-3 text-sm leading-relaxed">{outcome.draft || "(no reply written)"}</div>
    </div>
  );
}

function Checks({ d, expected, kbKeys }: { d: Extract<TestOutcome, { ok: true }>["decision"]; expected: Fixture["expected"]; kbKeys: string[] }) {
  const topicKnown = kbKeys.includes(expected.topic);
  const items: { label: string; ok: boolean | null }[] = [
    { label: expected.needsPerson ? "Flagged for a person" : "No person needed", ok: d.needsPerson === expected.needsPerson },
    { label: expected.upset ? "Marked upset" : "Not marked upset", ok: d.upset === expected.upset },
    { label: `Sure: ${expected.confidence}`, ok: d.confidence === expected.confidence },
    { label: topicKnown ? `Topic: ${expected.topic}` : `Topic "${expected.topic}" isn't in your knowledge base yet`, ok: topicKnown ? d.topic === expected.topic : null },
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
      {items.map((i) => (
        <li key={i.label} className={`inline-flex items-center gap-1 ${i.ok === null ? "text-ink-3" : i.ok ? "text-good-text" : "text-bad-text"}`}>
          {i.ok === null ? null : i.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
