"use client";

import { useState, useMemo } from "react";
import { format, startOfWeek, addDays, getDay } from "date-fns";
import WeekCarousel, { WEEK_DATA } from "@/components/WeekCarousel";
import OutletTrigger from "@/components/OutletTrigger";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Action {
  text: string;
  causal: string;
  saving: number;
}

const BRIEF: Action[][] = [
  // MON 188 covers
  [
    {
      text: "Reduce Congee par by 15% (−18 portions)",
      causal: "Low FIT attach on Mondays — 62% room-only rate code, loyalty mix thin.",
      saving: 320,
    },
    {
      text: "Confirm hot-beverage replenishment at wave 2 start (10:00)",
      causal: "65 covers expected wave 2 — sufficient to trigger a second run.",
      saving: 0,
    },
    {
      text: "Hold Dim Sum batch 3; serve from batch 2 only",
      causal: "Monday production rate exceeds consumption by ~12% historically.",
      saving: 180,
    },
  ],
  // TUE 221 covers
  [
    {
      text: "Extend Western Hot availability to 09:45 (+15 min)",
      causal: "45% FIT segment today — staggered arrival, late wave 2 peak expected.",
      saving: 210,
    },
    {
      text: "Reduce buffet par for 32 Titanium-eligible guests",
      causal: "32 Titanium+ diverted to Executive Lounge — net buffet attach reduced.",
      saving: 290,
    },
    {
      text: "Close bread/pastry wave 3 production −20%",
      causal: "Departure count low — remaining guests are long-stay (LOS fatigue −9%).",
      saving: 140,
    },
  ],
  // WED 198 covers
  [
    {
      text: "Reinforce Congee + Dim Sum stations for wave 1 (MICE group, 42 pax at 08:00)",
      causal: "Tour group G-WED-01 manifested: 42 pax, breakfast-inclusive rate, arrival 08:00 sharp.",
      saving: 0,
    },
    {
      text: "Set group service lane at Table Rows 4–6 (pre-assigned seating)",
      causal: "Pre-assigning tour group seating reduces congestion at buffet by ~18% (historical).",
      saving: 0,
    },
    {
      text: "Add 1 sous-chef to live-cooking station, wave 1 only (08:00–09:00)",
      causal: "MICE wave 1 concentration: 75% of 42 pax expected before 08:30.",
      saving: 0,
    },
  ],
  // THU 215 covers
  [
    {
      text: "Run baseline pars — standard mid-week pattern",
      causal: "No groups, no events. Segment mix nominal (40% FIT, 30% leisure package).",
      saving: 190,
    },
    {
      text: "Top up espresso machine B at wave 2 start",
      causal: "Machine B pace consistently low on Thursdays — top-up prevents mid-service gap.",
      saving: 0,
    },
    {
      text: "Start Dim Sum dough for Friday batch (advance mise en place)",
      causal: "Friday demand +20% vs Thursday — advance prep reduces Friday kitchen pressure.",
      saving: 0,
    },
  ],
  // FRI 248 covers
  [
    {
      text: "Prepare for wave 2 peak (80 covers, 09:00–09:45)",
      causal: "Pre-weekend FIT ramp — 52% FIT rate, late-morning attach pattern.",
      saving: 450,
    },
    {
      text: "Activate Fresh Juices station (station 7) from wave 1 onset",
      causal: "Weekend stock build; Saturday demand for fresh juices +35% vs mid-week.",
      saving: 0,
    },
    {
      text: "Prepare Dim Sum batch 4 for Saturday cross-prep",
      causal: "Saturday peak (316 covers) requires pre-prepared batch to hit wave 1 par.",
      saving: 0,
    },
  ],
  // SAT 316 covers
  [
    {
      text: "Tour group G001 (42 pax) at 07:15 — wave 1 very heavy",
      causal: "Tour group manifest confirmed: 42 pax, breakfast-inclusive, arrival 07:15. Wave 1 = 75% split.",
      saving: 520,
    },
    {
      text: "Congee station: +12 portions batch 1, hold 8 for wave 2",
      causal: "Tour group preference index (congee): 0.82 — highest among all stations.",
      saving: 310,
    },
    {
      text: "Net egg station par to 288 (−28 for lounge-eligible Titanium guests)",
      causal: "28 Titanium+ confirmed lounge-eligible → not at buffet. Egg station over-par risk.",
      saving: 240,
    },
  ],
  // SUN 298 covers
  [
    {
      text: "Shift wave 1 pars +10% (departure-day boost)",
      causal: "38 more check-outs before 11h vs Saturday. Departure attach = 1.05× base.",
      saving: 380,
    },
    {
      text: "Reduce Congee batch 3 (12 late-arrivals last night)",
      causal: "12 late arrivals (post 23:00) — attach penalty 0.40× → lower Sunday wave 3.",
      saving: 160,
    },
    {
      text: "Log waste kg before 11:30 for weekly ESG report",
      causal: "Weekly GRI 306 export runs at 12:00. Measured by the bin — not modelled.",
      saving: 0,
    },
  ],
];

