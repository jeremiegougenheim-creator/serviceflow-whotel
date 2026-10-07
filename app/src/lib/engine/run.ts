/**
 * Engine orchestration: reads the database with the service role, runs the pure engine,
 * writes forecasts, plans, decisions, staffing, debriefs and the nightly report.
 * Every run is logged in job_runs. Runs are idempotent for a given date (forecast versions).
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";

type J = NonNullable<Json>;
import { computeDebrief, type WasteEntry } from "./debrief";
import { forecastBanquet, forecastBookings, forecastBreakfast } from "./forecast";
import { coverCheck, expectedSeatedAt, runningFast, wasteRisk } from "./live";
import { computeNightly } from "./nightly";
import { buildBanquetPlan, buildDecisions, buildStationPlan, nationalityMultiplier } from "./plan";
import { computeDemand, suggestRoster, type DayVolume, type PlannedHours } from "./staffing";
import type {
  BanquetSignal,
  BookingSignal,
  Correction,
  CoversForecast,
  Decision,
  EventSignal,
  HistoryPoint,
  OutletCfg,
  PmsSignals,
  PropertyCfg,
  StaffingLineCfg,
  StationCfg,
  StationPlan,
  WeatherSignal,
} from "./types";

export const MODEL_VERSION = "sf-2.0";
/** Calendar arithmetic in UTC: the process time zone never moves a service date. */
const plusDays = (date: string, n: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** A property-local clock time as an absolute instant. */
const localInstant = (date: string, clock: string, tz: string) => fromZonedTime(`${date}T${clock}:00`, tz).toISOString();
const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

// ── mapping rows → engine config ────────────────────────────────────────────

type PropertyRow = Tables<"properties">;
type OutletRow = Tables<"outlets">;
type StationRow = Tables<"stations">;
type WaveRow = Tables<"waves">;

function asObj<T extends object>(j: Json | null | undefined): T {
  return (j && typeof j === "object" && !Array.isArray(j) ? (j as T) : ({} as T)) as T;
}
function asArr<T>(j: Json | null | undefined): T[] {
  return Array.isArray(j) ? (j as T[]) : [];
}

export function toPropertyCfg(p: PropertyRow): PropertyCfg {
  return { id: p.id, name: p.name, keys: p.keys, timezone: p.timezone, currency: p.currency, settings: asObj(p.settings) };
}

function toStationCfg(s: StationRow): StationCfg {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    kind: s.station_kind as StationCfg["kind"],
    foodCategory: s.food_category,
    unit: s.unit,
    basePar: Number(s.base_par),
    usualCovers: s.usual_covers == null ? null : Number(s.usual_covers),
    costPerUnit: Number(s.cost_per_unit),
    kgPerUnit: Number(s.kg_per_unit),
    highValue: s.high_value,
    nationalityPriors: asObj(s.nationality_priors),
    dowProfile: asObj(s.dow_profile),
    weatherProfile: asObj(s.weather_profile),
    settings: asObj(s.settings),
    sortOrder: s.sort_order,
  };
}

function toOutletCfg(o: OutletRow, waves: WaveRow[], stations: StationRow[]): OutletCfg {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    type: o.outlet_type as OutletCfg["type"],
    opensAt: o.opens_at.slice(0, 5),
    closesAt: o.closes_at.slice(0, 5),
    capacity: o.capacity_pax,
    settings: asObj(o.settings),
    waves: waves.filter((w) => w.outlet_id === o.id).map((w) => ({ id: w.id, label: w.label, startsAt: w.starts_at.slice(0, 5), shareDefault: Number(w.share_default), sortOrder: w.sort_order })),
    stations: stations.filter((s) => s.outlet_id === o.id && s.active).sort((a, b) => a.sort_order - b.sort_order).map(toStationCfg),
  };
}

function toPms(r: Tables<"pms_daily">): PmsSignals {
  return {
    serviceDate: r.service_date,
    roomsOccupied: r.rooms_occupied,
    roomsTotal: r.rooms_total,
    guestsInHouse: r.guests_in_house,
    arrivals: r.arrivals,
    departures: r.departures,
    departuresAm: r.departures_am,
    lateArrivalsPrev: r.late_arrivals_prev,
    earlyCheckins: r.early_checkins,
    loungeEligible: r.lounge_eligible,
    vipArrivals: r.vip_arrivals,
    suitesOccupied: r.suites_occupied,
    rateCodeMix: asObj(r.rate_code_mix),
    loyaltyTierMix: asObj(r.loyalty_tier_mix),
    travelSourceMix: asObj(r.travel_source_mix),
    nationalityMix: asObj(r.nationality_mix),
    losDistribution: asObj(r.los_distribution),
    groupManifest: asArr(r.group_manifest),
  };
}

// ── loading ─────────────────────────────────────────────────────────────────

export interface PropertyContext {
  property: PropertyCfg;
  row: PropertyRow;
  outlets: OutletCfg[];
  lines: StaffingLineCfg[];
}

export async function loadProperty(db: AdminClient, propertyId: string): Promise<PropertyContext> {
  const [{ data: p }, { data: outlets }, { data: waves }, { data: stations }, { data: lines }] = await Promise.all([
    db.from("properties").select("*").eq("id", propertyId).single(),
    db.from("outlets").select("*").eq("property_id", propertyId).eq("active", true).order("sort_order"),
    db.from("waves").select("*").eq("property_id", propertyId).order("sort_order"),
    db.from("stations").select("*").eq("property_id", propertyId),
    db.from("service_lines").select("*").eq("property_id", propertyId).eq("active", true).order("sort_order"),
  ]);
  if (!p) throw new Error(`property ${propertyId} not found`);
  return {
    property: toPropertyCfg(p),
    row: p,
    outlets: (outlets ?? []).map((o) => toOutletCfg(o, waves ?? [], stations ?? [])),
    lines: (lines ?? []).map((l) => ({ id: l.id, name: l.name, department: l.department, outletId: l.outlet_id, hoursPerCover: l.hours_per_cover == null ? null : Number(l.hours_per_cover), minutesPerRoom: l.minutes_per_room == null ? null : Number(l.minutes_per_room), fixedHours: Number(l.fixed_hours), minHours: Number(l.min_hours) })),
  };
}

