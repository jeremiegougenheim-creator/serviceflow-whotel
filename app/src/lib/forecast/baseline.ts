/**
 * Lauds Forecast Engine — baseline.ts
 * TypeScript port of computeBriefingV3 from the W Taipei HTML prototype.
 * Pure functions, no side-effects, fully typed.
 */

import type { CoversBand, StationPar, WaveLabel } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const BASE_PARS: Record<string, number> = {
  congee_noodle: 60,
  dim_sum: 40,
  japanese: 45,
  korean: 25,
  western_hot: 70,
  bakery_pastry: 55,
  fruit_cold: 80,
  taiwanese_local: 35,
  coffee_bar: 300,
};

/** Breakfast attachment rate by booking segment */
export const SEGMENT_ATTACH: Record<string, number> = {
  leisure_direct: 0.74,
  leisure_ota: 0.58,
  business_corp: 0.52,
  business_meeting: 0.71,
  group_inclusive: 0.94,
  group_exclusive: 0.45,
  long_stay: 0.65,
};

/** Nationality-based demand priors {mult, conf} per station */
export const NAT_PRIORS: Record<string, Record<string, { mult: number; conf: number }>> = {
  greaterChina: {
    congee_noodle: { mult: 1.55, conf: 0.92 },
    dim_sum: { mult: 1.50, conf: 0.95 },
    taiwanese_local: { mult: 1.35, conf: 0.88 },
    western_hot: { mult: 0.75, conf: 0.85 },
    bakery_pastry: { mult: 0.85, conf: 0.78 },
    coffee_bar: { mult: 0.90, conf: 0.80 },
  },
  japan: {
    japanese: { mult: 1.85, conf: 0.94 },
    fruit_cold: { mult: 1.25, conf: 0.82 },
    coffee_bar: { mult: 1.10, conf: 0.75 },
    western_hot: { mult: 0.75, conf: 0.80 },
  },
  korea: {
    korean: { mult: 1.85, conf: 0.91 },
    congee_noodle: { mult: 1.15, conf: 0.70 },
    coffee_bar: { mult: 1.20, conf: 0.78 },
  },
  western: {
    western_hot: { mult: 1.65, conf: 0.93 },
    bakery_pastry: { mult: 1.45, conf: 0.90 },
    coffee_bar: { mult: 1.40, conf: 0.95 },
    fruit_cold: { mult: 1.15, conf: 0.82 },
    congee_noodle: { mult: 0.65, conf: 0.88 },
    dim_sum: { mult: 0.60, conf: 0.85 },
  },
  seasia: {
    congee_noodle: { mult: 1.25, conf: 0.75 },
    fruit_cold: { mult: 1.35, conf: 0.80 },
    western_hot: { mult: 0.90, conf: 0.65 },
  },
  other: {},
};

/**
 * Winnow measured waste ratio per station (waste_kg / produced_kg).
 * Used as primary feedback signal — 80% of ratio corrected into forecast.
 */
export const WINNOW_CORRECTION: Record<string, number> = {
  congee_noodle: 0.08,
  dim_sum: 0.11,
  japanese: 0.09,
  korean: 0.07,
  western_hot: 0.14,
  bakery_pastry: 0.12,
  fruit_cold: 0.06,
  taiwanese_local: 0.08,
  coffee_bar: 0.05,
};

// Cost and emissions constants
export const COST_PER_KG_NTD = 45;
export const CO2E_PER_KG_FOOD = 0.35; // generic fallback; use station-specific when available

// Reference cover count used as normalisation baseline
const REFERENCE_COVERS = 312;

// ─── Input types ──────────────────────────────────────────────────────────────

export interface PmsDaily {
  roomsSold: number;
  guestsPerRoom: number;
  suiteRatio: number;
  earlyCheckIns: number;
  totalCheckIns: number;
  occupancyPct: number;
}

export interface SegmentMix {
  /** Booking-segment weights (keys = SEGMENT_ATTACH keys), must sum to ~1 */
  [segment: string]: number;
}

