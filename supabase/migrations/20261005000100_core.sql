-- ============================================================================
-- ServiceFlow by SparkEdge — schema v2 · 1/7 · tenancy, people, configuration
--
-- Design rules
--   * Every tenant table carries property_id so one RLS predicate covers all.
--   * Configuration lives in the database (stations, waves, rate codes, costs,
--     CO2e factors, currency, staffing ratios): onboarding needs no code.
--   * Money is stored in the property's own currency (properties.currency).
--   * Nothing here names a real hotel: seeds are illustrative.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sf_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ─── organisations, regions, properties ─────────────────────────────────────

CREATE TABLE orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  currency    char(3) NOT NULL DEFAULT 'USD',   -- reporting currency for the portfolio
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_orgs_touch BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

CREATE TABLE regions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX idx_regions_org ON regions(org_id);

CREATE TABLE properties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  region_id     uuid REFERENCES regions(id) ON DELETE SET NULL,
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  brand         text,
  keys          int  NOT NULL CHECK (keys > 0),
  timezone      text NOT NULL DEFAULT 'Asia/Hong_Kong',
  currency      char(3) NOT NULL DEFAULT 'USD',
  country_code  char(2) NOT NULL DEFAULT 'HK',
  city          text,
  -- per-hotel configuration (no code): see docs/configuration.md
  --   food_cost_per_cover      numeric  cost of food served per breakfast cover
  --   waste_baseline_g_cover   numeric  measured baseline before ServiceFlow
  --   co2e_default_factor      numeric  kg CO2e per kg food when no station factor
  --   winnow                   boolean  a bin scale is in place (1 reactive point)
  --   saving_points_total      numeric  4 by default
  --   saving_points_serviceflow numeric 3 by default (the predictive share)
  --   staffing                 jsonb    hours-per-cover ratios per service
  --   energy_baseline_kwh_room numeric  baseline kWh per occupied room
  --   brief_time               text     '18:00' local
  --   dawn_update_time         text     '03:30' local
  --   debrief_time             text     '12:30' local
  settings      jsonb NOT NULL DEFAULT '{}',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_properties_org ON properties(org_id);
CREATE INDEX idx_properties_region ON properties(region_id);
CREATE TRIGGER trg_properties_touch BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- ─── people ────────────────────────────────────────────────────────────────

-- Mirror of auth.users (created by trigger on sign-up).
CREATE TABLE users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  locale      text NOT NULL DEFAULT 'en',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

CREATE OR REPLACE FUNCTION sf_handle_new_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  -- Attach pending invitations (memberships created by email before sign-up).
  UPDATE public.memberships SET user_id = NEW.id
   WHERE user_id IS NULL AND lower(invited_email) = lower(NEW.email);
  RETURN NEW;
END $$;

-- The roles ServiceFlow knows. Property roles act inside one hotel;
-- portfolio roles read across a scope (org or region, or several properties).
--   gm, fnb_mgr, chef, sous_chef, prep_cook, hk, eng, auditor, admin
--   owner, vp, ceo
CREATE TABLE memberships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  invited_email  text,
  scope_type     text NOT NULL CHECK (scope_type IN ('property','region','org')),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  region_id      uuid REFERENCES regions(id) ON DELETE CASCADE,
  property_id    uuid REFERENCES properties(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN
                   ('gm','fnb_mgr','chef','sous_chef','prep_cook','hk','eng','auditor','admin','owner','vp','ceo')),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL),
  CHECK ((scope_type = 'property' AND property_id IS NOT NULL)
      OR (scope_type = 'region'   AND region_id   IS NOT NULL)
      OR (scope_type = 'org'))
);
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_property ON memberships(property_id);
CREATE INDEX idx_memberships_email ON memberships(lower(invited_email));
CREATE TRIGGER trg_memberships_touch BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- People on the rota. May or may not have a login (user_id).
CREATE TABLE team_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  name          text NOT NULL,
  department    text NOT NULL CHECK (department IN
                  ('kitchen','service','stewarding','bar','housekeeping','engineering','front_office','management')),
  role          text NOT NULL DEFAULT 'cook',   -- free text: chef, sous chef, cook, attendant, technician…
  phone         text,
  email         text,
  hourly_cost   numeric(10,2),
  pool          boolean NOT NULL DEFAULT false, -- casual / agency pool
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_team_members_property ON team_members(property_id);
CREATE TRIGGER trg_team_members_touch BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- ─── outlets, waves, stations ───────────────────────────────────────────────

