"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, error, sent }: { next: string; error: string | null; sent: boolean }) {
  const [mode, setMode] = useState<"link" | "password">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(error);
  const [done, setDone] = useState(sent);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const supabase = createClient();
      if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`, shouldCreateUser: false } });
        if (error) setMsg(error.message);
        else setDone(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
        else {
          router.replace(next);
          router.refresh();
        }
      }
    });
  }

  if (done) {
    return (
      <div className="text-center py-2">
        <div className="eyebrow">Check your inbox</div>
        <p className="mt-3 text-[15px]">A sign-in link is on its way to {email || "your email"}. Open it on this device.</p>
        <button className="btn btn-ghost mt-5" onClick={() => setDone(false)}>
          Use another email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label>
        <span className="lbl">Email</span>
        <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hotel.com" />
      </label>
      {mode === "password" && (
        <label>
          <span className="lbl">Password</span>
          <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      {msg && <p className="text-red text-[13px]">{msg}</p>}
      <button className="btn btn-gold" type="submit" disabled={pending}>
        {pending ? "One moment…" : mode === "link" ? "Email me a sign-in link" : "Sign in"}
      </button>
      <button type="button" className="muted text-[13px] underline-offset-4 hover:underline" onClick={() => setMode(mode === "link" ? "password" : "link")}>
        {mode === "link" ? "I have a password" : "Send me a link instead"}
      </button>
    </form>
  );
}