async function loadSignals(db: AdminClient, propertyId: string, date: string) {
  const [{ data: pms }, { data: pmsPrev }, { data: weather }, { data: events }, { data: bookings }, { data: banquets }] = await Promise.all([
    db.from("pms_daily").select("*").eq("property_id", propertyId).eq("service_date", date).maybeSingle(),
    db.from("pms_daily").select("*").eq("property_id", propertyId).eq("service_date", plusDays(date, -1)).maybeSingle(),
    db.from("weather_daily").select("*").eq("property_id", propertyId).eq("service_date", date).maybeSingle(),
    db.from("events_daily").select("*").eq("property_id", propertyId).eq("service_date", date),
    db.from("bookings_daily").select("*").eq("property_id", propertyId).eq("service_date", date),
    db.from("banquet_events").select("*").eq("property_id", propertyId).eq("service_date", date).neq("status", "cancelled"),
  ]);
  const w: WeatherSignal | null = weather ? { tempC: weather.temp_c == null ? null : Number(weather.temp_c), rainProb: weather.rain_prob == null ? null : Number(weather.rain_prob), condition: weather.condition } : null;
  const ev: EventSignal[] = (events ?? []).map((e) => ({ label: e.label, kind: e.kind, size: e.size, startsAt: e.starts_at, lift: Number(e.lift), outletId: e.outlet_id }));
  const bk = new Map<string, BookingSignal>((bookings ?? []).map((b) => [b.outlet_id, { coversBooked: b.covers_booked, walkInExpected: b.walk_in_expected, largestParty: b.largest_party, largestPartyAt: b.largest_party_at?.slice(0, 5) ?? null, peakAt: b.peak_at?.slice(0, 5) ?? null, peakCovers: b.peak_covers, parties: asArr(b.parties) }]));
  const bq = new Map<string, BanquetSignal[]>();
  for (const b of banquets ?? []) {
    const list = bq.get(b.outlet_id) ?? [];
    list.push({ id: b.id, name: b.name, venue: b.venue, bookedCount: b.booked_count, confirmedCount: b.confirmed_count, diets: asObj(b.diets), courses: asArr(b.courses), serveFrom: b.serve_from?.slice(0, 5) ?? null });
    bq.set(b.outlet_id, list);
  }
  return { pms: pms ? toPms(pms) : null, pmsPrev: pmsPrev ? toPms(pmsPrev) : null, weather: w, events: ev, bookings: bk, banquets: bq };
}

/** Past services for one outlet: forecast, actual, waste, and the over-prep ratio per station. */
async function loadHistory(db: AdminClient, propertyId: string, outlet: OutletCfg, before: string, days = 90): Promise<HistoryPoint[]> {
  const from = plusDays(before, -days);
  // every read carries the property as well as the outlet: a row that names another hotel's
  // outlet never reaches the engine (the database refuses such rows too; belt and braces)
  const [{ data: actuals }, { data: forecasts }, { data: waste }, { data: pms }] = await Promise.all([
    db.from("service_actuals").select("service_date, actual_covers").eq("property_id", propertyId).eq("outlet_id", outlet.id).gte("service_date", from).lt("service_date", before),
    db.from("v_latest_forecasts").select("service_date, covers_p50").eq("property_id", propertyId).eq("outlet_id", outlet.id).gte("service_date", from).lt("service_date", before),
    db.from("waste_logs").select("service_date, station_id, kg").eq("property_id", propertyId).eq("outlet_id", outlet.id).gte("service_date", from).lt("service_date", before),
    db.from("pms_daily").select("service_date, rooms_occupied").eq("property_id", propertyId).gte("service_date", from).lt("service_date", before),
  ]);
  const byDate = new Map<string, HistoryPoint>();
  const get = (d: string) => {
    let h = byDate.get(d);
    if (!h) {
      h = { serviceDate: d, forecastP50: null, actualCovers: null, roomsOccupied: null, wasteKg: null, stationOverPrep: {} };
      byDate.set(d, h);
    }
    return h;
  };
  for (const a of actuals ?? []) get(a.service_date).actualCovers = a.actual_covers;
  for (const f of forecasts ?? []) if (f.service_date && f.covers_p50 != null) get(f.service_date).forecastP50 = f.covers_p50;
  for (const p of pms ?? []) get(p.service_date).roomsOccupied = p.rooms_occupied;
  const stById = new Map(outlet.stations.map((s) => [s.id, s]));
  for (const w of waste ?? []) {
    const h = get(w.service_date);
    h.wasteKg = (h.wasteKg ?? 0) + Number(w.kg);
    const st = w.station_id ? stById.get(w.station_id) : undefined;
    if (st && st.basePar > 0 && st.kgPerUnit > 0) {
      const prepKg = st.basePar * st.kgPerUnit;
      // every log of the day adds up: 1.10 = 10% of the par ended in the bin
      h.stationOverPrep![st.id] = (h.stationOverPrep![st.id] ?? 1) + Number(w.kg) / prepKg;
    }
  }
  return [...byDate.values()].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
}

async function loadCorrections(db: AdminClient, propertyId: string, outletId: string, before: string): Promise<Correction[]> {
  const { data } = await db.from("plan_corrections").select("station_id, factor, service_date").eq("property_id", propertyId).eq("outlet_id", outletId).lt("service_date", before).order("service_date", { ascending: false }).limit(50);
  return (data ?? []).map((c) => ({ stationId: c.station_id, factor: Number(c.factor), serviceDate: c.service_date }));
}

// ── jobs ────────────────────────────────────────────────────────────────────

