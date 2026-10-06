/**
 * ServiceFlow engine — shared types.
 * Pure data in, pure data out. Database rows are mapped to these shapes by run.ts.
 */

export type OutletType = "breakfast" | "restaurant" | "bar" | "banquet" | "room_service" | "other";

export interface WaveCfg {
  id: string;
  label: string;
  startsAt: string; // "06:30"
  shareDefault: number;
  sortOrder: number;
}

export interface StationCfg {
  id: string;
  name: string;
  slug: string;
  kind: "buffet" | "dish" | "batch" | "course";
  foodCategory: string;
  unit: string;
  basePar: number;
  usualCovers: number | null;
  costPerUnit: number;
  kgPerUnit: number;
  highValue: boolean;
  nationalityPriors: Record<string, { mult: number; conf: number }>;
  dowProfile: Record<string, number>;
  weatherProfile: Record<string, number>;
  settings: Record<string, unknown>;
  sortOrder: number;
}

export interface OutletCfg {
  id: string;
  name: string;
  slug: string;
  type: OutletType;
  opensAt: string;
  closesAt: string;
  capacity: number | null;
  settings: {
    attach_by_rate_code?: Record<string, number>;
    lounge_divert_tiers?: string[];
    usual_covers?: number;
    walk_in_share?: number;
    buffer_pct?: number;
    hours_per_cover?: Record<string, number>;
    food_cost_per_cover?: number;
  };
  waves: WaveCfg[];
  stations: StationCfg[];
}

export interface PropertyCfg {
  id: string;
  name: string;
  keys: number;
  timezone: string;
  currency: string;
  settings: {
    food_cost_per_cover?: number;
    waste_baseline_g_cover?: number;
    co2e_default_factor?: number;
    winnow?: boolean;
    saving_points_total?: number;
    saving_points_serviceflow?: number;
    food_kg_per_cover?: number;
    energy_baseline_kwh_room?: number;
    brief_time?: string;
    dawn_update_time?: string;
    debrief_time?: string;
    [k: string]: unknown;
  };
}

/** What the PMS knows about one service date. */
export interface PmsSignals {
  serviceDate: string;
  roomsOccupied: number;
  roomsTotal: number | null;
  guestsInHouse: number;
  arrivals: number;
  departures: number;
  departuresAm: number;
  lateArrivalsPrev: number;
  earlyCheckins: number;
  loungeEligible: number;
  vipArrivals: number;
  suitesOccupied: number;
  rateCodeMix: Record<string, number>;
  loyaltyTierMix: Record<string, number>;
  travelSourceMix: Record<string, number>;
  nationalityMix: Record<string, number>;
  losDistribution: Record<string, number>;
  groupManifest: { name?: string; size: number; arrival?: string; breakfast?: boolean; source?: string }[];
}

export interface WeatherSignal {
  tempC: number | null;
  rainProb: number | null;
  condition: string | null;
}

export interface EventSignal {
  label: string;
  kind: string;
  size: number | null;
  startsAt: string | null;
  lift: number;
  outletId: string | null;
}

export interface BookingSignal {
  coversBooked: number;
  walkInExpected: number;
  largestParty: number | null;
  largestPartyAt: string | null;
  peakAt: string | null;
  peakCovers: number | null;
  parties: { size: number; at?: string; note?: string }[];
}

export interface BanquetSignal {
  id: string;
  name: string;
  venue: string | null;
  bookedCount: number;
  confirmedCount: number;
  diets: Record<string, number>;
  courses: { name: string; note?: string; station?: string; options?: Record<string, number> }[];
  serveFrom: string | null;
}

/** One past service: what was forecast, what came, what was wasted. */
export interface HistoryPoint {
  serviceDate: string;
  forecastP50: number | null;
  actualCovers: number | null;
  roomsOccupied: number | null;
  wasteKg: number | null;
  /** per station: over-prep ratio observed (qty prepped / qty consumed), when known */
  stationOverPrep?: Record<string, number>;
}

export interface Correction {
  stationId: string | null;
  factor: number;
  serviceDate: string;
}

export interface Driver {
  label: string;
  source: string; // PMS, Weather, Bookings, Events, History
  effect: string; // "+14", "−6%", "earlier"
  weight: number; // |impact| for sorting
}

export interface WaveSplit {
  waveId: string;
  label: string;
  startsAt: string;
  share: number;
  covers: number;
}

export interface CoversForecast {
  p10: number;
  p50: number;
  p90: number;
  usual: number;
  occupancy: number | null;
  waveSplit: WaveSplit[];
  drivers: Driver[];
  signalsRead: number;
  inputs: Record<string, unknown>;
  headline: string; // "Saturday, 205 covers."
  subline: string; // "Breakfast forecast ± 13 · 8 signals read"
}

export interface StationPlanLine {
  stationId: string;
  waveId: string | null;
  qty: number;
  unit: string;
  usualQty: number;
  deltaPct: number;
  reason: string;
  expectedConsumption: number;
  uncertainty: number;
}

export interface StationPlan {
  lines: StationPlanLine[];
  /** per station totals for the day */
  totals: {
    stationId: string;
    name: string;
    qty: number;
    usualQty: number;
    deltaPct: number;
    reason: string;
    byWave: { waveId: string | null; label: string; qty: number }[];
  }[];
}

export type DecisionKind = "trim" | "boost" | "hold" | "move" | "reconcile" | "assign" | "inspect" | "slot" | "other";

export interface Decision {
  rank: number;
  kind: DecisionKind;
  department: string;
  stationId: string | null;
  title: string;
  detail: string;
  reason: string;
  deltaPct: number | null;
  estSaving: number;
  payload?: Record<string, unknown>;
}

export interface StaffingLineCfg {
  id: string;
  name: string;
  department: string;
  outletId: string | null;
  hoursPerCover: number | null;
  minutesPerRoom: number | null;
  fixedHours: number;
  minHours: number;
}

export interface StaffingDemandLine {
  serviceLineId: string;
  serviceDate: string;
  demandHours: number;
  basis: Record<string, unknown>;
}
