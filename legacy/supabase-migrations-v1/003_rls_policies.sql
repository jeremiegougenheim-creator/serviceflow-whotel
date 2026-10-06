-- ============================================================
-- Lauds — RLS Policies & Helper Functions
-- Migration: 003_rls_policies.sql
-- ============================================================

-- ─── Helper: get property IDs for the current user ───────────────────────────

CREATE OR REPLACE FUNCTION get_user_property_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT property_id
    FROM memberships
    WHERE user_id = auth.uid()
      AND active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_property_ids() IS
  'Returns array of property_ids the current user is an active member of.';

-- ─── Helper: check if user has role on a property ────────────────────────────

CREATE OR REPLACE FUNCTION user_has_role_on_property(
  p_property_id UUID,
  VARIADIC p_roles TEXT[]
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships
    WHERE user_id = auth.uid()
      AND property_id = p_property_id
      AND role = ANY(p_roles)
      AND active = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION user_has_role_on_property(UUID, TEXT[]) IS
  'Returns true if the current user has any of the specified roles on the given property.';

-- ─── orgs ─────────────────────────────────────────────────────────────────────

CREATE POLICY "orgs: users see orgs they belong to"
  ON orgs FOR SELECT
  USING (
    id IN (
      SELECT p.org_id
      FROM properties p
      WHERE p.id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "orgs: only admins can insert"
  ON orgs FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    -- In practice org creation goes through service role / edge function
    -- This blocks direct client inserts; loosen if needed
    AND FALSE
  );

CREATE POLICY "orgs: no direct update or delete from client"
  ON orgs FOR UPDATE
  USING (FALSE);

CREATE POLICY "orgs: no direct delete from client"
  ON orgs FOR DELETE
  USING (FALSE);

-- ─── properties ──────────────────────────────────────────────────────────────

CREATE POLICY "properties: users see their properties"
  ON properties FOR SELECT
  USING (id = ANY(get_user_property_ids()));

CREATE POLICY "properties: admins can update their properties"
  ON properties FOR UPDATE
  USING (
    user_has_role_on_property(id, 'admin', 'gm')
  )
  WITH CHECK (
    user_has_role_on_property(id, 'admin', 'gm')
  );

CREATE POLICY "properties: no direct insert from client"
  ON properties FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "properties: no direct delete from client"
  ON properties FOR DELETE
  USING (FALSE);

-- ─── outlets ──────────────────────────────────────────────────────────────────

CREATE POLICY "outlets: users see outlets for their properties"
  ON outlets FOR SELECT
  USING (property_id = ANY(get_user_property_ids()));

CREATE POLICY "outlets: admins and gms can insert outlets"
  ON outlets FOR INSERT
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin', 'gm')
  );

CREATE POLICY "outlets: admins and gms can update outlets"
  ON outlets FOR UPDATE
  USING (
    user_has_role_on_property(property_id, 'admin', 'gm')
  )
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin', 'gm')
  );

CREATE POLICY "outlets: no direct delete from client"
  ON outlets FOR DELETE
  USING (FALSE);

-- ─── stations ─────────────────────────────────────────────────────────────────

CREATE POLICY "stations: users see stations for their outlets"
  ON stations FOR SELECT
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "stations: admins and gms can insert stations"
  ON stations FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm')
          AND active = TRUE
      )
    )
  );

CREATE POLICY "stations: admins and gms can update stations"
  ON stations FOR UPDATE
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm')
          AND active = TRUE
      )
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm')
          AND active = TRUE
      )
    )
  );

CREATE POLICY "stations: no direct delete from client"
  ON stations FOR DELETE
  USING (FALSE);

-- ─── users ────────────────────────────────────────────────────────────────────

CREATE POLICY "users: users can see their own record"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users: users can see colleagues at shared properties"
  ON users FOR SELECT
  USING (
    id IN (
      SELECT m.user_id
      FROM memberships m
      WHERE m.property_id = ANY(get_user_property_ids())
        AND m.active = TRUE
    )
  );

CREATE POLICY "users: users can update their own record"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users: no direct insert from client (handled by trigger)"
  ON users FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "users: no direct delete from client"
  ON users FOR DELETE
  USING (FALSE);

-- ─── memberships ──────────────────────────────────────────────────────────────

CREATE POLICY "memberships: users can see memberships for their properties"
  ON memberships FOR SELECT
  USING (
    property_id = ANY(get_user_property_ids())
    OR user_id = auth.uid()
  );

CREATE POLICY "memberships: admins can insert memberships for their properties"
  ON memberships FOR INSERT
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin')
  );

CREATE POLICY "memberships: admins can update memberships"
  ON memberships FOR UPDATE
  USING (
    user_has_role_on_property(property_id, 'admin')
  )
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin')
  );

CREATE POLICY "memberships: admins can deactivate memberships"
  ON memberships FOR DELETE
  USING (
    user_has_role_on_property(property_id, 'admin')
  );

-- ─── pms_daily ────────────────────────────────────────────────────────────────

CREATE POLICY "pms_daily: users can read for their properties"
  ON pms_daily FOR SELECT
  USING (property_id = ANY(get_user_property_ids()));

CREATE POLICY "pms_daily: chefs and above can insert"
  ON pms_daily FOR INSERT
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr', 'chef')
  );