export interface NationalityMix {
  /** Nationality weights (keys = NAT_PRIORS keys), must sum to ~1 */
  [nationality: string]: number;
}

export interface WeatherInput {
  tempC: number;
  condition: "sunny" | "partly_cloudy" | "overcast" | "light_rain" | "rain" | "heavy_rain" | "thunderstorm" | "fog" | "snow";
  humidity: number;
}

export interface StationConfig {
  slug: string;
  name: string;
  co2eFactorKgPerKg: number;
}

export interface HistoryRecord {
  station: string;
  waste_kg: number;
  forecasted: number;
}

// ─── Helper: weather multiplier per station ───────────────────────────────────

export function weatherMultiplier(
  stationSlug: string,
  tempC: number,
  condition: string,
  humidity: number
): number {
  const HOT_STATIONS = ["congee_noodle", "japanese", "western_hot", "korean"];
  const COLD_STATIONS = ["fruit_cold", "bakery_pastry"];

  let m = 1.0;

  if (HOT_STATIONS.includes(stationSlug)) {
    m = 1.0 + (22 - tempC) * 0.018;
  }
  if (COLD_STATIONS.includes(stationSlug)) {
    m = 1.0 + (tempC - 22) * 0.015;
  }
  if (stationSlug === "coffee_bar" && condition === "rain") m *= 1.12;
  if (stationSlug === "coffee_bar" && tempC < 18) m *= 1.08;
  if (humidity > 80 && stationSlug === "fruit_cold") m *= 1.1;

  return Math.max(0.6, Math.min(1.4, m));
}

// ─── Helper: day-of-week multiplier ──────────────────────────────────────────

export function dayOfWeekMultiplier(stationSlug: string, isWeekend: boolean): number {
  if (isWeekend) {
    if (stationSlug === "bakery_pastry") return 1.2;
    if (stationSlug === "coffee_bar") return 0.92;
  } else {
    if (stationSlug === "coffee_bar") return 1.15;
    if (stationSlug === "bakery_pastry") return 0.85;
  }
  return 1.0;
}

// ─── Helper: suite-premium multiplier ────────────────────────────────────────

export function suitePremiumMultiplier(stationSlug: string, suiteRatio: number): number {
  const SUITE_SENSITIVE = ["japanese", "dim_sum", "western_hot"];
  return SUITE_SENSITIVE.includes(stationSlug) ? 1.0 + suiteRatio * 0.5 : 1.0;
}

// ─── Helper: early-arrival lift ──────────────────────────────────────────────

export function earlyArrivalLift(earlyCheckIns: number, totalCheckIns: number): number {
  return totalCheckIns > 0 ? 1.0 + (earlyCheckIns / totalCheckIns) * 0.15 : 1.0;
}

// ─── Helper: learning correction from waste history ───────────────────────────

export function learningCorrection(
  stationSlug: string,
  history: HistoryRecord[]
): { mult: number; conf: number } {
  if (!history || history.length < 7) return { mult: 1.0, conf: 0.5 };

  const relevant = history
    .filter((w) => w.station === stationSlug)
    .slice(-14);

  if (relevant.length < 5) return { mult: 1.0, conf: 0.6 };

  const avgWasteRatio =
    relevant.reduce((s, w) => s + w.waste_kg / Math.max(w.forecasted, 1), 0) /
    relevant.length;

  let corrMult: number;
  if (avgWasteRatio > 0.15) {
    corrMult = 1.0 - (avgWasteRatio - 0.15) * 0.5;
  } else if (avgWasteRatio < 0.05) {
    corrMult = 1.0 + (0.05 - avgWasteRatio) * 0.8;
  } else {
    corrMult = 1.0;
  }

  return {
    mult: Math.max(0.75, Math.min(1.15, corrMult)),
    conf: Math.min(0.95, 0.6 + relevant.length / 28),
  };
}

// ─── Helper: wave schedule ────────────────────────────────────────────────────

export type WaveSchedule = Partial<Record<WaveLabel, number>>;

