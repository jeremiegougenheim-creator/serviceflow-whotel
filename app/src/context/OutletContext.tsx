"use client";

import { createContext, useContext, useState } from "react";

export interface Outlet {
  id: string;
  name: string;
  status: "live" | "coming";
}

const OUTLETS: Outlet[] = [
  { id: "kitchen-table", name: "The Kitchen Table", status: "live" },
  { id: "wet-bar", name: "WET Bar", status: "coming" },
  { id: "woobar", name: "WOOBAR", status: "coming" },
  { id: "in-room-dining", name: "In-Room Dining", status: "coming" },
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
