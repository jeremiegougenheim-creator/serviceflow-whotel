-- ============================================================
-- Lauds — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Helper: auto-update updated_at ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── orgs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orgs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- ─── properties ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS properties (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  brand         TEXT,
  keys          INTEGER NOT NULL CHECK (keys > 0),
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  address       TEXT,
  country_code  CHAR(2) NOT NULL DEFAULT 'TW',
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_org_id ON properties(org_id);

CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- ─── outlets ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outlets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  outlet_type     TEXT NOT NULL DEFAULT 'restaurant',
  capacity_pax    INTEGER CHECK (capacity_pax > 0),
  settings        JSONB NOT NULL DEFAULT '{}',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, slug)
);

CREATE INDEX idx_outlets_property_id ON outlets(property_id);

CREATE TRIGGER trg_outlets_updated_at
  BEFORE UPDATE ON outlets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;

-- ─── stations ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stations (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id               UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL,
  food_category           TEXT NOT NULL,
  co2e_factor_kg_per_kg   NUMERIC(6,3) NOT NULL DEFAULT 1.0 CHECK (co2e_factor_kg_per_kg >= 0),
  sort_order              INTEGER NOT NULL DEFAULT 0,
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  settings                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (outlet_id, slug)
);

CREATE INDEX idx_stations_outlet_id ON stations(outlet_id);

CREATE TRIGGER trg_stations_updated_at
  BEFORE UPDATE ON stations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

-- ─── users ────────────────────────────────────────────────────────────────────
-- Mirrors auth.users; populated via trigger on auth.users insert.

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  locale      TEXT NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Auto-create public user record on signup
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ─── memberships ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memberships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'chef'
                  CHECK (role IN ('gm', 'chef', 'sous_chef', 'fnb_mgr', 'auditor', 'admin')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, property_id)
);

CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_property_id ON memberships(property_id);

CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- ─── pms_daily ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_daily (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id           UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date          DATE NOT NULL,
  rooms_occupied        INTEGER NOT NULL CHECK (rooms_occupied >= 0),
  rooms_available       INTEGER NOT NULL CHECK (rooms_available > 0),
  occupancy_pct         NUMERIC(5,4) NOT NULL CHECK (occupancy_pct BETWEEN 0 AND 1),
  adr                   NUMERIC(10,2),
  revpar                NUMERIC(10,2),
  segment_leisure_pct   NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (segment_leisure_pct BETWEEN 0 AND 1),
  segment_business_pct  NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (segment_business_pct BETWEEN 0 AND 1),
  segment_group_pct     NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (segment_group_pct BETWEEN 0 AND 1),
  segment_other_pct     NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (segment_other_pct BETWEEN 0 AND 1),
  source                TEXT NOT NULL DEFAULT 'manual',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, service_date)
);

CREATE INDEX idx_pms_daily_property_date ON pms_daily(property_id, service_date);

CREATE TRIGGER trg_pms_daily_updated_at
  BEFORE UPDATE ON pms_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE pms_daily ENABLE ROW LEVEL SECURITY;

-- ─── weather_daily ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weather_daily (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date        DATE NOT NULL,
  temp_c              NUMERIC(5,2),
  feels_like_c        NUMERIC(5,2),
  humidity_pct        NUMERIC(5,2),
  condition           TEXT,
  precipitation_mm    NUMERIC(6,2),
  wind_kph            NUMERIC(6,2),
  source              TEXT NOT NULL DEFAULT 'openweather',
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, service_date)
);

CREATE INDEX idx_weather_daily_property_date ON weather_daily(property_id, service_date);

CREATE TRIGGER trg_weather_daily_updated_at
  BEFORE UPDATE ON weather_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE weather_daily ENABLE ROW LEVEL SECURITY;

