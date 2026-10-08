/**
 * The product rules, as tests. Every rule in CLAUDE.md has a line here.
 */
import { describe, expect, it } from "vitest";
import { ATTACH_BY_RATE_CODE, computeAttach, forecastBreakfast, forecastBanquet, waveSplitFromSources } from "@/lib/engine/forecast";
import { computeDebrief, splitSaving } from "@/lib/engine/debrief";
import { buildDecisions, buildStationPlan } from "@/lib/engine/plan";
import { computeDemand, suggestRoster } from "@/lib/engine/staffing";
import { gradeFromScore, computeNightly } from "@/lib/engine/nightly";
import { parseChineseNumber, parseVoice } from "@/lib/engine/voice";
import { replayOutlet, WARMUP_DAYS, type ReplayDay } from "@/lib/engine/backtest";
import { coverCheck, expectedSeatedAt, runningFast, wasteFill } from "./helpers";
import type { OutletCfg, PmsSignals, PropertyCfg, StationCfg } from "@/lib/engine/types";

const station = (over: Partial<StationCfg>): StationCfg => ({ id: "s1", name: "Western hot", slug: "western_hot", kind: "buffet", foodCategory: "meat", unit: "portions", basePar: 70, usualCovers: 190, costPerUnit: 1.6, kgPerUnit: 0.22, highValue: false, nationalityPriors: { western: { mult: 1.65, conf: 0.93 }, greater_china: { mult: 0.75, conf: 0.85 } }, dowProfile: {}, weatherProfile: {}, settings: {}, sortOrder: 1, ...over });
const outlet = (over: Partial<OutletCfg> = {}): OutletCfg => ({ id: "o1", name: "Breakfast", slug: "breakfast", type: "breakfast", opensAt: "06:30", closesAt: "10:30", capacity: 180, settings: { usual_covers: 190 }, waves: [{ id: "w1", label: "Open", startsAt: "06:30", shareDefault: 0.3, sortOrder: 1 }, { id: "w2", label: "08:00", startsAt: "08:00", shareDefault: 0.42, sortOrder: 2 }, { id: "w3", label: "09:30", startsAt: "09:30", shareDefault: 0.28, sortOrder: 3 }], stations: [station({}), station({ id: "s2", name: "Congee", slug: "congee", foodCategory: "rice_noodles", basePar: 60, nationalityPriors: { greater_china: { mult: 1.55, conf: 0.92 }, western: { mult: 0.65, conf: 0.88 } } }), station({ id: "s3", name: "Bakery", slug: "bakery", foodCategory: "bread_pastry", basePar: 110, nationalityPriors: {} })], ...over });
const pms = (over: Partial<PmsSignals> = {}): PmsSignals => ({ serviceDate: "2026-10-10", roomsOccupied: 178, roomsTotal: 196, guestsInHouse: 288, arrivals: 40, departures: 38, departuresAm: 23, lateArrivalsPrev: 2, earlyCheckins: 3, loungeEligible: 11, vipArrivals: 4, suitesOccupied: 22, rateCodeMix: { breakfast_inclusive: 0.58, room_only: 0.22, package: 0.12, default: 0.08 }, loyaltyTierMix: { member: 0.5, gold: 0.2, titanium: 0.04 }, travelSourceMix: { fit: 0.52, tour_group: 0.26, mice: 0.12, other: 0.1 }, nationalityMix: { greater_china: 0.34, western: 0.36, japan: 0.12, korea: 0.08, other: 0.1 }, losDistribution: { day1: 0.22, day2_4: 0.52, day5plus: 0.26 }, groupManifest: [{ name: "Group of 38", size: 38, arrival: "19:00", breakfast: true, source: "tour_group" }], ...over });
const property = (over: Partial<PropertyCfg["settings"]> = {}): PropertyCfg => ({ id: "p1", name: "Harbour Hotel", keys: 196, timezone: "Asia/Hong_Kong", currency: "USD", settings: { food_cost_per_cover: 6.9, waste_baseline_g_cover: 110, winnow: false, ...over } });

