-- ============================================================
-- Lauds — Property Theming System
-- Migration: 006_property_themes.sql
-- ============================================================
-- One row per property. Fallback to Lauds defaults when missing.
-- See CLAUDE.md §16 for the full specification.

CREATE TABLE IF NOT EXISTS property_themes (
  property_id    uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  theme_name     text NOT NULL DEFAULT 'lauds_default',
  bg_primary     text NOT NULL DEFAULT '#FAF8F4',
  bg_card        text NOT NULL DEFAULT '#FFFFFF',
  text_primary   text NOT NULL DEFAULT '#2A2520',
  text_secondary text NOT NULL DEFAULT '#4A453F',
  text_muted     text NOT NULL DEFAULT '#8C857C',
  accent_action  text NOT NULL DEFAULT '#16A6EC',
  accent_savings text NOT NULL DEFAULT '#4A8F5E',
  accent_alert   text NOT NULL DEFAULT '#E01E8C',
  divider        text NOT NULL DEFAULT '#E2DDD4',
  font_heading   text NOT NULL DEFAULT 'Cormorant Garamond',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE property_themes IS
  'Per-property UI theme tokens. Applied as CSS custom properties at runtime.
   Absent row → UI falls back to Lauds defaults. See CLAUDE.md §16.';

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE property_themes ENABLE ROW LEVEL SECURITY;

-- All members can read their property's theme (needed at app boot)
CREATE POLICY "property_themes: members can select"
  ON property_themes FOR SELECT
  USING (property_id = ANY(get_user_property_ids()));

-- Only gm / admin can change the theme
CREATE POLICY "property_themes: gm and admin can upsert"
  ON property_themes FOR INSERT
  WITH CHECK (user_has_role_on_property(property_id, 'gm', 'admin'));

CREATE POLICY "property_themes: gm and admin can update"
  ON property_themes FOR UPDATE
  USING (user_has_role_on_property(property_id, 'gm', 'admin'));

CREATE POLICY "property_themes: service role full access"
  ON property_themes
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── Trigger: keep updated_at fresh ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_property_themes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER property_themes_updated_at
  BEFORE UPDATE ON property_themes
  FOR EACH ROW EXECUTE FUNCTION touch_property_themes_updated_at();

-- ─── Seed: built-in themes (upserted idempotently on property creation) ───────
-- The W Taipei seed lives in 002_seed_wtaipei.sql (via property_id reference).
-- Here we define only the named presets as comments — actual inserts are
-- triggered after properties are created.

-- lauds_default   : #FAF8F4 / #16A6EC / #4A8F5E (Lauds identity)
-- w_hotels        : #F7F3EE / #2B5BDB / #2DA06B (W Hotels in-property)
-- resort_neutral  : #F5F1EB / #1D6FA3 / #2A8A52 (3/4★ resort)
-- marriott_classic: #F8F5F0 / #B5121B / #2D6A3F (Marriott corporate)
