/**
 * Lauds Data Governance — export.ts
 *
 * Data portability (right to export) implementation.
 *
 * Export lifecycle:
 *   1. requestDataExport()     — creates a pending request record
 *   2. buildExportPayload()    — queries all scoped tables filtered by org_id
 *   3. serializeToCSV/JSON()   — converts to the requested format
 *   4. uploadToStorage()       — uploads to Supabase Storage, returns signed URL
 *
 * Retention policy:
 *   Export files in Supabase Storage are purged after 30 days. The download URL
 *   (a signed URL) expires after 72 hours — the client must download within that
 *   window. After 72 hours the status is set to 'expired' and the request must
 *   be re-submitted. The 30-day Storage object retention is enforced by the
 *   `purge-expired-exports` scheduled edge function (runs daily).
 *
 * Data residency: All Supabase Storage buckets used here are in APAC regions
 * matching the org's data_residency_region. The export bucket is named
 * `data-exports-{region}`.
 */

import { createServiceClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "json";

export type ExportScope =
  | "pms_daily"
  | "waste_measured"
  | "forecasts"
  | "outcomes"
  | "esg_log"
  | "prediction_log"
  | "events_daily"
  | "weather_daily"
  | "station_pars"
  | "actions"
  | "prep_status";

export interface ExportRequest {
  id: string;
  org_id: string;
  requested_by: string;
  requested_at: string;
  scope: string[];
  format: ExportFormat;
  status: "pending" | "processing" | "ready" | "delivered" | "expired";
  download_url: string | null;
  expires_at: string | null;
  completed_at: string | null;
}

export interface ExportPayload {
  pms_daily?: Record<string, unknown>[];
  waste_measured?: Record<string, unknown>[];
  forecasts?: Record<string, unknown>[];
  outcomes?: Record<string, unknown>[];
  esg_log?: Record<string, unknown>[];
  prediction_log?: Record<string, unknown>[];
  events_daily?: Record<string, unknown>[];
  weather_daily?: Record<string, unknown>[];
  station_pars?: Record<string, unknown>[];
  actions?: Record<string, unknown>[];
  prep_status?: Record<string, unknown>[];
}

/** Download URL validity: 72 hours from generation. */
const EXPORT_URL_TTL_SECONDS = 72 * 60 * 60;

/** Storage object retention: 30 days (enforced by scheduled purge function). */
const EXPORT_STORAGE_RETENTION_DAYS = 30;

// ─── Request creation ─────────────────────────────────────────────────────────

/**
 * Creates a new data export request record with status='pending'.
 *
 * The export is processed asynchronously by the `process-data-exports` edge
 * function, which polls for pending requests and calls buildExportPayload()
 * → serializeTo*() → uploadToStorage() in sequence.
 *
 * @param orgId       - The org whose data should be exported
 * @param requestedBy - The user requesting the export
 * @param scope       - Which tables to include (subset of ExportScope)
 * @param format      - 'csv' or 'json'
 */
export async function requestDataExport(
  orgId: string,
  requestedBy: string,
  scope: ExportScope[],
  format: ExportFormat
): Promise<ExportRequest> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("data_export_requests")
    .insert({
      org_id: orgId,
      requested_by: requestedBy,
      scope,
      format,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create export request: ${error.message}`);
  }

  return data as ExportRequest;
}

// ─── Payload builder ──────────────────────────────────────────────────────────

/**
 * Builds the full export payload for an org by querying all requested tables.
 *
 * All tables are filtered by org_id — either directly (for property-level
 * tables joined through properties.org_id) or via outlet → property chain.
 * No cross-org data is ever included.
 *
 * Tables that are outlet-scoped (waste_measured, forecasts, outcomes, esg_log,
 * prediction_log, station_pars, actions, prep_status) are joined through
 * outlets → properties → org_id.
 *
 * @param orgId - The org to export
 * @param scope - Which tables to include
 */
export async function buildExportPayload(
  orgId: string,
  scope: ExportScope[]
): Promise<ExportPayload> {
  const supabase = createServiceClient();
  const payload: ExportPayload = {};

  // Helper: fetch all property_ids for this org
  const { data: propRows, error: propErr } = await supabase
    .from("properties")
    .select("id")
    .eq("org_id", orgId);

  if (propErr) {
    throw new Error(`Export: failed to fetch properties for org ${orgId}: ${propErr.message}`);
  }

  const propertyIds = (propRows ?? []).map((r) => r.id);

  if (propertyIds.length === 0) {
    // Org has no properties — empty export.
    return payload;
  }

  // Helper: fetch all outlet_ids for this org's properties
  const outletIdsForOrg = async (): Promise<string[]> => {
    const { data: outletRows, error: outletErr } = await supabase
      .from("outlets")
      .select("id")
      .in("property_id", propertyIds);
    if (outletErr) {
      throw new Error(`Export: failed to fetch outlets: ${outletErr.message}`);
    }
    return (outletRows ?? []).map((r) => r.id);
  };

  // Helper: fetch all forecast_ids for this org
  const forecastIdsForOrg = async (outletIds: string[]): Promise<string[]> => {
    const { data: forecastRows, error: fErr } = await supabase
      .from("forecasts")
      .select("id")
      .in("outlet_id", outletIds);
    if (fErr) {
      throw new Error(`Export: failed to fetch forecasts: ${fErr.message}`);
    }
    return (forecastRows ?? []).map((r) => r.id);
  };

  // Fetch outlet-scoped tables lazily only when needed
  let outletIds: string[] | null = null;
  let forecastIds: string[] | null = null;

  const getOutletIds = async (): Promise<string[]> => {
    if (!outletIds) outletIds = await outletIdsForOrg();
    return outletIds;
  };

  const getForecastIds = async (): Promise<string[]> => {
    if (!forecastIds) {
      const oids = await getOutletIds();
      forecastIds = await forecastIdsForOrg(oids);
    }
    return forecastIds;
  };

  // ── pms_daily ────────────────────────────────────────────────────────────────
  if (scope.includes("pms_daily")) {
    const { data, error } = await supabase
      .from("pms_daily")
      .select("*")
      .in("property_id", propertyIds)
      .order("service_date", { ascending: true });
    if (error) throw new Error(`Export pms_daily: ${error.message}`);
    payload.pms_daily = (data ?? []) as Record<string, unknown>[];
  }

  // ── weather_daily ─────────────────────────────────────────────────────────────
  if (scope.includes("weather_daily")) {
    const { data, error } = await supabase
      .from("weather_daily")
      .select("*")
      .in("property_id", propertyIds)
      .order("service_date", { ascending: true });
    if (error) throw new Error(`Export weather_daily: ${error.message}`);
    payload.weather_daily = (data ?? []) as Record<string, unknown>[];
  }

  // ── events_daily ─────────────────────────────────────────────────────────────
  if (scope.includes("events_daily")) {
    const { data, error } = await supabase
      .from("events_daily")
      .select("*")
      .in("property_id", propertyIds)
      .order("service_date", { ascending: true });
    if (error) throw new Error(`Export events_daily: ${error.message}`);
    payload.events_daily = (data ?? []) as Record<string, unknown>[];
  }

  // ── waste_measured ────────────────────────────────────────────────────────────
  if (scope.includes("waste_measured")) {
    const oids = await getOutletIds();
    if (oids.length > 0) {
      const { data, error } = await supabase
        .from("waste_measured")
        .select("*")
        .in("outlet_id", oids)
        .order("service_date", { ascending: true });
      if (error) throw new Error(`Export waste_measured: ${error.message}`);
      payload.waste_measured = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.waste_measured = [];
    }
  }

  // ── forecasts ─────────────────────────────────────────────────────────────────
  if (scope.includes("forecasts")) {
    const oids = await getOutletIds();
    if (oids.length > 0) {
      const { data, error } = await supabase
        .from("forecasts")
        .select("*")
        .in("outlet_id", oids)
        .order("service_date", { ascending: true });
      if (error) throw new Error(`Export forecasts: ${error.message}`);
      payload.forecasts = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.forecasts = [];
    }
  }

  // ── outcomes ──────────────────────────────────────────────────────────────────
  if (scope.includes("outcomes")) {
    const oids = await getOutletIds();
    if (oids.length > 0) {
      const { data, error } = await supabase
        .from("outcomes")
        .select("*")
        .in("outlet_id", oids)
        .order("service_date", { ascending: true });
      if (error) throw new Error(`Export outcomes: ${error.message}`);
      payload.outcomes = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.outcomes = [];
    }
  }

  // ── esg_log ───────────────────────────────────────────────────────────────────
  if (scope.includes("esg_log")) {
    const oids = await getOutletIds();
    if (oids.length > 0) {
      const { data, error } = await supabase
        .from("esg_log")
        .select("*")
        .in("outlet_id", oids)
        .order("service_date", { ascending: true });
      if (error) throw new Error(`Export esg_log: ${error.message}`);
      payload.esg_log = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.esg_log = [];
    }
  }

  // ── prediction_log ────────────────────────────────────────────────────────────
  if (scope.includes("prediction_log")) {
    const oids = await getOutletIds();
    if (oids.length > 0) {
      const { data, error } = await supabase
        .from("prediction_log")
        .select("*")
        .in("outlet_id", oids)
        .order("service_date", { ascending: true });
      if (error) throw new Error(`Export prediction_log: ${error.message}`);
      payload.prediction_log = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.prediction_log = [];
    }
  }

  // ── station_pars ──────────────────────────────────────────────────────────────
  if (scope.includes("station_pars")) {
    const fids = await getForecastIds();
    if (fids.length > 0) {
      const { data, error } = await supabase
        .from("station_pars")
        .select("*")
        .in("forecast_id", fids);
      if (error) throw new Error(`Export station_pars: ${error.message}`);
      payload.station_pars = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.station_pars = [];
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────────
  if (scope.includes("actions")) {
    const fids = await getForecastIds();
    if (fids.length > 0) {
      const { data, error } = await supabase
        .from("actions")
        .select("*")
        .in("forecast_id", fids);
      if (error) throw new Error(`Export actions: ${error.message}`);
      payload.actions = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.actions = [];
    }
  }

  // ── prep_status ───────────────────────────────────────────────────────────────
  if (scope.includes("prep_status")) {
    const fids = await getForecastIds();
    if (fids.length > 0) {
      const { data, error } = await supabase
        .from("prep_status")
        .select("*")
        .in("forecast_id", fids);
      if (error) throw new Error(`Export prep_status: ${error.message}`);
      payload.prep_status = (data ?? []) as Record<string, unknown>[];
    } else {
      payload.prep_status = [];
    }
  }

  return payload;
}

// ─── Serializers ──────────────────────────────────────────────────────────────

/**
 * Serializes an ExportPayload to a multi-sheet CSV string.
 *
 * Each top-level key becomes a CSV section prefixed with a header row:
 *   # TABLE: pms_daily
 *   id,property_id,service_date,...
 *   row1...
 *   (blank line between tables)
 *
 * Values are stringified; null → empty string; objects/arrays → JSON.
 */
export function serializeToCSV(payload: ExportPayload): string {
  const sections: string[] = [];

  for (const [tableName, rows] of Object.entries(payload)) {
    if (!rows || rows.length === 0) {
      sections.push(`# TABLE: ${tableName}\n(no data)\n`);
      continue;
    }

    const headers = Object.keys(rows[0]!);
    const headerLine = headers.map(csvEscape).join(",");
    const dataLines = rows.map((row) =>
      headers.map((h) => csvEscape(row[h])).join(",")
    );

    sections.push([`# TABLE: ${tableName}`, headerLine, ...dataLines, ""].join("\n"));
  }

  return sections.join("\n");
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const str = JSON.stringify(value);
    return `"${str.replace(/"/g, '""')}"`;
  }
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes an ExportPayload to a formatted JSON string.
 *
 * Output structure:
 * {
 *   "exported_at": "<ISO timestamp>",
 *   "retention_days": 30,
 *   "tables": { "pms_daily": [...], ... }
 * }
 */
