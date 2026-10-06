"use client";

/**
 * PaceCheckButton — manual fallback for when the Simphony POS feed is down.
 *
 * Shown only when:
 *   (a) service window is active (06:00 – 10:30 local time), AND
 *   (b) no pace_log entry has arrived from pos_simphony in the last 18 min.
 *
 * Hidden (disabled) as soon as the Simphony feed resumes.
 * Writes source='manual_fallback' to avoid double-counting with POS entries.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaceLogRow {
  id: string;
  logged_at: string;
  covers_cumul: number;
  source: "pos_simphony" | "manual_fallback";
}

interface Props {
  outletId: string;
  serviceDate: string; // "YYYY-MM-DD"
  /** Override for testing — defaults to new Date() */
  nowOverride?: Date;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_START_H = 6;
const SERVICE_END_H = 10;
const SERVICE_END_M = 30;
const SIMPHONY_LAG_THRESHOLD_MS = 18 * 60 * 1000; // 18 min
const POLL_INTERVAL_MS = 60 * 1000; // re-check every 60s

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isServiceActive(now: Date): boolean {
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < SERVICE_START_H) return false;
  if (h > SERVICE_END_H) return false;
  if (h === SERVICE_END_H && m > SERVICE_END_M) return false;
  return true;
}

function simphonyIsStale(lastPosLog: PaceLogRow | null, now: Date): boolean {
  if (!lastPosLog) return true;
  const age = now.getTime() - new Date(lastPosLog.logged_at).getTime();
  return age > SIMPHONY_LAG_THRESHOLD_MS;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaceCheckButton({ outletId, serviceDate, nowOverride }: Props) {
  const supabase = createClient();

  const [lastPosLog, setLastPosLog] = useState<PaceLogRow | null>(null);
  const [lastCumul, setLastCumul] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [now, setNow] = useState(nowOverride ?? new Date());

  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch latest pace_log entries ──────────────────────────────────────────

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("pace_log")
      .select("id, logged_at, covers_cumul, source")
      .eq("outlet_id", outletId)
      .eq("service_date", serviceDate)
      .order("logged_at", { ascending: false })
      .limit(5);

    if (!data) return;

    const posEntry = data.find((r: PaceLogRow) => r.source === "pos_simphony") ?? null;
    setLastPosLog(posEntry as PaceLogRow | null);

    const lastEntry = data[0] ?? null;
    if (lastEntry) setLastCumul((lastEntry as PaceLogRow).covers_cumul);
  }, [supabase, outletId, serviceDate]);

  // ─── Periodic refresh ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!nowOverride) {
      const tick = setInterval(() => setNow(new Date()), POLL_INTERVAL_MS);
      return () => clearInterval(tick);
    }
  }, [nowOverride]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // ─── Derived state ────────────────────────────────────────────────────────────

  const active = isServiceActive(now);
  const stale = simphonyIsStale(lastPosLog, now);
  const showButton = active && stale;

  // ─── Dialog focus ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (dialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [dialogOpen]);

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newCovers = parseInt(inputValue, 10);
    if (isNaN(newCovers) || newCovers < 0) {
      setSubmitError("Enter a valid number ≥ 0");
      return;
    }

    // Guard: if a Simphony entry arrived while the dialog was open, abort
    const staleAtSubmit = simphonyIsStale(lastPosLog, new Date());
    if (!staleAtSubmit) {
      setDialogOpen(false);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const delta = Math.max(0, newCovers - lastCumul);

    // TablesInsert cast: Supabase generic resolution for new tables requires
    // `supabase gen types` to be re-run; the runtime schema is correct.
    const row: TablesInsert<"pace_log"> = {
      outlet_id: outletId,
      service_date: serviceDate,
      covers_cumul: newCovers,
      covers_delta: delta,
      wave_label: currentWaveLabel(new Date()),
      source: "manual_fallback",
      raw_payload: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("pace_log").insert(row);

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
    } else {
      setInputValue("");
      setDialogOpen(false);
      void refresh();
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!showButton) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="
          inline-flex items-center gap-2 rounded-lg
          bg-amber-50 border border-amber-300 text-amber-800
          px-4 py-2 text-sm font-medium
          hover:bg-amber-100 transition-colors
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500
        "
        aria-label="POS unavailable — enter cover count manually"
      >
        <span className="text-amber-500" aria-hidden>⚠</span>
        Pace check
        <span className="text-xs text-amber-600 font-normal">
          ({simphonyLagLabel(lastPosLog, now)})
        </span>
      </button>

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pace-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setDialogOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 id="pace-dialog-title" className="text-base font-semibold text-gray-900 mb-1">
              Pace check
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Nouveaux couverts depuis le dernier check ?
              <br />
              <span className="text-gray-400 text-xs">
                Dernier cumul enregistré : {lastCumul} couverts
              </span>
            </p>

            <form onSubmit={(e) => void handleSubmit(e)}>
              <label htmlFor="pace-covers-input" className="block text-sm font-medium text-gray-700 mb-1">
                Couverts cumulés à l'instant
              </label>
              <input
                ref={inputRef}
                id="pace-covers-input"
                type="number"
                min="0"
                step="1"
                value={inputValue}
                onChange={(e) => { setInputValue(e.target.value); setSubmitError(null); }}
                placeholder={String(lastCumul)}
                className="
                  block w-full rounded-lg border border-gray-300 px-3 py-2
                  text-gray-900 text-lg text-center
                  focus:outline-none focus:ring-2 focus:ring-amber-400
                  mb-3
                "
                disabled={submitting}
              />

              {submitError && (
                <p className="text-sm text-red-600 mb-2" role="alert">{submitError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setDialogOpen(false); setSubmitError(null); }}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  disabled={submitting}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="
                    flex-1 rounded-lg bg-amber-500 text-white px-4 py-2 text-sm font-medium
                    hover:bg-amber-600 disabled:opacity-50
                  "
                  disabled={submitting || inputValue === ""}
                >
                  {submitting ? "Enregistrement…" : "Confirmer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function currentWaveLabel(now: Date): "wave1" | "wave2" | "wave3" {
  const h = now.getHours();
  const m = now.getMinutes();
  const mins = h * 60 + m;
  if (mins < 7 * 60 + 30) return "wave1";
  if (mins < 9 * 60) return "wave2";
  return "wave3";
}

function simphonyLagLabel(lastPosLog: PaceLogRow | null, now: Date): string {
  if (!lastPosLog) return "POS off";
  const ageMin = Math.round((now.getTime() - new Date(lastPosLog.logged_at).getTime()) / 60_000);
  return `POS ${ageMin}min ago`;
}
