"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runDebrief, runEveningBrief, runNightlyReport, runStaffing } from "@/lib/engine/run";
import { plusDays, todayIn } from "@/lib/format";
import type { Json } from "@/lib/supabase/database.types";

type J = NonNullable<Json>;

type Result = { ok: true; label?: string } | { ok: false; error: string };
const fail = (e: { message: string } | null | undefined): Result => ({ ok: false, error: e?.message ?? "Not allowed" });
const NOT_ALLOWED = "Not allowed for your role";

/** An update RLS filtered out returns no rows and no error: that is a refusal, not a save. */
function touched(r: { error: { message: string } | null; data: { id: string }[] | null }, label = "Saved"): Result {
  if (r.error) return fail(r.error);
  if (!r.data?.length) return { ok: false, error: NOT_ALLOWED };
  return { ok: true, label };
}

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const num = (v: FormDataEntryValue | null) => (v == null || v === "" ? null : Number(v));
const str = (v: FormDataEntryValue | null) => (v == null ? null : String(v).trim() || null);

// ── hotel ────────────────────────────────────────────────────────────────────

export async function saveProperty(propertyId: string, formData: FormData): Promise<Result> {
  const { supabase } = await me();
  const { data: current } = await supabase.from("properties").select("settings").eq("id", propertyId).single();
  const settings = { ...((current?.settings as Record<string, unknown>) ?? {}) };
  for (const k of ["food_cost_per_cover", "food_kg_per_cover", "waste_baseline_g_cover", "co2e_default_factor", "energy_baseline_kwh_room", "saving_points_total", "saving_points_serviceflow"]) {
    const v = num(formData.get(k));
    if (v == null) delete settings[k];
    else settings[k] = v;
  }
  for (const k of ["brief_time", "dawn_update_time", "debrief_time"]) {
    const v = str(formData.get(k));
    if (v) settings[k] = v;
  }
  settings.winnow = formData.get("winnow") === "on";
  // rule 2: the predictive share is a part of the whole, never more
  const total = Number(settings.saving_points_total ?? 4);
  const sf = Number(settings.saving_points_serviceflow ?? 3);
  if (!(total > 0) || !(sf >= 0) || sf > total) return { ok: false, error: "ServiceFlow's saving points must be between 0 and the total" };
  for (const k of ["food_cost_per_cover", "food_kg_per_cover", "waste_baseline_g_cover", "co2e_default_factor", "energy_baseline_kwh_room"]) {
    if (settings[k] != null && !(Number(settings[k]) >= 0)) return { ok: false, error: `${k.replace(/_/g, " ")} must be a positive number` };
  }
  const tz = str(formData.get("timezone"));
  if (tz) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
    } catch {
      return { ok: false, error: `Unknown time zone ${tz}` };
    }
  }
  const r = touched(
    await supabase
      .from("properties")
      .update({ name: str(formData.get("name")) ?? undefined, keys: num(formData.get("keys")) ?? undefined, currency: (str(formData.get("currency")) ?? "USD").toUpperCase().slice(0, 3), timezone: tz ?? undefined, city: str(formData.get("city")), settings: settings as J })
      .eq("id", propertyId)
      .select("id"),
  );
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return r;
}

// ── outlets, waves, stations ────────────────────────────────────────────────

