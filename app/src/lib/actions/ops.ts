"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PROPERTY_COOKIE_NAME } from "@/lib/data/context";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

type J = NonNullable<Json>;

type Result = { ok: true; label?: string } | { ok: false; error: string };
const fail = (e: { message: string } | null | undefined, fallback = "Not allowed"): Result => ({ ok: false, error: e?.message ?? fallback });

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ── session ──────────────────────────────────────────────────────────────────

export async function switchProperty(formData: FormData) {
  const id = String(formData.get("property_id") ?? "");
  if (id) {
    const store = await cookies();
    store.set(PROPERTY_COOKIE_NAME, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── decisions and plans (human in the loop) ─────────────────────────────────

export async function approveDecision(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("decisions").update({ status: "approved", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed");
  if (error) return fail(error);
  revalidatePath("/brief");
  revalidatePath("/home");
  revalidatePath("/tonight");
  return { ok: true, label: "Approved" };
}

export async function rejectDecision(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("decisions").update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/brief");
  return { ok: true, label: "Kept as is" };
}

/** Confirm the whole plan of a forecast: every station line becomes approved, the forecast confirmed. */
export async function confirmPlan(forecastId: string): Promise<Result> {
  const { supabase, user } = await me();
  const now = new Date().toISOString();
  const { error: e1 } = await supabase.from("station_plans").update({ status: "approved", approved_by: user.id, approved_at: now }).eq("forecast_id", forecastId).eq("status", "proposed");
  if (e1) return fail(e1);
  const { error: e2 } = await supabase.from("forecasts").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: now }).eq("id", forecastId);
  if (e2) return fail(e2);
  await supabase.from("decisions").update({ status: "approved", decided_by: user.id, decided_at: now }).eq("forecast_id", forecastId).eq("status", "proposed").eq("kind", "hold");
  revalidatePath("/plan");
  revalidatePath("/live");
  return { ok: true };
}

export async function setStationStatus(planLineId: string, status: "prepped" | "running_low" | "closed" | "approved"): Promise<Result> {
  const { supabase, user } = await me();
  const patch: TablesUpdate<"station_plans"> = { status };
  if (status === "prepped") patch.prepped_at = new Date().toISOString();
  if (status === "approved") {
    patch.approved_by = user.id;
    patch.approved_at = new Date().toISOString();
  }
  const { error } = await supabase.from("station_plans").update(patch).eq("id", planLineId);
  if (error) return fail(error);
  revalidatePath("/live");
  revalidatePath("/plan");
  return { ok: true, label: status === "prepped" ? "Prepped" : status === "running_low" ? "Flagged" : status === "closed" ? "Closed" : "Approved" };
}

/** A person's correction on a station: enters the next plan through the learning loop. */
export async function correctStation(input: { outletId: string; propertyId: string; stationId: string; serviceDate: string; factor: number; note?: string }): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("plan_corrections").insert({ property_id: input.propertyId, outlet_id: input.outletId, station_id: input.stationId, service_date: input.serviceDate, factor: input.factor, note: input.note ?? null, created_by: user.id });
  if (error) return fail(error);
  revalidatePath("/plan");
  return { ok: true, label: "Noted for the next plan" };
}

// ── live service ─────────────────────────────────────────────────────────────

export async function actOnLiveEvent(id: string, decision: "approved" | "dismissed"): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("live_events").update({ status: decision, acted_by: user.id, acted_at: new Date().toISOString() }).eq("id", id).eq("status", "open");
  if (error) return fail(error);
  revalidatePath("/live");
  return { ok: true, label: decision === "approved" ? "Approved" : "Dismissed" };
}

export async function logPace(input: { propertyId: string; outletId: string; serviceDate: string; covers: number }): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("pos_pace").insert({ property_id: input.propertyId, outlet_id: input.outletId, service_date: input.serviceDate, covers_seated: input.covers, source: "manual", logged_by: user.id });
  if (error) return fail(error);
  revalidatePath("/live");
  return { ok: true, label: `${input.covers} seated` };
}

export async function closeService(input: { propertyId: string; outletId: string; serviceDate: string; actualCovers: number }): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("service_actuals").upsert({ property_id: input.propertyId, outlet_id: input.outletId, service_date: input.serviceDate, actual_covers: input.actualCovers, source: "manual", closed_by: user.id, closed_at: new Date().toISOString() }, { onConflict: "outlet_id,service_date" });
  if (error) return fail(error);
  revalidatePath("/waste");
  revalidatePath("/live");
  return { ok: true, label: "Service closed" };
}

// ── logs (voice or text) ─────────────────────────────────────────────────────

