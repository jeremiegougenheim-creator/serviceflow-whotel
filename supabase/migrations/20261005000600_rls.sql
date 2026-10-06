-- ============================================================================
-- ServiceFlow — schema v2 · 6/7 · row level security
--
-- One rule: a row is visible to the people who belong to its property
-- (directly, through their region, or through their organisation), and
-- writable by the roles that own that part of the operation. Portfolio roles
-- (owner, vp, ceo) read; they never write. The engine writes with the service
-- role, which bypasses RLS and is never shipped to a browser.
-- ============================================================================

-- ─── helpers ────────────────────────────────────────────────────────────────

-- Properties the signed-in user can see.
CREATE OR REPLACE FUNCTION sf_my_property_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT p.id), '{}'::uuid[])
  FROM properties p
  JOIN memberships m
    ON m.user_id = auth.uid() AND m.active
   AND (   (m.scope_type = 'property' AND m.property_id = p.id)
        OR (m.scope_type = 'region'   AND m.region_id   = p.region_id)
        OR (m.scope_type = 'org'      AND m.org_id      = p.org_id))
$$;

-- Roles the signed-in user holds on one property.
CREATE OR REPLACE FUNCTION sf_my_roles(p_property uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT m.role), '{}'::text[])
  FROM memberships m
  JOIN properties p ON p.id = p_property
  WHERE m.user_id = auth.uid() AND m.active
    AND (   (m.scope_type = 'property' AND m.property_id = p.id)
         OR (m.scope_type = 'region'   AND m.region_id   = p.region_id)
         OR (m.scope_type = 'org'      AND m.org_id      = p.org_id))
$$;

CREATE OR REPLACE FUNCTION sf_is_member(p_property uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_property = ANY (sf_my_property_ids())
$$;

-- True when the user holds any of the given roles on the property (admin always).
CREATE OR REPLACE FUNCTION sf_can(p_property uuid, VARIADIC p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sf_my_roles(p_property) && (p_roles || '{admin}'::text[])
$$;

-- Orgs and regions the user can see (through any property, or an org/region scope).
CREATE OR REPLACE FUNCTION sf_my_org_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT m.org_id), '{}'::uuid[])
  FROM memberships m WHERE m.user_id = auth.uid() AND m.active
$$;

-- Orgs where the user holds a portfolio or admin role on an org or region scope:
-- the only people who may see who works in the other hotels.
CREATE OR REPLACE FUNCTION sf_my_portfolio_org_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT m.org_id), '{}'::uuid[])
  FROM memberships m
  WHERE m.user_id = auth.uid() AND m.active
    AND m.scope_type IN ('org','region') AND m.role IN ('owner','vp','ceo','admin')
$$;

-- True for a request signed by a person (never for the service role or a database session).
CREATE OR REPLACE FUNCTION sf_is_person() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION sf_my_property_ids(), sf_my_roles(uuid), sf_is_member(uuid), sf_can(uuid, text[]), sf_my_org_ids(), sf_my_portfolio_org_ids(), sf_is_person()
  TO authenticated, service_role;

-- ─── tenant integrity: a row's parents belong to the row's property ─────────
--
-- RLS checks property_id; this trigger checks that outlet_id, station_id, room_id,
-- forecast_id… point at rows of the same property, so a person who knows another
-- hotel's UUID cannot write into that hotel through a parent column.

CREATE OR REPLACE FUNCTION sf_check_parent_property() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j        jsonb := to_jsonb(NEW);
  pair     text[];
  v_id     uuid;
  v_parent uuid;
BEGIN
  IF NEW.property_id IS NULL THEN RETURN NEW; END IF;
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
      ['outlet_id','outlets'], ['station_id','stations'], ['wave_id','waves'], ['forecast_id','forecasts'],
      ['decision_id','decisions'], ['room_id','rooms'], ['asset_id','assets'], ['service_line_id','service_lines'],
      ['team_member_id','team_members'], ['prepped_by','team_members'], ['done_by','team_members'],
      ['inspected_by','team_members'], ['assigned_to','team_members']]
  LOOP
    IF (j ->> pair[1]) IS NOT NULL THEN
      v_id := (j ->> pair[1])::uuid;
      EXECUTE format('SELECT property_id FROM %I WHERE id = $1', pair[2]) INTO v_parent USING v_id;
      IF v_parent IS DISTINCT FROM NEW.property_id THEN
        RAISE EXCEPTION '%.% refers to a row of another property', TG_TABLE_NAME, pair[1]
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'property_id'
      AND EXISTS (SELECT 1 FROM information_schema.columns p
                  WHERE p.table_schema = 'public' AND p.table_name = c.table_name
                    AND p.column_name IN ('outlet_id','station_id','wave_id','forecast_id','decision_id','room_id','asset_id',
                                          'service_line_id','team_member_id','prepped_by','done_by','inspected_by','assigned_to'))
      AND c.table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
  LOOP
    EXECUTE format('CREATE TRIGGER trg_parent_property BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sf_check_parent_property()', t);
  END LOOP;
