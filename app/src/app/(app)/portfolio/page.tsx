"use client";

import { useState } from "react";
import Link from "next/link";

const OUTLETS = [
  {
    id: "kitchen-table",
    name: "The Kitchen Table",
    subtitle: "9 stations · Buffet",
    status: "live" as const,
    covers: 1719,
    savings: 14980,
    accuracy: 91,
  },
  {
    id: "wet-bar",
    name: "WET Bar",
    subtitle: "Pool bar",
    status: "coming" as const,
  },
  {
    id: "woobar",
    name: "WOOBAR",
    subtitle: "Lobby lounge",
    status: "coming" as const,
  },
  {
    id: "in-room-dining",
    name: "In-Room Dining",
    subtitle: "24h",
    status: "coming" as const,
  },
];

export default function PortfolioPage() {
  const [comingSoonModal, setComingSoonModal] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-lauds-charcoal text-lauds-cream px-5 pt-14 pb-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(108deg, transparent 0, transparent 44px, rgba(201,169,122,0.05) 44px, rgba(201,169,122,0.05) 45px)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, #A0784A, #C9A97A, #A0784A, transparent)",
            opacity: 0.5,
          }}
        />
        <div className="relative z-10">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-champagne mb-4">
            Portfolio
          </p>

          {/* Champion profile */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-lauds-champagne/20 border border-lauds-champagne/30 flex items-center justify-center flex-shrink-0">
              <span className="font-serif text-lg font-medium text-lauds-champagne-light leading-none">
                B
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-lauds-cream">Bastien Giannetti</p>
              <p className="text-[11px] text-lauds-cream/55">Area GM · Marriott Taiwan</p>
            </div>
          </div>

          {/* Property badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-lauds-blue/10 border border-lauds-blue/25 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-lauds-blue" />
              <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-lauds-blue/80">
                W Taipei
              </span>
            </div>
            <span className="text-[11px] text-lauds-cream/40">405 keys</span>
            <span className="w-1 h-1 rounded-full bg-lauds-cream/25" />
            <span className="text-[11px] text-lauds-cream/40">1 property</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5 pb-24">
        {/* Week KPIs */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-lauds-champagne" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              This week · The Kitchen Table
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <KpiCard label="Covers" value="1,719" sub="7-day p50" />
            <KpiCard label="NT$ Saved" value="14.9k" sub="Lauds (3 pts)" color="text-lauds-esg" />
            <KpiCard label="Accuracy" value="91%" sub="14-day avg" />
          </div>
        </div>

        {/* Outlet pipeline */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-lauds-champagne" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              Outlet pipeline
            </span>
          </div>

          <div className="space-y-2">
            {OUTLETS.map((outlet) => {
              const isLive = outlet.status === "live";

              if (isLive) {
                return (
                  <Link
                    key={outlet.id}
                    href="/dashboard"
                    className="flex items-center gap-3.5 rounded-2xl px-4 py-4 active:opacity-80 transition-opacity"
                    style={{
                      background: "rgba(43,91,219,0.08)",
                      border: "1px solid rgba(43,91,219,0.18)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[14px] font-semibold text-lauds-charcoal">
                          {outlet.name}
                        </p>
                        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-lauds-blue bg-lauds-blue/10 px-2 py-0.5 rounded-full">
                          Live
                        </span>
                      </div>
                      <p className="text-[12px] text-lauds-muted">{outlet.subtitle}</p>
                      {outlet.covers && (
                        <p className="text-[11px] text-lauds-esg font-medium mt-1.5">
                          {outlet.covers.toLocaleString()} covers this week · NT${(outlet.savings! / 1000).toFixed(1)}k saved
                        </p>
                      )}
                    </div>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.9}
                      className="w-5 h-5 text-lauds-blue flex-shrink-0"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              }

              return (
                <button
                  key={outlet.id}
                  onClick={() => setComingSoonModal(true)}
                  className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left active:opacity-70 transition-opacity"
                  style={{
                    background: "rgba(224,217,207,0.07)",
                    border: "1px solid rgba(228,221,210,0.5)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-lauds-muted">{outlet.name}</p>
                    <p className="text-[12px] text-lauds-muted/60 mt-0.5">{outlet.subtitle}</p>
                  </div>
                  <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-lauds-muted/60 bg-lauds-border/30 px-2.5 py-1 rounded-full flex-shrink-0">
                    Soon
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ESG summary */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-lauds-esg" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              ESG · This week
            </span>
          </div>

          <div className="bg-white border border-lauds-border rounded-2xl p-4 shadow-lauds-card">
            <p className="text-[11px] text-lauds-muted italic mb-3">
              Measured by the bin — not modelled.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-lauds-muted">CO₂e avoided</p>
                <p className="font-serif text-2xl font-medium text-lauds-esg mt-1">—</p>
                <p className="text-[11px] text-lauds-muted mt-0.5">Winnow data pending</p>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-lauds-muted">Waste reduction</p>
                <p className="font-serif text-2xl font-medium text-lauds-esg mt-1">—</p>
                <p className="text-[11px] text-lauds-muted mt-0.5">Winnow data pending</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coming soon modal */}
      {comingSoonModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(42,37,32,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setComingSoonModal(false)}
        >
          <div
            className="bg-lauds-cream rounded-t-3xl w-full max-w-lg px-8 py-10 pb-safe text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-serif text-2xl font-medium text-lauds-charcoal mb-2">
              Bientôt disponible
            </p>
            <p className="text-[13px] text-lauds-muted leading-relaxed mb-6">
              This outlet will be onboarded in a future release of the W Taipei pilot.
            </p>
            <button
              onClick={() => setComingSoonModal(false)}
              className="w-full bg-lauds-charcoal text-lauds-cream rounded-[14px] py-3.5 text-[13px] font-semibold tracking-[0.08em] uppercase"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color = "text-lauds-charcoal",
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="bg-white border border-lauds-border rounded-2xl p-3 shadow-lauds-card">
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-lauds-muted">
        {label}
      </p>
      <p className={`font-serif text-2xl font-medium leading-tight mt-1 ${color}`}>{value}</p>
      <p className="text-[10px] text-lauds-muted mt-0.5 leading-tight">{sub}</p>
    </div>
  );
}
