-- ============================================================================
-- ServiceFlow — illustrative seed
-- A fictional group of seven hotels. No real hotel, brand, outlet or person.
-- Dates are relative to today in Asia/Hong_Kong so the demo is always "today" for the hotels.
-- Run after the migrations; safe to re-run (it wipes the illustrative org).
-- Forecasts, plans, decisions and reports are produced by the engine
-- (scripts/seed.ts calls it after this file), not inserted here.
-- ============================================================================

SELECT setseed(0.4242);

DO $$
DECLARE
  v_org        uuid;
  v_reg_hk     uuid;
  v_reg_tpe    uuid;
  v_harbour    uuid;
  v_townhouse  uuid;
  v_prop       uuid;
  v_bf         uuid;   -- Harbour breakfast outlet
  v_rest       uuid;
  v_bar        uuid;
  v_banq       uuid;
  v_lounge     uuid;
  v_outlet     uuid;
  v_wave_open  uuid; v_wave_2 uuid; v_wave_3 uuid;
  v_line_bf    uuid; v_line_kit uuid; v_line_stw uuid; v_line_hk uuid; v_line_bar uuid; v_line_rest uuid;
  v_station    uuid;
  d            date;
  dow          int;
  occ          numeric;
  rooms_occ    int;
  i            int;
  f            int;
  r            record;
  t_today      date := (now() AT TIME ZONE 'Asia/Hong_Kong')::date;   -- the hotels' local date
  t_monday     date := date_trunc('week', (now() AT TIME ZONE 'Asia/Hong_Kong')::date)::date;   -- this week's Monday
  base_kwh     numeric;
  v_room       uuid;
  n_done       int;
  v_tm         uuid;
  tm_ids       uuid[];
  stw_ids      uuid[];
  svc_ids      uuid[];
  hk_ids       uuid[];
  planned      numeric;