export async function saveOutlet(propertyId: string, outletId: string | null, formData: FormData): Promise<Result> {
  const { supabase } = await me();
  const name = str(formData.get("name"));
  if (!name) return { ok: false, error: "A name is needed" };
  const slug = (str(formData.get("slug")) ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const settings: Record<string, unknown> = {};
  const usual = num(formData.get("usual_covers"));
  if (usual != null) settings.usual_covers = usual;
  const fcc = num(formData.get("food_cost_per_cover"));
  if (fcc != null) settings.food_cost_per_cover = fcc;
  const walk = num(formData.get("walk_in_share"));
  if (walk != null) settings.walk_in_share = walk;
  const buffer = num(formData.get("buffer_pct"));
  if (buffer != null) settings.buffer_pct = buffer;
  const row = { property_id: propertyId, name, slug, outlet_type: String(formData.get("outlet_type") ?? "restaurant") as "breakfast" | "restaurant" | "bar" | "banquet" | "room_service" | "other", opens_at: str(formData.get("opens_at")) ?? "06:30", closes_at: str(formData.get("closes_at")) ?? "10:30", capacity_pax: num(formData.get("capacity_pax")), sort_order: num(formData.get("sort_order")) ?? 0 };
  if (outletId) {
    const { data: cur } = await supabase.from("outlets").select("settings").eq("id", outletId).single();
    const merged = { ...((cur?.settings as Record<string, unknown>) ?? {}), ...settings };
    const r = touched(await supabase.from("outlets").update({ ...row, settings: merged as J }).eq("id", outletId).eq("property_id", propertyId).select("id"));
    if (!r.ok) return r;
  } else {
    const { data: created, error } = await supabase.from("outlets").insert({ ...row, settings: settings as J }).select("id").single();
    if (error) return fail(error);
    // default waves by type
    const waves = row.outlet_type === "breakfast" ? [["Open", "06:30", 0.3], ["08:00", "08:00", 0.42], ["09:30", "09:30", 0.28]] : row.outlet_type === "bar" ? [["18:00", "18:00", 0.55], ["21:00", "21:00", 0.45]] : row.outlet_type === "banquet" ? [["Service", "19:00", 1]] : [["18:00", "18:00", 0.4], ["20:00", "20:00", 0.6]];
    await supabase.from("waves").insert(waves.map(([label, at, share], i) => ({ property_id: propertyId, outlet_id: created.id, label: String(label), starts_at: String(at), share_default: Number(share), sort_order: i + 1 })));
  }
  revalidatePath("/settings/outlets");
  return { ok: true, label: "Saved" };
}

export async function saveStation(propertyId: string, outletId: string, stationId: string | null, formData: FormData): Promise<Result> {
  const { supabase } = await me();
  const name = str(formData.get("name"));
  if (!name) return { ok: false, error: "A name is needed" };
  const slug = (str(formData.get("slug")) ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases = (str(formData.get("aliases")) ?? "").split(/[,，;]/).map((a) => a.trim()).filter(Boolean);
  const priors: Record<string, { mult: number; conf: number }> = {};
  for (const g of ["greater_china", "japan", "korea", "western", "other"]) {
    const v = num(formData.get(`prior_${g}`));
    if (v != null && v !== 1) priors[g] = { mult: v, conf: 0.8 };
  }
  const row = {
    property_id: propertyId,
    outlet_id: outletId,
    name,
    slug,
    station_kind: String(formData.get("station_kind") ?? "buffet") as "buffet" | "dish" | "batch" | "course",
    food_category: str(formData.get("food_category")) ?? "default",
    unit: str(formData.get("unit")) ?? "portions",
    base_par: num(formData.get("base_par")) ?? 0,
    usual_covers: num(formData.get("usual_covers")),
    cost_per_unit: num(formData.get("cost_per_unit")) ?? 0,
    kg_per_unit: num(formData.get("kg_per_unit")) ?? 0.25,
    co2e_factor: num(formData.get("co2e_factor")),
    high_value: formData.get("high_value") === "on",
    nationality_priors: priors as J,
    dow_profile: { weekend: num(formData.get("weekend")) ?? 1 } as J,
    weather_profile: { rain: num(formData.get("rain")) ?? 1, hot: num(formData.get("hot")) ?? 1 } as J,
    settings: { aliases } as J,
    sort_order: num(formData.get("sort_order")) ?? 0,
    active: formData.get("active") !== "off",
  };
  const r = touched(stationId ? await supabase.from("stations").update(row).eq("id", stationId).eq("property_id", propertyId).select("id") : await supabase.from("stations").insert(row).select("id"));
  if (!r.ok) return r;
  revalidatePath("/settings/outlets");
  return r;
}

export async function deleteStation(stationId: string): Promise<Result> {
  const { supabase } = await me();
  const r = touched(await supabase.from("stations").update({ active: false }).eq("id", stationId).select("id"), "Removed");
  if (!r.ok) return r;
  revalidatePath("/settings/outlets");
  return r;
}

export async function saveWave(propertyId: string, outletId: string, waveId: string | null, formData: FormData): Promise<Result> {
  const { supabase } = await me();
  const row = { property_id: propertyId, outlet_id: outletId, label: str(formData.get("label")) ?? "Wave", starts_at: str(formData.get("starts_at")) ?? "08:00", share_default: num(formData.get("share_default")) ?? 0.33, sort_order: num(formData.get("sort_order")) ?? 1 };
  const r = touched(waveId ? await supabase.from("waves").update(row).eq("id", waveId).eq("property_id", propertyId).select("id") : await supabase.from("waves").insert(row).select("id"));
  if (!r.ok) return r;
  revalidatePath("/settings/outlets");
  return r;
}

// ── staffing lines, team, members ───────────────────────────────────────────

export async function saveServiceLine(propertyId: string, lineId: string | null, formData: FormData): Promise<Result> {
  const { supabase } = await me();
  const row = { property_id: propertyId, outlet_id: str(formData.get("outlet_id")), name: str(formData.get("name")) ?? "Service", department: String(formData.get("department") ?? "kitchen") as "kitchen" | "service" | "stewarding" | "bar" | "housekeeping" | "engineering" | "front_office" | "management", shift_label: str(formData.get("shift_label")), starts_at: str(formData.get("starts_at")), ends_at: str(formData.get("ends_at")), hours_per_cover: num(formData.get("hours_per_cover")), minutes_per_room: num(formData.get("minutes_per_room")), fixed_hours: num(formData.get("fixed_hours")) ?? 0, min_hours: num(formData.get("min_hours")) ?? 0, sort_order: num(formData.get("sort_order")) ?? 0, active: formData.get("active") !== "off" };
  const r = touched(lineId ? await supabase.from("service_lines").update(row).eq("id", lineId).eq("property_id", propertyId).select("id") : await supabase.from("service_lines").insert(row).select("id"));
  if (!r.ok) return r;
  revalidatePath("/settings/staffing");
  return r;
}

export async function saveTeamMember(propertyId: string, memberId: string | null, formData: FormData): Promise<Result> {
  const { supabase } = await me();
  const row = { property_id: propertyId, name: str(formData.get("name")) ?? "", department: String(formData.get("department") ?? "kitchen") as "kitchen" | "service" | "stewarding" | "bar" | "housekeeping" | "engineering" | "front_office" | "management", role: str(formData.get("role")) ?? "cook", phone: str(formData.get("phone")), email: str(formData.get("email")), hourly_cost: num(formData.get("hourly_cost")), pool: formData.get("pool") === "on", active: formData.get("active") !== "off" };
  if (!row.name) return { ok: false, error: "A name is needed" };
  const r = touched(memberId ? await supabase.from("team_members").update(row).eq("id", memberId).eq("property_id", propertyId).select("id") : await supabase.from("team_members").insert(row).select("id"));
  if (!r.ok) return r;
  revalidatePath("/settings/team");
  return r;
}

/** The roles a GM can grant from the app: one hotel, one operational job. Portfolio and admin roles are granted outside the app. */
const INVITABLE_ROLES = ["gm", "fnb_mgr", "chef", "sous_chef", "prep_cook", "hk", "eng", "auditor"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** Invite someone to the app: a membership by email; it attaches to their account at first sign-in. */
export async function inviteMember(propertyId: string, formData: FormData): Promise<Result> {
  const { supabase } = await me();
  const email = str(formData.get("email"))?.toLowerCase();
  const role = String(formData.get("role") ?? "chef") as InvitableRole;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "A valid email is needed" };
  if (!INVITABLE_ROLES.includes(role)) return { ok: false, error: "That role is granted outside the app" };
  // the organisation is the hotel's own, never the caller's choice
  const { data: prop } = await supabase.from("properties").select("org_id").eq("id", propertyId).single();
  if (!prop) return { ok: false, error: NOT_ALLOWED };
  const { data: existing } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  const { error } = await supabase.from("memberships").insert({ invited_email: email, user_id: existing?.id ?? null, scope_type: "property", org_id: prop.org_id, property_id: propertyId, role });
  if (error) return fail(error);
  // send the sign-in link when the mailer is configured (service role, server only)
  try {
    const admin = createAdminClient();
    await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?next=/` });
  } catch {
    // no mailer locally: the person signs in with the link flow once email is set up
  }
  revalidatePath("/settings/team");
  return { ok: true, label: `Invited ${email}` };
}

export async function removeMember(membershipId: string): Promise<Result> {
  const { supabase } = await me();
  const r = touched(await supabase.from("memberships").update({ active: false }).eq("id", membershipId).select("id"), "Removed");
  if (!r.ok) return r;
  revalidatePath("/settings/team");
  return r;
}

// ── engine on demand ────────────────────────────────────────────────────────

export async function runJobNow(propertyId: string, job: "brief" | "dawn" | "debrief" | "nightly" | "staffing"): Promise<Result> {
  const { supabase } = await me();
  // only gm/admin on the property (RLS on job_runs does not cover writes with the service role, so check here)
  const { data: ok } = await supabase.rpc("sf_can", { p_property: propertyId, p_roles: ["gm", "fnb_mgr", "chef"] });
  if (!ok) return { ok: false, error: "Only the GM, the F&B manager or the chef can run the engine" };
  const { data: prop } = await supabase.from("properties").select("timezone").eq("id", propertyId).single();
  const today = todayIn(prop?.timezone ?? "UTC");
  const db = createAdminClient();
  try {
    switch (job) {
      case "brief": await runEveningBrief(db, propertyId, plusDays(today, 1), "evening"); break;
      case "dawn": await runEveningBrief(db, propertyId, today, "dawn"); break;
      case "debrief": await runDebrief(db, propertyId, today); break;
      case "nightly": await runNightlyReport(db, propertyId, today); break;
      case "staffing": await runStaffing(db, propertyId, today, 14); break;
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, label: "Done" };
}
