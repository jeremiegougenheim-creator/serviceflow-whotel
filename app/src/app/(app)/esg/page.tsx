"use client";

import { useState } from "react";
import OutletTrigger from "@/components/OutletTrigger";

// ─── Pilot data ────────────────────────────────────────────────────────────────
// All kg values are from measured waste (bin / Winnow) — never from the forecast model.
// CLAUDE.md §7 · RÈGLE 3.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// kg measured per day · baseline = projected without Lauds
const DAILY_WASTE = [
  { kg: 2.4, baseline: 3.1 },
  { kg: 1.8, baseline: 2.6 },
  { kg: 2.6, baseline: 2.6 }, // MICE group — no reduction expected
  { kg: 1.6, baseline: 2.3 },
  { kg: 2.4, baseline: 3.2 },
  { kg: 3.3, baseline: 4.8 }, // peak day
  { kg: 2.8, baseline: 3.8 },
];

// CO₂e factors from CLAUDE.md §7 (kg CO₂e / kg food)
const CO2E_FACTORS: Record<string, number> = {
  bread_pastry: 1.9,
  meat:         27.0,
  dairy:        3.2,
  vegetables:   2.0,
  seafood:      6.1,
  default:      2.5,
};

interface StationWaste {
  name: string;
  category: keyof typeof CO2E_FACTORS;
  kg: number;
}

const STATION_WASTE: StationWaste[] = [
  { name: "Bakery",       category: "bread_pastry", kg: 4.2 },
  { name: "Congee",       category: "default",      kg: 2.8 },
  { name: "Western Hot",  category: "default",      kg: 2.1 },
  { name: "Dim Sum",      category: "default",      kg: 1.9 },
  { name: "Cold Cuts",    category: "dairy",        kg: 1.4 },
  { name: "Egg Station",  category: "default",      kg: 1.3 },
  { name: "Fresh Juices", category: "vegetables",   kg: 1.2 },
  { name: "Yogurt",       category: "dairy",        kg: 0.9 },
  { name: "Live Cooking", category: "default",      kg: 1.1 },
];

// ─── Derived totals ────────────────────────────────────────────────────────────

const totalMeasuredKg  = DAILY_WASTE.reduce((s, d) => s + d.kg, 0);           // 16.9
const totalBaselineKg  = DAILY_WASTE.reduce((s, d) => s + d.baseline, 0);     // 22.4
const avoidedKg        = totalBaselineKg - totalMeasuredKg;                   // 5.5
const avoidedPct       = Math.round((avoidedKg / totalBaselineKg) * 100);     // 24%

const stationCo2e      = STATION_WASTE.map((s) => ({
  ...s,
  co2e: +(s.kg * CO2E_FACTORS[s.category]).toFixed(1),
}));
const totalCo2eKg      = +stationCo2e.reduce((s, s2) => s + s2.co2e, 0).toFixed(1);
const avoidedCo2eKg    = +(avoidedKg * CO2E_FACTORS.default).toFixed(1);     // 13.8

const maxDailyKg       = Math.max(...DAILY_WASTE.map((d) => d.baseline));     // 4.8
const maxStationCo2e   = Math.max(...stationCo2e.map((s) => s.co2e));

// ─── Page ──────────────────────────────────────────────────────────────────────

type Tab = "week" | "stations";