async function job<T>(db: AdminClient, params: { job: Tables<"job_runs">["job"]; propertyId: string | null; outletId?: string | null; serviceDate: string | null }, fn: () => Promise<T>): Promise<T> {
  const { data: run } = await db.from("job_runs").insert({ job: params.job, property_id: params.propertyId, outlet_id: params.outletId ?? null, service_date: params.serviceDate, status: "running" }).select("id").single();
  try {
    const result = await fn();
    // an outlet that failed is recorded in the log and marks the run partial; the others ran
    const partial = !!result && typeof result === "object" && Object.values(result as Record<string, unknown>).some((v) => !!v && typeof v === "object" && "error" in (v as object));
    if (run) await db.from("job_runs").update({ status: partial ? "partial" : "ok", finished_at: new Date().toISOString(), log: (result as J) ?? {} }).eq("id", run.id);
    return result;
  } catch (e) {
    if (run) await db.from("job_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }).eq("id", run.id);
    throw e;
  }
}

/** Food cost per cover for an outlet: its own setting, else the hotel's, else unknown (0). */
function foodCostPerCover(ctx: PropertyContext, outlet: OutletCfg): number {
  return outlet.settings.food_cost_per_cover ?? ctx.property.settings.food_cost_per_cover ?? 0;
}

type PlanLineRow = Pick<Tables<"station_plans">, "station_id" | "wave_id" | "qty" | "status" | "approved_by" | "approved_at" | "prepped_at">;

/**
 * Forecast, plan and decisions for one outlet and date. kind = evening | dawn | live | manual.
 * A rerun supersedes the current version, but what a person already approved is carried
 * forward when the quantity did not move: station lines keep their status, decisions keep
 * theirs, and a confirmed plan whose numbers did not change is left alone.
 */
export async function forecastOutlet(db: AdminClient, ctx: PropertyContext, outlet: OutletCfg, date: string, kind: "evening" | "dawn" | "live" | "manual" = "evening") {
  const sig = await loadSignals(db, ctx.property.id, date);
  const history = await loadHistory(db, ctx.property.id, outlet, date);
  const corrections = await loadCorrections(db, ctx.property.id, outlet.id, date);

  let fc: CoversForecast;
  let plan: StationPlan;
  let decisions: Decision[];
  if (outlet.type === "breakfast") {
    if (!sig.pms) return { skipped: "no PMS row for the date" };
    fc = forecastBreakfast({ outlet, pms: sig.pms, weather: sig.weather, events: sig.events, history, previousDayPms: sig.pmsPrev });
    plan = buildStationPlan({ outlet, forecast: fc, serviceDate: date, pms: sig.pms, weather: sig.weather, corrections, history });
    decisions = buildDecisions({ outlet, plan, forecast: fc, property: ctx.property, history, pms: sig.pms });
  } else if (outlet.type === "banquet") {
    const banquets = sig.banquets.get(outlet.id) ?? [];
    if (!banquets.length) return { skipped: "no function booked" };
    const bf = forecastBanquet({ outlet, banquets });
    fc = bf;
    plan = buildBanquetPlan({ outlet, banquets, cookCount: bf.cookCount });
    const booked = bf.inputs.booked as number;
    decisions = [{ rank: 1, kind: "hold", department: "kitchen", stationId: null, title: `Cook ${bf.cookCount} of ${booked} booked`, detail: `${bf.inputs.confirmed as number} confirmed + ${Math.round((bf.inputs.bufferPct as number) * 100)}% buffer`, reason: "cook to the final count, never the booking", deltaPct: null, estSaving: Math.round(Math.max(0, booked - bf.cookCount) * foodCostPerCover(ctx, outlet)) }];
  } else {
    fc = forecastBookings({ outlet, serviceDate: date, booking: sig.bookings.get(outlet.id) ?? null, weather: sig.weather, events: sig.events, history });
    plan = buildStationPlan({ outlet, forecast: fc, serviceDate: date, pms: sig.pms, weather: sig.weather, corrections, history });
    decisions = buildDecisions({ outlet, plan, forecast: fc, property: ctx.property, history, pms: sig.pms });
  }

  // the current version, and what people did with it
  const { data: prev } = await db.from("forecasts").select("id, version, status, covers_p50, confirmed_by, confirmed_at").eq("property_id", ctx.property.id).eq("outlet_id", outlet.id).eq("service_date", date).order("version", { ascending: false }).limit(1).maybeSingle();
  const prevLines: PlanLineRow[] = prev ? ((await db.from("station_plans").select("station_id, wave_id, qty, status, approved_by, approved_at, prepped_at").eq("forecast_id", prev.id)).data ?? []) : [];
  const { data: prevDecisions } = prev
    ? await db.from("decisions").select("id, title, status").eq("property_id", ctx.property.id).eq("outlet_id", outlet.id).eq("service_date", date).eq("source", "engine").in("status", ["approved", "done", "rejected"])
    : { data: [] as { id: string; title: string; status: string }[] };

  // same quantity as the line a person already acted on → the line keeps its status
  const sameQty = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, 0.02 * Math.max(a, b));
  const carried = plan.lines.map((l) => {
    const old = prevLines.find((p) => p.station_id === l.stationId && (p.wave_id ?? null) === (l.waveId ?? null));
    const keep = !!old && old.status !== "proposed" && sameQty(Number(old.qty), l.qty);
    return { line: l, status: keep ? old!.status : "proposed", approved_by: keep ? old!.approved_by : null, approved_at: keep ? old!.approved_at : null, prepped_at: keep ? old!.prepped_at : null };
  });
  const allCarried = carried.length > 0 && carried.every((c) => c.status !== "proposed");
  // an approval that did not survive (the quantity moved) is what the kitchen must look at again
  const lostApproval = carried.some((c) => c.status === "proposed" && prevLines.some((p) => p.station_id === c.line.stationId && (p.wave_id ?? null) === (c.line.waveId ?? null) && p.status !== "proposed"));
  const confirmedBefore = prev?.status === "confirmed";
  const p50Moved = !prev || prev.covers_p50 == null || !sameQty(Number(prev.covers_p50), fc.p50);

  // a confirmed plan that the new signals do not move is left as it is (no churn at dawn)
  if (prev && confirmedBefore && kind !== "manual" && !p50Moved && allCarried) {
    return { forecastId: prev.id, version: prev.version, p50: fc.p50, unchanged: true, decisions: 0, lines: plan.lines.length };
  }

  const version = (prev?.version ?? 0) + 1;
  if (prev) await db.from("forecasts").update({ status: "superseded" }).eq("id", prev.id);

  const { data: f, error } = await db
    .from("forecasts")
    .insert({
      property_id: ctx.property.id,
      outlet_id: outlet.id,
      service_date: date,
      version,
      kind,
      covers_p10: fc.p10,
      covers_p50: fc.p50,
      covers_p90: fc.p90,
      usual_covers: fc.usual,
      occupancy: fc.occupancy,
      wave_split: fc.waveSplit as unknown as J,
      drivers: fc.drivers as unknown as J,
      signals_read: fc.signalsRead,
      model_version: MODEL_VERSION,
      inputs: { ...fc.inputs, headline: fc.headline, subline: fc.subline, supersedes: prev?.id ?? null } as J,
      // the confirmation survives when every approved line came through unchanged
      status: confirmedBefore && allCarried ? "confirmed" : "issued",
      confirmed_by: confirmedBefore && allCarried ? prev!.confirmed_by : null,
      confirmed_at: confirmedBefore && allCarried ? prev!.confirmed_at : null,
    })
    .select("id")
    .single();
  if (error || !f) throw new Error(`forecast insert failed: ${error?.message}`);

  await db.from("station_plans").insert(carried.map(({ line: l, status, approved_by, approved_at, prepped_at }) => ({ property_id: ctx.property.id, forecast_id: f.id, station_id: l.stationId, wave_id: l.waveId, qty: l.qty, unit: l.unit, usual_qty: l.usualQty, delta_pct: l.deltaPct, reason: l.reason, expected_consumption: l.expectedConsumption, uncertainty: l.uncertainty, status, approved_by, approved_at, prepped_at })));
  // proposals from the previous version expire; a decision a person already took stays, and the
  // same decision is not proposed again
  await db.from("decisions").update({ status: "expired" }).eq("property_id", ctx.property.id).eq("outlet_id", outlet.id).eq("service_date", date).eq("status", "proposed").eq("source", "engine");
  const decided = new Set((prevDecisions ?? []).map((d) => d.title));
  if ((prevDecisions ?? []).length) await db.from("decisions").update({ forecast_id: f.id }).in("id", (prevDecisions ?? []).map((d) => d.id));
  const fresh = decisions.filter((d) => !decided.has(d.title));
  if (fresh.length) await db.from("decisions").insert(fresh.map((d) => ({ property_id: ctx.property.id, outlet_id: outlet.id, forecast_id: f.id, station_id: d.stationId, service_date: date, rank: d.rank, kind: d.kind, department: d.department, title: d.title, detail: d.detail, reason: d.reason, delta_pct: d.deltaPct, est_saving: d.estSaving, currency: ctx.property.currency, source: "engine", payload: (d.payload ?? {}) as J })));
  await db.from("prediction_log").insert({ property_id: ctx.property.id, outlet_id: outlet.id, service_date: date, forecast_id: f.id, model_version: MODEL_VERSION, features: fc.inputs as J, prediction: { p10: fc.p10, p50: fc.p50, p90: fc.p90, waves: fc.waveSplit, version, kind } as unknown as J });
  return { forecastId: f.id, version, p50: fc.p50, changed: p50Moved || lostApproval, decisions: fresh.length, lines: plan.lines.length };
}

