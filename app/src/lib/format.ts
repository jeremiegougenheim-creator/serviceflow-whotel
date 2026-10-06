import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Money in the property's currency: US$270 · HK$2,100 · NT$18,000 · €1,540 */
export function money(amount: number | string | null | undefined, currency = "USD", opts: { decimals?: number } = {}): string {
  if (amount == null || amount === "") return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  const decimals = opts.decimals ?? (Math.abs(n) >= 10 || Number.isInteger(n) ? 0 : 2);
  const symbol: Record<string, string> = { USD: "US$", HKD: "HK$", TWD: "NT$", MOP: "MOP$", SGD: "S$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", THB: "฿", AUD: "A$" };
  const sym = symbol[currency] ?? currency + " ";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n < 0 ? "−" : ""}${sym}${abs}`;
}

export function moneyK(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return money(amount / 1_000_000, currency, { decimals: 1 }).replace(/(\d)$/, "$1M");
  if (abs >= 10_000) return money(Math.round(amount / 1000), currency, { decimals: 0 }) + "K";
  return money(amount, currency);
}

export function pct(n: number | string | null | undefined, decimals = 0, signed = false): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  const s = `${Math.abs(v).toFixed(decimals)}%`;
  if (signed) return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}`;
  return `${v < 0 ? "−" : ""}${s}`;
}

export function signed(n: number | null | undefined, unit = "", decimals = 0): string {
  if (n == null) return "—";
  const v = Number(n);
  const s = Math.abs(v).toFixed(decimals);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}${unit}`;
}

export function num(n: number | string | null | undefined, decimals = 0): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function kg(n: number | string | null | undefined, decimals = 1): string {
  if (n == null || n === "") return "—";
  return `${num(n, decimals)} kg`;
}

export function hhmm(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), tz, "HH:mm");
}

export function timeShort(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

export function dayLabel(date: string, style: "long" | "short" = "long"): string {
  const d = new Date(date + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", style === "long" ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function weekday(date: string): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

export function todayIn(tz: string): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

export function nowClock(tz: string): string {
  return formatInTimeZone(new Date(), tz, "HH:mm");
}

/** The instant a property-local day starts (00:00 in its time zone), as ISO. */
export function startOfDayIn(date: string, tz: string): string {
  return fromZonedTime(`${date}T00:00:00`, tz).toISOString();
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

export function greeting(clock: string): string {
  const h = Number(clock.slice(0, 2));
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
