-- ============================================================
-- Lauds — Data Governance & Privacy
-- Migration: 004_data_governance.sql
--
-- Architecture requirements enforced here:
--   1. RLS strict by property — no cross-client data
--   2. Data residency in APAC — tracked per property
--   3. Model contribution: anonymized, opt-in only
--   4. Full export on demand (CSV/JSON)
--   5. Deletion guaranteed within 30 days of termination
--   6. DPA signed before data access (enforced via has_valid_dpa())
-- ============================================================

-- ─── Extend properties table ──────────────────────────────────────────────────

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS data_residency_region TEXT NOT NULL DEFAULT 'ap-southeast-1';

COMMENT ON COLUMN properties.data_residency_region IS
  'AWS / Supabase region where this property''s data is physically stored. '
  'APAC regions only: ap-southeast-1 (Singapore), ap-northeast-1 (Tokyo), '
  'ap-east-1 (Hong Kong), ap-south-1 (Mumbai). Contractual guarantee.';

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS dpa_required BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN properties.dpa_required IS
  'When TRUE, a valid non-revoked DPA must exist for the org before any data '
  'write is accepted (enforced at application layer via has_valid_dpa()). '
  'Set to FALSE only for internal Lauds demo/sandbox orgs.';

-- ─── audit_log ────────────────────────────────────────────────────────────────
-- IMMUTABLE — no UPDATE or DELETE is permitted, not even for service role.
-- Inserts are only allowed through the write_audit_log() SECURITY DEFINER
-- function, so the table itself has no direct INSERT policy for any role.

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT        NOT NULL
                             CHECK (event_type IN (
                               'deletion_completed',
                               'deletion_verified',
                               'export_delivered',
                               'dpa_signed',
                               'dpa_revoked',
                               'consent_granted',
                               'consent_revoked',
                               'benchmark_contributed'
                             )),
  org_id       UUID        REFERENCES orgs(id) ON DELETE SET NULL,
  actor_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  target_table TEXT,
  target_id    UUID,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS
  'Immutable compliance event log. No UPDATE or DELETE is permitted on this '
  'table for any role — enforced by RLS policies below and by revocation of '
  'direct write access. All inserts go through write_audit_log().';

CREATE INDEX idx_audit_log_org_id       ON audit_log(org_id);
CREATE INDEX idx_audit_log_event_type   ON audit_log(event_type);
CREATE INDEX idx_audit_log_created_at   ON audit_log(created_at);
CREATE INDEX idx_audit_log_target_id    ON audit_log(target_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Reads: org admins can read their own org's audit events; Lauds ops (service role) can read all.
CREATE POLICY "audit_log: org admins can read their org events"
  ON audit_log FOR SELECT
  USING (
    org_id IN (
      SELECT p.org_id
      FROM properties p
      WHERE p.id = ANY(get_user_property_ids())
    )
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.active = TRUE
    )
  );

-- No direct INSERT for any client role — use write_audit_log() instead.
CREATE POLICY "audit_log: no direct insert"
  ON audit_log FOR INSERT
  WITH CHECK (FALSE);

-- Immutability: absolutely no UPDATE.
CREATE POLICY "audit_log: no update ever"
  ON audit_log FOR UPDATE
  USING (FALSE);

-- Immutability: absolutely no DELETE.
CREATE POLICY "audit_log: no delete ever"
  ON audit_log FOR DELETE
  USING (FALSE);

-- ─── write_audit_log() — the ONLY way to insert into audit_log ───────────────
-- SECURITY DEFINER bypasses the INSERT=FALSE policy above.
-- This function should be called from triggers and trusted server functions only.