describe("attach rate is segmented, never flat", () => {
  it("breakfast-inclusive attaches above 0.90", () => expect(computeAttach({ rateCode: "breakfast_inclusive", losKey: "day1" })).toBeGreaterThanOrEqual(0.9));
  it("titanium guests are diverted to the lounge (< 0.15)", () => expect(computeAttach({ rateCode: "breakfast_inclusive", loyaltyTier: "titanium", losKey: "day1" })).toBeLessThan(0.15));
  it("room-only attaches at 0.30 or less", () => expect(computeAttach({ rateCode: "room_only", losKey: "day1" })).toBeLessThanOrEqual(0.3));
  it("departure day beats mid-stay", () => expect(computeAttach({ rateCode: "default", losKey: "departure" })).toBeGreaterThan(computeAttach({ rateCode: "default", losKey: "day2_4" })));
  it("late arrivals attach below half the normal rate", () => expect(computeAttach({ rateCode: "default", arrivalHour: 23 })).toBeLessThan(computeAttach({ rateCode: "default", arrivalHour: 15 }) * 0.5));
  it("the table never contains a flat 0.65", () => expect(Object.values(ATTACH_BY_RATE_CODE)).not.toContain(0.65));
});

describe("waves follow the travel source", () => {
  it("a tour group eats in wave 1 (> 0.60)", () => {
    const w = waveSplitFromSources({ tour_group: 1 }, 0, outlet().waves);
    expect(w.find((x) => x.label === "Open")!.share).toBeGreaterThan(0.6);
  });
  it("shares sum to one", () => {
    const w = waveSplitFromSources({ fit: 0.5, mice: 0.3, other: 0.2 }, 0.13, outlet().waves);
    expect(w.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5);
  });
});

describe("the breakfast forecast reads the house", () => {
  it("counts the group, the lounge and the late arrivals, with a band", () => {
    const f = forecastBreakfast({ outlet: outlet(), pms: pms(), weather: null, events: [], history: [] });
    expect(f.p50).toBeGreaterThan(150);
    expect(f.p10).toBeLessThan(f.p50);
    expect(f.p90).toBeGreaterThan(f.p50);
    expect(f.drivers.some((d) => /Group of 38/.test(d.label))).toBe(true);
    expect(f.drivers.some((d) => /lounge/.test(d.label))).toBe(true);
    expect(f.waveSplit.reduce((s, w) => s + w.covers, 0)).toBe(f.p50);
  });
  it("more breakfast-inclusive rooms means more covers", () => {
    const low = forecastBreakfast({ outlet: outlet(), pms: pms({ rateCodeMix: { room_only: 0.7, default: 0.3 } }), weather: null, events: [], history: [] });
    const high = forecastBreakfast({ outlet: outlet(), pms: pms({ rateCodeMix: { breakfast_inclusive: 0.9, default: 0.1 } }), weather: null, events: [], history: [] });
    expect(high.p50).toBeGreaterThan(low.p50 * 1.5);
  });
});

describe("the plan and the three decisions", () => {
  it("stations follow the nationality mix; a trim and a boost are proposed", () => {
    const o = outlet();
    const f = forecastBreakfast({ outlet: o, pms: pms({ nationalityMix: { greater_china: 0.8, western: 0.1, other: 0.1 } }), weather: null, events: [], history: [] });
    const plan = buildStationPlan({ outlet: o, forecast: f, serviceDate: "2026-10-10", pms: pms({ nationalityMix: { greater_china: 0.8, western: 0.1, other: 0.1 } }), weather: null, corrections: [], history: [] });
    const western = plan.totals.find((t) => t.name === "Western hot")!;
    const congee = plan.totals.find((t) => t.name === "Congee")!;
    expect(congee.deltaPct).toBeGreaterThan(western.deltaPct);
    const decisions = buildDecisions({ outlet: o, plan, forecast: f, property: property(), history: [], pms: pms() });
    expect(decisions.length).toBeLessThanOrEqual(3);
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) expect(["trim", "boost", "hold"]).toContain(d.kind);
    for (const d of decisions.filter((x) => x.kind === "boost")) expect(d.estSaving).toBe(0);
  });
  it("a correction entered by the team pulls the next par", () => {
    const o = outlet();
    const f = forecastBreakfast({ outlet: o, pms: pms(), weather: null, events: [], history: [] });
    const base = buildStationPlan({ outlet: o, forecast: f, serviceDate: "2026-10-10", pms: pms(), weather: null, corrections: [], history: [] });
    const corrected = buildStationPlan({ outlet: o, forecast: f, serviceDate: "2026-10-10", pms: pms(), weather: null, corrections: [{ stationId: "s1", factor: 0.8, serviceDate: "2026-10-09" }], history: [] });
    expect(corrected.totals[0].qty).toBeLessThan(base.totals[0].qty);
  });
  it("banquets cook to the final count, never the booking", () => {
    const o = outlet({ type: "banquet", waves: [{ id: "w", label: "Service", startsAt: "19:00", shareDefault: 1, sortOrder: 1 }], settings: { buffer_pct: 0.03 } });
    const f = forecastBanquet({ outlet: o, banquets: [{ id: "b", name: "Saturday dinner", venue: "Ballroom", bookedCount: 120, confirmedCount: 112, diets: { vegan: 12 }, courses: [], serveFrom: "17:30" }] });
    expect(f.cookCount).toBe(116);
    expect(f.cookCount).toBeLessThan(120);
  });
  it("a banquet confirmed above its booking still yields p10 ≤ p50 ≤ p90", () => {
    const o = outlet({ type: "banquet", waves: [{ id: "w", label: "Service", startsAt: "19:00", shareDefault: 1, sortOrder: 1 }], settings: { buffer_pct: 0.03 } });
    const f = forecastBanquet({ outlet: o, banquets: [{ id: "b", name: "Gala", venue: "Ballroom", bookedCount: 100, confirmedCount: 104, diets: {}, courses: [], serveFrom: "19:00" }] });
    expect(f.p10).toBeLessThanOrEqual(f.p50);
    expect(f.p50).toBeLessThanOrEqual(f.p90);
  });
  it("a PMS row without a rate-code mix is flagged as a flat attach, never silently", () => {
    const f = forecastBreakfast({ outlet: outlet(), pms: pms({ rateCodeMix: {} }), weather: null, events: [], history: [] });
    expect(f.drivers.some((d) => /no rate-code mix/i.test(d.label))).toBe(true);
  });
});

