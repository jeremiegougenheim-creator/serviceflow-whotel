"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type J = NonNullable<Json>;
import { parseCsv, TEMPLATES, type ImportKind } from "@/lib/csv";

type Result = { ok: true; label?: string } | { ok: false; error: string };

const n = (v: string | undefined) => (v == null || v === "" ? null : Number(v.replace(",", ".")));
const b = (v: string | undefined) => /^(true|1|yes|y|oui)$/i.test(v ?? "");

export async function importCsv(propertyId: string, kind: ImportKind, formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a CSV file" };
  const rows = parseCsv(await file.text());
  if (!rows.length) return { ok: false, error: "The file is empty" };
  const tpl = TEMPLATES[kind];
  const missing = tpl.required.filter((c) => !(c in rows[0]));
  if (missing.length) return { ok: false, error: `Missing columns: ${missing.join(", ")}` };

  const errors: { row: number; error: string }[] = [];
  let ok = 0;
  const [{ data: outlets }, { data: stations }, { data: lines }, { data: members }] = await Promise.all([
    supabase.from("outlets").select("id, slug, name").eq("property_id", propertyId),
    supabase.from("stations").select("id, slug, outlet_id").eq("property_id", propertyId),
    supabase.from("service_lines").select("id, name").eq("property_id", propertyId),
    supabase.from("team_members").select("id, name").eq("property_id", propertyId),
  ]);
  const outletId = (v: string) => outlets?.find((o) => o.slug === v || o.name.toLowerCase() === v.toLowerCase())?.id ?? null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      switch (kind) {
        case "pms_daily": {
          const mix = (prefix: string) => Object.fromEntries(Object.entries(r).filter(([k, v]) => k.startsWith(prefix) && v !== "").map(([k, v]) => [k.slice(prefix.length), Number(v)]));
          const { error } = await supabase.from("pms_daily").upsert({ property_id: propertyId, service_date: r.service_date, rooms_occupied: n(r.rooms_occupied) ?? 0, rooms_total: n(r.rooms_total), guests_in_house: n(r.guests_in_house) ?? 0, arrivals: n(r.arrivals) ?? 0, departures: n(r.departures) ?? 0, departures_am: n(r.departures_am) ?? 0, late_arrivals_prev: n(r.late_arrivals_prev) ?? 0, early_checkins: n(r.early_checkins) ?? 0, lounge_eligible: n(r.lounge_eligible) ?? 0, vip_arrivals: n(r.vip_arrivals) ?? 0, suites_occupied: n(r.suites_occupied) ?? 0, rate_code_mix: mix("rate_") as J, travel_source_mix: mix("src_") as J, nationality_mix: mix("nat_") as J, los_distribution: mix("los_") as J, source: "csv" }, { onConflict: "property_id,service_date" });
          if (error) throw error;
          break;
        }
        case "service_actuals": {
          const oid = outletId(r.outlet);
          if (!oid) throw new Error(`unknown outlet ${r.outlet}`);
          const { error } = await supabase.from("service_actuals").upsert({ property_id: propertyId, outlet_id: oid, service_date: r.service_date, actual_covers: n(r.actual_covers) ?? 0, revenue: n(r.revenue), source: "csv", closed_by: user.id }, { onConflict: "outlet_id,service_date" });
          if (error) throw error;
          break;
        }
        case "waste_logs": {
          const oid = outletId(r.outlet);
          if (!oid) throw new Error(`unknown outlet ${r.outlet}`);
          const st = stations?.find((s) => s.outlet_id === oid && s.slug === r.station);
          const { error } = await supabase.from("waste_logs").insert({ property_id: propertyId, outlet_id: oid, station_id: st?.id ?? null, service_date: r.service_date, kg: n(r.kg) ?? 0, reason: r.reason || null, source: r.reason === "winnow" ? "winnow" : "csv", logged_by: user.id, logged_at: `${r.service_date}T12:00:00Z` });
          if (error) throw error;
          break;
        }
        case "roster_shifts": {
          const line = lines?.find((l) => l.name.toLowerCase() === r.service_line.toLowerCase());
          if (!line) throw new Error(`unknown service line ${r.service_line}`);
          const tm = r.team_member ? members?.find((m) => m.name.toLowerCase() === r.team_member.toLowerCase()) : null;
          const { error } = await supabase.from("roster_shifts").insert({ property_id: propertyId, service_line_id: line.id, team_member_id: tm?.id ?? null, service_date: r.service_date, starts_at: r.starts_at, ends_at: r.ends_at, hours: n(r.hours) ?? 0, status: (r.status as "draft" | "published") || "published" });
          if (error) throw error;
          break;
        }
        case "property_financials": {
          const { error } = await supabase.from("property_financials").upsert({ property_id: propertyId, period: r.period, revenue: n(r.revenue), gop: n(r.gop), noi: n(r.noi), asset_value: n(r.asset_value), revpar: n(r.revpar), occupancy: n(r.occupancy), currency: (r.currency || "USD").toUpperCase(), fx_to_org: n(r.fx_to_org) ?? 1, source: "csv" }, { onConflict: "property_id,period" });
          if (error) throw error;
          break;
        }
        case "energy_readings": {
          const { error } = await supabase.from("energy_readings").upsert({ property_id: propertyId, service_date: r.service_date, category: r.category as "cooling" | "kitchens" | "lifts_lighting" | "other", kwh: n(r.kwh) ?? 0, note: r.note || null, source: "csv" }, { onConflict: "property_id,service_date,category" });
          if (error) throw error;
          break;
        }
        case "rooms": {
          const { error } = await supabase.from("rooms").upsert({ property_id: propertyId, number: r.number, floor: n(r.floor), room_type: r.room_type || "king", is_suite: b(r.is_suite), target_minutes: n(r.target_minutes) ?? 25 }, { onConflict: "property_id,number" });
          if (error) throw error;
          break;
        }
        case "bookings_daily": {
          const oid = outletId(r.outlet);
          if (!oid) throw new Error(`unknown outlet ${r.outlet}`);
          const { error } = await supabase.from("bookings_daily").upsert({ property_id: propertyId, outlet_id: oid, service_date: r.service_date, covers_booked: n(r.covers_booked) ?? 0, walk_in_expected: n(r.walk_in_expected) ?? 0, largest_party: n(r.largest_party), largest_party_at: r.largest_party_at || null, peak_at: r.peak_at || null, peak_covers: n(r.peak_covers), source: "csv" }, { onConflict: "outlet_id,service_date" });
          if (error) throw error;
          break;
        }
      }
      ok++;
    } catch (e) {
      errors.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) });
      if (errors.length >= 50) break;
    }
  }
  await supabase.from("imports").insert({ property_id: propertyId, kind, file_name: file.name, rows_total: rows.length, rows_ok: ok, rows_failed: errors.length, errors: errors as unknown as J, status: errors.length && !ok ? "failed" : "done", imported_by: user.id });
  revalidatePath("/settings/import");
  return ok ? { ok: true, label: `${ok} rows imported${errors.length ? `, ${errors.length} failed` : ""}` } : { ok: false, error: errors[0]?.error ?? "Nothing imported" };
}