CREATE OR REPLACE FUNCTION write_audit_log(
  p_event_type   TEXT,
  p_org_id       UUID    DEFAULT NULL,
  p_actor_id     UUID    DEFAULT NULL,
  p_target_table TEXT    DEFAULT NULL,
  p_target_id    UUID    DEFAULT NULL,
  p_metadata     JSONB   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO audit_log (event_type, org_id, actor_id, target_table, target_id, metadata)
  VALUES (p_event_type, p_org_id, p_actor_id, p_target_table, p_target_id, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION write_audit_log IS
  'SECURITY DEFINER function that is the sole insertion path for audit_log. '
  'Direct inserts are blocked by RLS. Call from triggers or trusted edge functions.';

-- ─── dpa_agreements ───────────────────────────────────────────────────────────
-- DPA must be signed before any data access. Tracked per org.
-- PDF stored in Supabase Storage; path recorded here.

CREATE TABLE IF NOT EXISTS dpa_agreements (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  signed_by             UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version               TEXT        NOT NULL,  -- e.g. 'v1.2'
  jurisdiction          TEXT        NOT NULL,  -- 'TW' | 'SG' | 'HK' | 'JP' | 'AU' | ...
  data_residency_region TEXT        NOT NULL,  -- 'ap-southeast-1' | 'ap-northeast-1' | ...
  pdf_storage_path      TEXT,                  -- Supabase Storage object path
  revoked_at            TIMESTAMPTZ,           -- NULL = currently valid
  revoked_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  revocation_reason     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dpa_agreements IS
  'Data Processing Agreement records. A non-revoked DPA must exist for an org '
  'before any operational data write is permitted (checked via has_valid_dpa()). '
  'Revocation triggers a deletion request workflow.';

CREATE INDEX idx_dpa_agreements_org_id    ON dpa_agreements(org_id);
CREATE INDEX idx_dpa_agreements_valid     ON dpa_agreements(org_id, revoked_at)
  WHERE revoked_at IS NULL;

ALTER TABLE dpa_agreements ENABLE ROW LEVEL SECURITY;

-- Org admins can insert (sign) a DPA for their org.
CREATE POLICY "dpa_agreements: org admins can insert"
  ON dpa_agreements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN properties p ON p.org_id = dpa_agreements.org_id
      WHERE m.user_id = auth.uid()
        AND m.property_id = p.id
        AND m.role = 'admin'
        AND m.active = TRUE
    )
  );

-- Org admins can read their own org's DPAs.
CREATE POLICY "dpa_agreements: org admins can read their org"
  ON dpa_agreements FOR SELECT
  USING (
    org_id IN (
      SELECT p.org_id
      FROM properties p
      WHERE p.id = ANY(get_user_property_ids())
    )
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.active = TRUE
    )
  );

-- Org admins can revoke (update revoked_at) only — no other column changes.
CREATE POLICY "dpa_agreements: org admins can revoke"
  ON dpa_agreements FOR UPDATE
  USING (
    org_id IN (
      SELECT p.org_id
      FROM properties p
      WHERE p.id = ANY(get_user_property_ids())
    )
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.active = TRUE
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT p.org_id
      FROM properties p
      WHERE p.id = ANY(get_user_property_ids())
    )
  );

-- No deletion of DPA records — they are a permanent compliance record.
CREATE POLICY "dpa_agreements: no delete"
  ON dpa_agreements FOR DELETE
  USING (FALSE);

-- ─── has_valid_dpa() — gate function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION has_valid_dpa(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM dpa_agreements
    WHERE org_id = p_org_id
      AND revoked_at IS NULL
  );
$$;

COMMENT ON FUNCTION has_valid_dpa IS
  'Returns TRUE if the org has at least one non-revoked DPA. '
  'Must be called before any data write operation in application middleware. '
  'SECURITY DEFINER so it can be called from RLS policies or triggers.';

