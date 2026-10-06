-- ============================================================================
-- ServiceFlow — schema v2 · 8/8 · function hardening
--
-- Two things Postgres gets wrong by default for an exposed REST schema:
--   * a function with no search_path resolves its body against the caller's path;
--   * every function is EXECUTE-able by PUBLIC, which publishes it at
--     /rest/v1/rpc/<name>.
-- Pin the first, take back the second, then grant only what the app calls.
-- ============================================================================

ALTER FUNCTION public.sf_touch_updated_at()                SET search_path = public;
ALTER FUNCTION public.sf_waste_logs_co2e()                 SET search_path = public;
ALTER FUNCTION public.sf_co2e_factor(uuid, uuid)           SET search_path = public;
ALTER FUNCTION public.sf_is_person()                       SET search_path = public;
ALTER FUNCTION public.sf_waste_by_station(uuid, date, int) SET search_path = public;
ALTER FUNCTION public.sf_portfolio_quarter(date)           SET search_path = public;
ALTER FUNCTION public.sf_portfolio_ops(date)               SET search_path = public;

REVOKE EXECUTE ON FUNCTION
  public.sf_touch_updated_at(), public.sf_waste_logs_co2e(), public.sf_audit(),
  public.sf_check_membership(), public.sf_check_parent_property(), public.sf_check_property_parent(),
  public.sf_handle_new_auth_user(), public.sf_co2e_factor(uuid, uuid), public.sf_is_person(),
  public.sf_my_property_ids(), public.sf_my_roles(uuid), public.sf_is_member(uuid),
  public.sf_can(uuid, text[]), public.sf_my_org_ids(), public.sf_my_portfolio_org_ids(),
  public.sf_waste_by_station(uuid, date, int), public.sf_portfolio_quarter(date), public.sf_portfolio_ops(date)
FROM PUBLIC, anon;

-- Trigger functions run as triggers; nothing calls them from the app.
REVOKE EXECUTE ON FUNCTION
  public.sf_touch_updated_at(), public.sf_waste_logs_co2e(), public.sf_audit(),
  public.sf_check_membership(), public.sf_check_parent_property(), public.sf_check_property_parent(),
  public.sf_handle_new_auth_user()
FROM authenticated;

-- What a signed-in person may call. The helpers stay SECURITY DEFINER on purpose:
-- they read memberships past RLS, and each one answers only about its own caller.
GRANT EXECUTE ON FUNCTION
  public.sf_my_property_ids(), public.sf_my_roles(uuid), public.sf_is_member(uuid),
  public.sf_can(uuid, text[]), public.sf_my_org_ids(), public.sf_my_portfolio_org_ids(),
  public.sf_is_person(), public.sf_co2e_factor(uuid, uuid),
  public.sf_waste_by_station(uuid, date, int), public.sf_portfolio_quarter(date), public.sf_portfolio_ops(date)
TO authenticated, service_role;