export default function ESGPage() {
  const [tab, setTab] = useState<Tab>("week");

  return (
    <div className="min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-lauds-charcoal text-lauds-cream px-5 pt-14 pb-5 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(108deg, transparent 0, transparent 44px, color-mix(in srgb, var(--lauds-champagne-light) 5%, transparent) 44px, color-mix(in srgb, var(--lauds-champagne-light) 5%, transparent) 45px)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--lauds-champagne), var(--lauds-champagne-light), var(--lauds-champagne), transparent)",
            opacity: 0.5,
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 h-6 border border-lauds-champagne/50 rounded-md flex items-center justify-center flex-shrink-0">
              <span className="font-serif text-sm font-medium text-lauds-champagne-light leading-none">
                L
              </span>
            </div>
            <OutletTrigger />
          </div>

          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-champagne mb-1">
            ESG Dashboard
          </p>
          <h1 className="font-serif text-3xl font-medium leading-tight">
            Sustainability
          </h1>
          <p className="text-xs text-lauds-cream/60 mt-1">
            W Taipei · The Kitchen Table · Week view
          </p>
        </div>
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">

        {/* ── KPI strip ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <KpiTile
            label="Waste measured"
            value={`${totalMeasuredKg.toFixed(1)} kg`}
            sub="this week · by bin"
            color="var(--lauds-text-primary)"
          />
          <KpiTile
            label="CO₂e total"
            value={`${totalCo2eKg} kg`}
            sub="from measured waste"
            color="var(--lauds-text-primary)"
          />
          <KpiTile
            label="Waste avoided"
            value={`${avoidedKg.toFixed(1)} kg`}
            sub={`−${avoidedPct}% vs baseline`}
            color="var(--lauds-accent-savings)"
          />
          <KpiTile
            label="CO₂e avoided"
            value={`${avoidedCo2eKg} kg`}
            sub="vs projected baseline"
            color="var(--lauds-accent-savings)"
          />
        </div>

        {/* ── "Measured by the bin" notice ────────────────────────────── */}
        <div
          className="rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{
            background: "color-mix(in srgb, var(--lauds-accent-savings) 6%, transparent)",
            border: "1px solid color-mix(in srgb, var(--lauds-accent-savings) 20%, transparent)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
            style={{ background: "var(--lauds-accent-savings)" }}
          />
          <p className="text-[12px] text-lauds-charcoal leading-relaxed">
            <span className="font-semibold">Measured by the bin — not modelled.</span>
            {" "}CO₂e figures come from waste_measured (Winnow or manual entry). The forecast model is never the source of ESG data.
          </p>
        </div>

        {/* ── Tab selector ────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {(["week", "stations"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 rounded-2xl text-[11px] font-bold tracking-[0.1em] uppercase active:opacity-70 transition-opacity"
              style={
                tab === t
                  ? {
                      background: "var(--lauds-accent-action)",
                      border: "1px solid var(--lauds-accent-action)",
                      color: "var(--lauds-bg-card)",
                    }
                  : {
                      background: "var(--lauds-bg-card)",
                      border: "1px solid var(--lauds-divider)",
                      color: "var(--lauds-text-muted)",
                    }
              }
            >
              {t === "week" ? "7-day trend" : "By station"}
            </button>
          ))}
        </div>

        {/* ── Week view ───────────────────────────────────────────────── */}
        {tab === "week" && (
          <div className="bg-white border border-lauds-border rounded-2xl p-4 shadow-lauds-card">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 bg-lauds-champagne" />
              <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
                Waste kg · measured vs baseline
              </span>
            </div>

            {/* Bar chart */}
            <div className="flex items-end justify-between gap-1.5" style={{ height: 72 }}>
              {DAILY_WASTE.map((d, i) => {
                const baseH = Math.round((d.baseline / maxDailyKg) * 64);
                const actualH = Math.round((d.kg / maxDailyKg) * 64);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center gap-0.5" style={{ height: 64 }}>
                      {/* Baseline bar */}
                      <div
                        className="flex-1 rounded-t-sm opacity-25"
                        style={{
                          height: baseH,
                          background: "var(--lauds-text-muted)",
                        }}
                      />
                      {/* Actual bar */}
                      <div
                        className="flex-1 rounded-t-sm"
                        style={{
                          height: actualH,
                          background: "var(--lauds-accent-savings)",
                        }}
                      />
                    </div>
                    <span
                      className="text-[8px] font-semibold tracking-wide"
                      style={{ color: "var(--lauds-text-muted)" }}
                    >
                      {DAYS[i]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-2 rounded-sm opacity-25"
                  style={{ background: "var(--lauds-text-muted)" }}
                />
                <span className="text-[10px] text-lauds-muted">Baseline</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-2 rounded-sm"
                  style={{ background: "var(--lauds-accent-savings)" }}
                />
                <span className="text-[10px] text-lauds-muted">Measured</span>
              </div>
            </div>

            {/* Day-by-day rows */}
            <div
              className="h-px w-full mt-3 mb-3"
              style={{ background: "var(--lauds-divider)" }}
            />
            <div className="space-y-2">
              {DAILY_WASTE.map((d, i) => {
                const avoided = +(d.baseline - d.kg).toFixed(1);
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-lauds-charcoal w-8">
                      {DAYS[i]}
                    </span>
                    <span className="text-[12px] text-lauds-muted">
                      {d.kg} kg
                    </span>
                    <span
                      className="text-[11px] font-semibold"
                      style={{
                        color:
                          avoided > 0
                            ? "var(--lauds-accent-savings)"
                            : "var(--lauds-text-muted)",
                      }}
                    >
                      {avoided > 0 ? `−${avoided} kg` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Station view ────────────────────────────────────────────── */}
        {tab === "stations" && (
          <div className="bg-white border border-lauds-border rounded-2xl p-4 shadow-lauds-card">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 bg-lauds-champagne" />
              <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
                CO₂e by station · this week
              </span>
            </div>

            <div className="space-y-3">
              {stationCo2e
                .sort((a, b) => b.co2e - a.co2e)
                .map((s) => {
                  const barPct = (s.co2e / maxStationCo2e) * 100;
                  return (
                    <div key={s.name}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[12px] font-medium text-lauds-charcoal">
                          {s.name}
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[11px] text-lauds-muted">
                            {s.kg} kg
                          </span>
                          <span
                            className="text-[12px] font-semibold"
                            style={{ color: "var(--lauds-accent-savings)" }}
                          >
                            {s.co2e} kg CO₂e
                          </span>
                        </div>
                      </div>
                      <div
                        className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{ background: "var(--lauds-divider)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${barPct}%`,
                            background: "var(--lauds-accent-savings)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* CO₂e factor note */}
            <div
              className="mt-4 pt-3"
              style={{ borderTop: "1px solid var(--lauds-divider)" }}
            >
              <p className="text-[10px] text-lauds-muted leading-relaxed">
                Factors: bread/pastry 1.9 · dairy 3.2 · vegetables 2.0 · default 2.5 kg CO₂e/kg food.
                Source: IPCC Tier 1, aligned with GRI 306.
              </p>
            </div>
          </div>
        )}

        {/* ── GRI 306 export card ─────────────────────────────────────── */}
        <div
          className="rounded-2xl px-5 py-4"
          style={{
            background: "color-mix(in srgb, var(--lauds-champagne-light) 7%, transparent)",
            border: "1px solid color-mix(in srgb, var(--lauds-champagne-light) 18%, transparent)",
          }}
        >
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-champagne mb-3">
            GRI 306 · Export
          </p>
          <div className="space-y-2">
            <ExportRow label="Weekly export"       status="scheduled" note="Monday 12:00" />
            <ExportRow label="Marriott Serve 360"  status="connected" note="Auto-sync on" />
            <ExportRow label="TWSE / IFRS S2"      status="pending"   note="Q3 2026" />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-white border border-lauds-border rounded-2xl p-3.5 shadow-lauds-card">
      <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-lauds-muted">
        {label}
      </p>
      <p
        className="font-serif text-[26px] font-medium leading-[1.05] mt-1.5 tracking-tight"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-[11px] text-lauds-muted mt-1 leading-tight">{sub}</p>
    </div>
  );
}

type ExportStatus = "scheduled" | "connected" | "pending";

function ExportRow({
  label,
  status,
  note,
}: {
  label: string;
  status: ExportStatus;
  note: string;
}) {
  const statusConfig: Record<
    ExportStatus,
    { dot: string; text: string; label: string }
  > = {
    scheduled: {
      dot:   "var(--lauds-accent-action)",
      text:  "var(--lauds-accent-action)",
      label: "Scheduled",
    },
    connected: {
      dot:   "var(--lauds-accent-savings)",
      text:  "var(--lauds-accent-savings)",
      label: "Connected",
    },
    pending: {
      dot:   "var(--lauds-text-muted)",
      text:  "var(--lauds-text-muted)",
      label: "Pending",
    },
  };
  const cfg = statusConfig[status];

  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-lauds-charcoal font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <span
          className="text-[10px] font-semibold"
          style={{ color: cfg.text }}
        >
          {note}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: cfg.dot }}
        />
      </div>
    </div>
  );
}