describe("savings and ESG", () => {
  it("serviceflow + bin scale never exceeds the total, 3 of 4 points with a scale", () => {
    const s = splitSaving(100, property({ winnow: true }));
    expect(s.serviceflow + s.binScale).toBeLessThanOrEqual(s.total + 0.01);
    expect(s.serviceflow).toBeCloseTo(75, 1);
    const n = splitSaving(100, property({ winnow: false }));
    expect(n.binScale).toBe(0);
    expect(n.serviceflow).toBe(100);
  });
  it("a mis-set share in Set-up can never claim more than the whole", () => {
    const s = splitSaving(100, property({ winnow: true, saving_points_total: 2, saving_points_serviceflow: 3 }));
    expect(s.serviceflow).toBeLessThanOrEqual(s.total);
    expect(s.binScale).toBeGreaterThanOrEqual(0);
    expect(s.serviceflow + s.binScale).toBeCloseTo(s.total, 2);
  });
  it("a day over the baseline is a negative saving, not zero", () => {
    const d = computeDebrief({ property: property(), outletStations: outlet().stations, forecast: null, actualCovers: 200, waste: [{ stationId: "s1", kg: 30, co2eKg: 30 * 27 }], trailingBaselineGPerCover: null, foodCostPerCover: 6.9, planFollowedPct: null, decisionsApproved: 0, decisionsTotal: 0 });
    expect(d.wasteGPerCover).toBe(150);
    expect(d.wasteAvoidedKg).toBeLessThan(0);
    expect(d.savingTotal).toBeLessThan(0);
    expect(Math.abs(d.savingServiceflow)).toBeLessThanOrEqual(Math.abs(d.savingTotal));
  });
  it("without a food cost the saving is unknown, never a guessed constant", () => {
    const d = computeDebrief({ property: property({ food_cost_per_cover: undefined }), outletStations: [station({ kgPerUnit: 0 })], forecast: null, actualCovers: 200, waste: [{ stationId: "s1", kg: 6, co2eKg: 6 * 27 }], trailingBaselineGPerCover: null, foodCostPerCover: 0, planFollowedPct: null, decisionsApproved: 0, decisionsTotal: 0 });
    expect(d.wasteAvoidedKg).toBeGreaterThan(0);
    expect(d.savingTotal).toBe(0);
  });
  it("CO2e is zero without a measured waste log", () => {
    const d = computeDebrief({ property: property(), outletStations: outlet().stations, forecast: { p10: 190, p50: 200, p90: 212, usual: 190 }, actualCovers: 205, waste: [], trailingBaselineGPerCover: null, foodCostPerCover: 6.9, planFollowedPct: null, decisionsApproved: 0, decisionsTotal: 0 });
    expect(d.co2eKg).toBe(0);
    expect(d.co2eAvoidedKg).toBe(0);
    expect(d.wasteAvoidedKg).toBe(0);
  });
  it("measured waste under the baseline becomes food not bought, in the hotel's currency", () => {
    const d = computeDebrief({ property: property(), outletStations: outlet().stations, forecast: { p10: 190, p50: 200, p90: 212, usual: 190 }, actualCovers: 200, waste: [{ stationId: "s1", kg: 6, co2eKg: 6 * 27 }], trailingBaselineGPerCover: null, foodCostPerCover: 6.9, planFollowedPct: null, decisionsApproved: 0, decisionsTotal: 0 });
    expect(d.wasteGPerCover).toBe(30);
    expect(d.wasteAvoidedKg).toBeCloseTo(16, 1);
    expect(d.savingTotal).toBeGreaterThan(0);
    expect(d.currency).toBe("USD");
    expect(d.withinBand).toBe(true);
  });
});