/** The evening brief (18:00): every outlet of the property for the next service date. */
export async function runEveningBrief(db: AdminClient, propertyId: string, date: string, kind: "evening" | "dawn" | "manual" = "evening") {
  const ctx = await loadProperty(db, propertyId);
  return job(db, { job: kind === "dawn" ? "dawn_update" : "evening_brief", propertyId, serviceDate: date }, async () => {
    const results: Record<string, unknown> = {};
    let changed = false;
    for (const o of ctx.outlets) {
      // one outlet's bad row never stops the others' plans
      try {
        const r = await forecastOutlet(db, ctx, o, date, kind);
        results[o.slug] = r;
        if ("changed" in r && r.changed) changed = true;
        if ("version" in r && r.version === 1) changed = true;
      } catch (e) {
        results[o.slug] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    await runStaffing(db, propertyId, date, 14, ctx);
    if (changed || kind === "evening") await notifyBrief(db, ctx, date, kind);
    return results;
  });
}

/** Hours against demand for the next `days` days and roster suggestions for this week and next. */
export async function runStaffing(db: AdminClient, propertyId: string, from: string, days = 14, ctxIn?: PropertyContext) {
  const ctx = ctxIn ?? (await loadProperty(db, propertyId));
  return job(db, { job: "staffing", propertyId, serviceDate: from }, async () => {
    const to = plusDays(from, days);
    const [{ data: fcs }, { data: shifts }] = await Promise.all([
      db.from("v_latest_forecasts").select("outlet_id, service_date, covers_p50").eq("property_id", propertyId).gte("service_date", plusDays(from, -7)).lt("service_date", to),
      db.from("roster_shifts").select("service_line_id, service_date, hours").eq("property_id", propertyId).gte("service_date", plusDays(from, -7)).lt("service_date", to).neq("status", "cancelled"),
    ]);
    // covers per outlet and day: the issued forecast when there is one, else a forecast from the
    // PMS row for that day (not persisted), else the outlet's usual
    const { data: pmsRows } = await db.from("pms_daily").select("*").eq("property_id", propertyId).gte("service_date", plusDays(from, -7)).lt("service_date", to);
    const { data: weatherRows } = await db.from("weather_daily").select("*").eq("property_id", propertyId).gte("service_date", plusDays(from, -7)).lt("service_date", to);
    const { data: bookingRows } = await db.from("bookings_daily").select("*").eq("property_id", propertyId).gte("service_date", plusDays(from, -7)).lt("service_date", to);
    const histories = new Map<string, HistoryPoint[]>();
    for (const o of ctx.outlets) histories.set(o.id, await loadHistory(db, propertyId, o, from, 60));
    const dayVolumes: DayVolume[] = [];
    for (let i = -7; i < days; i++) {
      const d = plusDays(from, i);
      const coversByOutlet: Record<string, number> = {};
      const pmsRow = (pmsRows ?? []).find((p) => p.service_date === d);
      const wRow = (weatherRows ?? []).find((w) => w.service_date === d);
      const weather: WeatherSignal | null = wRow ? { tempC: wRow.temp_c == null ? null : Number(wRow.temp_c), rainProb: wRow.rain_prob == null ? null : Number(wRow.rain_prob), condition: wRow.condition } : null;
      for (const o of ctx.outlets) {
        const f = (fcs ?? []).find((x) => x.outlet_id === o.id && x.service_date === d);
        if (f?.covers_p50 != null) {
          coversByOutlet[o.id] = f.covers_p50;
        } else if (o.type === "breakfast" && pmsRow) {
          coversByOutlet[o.id] = forecastBreakfast({ outlet: o, pms: toPms(pmsRow), weather, events: [], history: histories.get(o.id) ?? [] }).p50;
        } else if (o.type === "restaurant" || o.type === "bar") {
          const b = (bookingRows ?? []).find((x) => x.outlet_id === o.id && x.service_date === d);
          const booking: BookingSignal | null = b ? { coversBooked: b.covers_booked, walkInExpected: b.walk_in_expected, largestParty: b.largest_party, largestPartyAt: b.largest_party_at?.slice(0, 5) ?? null, peakAt: b.peak_at?.slice(0, 5) ?? null, peakCovers: b.peak_covers, parties: asArr(b.parties) } : null;
          coversByOutlet[o.id] = forecastBookings({ outlet: o, serviceDate: d, booking, weather, events: [], history: histories.get(o.id) ?? [] }).p50;
        } else {
          coversByOutlet[o.id] = Math.round(o.settings.usual_covers ?? 0);
        }
      }
      const rooms = pmsRow?.rooms_occupied ?? Math.round(ctx.property.keys * 0.78);
      dayVolumes.push({ serviceDate: d, coversByOutlet, roomsToService: rooms });
    }
    const demand = computeDemand(ctx.lines, dayVolumes);
    await db.from("staffing_demand").upsert(demand.map((d) => ({ property_id: propertyId, service_line_id: d.serviceLineId, service_date: d.serviceDate, demand_hours: d.demandHours, basis: d.basis as J, computed_at: new Date().toISOString() })), { onConflict: "service_line_id,service_date" });

    const plannedMap = new Map<string, number>();
    for (const s of shifts ?? []) {
      const k = `${s.service_line_id}|${s.service_date}`;
      plannedMap.set(k, (plannedMap.get(k) ?? 0) + Number(s.hours));
    }
    const planned: PlannedHours[] = [...plannedMap.entries()].map(([k, h]) => ({ serviceLineId: k.split("|")[0], serviceDate: k.split("|")[1], plannedHours: h }));

    // suggestions per ISO week (Monday)
    const weeks = new Set<string>();
    for (const d of dayVolumes) {
      const dt = new Date(d.serviceDate + "T12:00:00Z");
      const monday = plusDays(d.serviceDate, -((dt.getUTCDay() + 6) % 7));
      weeks.add(monday);
    }
    let count = 0;
    for (const monday of weeks) {
      // no rota yet for the week → nothing to move; the draft comes first
      const hasRota = planned.some((p) => p.serviceDate >= monday && p.serviceDate < plusDays(monday, 7) && p.plannedHours > 0);
      if (!hasRota) continue;
      const weekDemand = demand.filter((d) => d.serviceDate >= monday && d.serviceDate < plusDays(monday, 7));
      const suggestions = suggestRoster(ctx.lines, weekDemand, planned);
      await db.from("roster_suggestions").update({ status: "expired" }).eq("property_id", propertyId).eq("week_start", monday).eq("status", "proposed");
      if (suggestions.length) {
        await db.from("roster_suggestions").insert(suggestions.map((s) => ({ property_id: propertyId, week_start: monday, service_line_id: s.serviceLineId, service_date: s.serviceDate, title: s.title, detail: s.detail, delta_hours: s.deltaHours, moves: s.moves as unknown as J })));
        count += suggestions.length;
      }
    }
    return { demandRows: demand.length, suggestions: count };
  });
}

/** Live service: cover check, running fast, waste risk at a given clock time (HH:MM, property local). */
export async function runLive(db: AdminClient, propertyId: string, outletId: string, date: string, clock: string, ctxIn?: PropertyContext) {
  const ctx = ctxIn ?? (await loadProperty(db, propertyId));
  const outlet = ctx.outlets.find((o) => o.id === outletId);
  if (!outlet) throw new Error("outlet not found");
  const { data: f } = await db.from("v_latest_forecasts").select("*").eq("property_id", propertyId).eq("outlet_id", outletId).eq("service_date", date).maybeSingle();
  if (!f) return { skipped: "no forecast" };
  const fc: CoversForecast = { p10: f.covers_p10!, p50: f.covers_p50!, p90: f.covers_p90!, usual: f.usual_covers ?? f.covers_p50!, occupancy: f.occupancy == null ? null : Number(f.occupancy), waveSplit: asArr(f.wave_split), drivers: asArr(f.drivers), signalsRead: f.signals_read ?? 0, inputs: asObj(f.inputs), headline: "", subline: "" };
  const [{ data: pace }, { data: plans }, { data: pms }] = await Promise.all([
    db.from("pos_pace").select("at, covers_seated").eq("property_id", propertyId).eq("outlet_id", outletId).eq("service_date", date).lte("at", localInstant(date, clock, ctx.property.timezone)).order("at"),
    db.from("station_plans").select("station_id, status, qty, wave_id").eq("property_id", propertyId).eq("forecast_id", f.id!),
    db.from("pms_daily").select("nationality_mix").eq("property_id", propertyId).eq("service_date", date).maybeSingle(),
  ]);
  const proposals = [];
  const cc = coverCheck({ outlet, forecast: fc, pace: (pace ?? []).map((p) => ({ at: p.at, coversSeated: p.covers_seated })), nationalityMix: asObj(pms?.nationality_mix), clock });
  if (cc) proposals.push(cc);
  // consumption proxy per station: covers seated against the forecast, scaled by how hard the mix in
  // house pulls on the station (a tick-off "running low" always wins). Without a pace count there
  // is no proxy: nothing is "taken" or "over-stocked" on a guess.
  const lastPace = (pace ?? []).at(-1);
  const seated = lastPace?.covers_seated ?? null;
  const expectedNow = expectedSeatedAt(fc, outlet, clock);
  const ahead = seated != null && expectedNow > 0 ? seated / expectedNow : null;
  const natMix = asObj<Record<string, number>>(pms?.nationality_mix);
  const states = outlet.stations.map((s) => {
    const mine = (plans ?? []).filter((p) => p.station_id === s.id);
    const status = mine.some((p) => p.status === "running_low") ? "running_low" : mine.every((p) => p.status === "closed") && mine.length ? "closed" : mine.some((p) => p.status === "prepped") ? "prepped" : "proposed";
    const pull = nationalityMultiplier(s, natMix).mult;
    const taken = ahead != null && fc.p50 > 0 ? Math.min(1, (expectedNow / fc.p50) * ahead * pull) : null;
    return { stationId: s.id, takenPct: taken == null ? null : +taken.toFixed(2), status };
  });
  proposals.push(...runningFast({ outlet, forecast: fc, states, clock }));
  const wr = wasteRisk({ outlet, forecast: fc, states, clock });
  if (wr) proposals.push(wr);
  let inserted = 0;
  for (const p of proposals) {
    const { data: exists } = await db.from("live_events").select("id").eq("property_id", propertyId).eq("outlet_id", outletId).eq("service_date", date).eq("kind", p.kind).eq("title", p.title).maybeSingle();
    if (exists) continue;
    await db.from("live_events").insert({ property_id: propertyId, outlet_id: outletId, service_date: date, at: localInstant(date, clock, ctx.property.timezone), kind: p.kind, title: p.title, body: p.body, proposal: p.proposal, station_id: p.stationId, status: p.proposal ? "open" : "info", payload: { ...(p.payload as Record<string, unknown>), forecast_id: f.id } as J });
    inserted += 1;
  }
  return { proposals: proposals.length, inserted };
}

/**
 * The live tick (every 15 minutes): every outlet of the property that is in service at the
 * property's clock gets its cover check, running-fast and waste-risk proposals.
 */
export async function runLiveTick(db: AdminClient, propertyId: string, now: Date = new Date()) {
  const ctx = await loadProperty(db, propertyId);
  const date = formatInTimeZone(now, ctx.property.timezone, "yyyy-MM-dd");
  const clock = formatInTimeZone(now, ctx.property.timezone, "HH:mm");
  const t = minutesOf(clock);
  const open = ctx.outlets.filter((o) => o.stations.length && minutesOf(o.opensAt) <= t && t <= minutesOf(o.closesAt) + 15);
  if (!open.length) return { skipped: "no outlet in service", clock };
  return job(db, { job: "live", propertyId, serviceDate: date }, async () => {
    const out: Record<string, unknown> = { clock };
    for (const o of open) {
      try {
        out[o.slug] = await runLive(db, propertyId, o.id, date, clock, ctx);
      } catch (e) {
        out[o.slug] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    return out;
  });
}

/** The debrief (12:30): every outlet that closed a service on the date. */
export async function runDebrief(db: AdminClient, propertyId: string, date: string, ctxIn?: PropertyContext) {
  const ctx = ctxIn ?? (await loadProperty(db, propertyId));
  return job(db, { job: "debrief", propertyId, serviceDate: date }, async () => {
    const out: Record<string, unknown> = {};
    for (const o of ctx.outlets) {
      const { data: f } = await db.from("v_latest_forecasts").select("*").eq("property_id", propertyId).eq("outlet_id", o.id).eq("service_date", date).maybeSingle();
      const [{ data: actual }, { data: waste }, { data: decisions }, { data: plans }, { data: trailing }] = await Promise.all([
        db.from("service_actuals").select("*").eq("property_id", propertyId).eq("outlet_id", o.id).eq("service_date", date).maybeSingle(),
        db.from("waste_logs").select("station_id, kg, co2e_kg").eq("property_id", propertyId).eq("outlet_id", o.id).eq("service_date", date),
        db.from("decisions").select("status").eq("property_id", propertyId).eq("outlet_id", o.id).eq("service_date", date).neq("status", "expired"),
        f?.id ? db.from("station_plans").select("status").eq("property_id", propertyId).eq("forecast_id", f.id) : Promise.resolve({ data: [] as { status: string }[] }),
        // the measured baseline is the hotel's own record before ServiceFlow planned the service:
        // closed days with a log and no forecast. It never moves with the days ServiceFlow planned.
        db.from("outcomes").select("waste_g_per_cover").eq("property_id", propertyId).eq("outlet_id", o.id).is("forecast_id", null).gt("waste_g_per_cover", 0).lt("service_date", date).order("service_date", { ascending: false }).limit(28),
      ]);
      if (!actual && !(waste ?? []).length) {
        out[o.slug] = "no close";
        continue;
      }
      const wasteEntries: WasteEntry[] = (waste ?? []).map((w) => ({ stationId: w.station_id, kg: Number(w.kg), co2eKg: Number(w.co2e_kg) }));
      const tb = (trailing ?? []).map((t) => Number(t.waste_g_per_cover)).filter((x) => x > 0);
      const trailingBaseline = tb.length >= 7 ? tb.reduce((s, x) => s + x, 0) / tb.length : null;
      const approvedPlans = (plans ?? []).filter((p) => p.status !== "proposed" && p.status !== "skipped").length;
      const d = computeDebrief({
        property: ctx.property,
        outletStations: o.stations,
        forecast: f ? { p10: f.covers_p10!, p50: f.covers_p50!, p90: f.covers_p90!, usual: f.usual_covers } : null,
        actualCovers: actual?.actual_covers ?? null,
        waste: wasteEntries,
        trailingBaselineGPerCover: trailingBaseline,
        foodCostPerCover: foodCostPerCover(ctx, o),
        planFollowedPct: (plans ?? []).length ? Math.round((approvedPlans / (plans ?? []).length) * 100) : null,
        decisionsApproved: (decisions ?? []).filter((x) => x.status === "approved" || x.status === "done").length,
        decisionsTotal: (decisions ?? []).length,
      });
      await db.from("outcomes").upsert(
        {
          property_id: propertyId,
          outlet_id: o.id,
          service_date: date,
          forecast_id: f?.id ?? null,
          forecast_covers_p50: f?.covers_p50 ?? null,
          forecast_covers_p10: f?.covers_p10 ?? null,
          forecast_covers_p90: f?.covers_p90 ?? null,
          actual_covers: actual?.actual_covers ?? null,
          error_pct: d.errorPct,
          mape: d.mape,
          within_band: d.withinBand,
          usual_covers: f?.usual_covers ?? null,
          waste_kg: d.wasteKg,
          waste_g_per_cover: d.wasteGPerCover,
          baseline_g_per_cover: d.baselineGPerCover,
          waste_avoided_kg: d.wasteAvoidedKg,
          co2e_kg: d.co2eKg,
          co2e_avoided_kg: d.co2eAvoidedKg,
          food_cost: d.foodCost,
          saving_serviceflow: d.savingServiceflow,
          saving_bin_scale: d.savingBinScale,
          saving_total: d.savingTotal,
          currency: d.currency,
          plan_followed_pct: (plans ?? []).length ? Math.round((approvedPlans / (plans ?? []).length) * 100) : null,
          decisions_approved: (decisions ?? []).filter((x) => x.status === "approved" || x.status === "done").length,
          decisions_total: (decisions ?? []).length,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "outlet_id,service_date" },
      );
      if (f?.id) await db.from("prediction_log").update({ outcome: { actual: actual?.actual_covers ?? null, mape: d.mape, within_band: d.withinBand } as Json }).eq("property_id", propertyId).eq("forecast_id", f.id);
      out[o.slug] = { actual: actual?.actual_covers ?? null, mape: d.mape, wasteKg: d.wasteKg, saving: d.savingServiceflow };
    }
    return out;
  });
}

/** "Tonight, graded." The nightly report for the property, and tomorrow's three actions across departments. */
export async function runNightlyReport(db: AdminClient, propertyId: string, date: string, ctxIn?: PropertyContext) {
  const ctx = ctxIn ?? (await loadProperty(db, propertyId));
  return job(db, { job: "nightly_report", propertyId, serviceDate: date }, async () => {
    const tomorrow = plusDays(date, 1);
    const [{ data: outcomes }, { data: staffing }, { data: variances }, { data: energy }, { data: pms }, { data: decisionsTomorrow }, { data: roomsDone }, { data: voice }, { data: suggestions }, { data: wasteStations }, { data: revenue }, { data: team }] = await Promise.all([
      db.from("outcomes").select("*").eq("property_id", propertyId).eq("service_date", date),
      db.from("v_staffing_day").select("*").eq("property_id", propertyId).eq("service_date", date),
      db.from("pos_variances").select("amount, status").eq("property_id", propertyId).eq("status", "open"),
      db.from("energy_readings").select("kwh").eq("property_id", propertyId).eq("service_date", date),
      db.from("pms_daily").select("rooms_occupied").eq("property_id", propertyId).eq("service_date", date).maybeSingle(),
      db.from("decisions").select("*").eq("property_id", propertyId).eq("service_date", tomorrow).eq("status", "proposed"),
      db.from("room_tasks").select("status, kind, minutes").eq("property_id", propertyId).eq("service_date", date),
      db.from("waste_logs").select("outlet_id, seconds_to_log").eq("property_id", propertyId).eq("service_date", date).eq("source", "voice"),
      db.from("roster_suggestions").select("*").eq("property_id", propertyId).eq("status", "proposed").gte("service_date", tomorrow).order("delta_hours").limit(3),
      db.from("waste_logs").select("station_id").eq("property_id", propertyId).eq("service_date", date),
      db.from("service_actuals").select("revenue").eq("property_id", propertyId).eq("service_date", date),
      db.from("team_members").select("department, hourly_cost").eq("property_id", propertyId).eq("active", true).not("hourly_cost", "is", null),
    ]);
    // an hour's cost per department, from the hotel's own rota; unknown → no money is claimed
    const hourly = (department: string): number => {
      const rows = (team ?? []).filter((t) => t.department === department && t.hourly_cost != null);
      return rows.length ? rows.reduce((s, t) => s + Number(t.hourly_cost), 0) / rows.length : 0;
    };
    const oc = outcomes ?? [];
    const mapes = oc.map((o) => (o.mape == null ? null : Number(o.mape))).filter((x): x is number => x != null);
    const wasteRatio = oc.filter((o) => o.waste_g_per_cover && o.baseline_g_per_cover).map((o) => Number(o.waste_g_per_cover) / Number(o.baseline_g_per_cover));
    const st = staffing ?? [];
    const shortHours = st.reduce((s, x) => s + Math.max(0, -Number(x.delta_hours)), 0);
    const overHours = st.reduce((s, x) => s + Math.max(0, Number(x.delta_hours)), 0);
    const demandHours = st.reduce((s, x) => s + Number(x.demand_hours), 0);
    const kwh = (energy ?? []).reduce((s, e) => s + Number(e.kwh), 0);
    const baseline = ctx.property.settings.energy_baseline_kwh_room;
    const energyVsBaseline = baseline && kwh > 0 ? kwh / (ctx.property.keys * baseline) - 1 : null;
    const stationCount = ctx.outlets.reduce((s, o) => s + o.stations.length, 0);
    const loggedShare = stationCount ? new Set((wasteStations ?? []).map((w) => w.station_id)).size / stationCount : null;
    const rev = (revenue ?? []).reduce((s, r) => s + Number(r.revenue ?? 0), 0);

    // candidates: tomorrow's F&B decisions, the top roster suggestion, the open POS variances
    const candidates: Decision[] = (decisionsTomorrow ?? []).map((d) => ({ rank: d.rank, kind: d.kind as Decision["kind"], department: d.department, stationId: d.station_id, title: d.title, detail: d.detail ?? "", reason: d.reason ?? "", deltaPct: d.delta_pct == null ? null : Number(d.delta_pct), estSaving: Number(d.est_saving ?? 0), payload: { decision_id: d.id } }));
    for (const v of variances ?? []) candidates.push({ rank: 9, kind: "reconcile", department: "finance", stationId: null, title: "Reconcile a POS variance", detail: `${(variances ?? []).length} open · by 09:00`, reason: "unposted courses", deltaPct: null, estSaving: Number(v.amount) });
    for (const s of suggestions ?? []) {
      const hk = /housekeeping/i.test(s.title);
      const line = ctx.lines.find((l) => l.id === s.service_line_id);
      candidates.push({ rank: 9, kind: hk ? "assign" : "move", department: hk ? "housekeeping" : "kitchen", stationId: null, title: hk ? "Add a room attendant" : s.title.replace(/ is short by .*$/, ": add hours"), detail: s.detail ?? "", reason: s.title, deltaPct: null, estSaving: Math.round(Math.abs(Number(s.delta_hours ?? 0)) * hourly(line?.department ?? (hk ? "housekeeping" : "kitchen"))), payload: { suggestion_id: s.id } });
    }
    // housekeeping: suites behind pace → one more attendant
    const suiteTasks = (roomsDone ?? []).filter((r) => r.minutes && r.minutes > 30);
    if (suiteTasks.length >= 10) candidates.push({ rank: 9, kind: "assign", department: "housekeeping", stationId: null, title: "Add a suite attendant", detail: `${suiteTasks.length} rooms over 30 min · suites run slow`, reason: "minutes per room above target on the suite floors", deltaPct: null, estSaving: Math.round(4 * hourly("housekeeping")) });

    const voiceByOutlet = new Map<string, { sum: number; n: number }>();
    for (const v of voice ?? []) {
      if (v.seconds_to_log == null) continue;
      const cur = voiceByOutlet.get(v.outlet_id) ?? { sum: 0, n: 0 };
      cur.sum += v.seconds_to_log;
      cur.n += 1;
      voiceByOutlet.set(v.outlet_id, cur);
    }
    const logQuality = [...voiceByOutlet.entries()].map(([oid, v]) => ({ outlet: ctx.outlets.find((o) => o.id === oid)?.name ?? "kitchen", avgSeconds: v.sum / v.n, entries: v.n }));

    const night = computeNightly({
      serviceDate: date,
      outlets: ctx.outlets.length,
      rooms: pms?.rooms_occupied ?? ctx.property.keys,
      departments: 4,
      fnb: { mape: mapes.length ? mapes.reduce((s, x) => s + x, 0) / mapes.length : null, wasteVsBaseline: wasteRatio.length ? wasteRatio.reduce((s, x) => s + x, 0) / wasteRatio.length : null, planFollowedPct: null, withinBandShare: oc.filter((o) => o.within_band != null).length ? oc.filter((o) => o.within_band).length / oc.filter((o) => o.within_band != null).length : null },
      labour: { demandHours, shortHours, overHours },
      leakage: { openVariance: (variances ?? []).reduce((s, v) => s + Number(v.amount), 0), revenue: rev || null, openItems: (variances ?? []).length },
      esg: { energyVsBaseline, wasteLoggedShare: loggedShare, co2eAvoidedKg: oc.reduce((s, o) => s + Number(o.co2e_avoided_kg ?? 0), 0) },
      candidates,
      logQuality,
    });
    await db.from("nightly_reports").upsert({ property_id: propertyId, service_date: date, grades: night.grades as unknown as J, summary: night.summary as J, best_log: (night.bestLog ?? null) as J, computed_at: new Date().toISOString() }, { onConflict: "property_id,service_date" });
    // tomorrow's actions that are not already decisions become "nightly" decisions for the day
    for (const a of night.actions) {
      if (a.payload?.decision_id) continue;
      const { data: exists } = await db.from("decisions").select("id").eq("property_id", propertyId).eq("service_date", tomorrow).eq("title", a.title).maybeSingle();
      if (exists) continue;
      await db.from("decisions").insert({ property_id: propertyId, outlet_id: null, forecast_id: null, station_id: null, service_date: tomorrow, rank: a.rank, kind: a.kind, department: a.department, title: a.title, detail: a.detail, reason: a.reason, delta_pct: a.deltaPct, est_saving: a.estSaving, currency: ctx.property.currency, source: "nightly", payload: (a.payload ?? {}) as J });
    }
    return { grades: Object.fromEntries(Object.entries(night.grades).map(([k, v]) => [k, v.grade])), actions: night.actions.length };
  });
}

/** In-app notifications for the brief (email and push are sent by the notify module when configured). */
async function notifyBrief(db: AdminClient, ctx: PropertyContext, date: string, kind: string) {
  const { data: members } = await db.from("memberships").select("user_id, role").eq("property_id", ctx.property.id).eq("active", true).in("role", ["gm", "fnb_mgr", "chef", "sous_chef"]);
  const { data: f } = await db.from("v_latest_forecasts").select("covers_p50, outlet_id").eq("property_id", ctx.property.id).eq("service_date", date);
  const covers = (f ?? []).reduce((s, x) => s + (x.covers_p50 ?? 0), 0);
  const day = new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const title = kind === "dawn" ? `Dawn update · ${day}` : `Tomorrow's plan is ready · ${day}`;
  // one notification per person and brief: a rerun never sends the same line twice
  // the title names the weekday, so the same words come back next week: only today's sends count
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data: sent } = await db.from("notifications").select("user_id").eq("property_id", ctx.property.id).eq("title", title).gte("created_at", since);
  const already = new Set((sent ?? []).map((n) => n.user_id));
  const rows = (members ?? []).filter((m) => m.user_id && !already.has(m.user_id)).map((m) => ({ property_id: ctx.property.id, user_id: m.user_id!, kind: kind === "dawn" ? "dawn_update" : "brief", title, body: `${covers} covers forecast across ${(f ?? []).length} outlets. ${m.role === "gm" ? "Decisions wait for approval." : "Station pars are ready to confirm."}`, href: m.role === "gm" ? "/brief" : "/plan", channels: ["in_app"] }));
  if (rows.length) await db.from("notifications").insert(rows);
}

/** Everything a scheduled tick needs: brief for tomorrow (and for today if missing), debrief and nightly for today. */
export async function runDailyCycle(db: AdminClient, propertyId: string, today: string) {
  const ctx = await loadProperty(db, propertyId);
  const tomorrow = plusDays(today, 1);
  const results: Record<string, unknown> = {};
  const { data: todayFc } = await db.from("forecasts").select("id").eq("property_id", propertyId).eq("service_date", today).limit(1);
  if (!(todayFc ?? []).length) results.today = await runEveningBrief(db, propertyId, today, "manual");
  results.debrief = await runDebrief(db, propertyId, today, ctx);
  results.tomorrow = await runEveningBrief(db, propertyId, tomorrow, "evening");
  results.nightly = await runNightlyReport(db, propertyId, today, ctx);
  return results;
}
