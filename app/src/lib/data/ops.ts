import "server-only";
import { createClient } from "@/lib/supabase/server";
import { plusDays } from "./dates";

export async function staffingWeek(propertyId: string, monday: string) {
  const supabase = await createClient();
  const [{ data: days }, { data: suggestions }, { data: lines }] = await Promise.all([
    supabase.from("v_staffing_day").select("*").eq("property_id", propertyId).gte("service_date", monday).lt("service_date", plusDays(monday, 7)),
    supabase.from("roster_suggestions").select("*").eq("property_id", propertyId).eq("week_start", monday).neq("status", "expired").order("delta_hours"),
    supabase.from("service_lines").select("*").eq("property_id", propertyId).eq("active", true).order("sort_order"),
  ]);
  return { days: days ?? [], suggestions: suggestions ?? [], lines: lines ?? [] };
}

export async function roomsDay(propertyId: string, date: string) {
  const supabase = await createClient();
  const [{ data: tasks }, { data: rooms }] = await Promise.all([
    supabase.from("room_tasks").select("*").eq("property_id", propertyId).eq("service_date", date).order("priority").order("needed_by", { nullsFirst: false }),
    supabase.from("rooms").select("*").eq("property_id", propertyId).eq("active", true),
  ]);
  const byId = new Map((rooms ?? []).map((r) => [r.id, r]));
  return { tasks: (tasks ?? []).map((t) => ({ ...t, room: byId.get(t.room_id)! })), rooms: rooms ?? [] };
}

export async function engineeringNow(propertyId: string, date: string) {
  const supabase = await createClient();
  const [{ data: workOrders }, { data: assets }, { data: readings }, { data: planned }, { data: energy }, { data: energyHist }, { data: property }] = await Promise.all([
    supabase.from("work_orders").select("*").eq("property_id", propertyId).order("opened_at", { ascending: false }).limit(80),
    supabase.from("assets").select("*").eq("property_id", propertyId).eq("active", true).order("sort_order"),
    supabase.from("asset_readings").select("*").eq("property_id", propertyId).order("at", { ascending: false }).limit(200),
    supabase.from("planned_works").select("*").eq("property_id", propertyId).neq("status", "cancelled").gte("starts_at", plusDays(date, -1)).order("starts_at").limit(20),
    supabase.from("energy_readings").select("*").eq("property_id", propertyId).eq("service_date", date),
    supabase.from("energy_readings").select("service_date, kwh").eq("property_id", propertyId).gte("service_date", plusDays(date, -30)).lt("service_date", date),
    supabase.from("properties").select("keys, settings").eq("id", propertyId).single(),
  ]);
  return { workOrders: workOrders ?? [], assets: assets ?? [], readings: readings ?? [], planned: planned ?? [], energy: energy ?? [], energyHist: energyHist ?? [], property };
}

export async function portfolio(quarterStart?: string, tomorrow?: string) {
  const supabase = await createClient();
  const [{ data: money }, { data: ops }, { data: regions }] = await Promise.all([
    supabase.rpc("sf_portfolio_quarter", quarterStart ? { p_quarter_start: quarterStart } : {}),
    supabase.rpc("sf_portfolio_ops", tomorrow ? { p_date: tomorrow } : {}),
    supabase.from("regions").select("*").order("sort_order"),
  ]);
  return { money: money ?? [], ops: ops ?? [], regions: regions ?? [] };
}

export async function notificationsFor(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}
