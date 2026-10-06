-- ============================================================================
-- ServiceFlow — schema v2 · 2/7 · F&B signals, forecasts, plans, decisions,
-- live service, waste logs, outcomes, learning loop
-- ============================================================================

-- ─── signals read every evening ─────────────────────────────────────────────

-- One row per property per service date: what the PMS knows about tomorrow.
CREATE TABLE pms_daily (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date        date NOT NULL,
  rooms_occupied      int  NOT NULL CHECK (rooms_occupied >= 0),
  rooms_total         int,
  guests_in_house     int  NOT NULL DEFAULT 0 CHECK (guests_in_house >= 0),
  arrivals            int  NOT NULL DEFAULT 0,
  departures          int  NOT NULL DEFAULT 0,
  departures_am       int  NOT NULL DEFAULT 0,   -- check-outs before 11:00
  late_arrivals_prev  int  NOT NULL DEFAULT 0,   -- arrivals after 23:00 the night before
  early_checkins      int  NOT NULL DEFAULT 0,
  lounge_eligible     int  NOT NULL DEFAULT 0,   -- served in the lounge, not the buffet
  vip_arrivals        int  NOT NULL DEFAULT 0,
  suites_occupied     int  NOT NULL DEFAULT 0,
  rate_code_mix       jsonb NOT NULL DEFAULT '{}',  -- {"breakfast_inclusive":0.58,"room_only":0.27,...}
  loyalty_tier_mix    jsonb NOT NULL DEFAULT '{}',
  travel_source_mix   jsonb NOT NULL DEFAULT '{}',  -- {"fit":0.45,"tour_group":0.30,"mice":0.10}
  nationality_mix     jsonb NOT NULL DEFAULT '{}',  -- {"greater_china":0.4,"japan":0.1,"western":0.3,...}
  los_distribution    jsonb NOT NULL DEFAULT '{}',  -- {"day1":0.2,"day2_4":0.5,"day5plus":0.3}
  group_manifest      jsonb NOT NULL DEFAULT '[]',  -- [{"name":"Group","size":38,"arrival":"19:00","breakfast":true}]
  source              text NOT NULL DEFAULT 'manual' CHECK (source IN ('pms','csv','manual','api')),
  raw                 jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, service_date)
);
CREATE INDEX idx_pms_daily_lookup ON pms_daily(property_id, service_date DESC);
CREATE TRIGGER trg_pms_daily_touch BEFORE UPDATE ON pms_daily FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

CREATE TABLE weather_daily (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  temp_c        numeric(5,2),
  rain_prob     numeric(5,4) CHECK (rain_prob BETWEEN 0 AND 1),
  condition     text,            -- clear, cloudy, rain, storm, hot
  source        text NOT NULL DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, service_date)
);

