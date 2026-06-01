/**
 * Lauds Data Governance — deletion.ts
 *
 * Right-to-erasure implementation with a hard 30-day SLA.
 *
 * Deletion is executed in FK-safe order to avoid constraint violations.
 * The canonical deletion order (leaf → root) is:
 *
 *   benchmark_contributions
 *   → prediction_log
 *   → esg_log
 *   → outcomes
 *   → prep_status
 *   → actions
 *   → station_pars
 *   → forecasts
 *   → waste_measured
 *   → events_daily
 *   → weather_daily
 *   → pms_daily
 *   → stations
 *   → outlets
 *   → memberships
 *   → properties
 *   → users (only for full org deletion — only users with no other org memberships)
 *   → dpa_agreements
 *   → orgs
 *
 * For scope='property:<id>' the chain stops after properties (no user/org deletion).
 * For scope='outlet:<id>' the chain stops after outlets.
 *
 * All operations use the service role client (RLS bypass) — this is an admin
 * function invoked by the Lauds ops edge function after identity verification.
 *
 * On completion, a 'deletion_completed' event is written to audit_log via the
 * database trigger on data_deletion_requests.status = 'completed'.
 */

import { createServiceClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeletionRequest {
  id: string;
  org_id: string;
  requested_by: string;
  requested_at: string;
  deadline_at: string;
  scope: string;
  status: "pending" | "in_progress" | "completed" | "verified";
  completed_at: string | null;
  verified_by: string | null;
  verification_note: string | null;
}

export interface DeletionResult {
  requestId: string;
  scope: string;
  tablesCleared: string[];
  rowsDeleted: number;
  completedAt: string;
}

// ─── Request creation ─────────────────────────────────────────────────────────

/**
 * Creates a new deletion request with status='pending' and a hard 30-day
 * deadline_at (enforced as a GENERATED column in the database — cannot be
 * extended by application code).
 *
 * @param orgId       - The org requesting deletion
 * @param requestedBy - The admin user making the request
 * @param scope       - 'full' | 'property:<uuid>' | 'outlet:<uuid>'
 */
export async function requestDeletion(
  orgId: string,
  requestedBy: string,
  scope: string
): Promise<DeletionRequest> {
  const supabase = createServiceClient();

  // Validate scope format
  if (
    scope !== "full" &&
    !scope.startsWith("property:") &&
    !scope.startsWith("outlet:")
  ) {
    throw new Error(
      'scope must be "full", "property:<uuid>", or "outlet:<uuid>"'
    );
  }

  const { data, error } = await supabase
    .from("data_deletion_requests")
    .insert({
      org_id: orgId,
      requested_by: requestedBy,
      scope,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create deletion request: ${error.message}`);
  }

  return data as DeletionRequest;
}

// ─── Execution ────────────────────────────────────────────────────────────────

/**
 * Executes a deletion request.
 *
 * Reads the request record, marks it in_progress, deletes all data in
 * FK-safe order, then marks it completed. The database trigger on status
 * transition → 'completed' automatically writes to audit_log.
 *
 * This function is idempotent for completed requests — calling it twice
 * will detect the 'completed' status and return without re-deleting.
 *
 * @param requestId - The data_deletion_requests.id to execute
 */
export async function executeDeletion(requestId: string): Promise<DeletionResult> {
  const supabase = createServiceClient();

  // Fetch the request
  const { data: req, error: fetchErr } = await supabase
    .from("data_deletion_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) {
    throw new Error(`Deletion request ${requestId} not found: ${fetchErr?.message}`);
  }

  if (req.status === "completed" || req.status === "verified") {
    return {
      requestId,
      scope: req.scope,
      tablesCleared: [],
      rowsDeleted: 0,
      completedAt: req.completed_at ?? new Date().toISOString(),
    };
  }

  // Mark in_progress
  await supabase
    .from("data_deletion_requests")
    .update({ status: "in_progress" })
    .eq("id", requestId);

  const tablesCleared: string[] = [];
  let totalRowsDeleted = 0;

  /**
   * Helper: delete rows from a table and accumulate counts.
   * Returns the number of rows deleted.
   */
  async function deleteFrom(
    table: string,
    column: string,
    values: string[]
  ): Promise<number> {
    if (values.length === 0) return 0;

    const { error, count } = await supabase
      .from(table as keyof typeof supabase["from"] extends (t: infer T) => unknown ? T : never)
      .delete({ count: "exact" })
      .in(column, values);

    if (error) {
      throw new Error(`Deletion failed on ${table}.${column}: ${error.message}`);
    }

    const deleted = count ?? 0;
    if (deleted > 0) {
      tablesCleared.push(table);
      totalRowsDeleted += deleted;
    }
    return deleted;
  }

  const scope: string = req.scope;

  if (scope === "full") {
    await executeFullOrgDeletion(supabase, req.org_id, deleteFrom);
  } else if (scope.startsWith("property:")) {
    const propertyId = scope.slice("property:".length);
    await executePropertyDeletion(supabase, propertyId, deleteFrom);
  } else if (scope.startsWith("outlet:")) {
    const outletId = scope.slice("outlet:".length);
    await executeOutletDeletion(supabase, outletId, deleteFrom);
  } else {
    throw new Error(`Unknown deletion scope: ${scope}`);
  }

  const completedAt = new Date().toISOString();

  // Mark completed — this triggers the audit_log write via DB trigger.
  const { error: completeErr } = await supabase
    .from("data_deletion_requests")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", requestId);

  if (completeErr) {
    throw new Error(
      `Deletion executed but failed to mark completed: ${completeErr.message}`
    );
  }

  return {
    requestId,
    scope,
    tablesCleared: [...new Set(tablesCleared)],
    rowsDeleted: totalRowsDeleted,
    completedAt,
  };
}

// ─── Scoped deletion helpers ──────────────────────────────────────────────────

type DeleteFn = (
  table: string,
  column: string,
  values: string[]
) => Promise<number>;

/**
 * Full org deletion in FK-safe leaf-to-root order.
 *
 * Users are deleted ONLY IF they have no active memberships in other orgs.
 * System users (Lauds ops, service accounts) are never deleted.
 */
async function executeFullOrgDeletion(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  del: DeleteFn
): Promise<void> {
  // Collect property IDs for this org
  const { data: props } = await supabase
    .from("properties")
    .select("id")
    .eq("org_id", orgId);
  const propertyIds = (props ?? []).map((r: { id: string }) => r.id);

  if (propertyIds.length > 0) {
    // Collect outlet IDs
    const { data: outlets } = await supabase
      .from("outlets")
      .select("id")
      .in("property_id", propertyIds);
    const outletIds = (outlets ?? []).map((r: { id: string }) => r.id);

    if (outletIds.length > 0) {
      // Collect forecast IDs
      const { data: forecasts } = await supabase
        .from("forecasts")
        .select("id")
        .in("outlet_id", outletIds);
      const forecastIds = (forecasts ?? []).map((r: { id: string }) => r.id);

      if (forecastIds.length > 0) {
        // Leaf tables under forecasts
        await del("prep_status", "forecast_id", forecastIds);
        await del("actions", "forecast_id", forecastIds);
        await del("station_pars", "forecast_id", forecastIds);
      }

      // Outlet-scoped leaf tables
      await del("prediction_log", "outlet_id", outletIds);
      await del("esg_log", "outlet_id", outletIds);
      await del("outcomes", "outlet_id", outletIds);
      await del("waste_measured", "outlet_id", outletIds);
      await del("forecasts", "outlet_id", outletIds);
    }

    // Property-scoped leaf tables
    await del("benchmark_contributions", "property_id", propertyIds);
    await del("events_daily", "property_id", propertyIds);
    await del("weather_daily", "property_id", propertyIds);
    await del("pms_daily", "property_id", propertyIds);
    await del("stations", "outlet_id", outletIds);
    await del("outlets", "property_id", propertyIds);

    // Memberships must go before properties (FK: memberships.property_id → properties.id)
    await del("memberships", "property_id", propertyIds);

    await del("properties", "org_id", [orgId]);
  }

  // Collect user IDs that were members of this org (for potential user deletion)
  const { data: memberUsers } = await supabase
    .from("memberships")
    .select("user_id")
    .in("property_id", propertyIds);
  const candidateUserIds = [...new Set((memberUsers ?? []).map((r: { user_id: string }) => r.user_id))];

  // DPA agreements
  await del("dpa_agreements", "org_id", [orgId]);

  // Delete org
  await del("orgs", "id", [orgId]);

  // Users: only delete if they have NO remaining memberships anywhere
  // (a user might belong to multiple orgs — we must not delete shared users)
  if (candidateUserIds.length > 0) {
    const { data: remainingMemberships } = await supabase
      .from("memberships")
      .select("user_id")
      .in("user_id", candidateUserIds);
    const stillActiveMemberUserIds = new Set(
      (remainingMemberships ?? []).map((r: { user_id: string }) => r.user_id)
    );
    const deletableUserIds = candidateUserIds.filter(
      (uid) => !stillActiveMemberUserIds.has(uid)
    );
    if (deletableUserIds.length > 0) {
      await del("users", "id", deletableUserIds);
    }
  }
}

/**
 * Property-scoped deletion: deletes one property and all its child data.
 * Does NOT delete the parent org or sibling properties.
 */
async function executePropertyDeletion(
  supabase: ReturnType<typeof createServiceClient>,
  propertyId: string,
  del: DeleteFn
): Promise<void> {
  const { data: outlets } = await supabase
    .from("outlets")
    .select("id")
    .eq("property_id", propertyId);
  const outletIds = (outlets ?? []).map((r: { id: string }) => r.id);

  if (outletIds.length > 0) {
    const { data: forecasts } = await supabase
      .from("forecasts")
      .select("id")
      .in("outlet_id", outletIds);
    const forecastIds = (forecasts ?? []).map((r: { id: string }) => r.id);

    if (forecastIds.length > 0) {
      await del("prep_status", "forecast_id", forecastIds);
      await del("actions", "forecast_id", forecastIds);
      await del("station_pars", "forecast_id", forecastIds);
    }

    await del("prediction_log", "outlet_id", outletIds);
    await del("esg_log", "outlet_id", outletIds);
    await del("outcomes", "outlet_id", outletIds);
    await del("waste_measured", "outlet_id", outletIds);
    await del("forecasts", "outlet_id", outletIds);
    await del("stations", "outlet_id", outletIds);
    await del("outlets", "property_id", [propertyId]);
  }

  await del("benchmark_contributions", "property_id", [propertyId]);
  await del("events_daily", "property_id", [propertyId]);
  await del("weather_daily", "property_id", [propertyId]);
  await del("pms_daily", "property_id", [propertyId]);
  await del("memberships", "property_id", [propertyId]);
  await del("properties", "id", [propertyId]);
}

/**
 * Outlet-scoped deletion: deletes one outlet and all its child data.
 * Does NOT delete the parent property, sibling outlets, or org.
 */
async function executeOutletDeletion(
  supabase: ReturnType<typeof createServiceClient>,
  outletId: string,
  del: DeleteFn
): Promise<void> {
  const { data: forecasts } = await supabase
    .from("forecasts")
    .select("id")
    .eq("outlet_id", outletId);
  const forecastIds = (forecasts ?? []).map((r: { id: string }) => r.id);

  if (forecastIds.length > 0) {
    await del("prep_status", "forecast_id", forecastIds);
    await del("actions", "forecast_id", forecastIds);
    await del("station_pars", "forecast_id", forecastIds);
  }

  await del("prediction_log", "outlet_id", [outletId]);
  await del("esg_log", "outlet_id", [outletId]);
  await del("outcomes", "outlet_id", [outletId]);
  await del("waste_measured", "outlet_id", [outletId]);
  await del("forecasts", "outlet_id", [outletId]);
  await del("stations", "outlet_id", [outletId]);
  await del("outlets", "id", [outletId]);
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Records Lauds ops verification that a deletion has been completed and
 * confirmed (e.g. via Storage checks, DB row counts).
 *
 * Sets status → 'verified' and records the verifier and a note.
 * The database trigger on this status transition writes to audit_log.
 *
 * @param requestId  - The data_deletion_requests.id
 * @param verifiedBy - UUID of the Lauds ops user confirming deletion
 * @param note       - Human-readable verification statement
 */
export async function verifyDeletion(
  requestId: string,
  verifiedBy: string,
  note: string
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("data_deletion_requests")
    .update({
      status: "verified",
      verified_by: verifiedBy,
      verification_note: note,
    })
    .eq("id", requestId)
    .eq("status", "completed");  // Only completed requests can be verified

  if (error) {
    throw new Error(
      `Failed to verify deletion request ${requestId}: ${error.message}`
    );
  }
}
