"use client";

import { useActionState } from "react";

type Result = { ok: true; label?: string } | { ok: false; error: string };

/**
 * A server-action button that turns into its "done" label on success.
 * "Confirm the plan" → "Plan confirmed". The person decides; nothing happens on its own.
 */
export function ActionButton({ action, label, done, variant = "gold", className = "", small, disabled, title }: { action: () => Promise<Result>; label: string; done: string; variant?: "gold" | "ghost"; className?: string; small?: boolean; disabled?: boolean; title?: string }) {
  const [state, formAction, pending] = useActionState(async (): Promise<Result | null> => action(), null);
  const isDone = state?.ok === true;
  const base = `btn ${small ? "!px-3.5 !py-2 !text-[13px]" : ""} ${className}`;
  if (isDone) {
    return (
      <span className={`${base} btn-done`} role="status">
        {state.ok && state.label ? state.label : done}
      </span>
    );
  }
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <button type="submit" className={`${base} ${variant === "gold" ? "btn-gold" : "btn-ghost"}`} disabled={pending || disabled} title={title}>
        {pending ? "…" : label}
      </button>
      {state && !state.ok ? <span className="text-[12px] text-red">{state.error}</span> : null}
    </form>
  );
}
