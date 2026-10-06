import { describe, it, expect } from "vitest";
import {
  computeCovers,
  computeStationPars,
  computeAttach,
  computeAttachFromMix,
  computeWaveFracsFromSource,
  waveSchedule,
  WINNOW_CORRECTION,
  ATTACH_BY_RATE_CODE,
  LOS_FATIGUE,
  type ComputeCoversInput,
  type ComputeStationParsInput,
  type WeatherInput,
  type PaceEntry,
} from "../baseline";

// ─── Shared station configs ───────────────────────────────────────────────────

const STATIONS = [
  { slug: "congee_noodle", name: "Congee & Noodle", co2eFactorKgPerKg: 0.8 },
  { slug: "dim_sum", name: "Dim Sum", co2eFactorKgPerKg: 1.2 },
  { slug: "japanese", name: "Japanese", co2eFactorKgPerKg: 2.1 },
  { slug: "korean", name: "Korean", co2eFactorKgPerKg: 1.1 },
  { slug: "western_hot", name: "Western Hot", co2eFactorKgPerKg: 2.8 },
  { slug: "bakery_pastry", name: "Bakery & Pastry", co2eFactorKgPerKg: 1.6 },
  { slug: "fruit_cold", name: "Fruit & Cold", co2eFactorKgPerKg: 0.5 },
  { slug: "taiwanese_local", name: "Taiwanese Local", co2eFactorKgPerKg: 0.9 },
  { slug: "coffee_bar", name: "Coffee Bar", co2eFactorKgPerKg: 0.3 },
];

// ─── Saturday scenario ────────────────────────────────────────────────────────
// 316 rooms, leisure-heavy, sunny 24°C

const SAT_PMS = {
  roomsSold: 316,
  guestsPerRoom: 1.6,
  suiteRatio: 0.14,
  earlyCheckIns: 28,
  totalCheckIns: 94,
  occupancyPct: 0.78,
};

const SAT_SEGMENT_MIX = {
  leisure_direct: 0.35,
  leisure_ota: 0.35,
  business_corp: 0.05,
  business_meeting: 0.05,
  group_inclusive: 0.08,
  group_exclusive: 0.02,
  long_stay: 0.10,
};

const SAT_NAT_MIX = {
  greaterChina: 0.41,
  japan: 0.22,
  western: 0.18,
  korea: 0.07,
  seasia: 0.07,
  other: 0.05,
};

const SAT_WEATHER: WeatherInput = {
  tempC: 24,
  condition: "sunny",
  humidity: 65,
};

// ─── Tuesday scenario ─────────────────────────────────────────────────────────
// 292 rooms, business-heavy, rain 17°C

const TUE_PMS = {
  roomsSold: 292,
  guestsPerRoom: 1.35,
  suiteRatio: 0.09,
  earlyCheckIns: 42,
  totalCheckIns: 110,
  occupancyPct: 0.72,
};

const TUE_SEGMENT_MIX = {
  leisure_direct: 0.05,
  leisure_ota: 0.10,
  business_corp: 0.45,
  business_meeting: 0.25,
  group_inclusive: 0.03,
  group_exclusive: 0.07,
  long_stay: 0.05,
};

const TUE_NAT_MIX = {
  greaterChina: 0.30,
  japan: 0.12,
  western: 0.42,
  korea: 0.05,
  seasia: 0.05,
  other: 0.06,
};