CREATE TABLE events_daily (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid REFERENCES outlets(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  label         text NOT NULL,
  kind          text NOT NULL DEFAULT 'local_event'
                CHECK (kind IN ('group','conference','holiday','local_event','notice','weather','other')),
  size          int,
  starts_at     time,
  lift          numeric(5,3) NOT NULL DEFAULT 1.0,  -- multiplier on covers for this outlet/day
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_daily_lookup ON events_daily(property_id, service_date);

-- Reservations for à la carte outlets, bars and banquets.
CREATE TABLE bookings_daily (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id       uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date    date NOT NULL,
  covers_booked   int NOT NULL DEFAULT 0,
  walk_in_expected int NOT NULL DEFAULT 0,
  largest_party   int,
  largest_party_at time,
  peak_at         time,
  peak_covers     int,
  parties         jsonb NOT NULL DEFAULT '[]',   -- [{"size":12,"at":"20:00","note":"table of 12"}]
  source          text NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, service_date)
);
CREATE TRIGGER trg_bookings_daily_touch BEFORE UPDATE ON bookings_daily FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- Banquet functions: cook to the final count.
CREATE TABLE banquet_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id       uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date    date NOT NULL,
  name            text NOT NULL,
  venue           text,
  booked_count    int NOT NULL DEFAULT 0,
  confirmed_count int NOT NULL DEFAULT 0,
  cook_count      int,                                  -- engine: confirmed + buffer
  diets           jsonb NOT NULL DEFAULT '{}',          -- {"vegan":12,"gluten_free":3}
  courses         jsonb NOT NULL DEFAULT '[]',          -- [{"name":"Crab and pomelo starter","note":"cold, from 17:30","options":{"beef":68,"sea_bass":47}}]
  serve_from      time,
  status          text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('tentative','confirmed','cancelled','done')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_banquet_events_lookup ON banquet_events(outlet_id, service_date);
CREATE TRIGGER trg_banquet_events_touch BEFORE UPDATE ON banquet_events FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- Live pace from the POS (or a manual count) during service.
CREATE TABLE pos_pace (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  covers_seated int NOT NULL CHECK (covers_seated >= 0),
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('pos','manual','api')),
  logged_by     uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_pos_pace_lookup ON pos_pace(outlet_id, service_date, at DESC);

-- POS reconciliation (leakage): unposted courses, voids, variances.
CREATE TABLE pos_variances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid REFERENCES outlets(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('unposted','void','discount','comp','cash','other')),
  detail        text NOT NULL,
  amount        numeric(12,2) NOT NULL DEFAULT 0,   -- property currency
  items         int,
  due_by        time,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reconciled','written_off')),
  resolved_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pos_variances_lookup ON pos_variances(property_id, service_date);

-- ─── engine outputs ─────────────────────────────────────────────────────────

-- One forecast per outlet, service date and version. The evening brief is
-- version 1; the dawn update supersedes it; a live re-forecast adds another.
CREATE TABLE forecasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id       uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date    date NOT NULL,
  version         int  NOT NULL DEFAULT 1,
  kind            text NOT NULL DEFAULT 'evening' CHECK (kind IN ('evening','dawn','live','manual')),
  covers_p10      int  NOT NULL CHECK (covers_p10 >= 0),
  covers_p50      int  NOT NULL CHECK (covers_p50 >= 0),
  covers_p90      int  NOT NULL CHECK (covers_p90 >= 0),
  usual_covers    int,                                  -- what the kitchen would have planned on habit
  occupancy       numeric(5,4),
  wave_split      jsonb NOT NULL DEFAULT '[]',          -- [{"wave_id":..,"label":"Open","share":0.35,"covers":75}]
  drivers         jsonb NOT NULL DEFAULT '[]',          -- [{"label":"Group of 38 in house","source":"PMS","effect":"+14"}]
  signals_read    int  NOT NULL DEFAULT 0,
  model_version   text NOT NULL DEFAULT 'sf-2.0',
  inputs          jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','confirmed','superseded')),
  issued_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, service_date, version),
  CHECK (covers_p10 <= covers_p50 AND covers_p50 <= covers_p90)
);
CREATE INDEX idx_forecasts_lookup ON forecasts(outlet_id, service_date DESC, version DESC);
CREATE INDEX idx_forecasts_property_date ON forecasts(property_id, service_date);
CREATE TRIGGER trg_forecasts_touch BEFORE UPDATE ON forecasts FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- The production plan: one line per station and wave.
CREATE TABLE station_plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  forecast_id          uuid NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  station_id           uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  wave_id              uuid REFERENCES waves(id) ON DELETE SET NULL,
  qty                  numeric(10,2) NOT NULL CHECK (qty >= 0),
  unit                 text NOT NULL DEFAULT 'portions',
  usual_qty            numeric(10,2),                   -- the habit-based quantity
  delta_pct            numeric(6,2),                    -- vs usual
  reason               text,
  expected_consumption numeric(10,2),
  uncertainty          numeric(10,2),
  status               text NOT NULL DEFAULT 'proposed'
                       CHECK (status IN ('proposed','approved','prepped','running_low','closed','skipped')),
  approved_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at          timestamptz,
  prepped_by           uuid REFERENCES team_members(id) ON DELETE SET NULL,
  prepped_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (forecast_id, station_id, wave_id)
);
CREATE INDEX idx_station_plans_forecast ON station_plans(forecast_id);
CREATE INDEX idx_station_plans_station ON station_plans(station_id);
CREATE TRIGGER trg_station_plans_touch BEFORE UPDATE ON station_plans FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- The three decisions that matter (and any other proposal needing a person).
-- Human in the loop: nothing changes until a person approves.
CREATE TABLE decisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id      uuid REFERENCES outlets(id) ON DELETE CASCADE,
  forecast_id    uuid REFERENCES forecasts(id) ON DELETE CASCADE,
  station_id     uuid REFERENCES stations(id) ON DELETE SET NULL,
  service_date   date NOT NULL,
  rank           int  NOT NULL DEFAULT 1,
  kind           text NOT NULL CHECK (kind IN ('trim','boost','hold','move','reconcile','assign','inspect','slot','other')),
  department     text NOT NULL DEFAULT 'kitchen',
  title          text NOT NULL,          -- "Trim Western hot −13%"
  detail         text,                   -- "suite-heavy mix, more à la carte"
  reason         text,                   -- the signal behind it
  delta_pct      numeric(6,2),
  est_saving     numeric(12,2),          -- property currency
  currency       char(3),
  status         text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','done','expired')),
  source         text NOT NULL DEFAULT 'engine' CHECK (source IN ('engine','live','nightly','user')),
  decided_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  payload        jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_decisions_lookup ON decisions(property_id, service_date, status);