BEGIN
  -- wipe a previous illustrative seed
  DELETE FROM orgs WHERE slug = 'illustrative-group';

  INSERT INTO orgs (name, slug, currency) VALUES ('Illustrative Group', 'illustrative-group', 'USD') RETURNING id INTO v_org;
  INSERT INTO regions (org_id, name, slug, sort_order) VALUES (v_org, 'Hong Kong & Macau', 'hk-macau', 1) RETURNING id INTO v_reg_hk;
  INSERT INTO regions (org_id, name, slug, sort_order) VALUES (v_org, 'Taipei', 'taipei', 2) RETURNING id INTO v_reg_tpe;

  -- ── properties ────────────────────────────────────────────────────────────
  INSERT INTO properties (org_id, region_id, name, slug, keys, timezone, currency, country_code, city, settings)
  VALUES (v_org, v_reg_hk, 'Harbour Hotel', 'harbour-hotel', 196, 'Asia/Hong_Kong', 'USD', 'HK', 'Hong Kong',
          jsonb_build_object(
            'food_cost_per_cover', 6.9, 'waste_baseline_g_cover', 110, 'co2e_default_factor', 2.5,
            'winnow', false, 'saving_points_total', 4, 'saving_points_serviceflow', 3,
            'energy_baseline_kwh_room', 56, 'brief_time', '18:00', 'dawn_update_time', '03:30', 'debrief_time', '12:30',
            'illustrative', true))
  RETURNING id INTO v_harbour;

  INSERT INTO properties (org_id, region_id, name, slug, keys, timezone, currency, country_code, city, settings)
  VALUES (v_org, v_reg_hk, 'Townhouse', 'townhouse', 88, 'Asia/Hong_Kong', 'USD', 'HK', 'Hong Kong',
          jsonb_build_object('food_cost_per_cover', 6.2, 'waste_baseline_g_cover', 105, 'energy_baseline_kwh_room', 48, 'illustrative', true))
  RETURNING id INTO v_townhouse;

  INSERT INTO properties (org_id, region_id, name, slug, keys, timezone, currency, country_code, city, settings) VALUES
    (v_org, v_reg_hk,  'Hong Kong Central', 'hong-kong-central', 260, 'Asia/Hong_Kong', 'USD', 'HK', 'Hong Kong', '{"food_cost_per_cover":6.5,"waste_baseline_g_cover":112,"energy_baseline_kwh_room":58,"illustrative":true}'),
    (v_org, v_reg_hk,  'Macau',             'macau',             520, 'Asia/Macau',     'USD', 'MO', 'Macau',     '{"food_cost_per_cover":6.0,"waste_baseline_g_cover":120,"energy_baseline_kwh_room":62,"illustrative":true}'),
    (v_org, v_reg_hk,  'Kowloon',           'kowloon',           310, 'Asia/Hong_Kong', 'USD', 'HK', 'Hong Kong', '{"food_cost_per_cover":5.8,"waste_baseline_g_cover":108,"energy_baseline_kwh_room":55,"illustrative":true}'),
    (v_org, v_reg_tpe, 'Taipei Riverside',  'taipei-riverside',  230, 'Asia/Taipei',    'USD', 'TW', 'Taipei',    '{"food_cost_per_cover":5.5,"waste_baseline_g_cover":100,"energy_baseline_kwh_room":50,"illustrative":true}'),
    (v_org, v_reg_tpe, 'Taipei Downtown',   'taipei-downtown',   210, 'Asia/Taipei',    'USD', 'TW', 'Taipei',    '{"food_cost_per_cover":5.4,"waste_baseline_g_cover":98,"energy_baseline_kwh_room":49,"illustrative":true}');

  -- ── invitations (demo accounts; users are created by scripts/seed.ts) ─────
  INSERT INTO memberships (invited_email, scope_type, org_id, property_id, role) VALUES
    ('gm@demo.serviceflow',   'property', v_org, v_harbour, 'gm'),
    ('chef@demo.serviceflow', 'property', v_org, v_harbour, 'chef'),
    ('hk@demo.serviceflow',   'property', v_org, v_harbour, 'hk'),
    ('eng@demo.serviceflow',  'property', v_org, v_harbour, 'eng'),
    ('owner@demo.serviceflow','property', v_org, v_harbour, 'owner'),
    ('owner@demo.serviceflow','property', v_org, v_townhouse, 'owner');
  INSERT INTO memberships (invited_email, scope_type, org_id, region_id, role) VALUES
    ('vp@demo.serviceflow', 'region', v_org, v_reg_hk, 'vp');
  INSERT INTO memberships (invited_email, scope_type, org_id, role) VALUES
    ('ceo@demo.serviceflow', 'org', v_org, 'ceo'),
    ('admin@demo.serviceflow', 'org', v_org, 'admin');

  -- ── Harbour Hotel: outlets, waves, stations ───────────────────────────────
  INSERT INTO outlets (property_id, name, slug, outlet_type, meal_period, opens_at, closes_at, capacity_pax, sort_order, settings)
  VALUES (v_harbour, 'Breakfast', 'breakfast', 'breakfast', 'breakfast', '06:30', '10:30', 180, 1,
          jsonb_build_object('attach_by_rate_code', jsonb_build_object('breakfast_inclusive', 0.92, 'half_board', 0.88, 'package', 0.75, 'default', 0.60, 'room_only', 0.27, 'redemption', 0.50),
                             'lounge_divert_tiers', jsonb_build_array('ambassador','titanium'),
                             'usual_covers', 190,
                             'hours_per_cover', jsonb_build_object('service', 0.29, 'kitchen', 0.255, 'stewarding', 0.165)))
  RETURNING id INTO v_bf;
  INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES
    (v_harbour, v_bf, 'Open',  '06:30', 0.30, 1) RETURNING id INTO v_wave_open;
  INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES
    (v_harbour, v_bf, '08:00', '08:00', 0.42, 2) RETURNING id INTO v_wave_2;
  INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES
    (v_harbour, v_bf, '09:30', '09:30', 0.28, 3) RETURNING id INTO v_wave_3;

  INSERT INTO stations (property_id, outlet_id, name, slug, station_kind, food_category, unit, base_par, usual_covers, cost_per_unit, kg_per_unit, nationality_priors, dow_profile, weather_profile, sort_order) VALUES
    (v_harbour, v_bf, 'Congee & noodles', 'congee_noodles', 'buffet', 'rice_noodles', 'portions', 62, 190, 1.10, 0.30,
      '{"greater_china":{"mult":1.55,"conf":0.92},"western":{"mult":0.65,"conf":0.88},"korea":{"mult":1.15,"conf":0.7}}', '{"weekend":1.02}', '{"rain":1.05}', 1),
    (v_harbour, v_bf, 'Dim sum', 'dim_sum', 'buffet', 'meat', 'portions', 41, 190, 1.40, 0.12,
      '{"greater_china":{"mult":1.50,"conf":0.95},"western":{"mult":0.70,"conf":0.85}}', '{"weekend":1.08}', '{}', 2),
    (v_harbour, v_bf, 'Western hot', 'western_hot', 'buffet', 'meat', 'portions', 71, 190, 1.60, 0.22,
      '{"western":{"mult":1.65,"conf":0.93},"greater_china":{"mult":0.75,"conf":0.85},"japan":{"mult":0.75,"conf":0.8}}', '{"weekend":1.10}', '{"rain":1.04}', 3),
    (v_harbour, v_bf, 'Eggs to order', 'eggs', 'buffet', 'dairy', 'portions', 85, 190, 0.70, 0.12, '{"western":{"mult":1.25,"conf":0.8}}', '{"weekend":1.12}', '{}', 4),
    (v_harbour, v_bf, 'Bakery', 'bakery', 'buffet', 'bread_pastry', 'portions', 110, 190, 0.45, 0.08,
      '{"western":{"mult":1.45,"conf":0.9},"greater_china":{"mult":0.85,"conf":0.78}}', '{"weekend":1.05}', '{}', 5),
    (v_harbour, v_bf, 'Fruit & cold', 'fruit_cold', 'buffet', 'fruit', 'portions', 120, 190, 0.55, 0.15,
      '{"japan":{"mult":1.25,"conf":0.82},"western":{"mult":1.15,"conf":0.82}}', '{"weekend":1.0}', '{"hot":1.12}', 6),
    (v_harbour, v_bf, 'Japanese', 'japanese', 'buffet', 'seafood', 'portions', 44, 190, 1.80, 0.18,
      '{"japan":{"mult":1.85,"conf":0.94}}', '{"weekend":0.98}', '{}', 7),
    (v_harbour, v_bf, 'Coffee & juice', 'coffee_juice', 'buffet', 'beverage', 'L', 95, 190, 0.60, 1.0,
      '{"western":{"mult":1.40,"conf":0.95},"greater_china":{"mult":0.90,"conf":0.8},"korea":{"mult":1.2,"conf":0.78}}', '{"weekend":1.0}', '{"hot":1.08}', 8);

  -- Restaurant: à la carte dinner, prep pars on high-value dishes
  INSERT INTO outlets (property_id, name, slug, outlet_type, meal_period, opens_at, closes_at, capacity_pax, sort_order, settings)
  VALUES (v_harbour, 'Restaurant', 'restaurant', 'restaurant', 'dinner', '18:00', '22:30', 90, 2,
          jsonb_build_object('usual_covers', 80, 'walk_in_share', 0.12, 'hours_per_cover', jsonb_build_object('service', 0.5, 'kitchen', 0.45)))
  RETURNING id INTO v_rest;
  INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES
    (v_harbour, v_rest, '18:00', '18:00', 0.40, 1), (v_harbour, v_rest, '20:00', '20:00', 0.60, 2);
  INSERT INTO stations (property_id, outlet_id, name, slug, station_kind, food_category, unit, base_par, usual_covers, cost_per_unit, kg_per_unit, high_value, dow_profile, weather_profile, sort_order) VALUES
    (v_harbour, v_rest, 'Lobster linguine', 'lobster_linguine', 'dish', 'seafood', 'portions', 18, 80, 14.0, 0.35, true, '{"weekday":0.85,"weekend":1.1}', '{}', 1),
    (v_harbour, v_rest, 'Whole sea bream',  'sea_bream',        'dish', 'seafood', 'portions', 11, 80, 11.0, 0.60, true, '{}', '{}', 2),
    (v_harbour, v_rest, 'Scallop crudo',    'scallop_crudo',    'dish', 'seafood', 'portions', 13, 80, 9.5,  0.12, true, '{}', '{}', 3),
    (v_harbour, v_rest, 'Sea bass',         'sea_bass',         'dish', 'seafood', 'portions', 12, 80, 9.0,  0.30, true, '{}', '{"rain":0.75}', 4),
    (v_harbour, v_rest, 'Beef short rib',   'short_rib',        'dish', 'meat',    'portions', 16, 80, 8.5,  0.40, true, '{}', '{}', 5);

  -- Bar: batches, perishables
  INSERT INTO outlets (property_id, name, slug, outlet_type, meal_period, opens_at, closes_at, capacity_pax, sort_order, settings)
  VALUES (v_harbour, 'Bar', 'bar', 'bar', 'dinner', '17:00', '01:00', 70, 3,
          jsonb_build_object('usual_covers', 58, 'hours_per_cover', jsonb_build_object('bar', 0.3)))
  RETURNING id INTO v_bar;
  INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES
    (v_harbour, v_bar, '18:00', '18:00', 0.55, 1), (v_harbour, v_bar, '21:00', '21:00', 0.45, 2);
  INSERT INTO stations (property_id, outlet_id, name, slug, station_kind, food_category, unit, base_par, usual_covers, cost_per_unit, kg_per_unit, sort_order, settings) VALUES
    (v_harbour, v_bar, 'Yuzu sour batch',  'yuzu_sour',   'batch', 'beverage', 'L', 4, 58, 9.0, 1.0, 1, '{"perishable":true}'),
    (v_harbour, v_bar, 'Fresh juices',     'juices',      'batch', 'fruit',    'L', 6, 58, 4.0, 1.0, 2, '{"perishable":true}'),
    (v_harbour, v_bar, 'Garnish and herbs','garnish',     'batch', 'vegetables','trays', 3, 58, 6.0, 0.4, 3, '{"perishable":true}'),
    (v_harbour, v_bar, 'Bar snacks',       'bar_snacks',  'batch', 'default',  'portions', 30, 58, 1.2, 0.08, 4, '{}');

  -- Banquets: cook to the final count
  INSERT INTO outlets (property_id, name, slug, outlet_type, meal_period, opens_at, closes_at, capacity_pax, sort_order, settings)
  VALUES (v_harbour, 'Banquets', 'banquets', 'banquet', 'event', '17:30', '23:00', 220, 4, '{"buffer_pct":0.03}')
  RETURNING id INTO v_banq;
  INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES (v_harbour, v_banq, 'Service', '19:00', 1.0, 1);
  INSERT INTO stations (property_id, outlet_id, name, slug, station_kind, food_category, unit, base_par, cost_per_unit, kg_per_unit, sort_order) VALUES
    (v_harbour, v_banq, 'Crab and pomelo starter', 'starter', 'course', 'seafood', 'plates', 0, 7.5, 0.18, 1),
    (v_harbour, v_banq, 'Beef or sea bass',        'main',    'course', 'meat',    'plates', 0, 12.0, 0.32, 2),
    (v_harbour, v_banq, 'Yuzu tart',               'dessert', 'course', 'dairy',   'plates', 0, 3.2, 0.12, 3);

  -- Lobby lounge (fifth outlet, light)
  INSERT INTO outlets (property_id, name, slug, outlet_type, meal_period, opens_at, closes_at, capacity_pax, sort_order, settings)
  VALUES (v_harbour, 'Lobby lounge', 'lounge', 'other', 'all_day', '10:00', '22:00', 48, 5, '{"usual_covers":70}') RETURNING id INTO v_lounge;
  INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES (v_harbour, v_lounge, 'Afternoon', '14:00', 1.0, 1);
  INSERT INTO stations (property_id, outlet_id, name, slug, station_kind, food_category, unit, base_par, usual_covers, cost_per_unit, kg_per_unit, sort_order) VALUES
    (v_harbour, v_lounge, 'Afternoon tea sets', 'tea_sets', 'batch', 'bread_pastry', 'sets', 40, 70, 6.0, 0.35, 1),
    (v_harbour, v_lounge, 'Scones', 'scones', 'batch', 'bread_pastry', 'portions', 90, 70, 0.5, 0.06, 2);

  -- ── Harbour Hotel: service lines (staffing) ───────────────────────────────
  INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
  VALUES (v_harbour, v_bf, 'Breakfast service', 'service', 'morning', '06:00', '11:00', 0.27, 8, 1) RETURNING id INTO v_line_bf;
  INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
  VALUES (v_harbour, v_bf, 'Kitchen, early shift', 'kitchen', 'early', '05:00', '11:30', 0.235, 9, 2) RETURNING id INTO v_line_kit;
  INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
  VALUES (v_harbour, v_bf, 'Stewarding', 'stewarding', 'morning', '06:00', '12:00', 0.17, 6, 3) RETURNING id INTO v_line_stw;
  INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
  VALUES (v_harbour, v_rest, 'Dinner service', 'service', 'late', '17:00', '23:00', 0.36, 6, 4) RETURNING id INTO v_line_rest;
  INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
  VALUES (v_harbour, v_bar, 'Bar', 'bar', 'late', '16:00', '01:00', 0.36, 9, 5) RETURNING id INTO v_line_bar;
  INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, minutes_per_room, fixed_hours, sort_order)
  VALUES (v_harbour, NULL, 'Housekeeping, morning', 'housekeeping', 'morning', '08:00', '16:30', 30, 16, 6) RETURNING id INTO v_line_hk;

  -- ── Harbour Hotel: team ───────────────────────────────────────────────────
  INSERT INTO team_members (property_id, name, department, role, pool) VALUES
    (v_harbour, 'Head chef',        'kitchen', 'chef', false),
    (v_harbour, 'Sous chef, breakfast', 'kitchen', 'sous chef', false),
    (v_harbour, 'Cook A', 'kitchen', 'cook', false), (v_harbour, 'Cook B', 'kitchen', 'cook', false),
    (v_harbour, 'Cook C', 'kitchen', 'cook', false), (v_harbour, 'Cook D', 'kitchen', 'cook', false),
    (v_harbour, 'Cook E', 'kitchen', 'cook', false), (v_harbour, 'Cook F', 'kitchen', 'cook', false),
    (v_harbour, 'Cook, pool 1', 'kitchen', 'cook', true), (v_harbour, 'Cook, pool 2', 'kitchen', 'cook', true),
    (v_harbour, 'Steward A', 'stewarding', 'steward', false), (v_harbour, 'Steward B', 'stewarding', 'steward', false),
    (v_harbour, 'Steward C', 'stewarding', 'steward', false), (v_harbour, 'Steward D', 'stewarding', 'steward', false),
    (v_harbour, 'Steward, pool', 'stewarding', 'steward', true),
    (v_harbour, 'Breakfast supervisor', 'service', 'supervisor', false),
    (v_harbour, 'Server A', 'service', 'server', false), (v_harbour, 'Server B', 'service', 'server', false),
    (v_harbour, 'Server C', 'service', 'server', false), (v_harbour, 'Server D', 'service', 'server', false),
    (v_harbour, 'Server E', 'service', 'server', false), (v_harbour, 'Server F', 'service', 'server', false),
    (v_harbour, 'Server G', 'service', 'server', false), (v_harbour, 'Server H', 'service', 'server', false),
    (v_harbour, 'Server I', 'service', 'server', false),
    (v_harbour, 'Executive housekeeper', 'housekeeping', 'executive housekeeper', false),
    (v_harbour, 'Floor supervisor 1', 'housekeeping', 'supervisor', false), (v_harbour, 'Floor supervisor 2', 'housekeeping', 'supervisor', false),
    (v_harbour, 'Chief engineer', 'engineering', 'chief engineer', false),
    (v_harbour, 'Technician A', 'engineering', 'technician', false), (v_harbour, 'Technician B', 'engineering', 'technician', false);
  FOR i IN 1..14 LOOP
    INSERT INTO team_members (property_id, name, department, role) VALUES (v_harbour, 'Room attendant ' || i, 'housekeeping', 'room attendant');
  END LOOP;
  SELECT array_agg(id ORDER BY name) INTO tm_ids FROM team_members WHERE property_id = v_harbour AND department = 'kitchen' AND NOT pool;
  SELECT array_agg(id ORDER BY name) INTO stw_ids FROM team_members WHERE property_id = v_harbour AND department = 'stewarding' AND NOT pool;
  SELECT array_agg(id ORDER BY name) INTO svc_ids FROM team_members WHERE property_id = v_harbour AND department = 'service';
  SELECT array_agg(id ORDER BY name) INTO hk_ids  FROM team_members WHERE property_id = v_harbour AND department = 'housekeeping' AND role = 'room attendant';

  -- ── Harbour Hotel: rooms ──────────────────────────────────────────────────
  FOR f IN 5..26 LOOP
    FOR i IN 1..(CASE WHEN f >= 24 THEN 6 ELSE 10 END) LOOP
      EXIT WHEN (SELECT count(*) FROM rooms WHERE property_id = v_harbour) >= 196;
      INSERT INTO rooms (property_id, number, floor, room_type, is_suite, target_minutes)
      VALUES (v_harbour, f::text || lpad(i::text, 2, '0'), f,
              CASE WHEN f >= 24 THEN (ARRAY['Corner suite','Harbour suite','Executive suite'])[1 + (i % 3)]
                   WHEN i % 4 = 0 THEN 'Twin' WHEN i % 3 = 0 THEN 'Harbour king' WHEN i % 5 = 0 THEN 'Corner king' ELSE 'Deluxe king' END,
              f >= 24, CASE WHEN f >= 24 THEN 34 ELSE 25 END);
    END LOOP;
  END LOOP;

  -- ── Harbour Hotel: assets, faults, planned works ──────────────────────────
  INSERT INTO assets (property_id, name, kind, location, guest_facing, status, status_note, sort_order) VALUES
    (v_harbour, 'Lift A', 'lift', 'floors 1–26', true, 'ok', NULL, 1),
    (v_harbour, 'Lift B', 'lift', 'floors 1–15', true, 'offline', 'door sensor · vendor 08:00', 2),
    (v_harbour, 'Rooftop AC 3', 'ahu', 'floors 24–26', true, 'watch', 'pressure down · two suites cool late', 3),
    (v_harbour, 'Chiller 1', 'chiller', 'plant room', false, 'ok', 'load 71% · running to plan', 4),
    (v_harbour, 'Chiller 2', 'chiller', 'plant room', false, 'ok', NULL, 5),
    (v_harbour, 'Boiler A', 'boiler', 'plant room', false, 'ok', NULL, 6),
    (v_harbour, 'Boiler B', 'boiler', 'plant room', false, 'ok', 'hot water 62 °C · in range', 7),
    (v_harbour, 'Kitchen extract fan', 'extract_fan', 'restaurant kitchen', false, 'watch', 'airflow low', 8),
    (v_harbour, 'Fire alarm panel', 'fire', 'back of house', false, 'ok', NULL, 9),
    (v_harbour, 'Pool pump', 'pump', 'level 6', false, 'ok', NULL, 10),
    (v_harbour, 'Laundry AHU', 'ahu', 'basement', false, 'ok', NULL, 11),
    (v_harbour, 'Generator', 'generator', 'basement', false, 'ok', NULL, 12);
  INSERT INTO asset_readings (property_id, asset_id, at, metric, value, unit)
    SELECT v_harbour, a.id, ((t_today::timestamp + make_interval(hours => h)) AT TIME ZONE 'Asia/Hong_Kong'), 'load_pct',
           round(40 + 38 * sin(((h - 3) / 24.0) * pi())::numeric, 1), '%'
    FROM assets a, generate_series(0, 23) h WHERE a.property_id = v_harbour AND a.name = 'Chiller 1';
  INSERT INTO asset_readings (property_id, asset_id, at, metric, value, unit)
    SELECT v_harbour, a.id, now(), 'temp_c', 62, '°C' FROM assets a WHERE a.property_id = v_harbour AND a.name = 'Boiler B';

  INSERT INTO work_orders (property_id, asset_id, room_id, title, detail, priority, guest_impact, status, opened_at, due_at, vendor) VALUES
    (v_harbour, (SELECT id FROM assets WHERE property_id = v_harbour AND name = 'Lift B'), NULL, 'Lift B door sensor', 'floors 1–15 · guest-facing · vendor 08:00', 'high', 'guest_facing', 'open', now() - interval '4 hours', ((t_today::timestamp + interval '1 day 8 hours') AT TIME ZONE 'Asia/Hong_Kong'), 'Lift vendor'),
    (v_harbour, (SELECT id FROM assets WHERE property_id = v_harbour AND name = 'Rooftop AC 3'), NULL, 'Rooftop AC pressure drop', 'two suites affected · in progress', 'high', 'suites', 'in_progress', now() - interval '6 hours', NULL, NULL),
    (v_harbour, NULL, (SELECT id FROM rooms WHERE property_id = v_harbour AND number = '1804'), '1804 · Door hinge stiff', 'guest in room · fix tonight', 'high', 'in_room', 'open', now() - interval '2 hours', ((t_today::timestamp + interval '23 hours') AT TIME ZONE 'Asia/Hong_Kong'), NULL),
    (v_harbour, (SELECT id FROM assets WHERE property_id = v_harbour AND name = 'Kitchen extract fan'), NULL, 'Kitchen extract fan', 'restaurant kitchen · airflow low', 'medium', 'outlet', 'planned', now() - interval '1 day', ((t_today::timestamp + interval '3 days') AT TIME ZONE 'Asia/Hong_Kong'), NULL),
    (v_harbour, NULL, (SELECT id FROM rooms WHERE property_id = v_harbour AND number = '1512'), '1512 · TV remote', 'replace', 'medium', 'in_room', 'open', now() - interval '5 hours', NULL, NULL),
    (v_harbour, NULL, (SELECT id FROM rooms WHERE property_id = v_harbour AND number = '2203'), '2203 · Shower drain slow', 'clear', 'medium', 'in_room', 'open', now() - interval '7 hours', NULL, NULL),
    (v_harbour, (SELECT id FROM assets WHERE property_id = v_harbour AND name = 'Pool pump'), NULL, 'Pool pump noise', 'bearing check', 'medium', 'back_of_house', 'open', now() - interval '1 day', NULL, NULL),
    (v_harbour, (SELECT id FROM assets WHERE property_id = v_harbour AND name = 'Fire alarm panel'), NULL, 'Fire alarm test', 'floors 20–26 · guests notified', 'low', 'guest_facing', 'planned', now() - interval '2 days', ((t_today::timestamp + interval '4 days 10 hours') AT TIME ZONE 'Asia/Hong_Kong'), NULL);
  FOR i IN 1..6 LOOP
    INSERT INTO work_orders (property_id, title, detail, priority, guest_impact, status, opened_at, closed_at)
    VALUES (v_harbour, (ARRAY['Lobby dimmer panel','Corridor light 19F','Minibar 1402','Ice machine 12F','Spa jet','Pantry tap'])[i], 'closed today', 'low', 'none', 'closed', now() - interval '20 hours' + (i || ' hours')::interval, now() - interval '10 hours' + (i || ' hours')::interval);
  END LOOP;

  INSERT INTO planned_works (property_id, asset_id, outlet_id, title, starts_at, duration_min, areas, notify_guests, checks, verdict, status) VALUES
    (v_harbour, (SELECT id FROM assets WHERE property_id = v_harbour AND name = 'Kitchen extract fan'), v_rest, 'Kitchen extract fan',
      ((t_monday + 2)::timestamp + interval '14 hours') AT TIME ZONE 'Asia/Hong_Kong', 120, 'restaurant kitchen', false,
      '{"kitchen":"Lunch ends at 14:00 and dinner prep starts at 16:30","arrivals":"no arrival affected","notices":"none"}', 'clear', 'proposed'),
    (v_harbour, (SELECT id FROM assets WHERE property_id = v_harbour AND name = 'Fire alarm panel'), NULL, 'Fire alarm test',
      ((t_monday + 3)::timestamp + interval '10 hours') AT TIME ZONE 'Asia/Hong_Kong', 45, 'floors 20–26', true,
      '{"kitchen":"not affected","arrivals":"3 VIP arrivals after 13:00","notices":"guest notice required on floors 20–26"}', 'notify', 'proposed');

  -- ── Harbour Hotel: energy, 35 days ────────────────────────────────────────
  FOR d IN SELECT generate_series(t_today - 34, t_today, '1 day')::date LOOP
    base_kwh := CASE WHEN d = t_today THEN 9600 ELSE 9100 + round(random() * 900) END;
    INSERT INTO energy_readings (property_id, service_date, category, kwh, note) VALUES
      (v_harbour, d, 'cooling', round(base_kwh * 0.427), 'chillers and AC · night setback on'),
      (v_harbour, d, 'kitchens', round(base_kwh * 0.208), 'extract and cooking'),
      (v_harbour, d, 'lifts_lighting', round(base_kwh * 0.188), 'common areas'),
      (v_harbour, d, 'other', round(base_kwh * 0.177), 'laundry, pools, back of house');
  END LOOP;

  -- ── Harbour Hotel: PMS history and tomorrow's signals ─────────────────────
  FOR d IN SELECT generate_series(t_today - 120, t_today + 7, '1 day')::date LOOP
    dow := EXTRACT(ISODOW FROM d);
    occ := CASE WHEN dow IN (5,6) THEN 0.86 + random() * 0.08
                WHEN dow = 7 THEN 0.80 + random() * 0.06
                ELSE 0.70 + random() * 0.10 END;
    IF d = t_today + 1 THEN occ := 0.91; END IF;   -- tomorrow: busy Saturday-type day
    IF d = t_today     THEN occ := 0.85; END IF;
    rooms_occ := round(196 * occ);
    INSERT INTO pms_daily (property_id, service_date, rooms_occupied, rooms_total, guests_in_house, arrivals, departures, departures_am,
                           late_arrivals_prev, early_checkins, lounge_eligible, vip_arrivals, suites_occupied,
                           rate_code_mix, loyalty_tier_mix, travel_source_mix, nationality_mix, los_distribution, group_manifest, source)
    VALUES (v_harbour, d, rooms_occ, 196, round(rooms_occ * 1.62), round(rooms_occ * 0.22), round(rooms_occ * 0.21), round(rooms_occ * 0.13),
            round(random() * 6), round(random() * 8), round(rooms_occ * 0.06), CASE WHEN d = t_today THEN 11 ELSE round(random() * 6) END,
            CASE WHEN d = t_today + 1 THEN 22 ELSE 12 + round(random() * 8) END,
            CASE WHEN d = t_today + 1
                 THEN '{"breakfast_inclusive":0.58,"room_only":0.22,"package":0.12,"default":0.08}'::jsonb
                 ELSE jsonb_build_object('breakfast_inclusive', round((0.48 + random() * 0.1)::numeric, 2), 'room_only', round((0.25 + random() * 0.08)::numeric, 2), 'package', 0.12, 'default', 0.10) END,
            '{"member":0.52,"gold":0.18,"platinum":0.09,"titanium":0.04,"none":0.17}',
            CASE WHEN d = t_today + 1 THEN '{"fit":0.52,"tour_group":0.26,"mice":0.12,"other":0.10}'::jsonb
                 ELSE jsonb_build_object('fit', 0.6, 'tour_group', round((0.1 + random() * 0.1)::numeric, 2), 'mice', 0.15, 'other', 0.1) END,
            CASE WHEN d = t_today + 1 THEN '{"greater_china":0.34,"western":0.36,"japan":0.12,"korea":0.08,"other":0.10}'::jsonb
                 ELSE jsonb_build_object('greater_china', round((0.35 + random() * 0.1)::numeric, 2), 'western', round((0.28 + random() * 0.08)::numeric, 2), 'japan', 0.12, 'korea', 0.07, 'other', 0.1) END,
            '{"day1":0.22,"day2_4":0.52,"day5plus":0.26}',
            CASE WHEN d = t_today + 1 THEN '[{"name":"Group of 38","size":38,"arrival":"19:00","breakfast":true,"source":"tour_group"}]'::jsonb
                 WHEN d = t_today - 7 THEN '[{"name":"Conference group","size":24,"arrival":"16:00","breakfast":true,"source":"mice"}]'::jsonb
                 ELSE '[]' END::jsonb,
            'csv');
    INSERT INTO weather_daily (property_id, service_date, temp_c, rain_prob, condition)
    VALUES (v_harbour, d, round(24 + random() * 6), CASE WHEN d = t_today + 3 THEN 0.8 WHEN random() < 0.25 THEN 0.6 ELSE 0.1 END,
            CASE WHEN d = t_today + 3 THEN 'rain' WHEN random() < 0.25 THEN 'rain' ELSE 'clear' END);
  END LOOP;
  INSERT INTO events_daily (property_id, outlet_id, service_date, label, kind, size, starts_at, lift) VALUES
    (v_harbour, v_bf, t_today + 1, 'Group of 38 arriving tonight, breakfast included', 'group', 38, '19:00', 1.0),
    (v_harbour, NULL, t_today + 5, 'Harbour fireworks', 'local_event', NULL, '20:00', 1.08),
    (v_harbour, v_banq, t_today + 1, 'Ballroom · Saturday dinner', 'group', 112, '19:00', 1.0);

  -- restaurant and bar bookings: today and the next days
  FOR d IN SELECT generate_series(t_today - 28, t_today + 7, '1 day')::date LOOP
    dow := EXTRACT(ISODOW FROM d);
    INSERT INTO bookings_daily (property_id, outlet_id, service_date, covers_booked, walk_in_expected, largest_party, largest_party_at, peak_at, peak_covers, parties)
    VALUES (v_harbour, v_rest, d,
            CASE WHEN d = t_today + 1 THEN 76 WHEN dow IN (5,6) THEN 70 + round(random() * 12) ELSE 48 + round(random() * 14) END,
            CASE WHEN d = t_today + 1 THEN 10 ELSE 8 END,
            CASE WHEN d = t_today + 1 THEN 12 ELSE 4 + round(random() * 4) END,
            '20:00', '20:00', CASE WHEN d = t_today + 1 THEN 12 ELSE 8 END,
            CASE WHEN d = t_today + 1 THEN '[{"size":12,"at":"20:00","note":"table of 12 at 20:00"}]'::jsonb ELSE '[]'::jsonb END);
    INSERT INTO bookings_daily (property_id, outlet_id, service_date, covers_booked, walk_in_expected, largest_party, largest_party_at, peak_at, peak_covers, parties)
    VALUES (v_harbour, v_bar, d,
            CASE WHEN d = t_today + 1 THEN 44 WHEN dow IN (5,6) THEN 36 + round(random() * 10) ELSE 22 + round(random() * 10) END,
            CASE WHEN d = t_today + 1 THEN 20 ELSE 14 END,
            CASE WHEN d = t_today + 1 THEN 38 ELSE 6 END, '19:00', '21:00', CASE WHEN d = t_today + 1 THEN 22 ELSE 14 END,
            CASE WHEN d = t_today + 1 THEN '[{"size":38,"at":"19:00","note":"group of 38 at 19:00"}]'::jsonb ELSE '[]'::jsonb END);
  END LOOP;
  INSERT INTO banquet_events (property_id, outlet_id, service_date, name, venue, booked_count, confirmed_count, diets, courses, serve_from, status)
  VALUES (v_harbour, v_banq, t_today + 1, 'Saturday dinner', 'Ballroom', 120, 112, '{"vegan":12}',
          '[{"name":"Crab and pomelo starter","note":"cold, from 17:30","station":"starter"},
            {"name":"Beef or sea bass","note":"by RSVP","station":"main","options":{"beef":68,"sea_bass":47}},
            {"name":"Yuzu tart","note":"103 tart · 12 vegan plate","station":"dessert","options":{"tart":103,"vegan_plate":12}}]',
          '17:30', 'confirmed');

  -- POS variance to reconcile (leakage)
  INSERT INTO pos_variances (property_id, outlet_id, service_date, kind, detail, amount, items, due_by, status)
  VALUES (v_harbour, v_rest, t_today, 'unposted', '3 courses unposted', 62, 3, '09:00', 'open');

  -- ── Harbour Hotel: breakfast actuals and waste history (90 days) ──────────
  FOR d IN SELECT generate_series(t_today - 90, t_today, '1 day')::date LOOP
    SELECT rooms_occupied INTO rooms_occ FROM pms_daily WHERE property_id = v_harbour AND service_date = d;
    dow := EXTRACT(ISODOW FROM d);
    i := round(rooms_occ * 1.62 * (0.66 + random() * 0.06));   -- actual covers
    IF d = t_today THEN i := 226; END IF;
    INSERT INTO service_actuals (property_id, outlet_id, service_date, actual_covers, source)
    VALUES (v_harbour, v_bf, d, i, 'pos');
    -- waste: improves over the last 6 weeks as the plan is followed
    FOR r IN SELECT id, name, kg_per_unit FROM stations WHERE outlet_id = v_bf LOOP
      INSERT INTO waste_logs (property_id, outlet_id, station_id, service_date, kg, reason, source, logged_at, seconds_to_log)
      VALUES (v_harbour, v_bf, r.id, d,
              round((CASE r.name WHEN 'Western hot' THEN 4.9 WHEN 'Bakery' THEN 4.8 WHEN 'Congee & noodles' THEN 2.6 WHEN 'Fruit & cold' THEN 3.1
                          WHEN 'Eggs to order' THEN 1.4 WHEN 'Dim sum' THEN 2.2 WHEN 'Japanese' THEN 1.9 ELSE 1.2 END
                     * (CASE WHEN d >= t_today - 42 THEN 0.78 ELSE 1.0 END)
                     * (0.8 + random() * 0.4)
                     * CASE WHEN d = t_today THEN (CASE r.name WHEN 'Western hot' THEN 0.64 WHEN 'Bakery' THEN 0.90 ELSE 0.85 END) ELSE 1 END)::numeric, 2),
              CASE WHEN random() < 0.7 THEN 'over-prep' ELSE 'plate waste' END,
              CASE WHEN d = t_today THEN 'voice' ELSE 'csv' END,
              (d::timestamp + interval '10 hours 25 minutes') AT TIME ZONE 'Asia/Hong_Kong', 12 + round(random() * 14));
    END LOOP;
    -- restaurant actuals and waste
    INSERT INTO service_actuals (property_id, outlet_id, service_date, actual_covers, source)
    VALUES (v_harbour, v_rest, d, CASE WHEN dow IN (5,6) THEN 78 + round(random() * 14) ELSE 52 + round(random() * 16) END, 'pos');
    FOR r IN SELECT id FROM stations WHERE outlet_id = v_rest LOOP
      INSERT INTO waste_logs (property_id, outlet_id, station_id, service_date, kg, reason, source, logged_at)
      VALUES (v_harbour, v_rest, r.id, d, round((0.3 + random() * 0.6)::numeric, 2), 'over-prep', 'csv', (d::timestamp + interval '23 hours') AT TIME ZONE 'Asia/Hong_Kong');
    END LOOP;
    INSERT INTO service_actuals (property_id, outlet_id, service_date, actual_covers, source)
    VALUES (v_harbour, v_bar, d, CASE WHEN dow IN (5,6) THEN 56 + round(random() * 14) ELSE 32 + round(random() * 14) END, 'pos');
    FOR r IN SELECT id FROM stations WHERE outlet_id = v_bar AND slug IN ('yuzu_sour','juices') LOOP
      INSERT INTO waste_logs (property_id, outlet_id, station_id, service_date, kg, reason, source, logged_at)
      VALUES (v_harbour, v_bar, r.id, d, round((0.05 + random() * 0.25)::numeric, 2), 'spoilage', 'csv', (d::timestamp + interval '23 hours 30 minutes') AT TIME ZONE 'Asia/Hong_Kong');
    END LOOP;
  END LOOP;

  -- today's live service, breakfast (service closed at 10:30, 226 covers)
  INSERT INTO pos_pace (property_id, outlet_id, service_date, at, covers_seated, source) VALUES
    (v_harbour, v_bf, t_today, (t_today::timestamp + interval '7 hours') AT TIME ZONE 'Asia/Hong_Kong', 58, 'pos'),
    (v_harbour, v_bf, t_today, (t_today::timestamp + interval '7 hours 30 minutes') AT TIME ZONE 'Asia/Hong_Kong', 142, 'pos'),
    (v_harbour, v_bf, t_today, (t_today::timestamp + interval '8 hours 12 minutes') AT TIME ZONE 'Asia/Hong_Kong', 171, 'pos'),
    (v_harbour, v_bf, t_today, (t_today::timestamp + interval '9 hours 30 minutes') AT TIME ZONE 'Asia/Hong_Kong', 214, 'pos'),
    (v_harbour, v_bf, t_today, (t_today::timestamp + interval '10 hours 30 minutes') AT TIME ZONE 'Asia/Hong_Kong', 226, 'pos');

  -- ── Harbour Hotel: roster, this week and next ─────────────────────────────
  FOR d IN SELECT generate_series(t_monday, t_monday + 13, '1 day')::date LOOP
    dow := EXTRACT(ISODOW FROM d);
    -- Breakfast service: 9 servers at 6.5h ≈ 58 h weekdays, 62 h weekends
    FOR i IN 1..(CASE WHEN dow IN (6,7) THEN 10 ELSE 9 END) LOOP
      INSERT INTO roster_shifts (property_id, service_line_id, team_member_id, service_date, starts_at, ends_at, hours, status)
      VALUES (v_harbour, v_line_bf, svc_ids[1 + ((i - 1) % array_length(svc_ids, 1))], d, '06:00', '12:12', 6.2, CASE WHEN d < t_monday + 7 THEN 'published' ELSE 'draft' END);
    END LOOP;
    -- Kitchen early shift: the gap on Saturday (48 h planned against 55 h demand) and Tuesday (over)
    FOR i IN 1..(CASE WHEN dow = 6 THEN 6 WHEN dow = 2 THEN 9 WHEN dow = 5 AND d >= t_monday + 7 THEN 8 ELSE 7 END) LOOP
      INSERT INTO roster_shifts (property_id, service_line_id, team_member_id, service_date, starts_at, ends_at, hours, status)
      VALUES (v_harbour, v_line_kit, tm_ids[1 + ((i - 1) % array_length(tm_ids, 1))], d, '05:00', '13:00', 8, CASE WHEN d < t_monday + 7 THEN 'published' ELSE 'draft' END);
    END LOOP;
    -- Stewarding: 5 stewards × 8 h = 40 h this week, 36 h next Friday
    FOR i IN 1..(CASE WHEN d >= t_monday + 7 AND dow = 5 THEN 4 WHEN d >= t_monday + 7 THEN 5 ELSE 5 END) LOOP
      INSERT INTO roster_shifts (property_id, service_line_id, team_member_id, service_date, starts_at, ends_at, hours, status)
      VALUES (v_harbour, v_line_stw, stw_ids[1 + ((i - 1) % array_length(stw_ids, 1))], d, '06:00', '14:00', 8, CASE WHEN d < t_monday + 7 THEN 'published' ELSE 'draft' END);
    END LOOP;
    -- Dinner service and bar
    FOR i IN 1..(CASE WHEN dow IN (5,6) THEN 7 ELSE 5 END) LOOP
      INSERT INTO roster_shifts (property_id, service_line_id, service_date, starts_at, ends_at, hours, status)
      VALUES (v_harbour, v_line_rest, d, '17:00', '23:00', 6, CASE WHEN d < t_monday + 7 THEN 'published' ELSE 'draft' END);
    END LOOP;
    FOR i IN 1..(CASE WHEN dow IN (5,6) THEN 4 ELSE 3 END) LOOP
      INSERT INTO roster_shifts (property_id, service_line_id, service_date, starts_at, ends_at, hours, status)
      VALUES (v_harbour, v_line_bar, d, '16:00', '01:00', 8.5, CASE WHEN d < t_monday + 7 THEN 'published' ELSE 'draft' END);
    END LOOP;
    -- Housekeeping: 12 attendants weekdays, 13 at the weekend
    FOR i IN 1..(CASE WHEN dow IN (6,7) THEN 13 ELSE 12 END) LOOP
      INSERT INTO roster_shifts (property_id, service_line_id, team_member_id, service_date, starts_at, ends_at, hours, status)
      VALUES (v_harbour, v_line_hk, hk_ids[1 + ((i - 1) % array_length(hk_ids, 1))], d, '08:00', '16:30', 8, CASE WHEN d < t_monday + 7 THEN 'published' ELSE 'draft' END);
    END LOOP;
  END LOOP;

  -- ── Harbour Hotel: today's rooms ──────────────────────────────────────────
  -- 153 rooms in house, 41 departures, 11 VIP/suites, 118 done at 10:05
  n_done := 0;
  FOR r IN SELECT id, number, floor, is_suite, target_minutes, room_type FROM rooms WHERE property_id = v_harbour ORDER BY floor, number LOOP
    EXIT WHEN (SELECT count(*) FROM room_tasks WHERE property_id = v_harbour AND service_date = t_today) >= 153;
    CONTINUE WHEN random() < 0.2;   -- vacant rooms
    i := (SELECT count(*) FROM room_tasks WHERE property_id = v_harbour AND service_date = t_today);
    INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, vip, needed_by, departure_at, arrival_at, notes, status, started_at, done_at, minutes, done_by, inspected_at, inspected_by)
    VALUES (v_harbour, r.id, t_today,
            CASE WHEN r.is_suite AND i % 3 = 0 THEN 'vip_arrival' WHEN i % 4 = 1 THEN 'departure' ELSE 'stayover' END,
            CASE WHEN r.is_suite AND i % 3 = 0 THEN 1 WHEN i % 4 = 1 THEN 2 WHEN r.is_suite THEN 2 ELSE 3 END,
            r.is_suite AND i % 3 = 0,
            CASE WHEN i % 4 = 1 THEN '14:00'::time WHEN r.is_suite THEN '13:00'::time ELSE NULL END,
            CASE WHEN i % 4 = 1 THEN '11:00'::time ELSE NULL END,
            CASE WHEN r.is_suite AND i % 3 = 0 THEN '13:00'::time ELSE NULL END,
            CASE WHEN r.is_suite AND i % 3 = 0 THEN 'orchids, bar' WHEN i % 4 = 1 THEN 'deep clean' WHEN i % 7 = 0 THEN 'DND lifted 09:40' ELSE NULL END,
            CASE WHEN n_done < 118 THEN (CASE WHEN n_done < 112 THEN 'inspected' ELSE 'done' END) ELSE 'todo' END,
            CASE WHEN n_done < 118 THEN (t_today::timestamp + interval '8 hours' + (n_done || ' minutes')::interval) AT TIME ZONE 'Asia/Hong_Kong' ELSE NULL END,
            CASE WHEN n_done < 118 THEN (t_today::timestamp + interval '8 hours 26 minutes' + (n_done || ' minutes')::interval) AT TIME ZONE 'Asia/Hong_Kong' ELSE NULL END,
            CASE WHEN n_done < 118 THEN (CASE WHEN r.floor >= 24 THEN 31 WHEN r.floor BETWEEN 20 AND 23 THEN 25 ELSE 24 END + (random() * 4)::int) ELSE NULL END,
            CASE WHEN n_done < 118 THEN hk_ids[1 + (n_done % array_length(hk_ids, 1))] ELSE NULL END,
            CASE WHEN n_done < 112 THEN (t_today::timestamp + interval '8 hours 40 minutes' + (n_done || ' minutes')::interval) AT TIME ZONE 'Asia/Hong_Kong' ELSE NULL END,
            CASE WHEN n_done < 112 THEN (SELECT id FROM team_members WHERE property_id = v_harbour AND role = 'supervisor' AND department = 'housekeeping' LIMIT 1) ELSE NULL END);
    n_done := n_done + 1;
  END LOOP;
  -- the three named rooms of the prototype
  UPDATE room_tasks SET kind = 'vip_arrival', vip = true, priority = 1, arrival_at = '13:00', needed_by = '13:00', notes = 'orchids, bar', status = 'todo', started_at = NULL, done_at = NULL, minutes = NULL, inspected_at = NULL, inspected_by = NULL
   WHERE property_id = v_harbour AND service_date = t_today AND room_id = (SELECT id FROM rooms WHERE property_id = v_harbour AND number = '2602');
  INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, vip, needed_by, arrival_at, notes, status)
  SELECT v_harbour, id, t_today, 'vip_arrival', 1, true, '13:00', '13:00', 'orchids, bar', 'todo' FROM rooms WHERE property_id = v_harbour AND number = '2602'
  ON CONFLICT (room_id, service_date, kind) DO NOTHING;
  UPDATE room_tasks SET kind = 'departure', priority = 2, departure_at = '11:00', needed_by = '14:00', notes = 'deep clean', status = 'todo', started_at = NULL, done_at = NULL, minutes = NULL, inspected_at = NULL, inspected_by = NULL
   WHERE property_id = v_harbour AND service_date = t_today AND room_id = (SELECT id FROM rooms WHERE property_id = v_harbour AND number = '2506');
  INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, departure_at, needed_by, notes, status)
  SELECT v_harbour, id, t_today, 'departure', 2, '11:00', '14:00', 'deep clean', 'todo' FROM rooms WHERE property_id = v_harbour AND number = '2506'
  ON CONFLICT (room_id, service_date, kind) DO NOTHING;
  UPDATE room_tasks SET kind = 'stayover', priority = 3, notes = 'DND lifted 09:40', dnd_until = '09:40', status = 'todo', started_at = NULL, done_at = NULL, minutes = NULL, inspected_at = NULL, inspected_by = NULL
   WHERE property_id = v_harbour AND service_date = t_today AND room_id = (SELECT id FROM rooms WHERE property_id = v_harbour AND number = '1512');
  INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, notes, dnd_until, status)
  SELECT v_harbour, id, t_today, 'stayover', 3, 'DND lifted 09:40', '09:40', 'todo' FROM rooms WHERE property_id = v_harbour AND number = '1512'
  ON CONFLICT (room_id, service_date, kind) DO NOTHING;
  INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, vip, needed_by, arrival_at, notes, status)
  SELECT v_harbour, id, t_today, 'vip_arrival', 1, true, '14:30', '14:30', 'extra bed', 'todo' FROM rooms WHERE property_id = v_harbour AND number = '2601'
  ON CONFLICT (room_id, service_date, kind) DO UPDATE SET notes = 'extra bed', arrival_at = '14:30', needed_by = '14:30', status = 'todo', vip = true, priority = 1;
  INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, vip, needed_by, arrival_at, notes, status, started_at, done_at, minutes, inspected_at)
  SELECT v_harbour, id, t_today, 'vip_arrival', 1, true, '15:00', '15:00', NULL, 'inspected', (t_today::timestamp + interval '9 hours 15 minutes') AT TIME ZONE 'Asia/Hong_Kong', (t_today::timestamp + interval '9 hours 45 minutes') AT TIME ZONE 'Asia/Hong_Kong', 30, (t_today::timestamp + interval '9 hours 50 minutes') AT TIME ZONE 'Asia/Hong_Kong'
  FROM rooms WHERE property_id = v_harbour AND number = '2504'
  ON CONFLICT (room_id, service_date, kind) DO UPDATE SET status = 'inspected', inspected_at = EXCLUDED.inspected_at, vip = true, priority = 1;
  INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, departure_at, needed_by, notes, status)
  SELECT v_harbour, id, t_today, 'departure', 2, '12:00', '15:00', 'late checkout agreed', 'todo' FROM rooms WHERE property_id = v_harbour AND number = '1809'
  ON CONFLICT (room_id, service_date, kind) DO UPDATE SET notes = 'late checkout agreed', departure_at = '12:00', status = 'todo';
  INSERT INTO room_tasks (property_id, room_id, service_date, kind, priority, departure_at, needed_by, notes, status)
  SELECT v_harbour, id, t_today, 'departure', 2, '10:45', '14:00', 'needed by 14:00 for an arrival', 'todo' FROM rooms WHERE property_id = v_harbour AND number = '2310'
  ON CONFLICT (room_id, service_date, kind) DO UPDATE SET notes = 'needed by 14:00 for an arrival', departure_at = '10:45', status = 'todo';

  -- ── Townhouse and the five regional hotels: lighter data ──────────────────
  FOR r IN SELECT id, name, keys, settings FROM properties WHERE org_id = v_org AND id <> v_harbour LOOP
    v_prop := r.id;
    INSERT INTO outlets (property_id, name, slug, outlet_type, meal_period, opens_at, closes_at, capacity_pax, sort_order, settings)
    VALUES (v_prop, 'Breakfast', 'breakfast', 'breakfast', 'breakfast', '06:30', '10:30', round(r.keys * 0.9), 1,
            jsonb_build_object('attach_by_rate_code', '{"breakfast_inclusive":0.9,"package":0.75,"default":0.6,"room_only":0.3}'::jsonb,
                               'usual_covers', round(r.keys * 1.05), 'hours_per_cover', '{"service":0.24,"kitchen":0.21,"stewarding":0.14}'::jsonb))
    RETURNING id INTO v_outlet;
    INSERT INTO waves (property_id, outlet_id, label, starts_at, share_default, sort_order) VALUES
      (v_prop, v_outlet, 'Open', '06:30', 0.32, 1), (v_prop, v_outlet, '08:00', '08:00', 0.42, 2), (v_prop, v_outlet, '09:30', '09:30', 0.26, 3);
    INSERT INTO stations (property_id, outlet_id, name, slug, station_kind, food_category, unit, base_par, usual_covers, cost_per_unit, kg_per_unit, nationality_priors, sort_order) VALUES
      (v_prop, v_outlet, 'Congee & noodles', 'congee_noodles', 'buffet', 'rice_noodles', 'portions', round(r.keys * 0.33), round(r.keys * 1.05), 1.0, 0.3, '{"greater_china":{"mult":1.5,"conf":0.9},"western":{"mult":0.65,"conf":0.85}}', 1),
      (v_prop, v_outlet, 'Western hot',      'western_hot',    'buffet', 'meat',         'portions', round(r.keys * 0.36), round(r.keys * 1.05), 1.5, 0.22, '{"western":{"mult":1.6,"conf":0.9},"greater_china":{"mult":0.75,"conf":0.85}}', 2),
      (v_prop, v_outlet, 'Eggs',             'eggs',           'buffet', 'dairy',        'portions', round(r.keys * 0.45), round(r.keys * 1.05), 0.7, 0.12, '{}', 3),
      (v_prop, v_outlet, 'Bakery',           'bakery',         'buffet', 'bread_pastry', 'portions', round(r.keys * 0.55), round(r.keys * 1.05), 0.45, 0.08, '{"western":{"mult":1.4,"conf":0.9}}', 4),
      (v_prop, v_outlet, 'Fruit & cold',     'fruit_cold',     'buffet', 'fruit',        'portions', round(r.keys * 0.6),  round(r.keys * 1.05), 0.55, 0.15, '{}', 5);
    INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
    VALUES (v_prop, v_outlet, 'Breakfast service', 'service', 'morning', '06:00', '11:00', 0.22, 6, 1) RETURNING id INTO v_line_bf;
    INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
    VALUES (v_prop, v_outlet, 'Kitchen, early shift', 'kitchen', 'early', '05:00', '11:30', 0.2, 8, 2) RETURNING id INTO v_line_kit;
    INSERT INTO service_lines (property_id, outlet_id, name, department, shift_label, starts_at, ends_at, hours_per_cover, fixed_hours, sort_order)
    VALUES (v_prop, v_outlet, 'Stewarding', 'stewarding', 'morning', '06:00', '12:00', 0.13, 5, 3) RETURNING id INTO v_line_stw;

    FOR d IN SELECT generate_series(t_today - 60, t_today + 7, '1 day')::date LOOP
      dow := EXTRACT(ISODOW FROM d);
      occ := CASE WHEN dow IN (5,6) THEN 0.82 + random() * 0.1 ELSE 0.68 + random() * 0.12 END;
      rooms_occ := round(r.keys * occ);
      INSERT INTO pms_daily (property_id, service_date, rooms_occupied, rooms_total, guests_in_house, arrivals, departures, departures_am,
                             rate_code_mix, travel_source_mix, nationality_mix, los_distribution, source)
      VALUES (v_prop, d, rooms_occ, r.keys, round(rooms_occ * 1.6), round(rooms_occ * 0.2), round(rooms_occ * 0.2), round(rooms_occ * 0.12),
              jsonb_build_object('breakfast_inclusive', round((0.45 + random() * 0.15)::numeric, 2), 'room_only', round((0.25 + random() * 0.1)::numeric, 2), 'package', 0.12, 'default', 0.1),
              jsonb_build_object('fit', 0.6, 'tour_group', round((0.1 + random() * 0.15)::numeric, 2), 'mice', 0.12, 'other', 0.1),
              CASE WHEN r.name LIKE 'Taipei%' THEN '{"greater_china":0.45,"japan":0.25,"western":0.18,"korea":0.07,"other":0.05}'::jsonb
                   ELSE '{"greater_china":0.42,"western":0.3,"japan":0.1,"korea":0.08,"other":0.1}'::jsonb END,
              '{"day1":0.22,"day2_4":0.52,"day5plus":0.26}', 'csv');
      IF d <= t_today THEN
        INSERT INTO service_actuals (property_id, outlet_id, service_date, actual_covers, source)
        VALUES (v_prop, v_outlet, d, round(rooms_occ * 1.6 * (0.64 + random() * 0.08)), 'pos');
        INSERT INTO energy_readings (property_id, service_date, category, kwh) VALUES
          (v_prop, d, 'cooling', round(r.keys * (r.settings ->> 'energy_baseline_kwh_room')::numeric * (0.88 + random() * 0.06) * 0.43)),
          (v_prop, d, 'kitchens', round(r.keys * (r.settings ->> 'energy_baseline_kwh_room')::numeric * (0.88 + random() * 0.06) * 0.21)),
          (v_prop, d, 'lifts_lighting', round(r.keys * (r.settings ->> 'energy_baseline_kwh_room')::numeric * (0.88 + random() * 0.06) * 0.19)),
          (v_prop, d, 'other', round(r.keys * (r.settings ->> 'energy_baseline_kwh_room')::numeric * (0.88 + random() * 0.06) * 0.17));
        FOR v_station IN SELECT id FROM stations WHERE outlet_id = v_outlet LOOP
          INSERT INTO waste_logs (property_id, outlet_id, station_id, service_date, kg, reason, source, logged_at)
          VALUES (v_prop, v_outlet, v_station, d, round((1.0 + random() * 3.0)::numeric, 2), 'over-prep', 'csv', (d::timestamp + interval '10 hours 30 minutes') AT TIME ZONE 'Asia/Hong_Kong');
        END LOOP;
      END IF;
      -- roster: planned to the demand the forecast asks for, except a Saturday kitchen gap in two hotels
      IF d >= t_monday AND d < t_monday + 14 THEN
        planned := r.keys * occ * 1.6 * 0.68;   -- covers the engine will forecast, roughly
        INSERT INTO roster_shifts (property_id, service_line_id, service_date, starts_at, ends_at, hours, status)
          SELECT v_prop, v_line_bf, d, '06:00', '12:00', 6, 'published' FROM generate_series(1, GREATEST(2, ceil((6 + planned * 0.22) / 6)::int));
        INSERT INTO roster_shifts (property_id, service_line_id, service_date, starts_at, ends_at, hours, status)
          SELECT v_prop, v_line_kit, d, '05:00', '13:00', 8, 'published'
          FROM generate_series(1, GREATEST(2, round((8 + planned * 0.2) / 8)::int - (CASE WHEN dow = 6 AND r.name = 'Hong Kong Central' THEN 1 WHEN dow = 6 AND r.name = 'Macau' THEN 1 ELSE 0 END)));
        INSERT INTO roster_shifts (property_id, service_line_id, service_date, starts_at, ends_at, hours, status)
          SELECT v_prop, v_line_stw, d, '06:00', '14:00', 8, 'published' FROM generate_series(1, GREATEST(2, ceil((5 + planned * 0.13) / 8)::int));
      END IF;
    END LOOP;
    INSERT INTO weather_daily (property_id, service_date, temp_c, rain_prob, condition)
      SELECT v_prop, d2, 26, 0.2, 'clear' FROM generate_series(t_today - 7, t_today + 7, '1 day') d2;
  END LOOP;

  -- ── Financials: this quarter and last year's, seven hotels ────────────────
  FOR r IN SELECT id, name, keys FROM properties WHERE org_id = v_org LOOP
    FOR i IN 0..2 LOOP
      d := (date_trunc('quarter', t_today) + (i || ' months')::interval)::date;
      INSERT INTO property_financials (property_id, period, revenue, gop, noi, asset_value, revpar, occupancy, currency)
      VALUES (r.id, d,
              round(r.keys * 30 * 0.82 * (CASE r.name WHEN 'Harbour Hotel' THEN 410 WHEN 'Townhouse' THEN 300 WHEN 'Macau' THEN 260 ELSE 330 END) * 1.55),
              round(r.keys * 30 * 0.82 * (CASE r.name WHEN 'Harbour Hotel' THEN 410 WHEN 'Townhouse' THEN 300 WHEN 'Macau' THEN 260 ELSE 330 END) * 1.55
                    * (CASE r.name WHEN 'Harbour Hotel' THEN 0.382 WHEN 'Townhouse' THEN 0.412 WHEN 'Hong Kong Central' THEN 0.378 WHEN 'Macau' THEN 0.372 WHEN 'Kowloon' THEN 0.392 WHEN 'Taipei Riverside' THEN 0.401 ELSE 0.395 END)),
              round(r.keys * 30 * 0.82 * (CASE r.name WHEN 'Harbour Hotel' THEN 410 WHEN 'Townhouse' THEN 300 WHEN 'Macau' THEN 260 ELSE 330 END) * 1.55
                    * (CASE r.name WHEN 'Harbour Hotel' THEN 0.382 WHEN 'Townhouse' THEN 0.412 WHEN 'Hong Kong Central' THEN 0.378 WHEN 'Macau' THEN 0.372 WHEN 'Kowloon' THEN 0.392 WHEN 'Taipei Riverside' THEN 0.401 ELSE 0.395 END) * 0.78),
              round(r.keys * (CASE r.name WHEN 'Harbour Hotel' THEN 816000 WHEN 'Townhouse' THEN 816000 WHEN 'Hong Kong Central' THEN 790000 WHEN 'Macau' THEN 627000 WHEN 'Kowloon' THEN 796000 WHEN 'Taipei Riverside' THEN 740000 ELSE 720000 END)),
              CASE r.name WHEN 'Harbour Hotel' THEN 336 WHEN 'Townhouse' THEN 246 WHEN 'Macau' THEN 213 ELSE 270 END, 0.82, 'USD');
      -- last year, same quarter: margins about 3 points lower
      INSERT INTO property_financials (property_id, period, revenue, gop, noi, asset_value, currency)
      VALUES (r.id, (d - interval '1 year')::date,
              round(r.keys * 30 * 0.78 * (CASE r.name WHEN 'Harbour Hotel' THEN 390 WHEN 'Townhouse' THEN 285 WHEN 'Macau' THEN 250 ELSE 315 END) * 1.55),
              round(r.keys * 30 * 0.78 * (CASE r.name WHEN 'Harbour Hotel' THEN 390 WHEN 'Townhouse' THEN 285 WHEN 'Macau' THEN 250 ELSE 315 END) * 1.55
                    * (CASE r.name WHEN 'Harbour Hotel' THEN 0.351 WHEN 'Townhouse' THEN 0.385 ELSE 0.355 END)),
              round(r.keys * 30 * 0.78 * (CASE r.name WHEN 'Harbour Hotel' THEN 390 WHEN 'Townhouse' THEN 285 WHEN 'Macau' THEN 250 ELSE 315 END) * 1.55
                    * (CASE r.name WHEN 'Harbour Hotel' THEN 0.351 WHEN 'Townhouse' THEN 0.385 ELSE 0.355 END) * 0.78),
              round(r.keys * (CASE r.name WHEN 'Harbour Hotel' THEN 1000000 ELSE 900000 END)), 'USD');
    END LOOP;
  END LOOP;
END $$;