describe("human in the loop", () => {
  it("live proposals carry a proposal text and never an applied change", () => {
    const o = outlet();
    const f = forecastBreakfast({ outlet: o, pms: pms(), weather: null, events: [], history: [] });
    const expected = expectedSeatedAt(f, o, "07:30");
    const cc = coverCheck({ outlet: o, forecast: f, pace: [{ at: "2026-10-10T07:30:00+08:00", coversSeated: Math.round(expected * 1.15) }], nationalityMix: pms().nationalityMix, clock: "07:30" });
    expect(cc).not.toBeNull();
    expect(cc!.proposal).toBeTruthy();
    expect(cc!.kind).toBe("cover_check");
  });
  it("running fast proposes a wave change only for the stations that run fast", () => {
    const o = outlet();
    const f = forecastBreakfast({ outlet: o, pms: pms(), weather: null, events: [], history: [] });
    const r = runningFast({ outlet: o, forecast: f, states: [{ stationId: "s1", takenPct: 0.8, status: "prepped" }, { stationId: "s2", takenPct: 0.3, status: "prepped" }], clock: "08:12" });
    expect(r.length).toBe(1);
    expect(r[0].stationId).toBe("s1");
    expect(wasteFill(0.67)).toBeGreaterThan(0.85);
  });
});

describe("staffing: hours follow the covers", () => {
  const lines = [{ id: "l1", name: "Kitchen, early shift", department: "kitchen", outletId: "o1", hoursPerCover: 0.235, minutesPerRoom: null, fixedHours: 9, minHours: 0 }];
  it("demand = fixed + covers × ratio", () => {
    const d = computeDemand(lines, [{ serviceDate: "2026-10-10", coversByOutlet: { o1: 200 }, roomsToService: 150 }]);
    expect(d[0].demandHours).toBeCloseTo(56, 0);
  });
  it("a short Saturday is covered from the day with spare hours", () => {
    const demand = computeDemand(lines, [{ serviceDate: "2026-10-06", coversByOutlet: { o1: 160 }, roomsToService: 150 }, { serviceDate: "2026-10-10", coversByOutlet: { o1: 200 }, roomsToService: 150 }]);
    const s = suggestRoster(lines, demand, [{ serviceLineId: "l1", serviceDate: "2026-10-06", plannedHours: 56 }, { serviceLineId: "l1", serviceDate: "2026-10-10", plannedHours: 48 }]);
    expect(s[0].title).toMatch(/Saturday kitchen \(early shift\) is short by 8 hours/);
    expect(s[0].moves[0].from_date).toBe("2026-10-06");
  });
  it("never takes hours from a day already gone: past spare hours go to the pool instead", () => {
    const demand = computeDemand(lines, [{ serviceDate: "2026-10-06", coversByOutlet: { o1: 160 }, roomsToService: 150 }, { serviceDate: "2026-10-10", coversByOutlet: { o1: 200 }, roomsToService: 150 }]);
    const s = suggestRoster(lines, demand, [{ serviceLineId: "l1", serviceDate: "2026-10-06", plannedHours: 56 }, { serviceLineId: "l1", serviceDate: "2026-10-10", plannedHours: 48 }], 8, "2026-10-09");
    expect(s[0].moves.every((m) => m.from_date == null || m.from_date >= "2026-10-09")).toBe(true);
    expect(s[0].moves[0].source).toBe("pool");
  });
});

