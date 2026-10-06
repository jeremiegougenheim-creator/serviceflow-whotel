-- ============================================================
-- Lauds — Pace Log (intraday cover pacing)
-- Migration: 005_pace_log.sql
-- ============================================================
-- One row per check-in per outlet; written by the Simphony connector
-- every 15 min or by the chef's manual fallback button.
-- source must always be set — never NULL.

CREATE TABLE IF NOT EXISTS pace_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id    uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  logged_at    timestamptz NOT NULL DEFAULT now(),
  covers_cumul int NOT NULL CHECK (covers_cumul >= 0),
  covers_delta int NOT NULL DEFAULT 0,
  wave_label   text CHECK (wave_label IN ('wave1', 'wave2', 'wave3')),
  source       text NOT NULL CHECK (source IN ('pos_simphony', 'manual_fallback')),
  raw_payload  jsonb
);

CREATE INDEX IF NOT EXISTS pace_log_outlet_date_idx
  ON pace_log (outlet_id, service_date);

-- Partial index: quick "last Simphony entry" lookup used by the fallback button
CREATE INDEX IF NOT EXISTS pace_log_simphony_recent_idx
  ON pace_log (outlet_id, service_date, logged_at DESC)
  WHERE source = 'pos_simphony';

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE pace_log ENABLE ROW LEVEL SECURITY;

-- Members of the property can read pace data for their outlets
CREATE POLICY "pace_log: property members can select"
  ON pace_log FOR SELECT
  USING (
    outlet_id IN (
      SELECT o.id
      FROM outlets o
      WHERE o.property_id = ANY(get_user_property_ids())
    )
  );

-- Members can insert manual_fallback entries; POS writes via service role
CREATE POLICY "pace_log: property members can insert manual fallback"
  ON pace_log FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT o.id
      FROM outlets o
      WHERE o.property_id = ANY(get_user_property_ids())
    )
    AND source = 'manual_fallback'
  );

-- Service role bypasses RLS (used by Simphony connector edge function)
CREATE POLICY "pace_log: service role full access"
  ON pace_log
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── Helper: last Simphony ping age in minutes ────────────────────────────────
-- Used by the cockpit to decide whether to show the manual fallback button.

CREATE OR REPLACE FUNCTION pace_log_simphony_lag_minutes(
  p_outlet_id  uuid,
  p_service_date date
)
RETURNS numeric AS $$
  SELECT EXTRACT(EPOCH FROM (now() - MAX(logged_at))) / 60
  FROM pace_log
  WHERE outlet_id     = p_outlet_id
    AND service_date  = p_service_date
    AND source        = 'pos_simphony'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON TABLE pace_log IS
  'Intraday cover pacing — one row per 15-min check per outlet.
   source=pos_simphony (automated) | manual_fallback (chef button when POS is down).';
