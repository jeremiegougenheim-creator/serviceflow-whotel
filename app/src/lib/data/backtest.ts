/**
 * Loads what a backtest replays: the hotel's past PMS days, weather, events, bookings and
 * actual covers. Works with the signed-in user's client (RLS keeps it to their hotel) and
 * with the engine's client in scripts. Aggregates only: no guest record is read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { replayOutlet, type ReplayDay } from "@/lib/engine/backtest";
import { toBooking, toEvent, toOutletCfg, toPms, toWeather } from "@/lib/engine/rows";
import type { OutletCfg } from "@/lib/engine/types";

type Db = SupabaseClient<Database>;

export const BACKTEST_DAYS = 120;

const plusDays = (date: string, n: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Outlets with their waves and stations, as the engine sees them; banquets are left out. */
export async function loadOutletCfgs(db: Db, propertyId: string): Promise<OutletCfg[]> {
  const [{ data: outlets }, { data: waves }, { data: stations }] = await Promise.all([
    db.from("outlets").select("*").eq("property_id", propertyId).eq("active", true).neq("outlet_type", "banquet").order("sort_order"),
    db.from("waves").select("*").eq("property_id", propertyId).order("sort_order"),
    db.from("stations").select("*").eq("property_id", propertyId),
  ]);
  return (outlets ?? []).map((o) => toOutletCfg(o, waves ?? [], stations ?? []));
}

/** Every day from `from` to `to` (inclusive) for the property, per outlet. */
export async function loadReplayDays(db: Db, propertyId: string, outlets: OutletCfg[], from: string, to: string): Promise<Map<string, ReplayDay[]>> {
  const end = plusDays(to, 1);
  const [{ data: pms }, { data: weather }, { data: events }, { data: bookings }, { data: actuals }] = await Promise.all([
    db.from("pms_daily").select("*").eq("property_id", propertyId).gte("service_date", from).lt("service_date", end),
    db.from("weather_daily").select("*").eq("property_id", propertyId).gte("service_date", from).lt("service_date", end),
    db.from("events_daily").select("*").eq("property_id", propertyId).gte("service_date", from).lt("service_date", end),
    db.from("bookings_daily").select("*").eq("property_id", propertyId).gte("service_date", from).lt("service_date", end),
    db.from("service_actuals").select("outlet_id, service_date, actual_covers").eq("property_id", propertyId).gte("service_date", from).lt("service_date", end),
  ]);
  const pmsBy = new Map((pms ?? []).map((r) => [r.service_date, toPms(r)]));
  const wBy = new Map((weather ?? []).map((r) => [r.service_date, toWeather(r)]));
  const out = new Map<string, ReplayDay[]>();
  for (const o of outlets) {
    const act = new Map((actuals ?? []).filter((a) => a.outlet_id === o.id).map((a) => [a.service_date, a.actual_covers]));
    const bk = new Map((bookings ?? []).filter((b) => b.outlet_id === o.id).map((b) => [b.service_date, toBooking(b)]));
    const days: ReplayDay[] = [];
    for (let d = from; d <= to; d = plusDays(d, 1)) {
      days.push({
        date: d,
        pms: pmsBy.get(d) ?? null,
        weather: wBy.get(d) ?? null,
        events: (events ?? []).filter((e) => e.service_date === d).map(toEvent),
        booking: bk.get(d) ?? null,
        actual: act.get(d) ?? null,
      });
    }
    out.set(o.id, days);
  }
  return out;
}

/** The backtest for every forecast outlet of a hotel, over the last BACKTEST_DAYS up to `to`. */
export async function backtestProperty(db: Db, propertyId: string, to: string) {
  const outlets = await loadOutletCfgs(db, propertyId);
  const from = plusDays(to, -(BACKTEST_DAYS - 1));
  const days = await loadReplayDays(db, propertyId, outlets, from, to);
  return outlets.map((o) => ({ outlet: o, ...replayOutlet(o, days.get(o.id) ?? []) }));
}
