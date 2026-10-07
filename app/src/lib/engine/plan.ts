/**
 * Production plan per station and wave, and the three decisions that matter.
 * The plan is what to prepare; the usual quantity is what habit would have prepared.
 */
import type {
  BanquetSignal,
  CoversForecast,
  Correction,
  Decision,
  HistoryPoint,
  OutletCfg,
  PmsSignals,
  PropertyCfg,
  StationCfg,
  StationPlan,
  StationPlanLine,
  WeatherSignal,
} from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function normalise(mix: Record<string, number>): Record<string, number> {
  const entries = Object.entries(mix).filter(([, v]) => Number.isFinite(v) && v > 0);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  if (sum <= 0) return {};
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}

/** Bayesian-flavoured nationality multiplier: priors weighted by their confidence and the mix in house. */
export function nationalityMultiplier(station: StationCfg, nationalityMix: Record<string, number>): { mult: number; driver: string | null } {
  const mix = normalise(nationalityMix);
  const keys = Object.keys(mix);
  if (!keys.length || !station.nationalityPriors) return { mult: 1, driver: null };
  let num = 0;
  let den = 0;
  let best: { k: string; v: number } | null = null;
  for (const k of keys) {
    const prior = station.nationalityPriors[k];
    const mult = prior?.mult ?? 1;
    const conf = prior?.conf ?? 0.5;
    num += mix[k] * (1 + (mult - 1) * conf);
    den += mix[k];
    const impact = Math.abs(mult - 1) * conf * mix[k];
    if (!best || impact > best.v) best = { k, v: impact };
  }
  const mult = den > 0 ? num / den : 1;
  const driver = best && best.v > 0.04 ? `${best.k.replace("_", " ")} guests ${mult >= 1 ? "take more" : "take less"}` : null;
  return { mult: clamp(mult, 0.5, 1.8), driver };
}

export function dowMultiplier(station: StationCfg, serviceDate: string): number {
  const day = new Date(serviceDate + "T12:00:00Z").getUTCDay();
  const weekend = day === 0 || day === 6;
  const p = station.dowProfile ?? {};
  return weekend ? (p.weekend ?? 1) : (p.weekday ?? 1);
}

export function weatherMultiplier(station: StationCfg, weather: WeatherSignal | null): { mult: number; label: string | null } {
  if (!weather) return { mult: 1, label: null };
  const p = station.weatherProfile ?? {};
  const rain = (weather.rainProb ?? 0) >= 0.6 || weather.condition === "rain";
  const hot = (weather.tempC ?? 25) >= 31 || weather.condition === "hot";
  if (rain && p.rain && p.rain !== 1) return { mult: p.rain, label: "rain forecast" };
  if (hot && p.hot && p.hot !== 1) return { mult: p.hot, label: "hot day" };
  return { mult: 1, label: null };
}

/** The learning loop: recent corrections and measured over-prep pull the par back. */
export function learningFactor(stationId: string, corrections: Correction[], history: HistoryPoint[]): number {
  const own = corrections.filter((c) => c.stationId === stationId).slice(-5);
  let f = own.length ? own.reduce((s, c) => s + c.factor, 0) / own.length : 1;
  const over = history.map((h) => h.stationOverPrep?.[stationId]).filter((x): x is number => typeof x === "number").slice(-7);
  if (over.length >= 3) {
    const avg = over.reduce((s, x) => s + x, 0) / over.length; // 1.10 = 10% over-prepped
    f *= clamp(1 / avg, 0.85, 1.1);
  }
  return clamp(f, 0.6, 1.4);
}

function suiteMix(pms: PmsSignals | null): number {
  if (!pms || !pms.roomsOccupied) return 0;
  return clamp(pms.suitesOccupied / pms.roomsOccupied, 0, 1);
}

/**
 * Buffet and à la carte plan. qty = base par × covers ratio × nationality × weekday × weather × learning.
 * The "usual" is base par × usual covers ratio: the habit sheet.
 */
