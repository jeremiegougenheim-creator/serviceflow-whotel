/**
 * Live service: the pace against the forecast, stations running fast, waste risk near the close.
 * Every proposal waits for a person. Nothing is ordered or rostered on its own.
 */
import type { CoversForecast, OutletCfg, StationCfg } from "./types";
import { nationalityMultiplier } from "./plan";

export interface PaceEntry {
  at: string; // ISO timestamp
  coversSeated: number;
}

export interface StationLiveState {
  stationId: string;
  takenPct: number | null; // share of the wave's quantity consumed (from tick-offs or counts)
  status: string; // proposed | approved | prepped | running_low | closed
}

export interface LiveProposal {
  kind: "cover_check" | "running_fast" | "waste_risk" | "group_arrival" | "pace";
  title: string;
  body: string;
  proposal: string | null;
  stationId: string | null;
  payload: Record<string, unknown>;
}

const r0 = (n: number) => Math.round(n);

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Share of a wave seated after a fraction of its window: guests arrive at the start of a wave, not evenly. */
export function waveFill(progress: number): number {
  const x = Math.min(1, Math.max(0, progress));
  return 1 - Math.pow(1 - x, 2.2);
}

/** Expected covers seated (cumulative) by a given clock time, from the wave split. */
export function expectedSeatedAt(forecast: CoversForecast, outlet: OutletCfg, clock: string): number {
  const t = minutesOf(clock);
  const waves = [...forecast.waveSplit].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (!waves.length) return t >= minutesOf(outlet.closesAt) ? forecast.p50 : 0;
  let seated = 0;
  for (let i = 0; i < waves.length; i++) {
    const start = minutesOf(waves[i].startsAt);
    const end = i + 1 < waves.length ? minutesOf(waves[i + 1].startsAt) : minutesOf(outlet.closesAt);
    if (t >= end) seated += waves[i].covers;
    else if (t > start) seated += waves[i].covers * waveFill((t - start) / Math.max(1, end - start));
  }
  return seated;
}

/** Cover check: are we ahead of the forecast, and which stations should move first. */
export function coverCheck(input: { outlet: OutletCfg; forecast: CoversForecast; pace: PaceEntry[]; nationalityMix: Record<string, number>; clock: string }): LiveProposal | null {
  const { outlet, forecast, pace, nationalityMix, clock } = input;
  const last = [...pace].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (!last) return null;
  const expected = expectedSeatedAt(forecast, outlet, clock);
  if (expected < 20) return null;
  const delta = (last.coversSeated - expected) / expected;
  if (Math.abs(delta) < 0.06) return null;
  const pct = `${delta >= 0 ? "+" : "−"}${Math.round(Math.abs(delta) * 100)}%`;
  // stations the mix in house pulls hardest
  const ranked = outlet.stations
    .map((s) => ({ s, m: nationalityMultiplier(s, nationalityMix).mult }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 2);
  const adds = ranked.map(({ s }) => `${s.name} +${Math.max(2, r0((s.basePar * Math.abs(delta)) / 2))}`).join(" and ");
  return {
    kind: "cover_check",
    title: `Covers ${pct} on forecast`,
    body: `${last.coversSeated} seated, ${r0(expected)} expected.${delta > 0 ? ` ${adds} proposed.` : " Hold the next wave's replenishment."}`,
    proposal: delta > 0 ? `${adds}` : "Hold the next wave 15 minutes",
    stationId: null,
    payload: { seated: last.coversSeated, expected: r0(expected), delta: +delta.toFixed(3), stations: ranked.map((r) => r.s.id) },
  };
}

/** Running fast: a station past ~70% of its wave before the wave is half through. */
export function runningFast(input: { outlet: OutletCfg; forecast: CoversForecast; states: StationLiveState[]; clock: string }): LiveProposal[] {
  const { outlet, forecast, states, clock } = input;
  const t = minutesOf(clock);
  const waves = [...forecast.waveSplit].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current = waves.filter((w) => minutesOf(w.startsAt) <= t).at(-1);
  if (!current) return [];
  const next = waves.find((w) => minutesOf(w.startsAt) > t);
  const end = next ? minutesOf(next.startsAt) : minutesOf(outlet.closesAt);
  const progress = (t - minutesOf(current.startsAt)) / Math.max(1, end - minutesOf(current.startsAt));
  const out: LiveProposal[] = [];
  // the two stations running fastest; an explicit running_low tick-off always counts
  const ranked = states
    .filter((s) => s.status !== "closed" && (s.status === "running_low" || (s.takenPct != null && s.takenPct >= 0.7)))
    .sort((a, b) => (b.status === "running_low" ? 2 : b.takenPct ?? 0) - (a.status === "running_low" ? 2 : a.takenPct ?? 0))
    .slice(0, 2);
  for (const st of ranked) {
    const station = outlet.stations.find((s) => s.id === st.stationId);
    if (!station) continue;
    if ((st.status === "running_low" || (st.takenPct != null && st.takenPct >= 0.7 && progress <= 0.55)) && next) {
      const add = Math.max(2, r0(station.basePar * 0.08));
      out.push({
        kind: "running_fast",
        title: `${station.name} ${Math.round((st.takenPct ?? 0.75) * 100)}% taken`,
        body: `Bring the ${next.label} wave forward 15 minutes and add ${add} ${station.unit}.`,
        proposal: `Bring ${next.label} forward 15 min, +${add} ${station.unit}`,
        stationId: station.id,
        payload: { takenPct: st.takenPct, status: st.status, progress: +progress.toFixed(2), add, nextWave: next.waveId },
      });
    }
  }
  return out;
}

/** Waste risk: in the last part of service, stations still over-stocked should stop replenishing. */
export function wasteRisk(input: { outlet: OutletCfg; forecast: CoversForecast; states: StationLiveState[]; clock: string; stationsById?: Map<string, StationCfg> }): LiveProposal | null {
  const { outlet, forecast, states, clock } = input;
  const t = minutesOf(clock);
  const close = minutesOf(outlet.closesAt);
  if (close - t > 75) return null;
  const late = states.filter((s) => s.takenPct != null && s.takenPct < 0.55 && s.status !== "closed").sort((a, b) => (a.takenPct ?? 0) - (b.takenPct ?? 0)).slice(0, 2);
  if (!late.length) return null;
  const byId = input.stationsById ?? new Map(outlet.stations.map((s) => [s.id, s]));
  const parts = late.map((s) => {
    const st = byId.get(s.stationId);
    const tot = forecast.waveSplit.length ? 1 : 1;
    const left = st ? r0(st.basePar * (1 - (s.takenPct ?? 0)) * 0.6 * tot) : 0;
    return { name: st?.name ?? "station", left, unit: st?.unit ?? "portions", id: s.stationId };
  });
  return {
    kind: "waste_risk",
    title: `${late.length === 1 ? "One station" : late.length === 2 ? "Two stations" : `${late.length} stations`} over-stocked`,
    body: `${parts.map((p) => `${p.name} ${p.left} ${p.unit}`).join(", ")}. Stop replenishing.`,
    proposal: "Stop replenishing",
    stationId: parts[0]?.id ?? null,
    payload: { stations: parts },
  };
}
