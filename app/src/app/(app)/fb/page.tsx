"use client";

import { useState, useMemo } from "react";
import { format, addDays, startOfWeek, getDay } from "date-fns";
import OutletTrigger from "@/components/OutletTrigger";
import { WEEK_DATA } from "@/components/WeekCarousel";

// ─── Types ─────────────────────────────────────────────────────────────────────

type StationStatus = "idle" | "prepped" | "running_low" | "closed";

interface Station {
  id: number;
  name: string;
  sub: string;
  pars: [number, number, number]; // wave 1, 2, 3 portions
}

// ─── Static data ───────────────────────────────────────────────────────────────

const STATIONS: Station[] = [
  { id: 1, name: "Congee",          sub: "Asian hot · Batch",    pars: [46, 20,  8] },
  { id: 2, name: "Dim Sum",         sub: "Asian hot · Steamed",  pars: [38, 18,  6] },
  { id: 3, name: "Western Hot",     sub: "Hot · Plated",         pars: [34, 24,  8] },
  { id: 4, name: "Egg Station",     sub: "Live cooking · MTO",   pars: [96, 64, 22] },
  { id: 5, name: "Cold Cuts",       sub: "Cold · Display",       pars: [28, 15,  5] },
  { id: 6, name: "Bakery",          sub: "Pastry · Batch",       pars: [42, 22,  8] },
  { id: 7, name: "Fresh Juices",    sub: "Beverage · Live",      pars: [35, 28, 10] },
  { id: 8, name: "Yogurt & Fruits", sub: "Cold · Display",       pars: [26, 16,  6] },
  { id: 9, name: "Live Cooking",    sub: "Hot · Interactive",    pars: [30, 20,  8] },
];

const WAVES = [
  { label: "Wave 1", time: "07:00–08:15", share: 0.75 },
  { label: "Wave 2", time: "08:15–09:30", share: 0.20 },
  { label: "Wave 3", time: "09:30–10:30", share: 0.05 },
] as const;

