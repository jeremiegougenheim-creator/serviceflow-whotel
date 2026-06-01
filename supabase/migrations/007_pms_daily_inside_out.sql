-- ============================================================
-- Lauds — pms_daily inside-out columns
-- Migration: 007_pms_daily_inside_out.sql
-- ============================================================
-- Adds the guest-profile signals required for the inside-out attach
-- rate algorithm (CLAUDE.md §5). All columns are nullable so existing
-- rows and the fallback flat-attach path remain valid.

ALTER TABLE pms_daily
  ADD COLUMN IF NOT EXISTS rate_code_mix      jsonb,
  ADD COLUMN IF NOT EXISTS loyalty_tier_mix   jsonb,
  ADD COLUMN IF NOT EXISTS travel_source_mix  jsonb,
  ADD COLUMN IF NOT EXISTS departure_count    int,
  ADD COLUMN IF NOT EXISTS departure_am_count int,
  ADD COLUMN IF NOT EXISTS lounge_eligible    int,
  ADD COLUMN IF NOT EXISTS late_arrivals_prev int,
  ADD COLUMN IF NOT EXISTS los_distribution   jsonb,
  ADD COLUMN IF NOT EXISTS group_manifest     jsonb;

COMMENT ON COLUMN pms_daily.rate_code_mix IS
  'Fraction by rate code: {"breakfast_inclusive":0.55,"room_only":0.30,...}';
COMMENT ON COLUMN pms_daily.loyalty_tier_mix IS
  'Fraction by loyalty tier: {"titanium":0.08,"platinum_elite":0.12,...}';
COMMENT ON COLUMN pms_daily.travel_source_mix IS
  'Fraction by travel source: {"fit":0.45,"tour_group":0.30,"mice":0.10,...}';
COMMENT ON COLUMN pms_daily.departure_count IS
  'Rooms checking out this service date (wave-1 heavy).';
COMMENT ON COLUMN pms_daily.departure_am_count IS
  'Check-outs before 11:00 (affects wave-1 load).';
COMMENT ON COLUMN pms_daily.lounge_eligible IS
  'Number of Titanium+ guests — these divert from the buffet to the lounge.';
COMMENT ON COLUMN pms_daily.late_arrivals_prev IS
  'Arrivals after 23:00 the prior night (reduced attach on J+1).';
COMMENT ON COLUMN pms_daily.los_distribution IS
  'Length-of-stay distribution: {"day1":0.20,"day2_4":0.50,"day5plus":0.30}';
COMMENT ON COLUMN pms_daily.group_manifest IS
  'Confirmed groups: [{"group_id":"G001","size":42,"arrival_time":"07:15","source":"tour_group"}]';

-- Index on travel_source_mix for wave-split queries (GIN for jsonb)
CREATE INDEX IF NOT EXISTS pms_daily_travel_source_gin
  ON pms_daily USING GIN (travel_source_mix);
