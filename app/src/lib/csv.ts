/** CSV import templates and a small parser (shared by the import action and the import page). */

export type ImportKind = "pms_daily" | "service_actuals" | "waste_logs" | "roster_shifts" | "property_financials" | "energy_readings" | "rooms" | "bookings_daily";

/** Column templates shown on the import page and used to validate the header. */
export const TEMPLATES: Record<ImportKind, { required: string[]; optional: string[]; note: string }> = {
  pms_daily: {
    required: ["service_date", "rooms_occupied"],
    optional: ["rooms_total", "guests_in_house", "arrivals", "departures", "departures_am", "late_arrivals_prev", "early_checkins", "lounge_eligible", "vip_arrivals", "suites_occupied", "rate_breakfast_inclusive", "rate_room_only", "rate_package", "rate_default", "src_fit", "src_tour_group", "src_mice", "src_other", "nat_greater_china", "nat_western", "nat_japan", "nat_korea", "nat_other", "los_day1", "los_day2_4", "los_day5plus"],
    note: "One row per night. Shares as decimals (0.58). Aggregates only: no guest names.",
  },
  service_actuals: { required: ["outlet", "service_date", "actual_covers"], optional: ["revenue"], note: "outlet = the outlet's slug (breakfast, restaurant…)." },
  waste_logs: { required: ["outlet", "station", "service_date", "kg"], optional: ["reason"], note: "station = the station's slug. History from a bin scale goes here with reason = winnow." },
  roster_shifts: { required: ["service_line", "service_date", "starts_at", "ends_at", "hours"], optional: ["team_member", "status"], note: "service_line = the line's name as in Set-up → Staffing." },
  property_financials: { required: ["period", "revenue", "gop"], optional: ["noi", "asset_value", "revpar", "occupancy", "currency", "fx_to_org"], note: "period = first day of the month (2026-09-01). Amounts in the hotel's currency." },
  energy_readings: { required: ["service_date", "category", "kwh"], optional: ["note"], note: "category: cooling, kitchens, lifts_lighting, other." },
  rooms: { required: ["number"], optional: ["floor", "room_type", "is_suite", "target_minutes"], note: "The room inventory; is_suite = true/false." },
  bookings_daily: { required: ["outlet", "service_date", "covers_booked"], optional: ["walk_in_expected", "largest_party", "largest_party_at", "peak_at", "peak_covers"], note: "Reservations per outlet and night." },
};

/** Minimal CSV parser: commas or semicolons, quotes, CRLF. */
export function parseCsv(text: string): Record<string, string>[] {
  const sep = text.split("\n")[0].includes(";") && !text.split("\n")[0].includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

