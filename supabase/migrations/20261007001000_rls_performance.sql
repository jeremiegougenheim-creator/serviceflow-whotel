-- ============================================================================
-- ServiceFlow — schema v2 · 9 · performance of row level security, one context call
--
-- Why: the policies called sf_is_member(property_id) and sf_can(property_id, …)
-- once per row. Both are SECURITY DEFINER functions, so Postgres cannot inline
-- them, and a scan of 2,000 roster shifts paid 2,000 membership lookups
-- (585 ms for the staffing view; 3 ms once the lookup runs once per query).
--
-- What changes:
--   1. sf_props_can(roles) returns, once per query, the properties where the
--      signed-in person holds one of the roles (admin always counts).
--   2. Every policy is rewritten as `column IN (SELECT unnest(fn()))`: the
--      sub-select is uncorrelated, so Postgres evaluates it once per statement and hashes it. Same rights,
--      same rows, same tables — only the plan changes.
--   3. v_staffing_day carries property_id into its roster aggregate so the
--      property filter reaches the shifts.
--   4. sf_context() returns the signed-in person's profile, memberships,
--      properties, outlets and unread count in one call (the app made five).
--   5. sf_portfolio_ops: a service whose plan was never confirmed in the app
--      no longer counts as "100 % off the plan"; it counts as no data.
--
-- Safe to run on a live project: ALTER POLICY is transactional and holds no
-- long lock. Run as the database owner (SQL editor).
-- ============================================================================

-- 1 ─── properties where the person holds one of the roles ──────────────────
CREATE OR REPLACE FUNCTION sf_props_can(p_roles text[]) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT p.id), '{}'::uuid[])
  FROM properties p
  JOIN memberships m
    ON m.user_id = auth.uid() AND m.active
   AND m.role = ANY (p_roles || '{admin}'::text[])
   AND (   (m.scope_type = 'property' AND m.property_id = p.id)
        OR (m.scope_type = 'region'   AND m.region_id   = p.region_id)
        OR (m.scope_type = 'org'      AND m.org_id      = p.org_id))
$$;
GRANT EXECUTE ON FUNCTION sf_props_can(text[]) TO authenticated, service_role;

-- 2 ─── the same policies, evaluated once per query ──────────────────────────
ALTER POLICY orgs_select ON orgs
  USING (id IN (SELECT unnest(sf_my_org_ids())));
ALTER POLICY regions_select ON regions
  USING (org_id IN (SELECT unnest(sf_my_org_ids())));
ALTER POLICY properties_select ON properties
  USING (id IN (SELECT unnest(sf_my_property_ids())));
ALTER POLICY properties_update ON properties
  USING ((id IN (SELECT unnest(sf_props_can(ARRAY['gm'])))))
  WITH CHECK ((id IN (SELECT unnest(sf_props_can(ARRAY['gm'])))));
