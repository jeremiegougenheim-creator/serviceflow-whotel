"use client";

import { useState } from "react";
import { useOutlet } from "@/context/OutletContext";
import OutletSelector from "./OutletSelector";

export default function OutletTrigger() {
  const { selectedOutlet } = useOutlet();
  const [open, setOpen] = useState(false);

  const label =
    selectedOutlet.name === "The Kitchen Table" ? "Live" : selectedOutlet.name;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-lauds-blue/10 border border-lauds-blue/30 rounded-full px-2.5 py-1 active:opacity-70 transition-opacity"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-lauds-blue animate-pulse" />
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-lauds-blue">
          {label}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="w-3 h-3 text-lauds-blue/70"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <OutletSelector open={open} onClose={() => setOpen(false)} />
    </>
  );
}
