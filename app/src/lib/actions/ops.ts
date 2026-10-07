"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContext, PROPERTY_COOKIE_NAME, ROLE_COOKIE_NAME, type Role } from "@/lib/data/context";
import { homeFor } from "@/lib/nav";
import { runLive } from "@/lib/engine/run";
import { nowClock, todayIn } from "@/lib/format";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

type J = NonNullable<Json>;

type Result = { ok: true; label?: string; id?: string } | { ok: false; error: string; stale?: boolean };
const fail = (e: { message: string } | null | undefined, fallback = "Not allowed"): Result => ({ ok: false, error: e?.message ?? fallback });
const NOT_ALLOWED = "Your role cannot make this change";
const UNDO_MS = 10 * 60_000;

type Decidable = "decisions" | "roster_suggestions" | "live_events" | "planned_works" | "pos_variances";
const WORD: Record<string, string> = { approved: "approved", done: "done", rejected: "kept as is", applied: "applied", dismissed: "set aside", confirmed: "confirmed", reconciled: "reconciled", expired: "superseded", cancelled: "cancelled" };

/**
 * Why a write touched nothing: the row was decided by someone else (the screen is stale and
 * refreshes), or the role may not make it. Two different messages for two different situations.
 */
async function refused(supabase: Awaited<ReturnType<typeof createClient>>, table: Decidable, id: string, waiting: string[]): Promise<Result> {
  const { data } = await supabase.from(table).select("status").eq("id", id).maybeSingle();
  const status = (data as { status?: string } | null)?.status;
  if (!status || waiting.includes(status)) return { ok: false, error: NOT_ALLOWED };
  return { ok: false, error: `Already ${WORD[status] ?? status.replace(/_/g, " ")} by someone else. The screen is up to date now.`, stale: true };
}

/**
 * An update that row level security filters out returns no error and no rows. Every write
 * from the app asks for the rows it touched and treats "none" as a refusal, so a screen
 * never says "Approved" for a change the database did not make.
 */