/** One row from pace_log, used for learning the wave split from actuals. */
export interface PaceEntry {
  wave_label: "wave1" | "wave2" | "wave3";
  covers_delta: number;
  service_date: string; // ISO "YYYY-MM-DD"
}

export interface WaveSplitResult {
  schedule: WaveSchedule;
  /**
   * 0.0 – 0.90 — how much of the split comes from measured history vs priors.
   * Exposed in the UI so the chef can see when the model is calibrated.
   *   <14 services → 0.0 (priors only)
   *   14–30        → linear ramp 0–0.90
   *   30+          → 0.90 (90 % historical, 10 % priors)
   */
  paceWeight: number;
}

// wave1/2/3 → position index in the ordered 3-wave schedule
const WAVE_LABEL_INDEX: Record<string, number> = { wave1: 0, wave2: 1, wave3: 2 };

/**
 * Compute the 3-wave production schedule, blending station-type priors with
 * measured pace history once ≥ 14 services have been observed.
 *
 * paceHistory is optional; when absent (cold start) priors are used exclusively.
 */
export function waveSchedule(
  stationSlug: string,
  isWeekend: boolean,
  totalKg: number,
  paceHistory?: PaceEntry[]
): WaveSplitResult {
  const isHot = ["congee_noodle", "japanese", "western_hot", "korean"].includes(stationSlug);
  const isBev = stationSlug === "coffee_bar";

  // ── Prior fractions (position 0/1/2 = wave1/2/3) ──────────────────────────
  const priorFractions: [number, number, number] = isWeekend
    ? isHot ? [0.30, 0.40, 0.30] : [0.25, 0.35, 0.40]
    : isBev  ? [0.40, 0.40, 0.20] : [0.35, 0.40, 0.25];

  // ── Wave keys in the output schedule ─────────────────────────────────────
  const waveKeys: [WaveLabel, WaveLabel, WaveLabel] = isWeekend
    ? ["open_0630", "wave_0800", "wave_0930"]
    : ["open_0630", "wave_0745", "wave_0915"];

  // ── Cold start: no history, use priors ───────────────────────────────────
  const history = paceHistory ?? [];
  const uniqueDates = new Set(history.map((e) => e.service_date));
  const nServices = uniqueDates.size;

  // weight = 0 until J14; linear ramp 0→0.90 from J14→J30; cap at 0.90
  const paceWeight = nServices < 14 ? 0 : Math.min(0.90, nServices / 30);

  if (paceWeight === 0 || history.length === 0) {
    return {
      schedule: {
        [waveKeys[0]]: Math.round(totalKg * priorFractions[0]),
        [waveKeys[1]]: Math.round(totalKg * priorFractions[1]),
        [waveKeys[2]]: Math.round(totalKg * priorFractions[2]),
      },
      paceWeight: 0,
    };
  }

  // ── Historical fractions: average per-service wave fractions ─────────────
  const perServiceFractions: number[][] = [];

  for (const d of uniqueDates) {
    const dayEntries = history.filter((e) => e.service_date === d);
    const totDelta = dayEntries.reduce((s, e) => s + e.covers_delta, 0);
    if (totDelta === 0) continue;

    const fracs = [0, 0, 0];
    for (const e of dayEntries) {
      const idx = WAVE_LABEL_INDEX[e.wave_label] ?? -1;
      if (idx >= 0) fracs[idx] += e.covers_delta / totDelta;
    }
    perServiceFractions.push(fracs);
  }

  if (perServiceFractions.length === 0) {
    return {
      schedule: {
        [waveKeys[0]]: Math.round(totalKg * priorFractions[0]),
        [waveKeys[1]]: Math.round(totalKg * priorFractions[1]),
        [waveKeys[2]]: Math.round(totalKg * priorFractions[2]),
      },
      paceWeight: 0,
    };
  }

  const histFracs = perServiceFractions.reduce(
    (acc, cur) => [acc[0] + cur[0], acc[1] + cur[1], acc[2] + cur[2]],
    [0, 0, 0]
  ).map((s) => s / perServiceFractions.length) as [number, number, number];

  // ── Blend ─────────────────────────────────────────────────────────────────
  const blended: [number, number, number] = [
    paceWeight * histFracs[0] + (1 - paceWeight) * priorFractions[0],
    paceWeight * histFracs[1] + (1 - paceWeight) * priorFractions[1],
    paceWeight * histFracs[2] + (1 - paceWeight) * priorFractions[2],
  ];

  // Normalise to avoid floating-point drift
  const total = blended[0] + blended[1] + blended[2];
  const norm = total > 0 ? blended.map((f) => f / total) as [number, number, number] : priorFractions;

  return {
    schedule: {
      [waveKeys[0]]: Math.round(totalKg * norm[0]),
      [waveKeys[1]]: Math.round(totalKg * norm[1]),
      [waveKeys[2]]: Math.round(totalKg * norm[2]),
    },
    paceWeight,
  };
}

