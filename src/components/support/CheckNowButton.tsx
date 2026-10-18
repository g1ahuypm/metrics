"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { checkSupportNowAction } from "@/lib/actions/support";

export function CheckNowButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className={`max-w-[260px] text-xs ${msg.ok ? "text-ink-3" : "text-bad-text"}`}>{msg.text}</span>}
      <button
        type="button"
        className="btn-secondary py-1.5 text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await checkSupportNowAction();
            setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.success ?? "Checked" });
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Check mail now
      </button>
    </div>
  );
}
