import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { AppContext } from "./context";
import { plusDays } from "@/lib/format";

export type Outlet = Tables<"outlets">;
export type Forecast = Tables<"forecasts">;
export type Decision = Tables<"decisions">;
export type StationPlanRow = Tables<"station_plans"> & { stations: Pick<Tables<"stations">, "id" | "name" | "slug" | "unit" | "base_par" | "high_value" | "sort_order" | "station_kind"> | null; waves: Pick<Tables<"waves">, "id" | "label" | "starts_at" | "sort_order"> | null };

export interface Driver {
  label: string;
  source: string;
  effect: string;
  weight: number;
}
export interface WaveSplit {
  waveId: string;
  label: string;
  startsAt: string;
  share: number;
  covers: number;
}

/** The property's active outlets; they travel with the context, so this costs nothing. */
export async function getOutlets(ctx: AppContext): Promise<Outlet[]> {
  return ctx.outlets;
}

/** The service date an outlet is "on": today until it closes, then tomorrow. */
export function serviceDateFor(ctx: AppContext, outlet: Pick<Outlet, "closes_at" | "opens_at">): string {
  const closes = outlet.closes_at.slice(0, 5);
  const opens = outlet.opens_at.slice(0, 5);
  // overnight outlets (bar closing after midnight) count the evening as today
  if (closes < opens) return ctx.today;
  return ctx.clock < closes ? ctx.today : plusDays(ctx.today, 1);
}

export async function getLatestForecast(outletId: string, date: string): Promise<Forecast | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("forecasts").select("*").eq("outlet_id", outletId).eq("service_date", date).order("version", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function getForecastVersions(outletId: string, date: string): Promise<Forecast[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("forecasts").select("*").eq("outlet_id", outletId).eq("service_date", date).order("version", { ascending: false });
  return data ?? [];
}

export async function getPlanLines(forecastId: string): Promise<StationPlanRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("station_plans")
    .select("*, stations(id, name, slug, unit, base_par, high_value, sort_order, station_kind), waves(id, label, starts_at, sort_order)")
    .eq("forecast_id", forecastId);
  return ((data ?? []) as StationPlanRow[]).sort((a, b) => (a.stations?.sort_order ?? 0) - (b.stations?.sort_order ?? 0) || (a.waves?.sort_order ?? 0) - (b.waves?.sort_order ?? 0));
}

export async function getDecisions(ctx: AppContext, date: string, opts: { outletId?: string | null; source?: string[] } = {}): Promise<Decision[]> {
  const supabase = await createClient();
  let q = supabase.from("decisions").select("*").eq("property_id", ctx.property.id).eq("service_date", date).neq("status", "expired").order("rank");
  if (opts.outletId) q = q.eq("outlet_id", opts.outletId);
  if (opts.source) q = q.in("source", opts.source);
  const { data } = await q;
  return data ?? [];
}

export function drivers(f: Forecast | null): Driver[] {
  return (Array.isArray(f?.drivers) ? f!.drivers : []) as unknown as Driver[];
}
export function waveSplit(f: Forecast | null): WaveSplit[] {
  return (Array.isArray(f?.wave_split) ? f!.wave_split : []) as unknown as WaveSplit[];
}
export function inputs(f: Forecast | null): Record<string, unknown> {
  return (f?.inputs && typeof f.inputs === "object" && !Array.isArray(f.inputs) ? f.inputs : {}) as Record<string, unknown>;
}

/** Group plan lines by station with the wave quantities in order. */
export function groupPlan(lines: StationPlanRow[]) {
  const byStation = new Map<string, { station: NonNullable<StationPlanRow["stations"]>; lines: StationPlanRow[]; total: number; usual: number; deltaPct: number | null; reason: string | null; status: string }>();
  for (const l of lines) {
    if (!l.stations) continue;
    const g = byStation.get(l.station_id) ?? { station: l.stations, lines: [], total: 0, usual: 0, deltaPct: l.delta_pct == null ? null : Number(l.delta_pct), reason: l.reason, status: "proposed" };
    g.lines.push(l);
    g.total += Number(l.qty);
    g.usual += Number(l.usual_qty ?? 0);
    byStation.set(l.station_id, g);
  }
  for (const g of byStation.values()) {
    const statuses = new Set(g.lines.map((l) => l.status));
    g.status = statuses.has("running_low") ? "running_low" : statuses.size === 1 ? g.lines[0].status : statuses.has("proposed") ? "proposed" : "approved";
    g.lines.sort((a, b) => (a.waves?.sort_order ?? 0) - (b.waves?.sort_order ?? 0));
  }
  return [...byStation.values()].sort((a, b) => a.station.sort_order - b.station.sort_order);
}

export async function getWeekWaste(outletId: string, date: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("waste_logs").select("kg").eq("outlet_id", outletId).gte("service_date", plusDays(date, -7)).lt("service_date", date);
  return (data ?? []).reduce((s, w) => s + Number(w.kg), 0);
}

export async function getDayWaste(outletId: string, date: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("waste_logs").select("kg").eq("outlet_id", outletId).eq("service_date", date);
  return (data ?? []).reduce((s, w) => s + Number(w.kg), 0);
}

export async function getPms(ctx: AppContext, date: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("pms_daily").select("*").eq("property_id", ctx.property.id).eq("service_date", date).maybeSingle();
  return data;
}

export async function getStaffingWeek(ctx: AppContext, monday: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_staffing_day").select("*").eq("property_id", ctx.property.id).gte("service_date", monday).lt("service_date", plusDays(monday, 7));
  return data ?? [];
}