ALTER POLICY users_select ON users
  USING (id = auth.uid() OR EXISTS ( SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.active AND ((m.property_id IS NOT NULL AND (m.property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','owner','vp','ceo']))))) OR m.org_id IN (SELECT unnest(sf_my_portfolio_org_ids())))));
ALTER POLICY users_update_self ON users
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
ALTER POLICY memberships_select ON memberships
  USING (user_id = auth.uid() OR (property_id IS NOT NULL AND (property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','owner','vp','ceo']))))) OR org_id IN (SELECT unnest(sf_my_portfolio_org_ids())));
ALTER POLICY memberships_write ON memberships
  USING (scope_type = 'property' AND property_id IS NOT NULL AND (property_id IN (SELECT unnest(sf_props_can(ARRAY['gm'])))) AND role NOT IN ('admin','owner','vp','ceo'))
  WITH CHECK (scope_type = 'property' AND property_id IS NOT NULL AND (property_id IN (SELECT unnest(sf_props_can(ARRAY['gm'])))) AND role NOT IN ('admin','owner','vp','ceo') AND region_id IS NULL AND org_id = (SELECT p.org_id FROM properties p WHERE p.id = property_id));
ALTER POLICY team_members_select ON team_members
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY team_members_write ON team_members
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))));
ALTER POLICY outlets_select ON outlets
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY outlets_write ON outlets
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY waves_select ON waves
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY waves_write ON waves
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY stations_select ON stations
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY stations_write ON stations
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY rooms_select ON rooms
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY rooms_write ON rooms
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','hk'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','hk'])))));
ALTER POLICY assets_select ON assets
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY assets_write ON assets
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))));
ALTER POLICY service_lines_select ON service_lines
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY service_lines_write ON service_lines
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))));
ALTER POLICY pms_daily_select ON pms_daily
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY pms_daily_write ON pms_daily
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY weather_daily_select ON weather_daily
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY weather_daily_write ON weather_daily
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY events_daily_select ON events_daily
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY events_daily_write ON events_daily
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))));
ALTER POLICY bookings_daily_select ON bookings_daily
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY bookings_daily_write ON bookings_daily
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY banquet_events_select ON banquet_events
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY banquet_events_write ON banquet_events
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY pos_pace_select ON pos_pace
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY pos_pace_insert ON pos_pace
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef'])))));
ALTER POLICY pos_variances_select ON pos_variances
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY pos_variances_write ON pos_variances
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr'])))));
ALTER POLICY forecasts_select ON forecasts
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY forecasts_update ON forecasts
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY forecasts_insert ON forecasts
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY station_plans_select ON station_plans
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY station_plans_update ON station_plans
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef','prep_cook'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef','prep_cook'])))));
ALTER POLICY station_plans_insert ON station_plans
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))));
ALTER POLICY decisions_select ON decisions
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY decisions_update ON decisions
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef','hk','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef','hk','eng'])))));
ALTER POLICY decisions_insert ON decisions
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef','hk','eng'])))));
ALTER POLICY live_events_select ON live_events
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY live_events_write ON live_events
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef'])))));
ALTER POLICY waste_logs_select ON waste_logs
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY waste_logs_insert ON waste_logs
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef','prep_cook'])))));
ALTER POLICY waste_logs_update ON waste_logs
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))) OR (logged_by = auth.uid() AND logged_at > now() - interval '24 hours'))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef'])))) OR (logged_by = auth.uid() AND (property_id IN (SELECT unnest(sf_props_can(ARRAY['sous_chef','prep_cook']))))));
ALTER POLICY waste_logs_delete ON waste_logs
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','chef'])))) OR (logged_by = auth.uid() AND logged_at > now() - interval '24 hours'));
ALTER POLICY service_actuals_select ON service_actuals
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY service_actuals_write ON service_actuals
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef'])))));
ALTER POLICY outcomes_select ON outcomes
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY prediction_log_select ON prediction_log
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','auditor','owner','vp','ceo'])))));
ALTER POLICY plan_corrections_select ON plan_corrections
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY plan_corrections_write ON plan_corrections
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef'])))));
ALTER POLICY roster_shifts_select ON roster_shifts
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY roster_shifts_write ON roster_shifts
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))));
ALTER POLICY staffing_demand_select ON staffing_demand
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY roster_suggestions_select ON roster_suggestions
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY roster_suggestions_update ON roster_suggestions
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk'])))));
ALTER POLICY room_tasks_select ON room_tasks
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY room_tasks_write ON room_tasks
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','hk'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','hk'])))));
ALTER POLICY work_orders_select ON work_orders
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY work_orders_insert ON work_orders
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng','hk','fnb_mgr','chef','sous_chef'])))));
ALTER POLICY work_orders_update ON work_orders
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))));
ALTER POLICY asset_readings_select ON asset_readings
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY asset_readings_insert ON asset_readings
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))));
ALTER POLICY planned_works_select ON planned_works
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY planned_works_write ON planned_works
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))));
ALTER POLICY energy_readings_select ON energy_readings
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY energy_readings_write ON energy_readings
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','eng'])))));
ALTER POLICY voice_logs_select ON voice_logs
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY voice_logs_insert ON voice_logs
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','sous_chef','prep_cook','hk','eng'])))) AND logged_by = auth.uid());
ALTER POLICY nightly_reports_select ON nightly_reports
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY property_financials_select ON property_financials
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','owner','vp','ceo','auditor'])))));
ALTER POLICY property_financials_write ON property_financials
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm'])))))
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm'])))));
ALTER POLICY notifications_select ON notifications
  USING (user_id = auth.uid());
