import { formatInTimeZone } from "date-fns-tz";

/** Today and tomorrow in the property's own time zone. */
export function propertyDates(tz: string, now = new Date()) {
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const clock = formatInTimeZone(now, tz, "HH:mm");
  return { today, tomorrow: plusDays(today, 1), yesterday: plusDays(today, -1), clock };
}

export function plusDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  return plusDays(date, -((d.getUTCDay() + 6) % 7));
}
