/**
 * "Tonight, graded." Four departments, one letter each, and the three actions for tomorrow.
 * Grades come from measured ratios, with the thresholds written here, not hidden in the UI.
 */
import type { Decision } from "./types";

export type Grade = "A" | "A−" | "B+" | "B" | "B−" | "C+" | "C" | "C−" | "D";

export function gradeFromScore(score: number): Grade {
  // score 0..1
  if (score >= 0.95) return "A";
  if (score >= 0.9) return "A−";
  if (score >= 0.85) return "B+";
  if (score >= 0.78) return "B";
  if (score >= 0.72) return "B−";
  if (score >= 0.66) return "C+";
  if (score >= 0.6) return "C";
  if (score >= 0.52) return "C−";
  return "D";
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export interface NightlyInput {
  serviceDate: string;
  outlets: number;
  rooms: number;
  departments: number;
  /** F&B: mean absolute forecast error (0.05 = 5%) and waste vs baseline (0.8 = 20% under) */
  fnb: { mape: number | null; wasteVsBaseline: number | null; planFollowedPct: number | null; withinBandShare?: number | null };
  /** Labour: hours short across lines today vs demand */
  labour: { demandHours: number; shortHours: number; overHours: number };
  /** Leakage: open POS variances amount vs the day's F&B revenue */
  leakage: { openVariance: number; revenue: number | null; openItems: number };
  /** ESG: energy vs baseline (−0.12 = 12% under), waste logged share of stations */
  esg: { energyVsBaseline: number | null; wasteLoggedShare: number | null; co2eAvoidedKg: number };
  /** Candidate actions for tomorrow, ranked by the engine's departments */
  candidates: Decision[];
  /** Voice logs today: average seconds per entry by outlet */
  logQuality: { outlet: string; avgSeconds: number; entries: number }[];
}

export interface NightlyOutput {
  grades: Record<"fnb" | "labour" | "leakage" | "esg", { grade: Grade; score: number; note: string }>;
  actions: Decision[];
  bestLog: { outlet: string; note: string; score: string } | null;
  summary: Record<string, unknown>;
}

export function computeNightly(n: NightlyInput): NightlyOutput {
  // F&B: 60% forecast accuracy, 40% waste under baseline
  const acc = n.fnb.mape == null ? 0.8 : clamp(1 - n.fnb.mape / 0.15, 0, 1);
  const wasteScore = n.fnb.wasteVsBaseline == null ? 0.8 : clamp(1 - (n.fnb.wasteVsBaseline - 0.7) / 0.5, 0, 1); // 0.7 → 1.0, 1.2 → 0
  const fnbScore = 0.6 * acc + 0.4 * wasteScore;
  const inRange = n.fnb.withinBandShare == null ? n.fnb.mape != null && n.fnb.mape <= 0.06 : n.fnb.withinBandShare >= 0.5;
  const fnbNote = n.fnb.mape != null ? `covers ${inRange ? "within" : "outside"} the range · waste ${n.fnb.wasteVsBaseline != null ? Math.round((1 - n.fnb.wasteVsBaseline) * 100) + "% under baseline" : "not logged"}` : "no close yet";

  // Labour: short hours cost service, over hours cost money; both count
  const dem = Math.max(1, n.labour.demandHours);
  const labourScore = clamp(1 - (n.labour.shortHours * 1.5 + n.labour.overHours * 0.8) / dem, 0, 1);
  const labourNote = n.labour.shortHours > 0 ? `${Math.round(n.labour.shortHours)} h short against demand` : n.labour.overHours > 0 ? `${Math.round(n.labour.overHours)} h over demand` : "hours on demand";

  // Leakage: open variances as a share of revenue (0.5% → B, 2% → D)
  const leakageScore =
    n.leakage.revenue && n.leakage.revenue > 0
      ? clamp(1 - n.leakage.openVariance / n.leakage.revenue / 0.02, 0, 1) * (n.leakage.openItems > 0 ? 0.9 : 1)
      : clamp(0.72 - 0.04 * n.leakage.openItems, 0, 1) + (n.leakage.openItems === 0 ? 0.28 : 0);
  const leakageNote = n.leakage.openItems > 0 ? `${n.leakage.openItems} variance${n.leakage.openItems > 1 ? "s" : ""} open to reconcile` : "POS reconciled";

  // ESG: energy under baseline and the waste log kept
  const energyScore = n.esg.energyVsBaseline == null ? 0.75 : clamp(0.75 - n.esg.energyVsBaseline * 2, 0, 1); // −12% → 0.99
  const logScore = n.esg.wasteLoggedShare == null ? 0.7 : clamp(n.esg.wasteLoggedShare, 0, 1);
  const esgScore = 0.6 * energyScore + 0.4 * logScore;
  const esgNote = n.esg.energyVsBaseline != null ? `energy ${Math.round(Math.abs(n.esg.energyVsBaseline) * 100)}% ${n.esg.energyVsBaseline <= 0 ? "under" : "over"} baseline · ${Math.floor(n.esg.co2eAvoidedKg)} kg CO₂e avoided` : "energy not metered";

  const grades = {
    fnb: { grade: gradeFromScore(fnbScore), score: fnbScore, note: fnbNote },
    labour: { grade: gradeFromScore(labourScore), score: labourScore, note: labourNote },
    leakage: { grade: gradeFromScore(leakageScore), score: leakageScore, note: leakageNote },
    esg: { grade: gradeFromScore(esgScore), score: esgScore, note: esgNote },
  };

  // three actions: one per department where possible, biggest saving first
  const seen = new Set<string>();
  const actions: Decision[] = [];
  for (const c of [...n.candidates].sort((a, b) => b.estSaving - a.estSaving)) {
    if (seen.has(c.department)) continue;
    seen.add(c.department);
    actions.push(c);
    if (actions.length === 3) break;
  }
  for (const c of n.candidates) {
    if (actions.length === 3) break;
    if (!actions.includes(c)) actions.push(c);
  }

  const best = [...n.logQuality].filter((l) => l.entries >= 3).sort((a, b) => a.avgSeconds - b.avgSeconds)[0];
  const bestLog = best ? { outlet: best.outlet, note: `every entry under ${Math.ceil(best.avgSeconds / 5) * 5} s`, score: best.avgSeconds <= 20 ? "5/5" : best.avgSeconds <= 30 ? "4/5" : "3/5" } : null;

  return {
    grades,
    actions: actions.map((a, i) => ({ ...a, rank: i + 1 })),
    bestLog,
    summary: { outlets: n.outlets, rooms: n.rooms, departments: n.departments, subline: `${n.outlets} outlets · ${n.rooms} rooms · ${n.departments} departments` },
  };
}