-- ─── events_daily ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events_daily (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date    DATE NOT NULL,
  event_name      TEXT NOT NULL,
  event_type      TEXT NOT NULL DEFAULT 'general',
  pax_expected    INTEGER CHECK (pax_expected >= 0),
  lift_factor     NUMERIC(5,3) NOT NULL DEFAULT 1.0 CHECK (lift_factor >= 0),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_daily_property_date ON events_daily(property_id, service_date);

CREATE TRIGGER trg_events_daily_updated_at
  BEFORE UPDATE ON events_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE events_daily ENABLE ROW LEVEL SECURITY;

-- ─── waste_measured ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS waste_measured (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  station_id    UUID REFERENCES stations(id) ON DELETE SET NULL,
  service_date  DATE NOT NULL,
  wave_label    TEXT CHECK (wave_label IN ('open_0630','wave_0745','wave_0800','wave_0915','wave_0930')),
  waste_kg      NUMERIC(8,3) NOT NULL CHECK (waste_kg >= 0),
  co2e_kg       NUMERIC(8,3) NOT NULL CHECK (co2e_kg >= 0),
  source        TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('winnow', 'manual')),
  raw_payload   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waste_measured_outlet_date ON waste_measured(outlet_id, service_date);
CREATE INDEX idx_waste_measured_station_date ON waste_measured(station_id, service_date);

CREATE TRIGGER trg_waste_measured_updated_at
  BEFORE UPDATE ON waste_measured
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE waste_measured ENABLE ROW LEVEL SECURITY;

-- ─── forecasts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forecasts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id             UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date          DATE NOT NULL,
  covers_p10            INTEGER NOT NULL CHECK (covers_p10 >= 0),
  covers_p50            INTEGER NOT NULL CHECK (covers_p50 >= 0),
  covers_p90            INTEGER NOT NULL CHECK (covers_p90 >= 0),
  occupancy_input       NUMERIC(5,4) NOT NULL CHECK (occupancy_input BETWEEN 0 AND 1),
  segment_leisure_pct   NUMERIC(5,4) NOT NULL DEFAULT 0,
  segment_business_pct  NUMERIC(5,4) NOT NULL DEFAULT 0,
  segment_group_pct     NUMERIC(5,4) NOT NULL DEFAULT 0,
  weather_condition     TEXT,
  temp_c                NUMERIC(5,2),
  event_lift            NUMERIC(5,3) NOT NULL DEFAULT 1.0,
  is_weekend            BOOLEAN NOT NULL DEFAULT FALSE,
  model_version         TEXT NOT NULL DEFAULT 'v3',
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_covers_band CHECK (covers_p10 <= covers_p50 AND covers_p50 <= covers_p90)
);

CREATE INDEX idx_forecasts_outlet_date ON forecasts(outlet_id, service_date);
CREATE UNIQUE INDEX idx_forecasts_outlet_date_unique ON forecasts(outlet_id, service_date);

CREATE TRIGGER trg_forecasts_updated_at
  BEFORE UPDATE ON forecasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

-- ─── station_pars ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS station_pars (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forecast_id     UUID NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  station_id      UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  wave_label      TEXT NOT NULL
                    CHECK (wave_label IN ('open_0630','wave_0745','wave_0800','wave_0915','wave_0930')),
  par_kg          NUMERIC(8,3) NOT NULL CHECK (par_kg >= 0),
  par_kg_p10      NUMERIC(8,3) NOT NULL CHECK (par_kg_p10 >= 0),
  par_kg_p90      NUMERIC(8,3) NOT NULL CHECK (par_kg_p90 >= 0),
  waste_risk_kg   NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (waste_risk_kg >= 0),
  co2e_risk_kg    NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (co2e_risk_kg >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (forecast_id, station_id, wave_label),
  CONSTRAINT chk_par_band CHECK (par_kg_p10 <= par_kg AND par_kg <= par_kg_p90)
);

CREATE INDEX idx_station_pars_forecast_id ON station_pars(forecast_id);
CREATE INDEX idx_station_pars_station_id ON station_pars(station_id);

CREATE TRIGGER trg_station_pars_updated_at
  BEFORE UPDATE ON station_pars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE station_pars ENABLE ROW LEVEL SECURITY;

-- ─── actions ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS actions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forecast_id   UUID NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  station_id    UUID REFERENCES stations(id) ON DELETE SET NULL,
  action_type   TEXT NOT NULL DEFAULT 'prep_adjustment',
  priority      INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  title         TEXT NOT NULL,
  description   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_forecast_id ON actions(forecast_id);
CREATE INDEX idx_actions_station_id ON actions(station_id);

CREATE TRIGGER trg_actions_updated_at
  BEFORE UPDATE ON actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

-- ─── prep_status ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prep_status (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forecast_id   UUID NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  station_id    UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  wave_label    TEXT NOT NULL
                  CHECK (wave_label IN ('open_0630','wave_0745','wave_0800','wave_0915','wave_0930')),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'in_progress', 'complete', 'skip')),
  actual_kg     NUMERIC(8,3) CHECK (actual_kg >= 0),
  notes         TEXT,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (forecast_id, station_id, wave_label)
);

