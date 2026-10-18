"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { deleteArticleAction, saveArticleAction } from "@/lib/actions/support";

type Article = { id?: string; title: string; whenToUse: string; answer: string; autoSend: boolean; flagForTeam: boolean };

export function KnowledgeEditor({ articles }: { articles: Article[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}
      {adding ? (
        <ArticleCard article={{ title: "", whenToUse: "", answer: "", autoSend: true, flagForTeam: false }} startOpen onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a topic
        </button>
      )}
    </div>
  );
}

function ArticleCard({ article, startOpen = false, onCancel }: { article: Article; startOpen?: boolean; onCancel?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [a, setA] = useState(article);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(a) !== JSON.stringify(article);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveArticleAction(a);
      setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.success ?? "Saved" });
      if (!r?.error) {
        if (!article.id) onCancel?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="card overflow-hidden">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{a.title || "New topic"}</span>
          <span className="block truncate text-xs text-ink-3">{a.whenToUse}</span>
        </span>
        <span className={`badge shrink-0 ${a.autoSend ? "text-good-text" : "text-ink-3"}`}>{a.autoSend ? "AI sends" : "Person answers"}</span>
        {a.flagForTeam && <span className="badge hidden shrink-0 text-accent sm:inline-flex">Team acts</span>}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <div>
            <label className="label">Topic</label>
            <input className="input" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} placeholder="e.g. Refunds and returns" />
          </div>
          <div>
            <label className="label">Which questions it answers</label>
            <input className="input" value={a.whenToUse} onChange={(e) => setA({ ...a, whenToUse: e.target.value })} placeholder="e.g. The customer wants to return a book or asks for a refund" />
          </div>
          <div>
            <label className="label">The answer: facts and how to reply</label>
            <textarea className="input min-h-[200px] leading-relaxed" value={a.answer} onChange={(e) => setA({ ...a, answer: e.target.value })} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={a.autoSend} onChange={(e) => setA({ ...a, autoSend: e.target.checked })} />
            <span>
              <strong className="font-medium">Send on its own.</strong> <span className="text-ink-2">When the AI is sure, it replies without waiting for a person.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={a.flagForTeam} onChange={(e) => setA({ ...a, flagForTeam: e.target.checked })} />
            <span>
              <strong className="font-medium">The team must act.</strong> <span className="text-ink-2">After replying, the email stays in "Needs you" until someone does the work (refund, address change).</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" disabled={pending || (!dirty && Boolean(article.id))} onClick={save}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </button>
            {!article.id && (
              <button type="button" className="btn-ghost" onClick={onCancel}>
                Cancel
              </button>
            )}
            {msg && <span className={`text-xs ${msg.ok ? "text-good-text" : "text-bad-text"}`}>{msg.text}</span>}
            <span className="flex-1" />
            {article.id && (
              <button
                type="button"
                className="btn-danger text-sm"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete "${article.title}"? The AI will no longer use it.`)) start(async () => { await deleteArticleAction(article.id!); router.refresh(); });
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
