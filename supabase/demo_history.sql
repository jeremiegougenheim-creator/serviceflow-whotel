-- ServiceFlow · illustrative history for the demo hotels (settings.illustrative = true)
--
-- Rewrites the past actual covers of the illustrative hotels so that they follow the house the
-- way a real outlet does, with noise, instead of a flat share of occupancy:
--   breakfast   each rate code eats at its own rate, lounge members eat upstairs, departures eat
--               a little more, weekends and rain add a few covers, groups eat as booked
--   restaurant  covers booked × show rate + walk-ins (only on days that carry bookings)
--   bar
-- The rates below are deliberately NOT the engine's defaults: a hotel never matches the defaults,
-- so the backtest has a steady miss to learn and the simple baselines have something to miss.
-- Whatever the Backtest screen shows on this data is illustrative: it shows how the test reads,
-- never how accurate ServiceFlow is. Only a hotel's own history says that.
--
-- Touches illustrative hotels only, past days only (today's close is the seed's). Re-runnable:
-- each run draws new noise. seed.sql ends with the same statement.

WITH bf AS (
  SELECT a.id,
         d.guests_in_house::numeric AS g,
         nullif(d.rooms_occupied, 0)::numeric AS rooms,
         d.departures::numeric AS dep,
         coalesce((d.rate_code_mix ->> 'breakfast_inclusive')::numeric, 0) AS bi,
         coalesce((d.rate_code_mix ->> 'room_only')::numeric, 0) AS ro,
         coalesce((d.rate_code_mix ->> 'package')::numeric, 0) AS pk,
         coalesce((d.rate_code_mix ->> 'default')::numeric, 0) AS df,
         coalesce((d.loyalty_tier_mix ->> 'titanium')::numeric, 0) + coalesce((d.loyalty_tier_mix ->> 'ambassador')::numeric, 0) AS lounge,
         (SELECT coalesce(sum((x ->> 'size')::int), 0) FROM jsonb_array_elements(d.group_manifest) x WHERE coalesce((x ->> 'breakfast')::boolean, true))::numeric AS grp,
         EXTRACT(ISODOW FROM a.service_date) AS dow,
         coalesce(w.rain_prob >= 0.6 OR w.condition IN ('rain', 'storm'), false) AS rain
  FROM service_actuals a
  JOIN outlets o ON o.id = a.outlet_id AND o.outlet_type = 'breakfast'
  JOIN properties p ON p.id = a.property_id AND p.settings ->> 'illustrative' = 'true'
  JOIN pms_daily d ON d.property_id = a.property_id AND d.service_date = a.service_date
  LEFT JOIN weather_daily w ON w.property_id = a.property_id AND w.service_date = a.service_date
  WHERE a.service_date < (now() AT TIME ZONE p.timezone)::date
)
UPDATE service_actuals a
SET actual_covers = greatest(0, round(
      ( (bf.g - bf.grp) * (1 - bf.lounge * 0.9)
          * (bf.bi * 0.88 + bf.ro * 0.33 + bf.pk * 0.70 + bf.df * 0.55) / nullif(bf.bi + bf.ro + bf.pk + bf.df, 0)
          * (1 + 0.05 * coalesce(bf.dep / bf.rooms, 0))
        + bf.grp * 0.9 )
      * CASE WHEN bf.dow IN (6, 7) THEN 1.03 ELSE 1 END
      * CASE WHEN bf.rain THEN 1.025 ELSE 1 END
      * (1 + 0.035 * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random()))
    ))::int
FROM bf
WHERE a.id = bf.id;

WITH bk AS (
  SELECT a.id, b.covers_booked::numeric AS booked, o.outlet_type,
         EXTRACT(ISODOW FROM a.service_date) AS dow
  FROM service_actuals a
  JOIN outlets o ON o.id = a.outlet_id AND o.outlet_type IN ('restaurant', 'bar')
  JOIN properties p ON p.id = a.property_id AND p.settings ->> 'illustrative' = 'true'
  JOIN bookings_daily b ON b.outlet_id = a.outlet_id AND b.service_date = a.service_date
  WHERE a.service_date < (now() AT TIME ZONE p.timezone)::date
)
UPDATE service_actuals a
SET actual_covers = greatest(0, round(
      bk.booked * 0.93
      + CASE bk.outlet_type WHEN 'bar' THEN (CASE WHEN bk.dow IN (5, 6) THEN 18 ELSE 12 END)
                            ELSE (CASE WHEN bk.dow IN (5, 6) THEN 12 ELSE 8 END) END
        * (1 + 0.3 * sqrt(-2 * ln(1 - random())) * cos(2 * pi() * random()))
    ))::int
FROM bk
WHERE a.id = bk.id;