export function serializeToJSON(payload: ExportPayload): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      retention_days: EXPORT_STORAGE_RETENTION_DAYS,
      tables: payload,
    },
    null,
    2
  );
}

// ─── Storage upload ───────────────────────────────────────────────────────────

/**
 * Uploads an export file to Supabase Storage and returns a signed download URL.
 *
 * Storage path: data-exports/{requestId}/{timestamp}.{format}
 * Bucket: 'data-exports' (must be private, APAC region).
 *
 * The signed URL expires in 72 hours (EXPORT_URL_TTL_SECONDS).
 * The Storage object itself is retained for 30 days before purge.
 *
 * After uploading, the function updates the data_export_requests record with:
 *   - status: 'ready'
 *   - download_url: the signed URL
 *   - expires_at: now + 72h
 *   - completed_at: now
 *
 * @returns The signed download URL (valid for 72 hours)
 */
export async function uploadToStorage(
  payload: string,
  format: ExportFormat,
  requestId: string
): Promise<string> {
  const supabase = createServiceClient();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const objectPath = `${requestId}/${timestamp}.${format}`;
  const contentType = format === "json" ? "application/json" : "text/csv";
  const bucket = "data-exports";

  // Upload the file
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, Buffer.from(payload, "utf-8"), {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Export upload failed: ${uploadError.message}`);
  }

  // Generate a signed URL valid for 72 hours
  const { data: signedData, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, EXPORT_URL_TTL_SECONDS);

  if (signError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signError?.message ?? "unknown"}`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPORT_URL_TTL_SECONDS * 1000);

  // Update the request record to 'ready'
  const { error: updateError } = await supabase
    .from("data_export_requests")
    .update({
      status: "ready",
      download_url: signedData.signedUrl,
      expires_at: expiresAt.toISOString(),
      completed_at: now.toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    // Upload succeeded but metadata update failed — log and rethrow.
    // The caller should retry the status update.
    throw new Error(
      `Export uploaded but status update failed for request ${requestId}: ${updateError.message}`
    );
  }

  return signedData.signedUrl;
}
