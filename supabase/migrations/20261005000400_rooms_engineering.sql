-- ============================================================================
-- ServiceFlow — schema v2 · 4/7 · rooms (housekeeping), engineering, energy
-- "After the F&B pilot. Same platform, same approvals."
-- ============================================================================

-- ─── housekeeping ───────────────────────────────────────────────────────────

CREATE TABLE room_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id         uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  service_date    date NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('departure','stayover','arrival','vip_arrival','deep_clean','inspection','turndown')),
  priority        int  NOT NULL DEFAULT 3,         -- 1 = first
  vip             boolean NOT NULL DEFAULT false,
  needed_by       time,                             -- arrival time or "needed by 14:00"
  departure_at    time,
  arrival_at      time,
  notes           text,                             -- "orchids, bar", "extra bed", "deep clean"
  dnd_until       time,                             -- do-not-disturb lifted at
  status          text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','inspected','skipped')),
  started_at      timestamptz,
  done_at         timestamptz,
  minutes         int,
  done_by         uuid REFERENCES team_members(id) ON DELETE SET NULL,
  inspected_by    uuid REFERENCES team_members(id) ON DELETE SET NULL,
  inspected_at    timestamptz,
  source          text NOT NULL DEFAULT 'pms' CHECK (source IN ('pms','manual','csv','voice')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, service_date, kind)
);
CREATE INDEX idx_room_tasks_lookup ON room_tasks(property_id, service_date, status);
CREATE TRIGGER trg_room_tasks_touch BEFORE UPDATE ON room_tasks FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- ─── engineering ────────────────────────────────────────────────────────────

CREATE TABLE work_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  asset_id        uuid REFERENCES assets(id) ON DELETE SET NULL,
  room_id         uuid REFERENCES rooms(id) ON DELETE SET NULL,
  outlet_id       uuid REFERENCES outlets(id) ON DELETE SET NULL,
  title           text NOT NULL,                 -- "Lift B door sensor"
  detail          text,                          -- "floors 1–15 · guest-facing · vendor 08:00"
  priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  guest_impact    text NOT NULL DEFAULT 'none' CHECK (guest_impact IN ('guest_facing','in_room','suites','outlet','back_of_house','none')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','planned','closed','cancelled')),
  opened_at       timestamptz NOT NULL DEFAULT now(),
  due_at          timestamptz,
  closed_at       timestamptz,
  assigned_to     uuid REFERENCES team_members(id) ON DELETE SET NULL,
  vendor          text,
  raised_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','voice','sensor','pms','csv')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_work_orders_lookup ON work_orders(property_id, status, priority);
CREATE TRIGGER trg_work_orders_touch BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- Plant readings (load %, pressure, temperature) from a BMS export or by hand.
CREATE TABLE asset_readings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  asset_id      uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  at            timestamptz NOT NULL DEFAULT now(),
  metric        text NOT NULL,                   -- load_pct, pressure_bar, temp_c, status
  value         numeric(12,3) NOT NULL,
  unit          text,
  source        text NOT NULL DEFAULT 'manual'
);
CREATE INDEX idx_asset_readings_lookup ON asset_readings(asset_id, at DESC);

-- Planned works, checked against the day (kitchen plan, arrivals, guest notices).
CREATE TABLE planned_works (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  asset_id        uuid REFERENCES assets(id) ON DELETE SET NULL,
  outlet_id       uuid REFERENCES outlets(id) ON DELETE SET NULL,
  title           text NOT NULL,                 -- "Kitchen extract fan"
  starts_at       timestamptz NOT NULL,
  duration_min    int NOT NULL DEFAULT 60,
  areas           text,                          -- "floors 20–26"
  notify_guests   boolean NOT NULL DEFAULT false,
  checks          jsonb NOT NULL DEFAULT '{}',   -- {"kitchen":"clear","arrivals":"14 rooms by 14:00","notices":"required"}
  verdict         text NOT NULL DEFAULT 'clear' CHECK (verdict IN ('clear','notify','clash')),
  status          text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','done','cancelled')),
  confirmed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_planned_works_lookup ON planned_works(property_id, starts_at);
CREATE TRIGGER trg_planned_works_touch BEFORE UPDATE ON planned_works FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- ─── energy ─────────────────────────────────────────────────────────────────

CREATE TABLE energy_readings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  category      text NOT NULL CHECK (category IN ('cooling','kitchens','lifts_lighting','other')),
  kwh           numeric(12,2) NOT NULL CHECK (kwh >= 0),
  note          text,                            -- "night setback on"
  source        text NOT NULL DEFAULT 'meter' CHECK (source IN ('meter','manual','csv','api')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, service_date, category)
);
CREATE INDEX idx_energy_readings_lookup ON energy_readings(property_id, service_date DESC);

-- ─── voice and text logs, any department ────────────────────────────────────
-- "Western hot over-prep 2 kg" · "2506 done, 24 minutes" · "Lift B back in service"
CREATE TABLE voice_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid REFERENCES outlets(id) ON DELETE SET NULL,
  department    text NOT NULL DEFAULT 'kitchen',
  transcript    text NOT NULL,
  language      text,
  parsed        jsonb NOT NULL DEFAULT '{}',     -- {"intent":"waste","station":"western_hot","kg":2,"reason":"over-prep"}
  applied_table text,
  applied_id    uuid,
  confidence    numeric(4,3),
  seconds_to_log int,
  logged_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_voice_logs_lookup ON voice_logs(property_id, created_at DESC);