export function buildStationPlan(input: {
  outlet: OutletCfg;
  forecast: CoversForecast;
  serviceDate: string;
  pms: PmsSignals | null;
  weather: WeatherSignal | null;
  corrections: Correction[];
  history: HistoryPoint[];
}): StationPlan {
  const { outlet, forecast, serviceDate, pms, weather, corrections, history } = input;
  const lines: StationPlanLine[] = [];
  const totals: StationPlan["totals"] = [];
  const suites = suiteMix(pms);
  const band = forecast.p50 > 0 ? (forecast.p90 - forecast.p50) / forecast.p50 : 0.06;

  for (const st of outlet.stations) {
    const usualCovers = st.usualCovers ?? outlet.settings.usual_covers ?? forecast.usual ?? forecast.p50;
    const coversRatio = usualCovers > 0 ? forecast.p50 / usualCovers : 1;
    const nat = pms ? nationalityMultiplier(st, pms.nationalityMix) : { mult: 1, driver: null };
    const dow = dowMultiplier(st, serviceDate);
    const wx = weatherMultiplier(st, weather);
    const learn = learningFactor(st.id, corrections, history);
    // suite-heavy houses order more à la carte and take less from the hot buffet
    const suitePenalty = st.kind === "buffet" && (st.foodCategory === "meat" || st.foodCategory === "beef_lamb" || st.slug.includes("western")) ? 1 - clamp(suites - 0.08, 0, 0.3) * 0.5 : 1;

    const usualQty = st.basePar; // habit: the same par every day
    const reasons: string[] = [];
    if (nat.driver) reasons.push(nat.driver);
    if (wx.label) reasons.push(wx.label);
    if (suitePenalty < 0.98) reasons.push("suite-heavy mix, more à la carte");
    if (learn < 0.97) reasons.push("over-prepped last week");
    if (learn > 1.03) reasons.push("ran short last week");
    if (Math.abs(coversRatio - 1) >= 0.05) reasons.push(`${forecast.p50} covers vs ${Math.round(usualCovers)} usual`);

    let qty = st.basePar * coversRatio * nat.mult * dow * wx.mult * learn * suitePenalty;
    if (st.kind === "dish") {
      // high-value dishes: prep to tomorrow's bookings with a thin buffer, never to last week
      qty = st.basePar * coversRatio * dow * wx.mult * learn;
    }
    qty = Math.max(0, qty);
    const rounded = st.unit === "portions" || st.unit === "plates" || st.unit === "sets" || st.unit === "trays" ? Math.round(qty) : r1(qty);
    const deltaPct = usualQty > 0 ? Math.round(((rounded - usualQty) / usualQty) * 100) : 0;
    const reason = reasons.slice(0, 2).join(" · ") || "on the usual par";

    const waves = forecast.waveSplit.length ? forecast.waveSplit : [{ waveId: null as string | null, label: "Service", startsAt: outlet.opensAt, share: 1, covers: forecast.p50 }];
    const byWave: { waveId: string | null; label: string; qty: number }[] = [];
    let allocated = 0;
    waves.forEach((w, i) => {
      const isLast = i === waves.length - 1;
      const q = isLast ? Math.max(0, rounded - allocated) : st.unit === "portions" || st.unit === "plates" ? Math.round(rounded * w.share) : r1(rounded * w.share);
      allocated += q;
      byWave.push({ waveId: w.waveId, label: w.label, qty: q });
      lines.push({
        stationId: st.id,
        waveId: w.waveId,
        qty: q,
        unit: st.unit,
        usualQty: r1(usualQty * w.share),
        deltaPct,
        reason,
        expectedConsumption: r1(q / (1 + band)),
        uncertainty: r1(q * band),
      });
    });
    totals.push({ stationId: st.id, name: st.name, qty: rounded, usualQty, deltaPct, reason, byWave });
  }
  return { lines, totals };
}

/** Banquet plan: every course to the cook count, options by RSVP. */
export function buildBanquetPlan(input: { outlet: OutletCfg; banquets: BanquetSignal[]; cookCount: number }): StationPlan {
  const { outlet, banquets, cookCount } = input;
  const lines: StationPlanLine[] = [];
  const totals: StationPlan["totals"] = [];
  const wave = outlet.waves[0];
  for (const st of outlet.stations) {
    const course = banquets.flatMap((b) => b.courses ?? []).find((c) => c.station === st.slug || c.name === st.name);
    const qty = cookCount;
    const booked = banquets.reduce((s, b) => s + b.bookedCount, 0) || cookCount;
    const options = course?.options ? Object.entries(course.options).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(" · ") : null;
    const reason = options ?? course?.note ?? "on count";
    lines.push({ stationId: st.id, waveId: wave?.id ?? null, qty, unit: st.unit, usualQty: booked, deltaPct: Math.round(((qty - booked) / booked) * 100), reason, expectedConsumption: qty, uncertainty: 0 });
    totals.push({ stationId: st.id, name: course?.name ?? st.name, qty, usualQty: booked, deltaPct: Math.round(((qty - booked) / booked) * 100), reason, byWave: [{ waveId: wave?.id ?? null, label: wave?.label ?? "Service", qty }] });
  }
  return { lines, totals };
}