CREATE TABLE outlets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  outlet_type   text NOT NULL CHECK (outlet_type IN ('breakfast','restaurant','bar','banquet','room_service','other')),
  meal_period   text NOT NULL DEFAULT 'breakfast' CHECK (meal_period IN ('breakfast','lunch','dinner','all_day','event')),
  opens_at      time NOT NULL DEFAULT '06:30',
  closes_at     time NOT NULL DEFAULT '10:30',
  capacity_pax  int CHECK (capacity_pax > 0),
  -- configuration:
  --   attach_by_rate_code  jsonb   {"breakfast_inclusive":0.92,...}
  --   lounge_divert_tiers  text[]  loyalty tiers served in the lounge
  --   food_cost_per_cover  numeric overrides the property value
  --   usual_covers         numeric fallback when there is no history
  --   hours_per_cover      jsonb   {"kitchen":0.21,"service":0.29,"stewarding":0.18}
  settings      jsonb NOT NULL DEFAULT '{}',
  sort_order    int NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, slug)
);
CREATE INDEX idx_outlets_property ON outlets(property_id);
CREATE TRIGGER trg_outlets_touch BEFORE UPDATE ON outlets FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- Service waves (breakfast: open 06:30, 08:00, 09:30 · dinner: 18:00, 20:00 · bar: 18:00, 21:00).
CREATE TABLE waves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  label         text NOT NULL,          -- 'Open', '08:00', '09:30', 'Dinner', '21:00'
  starts_at     time NOT NULL,
  share_default numeric(5,4) NOT NULL DEFAULT 0.34 CHECK (share_default BETWEEN 0 AND 1),
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE (outlet_id, sort_order)
);
CREATE INDEX idx_waves_outlet ON waves(outlet_id);

-- A station is a buffet station, a dish on an à la carte par list, a batch at the bar
-- or a banquet course: the unit of the production plan.
CREATE TABLE stations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id            uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  slug                 text NOT NULL,
  station_kind         text NOT NULL DEFAULT 'buffet' CHECK (station_kind IN ('buffet','dish','batch','course')),
  food_category        text NOT NULL DEFAULT 'default',  -- bread_pastry, meat, dairy, vegetables, seafood, rice_noodles, fruit, beverage, default
  unit                 text NOT NULL DEFAULT 'portions',  -- portions, kg, L, plates, covers
  base_par             numeric(10,2) NOT NULL DEFAULT 0,  -- usual quantity at usual covers
  usual_covers         numeric(10,2),                     -- covers the base_par refers to (defaults to outlet usual_covers)
  cost_per_unit        numeric(10,2) NOT NULL DEFAULT 0,  -- in property currency
  kg_per_unit          numeric(8,3)  NOT NULL DEFAULT 0.25,
  co2e_factor          numeric(6,3),                      -- kg CO2e per kg; null → category/property default
  high_value           boolean NOT NULL DEFAULT false,    -- dishes that cost most when wasted
  nationality_priors   jsonb NOT NULL DEFAULT '{}',       -- {"greater_china":{"mult":1.5,"conf":0.9},...}
  dow_profile          jsonb NOT NULL DEFAULT '{}',       -- {"weekend":1.1,"weekday":0.95}
  weather_profile      jsonb NOT NULL DEFAULT '{}',       -- {"rain":0.9,"hot":1.1}
  settings             jsonb NOT NULL DEFAULT '{}',
  sort_order           int NOT NULL DEFAULT 0,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, slug)
);
CREATE INDEX idx_stations_outlet ON stations(outlet_id);
CREATE INDEX idx_stations_property ON stations(property_id);
CREATE TRIGGER trg_stations_touch BEFORE UPDATE ON stations FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- Rooms inventory (housekeeping, VIP arrivals, engineering in-room faults).
CREATE TABLE rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  number        text NOT NULL,
  floor         int,
  room_type     text NOT NULL DEFAULT 'king',
  is_suite      boolean NOT NULL DEFAULT false,
  target_minutes int NOT NULL DEFAULT 25,
  active        boolean NOT NULL DEFAULT true,
  UNIQUE (property_id, number)
);
CREATE INDEX idx_rooms_property ON rooms(property_id);

-- Plant and equipment (engineering).
CREATE TABLE assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('lift','ahu','chiller','boiler','pump','extract_fan','fire','generator','other')),
  location      text,
  guest_facing  boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','watch','offline','maintenance')),
  status_note   text,
  sort_order    int NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_property ON assets(property_id);
CREATE TRIGGER trg_assets_touch BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();
