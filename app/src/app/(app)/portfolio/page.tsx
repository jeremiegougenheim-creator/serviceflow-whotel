"use client";

import { useState } from "react";
import Link from "next/link";
import OutletTrigger from "@/components/OutletTrigger";

// ─── Data ──────────────────────────────────────────────────────────────────────

type BadgeKind = "live" | "q3_2026" | "q4_2026" | "q1_2027" | "q2_2027";

interface OutletRow {
  id: string;
  name: string;
  sub: string;
  badge: BadgeKind;
  href?: string; // defined only for live outlets
}

interface PropertySection {
  property: string;
  sub: string;
  outlets: OutletRow[];
}

const BADGE_LABEL: Record<BadgeKind, string> = {
  live: "Live",
  q3_2026: "Q3 2026",
  q4_2026: "Q4 2026",
  q1_2027: "Q1 2027",
  q2_2027: "Q2 2027",
};

const SECTIONS: PropertySection[] = [
  {
    property: "W Taipei",
    sub: "405 keys",
    outlets: [
      {
        id: "kitchen-table",
        name: "The Kitchen Table",
        sub: "9 stations · Buffet",
        badge: "live",
        href: "/dashboard",
      },
      { id: "yen", name: "YEN", sub: "Japanese restaurant", badge: "q3_2026" },
      { id: "woobar", name: "WOOBAR", sub: "Lobby lounge", badge: "q3_2026" },
      { id: "wet-deck", name: "WET DECK", sub: "Pool deck", badge: "q4_2026" },
    ],
  },
  {
    property: "Marriott Taiwan · Portfolio",
    sub: "Area GM scope",
    outlets: [
      {
        id: "meridien",
        name: "Le Méridien Taipei",
        sub: "Marriott · Taipei",
        badge: "q1_2027",
      },
      {
        id: "sheraton",
        name: "Sheraton Grande",
        sub: "Marriott · Taipei",
        badge: "q1_2027",
      },
      {
        id: "renaissance",
        name: "Renaissance",
        sub: "Marriott · Taipei",
        badge: "q2_2027",
      },
    ],
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [comingSoonModal, setComingSoonModal] = useState(false);

  return (
    <div className="min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────────── */}
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
          {/* Topbar */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 h-6 border border-lauds-champagne/50 rounded-md flex items-center justify-center flex-shrink-0">
              <span className="font-serif text-sm font-medium text-lauds-champagne-light leading-none">L</span>
            </div>
            <OutletTrigger />
          </div>

          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-champagne mb-4">
            Portfolio
          </p>

          {/* Champion profile */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-lauds-champagne/20 border border-lauds-champagne/30 flex items-center justify-center flex-shrink-0">
              <span className="font-serif text-lg font-medium text-lauds-champagne-light leading-none">
                B
              </span>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-lauds-cream leading-tight">
                Bastien Giannetti
              </p>
              <p className="text-[11px] text-lauds-cream/55 mt-0.5">
                Area GM · Marriott Taiwan
              </p>
            </div>
          </div>

          {/* Scope */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-lauds-cream/40">3 properties</span>
            <span className="w-1 h-1 rounded-full bg-lauds-cream/20" />
            <span className="text-[11px] text-lauds-cream/40">7 outlets</span>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="px-5 py-5 space-y-6 pb-32">

        {/* Sections */}
        {SECTIONS.map((section) => (
          <div key={section.property}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 bg-lauds-champagne flex-shrink-0" />
              <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
                {section.property}
              </span>
              <span className="text-[10px] text-lauds-muted/50 ml-0.5">
                · {section.sub}
              </span>
            </div>

            <div className="space-y-2">
              {section.outlets.map((outlet) => (
                <OutletRow
                  key={outlet.id}
                  outlet={outlet}
                  onComingSoon={() => setComingSoonModal(true)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Summary strip */}
        <div
          className="rounded-2xl px-5 py-4"
          style={{
            background: "rgba(201,169,122,0.07)",
            border: "1px solid rgba(201,169,122,0.18)",
          }}
        >
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-champagne mb-3">
            Portfolio savings
          </p>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-lauds-muted">Live (The Kitchen Table)</span>
              <span className="font-serif text-[18px] font-medium text-lauds-charcoal">
                NT$2,896
                <span className="text-[12px] font-sans font-normal text-lauds-muted ml-1">/ day</span>
              </span>
            </div>
            <div
              className="h-px w-full"
              style={{
                background: "linear-gradient(90deg, rgba(201,169,122,0.25), transparent)",
              }}
            />
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-lauds-muted">Target (full portfolio)</span>
              <span className="font-serif text-[18px] font-medium text-lauds-esg">
                NT$15–25M
                <span className="text-[12px] font-sans font-normal text-lauds-muted ml-1">/ year</span>
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* ── Bientôt disponible modal ──────────────────────────────────── */}
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
              This outlet is on the roadmap. Lauds will be available here in a future release.
            </p>
            <button
              onClick={() => setComingSoonModal(false)}
              className="w-full bg-lauds-charcoal text-lauds-cream rounded-[14px] py-3.5 text-[13px] font-semibold tracking-[0.08em] uppercase active:opacity-80"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OutletRow({
  outlet,
  onComingSoon,
}: {
  outlet: OutletRow;
  onComingSoon: () => void;
}) {
  const isLive = outlet.badge === "live";

  const rowStyle = isLive
    ? { background: "rgba(43,91,219,0.08)", border: "1px solid rgba(43,91,219,0.25)" }
    : { background: "rgba(224,217,207,0.07)", border: "1px solid rgba(196,186,169,0.12)" };

  const inner = (
    <>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[14px] font-medium leading-tight ${
            isLive ? "text-lauds-charcoal" : "text-lauds-muted"
          }`}
        >
          {outlet.name}
        </p>
        <p className="text-[11px] text-lauds-muted/60 mt-0.5">{outlet.sub}</p>
      </div>

      <Badge kind={outlet.badge} />

      {isLive && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          className="w-4 h-4 flex-shrink-0 ml-1"
          style={{ color: "#2B5BDB" }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </>
  );

  if (isLive && outlet.href) {
    return (
      <Link
        href={outlet.href}
        className="flex items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-80 transition-opacity"
        style={rowStyle}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      onClick={onComingSoon}
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-70 transition-opacity"
      style={rowStyle}
    >
      {inner}
    </button>
  );
}

function Badge({ kind }: { kind: BadgeKind }) {
  const isLive = kind === "live";
  const label = BADGE_LABEL[kind];

  return (
    <span
      className="text-[10px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full flex-shrink-0"
      style={
        isLive
          ? {
              color: "#2B5BDB",
              background: "rgba(43,91,219,0.10)",
            }
          : {
              color: "#8C8479",
              background: "rgba(196,186,169,0.15)",
            }
      }
    >
      {label}
    </span>
  );
}
