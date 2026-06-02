"use client";

import { useState, useMemo } from "react";
import { getDay } from "date-fns";

// TODO: replace with useForecast(outletId, weekStartDate)
export const WEEK_DATA = [
  { covers: 188, savings: 1640 },  // Mon
  { covers: 221, savings: 2180 },  // Tue
  { covers: 198, savings: 1920 },  // Wed
  { covers: 215, savings: 2050 },  // Thu
  { covers: 248, savings: 2340 },  // Fri
  { covers: 316, savings: 2896 },  // Sat ← peak
  { covers: 298, savings: 2610 },  // Sun
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  selectedIndex?: number;           // controlled
  onSelect?: (i: number) => void;
  defaultIndex?: number;            // uncontrolled default (overrides today)
}

export default function WeekCarousel({
  selectedIndex: controlled,
  onSelect,
  defaultIndex,
}: Props) {
  // getDay: 0=Sun..6=Sat → remap to 0=Mon..6=Sun
  const todayIndex = useMemo(() => (getDay(new Date()) + 6) % 7, []);
  const [internal, setInternal] = useState(defaultIndex ?? todayIndex);

  const selected = controlled ?? internal;

  function handleSelect(i: number) {
    if (onSelect) onSelect(i);
    else setInternal(i);
  }

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-5 px-5">
      <div className="flex gap-1.5 w-max">
        {WEEK_DATA.map((day, i) => {
          const isSelected = i === selected;
          const isToday = i === todayIndex;
          const isWeekend = i >= 5; // Sat(5) + Sun(6)

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className="flex flex-col items-center rounded-[18px] px-3 pt-3 pb-2.5 min-w-[50px] active:scale-95 transition-transform"
              style={
                isSelected
                  ? {
                      background: "var(--lauds-accent-action)",
                      border: "1px solid var(--lauds-accent-action)",
                    }
                  : {
                      background: "#FFFFFF",
                      border: "1px solid #E4DDD2",
                    }
              }
            >
              {/* Day name — 9px, stone or white */}
              <span
                className="text-[9px] font-bold tracking-[0.12em] uppercase leading-none mb-2.5"
                style={{ color: isSelected ? "rgba(255,255,255,0.60)" : "#8A7E72" }}
              >
                {DAYS[i]}
              </span>

              {/* Covers — Cormorant Garamond, 20 / 22px selected */}
              <span
                className="font-serif leading-none mb-1.5"
                style={{
                  fontSize: isSelected ? "22px" : "20px",
                  fontWeight: 500,
                  color: isSelected ? "#FFFFFF" : "#2A2520",
                  letterSpacing: "-0.01em",
                }}
              >
                {day.covers}
              </span>

              {/* NT$ savings — 9px, green or white */}
              <span
                className="text-[9px] font-semibold leading-none mb-2.5"
                style={{
                  color: isSelected ? "rgba(255,255,255,0.65)" : "#4A8F5E",
                }}
              >
                {(day.savings / 1000).toFixed(1)}k
              </span>

              {/* Dot — blue pulsing = selected or today; gold = weekend; stone = weekday */}
              <span
                className={`block w-1.5 h-1.5 rounded-full ${
                  isSelected || isToday ? "animate-pulse" : ""
                }`}
                style={{
                  background: isSelected
                    ? "rgba(255,255,255,0.75)"
                    : isToday
                    ? "var(--lauds-accent-action)"
                    : isWeekend
                    ? "#C9A97A"
                    : "#8A7E72",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