CREATE INDEX idx_decisions_forecast ON decisions(forecast_id);
CREATE TRIGGER trg_decisions_touch BEFORE UPDATE ON decisions FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- What happens during service: cover checks, running fast, waste risk, group arrivals.
CREATE TABLE live_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL CHECK (kind IN ('cover_check','running_fast','waste_risk','group_arrival','pace','info','flag')),
  title         text NOT NULL,          -- "Covers +11% on forecast"
  body          text,                   -- "142 seated, 128 expected. Congee +8 and coffee +20 proposed."
  proposal      text,                   -- the change waiting for approval, if any
  decision_id   uuid REFERENCES decisions(id) ON DELETE SET NULL,
  station_id    uuid REFERENCES stations(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','dismissed','info')),
  acted_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  acted_at      timestamptz,
  payload       jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_live_events_lookup ON live_events(outlet_id, service_date, at DESC);

-- Waste, measured. The only source of CO2e. source=winnow for a bin scale,
-- voice/manual for the team's log, csv for history imports.
CREATE TABLE waste_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  station_id    uuid REFERENCES stations(id) ON DELETE SET NULL,
  wave_id       uuid REFERENCES waves(id) ON DELETE SET NULL,
  service_date  date NOT NULL,
  kg            numeric(8,3) NOT NULL CHECK (kg >= 0),
  reason        text,                   -- over-prep, plate waste, spoilage, trim
  co2e_kg       numeric(8,3) NOT NULL DEFAULT 0 CHECK (co2e_kg >= 0),
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('voice','manual','winnow','csv','api')),
  transcript    text,
  language      text,
  logged_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  logged_at     timestamptz NOT NULL DEFAULT now(),
  seconds_to_log int,                   -- how long the entry took (quality of the log)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_waste_logs_lookup ON waste_logs(outlet_id, service_date);
CREATE INDEX idx_waste_logs_station ON waste_logs(station_id, service_date);

-- CO2e is computed in the database from the station factor, the category or the property default.
CREATE OR REPLACE FUNCTION sf_co2e_factor(p_station uuid, p_property uuid) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT s.co2e_factor FROM stations s WHERE s.id = p_station),
    (SELECT CASE s.food_category
              WHEN 'bread_pastry' THEN 1.9 WHEN 'meat' THEN 27.0 WHEN 'dairy' THEN 3.2
              WHEN 'vegetables' THEN 2.0 WHEN 'seafood' THEN 6.1 WHEN 'rice_noodles' THEN 2.2
              WHEN 'fruit' THEN 1.1 WHEN 'beverage' THEN 0.9 ELSE NULL END
       FROM stations s WHERE s.id = p_station),
    (SELECT (p.settings ->> 'co2e_default_factor')::numeric FROM properties p WHERE p.id = p_property),
    2.5)
