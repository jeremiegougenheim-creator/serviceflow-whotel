/**
 * Staffing — hours against demand. "Forecast first. Hours follow the covers, not last week's rota."
 */
import type { StaffingDemandLine, StaffingLineCfg } from "./types";

export interface DayVolume {
  serviceDate: string;
  coversByOutlet: Record<string, number>; // outletId → covers forecast (p50)
  roomsToService: number; // occupied rooms (housekeeping)
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Demand hours for every service line and day. */
export function computeDemand(lines: StaffingLineCfg[], days: DayVolume[]): StaffingDemandLine[] {
  const out: StaffingDemandLine[] = [];
  for (const d of days) {
    for (const l of lines) {
      let hours = l.fixedHours;
      const basis: Record<string, unknown> = { fixed: l.fixedHours };
      if (l.hoursPerCover != null) {
        const covers = l.outletId ? (d.coversByOutlet[l.outletId] ?? 0) : Object.values(d.coversByOutlet).reduce((s, x) => s + x, 0);
        hours += covers * l.hoursPerCover;
        basis.covers = covers;
        basis.ratio = l.hoursPerCover;
      }
      if (l.minutesPerRoom != null) {
        hours += (d.roomsToService * l.minutesPerRoom) / 60;
        basis.rooms = d.roomsToService;
        basis.minutes = l.minutesPerRoom;
      }
      hours = Math.max(l.minHours, hours);
      out.push({ serviceLineId: l.id, serviceDate: d.serviceDate, demandHours: r1(hours), basis });
    }
  }
  return out;
}

export interface PlannedHours {
  serviceLineId: string;
  serviceDate: string;
  plannedHours: number;
}

export interface RosterSuggestion {
  serviceLineId: string;
  serviceDate: string;
  title: string;
  detail: string;
  deltaHours: number;
  moves: { from_date: string | null; to_date: string; hours: number; service_line_id: string; source: "line" | "pool" }[];
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayName(iso: string) {
  return DAY[new Date(iso + "T12:00:00Z").getUTCDay()];
}

/**
 * One suggestion per line that is short somewhere in the week: move hours from the day of the same
 * line that has the most to spare, then from the pool.
 */
export function suggestRoster(lines: StaffingLineCfg[], demand: StaffingDemandLine[], planned: PlannedHours[], poolHours = 8): RosterSuggestion[] {
  const out: RosterSuggestion[] = [];
  const plannedKey = new Map(planned.map((p) => [`${p.serviceLineId}|${p.serviceDate}`, p.plannedHours]));
  for (const l of lines) {
    const rows = demand
      .filter((d) => d.serviceLineId === l.id)
      .map((d) => ({ date: d.serviceDate, demand: d.demandHours, planned: plannedKey.get(`${l.id}|${d.serviceDate}`) ?? 0 }))
      .map((r) => ({ ...r, delta: r1(r.planned - r.demand) }));
    const short = rows.filter((r) => r.delta <= -1).sort((a, b) => a.delta - b.delta)[0];
    if (!short) continue;
    const spare = rows.filter((r) => r.delta >= 1 && r.date !== short.date).sort((a, b) => b.delta - a.delta)[0];
    const need = Math.abs(short.delta);
    const moves: RosterSuggestion["moves"] = [];
    let detail: string;
    const label = l.name.replace(", early shift", "").replace("Breakfast service", "breakfast").toLowerCase();
    const dept = l.department === "kitchen" ? "kitchen" : l.department;
    if (spare && spare.delta >= need) {
      const h = Math.min(spare.delta, need);
      moves.push({ from_date: spare.date, to_date: short.date, hours: r1(h), service_line_id: l.id, source: "line" });
      detail = h >= 7.5 ? `Move one ${dept === "kitchen" ? "cook" : dept === "stewarding" ? "steward" : "attendant"} from ${dayName(spare.date)} to ${dayName(short.date)} morning.` : `Move ${r1(h)} hours from ${dayName(spare.date)} to ${dayName(short.date)}.`;
    } else {
      let covered = 0;
      if (spare) {
        moves.push({ from_date: spare.date, to_date: short.date, hours: r1(spare.delta), service_line_id: l.id, source: "line" });
        covered = spare.delta;
      }
      const fromPool = r1(Math.min(poolHours, need - covered));
      if (fromPool > 0) moves.push({ from_date: null, to_date: short.date, hours: fromPool, service_line_id: l.id, source: "pool" });
      detail = spare ? `Move the ${r1(spare.delta)} spare ${label} hours and add ${fromPool} from the pool.` : `Add ${fromPool} hours from the pool on ${dayName(short.date)}.`;
    }
    out.push({ serviceLineId: l.id, serviceDate: short.date, title: `${dayName(short.date)} ${label} is short by ${Math.round(need)} hours.`, detail, deltaHours: -need, moves });
  }
  return out.sort((a, b) => a.deltaHours - b.deltaHours);
}