export interface WasteLogInput {
  propertyId: string;
  outletId: string;
  stationId: string | null;
  serviceDate: string;
  kg: number;
  reason: string | null;
  transcript: string;
  language: string | null;
  source: "voice" | "manual";
  secondsToLog: number | null;
}

export async function logWaste(input: WasteLogInput): Promise<Result> {
  const { supabase, user } = await me();
  const { data, error } = await supabase
    .from("waste_logs")
    .insert({ property_id: input.propertyId, outlet_id: input.outletId, station_id: input.stationId, service_date: input.serviceDate, kg: input.kg, reason: input.reason, source: input.source, transcript: input.transcript, language: input.language, logged_by: user.id, seconds_to_log: input.secondsToLog })
    .select("id")
    .single();
  if (error) return fail(error);
  await supabase.from("voice_logs").insert({ property_id: input.propertyId, outlet_id: input.outletId, department: "kitchen", transcript: input.transcript, language: input.language, parsed: { intent: "waste", station_id: input.stationId, kg: input.kg, reason: input.reason } as J, applied_table: "waste_logs", applied_id: data.id, confidence: 1, seconds_to_log: input.secondsToLog, logged_by: user.id });
  revalidatePath("/waste");
  revalidatePath("/live");
  return { ok: true, label: `${input.kg} kg logged` };
}

export async function logRoom(input: { propertyId: string; roomId: string; serviceDate: string; status: "done" | "in_progress" | "inspected" | "skipped"; minutes: number | null; transcript: string; language: string | null; dndLifted?: boolean }): Promise<Result> {
  const { supabase, user } = await me();
  const patch: TablesUpdate<"room_tasks"> = { status: input.status };
  const now = new Date().toISOString();
  if (input.status === "done") {
    patch.done_at = now;
    if (input.minutes != null) patch.minutes = input.minutes;
  }
  if (input.status === "in_progress") patch.started_at = now;
  if (input.status === "inspected") patch.inspected_at = now;
  if (input.dndLifted) patch.dnd_until = null;
  // the task of the day for this room (any kind): the latest open one, else the first
  const { data: task } = await supabase.from("room_tasks").select("id, status").eq("room_id", input.roomId).eq("service_date", input.serviceDate).order("priority").limit(1).maybeSingle();
  if (!task) return { ok: false, error: "No task for that room today" };
  const { error } = await supabase.from("room_tasks").update(patch).eq("id", task.id);
  if (error) return fail(error);
  await supabase.from("voice_logs").insert({ property_id: input.propertyId, department: "housekeeping", transcript: input.transcript, language: input.language, parsed: { intent: "room", room_id: input.roomId, status: input.status, minutes: input.minutes } as J, applied_table: "room_tasks", applied_id: task.id, confidence: 1, logged_by: user.id });
  revalidatePath("/rooms");
  return { ok: true, label: input.status === "done" ? `Done${input.minutes ? ` · ${input.minutes} min` : ""}` : input.status };
}

export async function raiseFault(input: { propertyId: string; title: string; detail: string | null; roomId: string | null; assetId: string | null; priority: "high" | "medium" | "low"; transcript: string; language: string | null; resolve?: boolean }): Promise<Result> {
  const { supabase, user } = await me();
  if (input.resolve && input.assetId) {
    await supabase.from("assets").update({ status: "ok", status_note: "back in service" }).eq("id", input.assetId);
    await supabase.from("work_orders").update({ status: "closed", closed_at: new Date().toISOString() }).eq("asset_id", input.assetId).in("status", ["open", "in_progress"]);
    revalidatePath("/faults");
    return { ok: true, label: "Back in service" };
  }
  const { data, error } = await supabase.from("work_orders").insert({ property_id: input.propertyId, title: input.title, detail: input.detail, room_id: input.roomId, asset_id: input.assetId, priority: input.priority, guest_impact: input.roomId ? "in_room" : input.assetId ? "guest_facing" : "none", status: "open", raised_by: user.id, source: "voice" }).select("id").single();
  if (error) return fail(error);
  await supabase.from("voice_logs").insert({ property_id: input.propertyId, department: "engineering", transcript: input.transcript, language: input.language, parsed: { intent: "fault", title: input.title } as J, applied_table: "work_orders", applied_id: data.id, confidence: 1, logged_by: user.id });
  revalidatePath("/faults");
  return { ok: true, label: "Fault raised" };
}

// ── rooms, engineering, roster, finance ─────────────────────────────────────

