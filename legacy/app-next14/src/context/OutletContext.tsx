"use client";

import { createContext, useContext, useState } from "react";

export interface Outlet {
  id: string;
  name: string;
  status: "live" | "coming";
  timeline?: string; // e.g. "Q3 2026"
}

const OUTLETS: Outlet[] = [
  { id: "kitchen-table", name: "The Kitchen Table", status: "live" },
  { id: "yen",          name: "YEN",               status: "coming", timeline: "Q3 2026" },
  { id: "woobar",       name: "WOOBAR",             status: "coming", timeline: "Q3 2026" },
  { id: "wet-deck",     name: "WET DECK",           status: "coming", timeline: "Q4 2026" },
];

interface OutletContextValue {
  outlets: Outlet[];
  selectedOutlet: Outlet;
  setSelectedOutlet: (outlet: Outlet) => void;
}

const OutletContext = createContext<OutletContextValue | null>(null);

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet>(OUTLETS[0]);

  return (
    <OutletContext.Provider value={{ outlets: OUTLETS, selectedOutlet, setSelectedOutlet }}>
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet() {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error("useOutlet must be used within OutletProvider");
  return ctx;
}
