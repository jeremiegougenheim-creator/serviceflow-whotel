/**
 * Backtest — replay the forecast over the hotel's own past services, one evening at a time.
 *
 * Walk-forward and out of sample: the forecast for day d sees only what happened before d
 * (actual covers, its own earlier forecasts for the learning step), never d itself or later.
 * Every day is scored against two baselines a hotel already uses:
 *   habit    the same weekday over the last four weeks (what the kitchen plans on by default)
 *   simple   breakfast: guests in house × the capture rate of the last 28 days
 *            restaurant and bar: covers booked × the usual ratio of covers to bookings
 * If ServiceFlow does not beat the simple baseline, the segmentation is not earning its keep,
 * and the screen says so.
 */
import { forecastBookings, forecastBreakfast, GUESTS_PER_ROOM_DEFAULT } from "./forecast";
import type { BookingSignal, EventSignal, HistoryPoint, OutletCfg, PmsSignals, WeatherSignal } from "./types";

export interface ReplayDay {
  date: string;
  pms: PmsSignals | null;
  weather: WeatherSignal | null;
  events: EventSignal[];
  booking: BookingSignal | null;
  actual: number | null;
}

export interface ReplayPoint {
  date: string;
  actual: number;
  p10: number;
  p50: number;
  p90: number;
  habit: number;
  simple: number | null;
  /** the signal that moved the forecast most that day */
  driver: string | null;
}

export interface Accuracy {
  /** mean absolute percentage error, 0.042 = 4.2 % */
  mape: number;
  /** mean absolute error in covers */
  mae: number;
  /** mean signed error, actual − forecast over forecast: > 0 = under-forecast */
  bias: number;
  /** covers off in total over the window */
  coversOff: number;
}

export interface ReplaySummary {
  outletId: string;
  outletName: string;
  from: string;
  to: string;
  /** days scored */
  n: number;
  /** days used only to build history before scoring starts */
  warmup: number;
  engine: Accuracy;
  habit: Accuracy;
  /** the simple baseline and the forecast on the same days (a baseline that skipped a hard day would look better than it is) */
  simple: { n: number; baseline: Accuracy; engine: Accuracy } | null;
  simpleLabel: string;
  /** share of days the actual fell inside the forecast's own range (P10–P90, aims at about 80 %) */
  withinBand: number;
  /** days the forecast was closer than habit, and days it was exactly as close */
  closerThanHabit: number;
  sameAsHabit: number;
  /** days the forecast was closer than the simple baseline */
  closerThanSimple: number;
  /** the three largest misses, for the "where it missed" list */
  worst: ReplayPoint[];
}

export const WARMUP_DAYS = 14;
const SIMPLE_WINDOW = 28;
const LOOKBACK = 90;

const guestsOf = (p: PmsSignals) => (p.guestsInHouse > 0 ? p.guestsInHouse : p.roomsOccupied * GUESTS_PER_ROOM_DEFAULT);

function accuracy(rows: { actual: number; f: number }[]): Accuracy {
  const n = rows.length || 1;
  const ape = rows.reduce((s, r) => s + Math.abs(r.actual - r.f) / Math.max(1, r.actual), 0);
  const ae = rows.reduce((s, r) => s + Math.abs(r.actual - r.f), 0);
  const bias = rows.reduce((s, r) => s + (r.actual - r.f) / Math.max(1, r.f), 0);
  return { mape: ape / n, mae: ae / n, bias: bias / n, coversOff: Math.round(ae) };
}

/**
 * Replays one outlet. days may come in any order; the first WARMUP_DAYS with an actual only
 * build history. Banquets are not replayed: they cook to the final count, there is no forecast.
 */