const STATUS_CYCLE: Record<StationStatus, StationStatus> = {
  idle:        "prepped",
  prepped:     "running_low",
  running_low: "closed",
  closed:      "idle",
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function FBPage() {
  const todayIndex = useMemo(() => (getDay(new Date()) + 6) % 7, []);
  const [wave, setWave] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, StationStatus>>(
    () => Object.fromEntries(STATIONS.map((s) => [s.id, "idle" as StationStatus]))
  );

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const today = addDays(weekStart, todayIndex);
  const dayData = WEEK_DATA[todayIndex];

  const preppedCount  = STATIONS.filter((s) => statuses[s.id] !== "idle").length;
  const readyCount    = STATIONS.filter((s) => statuses[s.id] === "prepped").length;
  const alertCount    = STATIONS.filter((s) => statuses[s.id] === "running_low").length;
  const closedCount   = STATIONS.filter((s) => statuses[s.id] === "closed").length;
  const readinessPct  = Math.round((preppedCount / STATIONS.length) * 100);

  function toggle(stationId: number) {
    setStatuses((prev) => ({
      ...prev,
      [stationId]: STATUS_CYCLE[prev[stationId]],
    }));
  }

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
                S
              </span>
            </div>
            <OutletTrigger />
          </div>

          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-champagne mb-1">
            F&amp;B Operations
          </p>
          <h1 className="font-serif text-3xl font-medium leading-tight">
            The Kitchen Table
          </h1>
          <p className="text-xs text-lauds-cream/60 mt-1">
            {format(today, "EEE d MMM")} · {dayData.covers} covers p50 · 9 stations
          </p>
        </div>
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">

        {/* ── Wave selector ───────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-1.5 h-1.5 bg-lauds-champagne" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              Service wave
            </span>
          </div>
          <div className="flex gap-2">
            {WAVES.map((w, i) => {
              const isActive = wave === i;
              return (
                <button
                  key={i}
                  onClick={() => setWave(i)}
                  className="flex-1 flex flex-col items-center rounded-2xl py-3 px-2 active:scale-[0.96] transition-transform"
                  style={
                    isActive
                      ? {
                          background: "var(--lauds-accent-action)",
                          border: "1px solid var(--lauds-accent-action)",
                        }
                      : {
                          background: "var(--lauds-bg-card)",
                          border: "1px solid var(--lauds-divider)",
                        }
                  }
                >
                  <span
                    className="text-[9px] font-bold tracking-[0.1em] uppercase leading-none mb-1"
                    style={{
                      color: isActive
                        ? "rgba(255,255,255,0.85)"
                        : "var(--lauds-text-muted)",
                    }}
                  >
                    {w.label}
                  </span>
                  <span
                    className="font-serif text-[22px] font-medium leading-tight"
                    style={{
                      color: isActive
                        ? "var(--lauds-bg-card)"
                        : "var(--lauds-text-primary)",
                    }}
                  >
                    {Math.round(dayData.covers * w.share)}
                  </span>
                  <span
                    className="text-[8px] mt-0.5 leading-none"
                    style={{
                      color: isActive
                        ? "rgba(255,255,255,0.85)"
                        : "var(--lauds-text-muted)",
                    }}
                  >
                    {w.time}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Readiness bar ───────────────────────────────────────────── */}
        <div className="bg-white border border-lauds-border rounded-2xl px-4 py-3.5 shadow-lauds-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-lauds-muted">
              Station readiness
            </span>
            <span className="text-[12px] font-semibold text-lauds-charcoal">
              {preppedCount}&nbsp;/&nbsp;{STATIONS.length}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-lauds-surface overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${readinessPct}%`,
                background:
                  alertCount > 0
                    ? "var(--lauds-accent-alert)"
                    : "var(--lauds-accent-savings)",
              }}
            />
          </div>
          <div className="flex items-center gap-3 mt-2">
            {readyCount > 0 && (
              <span className="text-[11px] text-lauds-esg font-semibold">
                {readyCount} ready
              </span>
            )}
            {alertCount > 0 && (
              <span className="text-[11px] font-semibold" style={{ color: "var(--lauds-accent-alert)" }}>
                {alertCount} running low
              </span>
            )}
            {closedCount > 0 && (
              <span className="text-[11px] text-lauds-muted">
                {closedCount} closed
              </span>
            )}
            {preppedCount === 0 && (
              <span className="text-[11px] text-lauds-muted">
                Tap a station to mark it ready
              </span>
            )}
          </div>
        </div>

        {/* ── Alert strip ─────────────────────────────────────────────── */}
        {alertCount > 0 && (
          <div
            className="rounded-2xl px-4 py-3"
            style={{
              background:
                "color-mix(in srgb, var(--lauds-accent-alert) 6%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--lauds-accent-alert) 22%, transparent)",
            }}
          >
            <p
              className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2"
              style={{ color: "var(--lauds-accent-alert)" }}
            >
              Action needed
            </p>
            <div className="space-y-1.5">
              {STATIONS.filter((s) => statuses[s.id] === "running_low").map(
                (s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: "var(--lauds-accent-alert)" }}
                    />
                    <span className="text-[12px] font-medium text-lauds-charcoal">
                      {s.name} — {WAVES[wave].label} running low
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* ── Station grid ────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-lauds-champagne" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              {STATIONS.length} stations · {WAVES[wave].label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {STATIONS.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                waveIndex={wave}
                status={statuses[station.id]}
                onTap={() => toggle(station.id)}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  StationStatus,
  { label: string; dotColor: string; textColor: string; bgColor: string }
> = {
  idle: {
    label:     "Not started",
    dotColor:  "var(--lauds-divider)",
    textColor: "var(--lauds-text-muted)",
    bgColor:   "transparent",
  },
  prepped: {
    label:     "Ready",
    dotColor:  "var(--lauds-accent-savings)",
    textColor: "var(--lauds-accent-savings)",
    bgColor:   "color-mix(in srgb, var(--lauds-accent-savings) 10%, transparent)",
  },
  running_low: {
    label:     "Running low",
    dotColor:  "var(--lauds-accent-alert)",
    textColor: "var(--lauds-accent-alert)",
    bgColor:   "color-mix(in srgb, var(--lauds-accent-alert) 10%, transparent)",
  },
  closed: {
    label:     "Closed",
    dotColor:  "var(--lauds-text-muted)",
    textColor: "var(--lauds-text-muted)",
    bgColor:   "color-mix(in srgb, var(--lauds-text-muted) 8%, transparent)",
  },
};

function StationCard({
  station,
  waveIndex,
  status,
  onTap,
}: {
  station: Station;
  waveIndex: number;
  status: StationStatus;
  onTap: () => void;
}) {
  const cfg = STATUS_CONFIG[status];
  const par = station.pars[waveIndex];
  const isIdle = status === "idle";

  return (
    <div
      className="rounded-2xl p-3.5 shadow-lauds-card flex flex-col"
      style={{
        background: "var(--lauds-bg-card)",
        border: isIdle
          ? "1px solid var(--lauds-divider)"
          : `1px solid color-mix(in srgb, ${cfg.dotColor} 30%, transparent)`,
      }}
    >
      {/* Station id + name */}
      <div className="mb-2.5">
        <span
          className="text-[9px] font-bold tracking-[0.1em] uppercase"
          style={{ color: "var(--lauds-text-muted)" }}
        >
          #{station.id}
        </span>
        <p className="text-[13px] font-semibold text-lauds-charcoal leading-tight mt-0.5">
          {station.name}
        </p>
        <p
          className="text-[10px] leading-tight mt-0.5"
          style={{ color: "var(--lauds-text-muted)" }}
        >
          {station.sub}
        </p>
      </div>

      {/* Par */}
      <div className="mb-3 flex-1">
        <p
          className="text-[9px] font-bold tracking-[0.1em] uppercase mb-0.5"
          style={{ color: "var(--lauds-text-muted)" }}
        >
          Par
        </p>
        <p className="font-serif text-[24px] font-medium text-lauds-charcoal leading-none">
          {par}
          <span
            className="text-[11px] font-sans font-normal ml-1"
            style={{ color: "var(--lauds-text-muted)" }}
          >
            prtns
          </span>
        </p>
      </div>

      {/* Status button — tap to cycle */}
      <button
        onClick={onTap}
        className="w-full py-2 rounded-xl text-[10px] font-bold tracking-[0.08em] uppercase active:opacity-70 transition-opacity"
        style={{
          color:      cfg.textColor,
          background: cfg.bgColor,
          border:     `1px solid color-mix(in srgb, ${cfg.dotColor} 28%, transparent)`,
        }}
      >
        <span className="flex items-center justify-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: cfg.dotColor }}
          />
          {cfg.label}
        </span>
      </button>
    </div>
  );
}