END $$;

-- A membership written by a person is one property, one operational role, inside that
-- property's organisation. Portfolio and admin roles, and org or region scopes, are
-- granted by the service role only (an owner's console, a support script).
CREATE OR REPLACE FUNCTION sf_check_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  IF NOT sf_is_person() THEN RETURN NEW; END IF;
  IF NEW.scope_type <> 'property' OR NEW.property_id IS NULL OR NEW.region_id IS NOT NULL THEN
    RAISE EXCEPTION 'a person may only grant property memberships' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.role IN ('admin','owner','vp','ceo') THEN
    RAISE EXCEPTION 'portfolio and admin roles are not granted from the app' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT org_id INTO v_org FROM properties WHERE id = NEW.property_id;
  IF v_org IS NULL OR v_org <> NEW.org_id THEN
    RAISE EXCEPTION 'membership.org_id must be the property''s organisation' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.scope_type <> 'property' OR OLD.role IN ('admin','owner','vp','ceo')) THEN
    RAISE EXCEPTION 'this membership is managed outside the app' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_memberships_check BEFORE INSERT OR UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION sf_check_membership();

-- A hotel stays in its organisation and region unless the service role moves it.
CREATE OR REPLACE FUNCTION sf_check_property_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF sf_is_person() AND (NEW.org_id <> OLD.org_id OR NEW.region_id IS DISTINCT FROM OLD.region_id) THEN
    RAISE EXCEPTION 'a hotel''s organisation and region are set by the service role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_properties_parent BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION sf_check_property_parent();

-- ─── audit trigger ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sf_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_property uuid;
  v_action   text;
BEGIN
  v_property := COALESCE(NEW.property_id, OLD.property_id);
  -- rows removed by a cascade (property or org deleted) leave no audit trail
  IF v_property IS NULL OR NOT EXISTS (SELECT 1 FROM properties WHERE id = v_property) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_action := TG_TABLE_NAME || ':' || lower(TG_OP);
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) ? 'status' AND (to_jsonb(NEW) ->> 'status') IS DISTINCT FROM (to_jsonb(OLD) ->> 'status') THEN
    v_action := TG_TABLE_NAME || ':' || (to_jsonb(NEW) ->> 'status');
  END IF;
  INSERT INTO audit_log (property_id, user_id, action, table_name, row_id, before, after)
  VALUES (v_property, auth.uid(), v_action, TG_TABLE_NAME,
          COALESCE(NEW.id, OLD.id),
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_decisions     AFTER INSERT OR UPDATE OR DELETE ON decisions      FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_station_plans AFTER UPDATE ON station_plans                       FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_forecasts     AFTER UPDATE OF status ON forecasts                 FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_waste_logs    AFTER INSERT OR UPDATE OR DELETE ON waste_logs     FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_roster_sugg   AFTER UPDATE ON roster_suggestions                  FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_room_tasks    AFTER UPDATE OF status ON room_tasks                FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_work_orders   AFTER INSERT OR UPDATE OF status ON work_orders     FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_planned_works AFTER UPDATE OF status ON planned_works             FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_live_events   AFTER UPDATE OF status ON live_events               FOR EACH ROW EXECUTE FUNCTION sf_audit();
CREATE TRIGGER trg_audit_memberships   AFTER INSERT OR UPDATE OR DELETE ON memberships    FOR EACH ROW EXECUTE FUNCTION sf_audit();

-- ─── enable RLS everywhere ──────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orgs','regions','properties','users','memberships','team_members','outlets','waves','stations','rooms','assets',
    'pms_daily','weather_daily','events_daily','bookings_daily','banquet_events','pos_pace','pos_variances',
    'forecasts','station_plans','decisions','live_events','waste_logs','service_actuals','outcomes','plan_corrections','prediction_log',
    'service_lines','roster_shifts','staffing_demand','roster_suggestions',
    'room_tasks','work_orders','asset_readings','planned_works','energy_readings','voice_logs',
    'nightly_reports','property_financials','notifications','push_subscriptions','imports','job_runs','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── policies: tenancy ──────────────────────────────────────────────────────

CREATE POLICY orgs_select ON orgs FOR SELECT TO authenticated USING (id = ANY (sf_my_org_ids()));
CREATE POLICY regions_select ON regions FOR SELECT TO authenticated USING (org_id = ANY (sf_my_org_ids()));

CREATE POLICY properties_select ON properties FOR SELECT TO authenticated USING (id = ANY (sf_my_property_ids()));
CREATE POLICY properties_update ON properties FOR UPDATE TO authenticated
  USING (sf_can(id, 'gm')) WITH CHECK (sf_can(id, 'gm'));

-- People: yourself; the people of a hotel you manage; everyone in an organisation you hold
-- a portfolio role in. A cook sees no one else's email.
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.active
      AND ((m.property_id IS NOT NULL AND sf_can(m.property_id, 'gm','owner','vp','ceo'))
           OR m.org_id = ANY (sf_my_portfolio_org_ids()))));