function touched(r: { error: { message: string } | null; data: { id: string }[] | null }, label?: string): Result {
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

// ── session ──────────────────────────────────────────────────────────────────

export async function switchProperty(formData: FormData) {
  const id = String(formData.get("property_id") ?? "");
  const next = String(formData.get("next") ?? "");
  if (id) {
    const store = await cookies();
    store.set(PROPERTY_COOKIE_NAME, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
  // from the portfolio, a tap on a hotel opens that hotel's screens
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
}

/** "View as": switch the role in view among the roles the user already holds on this hotel. Grants nothing. */
export async function switchRole(formData: FormData) {
  const role = String(formData.get("role") ?? "") as Role;
  const ctx = await getContext();
  if (!ctx.heldRoles.includes(role)) throw new Error("you do not hold that role on this hotel");
  const store = await cookies();
  store.set(ROLE_COOKIE_NAME, role, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  revalidatePath("/", "layout");
  redirect(homeFor(role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── decisions and plans (human in the loop) ─────────────────────────────────

function revalidateDecisions() {
  for (const p of ["/brief", "/home", "/tonight", "/roster", "/plan"]) revalidatePath(p);
}

export async function approveDecision(id: string): Promise<Result> {
  const { supabase, user } = await me();
  // a roster move proposed tonight is the roster suggestion itself: approving it applies it, once
  const { data: d } = await supabase.from("decisions").select("payload, status").eq("id", id).maybeSingle();
  const suggestionId = (d?.payload as { suggestion_id?: string } | null)?.suggestion_id;
  if (suggestionId && d?.status === "proposed") {
    const applied = await applyRosterSuggestion(suggestionId);
    if (!applied.ok) return applied;
    revalidateDecisions();
    return { ok: true, label: "Applied to the roster" };
  }
  const r = touched(await supabase.from("decisions").update({ status: "approved", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed").select("id"), "Approved");
  if (!r.ok) return refused(supabase, "decisions", id, ["proposed"]);
  revalidateDecisions();
  return r;
}

export async function rejectDecision(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const r = touched(await supabase.from("decisions").update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed").select("id"), "Kept as is");
  if (!r.ok) return refused(supabase, "decisions", id, ["proposed"]);
  const { data: d } = await supabase.from("decisions").select("payload").eq("id", id).maybeSingle();
  const suggestionId = (d?.payload as { suggestion_id?: string } | null)?.suggestion_id;
  if (suggestionId) await supabase.from("roster_suggestions").update({ status: "dismissed", applied_by: user.id, applied_at: new Date().toISOString() }).eq("id", suggestionId).eq("status", "proposed").select("id");
  revalidateDecisions();
  return r;
}

/** Undo, for ten minutes, by the person who decided. A decision that moved shifts is not undone here. */
export async function revertDecision(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const since = new Date(Date.now() - UNDO_MS).toISOString();
  const { data: d } = await supabase.from("decisions").select("payload").eq("id", id).maybeSingle();
  if ((d?.payload as { suggestion_id?: string } | null)?.suggestion_id) return { ok: false, error: "Roster moves are undone on the roster" };
  const r = touched(await supabase.from("decisions").update({ status: "proposed", decided_by: null, decided_at: null }).eq("id", id).in("status", ["approved", "rejected"]).eq("decided_by", user.id).gte("decided_at", since).select("id"), "Undone");
  if (!r.ok) return { ok: false, error: "Only the person who decided can undo, within ten minutes" };
  revalidateDecisions();
  return r;
}

/** Confirm the whole plan of a forecast: every station line becomes approved, the forecast confirmed. */
export async function confirmPlan(forecastId: string): Promise<Result> {
  const { supabase, user } = await me();
  const now = new Date().toISOString();
  const { error: e1 } = await supabase.from("station_plans").update({ status: "approved", approved_by: user.id, approved_at: now }).eq("forecast_id", forecastId).eq("status", "proposed").select("id");
  if (e1) return fail(e1);
  const r = touched(await supabase.from("forecasts").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: now }).eq("id", forecastId).in("status", ["issued", "confirmed"]).select("id"), "Plan confirmed");
  if (!r.ok) return r;
  await supabase.from("decisions").update({ status: "approved", decided_by: user.id, decided_at: now }).eq("forecast_id", forecastId).eq("status", "proposed").eq("kind", "hold").select("id");
  revalidatePath("/plan");
  revalidatePath("/live");
  return r;
}

export async function setStationStatus(planLineId: string, status: "prepped" | "running_low" | "closed" | "approved"): Promise<Result> {
  const { supabase, user } = await me();
  const patch: TablesUpdate<"station_plans"> = { status };
  if (status === "prepped") patch.prepped_at = new Date().toISOString();
  if (status === "approved") {
    patch.approved_by = user.id;
    patch.approved_at = new Date().toISOString();
  }
  const r = touched(await supabase.from("station_plans").update(patch).eq("id", planLineId).select("id"), status === "prepped" ? "Prepped" : status === "running_low" ? "Flagged" : status === "closed" ? "Closed" : "Approved");
  if (!r.ok) return r;
  revalidatePath("/live");
  revalidatePath("/plan");
  return r;
}

/**
 * The chef changes one station's quantity before confirming: the opening wave moves by delta
 * (never below zero) and the correction is kept for the next plan.
 */
export async function adjustStation(input: { forecastId: string; stationId: string; delta: number }): Promise<Result> {
  const { supabase, user } = await me();
  const [{ data: lines }, { data: f }] = await Promise.all([
    supabase.from("station_plans").select("id, qty, status, property_id, waves(starts_at)").eq("forecast_id", input.forecastId).eq("station_id", input.stationId),
    supabase.from("forecasts").select("outlet_id, service_date").eq("id", input.forecastId).maybeSingle(),
  ]);
  const list = (lines ?? []).sort((a, b) => String((a.waves as { starts_at?: string } | null)?.starts_at ?? "").localeCompare(String((b.waves as { starts_at?: string } | null)?.starts_at ?? "")));
  const first = list[0];
  if (!first) return { ok: false, error: "No plan line for this station" };
  if (list.some((l) => l.status === "prepped" || l.status === "closed")) return { ok: false, error: "Already prepped: change it on Live" };
  const total = list.reduce((s, l) => s + Number(l.qty), 0);
  const qty = Math.max(0, Number(first.qty) + input.delta);
  const r = touched(await supabase.from("station_plans").update({ qty, reason: `chef ${input.delta > 0 ? "+" : "−"}${Math.abs(input.delta)}` }).eq("id", first.id).select("id"), `${input.delta > 0 ? "+" : "−"}${Math.abs(input.delta)}`);
  if (!r.ok) return r;
  if (total > 0 && f) await supabase.from("plan_corrections").insert({ property_id: first.property_id, outlet_id: f.outlet_id, station_id: input.stationId, service_date: f.service_date, factor: Math.min(3, Math.max(0.2, Math.round(((total - Number(first.qty) + qty) / total) * 1000) / 1000)), note: "chef, before service", created_by: user.id });
  revalidatePath("/plan");
  revalidatePath("/live");
  return r;
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

/**
 * A live proposal, approved, becomes a decision on the record and a change to the plan:
 * "bring the next wave forward, +4 portions" adds the portions to that station line.
 * Nothing moves until the person taps Approve (rule 4).
 */
export async function actOnLiveEvent(id: string, decision: "approved" | "dismissed"): Promise<Result> {
  const { supabase, user } = await me();
  const now = new Date().toISOString();
  const { data: ev } = await supabase.from("live_events").select("*").eq("id", id).eq("status", "open").maybeSingle();
  if (!ev) return refused(supabase, "live_events", id, ["open"]);
  let decisionId: string | null = null;
  if (decision === "approved") {
    const payload = (ev.payload ?? {}) as { add?: number; nextWave?: string; forecast_id?: string; stations?: { id: string }[] };
    const { data: d, error: e1 } = await supabase
      .from("decisions")
      .insert({ property_id: ev.property_id, outlet_id: ev.outlet_id, forecast_id: payload.forecast_id ?? null, station_id: ev.station_id, service_date: ev.service_date, rank: 9, kind: ev.kind === "waste_risk" ? "hold" : ev.kind === "running_fast" ? "boost" : "other", department: "kitchen", title: ev.proposal ?? ev.title, detail: ev.body, reason: ev.title, delta_pct: null, est_saving: 0, source: "live", status: "approved", decided_by: user.id, decided_at: now, payload: ev.payload as J })
      .select("id")
      .single();
    if (e1) return fail(e1);
    decisionId = d.id;
    // the plan moves with the approval: the extra portions land on the next wave's line
    if (ev.kind === "running_fast" && payload.add && payload.nextWave && ev.station_id && payload.forecast_id) {
      const { data: line } = await supabase.from("station_plans").select("id, qty").eq("forecast_id", payload.forecast_id).eq("station_id", ev.station_id).eq("wave_id", payload.nextWave).maybeSingle();
      if (line) await supabase.from("station_plans").update({ qty: Number(line.qty) + payload.add, reason: `+${payload.add} on approval · ${ev.title}` }).eq("id", line.id).select("id");
    }
  }
  const r = touched(await supabase.from("live_events").update({ status: decision, acted_by: user.id, acted_at: now, decision_id: decisionId }).eq("id", id).eq("status", "open").select("id"), decision === "approved" ? "Approved" : "Not now");
  if (!r.ok) return refused(supabase, "live_events", id, ["open"]);
  revalidatePath("/live");
  return r;
}

export async function logPace(input: { propertyId: string; outletId: string; serviceDate: string; covers: number }): Promise<Result> {
  const { supabase, user } = await me();
  const { error } = await supabase.from("pos_pace").insert({ property_id: input.propertyId, outlet_id: input.outletId, service_date: input.serviceDate, covers_seated: input.covers, source: "manual", logged_by: user.id });
  if (error) return fail(error);
  // a fresh count is the moment to re-read the service: the proposals follow the pace at once
  try {
    const { data: prop } = await supabase.from("properties").select("timezone").eq("id", input.propertyId).single();
    const tz = prop?.timezone ?? "UTC";
    if (todayIn(tz) === input.serviceDate) await runLive(createAdminClient(), input.propertyId, input.outletId, input.serviceDate, nowClock(tz));
  } catch {
    // the scheduled tick will pick it up
  }
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
  return { ok: true, label: `${input.kg} kg logged`, id: data.id };
}

/** Undo a waste log: the author, within ten minutes (row level security allows a day). */
export async function undoWasteLog(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const since = new Date(Date.now() - UNDO_MS).toISOString();
  const r = touched(await supabase.from("waste_logs").delete().eq("id", id).eq("logged_by", user.id).gte("logged_at", since).select("id"), "Removed");
  if (!r.ok) return { ok: false, error: "Only the person who logged it can remove it, within ten minutes" };
  revalidatePath("/waste");
  revalidatePath("/live");
  return r;
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
  // the task of the day for this room: the one still to do, else the latest of the day
  const { data: tasks } = await supabase.from("room_tasks").select("id, status").eq("property_id", input.propertyId).eq("room_id", input.roomId).eq("service_date", input.serviceDate).order("priority");
  const task = (tasks ?? []).find((t) => t.status === "todo" || t.status === "in_progress") ?? (tasks ?? []).at(-1);
  if (!task) return { ok: false, error: "No task for that room today" };
  const r = touched(await supabase.from("room_tasks").update(patch).eq("id", task.id).select("id"));
  if (!r.ok) return r;
  await supabase.from("voice_logs").insert({ property_id: input.propertyId, department: "housekeeping", transcript: input.transcript, language: input.language, parsed: { intent: "room", room_id: input.roomId, status: input.status, minutes: input.minutes } as J, applied_table: "room_tasks", applied_id: task.id, confidence: 1, logged_by: user.id });
  revalidatePath("/rooms");
  return { ok: true, label: input.status === "done" ? `Done${input.minutes ? ` · ${input.minutes} min` : ""}` : input.status };
}

export async function raiseFault(input: { propertyId: string; title: string; detail: string | null; roomId: string | null; assetId: string | null; priority: "high" | "medium" | "low"; transcript: string; language: string | null; resolve?: boolean }): Promise<Result> {
  const { supabase, user } = await me();
  if (input.resolve && input.assetId) {
    const r = touched(await supabase.from("assets").update({ status: "ok", status_note: "back in service" }).eq("id", input.assetId).eq("property_id", input.propertyId).select("id"), "Back in service");
    if (!r.ok) return r;
    await supabase.from("work_orders").update({ status: "closed", closed_at: new Date().toISOString() }).eq("asset_id", input.assetId).in("status", ["open", "in_progress"]).select("id");
    revalidatePath("/faults");
    return r;
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
  const r = touched(await supabase.from("room_tasks").update(patch).eq("id", id).select("id"), status === "inspected" ? "Inspected" : status === "done" ? "Done" : status === "in_progress" ? "Started" : status);
  if (!r.ok) return r;
  revalidatePath("/rooms");
  return r;
}

/** Undo "Done" within ten minutes: the room goes back on the list where it was. */
export async function revertRoomTask(id: string): Promise<Result> {
  const { supabase } = await me();
  const since = new Date(Date.now() - UNDO_MS).toISOString();
  const r = touched(await supabase.from("room_tasks").update({ status: "todo", done_at: null, minutes: null }).eq("id", id).eq("status", "done").gte("done_at", since).select("id"), "Back on the list");
  if (!r.ok) return { ok: false, error: "Only a room marked done in the last ten minutes can be undone" };
  revalidatePath("/rooms");
  return r;
}

/** "Assign the inspection": every VIP room still to do today gets a supervisor inspection task. */
export async function assignInspections(propertyId: string, serviceDate: string): Promise<Result> {
  const { supabase } = await me();
  const { data: tasks, error } = await supabase.from("room_tasks").select("id, room_id, status").eq("property_id", propertyId).eq("service_date", serviceDate).eq("vip", true).neq("status", "inspected");
  if (error) return fail(error);
  const { data: supervisor } = await supabase.from("team_members").select("id").eq("property_id", propertyId).eq("department", "housekeeping").ilike("role", "%supervisor%").limit(1).maybeSingle();
  let n = 0;
  for (const t of tasks ?? []) {
    const { data } = await supabase.from("room_tasks").update({ inspected_by: supervisor?.id ?? null, priority: 1 }).eq("id", t.id).select("id");
    n += data?.length ?? 0;
  }
  if ((tasks ?? []).length && !n) return { ok: false, error: NOT_ALLOWED };
  revalidatePath("/rooms");
  return { ok: true, label: n ? `Inspection assigned · ${n} ${n === 1 ? "room" : "rooms"}` : "Nothing to assign" };
}

export async function updateWorkOrder(id: string, status: "open" | "in_progress" | "planned" | "closed"): Promise<Result> {
  const { supabase } = await me();
  const patch: TablesUpdate<"work_orders"> = { status };
  if (status === "closed") patch.closed_at = new Date().toISOString();
  else patch.closed_at = null;
  const r = touched(await supabase.from("work_orders").update(patch).eq("id", id).select("id"), status === "closed" ? "Closed" : status === "in_progress" ? "Started" : status === "open" ? "Reopened" : "Planned");
  if (!r.ok) return r;
  revalidatePath("/faults");
  return r;
}

export async function confirmPlannedWorks(propertyId: string, ids: string[]): Promise<Result> {
  const { supabase, user } = await me();
  const r = touched(await supabase.from("planned_works").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("property_id", propertyId).in("id", ids).eq("status", "proposed").select("id"), "Slots confirmed");
  if (!r.ok) return ids[0] ? refused(supabase, "planned_works", ids[0], ["proposed"]) : r;
  revalidatePath("/faults");
  return r;
}

/** "Apply the change": the suggestion's moves become shifts on the rota. */
export async function applyRosterSuggestion(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const { data: s, error } = await supabase.from("roster_suggestions").select("*").eq("id", id).eq("status", "proposed").maybeSingle();
  if (error || !s) return error ? fail(error) : refused(supabase, "roster_suggestions", id, ["proposed"]);
  // the right to apply is checked before any shift moves: a reader never half-applies a change
  const { data: allowed } = await supabase.rpc("sf_can", { p_property: s.property_id, p_roles: ["gm", "fnb_mgr", "chef", "hk"] });
  if (!allowed) return { ok: false, error: NOT_ALLOWED };
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
  const r = touched(await supabase.from("roster_suggestions").update({ status: "applied", applied_by: user.id, applied_at: new Date().toISOString() }).eq("id", id).select("id"), "Move applied");
  if (!r.ok) return r;
  // the same move proposed in tonight's report is now decided too
  await supabase.from("decisions").update({ status: "approved", decided_by: user.id, decided_at: new Date().toISOString() }).eq("property_id", s.property_id).eq("payload->>suggestion_id", id).eq("status", "proposed").select("id");
  revalidatePath("/roster");
  revalidatePath("/tonight");
  revalidatePath("/home");
  return r;
}

export async function dismissRosterSuggestion(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const r = touched(await supabase.from("roster_suggestions").update({ status: "dismissed", applied_by: user.id, applied_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed").select("id"), "Set aside");
  if (!r.ok) return refused(supabase, "roster_suggestions", id, ["proposed"]);
  await supabase.from("decisions").update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString() }).eq("payload->>suggestion_id", id).eq("status", "proposed").select("id");
  revalidatePath("/roster");
  revalidatePath("/tonight");
  return r;
}

export async function reconcileVariance(id: string): Promise<Result> {
  const { supabase, user } = await me();
  const r = touched(await supabase.from("pos_variances").update({ status: "reconciled", resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "open").select("id"), "Reconciled");
  if (!r.ok) return refused(supabase, "pos_variances", id, ["open"]);
  revalidatePath("/tonight");
  return r;
}

export async function markNotificationsRead(): Promise<Result> {
  const { supabase, user } = await me();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/notifications");
  return { ok: true };
}

/** Appearance: system (follows the device), light (paper) or dark (night). Kept for a year on this device. */
export async function setTheme(formData: FormData) {
  const v = String(formData.get("theme") ?? "system");
  const theme = v === "light" || v === "dark" ? v : "system";
  const store = await cookies();
  if (theme === "system") store.delete("sf_theme");
  else store.set("sf_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