CREATE POLICY "pms_daily: chefs and above can update"
  ON pms_daily FOR UPDATE
  USING (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr', 'chef')
  )
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr', 'chef')
  );

-- ─── weather_daily ────────────────────────────────────────────────────────────

CREATE POLICY "weather_daily: users can read for their properties"
  ON weather_daily FOR SELECT
  USING (property_id = ANY(get_user_property_ids()));

CREATE POLICY "weather_daily: service role inserts via edge function"
  ON weather_daily FOR INSERT
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr', 'chef')
  );

-- ─── events_daily ─────────────────────────────────────────────────────────────

CREATE POLICY "events_daily: users can read for their properties"
  ON events_daily FOR SELECT
  USING (property_id = ANY(get_user_property_ids()));

CREATE POLICY "events_daily: gm and fnb_mgr can insert events"
  ON events_daily FOR INSERT
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr')
  );

CREATE POLICY "events_daily: gm and fnb_mgr can update events"
  ON events_daily FOR UPDATE
  USING (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr')
  )
  WITH CHECK (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr')
  );

CREATE POLICY "events_daily: gm and fnb_mgr can delete events"
  ON events_daily FOR DELETE
  USING (
    user_has_role_on_property(property_id, 'admin', 'gm', 'fnb_mgr')
  );

-- ─── waste_measured ───────────────────────────────────────────────────────────

CREATE POLICY "waste_measured: users can read for their outlets"
  ON waste_measured FOR SELECT
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "waste_measured: kitchen staff can insert"
  ON waste_measured FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef', 'sous_chef')
          AND active = TRUE
      )
    )
  );

CREATE POLICY "waste_measured: kitchen staff can update"
  ON waste_measured FOR UPDATE
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef', 'sous_chef')
          AND active = TRUE
      )
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef', 'sous_chef')
          AND active = TRUE
      )
    )
  );

-- ─── forecasts ────────────────────────────────────────────────────────────────

CREATE POLICY "forecasts: users can read for their outlets"
  ON forecasts FOR SELECT
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(get_user_property_ids())
    )
  );

-- Forecasts are written by edge functions (service role) or GMs/chefs
CREATE POLICY "forecasts: chefs and above can insert"
  ON forecasts FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

CREATE POLICY "forecasts: chefs and above can update"
  ON forecasts FOR UPDATE
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

-- ─── station_pars ─────────────────────────────────────────────────────────────

CREATE POLICY "station_pars: users can read for their outlets"
  ON station_pars FOR SELECT
  USING (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "station_pars: chefs and above can insert"
  ON station_pars FOR INSERT
  WITH CHECK (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

-- ─── actions ──────────────────────────────────────────────────────────────────

CREATE POLICY "actions: users can read for their forecasts"
  ON actions FOR SELECT
  USING (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "actions: chefs and above can insert"
  ON actions FOR INSERT
  WITH CHECK (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

-- ─── prep_status ──────────────────────────────────────────────────────────────

CREATE POLICY "prep_status: users can read for their forecasts"
  ON prep_status FOR SELECT
  USING (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "prep_status: kitchen staff can insert"
  ON prep_status FOR INSERT
  WITH CHECK (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef', 'sous_chef')
          AND active = TRUE
      )
    )
  );

CREATE POLICY "prep_status: kitchen staff can update"
  ON prep_status FOR UPDATE
  USING (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef', 'sous_chef')
          AND active = TRUE
      )
    )
  )
  WITH CHECK (
    forecast_id IN (
      SELECT f.id FROM forecasts f
      JOIN outlets o ON o.id = f.outlet_id
      WHERE o.property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef', 'sous_chef')
          AND active = TRUE
      )
    )
  );

-- ─── outcomes ─────────────────────────────────────────────────────────────────

CREATE POLICY "outcomes: users can read for their outlets"
  ON outcomes FOR SELECT
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "outcomes: chefs and above can insert"
  ON outcomes FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

CREATE POLICY "outcomes: chefs and above can update"
  ON outcomes FOR UPDATE
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

-- ─── esg_log ──────────────────────────────────────────────────────────────────

CREATE POLICY "esg_log: all property members can read"
  ON esg_log FOR SELECT
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(get_user_property_ids())
    )
  );

CREATE POLICY "esg_log: fnb_mgr and above can insert"
  ON esg_log FOR INSERT
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

CREATE POLICY "esg_log: fnb_mgr and above can update"
  ON esg_log FOR UPDATE
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(
        SELECT property_id FROM memberships
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'gm', 'fnb_mgr', 'chef')
          AND active = TRUE
      )
    )
  );

-- ─── prediction_log ───────────────────────────────────────────────────────────

CREATE POLICY "prediction_log: users can read for their outlets"
  ON prediction_log FOR SELECT
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE property_id = ANY(get_user_property_ids())
    )
  );

-- prediction_log is written exclusively by edge functions via service role
-- No client-side INSERT policy needed; service role bypasses RLS by default

-- ─── Service role note ────────────────────────────────────────────────────────
-- Supabase service role (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS by default.
-- Edge functions (ai-proxy, forecast-engine) should use the service role client
-- to write forecasts, station_pars, prediction_log, weather_daily, and esg_log
-- without being constrained by the policies above.