CREATE POLICY users_update_self ON users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY memberships_select ON memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR (property_id IS NOT NULL AND sf_can(property_id, 'gm','owner','vp','ceo'))
         OR org_id = ANY (sf_my_portfolio_org_ids()));
-- The GM of a hotel grants operational roles in that hotel (trg_memberships_check enforces
-- the scope, the organisation and the role list).
CREATE POLICY memberships_write ON memberships FOR ALL TO authenticated
  USING (scope_type = 'property' AND property_id IS NOT NULL AND sf_can(property_id, 'gm')
         AND role NOT IN ('admin','owner','vp','ceo'))
  WITH CHECK (scope_type = 'property' AND property_id IS NOT NULL AND sf_can(property_id, 'gm')
         AND role NOT IN ('admin','owner','vp','ceo')
         AND region_id IS NULL
         AND org_id = (SELECT p.org_id FROM properties p WHERE p.id = property_id));

-- ─── policies: configuration ────────────────────────────────────────────────

CREATE POLICY team_members_select ON team_members FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY team_members_write ON team_members FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng'));

CREATE POLICY outlets_select ON outlets FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY outlets_write ON outlets FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY waves_select ON waves FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY waves_write ON waves FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY stations_select ON stations FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY stations_write ON stations FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY rooms_select ON rooms FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY rooms_write ON rooms FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','hk')) WITH CHECK (sf_can(property_id, 'gm','hk'));

CREATE POLICY assets_select ON assets FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY assets_write ON assets FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','eng')) WITH CHECK (sf_can(property_id, 'gm','eng'));

CREATE POLICY service_lines_select ON service_lines FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY service_lines_write ON service_lines FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng'));

-- ─── policies: signals ──────────────────────────────────────────────────────

CREATE POLICY pms_daily_select ON pms_daily FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY pms_daily_write ON pms_daily FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY weather_daily_select ON weather_daily FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY weather_daily_write ON weather_daily FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY events_daily_select ON events_daily FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY events_daily_write ON events_daily FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng'));

CREATE POLICY bookings_daily_select ON bookings_daily FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY bookings_daily_write ON bookings_daily FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY banquet_events_select ON banquet_events FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY banquet_events_write ON banquet_events FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY pos_pace_select ON pos_pace FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY pos_pace_insert ON pos_pace FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef'));

CREATE POLICY pos_variances_select ON pos_variances FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY pos_variances_write ON pos_variances FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr'));

-- ─── policies: plans and decisions (approve, never auto) ────────────────────

CREATE POLICY forecasts_select ON forecasts FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY forecasts_update ON forecasts FOR UPDATE TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));
CREATE POLICY forecasts_insert ON forecasts FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY station_plans_select ON station_plans FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY station_plans_update ON station_plans FOR UPDATE TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef','prep_cook'))
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef','prep_cook'));
CREATE POLICY station_plans_insert ON station_plans FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef'));

CREATE POLICY decisions_select ON decisions FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY decisions_update ON decisions FOR UPDATE TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef','hk','eng'))
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef','hk','eng'));
CREATE POLICY decisions_insert ON decisions FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef','hk','eng'));

CREATE POLICY live_events_select ON live_events FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY live_events_write ON live_events FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef'))
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef'));