export function replayOutlet(outlet: OutletCfg, daysIn: ReplayDay[], opts: { warmup?: number } = {}): { points: ReplayPoint[]; summary: ReplaySummary | null } {
  const warmup = opts.warmup ?? WARMUP_DAYS;
  const days = [...daysIn].sort((a, b) => a.date.localeCompare(b.date));
  const history: HistoryPoint[] = [];
  // what the simple baselines need from the past: guests or bookings next to the actual
  const past: { date: string; actual: number; guests: number | null; booked: number | null }[] = [];
  const points: ReplayPoint[] = [];
  let seen = 0;

  for (const day of days) {
    if (outlet.type === "banquet") break;
    const before = history.filter((h) => h.serviceDate < day.date).slice(-LOOKBACK);
    let p: { p10: number; p50: number; p90: number; usual: number; raw: number | null; driver: string | null } | null = null;
    if (outlet.type === "breakfast") {
      if (day.pms) {
        const fc = forecastBreakfast({ outlet, pms: day.pms, weather: day.weather, events: day.events, history: before });
        p = { p10: fc.p10, p50: fc.p50, p90: fc.p90, usual: fc.usual, raw: Number(fc.inputs.raw) || null, driver: fc.drivers[0]?.label ?? null };
      }
    } else {
      const fc = forecastBookings({ outlet, serviceDate: day.date, booking: day.booking, weather: day.weather, events: day.events, history: before });
      p = { p10: fc.p10, p50: fc.p50, p90: fc.p90, usual: fc.usual, raw: Number(fc.inputs.raw) || null, driver: fc.drivers[0]?.label ?? null };
    }

    // simple baseline from the last 28 days that carry both the signal and the actual
    let simple: number | null = null;
    const recent = past.slice(-SIMPLE_WINDOW);
    if (outlet.type === "breakfast" && day.pms) {
      const rows = recent.filter((r) => r.guests);
      const g = rows.reduce((s, r) => s + r.guests!, 0);
      if (rows.length >= 7 && g > 0) simple = Math.round(guestsOf(day.pms) * (rows.reduce((s, r) => s + r.actual, 0) / g));
    } else if (day.booking) {
      const rows = recent.filter((r) => r.booked);
      const b = rows.reduce((s, r) => s + r.booked!, 0);
      if (rows.length >= 7 && b > 0) simple = Math.round(day.booking.coversBooked * (rows.reduce((s, r) => s + r.actual, 0) / b));
    }

    if (day.actual != null) {
      // score only after the warm-up, and only when habit had at least two same weekdays
      const sameDow = past.filter((r) => new Date(r.date + "T12:00:00Z").getUTCDay() === new Date(day.date + "T12:00:00Z").getUTCDay()).length;
      if (p && seen >= warmup && sameDow >= 2) {
        points.push({ date: day.date, actual: day.actual, p10: p.p10, p50: p.p50, p90: p.p90, habit: p.usual, simple, driver: p.driver });
      }
      seen += 1;
      past.push({ date: day.date, actual: day.actual, guests: day.pms ? guestsOf(day.pms) : null, booked: day.booking?.coversBooked ?? null });
    }
    // the replay's own forecast feeds the learning step, exactly as the stored forecast does live
    history.push({ serviceDate: day.date, forecastP50: p?.p50 ?? null, forecastRaw: p?.raw ?? null, actualCovers: day.actual, roomsOccupied: day.pms?.roomsOccupied ?? null, wasteKg: null });
  }

  if (!points.length) return { points, summary: null };
  const withSimple = points.filter((x) => x.simple != null);
  const err = (x: ReplayPoint, f: number) => Math.abs(x.actual - f);
  const summary: ReplaySummary = {
    outletId: outlet.id,
    outletName: outlet.name,
    from: points[0].date,
    to: points.at(-1)!.date,
    n: points.length,
    warmup,
    engine: accuracy(points.map((x) => ({ actual: x.actual, f: x.p50 }))),
    habit: accuracy(points.map((x) => ({ actual: x.actual, f: x.habit }))),
    simple:
      withSimple.length >= Math.max(7, points.length * 0.5)
        ? { n: withSimple.length, baseline: accuracy(withSimple.map((x) => ({ actual: x.actual, f: x.simple! }))), engine: accuracy(withSimple.map((x) => ({ actual: x.actual, f: x.p50 }))) }
        : null,
    simpleLabel: outlet.type === "breakfast" ? "Guests in house × capture rate" : "Bookings × usual ratio",
    withinBand: points.filter((x) => x.actual >= x.p10 && x.actual <= x.p90).length / points.length,
    closerThanHabit: points.filter((x) => err(x, x.p50) < err(x, x.habit)).length,
    sameAsHabit: points.filter((x) => err(x, x.p50) === err(x, x.habit)).length,
    closerThanSimple: withSimple.filter((x) => err(x, x.p50) < err(x, x.simple!)).length,
    worst: [...points].sort((a, b) => Math.abs(b.actual - b.p50) / b.actual - Math.abs(a.actual - a.p50) / a.actual).slice(0, 3),
  };
  return { points, summary };
}