/**
 * The three decisions for tomorrow: trim, boost, hold.
 * Savings are the food not bought, valued at the station's cost. Boosts protect service and carry no saving.
 */
export function buildDecisions(input: { outlet: OutletCfg; plan: StationPlan; forecast: CoversForecast; property: PropertyCfg; history: HistoryPoint[]; pms: PmsSignals | null }): Decision[] {
  const { outlet, plan, forecast, history } = input;
  const byId = new Map(outlet.stations.map((s) => [s.id, s]));
  const decisions: Decision[] = [];

  const trims = plan.totals.filter((t) => t.deltaPct <= -5).sort((a, b) => a.deltaPct - b.deltaPct);
  const boosts = plan.totals.filter((t) => t.deltaPct >= 5).sort((a, b) => b.deltaPct - a.deltaPct);

  const groupDriver = forecast.drivers.find((d) => /group of/i.test(d.label));

  if (trims[0]) {
    const st = byId.get(trims[0].stationId)!;
    const saved = Math.max(0, (trims[0].usualQty - trims[0].qty) * st.costPerUnit);
    decisions.push({ rank: 1, kind: "trim", department: "kitchen", stationId: st.id, title: `Trim ${st.name} −${Math.abs(trims[0].deltaPct)}%`, detail: trims[0].reason, reason: forecast.drivers[0]?.label ?? trims[0].reason, deltaPct: trims[0].deltaPct, estSaving: Math.round(saved) });
  }
  if (boosts[0]) {
    const st = byId.get(boosts[0].stationId)!;
    decisions.push({ rank: 2, kind: "boost", department: "kitchen", stationId: st.id, title: `Boost ${st.name} +${boosts[0].deltaPct}%`, detail: groupDriver ? groupDriver.label.toLowerCase().replace("in house", "arriving tonight") : boosts[0].reason, reason: boosts[0].reason, deltaPct: boosts[0].deltaPct, estSaving: 0 });
  }
  // hold: the station with the highest waste last week keeps a buffer back until the second wave
  const wasteByStation = new Map<string, number>();
  for (const h of history.slice(-7)) for (const [sid, over] of Object.entries(h.stationOverPrep ?? {})) wasteByStation.set(sid, (wasteByStation.get(sid) ?? 0) + (over - 1));
  const hold = [...wasteByStation.entries()].filter(([sid]) => byId.has(sid) && !decisions.some((d) => d.stationId === sid)).sort((a, b) => b[1] - a[1])[0];
  if (hold && hold[1] > 0.1) {
    const st = byId.get(hold[0])!;
    const tot = plan.totals.find((t) => t.stationId === st.id);
    const secondWave = forecast.waveSplit[1]?.label ?? "the second wave";
    const held = tot ? tot.qty * 0.25 : st.basePar * 0.25;
    decisions.push({ rank: 3, kind: "hold", department: "kitchen", stationId: st.id, title: `Hold a ${st.name.toLowerCase()} buffer`, detail: `replenish from ${secondWave} only`, reason: `over-prepped ${Math.round(hold[1] * 100)}% last week`, deltaPct: null, estSaving: Math.round(held * st.costPerUnit * 0.4) });
  }
  // fill to three with the next trims/boosts
  let rank = decisions.length + 1;
  for (const t of [...trims.slice(1), ...boosts.slice(1)]) {
    if (decisions.length >= 3) break;
    const st = byId.get(t.stationId)!;
    const isTrim = t.deltaPct < 0;
    decisions.push({ rank: rank++, kind: isTrim ? "trim" : "boost", department: "kitchen", stationId: st.id, title: `${isTrim ? "Trim" : "Boost"} ${st.name} ${t.deltaPct > 0 ? "+" : t.deltaPct < 0 ? "−" : ""}${Math.abs(t.deltaPct)}%`, detail: t.reason, reason: t.reason, deltaPct: t.deltaPct, estSaving: isTrim ? Math.round(Math.max(0, (t.usualQty - t.qty) * st.costPerUnit)) : 0 });
  }
  if (decisions.length === 0) {
    decisions.push({ rank: 1, kind: "hold", department: "kitchen", stationId: null, title: "Hold the usual pars", detail: "forecast within 5% of habit", reason: "no signal moved the plan", deltaPct: 0, estSaving: 0 });
  }
  return decisions.slice(0, 3).map((d, i) => ({ ...d, rank: i + 1 }));
}