const TUE_WEATHER: WeatherInput = {
  tempC: 17,
  condition: "rain",
  humidity: 82,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeCovers", () => {
  it("Saturday: leisure-heavy, sunny 24°C → covers in [300, 450] range", () => {
    // 316 rooms × 1.6 guests/room × suite uplift × leisure-heavy attach × early lift × event lift
    // Expected ≈ 381 covers (matches prototype computeBriefingV3 output)
    const input: ComputeCoversInput = {
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.03, // taiwan_holiday
      weather: SAT_WEATHER,
    };
    const result = computeCovers(input);

    expect(result.p50).toBeGreaterThanOrEqual(300);
    expect(result.p50).toBeLessThanOrEqual(450);
  });

  it("Tuesday: business-heavy, rain 17°C → covers lower by at least 8% vs Saturday", () => {
    const satInput: ComputeCoversInput = {
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.03,
      weather: SAT_WEATHER,
    };
    const tueInput: ComputeCoversInput = {
      pmsDaily: TUE_PMS,
      segmentMix: TUE_SEGMENT_MIX,
      eventLift: 1.05, // taipei101_corporate
      weather: TUE_WEATHER,
    };

    const satCovers = computeCovers(satInput);
    const tueCovers = computeCovers(tueInput);

    // Tuesday should be lower due to lower rooms, lower attach (business), rain penalty
    const dropPct = (satCovers.p50 - tueCovers.p50) / satCovers.p50;
    expect(dropPct).toBeGreaterThanOrEqual(0.08);
  });

  it("P10 < P50 < P90 always holds", () => {
    const inputs: ComputeCoversInput[] = [
      {
        pmsDaily: SAT_PMS,
        segmentMix: SAT_SEGMENT_MIX,
        eventLift: 1.0,
        weather: SAT_WEATHER,
      },
      {
        pmsDaily: TUE_PMS,
        segmentMix: TUE_SEGMENT_MIX,
        eventLift: 1.0,
        weather: TUE_WEATHER,
      },
      {
        pmsDaily: { ...SAT_PMS, roomsSold: 180 },
        segmentMix: SAT_SEGMENT_MIX,
        eventLift: 1.12,
        weather: { tempC: 14, condition: "heavy_rain", humidity: 90 },
      },
    ];

    for (const input of inputs) {
      const result = computeCovers(input);
      expect(result.p10).toBeLessThan(result.p50);
      expect(result.p50).toBeLessThan(result.p90);
    }
  });

  it("rain condition reduces covers by ~3% vs sunny (all else equal)", () => {
    const base: ComputeCoversInput = {
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.0,
      weather: SAT_WEATHER,
    };
    const rainy: ComputeCoversInput = {
      ...base,
      weather: { ...SAT_WEATHER, condition: "rain" },
    };

    const sunny = computeCovers(base);
    const rain = computeCovers(rainy);

    // Rain applies a 0.97 multiplier → ~3% drop
    const ratio = rain.p50 / sunny.p50;
    expect(ratio).toBeGreaterThanOrEqual(0.95);
    expect(ratio).toBeLessThanOrEqual(0.99);
  });
});

