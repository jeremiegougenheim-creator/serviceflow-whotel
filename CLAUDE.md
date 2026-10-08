# CLAUDE.md — ServiceFlow by SparkEdge

Read first. Everything needed to work on this repository without a briefing.

## What the product does

ServiceFlow does one thing: every evening it turns the hotel's own forecast into tomorrow's production plan per station and the hours each service needs, with the reason behind every number. A person approves every change. Nothing is ordered or rostered on its own. No hardware, nothing to migrate.

Words we use: covers forecast, production plan per station, hours against demand, the general manager's morning brief. Words we avoid: operating layer, AI platform, food-waste or ESG platform, "intelligence layer". The product name is **ServiceFlow by SparkEdge**, everywhere.

The repository name `serviceflow-whotel` is historical. Never rename the repo or move `index.html` (a static demo served at the root).

## Rules that never change

```
1. The forecast is segmented, never flat.
   Attach rates come from the rate-code mix, the loyalty tiers, the length of stay, the departures
   and the late arrivals. attach_rate = 0.65 is a bug.

2. Savings are split and never over-claimed.
   outcomes.saving_serviceflow is the predictive share (3 of 4 points of food cost by default).
   When a bin scale is in place its reactive point is the scale's: saving_bin_scale.
   saving_serviceflow + saving_bin_scale <= saving_total, always, in the hotel's own currency.

3. ESG is measured, not modelled.
   CO2e comes from waste_logs (a scale, a voice log, a manual entry) × the station factor.
   No log, no claim: the debrief counts nothing avoided without a measured entry.

4. Human in the loop.
   decisions, station_plans, live_events, roster_suggestions, planned_works wait for a person.
   Status moves from proposed to approved only through an action taken by a signed-in user.

5. Nothing ships without a backtest.
   prediction_log keeps every forecast and its outcome. Change the model, run the history, compare:
   `npm run engine -- backtest <hotel>` and the Backtest screen replay every past evening with only what
   was known before it, against habit and the simple capture rate. Bump MODEL_VERSION with the change.

6. The data stays in the hotel.
   Row level security on every table, keyed by property_id, and a trigger that keeps every parent
   (outlet, station, room, forecast…) in the row's own property. Portfolio roles read; they never write.
   A GM grants operational roles in their hotel only; portfolio and admin roles come from the service role.
   Aggregates only: no guest names, no individual records. The service role never reaches a browser.
   Every write from the app checks the rows it touched: a refused write is reported, never shown as done.
```

## Stack

```
app/        Next.js 16 (App Router, React 19, TypeScript, Tailwind 4), PWA, deployed on Vercel
            @supabase/ssr in the browser and in server components (RLS applies);
            the service role only inside src/lib/engine/run.ts, route handlers and scripts
supabase/   migrations (schema v2, 10 files), seed.sql (illustrative hotels), demo_history.sql (re-draws their past covers), cron.sql (pg_cron → /api/jobs/daily hourly, /api/jobs/live every 15 min)
legacy/     the 2025 prototype app, the Python connectors and the federated-learning notes (not built)
index.html  the static demo at the repository root (unchanged by the app)
```

Tests: `npm test` (Vitest: product rules + tenant isolation when a Supabase URL is set), `npm run test:e2e` (Playwright, against a running app seeded with the demo accounts). CI runs lint, typecheck, unit tests and the build; it publishes nothing.

## Where things are

| Need | File |
| --- | --- |
| Forecast (covers, waves, drivers) | `app/src/lib/engine/forecast.ts` |
| Plan per station, the three decisions | `app/src/lib/engine/plan.ts` |
| Hours against demand, roster suggestions | `app/src/lib/engine/staffing.ts` |
| Debrief, savings split, CO2e | `app/src/lib/engine/debrief.ts` |
| Live service proposals | `app/src/lib/engine/live.ts` |
| Nightly grades and tomorrow's actions | `app/src/lib/engine/nightly.ts` |
| Backtest (walk-forward replay, baselines) | `app/src/lib/engine/backtest.ts`, `app/src/lib/data/backtest.ts` |
| Rows → engine shapes (shared by the engine and the screens) | `app/src/lib/engine/rows.ts` |
| Voice and text logs, English and Chinese | `app/src/lib/engine/voice.ts` |
| Orchestration and persistence | `app/src/lib/engine/run.ts` |
| Server actions (every write from the UI) | `app/src/lib/actions/*.ts` |
| Screens | `app/src/app/(app)/*` |
| Schema | `supabase/migrations/*.sql` |

## Commands

```bash
cd app
npm run dev          # local app (needs .env with a Supabase URL and keys)
npm run seed         # demo accounts + the engine over the illustrative data
npm run engine -- brief all        # the evening brief for tomorrow, every hotel
npm run engine -- debrief harbour-hotel 2026-10-06
npm run engine -- backtest all     # replay the forecast over the past, out of sample
npm test             # unit + integration
npm run test:e2e     # Playwright smoke, E2E_BASE_URL=http://localhost:3000
npm run build
```

## Configuration lives in the database

Stations, waves, rate-code attach rates, costs, CO2e factors, currency, time zone, staffing ratios and the three daily times are rows in `properties`, `outlets`, `waves`, `stations` and `service_lines`, edited in Set-up. Adding a hotel is configuration and a CSV import, never code.

## Not in this repository

No client names, no contacts, no prices, no pitch arguments. Those live in the private working documents.