ALTER POLICY notifications_update ON notifications
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
ALTER POLICY push_subscriptions_all ON push_subscriptions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
ALTER POLICY imports_select ON imports
  USING ((property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY imports_insert ON imports
  WITH CHECK ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','fnb_mgr','chef','hk','eng'])))));
ALTER POLICY job_runs_select ON job_runs
  USING (property_id IS NULL OR (property_id IN (SELECT unnest(sf_my_property_ids()))));
ALTER POLICY audit_log_select ON audit_log
  USING ((property_id IN (SELECT unnest(sf_props_can(ARRAY['gm','auditor','owner'])))));

-- 3 ─── staffing view: the property filter reaches the shifts ───────────────
CREATE OR REPLACE VIEW v_staffing_day WITH (security_invoker = true) AS
SELECT sl.property_id,
       sl.id            AS service_line_id,
       sl.name          AS service_line,
       sl.department,
       sl.outlet_id,
       d.service_date,
       d.demand_hours,
       COALESCE(p.planned_hours, 0) AS planned_hours,
       COALESCE(p.planned_hours, 0) - d.demand_hours AS delta_hours,
       d.basis
FROM staffing_demand d
JOIN service_lines sl ON sl.id = d.service_line_id
LEFT JOIN (
  SELECT property_id, service_line_id, service_date, sum(hours) AS planned_hours
  FROM roster_shifts WHERE status <> 'cancelled'
  GROUP BY property_id, service_line_id, service_date
) p ON p.property_id = sl.property_id AND p.service_line_id = d.service_line_id AND p.service_date = d.service_date;
GRANT SELECT ON v_staffing_day TO authenticated, service_role;

-- 4 ─── one call for the session context ────────────────────────────────────
-- SECURITY INVOKER: every sub-select runs under the caller's own policies.
CREATE OR REPLACE FUNCTION sf_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'user',        (SELECT jsonb_build_object('id', u.id, 'email', u.email, 'full_name', u.full_name, 'locale', u.locale)
                    FROM users u WHERE u.id = auth.uid()),
    'memberships', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', m.id, 'role', m.role, 'scope_type', m.scope_type,
                      'org_id', m.org_id, 'region_id', m.region_id, 'property_id', m.property_id)), '[]'::jsonb)
                    FROM memberships m WHERE m.user_id = auth.uid() AND m.active),
    'properties',  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', p.id, 'name', p.name, 'slug', p.slug, 'keys', p.keys, 'timezone', p.timezone,
                      'currency', p.currency, 'region_id', p.region_id, 'settings', p.settings) ORDER BY p.name), '[]'::jsonb)
                    FROM properties p WHERE p.active),
    'outlets',     (SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.property_id, o.sort_order), '[]'::jsonb)
                    FROM outlets o WHERE o.active),
    'unread',      (SELECT count(*) FROM notifications n WHERE n.user_id = auth.uid() AND n.read_at IS NULL))
$$;
GRANT EXECUTE ON FUNCTION sf_context() TO authenticated;

-- 5 ─── portfolio: an unconfirmed plan is "no data", not "100 % off" ────────
CREATE OR REPLACE FUNCTION sf_portfolio_ops(p_date date DEFAULT CURRENT_DATE + 1)
RETURNS TABLE (
  property_id uuid, property text, region_id uuid, region text, keys int,
  covers_tomorrow int, hours_short numeric, short_lines text,
  mape_4w_pct numeric, off_plan_pct numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH fc AS (
    SELECT property_id, sum(covers_p50)::int AS covers
    FROM v_latest_forecasts WHERE service_date = p_date GROUP BY property_id
  ), st AS (
    -- kitchen lines only: the tile is labelled "kitchen hours short"
    SELECT property_id,
           sum(GREATEST(0, -delta_hours)) FILTER (WHERE department = 'kitchen') AS hours_short,
           string_agg(service_line || ' −' || round(-delta_hours)::text || ' h', ' · ' ORDER BY (department = 'kitchen') DESC, delta_hours)
             FILTER (WHERE delta_hours < -0.5) AS short_lines
    FROM v_staffing_day WHERE service_date = p_date GROUP BY property_id
  ), acc AS (
    -- mape_4w_pct = mean absolute forecast error over the last four weeks of closed services;
    -- off_plan_pct = share of station lines not prepped to a plan the kitchen confirmed.
    -- A service whose plan was never confirmed in the app (plan_followed_pct = 0) is left out:
    -- it says nothing about the plan, only that the kitchen did not use the app that day.
    SELECT property_id, round(avg(mape) * 100, 1) AS mape_4w_pct,
           round(100 - avg(plan_followed_pct) FILTER (WHERE plan_followed_pct > 0), 1) AS off_plan_pct
    FROM outcomes WHERE service_date >= p_date - 28 AND service_date < p_date AND mape IS NOT NULL
    GROUP BY property_id
  )
  SELECT p.id, p.name, p.region_id, r.name, p.keys,
         COALESCE(fc.covers, 0), COALESCE(st.hours_short, 0), st.short_lines,
         acc.mape_4w_pct, acc.off_plan_pct
  FROM properties p
  LEFT JOIN regions r ON r.id = p.region_id
  LEFT JOIN fc  ON fc.property_id = p.id
  LEFT JOIN st  ON st.property_id = p.id
  LEFT JOIN acc ON acc.property_id = p.id
  WHERE p.active
  ORDER BY r.sort_order, p.name
$$;
GRANT EXECUTE ON FUNCTION sf_portfolio_ops(date) TO authenticated, service_role;