// ─── Helper: nationality-weighted nat mult ────────────────────────────────────

function computeNatMultiplier(
  stationSlug: string,
  natMix: NationalityMix
): { natMult: number; natConf: number } {
  let natMult = 0;
  let natConf = 0;

  for (const nat in natMix) {
    const weight = natMix[nat] ?? 0;
    const prior = NAT_PRIORS[nat]?.[stationSlug];
    if (prior) {
      natMult += weight * prior.mult;
      natConf += weight * prior.conf;
    } else {
      natMult += weight * 1.0; // neutral multiplier for unknown nats
      natConf += weight * 0.5;
    }
  }

  return { natMult, natConf };
}

// ─── computeCovers ────────────────────────────────────────────────────────────

export interface ComputeCoversInput {
  pmsDaily: PmsDaily;
  segmentMix: SegmentMix;
  eventLift: number;
  weather: WeatherInput;
}

/**
 * Compute probabilistic covers (p10 / p50 / p90) from PMS + segment + event + weather inputs.
 * The p50 is the point estimate; p10/p90 are derived via confidence-based uncertainty band.
 */
export function computeCovers(input: ComputeCoversInput): CoversBand {
  const { pmsDaily, segmentMix, eventLift, weather } = input;

  // Entitled guests: rooms sold × guests-per-room × suite uplift
  const entitled =
    pmsDaily.roomsSold *
    pmsDaily.guestsPerRoom *
    (1 + (pmsDaily.suiteRatio ?? 0.12) * 0.3);

  // Segment attach rate: weighted average of booking-segment attach rates
  const segAttach = Object.entries(segmentMix).reduce((sum, [segment, weight]) => {
    return sum + weight * (SEGMENT_ATTACH[segment] ?? 0.6);
  }, 0);

  // Early arrival lift
  const earlyLift = earlyArrivalLift(pmsDaily.earlyCheckIns, pmsDaily.totalCheckIns);

  // Weather adjustment
  const weatherAdj = weather.condition === "rain" || weather.condition === "heavy_rain" || weather.condition === "thunderstorm" ? 0.97 : 1.0;

  const p50 = Math.round(entitled * segAttach * earlyLift * eventLift * weatherAdj);

  // Uncertainty band: tighter when segment data is clear, wider for unusual conditions
  const baseUncertainty = 0.12;
  const weatherUncertainty = weather.condition === "rain" || weather.condition === "heavy_rain" ? 0.04 : 0.0;
  const totalUncertainty = baseUncertainty + weatherUncertainty;

  const p10 = Math.round(p50 * (1 - totalUncertainty));
  const p90 = Math.round(p50 * (1 + totalUncertainty));

  return { p10, p50, p90 };
}

// ─── computeStationPars ───────────────────────────────────────────────────────

export interface ComputeStationParsInput {
  covers: CoversBand;
  stations: StationConfig[];
  natMix: NationalityMix;
  weather: WeatherInput;
  isWeekend: boolean;
  suiteRatio: number;
  history?: HistoryRecord[];
}

/**
 * Compute per-station preparation quantities (PAR) in kg with confidence bands.
 * Applies: nationality priors, weather adjustment, day-of-week, suite premium,
 * Winnow feedback correction, and learning correction from waste history.
 */
