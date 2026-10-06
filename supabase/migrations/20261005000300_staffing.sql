-- ============================================================================
-- ServiceFlow — schema v2 · 3/7 · staffing: hours against demand
-- "Forecast first. Hours follow the covers, not last week's rota."
-- ============================================================================

-- A service line is what the roster is planned against: "Breakfast service",
-- "Kitchen, early shift", "Stewarding", "Housekeeping, morning"…
CREATE TABLE service_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id       uuid REFERENCES outlets(id) ON DELETE CASCADE,   -- null → property-wide (housekeeping)
  name            text NOT NULL,
  department      text NOT NULL CHECK (department IN
                    ('kitchen','service','stewarding','bar','housekeeping','engineering','front_office','management')),
  shift_label     text,                       -- 'early', 'late', 'morning'
  starts_at       time,
  ends_at         time,
  hours_per_cover numeric(8,4),               -- demand = covers × ratio (F&B lines)
  minutes_per_room numeric(8,2),              -- demand = rooms to service × minutes (housekeeping)
  fixed_hours     numeric(8,2) NOT NULL DEFAULT 0,  -- hours needed regardless of volume
  min_hours       numeric(8,2) NOT NULL DEFAULT 0,
  sort_order      int NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_service_lines_property ON service_lines(property_id);

-- Planned shifts (the rota). Draft for next week, published for this week.
CREATE TABLE roster_shifts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_line_id  uuid NOT NULL REFERENCES service_lines(id) ON DELETE CASCADE,
  team_member_id   uuid REFERENCES team_members(id) ON DELETE SET NULL,
  service_date     date NOT NULL,
  starts_at        time NOT NULL,
  ends_at          time NOT NULL,
  hours            numeric(6,2) NOT NULL CHECK (hours >= 0),
  station_id       uuid REFERENCES stations(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','confirmed','acknowledged','cancelled')),
  acknowledged_at  timestamptz,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_roster_shifts_lookup ON roster_shifts(property_id, service_date);
CREATE INDEX idx_roster_shifts_line ON roster_shifts(service_line_id, service_date);
CREATE TRIGGER trg_roster_shifts_touch BEFORE UPDATE ON roster_shifts FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- Hours the forecast asks for, per service line and day (written by the engine).
CREATE TABLE staffing_demand (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_line_id  uuid NOT NULL REFERENCES service_lines(id) ON DELETE CASCADE,
  service_date     date NOT NULL,
  demand_hours     numeric(8,2) NOT NULL CHECK (demand_hours >= 0),
  basis            jsonb NOT NULL DEFAULT '{}',     -- {"covers":214,"ratio":0.21} or {"rooms":153,"minutes":25}
  computed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_line_id, service_date)
);
CREATE INDEX idx_staffing_demand_lookup ON staffing_demand(property_id, service_date);

-- Roster suggestions: "Move one cook from Tuesday to Saturday morning."
CREATE TABLE roster_suggestions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  week_start       date NOT NULL,                 -- Monday
  service_line_id  uuid REFERENCES service_lines(id) ON DELETE CASCADE,
  service_date     date,
  title            text NOT NULL,                 -- "Saturday kitchen is short by 7 hours."
  detail           text,                          -- "Move one cook from Tuesday to Saturday morning."
  delta_hours      numeric(8,2),
  moves            jsonb NOT NULL DEFAULT '[]',   -- [{"from_date":"..","to_date":"..","hours":7,"team_member_id":null}]
  status           text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','dismissed','expired')),
  applied_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  applied_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_roster_suggestions_lookup ON roster_suggestions(property_id, week_start, status);
