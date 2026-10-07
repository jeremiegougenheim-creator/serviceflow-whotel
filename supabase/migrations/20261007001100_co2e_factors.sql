-- ============================================================================
-- ServiceFlow — schema v2 · 10 · CO₂e factors a chef can defend
--
-- "meat" carried 27 kg CO₂e per kg, a beef/lamb figure. Applied to a dim sum
-- or a Western-hot station (pork, poultry, eggs) it overstated the hotel's
-- ESG line by about three times. Defaults now follow Poore & Nemecek (2018,
-- Science 360:987) per kg of food, rounded: beef/lamb 27, mixed meat (pork,
-- poultry) 8, dairy & eggs 3.2, seafood 6.1, rice & noodles 2.2, bread &
-- pastry 1.9, vegetables 2.0, fruit 1.1, beverage 0.9. A station's own
-- co2e_factor, when set, still wins.
-- ============================================================================
CREATE OR REPLACE FUNCTION sf_co2e_factor(p_station uuid, p_property uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT s.co2e_factor FROM stations s WHERE s.id = p_station),
    (SELECT CASE s.food_category
              WHEN 'bread_pastry' THEN 1.9 WHEN 'beef_lamb' THEN 27.0 WHEN 'meat' THEN 8.0 WHEN 'dairy' THEN 3.2
              WHEN 'vegetables' THEN 2.0 WHEN 'seafood' THEN 6.1 WHEN 'rice_noodles' THEN 2.2
              WHEN 'fruit' THEN 1.1 WHEN 'beverage' THEN 0.9 ELSE NULL END
       FROM stations s WHERE s.id = p_station),
    (SELECT (p.settings ->> 'co2e_default_factor')::numeric FROM properties p WHERE p.id = p_property),
    2.5)
$$;

-- Stations that are plainly beef or lamb keep the high factor.
UPDATE stations SET food_category = 'beef_lamb'
 WHERE food_category = 'meat' AND co2e_factor IS NULL
   AND (name ~* 'beef|lamb|mutton|short rib|wagyu|steak');

-- Re-price the logged CO₂e with the corrected factors (the kg logged do not change).
UPDATE waste_logs w SET co2e_kg = round(w.kg * sf_co2e_factor(w.station_id, w.property_id), 3);