CREATE POLICY waste_logs_select ON waste_logs FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY waste_logs_insert ON waste_logs FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef','prep_cook'));
-- A log can be corrected by the kitchen's managers, or by its author within a day; the row
-- stays in a hotel the author may log in (the parent trigger keeps outlet and station there too).
CREATE POLICY waste_logs_update ON waste_logs FOR UPDATE TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef') OR (logged_by = auth.uid() AND logged_at > now() - interval '24 hours'))
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef')
              OR (logged_by = auth.uid() AND sf_can(property_id, 'sous_chef','prep_cook')));
CREATE POLICY waste_logs_delete ON waste_logs FOR DELETE TO authenticated
  USING (sf_can(property_id, 'gm','chef') OR (logged_by = auth.uid() AND logged_at > now() - interval '24 hours'));

CREATE POLICY service_actuals_select ON service_actuals FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY service_actuals_write ON service_actuals FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef'));

CREATE POLICY outcomes_select ON outcomes FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY prediction_log_select ON prediction_log FOR SELECT TO authenticated USING (sf_can(property_id, 'gm','fnb_mgr','chef','auditor','owner','vp','ceo'));

CREATE POLICY plan_corrections_select ON plan_corrections FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY plan_corrections_write ON plan_corrections FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef'));

-- ─── policies: staffing ─────────────────────────────────────────────────────

CREATE POLICY roster_shifts_select ON roster_shifts FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY roster_shifts_write ON roster_shifts FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng'));

CREATE POLICY staffing_demand_select ON staffing_demand FOR SELECT TO authenticated USING (sf_is_member(property_id));

CREATE POLICY roster_suggestions_select ON roster_suggestions FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY roster_suggestions_update ON roster_suggestions FOR UPDATE TO authenticated
  USING (sf_can(property_id, 'gm','fnb_mgr','chef','hk')) WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','hk'));

-- ─── policies: rooms, engineering, energy, logs ─────────────────────────────

CREATE POLICY room_tasks_select ON room_tasks FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY room_tasks_write ON room_tasks FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','hk')) WITH CHECK (sf_can(property_id, 'gm','hk'));

CREATE POLICY work_orders_select ON work_orders FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY work_orders_insert ON work_orders FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','eng','hk','fnb_mgr','chef','sous_chef'));
CREATE POLICY work_orders_update ON work_orders FOR UPDATE TO authenticated
  USING (sf_can(property_id, 'gm','eng')) WITH CHECK (sf_can(property_id, 'gm','eng'));

CREATE POLICY asset_readings_select ON asset_readings FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY asset_readings_insert ON asset_readings FOR INSERT TO authenticated WITH CHECK (sf_can(property_id, 'gm','eng'));

CREATE POLICY planned_works_select ON planned_works FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY planned_works_write ON planned_works FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','eng')) WITH CHECK (sf_can(property_id, 'gm','eng'));

CREATE POLICY energy_readings_select ON energy_readings FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY energy_readings_write ON energy_readings FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm','eng')) WITH CHECK (sf_can(property_id, 'gm','eng'));

CREATE POLICY voice_logs_select ON voice_logs FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY voice_logs_insert ON voice_logs FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','sous_chef','prep_cook','hk','eng') AND logged_by = auth.uid());

-- ─── policies: reports, portfolio, notifications, imports, jobs, audit ──────

CREATE POLICY nightly_reports_select ON nightly_reports FOR SELECT TO authenticated USING (sf_is_member(property_id));

CREATE POLICY property_financials_select ON property_financials FOR SELECT TO authenticated
  USING (sf_can(property_id, 'gm','owner','vp','ceo','auditor'));
CREATE POLICY property_financials_write ON property_financials FOR ALL TO authenticated
  USING (sf_can(property_id, 'gm')) WITH CHECK (sf_can(property_id, 'gm'));

CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_all ON push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY imports_select ON imports FOR SELECT TO authenticated USING (sf_is_member(property_id));
CREATE POLICY imports_insert ON imports FOR INSERT TO authenticated
  WITH CHECK (sf_can(property_id, 'gm','fnb_mgr','chef','hk','eng'));

CREATE POLICY job_runs_select ON job_runs FOR SELECT TO authenticated USING (property_id IS NULL OR sf_is_member(property_id));

CREATE POLICY audit_log_select ON audit_log FOR SELECT TO authenticated USING (sf_can(property_id, 'gm','auditor','owner'));

-- ─── grants (hosted Supabase already grants these; harmless to repeat) ──────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
