"use client";

import { useState, useMemo } from "react";
import { format, startOfWeek, addDays, getDay } from "date-fns";

// TODO: replace WEEK_DATA with useForecast(outletId, weekStartDate)
const WEEK_DATA = [
  { covers: 188, savings: 1640 },
  { covers: 204, savings: 1780 },
  { covers: 231, savings: 2010 },
  { covers: 219, savings: 1900 },
  { covers: 263, savings: 2290 },
  { covers: 316, savings: 2760 },
  { covers: 298, savings: 2610 },
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}

export { WEEK_DATA };

export default function WeekCarousel({ selectedIndex: controlledIndex, onSelect }: Props) {
  const todayIndex = useMemo(() => {
    // getDay: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
    return (getDay(new Date()) + 6) % 7;
  }, []);

  const [internalIndex, setInternalIndex] = useState(todayIndex);

  const selectedIndex = controlledIndex ?? internalIndex;

  function handleSelect(i: number) {
    if (onSelect) {
      onSelect(i);
    } else {
      setInternalIndex(i);
    }
  }

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-5 px-5">
      <div className="flex gap-2 w-max pb-1">
        {WEEK_DATA.map((day, i) => {
          const date = addDays(weekStart, i);
          const isSelected = i === selectedIndex;
          const isToday = i === todayIndex;

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className="flex flex-col items-center rounded-2xl px-3.5 py-3 min-w-[72px] transition-all active:scale-95"
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
              <span
                className={`text-[10px] font-bold tracking-[0.14em] uppercase mb-1 ${
                  isSelected ? "text-white/70" : "text-lauds-muted"
                }`}
              >
                {DAY_LABELS[i]}
              </span>
              <span
                className={`text-[13px] font-medium mb-2.5 leading-none ${
                  isSelected ? "text-white/80" : isToday ? "text-lauds-charcoal font-semibold" : "text-lauds-muted"
                }`}
              >
                {format(date, "d")}
              </span>
              <span
                className={`font-serif text-xl font-medium leading-none ${
                  isSelected ? "text-white" : "text-lauds-charcoal"
                }`}
              >
                {day.covers}
              </span>
              <span
                className={`text-[10px] mt-0.5 leading-none ${
                  isSelected ? "text-white/60" : "text-lauds-muted"
                }`}
              >
                cov.
              </span>
              <span
                className={`text-[10px] font-semibold mt-2 leading-none ${
                  isSelected ? "text-white/75" : "text-lauds-esg"
                }`}
              >
                {(day.savings / 1000).toFixed(1)}k
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
