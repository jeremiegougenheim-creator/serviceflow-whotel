-- ─── 008 Team roster · station status · flags · manual waste ─────────────────
-- Supports Section 17: bidirectional notification flow + role-based routing.
-- All tables are property-scoped via FK chain (outlet_id → outlets → property_id).

-- ─── team_members ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('chef','sous_chef','prep_cook','fnb_mgr','gm','auditor')),
  phone       text,
  email       text,
  active      bool        NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX team_members_property_idx ON team_members (property_id);

-- ─── daily_assignments ────────────────────────────────────────────────────────
-- One row per (outlet, date, team_member). station_id NULL for chef/GM/F&B Mgr.
-- confirmed_at set by chef; acknowledged_at set when member opens their brief.

CREATE TABLE IF NOT EXISTS daily_assignments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       uuid        NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date    date        NOT NULL,
  team_member_id  uuid        NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  station_id      uuid        REFERENCES stations(id) ON DELETE SET NULL,
  wave            text        CHECK (wave IN ('all','wave1','wave2','wave3')),
  confirmed_at    timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (outlet_id, service_date, team_member_id)
);

CREATE INDEX daily_assignments_outlet_date_idx ON daily_assignments (outlet_id, service_date);

-- ─── station_status ───────────────────────────────────────────────────────────
-- Live tick-off written by sous-chef / prep cook during service.

CREATE TABLE IF NOT EXISTS station_status (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id   uuid        NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  service_date date        NOT NULL,
  wave         text        NOT NULL CHECK (wave IN ('wave1','wave2','wave3')),
  status       text        NOT NULL CHECK (status IN ('prepped','running_low','closed')),
  updated_by   uuid        NOT NULL REFERENCES team_members(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  photo_url    text
);

CREATE INDEX station_status_station_date_idx ON station_status (station_id, service_date);

-- ─── flags ────────────────────────────────────────────────────────────────────
-- One-tap issue reports from any team member → routed to chef.

CREATE TABLE IF NOT EXISTS flags (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id    uuid        NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  service_date date        NOT NULL,
  station_id   uuid        REFERENCES stations(id) ON DELETE SET NULL,
  kind         text        NOT NULL CHECK (kind IN ('running_low','quality_issue','equipment','safety')),
  raised_by    uuid        NOT NULL REFERENCES team_members(id),
  raised_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  notes        text
);

CREATE INDEX flags_outlet_date_idx ON flags (outlet_id, service_date);

-- ─── manual_waste_entry ───────────────────────────────────────────────────────
-- Fallback when Winnow is unavailable. Feeds waste_measured.source = 'manual_fallback'.
-- RÈGLE 3: CO₂e is never calculated from this table directly — always from waste_measured.

CREATE TABLE IF NOT EXISTS manual_waste_entry (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id   uuid        NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  service_date date        NOT NULL,
  kg           numeric     NOT NULL CHECK (kg >= 0),
  entered_by   uuid        NOT NULL REFERENCES team_members(id),
  entered_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manual_waste_station_date_idx ON manual_waste_entry (station_id, service_date);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE team_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_status     ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_waste_entry ENABLE ROW LEVEL SECURITY;

-- service_role bypass (Edge Functions, Python connectors)
CREATE POLICY team_members_service_role       ON team_members       FOR ALL TO service_role USING (true);
CREATE POLICY daily_assignments_service_role  ON daily_assignments  FOR ALL TO service_role USING (true);
CREATE POLICY station_status_service_role     ON station_status     FOR ALL TO service_role USING (true);
CREATE POLICY flags_service_role              ON flags               FOR ALL TO service_role USING (true);
CREATE POLICY manual_waste_service_role       ON manual_waste_entry FOR ALL TO service_role USING (true);

-- Authenticated users: scoped to their property via memberships
CREATE POLICY team_members_member_read ON team_members
  FOR SELECT TO authenticated
  USING (
    property_id IN (
      SELECT property_id FROM memberships
      WHERE user_id = auth.uid() AND active = true
    )
  );

CREATE POLICY daily_assignments_member_read ON daily_assignments
  FOR SELECT TO authenticated
  USING (
    outlet_id IN (
      SELECT o.id FROM outlets o
      JOIN memberships m ON m.property_id = o.property_id
      WHERE m.user_id = auth.uid() AND m.active = true
    )
  );

-- Chef/F&B Mgr can write daily_assignments (confirm roster)
CREATE POLICY daily_assignments_chef_write ON daily_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    outlet_id IN (
      SELECT o.id FROM outlets o
      JOIN memberships m ON m.property_id = o.property_id
      WHERE m.user_id = auth.uid() AND m.active = true
        AND m.role IN ('chef','fnb_mgr','admin')
    )
  );

CREATE POLICY daily_assignments_chef_update ON daily_assignments
  FOR UPDATE TO authenticated
  USING (
    outlet_id IN (
      SELECT o.id FROM outlets o
      JOIN memberships m ON m.property_id = o.property_id
      WHERE m.user_id = auth.uid() AND m.active = true
        AND m.role IN ('chef','fnb_mgr','admin')
    )
  );

-- Any team member can write station_status and flags (up-flow)
CREATE POLICY station_status_member_write ON station_status
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY station_status_member_read ON station_status
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY flags_member_write ON flags
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY flags_member_read ON flags
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY manual_waste_member_write ON manual_waste_entry
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY manual_waste_member_read ON manual_waste_entry
  FOR SELECT TO authenticated
  USING (true);
