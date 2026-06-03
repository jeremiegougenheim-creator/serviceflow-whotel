"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="min-h-screen bg-lauds-cream flex items-center justify-center px-4 py-12">
      {/* Background texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(108deg, transparent 0, transparent 44px, rgba(160,120,74,0.06) 44px, rgba(160,120,74,0.06) 45px)",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 border border-lauds-champagne rounded-xl mb-5">
            <span className="font-serif text-2xl font-medium text-lauds-champagne leading-none">
              S
            </span>
          </div>
          <h1 className="font-serif text-4xl font-medium text-lauds-charcoal tracking-tight mb-1">
            ServiceFlow
          </h1>
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-lauds-muted">
            Hotel F&amp;B Intelligence
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-lauds-border rounded-3xl p-8 shadow-lauds-card">
          {status === "sent" ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-lauds-surface flex items-center justify-center mx-auto mb-5">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-7 h-7 text-lauds-champagne"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <h2 className="font-serif text-2xl font-medium text-lauds-charcoal mb-2">
                Check your inbox
              </h2>
              <p className="text-sm text-lauds-muted leading-relaxed">
                Your morning briefing link is there.
              </p>
              <p className="text-xs text-lauds-muted mt-3 font-medium tracking-wide">
                {email}
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-6 text-xs font-semibold tracking-[0.14em] uppercase text-lauds-champagne-dark hover:text-lauds-charcoal transition-colors"
              >
                Use a different address
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="font-serif text-2xl font-medium text-lauds-charcoal mb-1">
                  Good morning
                </h2>
                <p className="text-sm text-lauds-muted">
                  Enter your work email to receive a sign-in link.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-4">
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold tracking-[0.16em] uppercase text-lauds-muted mb-2"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="chef@hotel.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                    disabled={status === "loading"}
                    className="w-full px-4 py-3 rounded-xl border border-lauds-border bg-lauds-surface text-lauds-charcoal placeholder-lauds-muted text-sm focus:outline-none focus:border-lauds-champagne focus:ring-2 focus:ring-lauds-champagne/20 disabled:opacity-60 transition-colors"
                  />
                </div>

                {status === "error" && (
                  <p className="text-xs text-red-600 mb-4 bg-red-50 rounded-lg px-3 py-2">
                    {errorMessage || "Something went wrong. Please try again."}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "loading" || !email.trim()}
                  className="w-full py-3.5 rounded-xl bg-lauds-charcoal text-lauds-cream text-sm font-semibold tracking-[0.06em] hover:bg-lauds-champagne transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {status === "loading" ? (
                    <>
                      <svg
                        className="animate-spin w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeOpacity="0.25"
                        />
                        <path
                          d="M12 2a10 10 0 0110 10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    "Send sign-in link"
                  )}
                </button>
              </form>

              <p className="mt-5 text-center text-xs text-lauds-muted leading-relaxed">
                Magic link — no password required.{" "}
                <br className="hidden sm:block" />
                Only hotel staff with an approved email can sign in.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] tracking-[0.14em] uppercase text-lauds-secondary mt-8">
          Lauds · lauds.ai/wtaipei · SparkEdge Digital
        </p>
      </div>
    </div>
  );
}