-- ─── Trigger: log DPA signing to audit_log ────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_dpa_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Resolve org_id for audit
  v_org_id := NEW.org_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM write_audit_log(
      'dpa_signed',
      v_org_id,
      NEW.signed_by,
      'dpa_agreements',
      NEW.id,
      jsonb_build_object(
        'version', NEW.version,
        'jurisdiction', NEW.jurisdiction,
        'data_residency_region', NEW.data_residency_region
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    PERFORM write_audit_log(
      'dpa_revoked',
      v_org_id,
      NEW.revoked_by,
      'dpa_agreements',
      NEW.id,
      jsonb_build_object(
        'revocation_reason', NEW.revocation_reason,
        'original_version', NEW.version
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dpa_agreements_audit
  AFTER INSERT OR UPDATE ON dpa_agreements
  FOR EACH ROW EXECUTE FUNCTION trg_dpa_audit();

-- ─── model_contribution_consent ───────────────────────────────────────────────
-- Per-property opt-in for contributing anonymized aggregated stats to the
-- global model. Raw guest counts, PII, and nationality mix at property level
-- NEVER leave the system regardless of this flag.

CREATE TABLE IF NOT EXISTS model_contribution_consent (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  consented_by        UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  consented_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ,           -- NULL = consent currently active
  revoked_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- Which anonymized metrics may flow to the global benchmark / FL server.
  -- NEVER includes: raw guest counts, PII, nationality mix at property level.
  contribution_scope  TEXT[]      NOT NULL DEFAULT ARRAY['waste_pct','covers_pct','mape'],
  UNIQUE (property_id)  -- one active consent record per property
);

COMMENT ON TABLE model_contribution_consent IS
  'Opt-in consent for anonymized model contribution. Only aggregated, anonymized '
  'statistics (waste_pct, covers_pct, mape) flow to the global FL server when '
  'consented. Raw data, PII, and property-level nationality mix are never shared.';

COMMENT ON COLUMN model_contribution_consent.contribution_scope IS
  'Allowed anonymized metrics. Valid values: waste_pct, covers_pct, mape. '
  'NEVER add: raw_covers, nationality_*, guest_*, pii_*.';

CREATE INDEX idx_mcc_property_id ON model_contribution_consent(property_id);
CREATE INDEX idx_mcc_active      ON model_contribution_consent(property_id, revoked_at)
  WHERE revoked_at IS NULL;

ALTER TABLE model_contribution_consent ENABLE ROW LEVEL SECURITY;

-- Property GMs and admins can read consent for their properties.
CREATE POLICY "model_contribution_consent: gm and admin can read"
  ON model_contribution_consent FOR SELECT
  USING (
    property_id = ANY(get_user_property_ids())
    AND user_has_role_on_property(property_id, 'gm', 'admin')
  );

-- Property GMs and admins can insert (grant) consent.
CREATE POLICY "model_contribution_consent: gm and admin can insert"
  ON model_contribution_consent FOR INSERT
  WITH CHECK (
    user_has_role_on_property(property_id, 'gm', 'admin')
  );

-- Property GMs and admins can update (revoke) consent.
CREATE POLICY "model_contribution_consent: gm and admin can update"
  ON model_contribution_consent FOR UPDATE
  USING (
    user_has_role_on_property(property_id, 'gm', 'admin')
  )
  WITH CHECK (
    user_has_role_on_property(property_id, 'gm', 'admin')
  );

-- No hard deletes — revoke via revoked_at instead.
CREATE POLICY "model_contribution_consent: no delete"
  ON model_contribution_consent FOR DELETE
  USING (FALSE);

-- ─── Trigger: log consent changes to audit_log ────────────────────────────────

CREATE OR REPLACE FUNCTION trg_consent_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM properties WHERE id = NEW.property_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM write_audit_log(
      'consent_granted',
      v_org_id,
      NEW.consented_by,
      'model_contribution_consent',
      NEW.id,
      jsonb_build_object('property_id', NEW.property_id, 'scope', NEW.contribution_scope)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    PERFORM write_audit_log(
      'consent_revoked',
      v_org_id,
      NEW.revoked_by,
      'model_contribution_consent',
      NEW.id,
      jsonb_build_object('property_id', NEW.property_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consent_audit
  AFTER INSERT OR UPDATE ON model_contribution_consent
  FOR EACH ROW EXECUTE FUNCTION trg_consent_audit();

-- ─── data_export_requests ─────────────────────────────────────────────────────
-- GDPR-equivalent right to data portability. Any authenticated org member
-- may request a full export; only they can read their own request.
-- Exports are signed URLs valid for 72 hours; the export itself is deleted
-- from Storage after 30 days (enforced by a scheduled edge function).

CREATE TABLE IF NOT EXISTS data_export_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  requested_by   UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope          TEXT[]      NOT NULL,    -- e.g. ARRAY['pms_daily','waste_measured','forecasts']
  format         TEXT        NOT NULL     CHECK (format IN ('csv', 'json')),
  status         TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','ready','delivered','expired')),
  download_url   TEXT,                    -- Supabase Storage signed URL (72 h TTL)
  expires_at     TIMESTAMPTZ,            -- URL expiry; NULL until status = 'ready'
  completed_at   TIMESTAMPTZ,
  error_message  TEXT                    -- populated if processing fails
);

COMMENT ON TABLE data_export_requests IS
  'Data portability requests. Any org member may request a full export of their '
  'org''s data. Exports are generated asynchronously, stored as signed URLs '
  'valid for 72 hours. Storage objects are purged after 30 days.';

CREATE INDEX idx_der_org_id       ON data_export_requests(org_id);
CREATE INDEX idx_der_requested_by ON data_export_requests(requested_by);
CREATE INDEX idx_der_status       ON data_export_requests(status);

ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;

-- Any authenticated member of the org can request an export.
CREATE POLICY "data_export_requests: org members can insert"
  ON data_export_requests FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND org_id IN (
      SELECT p.org_id FROM properties p
      WHERE p.id = ANY(get_user_property_ids())
    )
    AND requested_by = auth.uid()
  );

-- Users can only read their own requests.
CREATE POLICY "data_export_requests: users read their own"
  ON data_export_requests FOR SELECT
  USING (requested_by = auth.uid());

-- Service role (edge function) updates status, download_url, etc.
-- No client-side UPDATE policy; all status transitions happen server-side.
CREATE POLICY "data_export_requests: no client update"
  ON data_export_requests FOR UPDATE
  USING (FALSE);

CREATE POLICY "data_export_requests: no delete"
  ON data_export_requests FOR DELETE
  USING (FALSE);

-- ─── Trigger: log export delivered to audit_log ───────────────────────────────

CREATE OR REPLACE FUNCTION trg_export_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    PERFORM write_audit_log(
      'export_delivered',
      NEW.org_id,
      NEW.requested_by,
      'data_export_requests',
      NEW.id,
      jsonb_build_object(
        'format', NEW.format,
        'scope', NEW.scope,
        'completed_at', NEW.completed_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_export_audit
  AFTER UPDATE ON data_export_requests
  FOR EACH ROW EXECUTE FUNCTION trg_export_audit();

-- ─── data_deletion_requests ───────────────────────────────────────────────────
-- Right to erasure. Org admins may request deletion of their data.
-- SLA: 30 calendar days from request (enforced by deadline_at).
-- Completion and verification are both tracked.

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  requested_by      UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 30-day SLA — set by trigger on insert, cannot be overridden.
  deadline_at       TIMESTAMPTZ,
  -- scope: 'full' | 'property:<uuid>' | 'outlet:<uuid>'
  scope             TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','in_progress','completed','verified')),
  completed_at      TIMESTAMPTZ,
  verified_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  verification_note TEXT
);

COMMENT ON TABLE data_deletion_requests IS
  'Right-to-erasure requests with a hard 30-day SLA enforced by deadline_at '
  '(GENERATED column — cannot be overridden). Completion is logged to audit_log '
  'via trigger. Lauds ops verify the deletion via verified_by + verification_note.';

COMMENT ON COLUMN data_deletion_requests.deadline_at IS
  'Hard deadline: 30 days from requested_at. Set by trigger on insert — immutable after creation. '
  'Contractual guarantee to client.';

COMMENT ON COLUMN data_deletion_requests.scope IS
  'Deletion scope. ''full'' = entire org. ''property:<uuid>'' = one property and '
  'all child data. ''outlet:<uuid>'' = one outlet and all child data.';

CREATE INDEX idx_ddr_org_id    ON data_deletion_requests(org_id);
CREATE INDEX idx_ddr_status    ON data_deletion_requests(status);
CREATE INDEX idx_ddr_deadline  ON data_deletion_requests(deadline_at);

-- Trigger: set deadline_at = requested_at + 30 days on insert (immutable after creation)
CREATE OR REPLACE FUNCTION set_deletion_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.deadline_at := NEW.requested_at + INTERVAL '30 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_deletion_deadline
  BEFORE INSERT ON data_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION set_deletion_deadline();

ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Only org admins can request deletion.
CREATE POLICY "data_deletion_requests: org admins can insert"
  ON data_deletion_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN properties p ON p.org_id = data_deletion_requests.org_id
      WHERE m.user_id = auth.uid()
        AND m.property_id = p.id
        AND m.role = 'admin'
        AND m.active = TRUE
    )
    AND requested_by = auth.uid()
  );

-- Org admins can read their org's deletion requests.
CREATE POLICY "data_deletion_requests: org admins can read"
  ON data_deletion_requests FOR SELECT
  USING (
    org_id IN (
      SELECT p.org_id FROM properties p
      WHERE p.id = ANY(get_user_property_ids())
    )
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.active = TRUE
    )
  );

-- Status updates (in_progress → completed → verified) only via service role.
CREATE POLICY "data_deletion_requests: no client update"
  ON data_deletion_requests FOR UPDATE
  USING (FALSE);

CREATE POLICY "data_deletion_requests: no delete"
  ON data_deletion_requests FOR DELETE
  USING (FALSE);

-- ─── Trigger: log deletion completion to audit_log ────────────────────────────

CREATE OR REPLACE FUNCTION trg_deletion_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log when status transitions to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM write_audit_log(
      'deletion_completed',
      NEW.org_id,
      NEW.requested_by,
      'data_deletion_requests',
      NEW.id,
      jsonb_build_object(
        'scope', NEW.scope,
        'completed_at', NEW.completed_at,
        'days_to_complete',
        EXTRACT(EPOCH FROM (NEW.completed_at - NEW.requested_at)) / 86400.0
      )
    );
  END IF;

  -- Log when status transitions to 'verified' (Lauds ops confirmation)
  IF NEW.status = 'verified' AND (OLD.status IS DISTINCT FROM 'verified') THEN
    PERFORM write_audit_log(
      'deletion_verified',
      NEW.org_id,
      NEW.verified_by,
      'data_deletion_requests',
      NEW.id,
      jsonb_build_object(
        'scope', NEW.scope,
        'verification_note', NEW.verification_note
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deletion_audit
  AFTER UPDATE ON data_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION trg_deletion_audit();

-- ─── benchmark_contributions ──────────────────────────────────────────────────
-- Audit log of what anonymized data actually left the system toward the
-- global federated learning model. The actual payload is sent to the FL server;
-- only the SHA-256 hash is stored here for auditability.
-- The payload NEVER includes: property_id in cleartext, guest counts,
-- nationality breakdowns at property level, PII of any kind.

CREATE TABLE IF NOT EXISTS benchmark_contributions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID        NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  contributed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version   TEXT        NOT NULL,
  -- SHA-256 of the anonymized payload sent to FL server (for auditability).
  -- The payload itself: no property_id, region bucket only, aggregated metrics.
  payload_hash    TEXT        NOT NULL,
  fl_round        INTEGER     NOT NULL CHECK (fl_round > 0),
  dp_epsilon      REAL        NOT NULL CHECK (dp_epsilon > 0),   -- privacy budget used this round
  dp_delta        REAL        NOT NULL CHECK (dp_delta > 0 AND dp_delta < 1)
);

COMMENT ON TABLE benchmark_contributions IS
  'Audit trail for anonymized FL contributions. The actual gradient payload is '
  'sent to the Flower aggregation server; only the SHA-256 hash is retained here. '
  'The payload never contains property_id, guest counts, or nationality breakdowns. '
  'dp_epsilon/dp_delta record the Gaussian DP noise parameters applied.';

CREATE INDEX idx_bc_property_id ON benchmark_contributions(property_id);
CREATE INDEX idx_bc_contributed_at ON benchmark_contributions(contributed_at);

ALTER TABLE benchmark_contributions ENABLE ROW LEVEL SECURITY;

-- Property GMs and admins can read contributions for their properties.
CREATE POLICY "benchmark_contributions: gm and admin can read"
  ON benchmark_contributions FOR SELECT
  USING (
    property_id = ANY(get_user_property_ids())
    AND user_has_role_on_property(property_id, 'gm', 'admin')
  );

-- No direct client inserts — written exclusively by the FL edge function
-- using service role. Inserts happen only when consent is active.
CREATE POLICY "benchmark_contributions: no direct client insert"
  ON benchmark_contributions FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "benchmark_contributions: no update"
  ON benchmark_contributions FOR UPDATE
  USING (FALSE);

-- Contributions are an audit record; no deletion (soft-delete via property deletion).
CREATE POLICY "benchmark_contributions: no delete"
  ON benchmark_contributions FOR DELETE
  USING (FALSE);

-- ─── Trigger: log FL contribution to audit_log ────────────────────────────────

CREATE OR REPLACE FUNCTION trg_benchmark_contribution_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM properties WHERE id = NEW.property_id;

  PERFORM write_audit_log(
    'benchmark_contributed',
    v_org_id,
    NULL,  -- system action, no individual actor
    'benchmark_contributions',
    NEW.id,
    jsonb_build_object(
      'model_version', NEW.model_version,
      'fl_round', NEW.fl_round,
      'dp_epsilon', NEW.dp_epsilon,
      'dp_delta', NEW.dp_delta,
      'payload_hash', NEW.payload_hash
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_benchmark_audit
  AFTER INSERT ON benchmark_contributions
  FOR EACH ROW EXECUTE FUNCTION trg_benchmark_contribution_audit();

-- ─── Helper: get_user_org_ids() ───────────────────────────────────────────────
-- Returns org_ids the current user belongs to via any property membership.

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ARRAY(
    SELECT DISTINCT p.org_id
    FROM properties p
    WHERE p.id = ANY(get_user_property_ids())
  );
$$;

COMMENT ON FUNCTION get_user_org_ids() IS
  'Returns array of org_ids the current user belongs to via active property memberships.';

-- ─── Indexes for governance queries ───────────────────────────────────────────

-- Quickly find outstanding deletion requests past SLA
CREATE INDEX idx_ddr_overdue ON data_deletion_requests(deadline_at, status)
  WHERE status IN ('pending', 'in_progress');

-- Quickly find export requests that have expired but not yet cleaned up
CREATE INDEX idx_der_expired ON data_export_requests(expires_at, status)
  WHERE status = 'ready';