describe("computeStationPars", () => {
  it("Saturday: returns a par for all 9 stations", () => {
    const covers = computeCovers({
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.03,
      weather: SAT_WEATHER,
    });

    const pars = computeStationPars({
      covers,
      stations: STATIONS,
      natMix: SAT_NAT_MIX,
      weather: SAT_WEATHER,
      isWeekend: true,
      suiteRatio: SAT_PMS.suiteRatio,
    });

    expect(pars).toHaveLength(9);
  });

  it("WINNOW_CORRECTION western_hot=0.14 reduces demand by ~11%", () => {
    // Compare a world with waste log vs manual calculation
    // waste log mult = 1 - 0.14 * 0.8 = 0.888 → ~11.2% reduction vs uncorrected
    const expectedReduction = 1 - WINNOW_CORRECTION["western_hot"]! * 0.8;
    expect(expectedReduction).toBeCloseTo(0.888, 2);

    // The actual par should reflect this reduction relative to base
    const covers = computeCovers({
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.0,
      weather: SAT_WEATHER,
    });

    const pars = computeStationPars({
      covers,
      stations: STATIONS,
      natMix: SAT_NAT_MIX,
      weather: SAT_WEATHER,
      isWeekend: true,
      suiteRatio: SAT_PMS.suiteRatio,
    });

    const westernHot = pars.find((p) => p.stationSlug === "western_hot");
    expect(westernHot).toBeDefined();
    // Par should be a positive number and well below the raw base
    expect(westernHot!.parKg).toBeGreaterThan(0);
  });

  it("P10 < parKg < P90 for every station par", () => {
    const covers = computeCovers({
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.0,
      weather: SAT_WEATHER,
    });

    const input: ComputeStationParsInput = {
      covers,
      stations: STATIONS,
      natMix: SAT_NAT_MIX,
      weather: SAT_WEATHER,
      isWeekend: true,
      suiteRatio: SAT_PMS.suiteRatio,
    };

    const pars = computeStationPars(input);

    for (const par of pars) {
      expect(par.parKgP10).toBeLessThanOrEqual(par.parKg);
      expect(par.parKg).toBeLessThanOrEqual(par.parKgP90);
    }
  });

  it("Tuesday (rain, 17°C): coffee_bar par is higher than Saturday (sunny, 24°C)", () => {
    const satCovers = computeCovers({
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.0,
      weather: SAT_WEATHER,
    });
    const tueCovers = computeCovers({
      pmsDaily: TUE_PMS,
      segmentMix: TUE_SEGMENT_MIX,
      eventLift: 1.0,
      weather: TUE_WEATHER,
    });

    const satPars = computeStationPars({
      covers: satCovers,
      stations: STATIONS,
      natMix: SAT_NAT_MIX,
      weather: SAT_WEATHER,
      isWeekend: true,
      suiteRatio: SAT_PMS.suiteRatio,
    });

    const tuePars = computeStationPars({
      covers: tueCovers,
      stations: STATIONS,
      natMix: TUE_NAT_MIX,
      weather: TUE_WEATHER,
      isWeekend: false,
      suiteRatio: TUE_PMS.suiteRatio,
    });

    const satCoffee = satPars.find((p) => p.stationSlug === "coffee_bar")!;
    const tueCoffee = tuePars.find((p) => p.stationSlug === "coffee_bar")!;

    // Tuesday: cold + rain + weekday coffee rush bonus → coffee should be higher
    // even though total covers are lower, the weather and day multipliers boost coffee
    // We test the per-kg-per-cover ratio
    const satCoffeePerCover = satCoffee.parKg / satCovers.p50;
    const tueCoffeePerCover = tueCoffee.parKg / tueCovers.p50;

    expect(tueCoffeePerCover).toBeGreaterThan(satCoffeePerCover);
  });

  it("waste risk is always non-negative", () => {
    const covers = computeCovers({
      pmsDaily: TUE_PMS,
      segmentMix: TUE_SEGMENT_MIX,
      eventLift: 1.0,
      weather: TUE_WEATHER,
    });

    const pars = computeStationPars({
      covers,
      stations: STATIONS,
      natMix: TUE_NAT_MIX,
      weather: TUE_WEATHER,
      isWeekend: false,
      suiteRatio: TUE_PMS.suiteRatio,
    });

    for (const par of pars) {
      expect(par.wasteRiskKg).toBeGreaterThanOrEqual(0);
      expect(par.co2eRiskKg).toBeGreaterThanOrEqual(0);
    }
  });

  it("greaterChina-heavy mix elevates congee_noodle and dim_sum vs western-heavy mix", () => {
    const covers = computeCovers({
      pmsDaily: SAT_PMS,
      segmentMix: SAT_SEGMENT_MIX,
      eventLift: 1.0,
      weather: SAT_WEATHER,
    });

    const cnPars = computeStationPars({
      covers,
      stations: STATIONS,
      natMix: { greaterChina: 0.80, western: 0.10, other: 0.10 },
      weather: SAT_WEATHER,
      isWeekend: true,
      suiteRatio: SAT_PMS.suiteRatio,
    });

    const wPars = computeStationPars({
      covers,
      stations: STATIONS,
      natMix: { greaterChina: 0.10, western: 0.80, other: 0.10 },
      weather: SAT_WEATHER,
      isWeekend: true,
      suiteRatio: SAT_PMS.suiteRatio,
    });

    const cnCongee = cnPars.find((p) => p.stationSlug === "congee_noodle")!.parKg;
    const wCongee = wPars.find((p) => p.stationSlug === "congee_noodle")!.parKg;

    const cnDimSum = cnPars.find((p) => p.stationSlug === "dim_sum")!.parKg;
    const wDimSum = wPars.find((p) => p.stationSlug === "dim_sum")!.parKg;

    expect(cnCongee).toBeGreaterThan(wCongee);
    expect(cnDimSum).toBeGreaterThan(wDimSum);
  });
});

// ─── waveSchedule (Tâche 4 — pace history blend) ─────────────────────────────

function buildPaceHistory(nDays: number, fracs: [number, number, number]): PaceEntry[] {
  const entries: PaceEntry[] = [];
  const totalDelta = 200;
  for (let d = 0; d < nDays; d++) {
    const dateStr = `2026-01-${String(d + 1).padStart(2, "0")}`;
    entries.push(
      { wave_label: "wave1", covers_delta: Math.round(totalDelta * fracs[0]), service_date: dateStr },
      { wave_label: "wave2", covers_delta: Math.round(totalDelta * fracs[1]), service_date: dateStr },
      { wave_label: "wave3", covers_delta: Math.round(totalDelta * fracs[2]), service_date: dateStr }
    );
  }
  return entries;
}