describe("tonight, graded", () => {
  it("letters follow the score", () => {
    expect(gradeFromScore(0.96)).toBe("A");
    expect(gradeFromScore(0.8)).toBe("B");
    expect(gradeFromScore(0.68)).toBe("C+");
    expect(gradeFromScore(0.3)).toBe("D");
  });
  it("three actions across departments, biggest saving first", () => {
    const n = computeNightly({ serviceDate: "2026-10-10", outlets: 5, rooms: 196, departments: 4, fnb: { mape: 0.05, wasteVsBaseline: 0.7, planFollowedPct: 90 }, labour: { demandHours: 300, shortHours: 7, overHours: 0 }, leakage: { openVariance: 62, revenue: 20000, openItems: 1 }, esg: { energyVsBaseline: -0.12, wasteLoggedShare: 1, co2eAvoidedKg: 15 }, candidates: [{ rank: 1, kind: "trim", department: "kitchen", stationId: null, title: "Cut sea bass prep 25%", detail: "", reason: "", deltaPct: -25, estSaving: 87 }, { rank: 2, kind: "trim", department: "kitchen", stationId: null, title: "Cut another", detail: "", reason: "", deltaPct: -5, estSaving: 10 }, { rank: 3, kind: "reconcile", department: "finance", stationId: null, title: "Reconcile a POS variance", detail: "", reason: "", deltaPct: null, estSaving: 62 }, { rank: 4, kind: "assign", department: "housekeeping", stationId: null, title: "Add a suite attendant", detail: "", reason: "", deltaPct: null, estSaving: 41 }], logQuality: [{ outlet: "Japanese kitchen", avgSeconds: 15, entries: 6 }] });
    expect(n.actions.map((a) => a.department)).toEqual(["kitchen", "finance", "housekeeping"]);
    expect(n.grades.fnb.grade.startsWith("A") || n.grades.fnb.grade.startsWith("B")).toBe(true);
    expect(n.bestLog?.score).toBe("5/5");
  });
});

describe("voice, in English or Chinese", () => {
  const stations = [{ id: "s1", name: "Western hot", slug: "western_hot", aliases: ["西式热食"] }, { id: "s2", name: "Dim sum", slug: "dim_sum", aliases: ["点心", "點心"] }];
  it("parses Chinese numerals", () => {
    expect(parseChineseNumber("两")).toBe(2);
    expect(parseChineseNumber("二十四")).toBe(24);
    expect(parseChineseNumber("一点五")).toBe(1.5);
    expect(parseChineseNumber("半")).toBe(0.5);
    expect(parseChineseNumber("三百")).toBe(300);
    expect(parseChineseNumber("一百二十")).toBe(120);
    expect(parseChineseNumber("三百二")).toBe(320);
    expect(parseChineseNumber("两半")).toBe(2.5);
  });
  it("a quantity with a unit is never a room number", () => {
    const stations2 = [...stations, { id: "s3", name: "Eggs", slug: "eggs" }, { id: "s4", name: "Bakery", slug: "bakery" }];
    expect(parseVoice("Eggs 120 portions ready", { stations: stations2 }).intent).toBe("station_ready");
    const g = parseVoice("Bakery 300 g binned, check the fridge", { stations: stations2 });
    expect(g.intent).toBe("waste");
    if (g.intent === "waste") expect(g.kg).toBe(0.3);
    const cn = parseVoice("西式热食 多备 两公斤半", { stations });
    expect(cn.intent).toBe("waste");
    if (cn.intent === "waste") expect(cn.kg).toBe(2.5);
    const hundreds = parseVoice("點心 剩 三百克", { stations });
    if (hundreds.intent === "waste") expect(hundreds.kg).toBe(0.3);
    expect(parseVoice("2506 done, 24 minutes", { stations }).intent).toBe("room_done");
  });
  it("logs waste in English", () => {
    const v = parseVoice("Western hot over-prep 2 kg", { stations });
    expect(v.intent).toBe("waste");
    if (v.intent === "waste") {
      expect(v.stationId).toBe("s1");
      expect(v.kg).toBe(2);
      expect(v.reason).toBe("over-prep");
    }
  });
  it("keeps decimals: 1.5 kg and 1,5 kg", () => {
    const a = parseVoice("Bakery over-prep 1.5 kg", { stations: [{ id: "b", name: "Bakery", slug: "bakery" }] });
    expect(a.intent === "waste" && a.kg).toBe(1.5);
    const b = parseVoice("Bakery plate waste 1,5 kg", { stations: [{ id: "b", name: "Bakery", slug: "bakery" }] });
    expect(b.intent === "waste" && b.kg).toBe(1.5);
  });
  it("logs waste in Chinese", () => {
    const v = parseVoice("西式热食 多备 两公斤", { stations });
    expect(v.intent).toBe("waste");
    if (v.intent === "waste") {
      expect(v.stationId).toBe("s1");
      expect(v.kg).toBe(2);
    }
    const d = parseVoice("點心 剩 一公斤", { stations });
    expect(d.intent === "waste" && d.stationId).toBe("s2");
  });
  it("logs a room in both languages", () => {
    const a = parseVoice("2506 done, 24 minutes", { stations });
    expect(a).toMatchObject({ intent: "room_done", room: "2506", minutes: 24 });
    const b = parseVoice("2506 完成 24 分钟", { stations });
    expect(b).toMatchObject({ intent: "room_done", room: "2506", minutes: 24 });
  });
  it("raises a fault and reads a pace", () => {
    expect(parseVoice("1804 door hinge stiff, guest in room", { stations })).toMatchObject({ intent: "fault", room: "1804", priority: "high" });
    expect(parseVoice("142 seated", { stations })).toMatchObject({ intent: "pace", coversSeated: 142 });
    expect(parseVoice("Lift B back in service", { stations, assets: [{ id: "a1", name: "Lift B" }] })).toMatchObject({ intent: "fault", assetId: "a1" });
  });
});