$$;

CREATE OR REPLACE FUNCTION sf_waste_logs_co2e() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.co2e_kg := round(NEW.kg * sf_co2e_factor(NEW.station_id, NEW.property_id), 3);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_waste_logs_co2e BEFORE INSERT OR UPDATE OF kg, station_id ON waste_logs
  FOR EACH ROW EXECUTE FUNCTION sf_waste_logs_co2e();

-- Actual covers per service (from the POS close or a manual count).
CREATE TABLE service_actuals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id      uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date   date NOT NULL,
  actual_covers  int NOT NULL CHECK (actual_covers >= 0),
  revenue        numeric(12,2),
  by_wave        jsonb NOT NULL DEFAULT '[]',
  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('pos','manual','csv','api')),
  closed_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, service_date)
);

-- The debrief: forecast against actual, waste against baseline, savings split
-- three ways (ServiceFlow's predictive share · the bin scale's reactive share ·
-- total), CO2e from measured waste only.
CREATE TABLE outcomes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id             uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date          date NOT NULL,
  forecast_id           uuid REFERENCES forecasts(id) ON DELETE SET NULL,
  forecast_covers_p50   int,
  forecast_covers_p10   int,
  forecast_covers_p90   int,
  actual_covers         int,
  error_pct             numeric(7,3),      -- signed, (actual - p50) / p50
  mape                  numeric(7,4),      -- absolute
  within_band           boolean,
  usual_covers          int,
  waste_kg              numeric(10,3),
  waste_g_per_cover     numeric(8,2),
  baseline_g_per_cover  numeric(8,2),
  waste_avoided_kg      numeric(10,3),
  co2e_kg               numeric(10,3),     -- measured waste × factor
  co2e_avoided_kg       numeric(10,3),
  food_cost             numeric(12,2),     -- covers × cost per cover
  saving_serviceflow    numeric(12,2),     -- the predictive share (3 of 4 points by default)
  saving_bin_scale      numeric(12,2),     -- the reactive share (1 point) when a bin scale exists
  saving_total          numeric(12,2),
  currency              char(3) NOT NULL DEFAULT 'USD',
  plan_followed_pct     numeric(5,2),      -- stations prepped to the approved plan
  decisions_approved    int,
  decisions_total       int,
  computed_at           timestamptz NOT NULL DEFAULT now(),
  notes                 text,
  UNIQUE (outlet_id, service_date),
  CHECK (saving_serviceflow IS NULL OR saving_bin_scale IS NULL OR saving_total IS NULL
         OR saving_serviceflow + saving_bin_scale <= saving_total + 0.01)
);
CREATE INDEX idx_outcomes_lookup ON outcomes(outlet_id, service_date DESC);
CREATE INDEX idx_outcomes_property_date ON outcomes(property_id, service_date DESC);

-- The team's corrections enter the next plan.
CREATE TABLE plan_corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  station_id    uuid REFERENCES stations(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  factor        numeric(6,4) NOT NULL DEFAULT 1.0 CHECK (factor BETWEEN 0.2 AND 3),
  note          text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_corrections_lookup ON plan_corrections(outlet_id, station_id, service_date DESC);

-- Audit of every prediction, for the backtest and for Marriott's IT.
CREATE TABLE prediction_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  forecast_id   uuid REFERENCES forecasts(id) ON DELETE SET NULL,
  model_version text NOT NULL,
  features      jsonb NOT NULL DEFAULT '{}',
  prediction    jsonb NOT NULL DEFAULT '{}',
  outcome       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prediction_log_lookup ON prediction_log(outlet_id, service_date DESC);