CREATE INDEX idx_prep_status_forecast_id ON prep_status(forecast_id);
CREATE INDEX idx_prep_status_station_id ON prep_status(station_id);

CREATE TRIGGER trg_prep_status_updated_at
  BEFORE UPDATE ON prep_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE prep_status ENABLE ROW LEVEL SECURITY;

-- ─── outcomes ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outcomes (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id               UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date            DATE NOT NULL,
  actual_covers           INTEGER CHECK (actual_covers >= 0),
  forecast_covers_p50     INTEGER CHECK (forecast_covers_p50 >= 0),
  total_waste_kg          NUMERIC(10,3) CHECK (total_waste_kg >= 0),
  total_co2e_kg           NUMERIC(10,3) CHECK (total_co2e_kg >= 0),
  food_cost_saved_usd     NUMERIC(10,2),
  accuracy_pct            NUMERIC(5,2) CHECK (accuracy_pct BETWEEN 0 AND 100),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (outlet_id, service_date)
);

CREATE INDEX idx_outcomes_outlet_date ON outcomes(outlet_id, service_date);

CREATE TRIGGER trg_outcomes_updated_at
  BEFORE UPDATE ON outcomes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;

-- ─── esg_log ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS esg_log (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id               UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date            DATE NOT NULL,
  period_type             TEXT NOT NULL DEFAULT 'daily'
                            CHECK (period_type IN ('daily', 'weekly', 'monthly', 'ytd')),
  waste_kg                NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (waste_kg >= 0),
  co2e_kg                 NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (co2e_kg >= 0),
  food_cost_saved_usd     NUMERIC(12,2) NOT NULL DEFAULT 0,
  water_l                 NUMERIC(12,2) CHECK (water_l >= 0),
  covers_served           INTEGER CHECK (covers_served >= 0),
  waste_per_cover_kg      NUMERIC(8,4) CHECK (waste_per_cover_kg >= 0),
  co2e_per_cover_kg       NUMERIC(8,4) CHECK (co2e_per_cover_kg >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_esg_log_outlet_date ON esg_log(outlet_id, service_date);

CREATE TRIGGER trg_esg_log_updated_at
  BEFORE UPDATE ON esg_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE esg_log ENABLE ROW LEVEL SECURITY;

-- ─── prediction_log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prediction_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date    DATE NOT NULL,
  model_version   TEXT NOT NULL,
  input_snapshot  JSONB NOT NULL DEFAULT '{}',
  covers_p10      INTEGER NOT NULL CHECK (covers_p10 >= 0),
  covers_p50      INTEGER NOT NULL CHECK (covers_p50 >= 0),
  covers_p90      INTEGER NOT NULL CHECK (covers_p90 >= 0),
  actual_covers   INTEGER CHECK (actual_covers >= 0),
  mae             NUMERIC(8,3),
  mape            NUMERIC(8,4),
  within_band     BOOLEAN,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pred_band CHECK (covers_p10 <= covers_p50 AND covers_p50 <= covers_p90)
);

CREATE INDEX idx_prediction_log_outlet_date ON prediction_log(outlet_id, service_date);

ALTER TABLE prediction_log ENABLE ROW LEVEL SECURITY;
