export type { Database, Tables, TablesInsert, TablesUpdate } from "./database";

// ─── Branded types ────────────────────────────────────────────────────────────
declare const _serviceDate: unique symbol;
/** ISO date string "YYYY-MM-DD" branded for type safety */
export type ServiceDate = string & { readonly [_serviceDate]: "ServiceDate" };

export function toServiceDate(s: string): ServiceDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Invalid service date: ${s}`);
  }
  return s as ServiceDate;
}

// ─── Role ─────────────────────────────────────────────────────────────────────
export type Role = "gm" | "chef" | "sous_chef" | "fnb_mgr" | "auditor" | "admin";

export const ROLES: Role[] = [
  "gm",
  "chef",
  "sous_chef",
  "fnb_mgr",
  "auditor",
  "admin",
];

export const ROLE_LABELS: Record<Role, string> = {
  gm: "General Manager",
  chef: "Executive Chef",
  sous_chef: "Sous Chef",
  fnb_mgr: "F&B Manager",
  auditor: "Auditor",
  admin: "System Admin",
};

// ─── Wave labels ──────────────────────────────────────────────────────────────
export type WaveLabel =
  | "open_0630"
  | "wave_0745"
  | "wave_0800"
  | "wave_0915"
  | "wave_0930";

export const WAVE_LABELS: WaveLabel[] = [
  "open_0630",
  "wave_0745",
  "wave_0800",
  "wave_0915",
  "wave_0930",
];

export const WAVE_DISPLAY: Record<WaveLabel, string> = {
  open_0630: "Open 06:30",
  wave_0745: "Wave 07:45",
  wave_0800: "Wave 08:00",
  wave_0915: "Wave 09:15",
  wave_0930: "Wave 09:30",
};

// ─── Waste source ─────────────────────────────────────────────────────────────
export type WasteSource = "winnow" | "manual";

// ─── Forecast domain types ────────────────────────────────────────────────────
export interface CoversBand {
  p10: number;
  p50: number;
  p90: number;
}

export interface StationPar {
  stationSlug: string;
  stationName: string;
  waveLabel: WaveLabel;
  parKg: number;
  parKgP10: number;
  parKgP90: number;
  wasteRiskKg: number;
  co2eRiskKg: number;
  co2eFactorKgPerKg: number;
}

export interface ForecastAction {
  actionType: string;
  priority: number;
  title: string;
  description: string;
  stationSlug: string | null;
  metadata: Record<string, unknown>;
}

export interface ForecastResult {
  outletId: string;
  serviceDate: ServiceDate;
  covers: CoversBand;
  stationPars: StationPar[];
  actions: ForecastAction[];
  isWeekend: boolean;
  modelVersion: string;
  generatedAt: string;
  inputs: {
    roomsOccupied: number;
    occupancyPct: number;
    segmentLeisurePct: number;
    segmentBusinessPct: number;
    segmentGroupPct: number;
    weatherCondition: string | null;
    tempC: number | null;
    eventLift: number;
  };
}

// ─── PMS input shape ──────────────────────────────────────────────────────────
export interface PmsInput {
  roomsOccupied: number;
  roomsAvailable: number;
  occupancyPct: number;
  segmentLeisurePct: number;
  segmentBusinessPct: number;
  segmentGroupPct: number;
}

// ─── Weather input shape ──────────────────────────────────────────────────────
export type WeatherCondition =
  | "sunny"
  | "partly_cloudy"
  | "overcast"
  | "light_rain"
  | "rain"
  | "heavy_rain"
  | "thunderstorm"
  | "fog"
  | "snow";

export interface WeatherInput {
  condition: WeatherCondition;
  tempC: number;
  precipitationMm: number;
}

// ─── Station config (used in forecast engine) ─────────────────────────────────
export interface StationConfig {
  slug: string;
  name: string;
  foodCategory: string;
  co2eFactorKgPerKg: number;
  sortOrder: number;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
export interface NavTab {
  label: string;
  href: string;
  icon: string;
}
