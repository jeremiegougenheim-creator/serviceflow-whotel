/**
 * The words and colours a person sees for a status. The database keeps its own vocabulary
 * (proposed, rejected, in_progress); screens never print it raw.
 *   gn = done · am = waits for a person · rd = at risk · bl = in progress · mt = neutral
 */
export type Tone = "gn" | "am" | "rd" | "bl" | "mt" | "gd";
export type Entity = "decision" | "station" | "work_order" | "roster" | "live" | "planned_work" | "room";

const WORDS: Record<Entity, Record<string, [string, Tone]>> = {
  decision: { proposed: ["Waiting", "am"], approved: ["Approved", "gn"], done: ["Done", "gn"], rejected: ["Kept as is", "mt"], expired: ["Expired", "mt"] },
  station: { proposed: ["To prep", "mt"], approved: ["Confirmed", "mt"], prepped: ["Prepped", "gn"], running_low: ["Running low", "am"], closed: ["Closed", "mt"], skipped: ["Skipped", "mt"] },
  work_order: { open: ["Open", "am"], in_progress: ["In progress", "bl"], planned: ["Planned", "mt"], closed: ["Closed", "gn"] },
  roster: { proposed: ["Waiting", "am"], applied: ["Applied", "gn"], dismissed: ["Not now", "mt"] },
  live: { open: ["Waiting", "am"], approved: ["Approved", "gn"], dismissed: ["Not now", "mt"], expired: ["Superseded", "mt"], superseded: ["Superseded", "mt"] },
  planned_work: { proposed: ["To confirm", "am"], confirmed: ["Confirmed", "gn"], cancelled: ["Cancelled", "mt"], done: ["Done", "gn"] },
  room: { todo: ["To do", "mt"], in_progress: ["In progress", "bl"], done: ["Done", "gn"], inspected: ["Inspected", "gn"], skipped: ["Skipped", "mt"] },
};

export function statusChip(entity: Entity, status: string | null | undefined): { label: string; tone: Tone } {
  const w = WORDS[entity][status ?? ""];
  if (w) return { label: w[0], tone: w[1] };
  const s = String(status ?? "").replace(/_/g, " ");
  return { label: s ? s[0].toUpperCase() + s.slice(1) : "—", tone: "mt" };
}

/** "Approved 18:42" in the hotel's time; the bare word when there is no time. */
export function withTime(label: string, iso: string | null | undefined, tz: string): string {
  if (!iso) return label;
  const t = new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `${label} ${t}`;
}

/** An undo is offered for ten minutes after the change, to the person who made it. */
export const UNDO_MINUTES = 10;
export function undoable(iso: string | null | undefined, now = Date.now()): boolean {
  return !!iso && now - new Date(iso).getTime() < UNDO_MINUTES * 60_000;
}