describe("voice: Chinese station names without set-up", () => {
  const st = [
    { id: "d", name: "Dim sum", slug: "dim_sum" },
    { id: "b", name: "Bakery", slug: "bakery" },
    { id: "c", name: "Congee & noodles", slug: "congee_noodles" },
  ];
  it("finds Dim sum from 點心 and Bakery from 麵包", () => {
    const a = parseVoice("點心 剩 2 公斤", { stations: st });
    expect(a.intent === "waste" && a.stationId).toBe("d");
    const b = parseVoice("麵包 剩 一公斤", { stations: st });
    expect(b.intent === "waste" && b.stationId).toBe("b");
  });
});

describe("nothing ships without a backtest", () => {
  // 60 days of a house whose breakfast runs 10% above what the default attach table says
  const days = (shift = 0): ReplayDay[] =>
    Array.from({ length: 60 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
      const p = pms({ serviceDate: date, groupManifest: [], guestsInHouse: 260 + ((i * 37) % 50), roomsOccupied: 165 + ((i * 23) % 30) });
      const raw = forecastBreakfast({ outlet: outlet({ capacity: null }), pms: p, weather: null, events: [], history: [] }).inputs.raw as number;
      return { date, pms: p, weather: null, events: [], booking: null, actual: Math.round(raw * 1.1) + (i === 40 ? shift : 0) };
    });

  it("is out of sample: a day's own covers never change that day's forecast or any before it", () => {
    const a = replayOutlet(outlet({ capacity: null }), days(0)).points;
    const b = replayOutlet(outlet({ capacity: null }), days(500)).points;
    const d40 = new Date(Date.UTC(2026, 7, 41)).toISOString().slice(0, 10);
    for (const p of a.filter((x) => x.date <= d40)) expect(b.find((x) => x.date === p.date)!.p50).toBe(p.p50);
    // the days after do read it: one odd day widens the range (the median calibration ignores it)
    expect(b.some((x) => x.date > d40 && x.p90 !== a.find((y) => y.date === x.date)!.p90)).toBe(true);
  });

  it("calibration removes a steady miss instead of a third of it", () => {
    const { summary } = replayOutlet(outlet({ capacity: null }), days(0));
    expect(summary).not.toBeNull();
    expect(Math.abs(summary!.engine.bias)).toBeLessThan(0.015);
    expect(summary!.engine.mape).toBeLessThan(0.02);
  });

  it("scores against habit and the capture rate on the same days", () => {
    const { summary } = replayOutlet(outlet({ capacity: null }), days(0));
    expect(summary!.n).toBe(60 - WARMUP_DAYS);
    expect(summary!.simple?.n).toBe(summary!.n);
    expect(summary!.closerThanHabit + summary!.sameAsHabit).toBeLessThanOrEqual(summary!.n);
  });
});
