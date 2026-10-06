import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GRI 306 style export: waste and CO2e per outlet and day, measured by the log. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const property = searchParams.get("property");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!property || !from || !to) return NextResponse.json({ error: "property, from and to are required" }, { status: 400 });
  const supabase = await createClient();
  const [{ data: logs }, { data: outlets }, { data: stations }, { data: outcomes }] = await Promise.all([
    supabase.from("waste_logs").select("service_date, outlet_id, station_id, kg, co2e_kg, source, reason").eq("property_id", property).gte("service_date", from).lte("service_date", to).order("service_date"),
    supabase.from("outlets").select("id, name").eq("property_id", property),
    supabase.from("stations").select("id, name, food_category").eq("property_id", property),
    supabase.from("outcomes").select("service_date, outlet_id, actual_covers, waste_avoided_kg, co2e_avoided_kg, saving_serviceflow, saving_bin_scale, saving_total, currency").eq("property_id", property).gte("service_date", from).lte("service_date", to),
  ]);
  const o = new Map((outlets ?? []).map((x) => [x.id, x.name]));
  const s = new Map((stations ?? []).map((x) => [x.id, x]));
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["service_date,outlet,station,food_category,kg,co2e_kg,source,reason,gri306_disclosure"];
  for (const l of logs ?? []) lines.push([l.service_date, o.get(l.outlet_id) ?? "", s.get(l.station_id ?? "")?.name ?? "", s.get(l.station_id ?? "")?.food_category ?? "", l.kg, l.co2e_kg, l.source, l.reason ?? "", "306-3 waste generated"].map(esc).join(","));
  lines.push("");
  lines.push("service_date,outlet,covers,waste_avoided_kg,co2e_avoided_kg,saving_serviceflow,saving_bin_scale,saving_total,currency,gri306_disclosure");
  for (const x of outcomes ?? []) lines.push([x.service_date, o.get(x.outlet_id) ?? "", x.actual_covers, x.waste_avoided_kg, x.co2e_avoided_kg, x.saving_serviceflow, x.saving_bin_scale, x.saving_total, x.currency, "306-4 waste diverted (avoided)"].map(esc).join(","));
  return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="serviceflow-esg-${from}-${to}.csv"` } });
}