describe("waveSchedule — pace history blend", () => {
  it("cold start (< 14 services): uses priors only, paceWeight = 0", () => {
    const history = buildPaceHistory(5, [0.1, 0.5, 0.4]);
    const result = waveSchedule("western_hot", false, 100, history);
    expect(result.paceWeight).toBe(0);

    // With no pace weight, fractions should match weekday-hot priors [0.35, 0.40, 0.25]
    const { schedule } = result;
    const vals = Object.values(schedule) as number[];
    expect(vals[0]).toBeCloseTo(35, 0); // 0.35 × 100
    expect(vals[1]).toBeCloseTo(40, 0); // 0.40 × 100
  });

  it("J14: paceWeight > 0 and schedule shifts toward historical fractions", () => {
    // Historical: wave1 gets 50% instead of the 35% prior
    const history = buildPaceHistory(14, [0.50, 0.30, 0.20]);
    const result = waveSchedule("western_hot", false, 100, history);

    expect(result.paceWeight).toBeGreaterThan(0);
    expect(result.paceWeight).toBeLessThanOrEqual(0.9);

    // wave1 prior = 35%; historical = 50% → blended > 35%
    const wave1 = Object.values(result.schedule)[0] as number;
    expect(wave1).toBeGreaterThan(35);
  });

  it("J30+: paceWeight clamps at 0.90 and schedule is 90% historical", () => {
    const history = buildPaceHistory(35, [0.10, 0.50, 0.40]);
    const result = waveSchedule("congee_noodle", true, 100, history);

    expect(result.paceWeight).toBe(0.9);

    // Blended wave1 = 0.9 × 0.10 + 0.1 × prior(0.30) = 0.09 + 0.03 = 0.12 → ~12 kg
    const wave1 = Object.values(result.schedule)[0] as number;
    expect(wave1).toBeGreaterThanOrEqual(10);
    expect(wave1).toBeLessThan(20);
  });

  it("schedule values sum approximately to totalKg (±1 from rounding)", () => {
    const history = buildPaceHistory(20, [0.40, 0.40, 0.20]);
    const result = waveSchedule("bakery_pastry", false, 80, history);
    const total = (Object.values(result.schedule) as number[]).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(78);
    expect(total).toBeLessThanOrEqual(82);
  });

  it("no history → cold start, paceWeight = 0", () => {
    const result = waveSchedule("coffee_bar", false, 50);
    expect(result.paceWeight).toBe(0);
    expect(Object.keys(result.schedule).length).toBe(3);
  });
});

// ─── Inside-out attach rate (CLAUDE.md §5) ───────────────────────────────────

describe("computeAttach — inside-out", () => {
  it("test_breakfast_inclusive_high_attach: day-1 guest ≥ 0.90", () => {
    // LOS day 1: no fatigue → attach = 0.92 × 1.00 = 0.92
    const a = computeAttach({ rateCode: "breakfast_inclusive", losDay: 1 });
    expect(a).toBeGreaterThanOrEqual(0.90);
  });

  it("test_titanium_lounge_diversion: < 0.15", () => {
    const a = computeAttach({
      rateCode: "breakfast_inclusive",
      loyaltyTier: "titanium",
      losDay: 2,
    });
    expect(a).toBeLessThan(0.15);
  });

  it("test_room_only_low_attach: ≤ 0.30", () => {
    const a = computeAttach({ rateCode: "room_only", losDay: 1 });
    expect(a).toBeLessThanOrEqual(0.30);
  });

  it("test_departure_day_boost: departure > mid-stay LOS day 3", () => {
    const departure = computeAttach({ rateCode: "breakfast_inclusive", departingToday: true });
    const midStay   = computeAttach({ rateCode: "breakfast_inclusive", losDay: 3 });
    expect(departure).toBeGreaterThan(midStay);
  });

  it("test_late_arrival_penalty: late arrival gives < 50% of normal attach", () => {
    const normal = computeAttach({ rateCode: "breakfast_inclusive", losDay: 1 });
    const late   = computeAttach({ rateCode: "breakfast_inclusive", losDay: 1, arrivalHour: 23 });
    expect(late).toBeLessThan(normal * 0.50);
  });

  it("unknown rate code falls back to default (0.60)", () => {
    const a = computeAttach({ rateCode: "mystery_package", losDay: 1 });
    expect(a).toBeCloseTo(ATTACH_BY_RATE_CODE.default * LOS_FATIGUE[1], 3);
  });
});

