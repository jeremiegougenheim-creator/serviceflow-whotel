-- ============================================================================
-- ServiceFlow — schema v2 · 7/7 · auth hook, views and roll-up functions
-- Views and functions run as the caller (security invoker): RLS applies.
-- ============================================================================

-- Mirror new sign-ups into public.users and attach pending invitations.
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sf_handle_new_auth_user();

-- ─── latest forecast per outlet and day ─────────────────────────────────────

CREATE OR REPLACE VIEW v_latest_forecasts WITH (security_invoker = true) AS
SELECT DISTINCT ON (outlet_id, service_date) *
FROM forecasts
ORDER BY outlet_id, service_date, version DESC;

-- ─── staffing: planned hours against demand, per service line and day ──────

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
  SELECT service_line_id, service_date, sum(hours) AS planned_hours
  FROM roster_shifts WHERE status <> 'cancelled'
  GROUP BY service_line_id, service_date
) p ON p.service_line_id = d.service_line_id AND p.service_date = d.service_date;

-- ─── waste by station against a trailing average ───────────────────────────

CREATE OR REPLACE FUNCTION sf_waste_by_station(p_outlet uuid, p_date date, p_weeks int DEFAULT 4)
RETURNS TABLE (station_id uuid, station text, kg numeric, avg_kg numeric, delta_pct numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH today AS (
    SELECT w.station_id, sum(w.kg) AS kg FROM waste_logs w
    WHERE w.outlet_id = p_outlet AND w.service_date = p_date GROUP BY w.station_id
  ), hist AS (
    SELECT w.station_id, sum(w.kg) / GREATEST(count(DISTINCT w.service_date), 1) AS avg_kg
    FROM waste_logs w
    WHERE w.outlet_id = p_outlet AND w.service_date < p_date AND w.service_date >= p_date - (p_weeks * 7)
    GROUP BY w.station_id
  )
  SELECT s.id, s.name, COALESCE(t.kg, 0), COALESCE(h.avg_kg, 0),
         CASE WHEN COALESCE(h.avg_kg, 0) > 0 THEN round((COALESCE(t.kg, 0) - h.avg_kg) / h.avg_kg * 100, 1) END
  FROM stations s
  LEFT JOIN today t ON t.station_id = s.id
  LEFT JOIN hist h ON h.station_id = s.id
  WHERE s.outlet_id = p_outlet AND s.active
  ORDER BY COALESCE(t.kg, 0) DESC, s.sort_order
$$;

-- ─── portfolio: the quarter, per property ───────────────────────────────────
-- GOP margin = GOP / revenue; NOI yield = annualised NOI / asset value.
-- Figures converted to the organisation's reporting currency with fx_to_org.

CREATE OR REPLACE FUNCTION sf_portfolio_quarter(p_quarter_start date DEFAULT date_trunc('quarter', CURRENT_DATE)::date)
RETURNS TABLE (
  property_id uuid, property text, region_id uuid, region text, keys int, currency char(3),
  revenue numeric, gop numeric, noi numeric, asset_value numeric,
  gop_margin numeric, noi_yield numeric, gop_margin_ly numeric,
  energy_vs_baseline_pct numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH q AS (
    SELECT f.property_id,
           sum(f.revenue * f.fx_to_org) AS revenue,
           sum(f.gop * f.fx_to_org)     AS gop,
           sum(f.noi * f.fx_to_org)     AS noi,
           max(f.asset_value * f.fx_to_org) AS asset_value,
           count(*) AS months
    FROM property_financials f
    WHERE f.period >= p_quarter_start AND f.period < p_quarter_start + interval '3 months'
    GROUP BY f.property_id
  ), ly AS (
    SELECT f.property_id, sum(f.gop) / NULLIF(sum(f.revenue), 0) AS gop_margin_ly
    FROM property_financials f
    WHERE f.period >= p_quarter_start - interval '1 year' AND f.period < p_quarter_start - interval '1 year' + interval '3 months'
    GROUP BY f.property_id
  ), en AS (
    SELECT e.property_id, sum(e.kwh) AS kwh, count(DISTINCT e.service_date) AS days
    FROM energy_readings e
    WHERE e.service_date >= p_quarter_start AND e.service_date < p_quarter_start + interval '3 months'
    GROUP BY e.property_id
  )
  SELECT p.id, p.name, p.region_id, r.name, p.keys, o.currency,
         q.revenue, q.gop, q.noi, q.asset_value,
         CASE WHEN q.revenue > 0 THEN round(q.gop / q.revenue, 4) END,
         CASE WHEN q.asset_value > 0 AND q.months > 0 THEN round((q.noi * 12 / q.months) / q.asset_value, 4) END,
         round(ly.gop_margin_ly, 4),
         -- kWh per key and night against the property's baseline
         CASE WHEN en.days > 0 AND (p.settings ->> 'energy_baseline_kwh_room') IS NOT NULL
              THEN round((en.kwh / (en.days * p.keys) / (p.settings ->> 'energy_baseline_kwh_room')::numeric - 1) * 100, 1) END
  FROM properties p
  JOIN orgs o ON o.id = p.org_id
  LEFT JOIN regions r ON r.id = p.region_id
  LEFT JOIN q  ON q.property_id = p.id
  LEFT JOIN ly ON ly.property_id = p.id
  LEFT JOIN en ON en.property_id = p.id
  WHERE p.active
  ORDER BY r.sort_order, p.name
$$;

-- ─── portfolio: tomorrow, per property (operations lens) ────────────────────

CREATE OR REPLACE FUNCTION sf_portfolio_ops(p_date date DEFAULT CURRENT_DATE + 1)
RETURNS TABLE (
  property_id uuid, property text, region_id uuid, region text, keys int,
  covers_tomorrow int, hours_short numeric, short_lines text,
  mape_4w_pct numeric, off_plan_pct numeric
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH fc AS (
    SELECT property_id, sum(covers_p50)::int AS covers
    FROM v_latest_forecasts WHERE service_date = p_date GROUP BY property_id
  ), st AS (
    SELECT property_id,
           sum(GREATEST(0, -delta_hours)) AS hours_short,
           string_agg(service_line, ', ') FILTER (WHERE delta_hours < -0.5) AS short_lines
    FROM v_staffing_day WHERE service_date = p_date GROUP BY property_id
  ), acc AS (
    -- mape_4w_pct = mean absolute forecast error over the last four weeks of closed services;
    -- off_plan_pct = share of station lines not prepped to the approved plan
    SELECT property_id, round(avg(mape) * 100, 1) AS mape_4w_pct,
           round(100 - avg(plan_followed_pct), 1) AS off_plan_pct
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

GRANT SELECT ON v_latest_forecasts, v_staffing_day TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sf_waste_by_station(uuid, date, int), sf_portfolio_quarter(date), sf_portfolio_ops(date)
  TO authenticated, service_role;
