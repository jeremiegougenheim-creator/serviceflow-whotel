"use client";

import { createContext, useContext, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type Result = { ok: true; label?: string } | { ok: false; error: string; stale?: boolean };

/**
 * Buttons that decide the same thing ("Keep as is" / "Approve") share one lock: a tap on one
 * disables the other until the server answers, so nobody can decide twice.
 */
const Lock = createContext<{ busy: string | null; setBusy: (id: string | null) => void } | null>(null);

export function ActionGroup({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Lock.Provider value={{ busy, setBusy }}>
      <div className={className}>{children}</div>
    </Lock.Provider>
  );
}

/**
 * A server-action button that turns into its "done" label on success.
 * "Confirm the plan" → "Plan confirmed". The person decides; nothing happens on its own.
 *
 * actionKey names what the button acts on (an id, plus the status when the next action differs):
 * when the row under the button changes, the button starts fresh instead of showing the last
 * row's "done". confirm asks for a second tap within 4 s ("Tap again to remove").
 */
export function ActionButton({
  action,
  label,
  done,
  variant = "gold",
  className = "",
  small,
  disabled,
  title,
  actionKey,
  confirm,
}: {
  action: () => Promise<Result>;
  label: string;
  done: string;
  variant?: "gold" | "ghost" | "tick";
  className?: string;
  small?: boolean;
  disabled?: boolean;
  title?: string;
  actionKey?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const lock = useContext(Lock);
  const self = useId();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ key: string; r: Result } | null>(null);
  const [armed, setArmed] = useState(false);
  const key = actionKey ?? label;
  const mine = res && res.key === key ? res.r : null;
  const locked = !!lock?.busy && lock.busy !== self;

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  function run() {
    if (confirm && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    lock?.setBusy(self);
    start(async () => {
      try {
        const r = await action();
        setRes({ key, r });
        // someone else decided first: show what the database holds now
        if (!r.ok && r.stale) router.refresh();
      } catch {
        setRes({ key, r: { ok: false, error: "The server did not answer. Check the connection and try again." } });
      } finally {
        lock?.setBusy(null);
      }
    });
  }

  const size = small ? "!px-3.5 !py-2 !text-[13px]" : "";
  if (mine?.ok) {
    return (
      <span className={`btn ${size} btn-done ${className}`} role="status">
        {mine.label ?? done}
      </span>
    );
  }
  const look = armed ? "btn-gold" : variant === "gold" ? "btn-gold" : variant === "tick" ? "btn-tick" : "btn-ghost";
  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <button type="button" onClick={run} className={`btn ${size} ${look} w-full`} disabled={pending || disabled || locked} aria-busy={pending || undefined} title={title}>
        {armed ? confirm : label}
      </button>
      {mine && !mine.ok ? (
        <span role="alert" className="text-[12px] leading-snug text-red">
          {mine.error}
        </span>
      ) : null}
    </span>
  );
}
