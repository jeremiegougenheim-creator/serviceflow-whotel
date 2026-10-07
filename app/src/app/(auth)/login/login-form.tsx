"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, error, sent }: { next: string; error?: string; sent: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"link" | "password">("link");
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: error ?? null, ok: sent });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, msg: null, ok: false });
    const supabase = createClient();
    if (mode === "link") {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`, shouldCreateUser: false } });
      if (error) return setState({ busy: false, msg: error.message, ok: false });
      return setState({ busy: false, msg: "Check your email for the sign-in link.", ok: true });
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setState({ busy: false, msg: error.message, ok: false });
    window.location.assign(next || "/");
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
      <div>
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hotel.com" />
      </div>
      {mode === "password" ? (
        <div>
          <label className="lbl" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      ) : null}
      <button type="submit" className="btn btn-gold mt-2" disabled={state.busy} aria-busy={state.busy || undefined}>
        {mode === "link" ? "Send me the link" : "Sign in"}
      </button>
      {state.msg ? <p className={`text-[13px] ${state.ok ? "text-green" : "text-red"}`} role="status">{state.msg}</p> : null}
      <button type="button" className="muted -mx-2 min-h-11 self-start rounded-lg px-2 text-left text-[14px] underline underline-offset-4 hover:text-cream" onClick={() => setMode(mode === "link" ? "password" : "link")}>
        {mode === "link" ? "I have a password" : "Send me a link instead"}
      </button>
    </form>
  );
}
