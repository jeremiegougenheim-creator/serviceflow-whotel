/**
 * Lauds Data Governance — consent.ts
 *
 * Consent management for DPA validity gating and model contribution opt-in.
 *
 * Architecture rules enforced here:
 *   - checkDpaValid() MUST be called as middleware before any data write.
 *   - Model contribution is ALWAYS opt-in, per property, never org-wide by default.
 *   - getContributionScope() returns only the whitelisted anonymized fields;
 *     it never returns raw guest counts, PII, or nationality mix.
 *
 * All functions use the server Supabase client (service role for writes,
 * user-scoped client for reads where RLS should apply).
 */

import { createServiceClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DpaRecord {
  id: string;
  org_id: string;
  signed_by: string;
  signed_at: string;
  version: string;
  jurisdiction: string;
  data_residency_region: string;
  pdf_storage_path: string | null;
  revoked_at: string | null;
}

export interface ConsentRecord {
  id: string;
  property_id: string;
  consented_by: string;
  consented_at: string;
  revoked_at: string | null;
  contribution_scope: string[];
}

/**
 * The only fields that may appear in contribution_scope.
 * Any value outside this set is silently stripped by getContributionScope().
 * NEVER add: raw_covers, guest_*, nationality_*, pii_*, segment_breakdown.
 */
const ALLOWED_CONTRIBUTION_FIELDS = new Set([
  "waste_pct",
  "covers_pct",
  "mape",
]);

// ─── DPA validation ───────────────────────────────────────────────────────────

/**
 * Returns true if the org has a currently valid (non-revoked) DPA on record.
 *
 * Call this as middleware before any data write operation. If it returns false,
 * the write must be rejected with a 403 and the user directed to sign a DPA.
 *
 * Uses service role to bypass RLS — this check must always succeed regardless
 * of the calling user's membership, as it's a system-level gate.
 */
export async function checkDpaValid(orgId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("dpa_agreements")
    .select("id")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Surface the error — a DB error should not silently pass as "valid".
    throw new Error(`DPA check failed for org ${orgId}: ${error.message}`);
  }

  return data !== null;
}

/**
 * Returns the active DPA record for an org, or null if none exists.
 * Useful for displaying DPA metadata in the admin UI.
 */
export async function getActiveDpa(orgId: string): Promise<DpaRecord | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("dpa_agreements")
    .select("id, org_id, signed_by, signed_at, version, jurisdiction, data_residency_region, pdf_storage_path, revoked_at")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch DPA for org ${orgId}: ${error.message}`);
  }

  return data as DpaRecord | null;
}

// ─── Model contribution consent ───────────────────────────────────────────────

/**
 * Returns the active consent record for a property, or null if no consent
 * has been granted (or if it was revoked).
 *
 * A null return means the property is opted OUT — no data should flow to
 * the global FL model for this property.
 */
export async function getModelContributionConsent(
  propertyId: string
): Promise<ConsentRecord | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("model_contribution_consent")
    .select("id, property_id, consented_by, consented_at, revoked_at, contribution_scope")
    .eq("property_id", propertyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch consent for property ${propertyId}: ${error.message}`
    );
  }

  return data as ConsentRecord | null;
}

/**
 * Grants or updates model contribution consent for a property.
 *
 * If a consent record already exists (active or revoked), it is replaced via
 * upsert. The contribution_scope is validated against ALLOWED_CONTRIBUTION_FIELDS
 * before writing — any disallowed fields are stripped and a warning is logged.
 *
 * @param propertyId  - The property granting consent
 * @param userId      - The GM or admin granting consent
 * @param consented   - true = grant consent, false = revoke existing consent
 */
export async function setModelContributionConsent(
  propertyId: string,
  userId: string,
  consented: boolean,
  scope: string[] = ["waste_pct", "covers_pct", "mape"]
): Promise<void> {
  const supabase = createServiceClient();

  if (!consented) {
    await revokeModelContributionConsent(propertyId, userId);
    return;
  }

  // Strip any scope fields that are not in the whitelist.
  const sanitizedScope = scope.filter((field) => {
    const allowed = ALLOWED_CONTRIBUTION_FIELDS.has(field);
    if (!allowed) {
      console.warn(
        `[consent] Stripping disallowed contribution field "${field}" for property ${propertyId}`
      );
    }
    return allowed;
  });

  if (sanitizedScope.length === 0) {
    throw new Error(
      "contribution_scope must contain at least one allowed field: " +
        [...ALLOWED_CONTRIBUTION_FIELDS].join(", ")
    );
  }

  // Upsert: if a record exists (even revoked), replace it.
  const { error } = await supabase
    .from("model_contribution_consent")
    .upsert(
      {
        property_id: propertyId,
        consented_by: userId,
        consented_at: new Date().toISOString(),
        revoked_at: null,
        revoked_by: null,
        contribution_scope: sanitizedScope,
      },
      { onConflict: "property_id" }
    );

  if (error) {
    throw new Error(
      `Failed to set consent for property ${propertyId}: ${error.message}`
    );
  }
}

/**
 * Revokes the active model contribution consent for a property.
 * Sets revoked_at to the current timestamp. The record is retained for audit.
 *
 * After revocation, no further anonymized data will be contributed from this
 * property to the global FL model until consent is re-granted.
 */
export async function revokeModelContributionConsent(
  propertyId: string,
  revokedBy?: string
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("model_contribution_consent")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy ?? null,
    })
    .eq("property_id", propertyId)
    .is("revoked_at", null);

  if (error) {
    throw new Error(
      `Failed to revoke consent for property ${propertyId}: ${error.message}`
    );
  }
}

/**
 * Returns the list of anonymized field names that may be contributed for a
 * property, or an empty array if consent has not been granted.
 *
 * This is the function the FL client should call before building its payload.
 * The result is ALWAYS a subset of ALLOWED_CONTRIBUTION_FIELDS — it is
 * impossible for this function to return a field that could carry PII,
 * raw guest counts, or property-identifiable data.
 *
 * @returns string[] of allowed field names, or [] if not consented.
 */
export async function getContributionScope(propertyId: string): Promise<string[]> {
  const consent = await getModelContributionConsent(propertyId);

  if (!consent || consent.revoked_at !== null) {
    return [];
  }

  // Double-filter against whitelist, even if DB record somehow contains
  // a field that slipped through (defence-in-depth).
  return consent.contribution_scope.filter((field) =>
    ALLOWED_CONTRIBUTION_FIELDS.has(field)
  );
}
