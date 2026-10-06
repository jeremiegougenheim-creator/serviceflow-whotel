"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * One tap, one approval. The label flips to its done form and stays there; the server action
 * writes the status and the page refreshes with the real state.
 */
export function ActionButton({ action, label, doneLabel, done = false, small = false, ghost = false, confirm }: { action: () => Promise<unknown>; label: string; doneLabel: string; done?: boolean; small?: boolean; ghost?: boolean; confirm?: string }) {
  const [isDone, setDone] = useState(done);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (isDone || done) return <span className={`btn btn-done ${small ? "px-3 py-2 text-[12.5px]" : ""}`}>{doneLabel}</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={`btn ${ghost ? "btn-ghost" : "btn-gold"} ${small ? "px-3 py-2 text-[12.5px]" : ""}`}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            try {
              await action();
              setDone(true);
              router.refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Could not save");
            }
          });
        }}
      >
        {pending ? "…" : label}
      </button>
      {err && <span className="text-red text-[12px]">{err}</span>}
    </span>
  );
}