export function computeStationPars(input: ComputeStationParsInput): StationPar[] {
  const { covers, stations, natMix, weather, isWeekend, suiteRatio, history = [] } = input;

  const scale = covers.p50 / REFERENCE_COVERS;

  return stations.map((station) => {
    const { slug } = station;
    const basePar = BASE_PARS[slug] ?? 40;

    // Nationality-weighted multiplier
    const { natMult, natConf } = computeNatMultiplier(slug, natMix);

    // Weather multiplier
    const weaMult = weatherMultiplier(slug, weather.tempC, weather.condition, weather.humidity);

    // Day-of-week multiplier
    const dayMult = dayOfWeekMultiplier(slug, isWeekend);

    // Suite premium
    const suiteMult = suitePremiumMultiplier(slug, suiteRatio);

    // Learning correction from historical waste
    const learning = learningCorrection(slug, history);

    // Winnow correction: primary feedback signal, 80% of waste ratio corrected out
    const winnowRatio = WINNOW_CORRECTION[slug] ?? 0.1;
    const winnowMult = 1 - winnowRatio * 0.8;

    // Base demand at scaled covers
    const baseScaled = basePar * scale;
    const demand = baseScaled * natMult * weaMult * dayMult * suiteMult * winnowMult * learning.mult;
    const parKg = Math.max(1, Math.round(demand * 10) / 10);

    // Confidence drives the width of the par band
    const confidence = Math.min(0.95, natConf * 0.4 + learning.conf * 0.4 + 0.2);
    const bandWidth = 1 - confidence;

    const parKgP10 = Math.max(1, Math.round(parKg * (1 - bandWidth) * 10) / 10);
    const parKgP90 = Math.round(parKg * (1 + bandWidth) * 10) / 10;

    // Waste risk: expected leftover if we prep to p50 but demand hits p10
    const wasteRiskKg = Math.max(0, Math.round((parKg - parKgP10) * 10) / 10);

    // CO2e risk from waste (use station's specific factor)
    const co2eRiskKg = Math.round(wasteRiskKg * station.co2eFactorKgPerKg * 100) / 100;

    // Wave schedule: distribute total par across service waves
    const { schedule: waves } = waveSchedule(slug, isWeekend, parKg);
    const waveEntries = Object.entries(waves) as [WaveLabel, number][];

    // Return one StationPar per wave that has a non-zero allocation
    // (caller merges into an array; we return the dominant wave for the summary par,
    //  and expose all waves via the waveSchedule utility if needed)
    const dominantWave: WaveLabel = waveEntries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "open_0630";

    return {
      stationSlug: slug,
      stationName: station.name,
      waveLabel: dominantWave,
      parKg,
      parKgP10,
      parKgP90,
      wasteRiskKg,
      co2eRiskKg,
      co2eFactorKgPerKg: station.co2eFactorKgPerKg,
    };
  });
}

// ─── computeStationParsAllWaves ───────────────────────────────────────────────

/**
 * Expanded version that returns one StationPar row per (station × wave) combination.
 * Suitable for writing to the station_pars table.
 */
