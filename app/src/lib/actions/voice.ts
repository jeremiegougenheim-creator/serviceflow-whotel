"use server";

import { createClient } from "@/lib/supabase/server";
import { parseVoice, type VoiceIntent } from "@/lib/engine/voice";
import { logPace, logRoom, logWaste, raiseFault, setStationStatus } from "./ops";

export interface VoicePreview {
  intent: VoiceIntent;
  summary: string;
  canApply: boolean;
  /** when only the station is missing: the outlet's stations, to pick with one tap */
  pick?: { id: string; name: string }[];
  context: { propertyId: string; outletId: string | null; serviceDate: string; roomId: string | null };
}

type Result = { ok: true; label?: string; id?: string } | { ok: false; error: string };

/** Parse a transcript in the context of an outlet (kitchen) or the property (rooms, engineering). */
export async function previewVoice(input: { transcript: string; propertyId: string; outletId: string | null; serviceDate: string; department: "kitchen" | "housekeeping" | "engineering" }): Promise<VoicePreview> {
  const supabase = await createClient();
  const [{ data: stations }, { data: assets }] = await Promise.all([
    input.outletId ? supabase.from("stations").select("id, name, slug, settings").eq("outlet_id", input.outletId).eq("active", true) : supabase.from("stations").select("id, name, slug, settings").eq("property_id", input.propertyId).eq("active", true),
    supabase.from("assets").select("id, name").eq("property_id", input.propertyId).eq("active", true),
  ]);
  const intent = parseVoice(input.transcript, {
    stations: (stations ?? []).map((s) => ({ id: s.id, name: s.name, slug: s.slug, aliases: ((s.settings as { aliases?: string[] })?.aliases ?? []) as string[] })),
    assets: (assets ?? []).map((a) => ({ id: a.id, name: a.name })),
  });
  let roomId: string | null = null;
  if ((intent.intent === "room_done" || intent.intent === "room_status" || intent.intent === "fault") && intent.room) {
    const { data: room } = await supabase.from("rooms").select("id").eq("property_id", input.propertyId).eq("number", intent.room).maybeSingle();
    roomId = room?.id ?? null;
  }
  let summary: string;
  let canApply = true;
  let pick: VoicePreview["pick"];
  switch (intent.intent) {
    case "waste":
      summary = intent.kg != null && intent.stationName ? `Log ${intent.kg} kg${intent.reason ? ` ${intent.reason}` : ""} at ${intent.stationName}` : intent.stationName ? `How many kilos at ${intent.stationName}?` : intent.kg != null ? `${intent.kg} kg — which station?` : "Which station, and how many kilos?";
      canApply = intent.kg != null && !!intent.stationId && !!input.outletId;
      if (intent.kg != null && !intent.stationId && input.outletId) {
        summary = `${intent.kg} kg${intent.reason ? ` ${intent.reason}` : ""}. Which station?`;
        pick = (stations ?? []).map((s) => ({ id: s.id, name: s.name }));
      }
      break;
    case "room_done":
      summary = roomId ? `Room ${intent.room} done${intent.minutes ? ` in ${intent.minutes} minutes` : ""}` : `Room ${intent.room} is not on the list`;
      canApply = !!roomId;
      break;
    case "room_status":
      summary = roomId ? `Room ${intent.room}: ${intent.status.replace("_", " ")}` : `Room ${intent.room} is not on the list`;
      canApply = !!roomId;
      break;
    case "fault":
      summary = /back in service/.test(intent.title) ? intent.title : `Raise a ${intent.priority} fault: ${intent.title}`;
      break;
    case "pace":
      summary = `${intent.coversSeated} seated now`;
      canApply = !!input.outletId;
      break;
    case "station_ready":
      summary = intent.stationName ? `Mark ${intent.stationName} prepped` : "Which station?";
      canApply = !!intent.stationId;
      break;
    default:
      summary = "Not understood. Try “Western hot over-prep 2 kg” or “2506 done, 24 minutes”.";
      canApply = false;
  }
  return { intent, summary, canApply, pick, context: { propertyId: input.propertyId, outletId: input.outletId, serviceDate: input.serviceDate, roomId } };
}

/**
 * Write what the person confirmed. The transcript is parsed again here, in the context the
 * page gave (hotel, outlet, date, department): the browser's copy of the preview is only a
 * display, never the thing written.
 */
export async function applyVoice(shown: VoicePreview, meta: { transcript: string; language: string | null; source: "voice" | "manual"; secondsToLog: number | null }): Promise<Result> {
  const department = shown.context.outletId ? "kitchen" : shown.intent.intent === "fault" ? "engineering" : "housekeeping";
  const p = await previewVoice({ transcript: meta.transcript, propertyId: shown.context.propertyId, outletId: shown.context.outletId, serviceDate: shown.context.serviceDate, department });
  const { intent, context } = p;
  if (!p.canApply) return { ok: false, error: p.summary };
  switch (intent.intent) {
    case "waste":
      if (intent.kg == null || !intent.stationId || !context.outletId) return { ok: false, error: "Station and kilos are needed" };
      return logWaste({ propertyId: context.propertyId, outletId: context.outletId, stationId: intent.stationId, serviceDate: context.serviceDate, kg: intent.kg, reason: intent.reason, transcript: meta.transcript, language: meta.language, source: meta.source, secondsToLog: meta.secondsToLog });
    case "room_done":
      if (!context.roomId) return { ok: false, error: "Room not found" };
      return logRoom({ propertyId: context.propertyId, roomId: context.roomId, serviceDate: context.serviceDate, status: "done", minutes: intent.minutes, transcript: meta.transcript, language: meta.language });
    case "room_status": {
      if (!context.roomId) return { ok: false, error: "Room not found" };
      const status = intent.status === "inspect" ? "in_progress" : intent.status === "dnd_lifted" ? "in_progress" : intent.status === "skipped" ? "skipped" : "in_progress";
      return logRoom({ propertyId: context.propertyId, roomId: context.roomId, serviceDate: context.serviceDate, status, minutes: null, transcript: meta.transcript, language: meta.language, dndLifted: intent.status === "dnd_lifted" });
    }
    case "fault":
      return raiseFault({ propertyId: context.propertyId, title: intent.title, detail: meta.transcript, roomId: context.roomId, assetId: intent.assetId, priority: intent.priority, transcript: meta.transcript, language: meta.language, resolve: /back in service/.test(intent.title) });
    case "pace":
      if (!context.outletId) return { ok: false, error: "Open an outlet first" };
      return logPace({ propertyId: context.propertyId, outletId: context.outletId, serviceDate: context.serviceDate, covers: intent.coversSeated });
    case "station_ready": {
      if (!intent.stationId) return { ok: false, error: "Station not found" };
      const supabase = await createClient();
      const { data: f } = await supabase.from("forecasts").select("id").eq("outlet_id", context.outletId ?? "").eq("service_date", context.serviceDate).order("version", { ascending: false }).limit(1).maybeSingle();
      if (!f) return { ok: false, error: "No plan for today" };
      const { data: lines } = await supabase.from("station_plans").select("id").eq("forecast_id", f.id).eq("station_id", intent.stationId);
      for (const l of lines ?? []) await setStationStatus(l.id, "prepped");
      return { ok: true, label: `${intent.stationName} prepped` };
    }
    default:
      return { ok: false, error: "Nothing to apply" };
  }
}
