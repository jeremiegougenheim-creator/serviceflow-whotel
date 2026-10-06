-- ============================================================
-- Lauds — W Taipei Pilot Seed Data
-- Migration: 002_seed_wtaipei.sql
-- ============================================================
-- This migration is idempotent: uses ON CONFLICT DO NOTHING
-- so it is safe to run multiple times.
-- ============================================================

-- ─── Org: Marriott Taiwan ─────────────────────────────────────────────────────

INSERT INTO orgs (id, name, slug, settings)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Marriott Taiwan',
  'marriott-taiwan',
  '{
    "currency": "TWD",
    "locale": "zh-TW"
  }'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Property: W Taipei ───────────────────────────────────────────────────────

INSERT INTO properties (id, org_id, name, slug, brand, keys, timezone, address, country_code, settings)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'W Taipei',
  'w-taipei',
  'W Hotels',
  405,
  'Asia/Taipei',
  '10 Zhongxiao East Road Section 5, Xinyi District, Taipei 110, Taiwan',
  'TW',
  '{
    "pms_system": "opera",
    "currency": "TWD",
    "usd_rate": 32.0,
    "reference_covers": 312,
    "breakfast_start": "06:30",
    "breakfast_end": "10:30",
    "nat_mix_default": {
      "greaterChina": 0.38,
      "japan": 0.20,
      "western": 0.20,
      "korea": 0.08,
      "seasia": 0.08,
      "other": 0.06
    },
    "suite_ratio_default": 0.12,
    "guests_per_room_default": 1.5
  }'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Outlet: The Kitchen Table ────────────────────────────────────────────────

INSERT INTO outlets (id, property_id, name, slug, outlet_type, capacity_pax, settings)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'The Kitchen Table',
  'kitchen-table',
  'restaurant',
  320,
  '{
    "meal_type": "breakfast",
    "style": "buffet",
    "winnow_device_id": null
  }'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Stations ─────────────────────────────────────────────────────────────────
-- 9 stations for The Kitchen Table
-- WINNOW_CORRECTION values (waste_kg / produced_kg from Winnow calibration):
--   congee_noodle: 0.08  |  dim_sum: 0.11   |  japanese: 0.09
--   korean: 0.07         |  western_hot: 0.14|  bakery_pastry: 0.12
--   fruit_cold: 0.06     |  taiwanese_local: 0.08 | coffee_bar: 0.05

INSERT INTO stations (id, outlet_id, name, slug, food_category, co2e_factor_kg_per_kg, sort_order, settings)
VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Congee & Noodle',
    'congee_noodle',
    'grain_noodle',
    0.800,
    1,
    '{"winnow_correction": 0.08, "base_par_kg": 60, "badge_color": "#4A6741"}'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'Dim Sum',
    'dim_sum',
    'mixed',
    1.200,
    2,
    '{"winnow_correction": 0.11, "base_par_kg": 40, "badge_color": "#A8175F"}'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'Japanese',
    'japanese',
    'seafood_mixed',
    2.100,
    3,
    '{"winnow_correction": 0.09, "base_par_kg": 45, "badge_color": "#C9A97A"}'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    'Korean',
    'korean',
    'mixed',
    1.100,
    4,
    '{"winnow_correction": 0.07, "base_par_kg": 25, "badge_color": "#E01E8C"}'
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000001',
    'Western Hot',
    'western_hot',
    'egg_dairy_meat',
    2.800,
    5,
    '{"winnow_correction": 0.14, "base_par_kg": 70, "badge_color": "#7A5A32"}'
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000001',
    'Bakery & Pastry',
    'bakery_pastry',
    'grain_butter',
    1.600,
    6,
    '{"winnow_correction": 0.12, "base_par_kg": 55, "badge_color": "#B9770F"}'
  ),
  (
    '40000000-0000-0000-0000-000000000007',
    '30000000-0000-0000-0000-000000000001',
    'Fruit & Cold',
    'fruit_cold',
    'produce',
    0.500,
    7,
    '{"winnow_correction": 0.06, "base_par_kg": 80, "badge_color": "#16A6EC"}'
  ),
  (
    '40000000-0000-0000-0000-000000000008',
    '30000000-0000-0000-0000-000000000001',
    'Taiwanese Local',
    'taiwanese_local',
    'grain_mixed',
    0.900,
    8,
    '{"winnow_correction": 0.08, "base_par_kg": 35, "badge_color": "#A0784A"}'
  ),
  (
    '40000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000001',
    'Coffee Bar',
    'coffee_bar',
    'beverage',
    0.300,
    9,
    '{"winnow_correction": 0.05, "base_par_kg": 300, "badge_color": "#2A2520"}'
  )
ON CONFLICT (id) DO NOTHING;
