"use client";

import { useRouter } from "next/navigation";

export default function WelcomePage() {
  const router = useRouter();

  function handleEnter() {
    try {
      localStorage.setItem("onboarded", "true");
    } catch {}
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-lauds-charcoal flex flex-col items-center justify-center relative overflow-hidden">
      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(108deg, transparent 0, transparent 44px, color-mix(in srgb, var(--lauds-champagne-light) 3%, transparent) 44px, color-mix(in srgb, var(--lauds-champagne-light) 3%, transparent) 45px)",
        }}
      />

      <div className="relative z-10 max-w-sm w-full px-8 py-12 flex flex-col items-center text-center">
        {/* Monogram */}
        <div className="w-14 h-14 border border-lauds-champagne rounded-[14px] flex items-center justify-center mb-6">
          <span className="font-serif text-[28px] font-medium text-lauds-champagne-light leading-none">
            S
          </span>
        </div>

        {/* Wordmark */}
        <h1 className="font-serif text-[40px] font-medium text-lauds-cream tracking-wide mb-2">
          ServiceFlow
        </h1>
        <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-lauds-champagne mb-10">
          The prescriptive operating layer for hotel F&amp;B.
        </p>

        {/* W Taipei badge */}
        <div className="inline-flex items-center gap-2 bg-lauds-blue/10 border border-lauds-blue/25 rounded-full px-4 py-2 mb-12">
          <span className="w-1.5 h-1.5 rounded-full bg-lauds-blue animate-pulse" />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-lauds-blue/80">
            W Taipei · Pilot
          </span>
        </div>

        {/* Value props */}
        <div className="w-full space-y-3.5 mb-12 text-left">
          <ValueProp
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            title="Inside-out forecasting"
            desc="Reads tonight's guest profile — rate code, loyalty tier, travel source."
          />
          <ValueProp
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="NT$ savings, measured"
            desc="3 predictive points Winnow can't catch. Every NT$ auditable."
          />
          <ValueProp
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 22c5-3 8-7 8-12V5l-8-3-8 3v5c0 5 3 9 8 12z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              </svg>
            }
            title="ESG, by the bin"
            desc="CO₂e from Winnow measurements only — not modelled."
          />
        </div>

        {/* Divider */}
        <div
          className="w-full h-px mb-10"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--lauds-champagne-light) 30%, transparent), transparent)",
          }}
        />

        {/* CTA */}
        <button
          onClick={handleEnter}
          className="w-full bg-lauds-cream text-lauds-charcoal rounded-[14px] py-4 px-6 text-[13px] font-semibold tracking-[0.1em] uppercase flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
        >
          Enter ServiceFlow
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-7-7 7 7-7 7" />
          </svg>
        </button>

        <p className="mt-8 text-[11px] tracking-[0.06em] text-lauds-cream/25">
          service-flow.ai · W Taipei pilot · SparkEdge Digital
        </p>
      </div>
    </div>
  );
}

function ValueProp({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="w-8 h-8 rounded-lg bg-lauds-champagne/10 border border-lauds-champagne/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-lauds-champagne">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-medium text-lauds-cream mb-0.5">{title}</p>
        <p className="text-[12px] text-lauds-cream/48 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
