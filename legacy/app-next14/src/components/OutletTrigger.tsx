"use client";

import { useState } from "react";
import { useOutlet } from "@/context/OutletContext";
import OutletSelector from "./OutletSelector";

interface Props {
  label?: string; // property · district label shown in topbar
}

export default function OutletTrigger({ label = "W TAIPEI · XINYI" }: Props) {
  const { selectedOutlet } = useOutlet();
  const [open, setOpen] = useState(false);
  const isLive = selectedOutlet.status === "live";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 active:opacity-70 transition-opacity"
      >
        <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-lauds-cream/80">
          {label}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          className="w-3 h-3 text-lauds-cream/45"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {isLive && (
          <span className="w-1.5 h-1.5 rounded-full bg-lauds-blue animate-pulse" />
        )}
      </button>

      <OutletSelector open={open} onClose={() => setOpen(false)} />
    </>
  );
}