export function computeStationParsAllWaves(input: ComputeStationParsInput): StationPar[] {
  const { covers, stations, natMix, weather, isWeekend, suiteRatio, history = [] } = input;
  const scale = covers.p50 / REFERENCE_COVERS;
  const rows: StationPar[] = [];

  for (const station of stations) {
    const { slug } = station;
    const basePar = BASE_PARS[slug] ?? 40;

    const { natMult, natConf } = computeNatMultiplier(slug, natMix);
    const weaMult = weatherMultiplier(slug, weather.tempC, weather.condition, weather.humidity);
    const dayMult = dayOfWeekMultiplier(slug, isWeekend);
    const suiteMult = suitePremiumMultiplier(slug, suiteRatio);
    const learning = learningCorrection(slug, history);
    const winnowRatio = WINNOW_CORRECTION[slug] ?? 0.1;
    const winnowMult = 1 - winnowRatio * 0.8;

    const baseScaled = basePar * scale;
    const demand = baseScaled * natMult * weaMult * dayMult * suiteMult * winnowMult * learning.mult;
    const totalParKg = Math.max(1, Math.round(demand * 10) / 10);

    const confidence = Math.min(0.95, natConf * 0.4 + learning.conf * 0.4 + 0.2);
    const bandWidth = 1 - confidence;

    const { schedule: waves } = waveSchedule(slug, isWeekend, totalParKg);

    for (const [waveLabel, waveKg] of Object.entries(waves) as [WaveLabel, number][]) {
      if (waveKg <= 0) continue;

      const parKgP10 = Math.max(0.1, Math.round(waveKg * (1 - bandWidth) * 10) / 10);
      const parKgP90 = Math.round(waveKg * (1 + bandWidth) * 10) / 10;
      const wasteRiskKg = Math.max(0, Math.round((waveKg - parKgP10) * 10) / 10);
      const co2eRiskKg = Math.round(wasteRiskKg * station.co2eFactorKgPerKg * 100) / 100;

      rows.push({
        stationSlug: slug,
        stationName: station.name,
        waveLabel,
        parKg: waveKg,
        parKgP10,
        parKgP90,
        wasteRiskKg,
        co2eRiskKg,
        co2eFactorKgPerKg: station.co2eFactorKgPerKg,
      });
    }
  }

  return rows;
}

// ─── Full briefing (convenience wrapper) ─────────────────────────────────────

export interface BriefingInput {
  pmsDaily: PmsDaily;
  segmentMix: SegmentMix;
  natMix: NationalityMix;
  weather: WeatherInput;
  events: string[];
  isWeekend: boolean;
  stations: StationConfig[];
  history?: HistoryRecord[];
}

export interface BriefingOutput {
  covers: CoversBand;
  scale: number;
  stationPars: StationPar[];
  allWavePars: StationPar[];
  totalWasteRiskKg: number;
  totalCo2eRiskKg: number;
  cooks: number;
  servers: number;
  openTime: string;
  peakTime: string;
}

export function computeEventLift(events: string[]): number {
  const EVENT_IMPACT: Record<string, number> = {
    taipei101_corporate: 0.05,
    computex_week: 0.12,
    cny_golden_week: 0.08,
    japan_golden_week: 0.06,
    taiwan_holiday: 0.03,
  };

  if (!events || events.length === 0) return 1.0;
  return events.reduce((m, e) => m * (1 + (EVENT_IMPACT[e] ?? 0)), 1.0);
}

export function computeBriefingV3(input: BriefingInput): BriefingOutput {
  const { pmsDaily, segmentMix, natMix, weather, events, isWeekend, stations, history = [] } = input;

  const eventLift = computeEventLift(events);

  const covers = computeCovers({
    pmsDaily,
    segmentMix,
    eventLift,
    weather,
  });

  const stationPars = computeStationPars({
    covers,
    stations,
    natMix,
    weather,
    isWeekend,
    suiteRatio: pmsDaily.suiteRatio,
    history,
  });

  const allWavePars = computeStationParsAllWaves({
    covers,
    stations,
    natMix,
    weather,
    isWeekend,
    suiteRatio: pmsDaily.suiteRatio,
    history,
  });

  const totalWasteRiskKg = stationPars.reduce((s, p) => s + p.wasteRiskKg, 0);
  const totalCo2eRiskKg = Math.round(stationPars.reduce((s, p) => s + p.co2eRiskKg, 0) * 100) / 100;

  const scale = covers.p50 / REFERENCE_COVERS;

  return {
    covers,
    scale,
    stationPars,
    allWavePars,
    totalWasteRiskKg: Math.round(totalWasteRiskKg * 10) / 10,
    totalCo2eRiskKg,
    cooks: Math.max(2, Math.round(covers.p50 / 50)),
    servers: Math.max(2, Math.round(covers.p50 / (isWeekend ? 16 : 20))),
    openTime: "06:30",
    peakTime: isWeekend ? "08:30–10:00" : "07:00–08:30",
  };
}
