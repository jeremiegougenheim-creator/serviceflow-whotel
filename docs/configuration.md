# Configuration reference

All per-hotel settings are rows; the engine reads them at every run.

## properties.settings

| Key | Meaning | Default |
| --- | --- | --- |
| `food_cost_per_cover` | cost of food served per breakfast cover, hotel currency | — |
| `waste_baseline_g_cover` | measured g of waste per cover before ServiceFlow | trailing 28-day average |
| `co2e_default_factor` | kg CO2e per kg when a station has no category factor | 2.5 |
| `winnow` | a bin scale is in place (its reactive point is credited to the scale) | false |
| `saving_points_total` / `saving_points_serviceflow` | food-cost points in all / the forecast's share | 4 / 3 |
| `energy_baseline_kwh_room` | baseline kWh per key-night | — |
| `brief_time`, `dawn_update_time`, `debrief_time` | local times of the three daily steps | 18:00, 03:30, 12:30 |

## outlets.settings

`attach_by_rate_code` (object), `lounge_divert_tiers` (array), `usual_covers`, `walk_in_share`, `buffer_pct` (banquets), `food_cost_per_cover`, `hours_per_cover` (object by department).

## stations

`base_par` at `usual_covers`, `unit`, `cost_per_unit`, `kg_per_unit`, `co2e_factor` (or the `food_category` factor: bread_pastry 1.9, meat 27, dairy 3.2, vegetables 2.0, seafood 6.1, rice_noodles 2.2, fruit 1.1, beverage 0.9, default 2.5), `nationality_priors` `{group: {mult, conf}}`, `dow_profile` `{weekend}`, `weather_profile` `{rain, hot}`, `settings.aliases` for voice (any language).

## service_lines

`hours_per_cover` for F&B lines, `minutes_per_room` for housekeeping, `fixed_hours`, `min_hours`. Demand = fixed + volume × ratio.

## Roles

`gm`, `fnb_mgr`, `chef`, `sous_chef`, `prep_cook`, `hk`, `eng`, `auditor`, `admin` act inside one hotel. `owner`, `vp` (region scope), `ceo` (organisation scope) read across hotels and never write.