export async function updateRoomTask(id: string, status: "todo" | "in_progress" | "done" | "inspected" | "skipped", minutes?: number): Promise<Result> {
  const { supabase } = await me();
  const patch: TablesUpdate<"room_tasks"> = { status };
  const now = new Date().toISOString();
  if (status === "in_progress") patch.started_at = now;
  if (status === "done") {
    patch.done_at = now;
    if (minutes != null) patch.minutes = minutes;
  }
  if (status === "inspected") patch.inspected_at = now;
  const { error } = await supabase.from("room_tasks").update(patch).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/rooms");
  return { ok: true, label: status === "inspected" ? "Inspected" : status === "done" ? "Done" : status === "in_progress" ? "Started" : status };
}

/** "Assign the inspection": every VIP room still to do today gets a supervisor inspection task. */
export async function assignInspections(propertyId: string, serviceDate: string): Promise<Result> {
  const { supabase } = await me();
  const { data: tasks, error } = await supabase.from("room_tasks").select("id, room_id, status").eq("property_id", propertyId).eq("service_date", serviceDate).eq("vip", true).neq("status", "inspected");
  if (error) return fail(error);
  const { data: supervisor } = await supabase.from("team_members").select("id").eq("property_id", propertyId).eq("department", "housekeeping").ilike("role", "%supervisor%").limit(1).maybeSingle();
  for (const t of tasks ?? []) {
    await supabase.from("room_tasks").update({ inspected_by: supervisor?.id ?? null, priority: 1 }).eq("id", t.id);
  }
  revalidatePath("/rooms");
  return { ok: true, label: "Inspection assigned" };
}

export async function updateWorkOrder(id: string, status: "open" | "in_progress" | "planned" | "closed"): Promise<Result> {
  const { supabase } = await me();
  const patch: TablesUpdate<"work_orders"> = { status };
  if (status === "closed") patch.closed_at = new Date().toISOString();
  const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/faults");
  return { ok: true, label: status === "closed" ? "Closed" : status === "in_progress" ? "In progress" : status };
}

export async function confirmPlannedWorks(propertyId: string, ids: string[]): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("planned_works").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("property_id", propertyId).in("id", ids).eq("status", "proposed");
  if (error) return fail(error);
  revalidatePath("/faults");
  return { ok: true, label: "Slots confirmed" };
}

/** "Apply the change": the suggestion's moves become shifts on the rota. */
export async function applyRosterSuggestion(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const { data: s, error } = await supabase.from("roster_suggestions").select("*").eq("id", id).single();
  if (error || !s) return fail(error);
  const moves = (Array.isArray(s.moves) ? s.moves : []) as { from_date: string | null; to_date: string; hours: number; service_line_id: string; source: string }[];
  const { data: line } = await supabase.from("service_lines").select("starts_at, ends_at").eq("id", s.service_line_id ?? "").maybeSingle();
  for (const m of moves) {
    if (m.from_date) {
      // take the hours from the day with spare: shorten or cancel the last shift(s) of that day
      const { data: shifts } = await supabase.from("roster_shifts").select("id, hours").eq("service_line_id", m.service_line_id).eq("service_date", m.from_date).neq("status", "cancelled").order("hours", { ascending: false });
      let left = m.hours;
      for (const sh of shifts ?? []) {
        if (left <= 0) break;
        const h = Number(sh.hours);
        if (h <= left + 0.05) {
          await supabase.from("roster_shifts").update({ status: "cancelled", note: `moved to ${m.to_date}` }).eq("id", sh.id);
          left -= h;
        } else {
          await supabase.from("roster_shifts").update({ hours: Math.round((h - left) * 10) / 10, note: `${left} h moved to ${m.to_date}` }).eq("id", sh.id);
          left = 0;
        }
      }
    }
    await supabase.from("roster_shifts").insert({ property_id: s.property_id, service_line_id: m.service_line_id, service_date: m.to_date, starts_at: line?.starts_at ?? "06:00", ends_at: line?.ends_at ?? "14:00", hours: m.hours, status: "draft", note: m.source === "pool" ? "from the pool" : `moved from ${m.from_date}` });
  }
  const { error: e2 } = await supabase.from("roster_suggestions").update({ status: "applied", applied_by: user.id, applied_at: new Date().toISOString() }).eq("id", id);
  if (e2) return fail(e2);
  revalidatePath("/roster");
  return { ok: true, label: "Change applied" };
}

export async function dismissRosterSuggestion(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("roster_suggestions").update({ status: "dismissed", applied_by: user.id, applied_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/roster");
  return { ok: true, label: "Dismissed" };
}

export async function reconcileVariance(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("pos_variances").update({ status: "reconciled", resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/tonight");
  return { ok: true, label: "Reconciled" };
}

export async function markNotificationsRead(): Promise<Result> {
  const { supabase, user } = await me();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/notifications");
  return { ok: true };
}
