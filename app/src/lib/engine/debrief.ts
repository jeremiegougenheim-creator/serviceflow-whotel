/**
 * The debrief: forecast against actual, waste against the baseline, savings split three ways,
 * CO2e from the measured log only. Nothing here is modelled from the forecast alone.
 */
import type { PropertyCfg, StationCfg } from "./types";

export interface WasteEntry {
  stationId: string | null;
  kg: number;
  co2eKg: number;
}

export interface DebriefInput {
  property: PropertyCfg;
  outletStations: StationCfg[];
  forecast: { p10: number; p50: number; p90: number; usual: number | null } | null;
  actualCovers: number | null;
  waste: WasteEntry[];
  /** trailing average g/cover before ServiceFlow, if the property has not set a baseline */
  trailingBaselineGPerCover: number | null;
  foodCostPerCover: number;
  planFollowedPct: number | null;
  decisionsApproved: number;
  decisionsTotal: number;
}

export interface DebriefOutput {
  errorPct: number | null;
  mape: number | null;
  withinBand: boolean | null;
  wasteKg: number;
  wasteGPerCover: number | null;
  baselineGPerCover: number | null;
  wasteAvoidedKg: number;
  co2eKg: number;
  co2eAvoidedKg: number;
  foodCost: number | null;
  savingServiceflow: number;
  savingBinScale: number;
  savingTotal: number;
  currency: string;
  closeHeadline: string;
  closeSubline: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Cost of a kilogram of waste, from the stations that wasted it (weighted), else the property's default. */
export function costPerKg(waste: WasteEntry[], stations: StationCfg[], fallback: number): number {
  const byId = new Map(stations.map((s) => [s.id, s]));
  let kg = 0;
  let cost = 0;
  for (const w of waste) {
    const st = w.stationId ? byId.get(w.stationId) : undefined;
    if (!st || st.kgPerUnit <= 0) continue;
    kg += w.kg;
    cost += w.kg * (st.costPerUnit / st.kgPerUnit);
  }
  return kg > 0 ? cost / kg : fallback;
}

/**
 * Split the measured saving. With a bin scale in place the reactive point is the scale's and the
 * predictive points are ServiceFlow's (3 of 4 by default). Without a scale the whole measured
 * avoidance comes from the plan. serviceflow + bin ≤ total, always.
 */
export function splitSaving(total: number, property: PropertyCfg): { serviceflow: number; binScale: number; total: number } {
  const pointsTotal = Math.max(0.01, property.settings.saving_points_total ?? 4);
  // the predictive share can never exceed the whole, whatever Set-up says
  const pointsSf = Math.min(pointsTotal, Math.max(0, property.settings.saving_points_serviceflow ?? 3));
  // signed: a day over the baseline is a negative saving, never clamped to zero (rule 2)
  const t = r2(Number.isFinite(total) ? total : 0);
  if (!property.settings.winnow) return { serviceflow: t, binScale: 0, total: t };
  const sf = r2((t * pointsSf) / pointsTotal);
  return { serviceflow: sf, binScale: r2(t - sf), total: t };
}

/** Kilograms of food served per cover when no station can price the waste (overridable in Set-up). */
export const FOOD_KG_PER_COVER_DEFAULT = 0.45;

export function computeDebrief(input: DebriefInput): DebriefOutput {
  const { property, forecast, actualCovers, waste } = input;
  const wasteKg = r3(waste.reduce((s, w) => s + w.kg, 0));
  const co2eKg = r3(waste.reduce((s, w) => s + w.co2eKg, 0));
  const blendedFactor = wasteKg > 0 ? co2eKg / wasteKg : property.settings.co2e_default_factor ?? 2.5;

  const errorPct = forecast && actualCovers != null && forecast.p50 > 0 ? r3(((actualCovers - forecast.p50) / forecast.p50) * 100) : null;
  const mape = errorPct != null ? r3(Math.abs(errorPct) / 100) : null;
  const withinBand = forecast && actualCovers != null ? actualCovers >= forecast.p10 && actualCovers <= forecast.p90 : null;

  const baseline = property.settings.waste_baseline_g_cover ?? input.trailingBaselineGPerCover ?? null;
  // no log, no claim: without a measured entry there is no g/cover and nothing avoided
  const logged = waste.length > 0;
  const gPerCover = logged && actualCovers ? r2((wasteKg * 1000) / actualCovers) : null;
  // signed: below the baseline is avoided, above it is excess; the screens clamp, the store does not
  const avoidedKg = logged && baseline != null && actualCovers && gPerCover != null ? r3(((baseline - gPerCover) * actualCovers) / 1000) : 0;
  const co2eAvoided = r3(avoidedKg * blendedFactor);

  const kgPerCover = property.settings.food_kg_per_cover ?? FOOD_KG_PER_COVER_DEFAULT;
  const perKg = costPerKg(waste, input.outletStations, input.foodCostPerCover > 0 ? input.foodCostPerCover / kgPerCover : 0);
  const split = splitSaving(avoidedKg * perKg, property);
  const foodCost = actualCovers != null ? r2(actualCovers * input.foodCostPerCover) : null;

  const pct = errorPct != null ? `${errorPct >= 0 ? "+" : "−"}${Math.abs(errorPct).toFixed(1)}%` : "";
  return {
    errorPct,
    mape,
    withinBand,
    wasteKg,
    wasteGPerCover: gPerCover,
    baselineGPerCover: baseline,
    wasteAvoidedKg: avoidedKg,
    co2eKg,
    co2eAvoidedKg: co2eAvoided,
    foodCost,
    savingServiceflow: split.serviceflow,
    savingBinScale: split.binScale,
    savingTotal: split.total,
    currency: property.currency,
    closeHeadline: "Service closed.",
    closeSubline: actualCovers != null ? `${actualCovers} covers${pct ? ` · ${pct} on forecast` : ""}${withinBand === true ? ", within the range" : withinBand === false ? ", outside the range" : ""}` : "no count yet",
  };
}