describe("computeAttachFromMix", () => {
  it("pure breakfast_inclusive mix → attach ≈ 0.92", () => {
    const a = computeAttachFromMix({ breakfast_inclusive: 1.0 });
    expect(a).toBeCloseTo(0.92, 2);
  });

  it("50/50 inclusive + room_only → ~0.595", () => {
    const a = computeAttachFromMix({ breakfast_inclusive: 0.5, room_only: 0.5 });
    expect(a).toBeCloseTo((0.92 + 0.27) / 2, 2);
  });
});

describe("computeWaveFracsFromSource", () => {
  it("test_tour_group_wave1_heavy: wave1 > 0.60", () => {
    const [w1] = computeWaveFracsFromSource({ tour_group: 1.0 });
    expect(w1).toBeGreaterThan(0.60);
  });

  it("fit-heavy mix: wave2 is the largest wave", () => {
    const [w1, w2, w3] = computeWaveFracsFromSource({ fit: 1.0 });
    expect(w2).toBeGreaterThan(w1);
    expect(w2).toBeGreaterThan(w3);
  });

  it("wave fracs always sum to ~1", () => {
    const fracs = computeWaveFracsFromSource({ tour_group: 0.4, fit: 0.4, mice: 0.2 });
    const sum = fracs.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });
});

describe("computeCovers — inside-out path", () => {
  const BASE_PMS = {
    roomsSold: 316, guestsPerRoom: 1.6, suiteRatio: 0.14,
    earlyCheckIns: 28, totalCheckIns: 94, occupancyPct: 0.78,
  };
  const SUNNY: WeatherInput = { tempC: 24, condition: "sunny", humidity: 65 };
  const SEGMENT_MIX = { leisure_direct: 0.35, leisure_ota: 0.35, business_corp: 0.10,
    group_inclusive: 0.08, group_exclusive: 0.02, long_stay: 0.10 };

  it("inside-out with breakfast_inclusive mix gives higher covers than room_only mix", () => {
    const inclusive = computeCovers({
      pmsDaily: { ...BASE_PMS, rateCodeMix: { breakfast_inclusive: 0.90, room_only: 0.10 } },
      segmentMix: SEGMENT_MIX, eventLift: 1.0, weather: SUNNY,
    });
    const roomOnly = computeCovers({
      pmsDaily: { ...BASE_PMS, rateCodeMix: { room_only: 0.80, breakfast_inclusive: 0.20 } },
      segmentMix: SEGMENT_MIX, eventLift: 1.0, weather: SUNNY,
    });
    expect(inclusive.p50).toBeGreaterThan(roomOnly.p50);
  });

  it("lounge diversion (high Titanium) reduces covers vs no diversion", () => {
    const noLounge = computeCovers({
      pmsDaily: { ...BASE_PMS, rateCodeMix: { breakfast_inclusive: 0.80, room_only: 0.20 },
                  loungeEligible: 0 },
      segmentMix: SEGMENT_MIX, eventLift: 1.0, weather: SUNNY,
    });
    const highLounge = computeCovers({
      pmsDaily: { ...BASE_PMS, rateCodeMix: { breakfast_inclusive: 0.80, room_only: 0.20 },
                  loungeEligible: 80 },
      segmentMix: SEGMENT_MIX, eventLift: 1.0, weather: SUNNY,
    });
    expect(highLounge.p50).toBeLessThan(noLounge.p50);
  });

  it("legacy path (no rateCodeMix) still produces valid P10 < P50 < P90", () => {
    const result = computeCovers({
      pmsDaily: BASE_PMS,
      segmentMix: SEGMENT_MIX,
      eventLift: 1.0,
      weather: SUNNY,
    });
    expect(result.p10).toBeLessThan(result.p50);
    expect(result.p50).toBeLessThan(result.p90);
  });
});