export default function BriefPage() {
  const todayIndex = useMemo(() => (getDay(new Date()) + 6) % 7, []);
  const [selectedDay, setSelectedDay] = useState(todayIndex);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const selectedDate = addDays(weekStart, selectedDay);

  const dayData = WEEK_DATA[selectedDay];
  const actions = BRIEF[selectedDay];

  const totalSaving = actions.reduce((s, a) => s + a.saving, 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
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
          {/* Topbar */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 h-6 border border-lauds-champagne/50 rounded-md flex items-center justify-center flex-shrink-0">
              <span className="font-serif text-sm font-medium text-lauds-champagne-light leading-none">L</span>
            </div>
            <OutletTrigger />
          </div>

          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-lauds-champagne mb-1">
            Morning Brief
          </p>
          <h1 className="font-serif text-3xl font-medium leading-tight">
            {DAY_LABELS[selectedDay]},{" "}
            <em className="italic font-normal text-lauds-champagne-light">
              {format(selectedDate, "d MMM")}
            </em>
          </h1>
          <p className="text-xs text-lauds-cream/60 mt-1">
            {dayData.covers} covers p50 · NT${dayData.savings.toLocaleString()} savings est.
          </p>
        </div>
      </div>

      <div className="px-5 pt-4 pb-24 space-y-5">
        {/* Week carousel */}
        <WeekCarousel selectedIndex={selectedDay} onSelect={setSelectedDay} />

        {/* Day summary strip */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white border border-lauds-border rounded-2xl px-3.5 py-3 shadow-lauds-card text-center">
            <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-lauds-muted">Covers p50</p>
            <p className="font-serif text-3xl font-medium text-lauds-charcoal mt-1">{dayData.covers}</p>
          </div>
          <div className="flex-1 bg-white border border-lauds-border rounded-2xl px-3.5 py-3 shadow-lauds-card text-center">
            <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-lauds-muted">NT$ Savings</p>
            <p className="font-serif text-3xl font-medium text-lauds-esg mt-1">
              {(dayData.savings / 1000).toFixed(1)}k
            </p>
          </div>
          {totalSaving > 0 && (
            <div className="flex-1 bg-white border border-lauds-border rounded-2xl px-3.5 py-3 shadow-lauds-card text-center">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-lauds-muted">Actions</p>
              <p className="font-serif text-3xl font-medium text-lauds-charcoal mt-1">
                NT${(totalSaving / 1000).toFixed(1)}k
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 bg-lauds-champagne" />
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-lauds-muted">
              3 actions
            </span>
          </div>

          <div className="space-y-2.5">
            {actions.map((action, i) => (
              <ActionCard key={i} rank={i + 1} action={action} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ rank, action }: { rank: number; action: Action }) {
  return (
    <div className="bg-white border border-lauds-border rounded-2xl p-4 shadow-lauds-card">
      <div className="flex items-start gap-3">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "var(--lauds-accent-action)" }}
        >
          <span className="text-[11px] font-bold text-white">{rank}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-lauds-charcoal leading-snug">
            {action.text}
          </p>
          <p className="text-[12px] text-lauds-muted mt-1.5 leading-relaxed">
            {action.causal}
          </p>
          {action.saving > 0 && (
            <p className="text-[12px] font-semibold text-lauds-esg mt-2">
              Est. NT${action.saving.toLocaleString()} saved
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
