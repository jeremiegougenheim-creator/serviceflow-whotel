# Deploy ServiceFlow

Three pieces: a Supabase project (Postgres, Auth, RLS), the Next.js app on Vercel, and two pg_cron jobs that drive the engine (the hourly steps and the 15-minute live tick).

## 1. Supabase

1. Create the project `serviceflow` in **Singapore (ap-southeast-1)**. Note the project ref.
2. Apply the schema, in order, from `supabase/migrations/` (SQL editor, or `supabase db push` with the CLI linked to the project).
3. Load the illustrative hotels: run `supabase/seed.sql` (safe to re-run; it replaces the "Illustrative Group" only).
4. Auth → URL configuration: Site URL = the app's URL; add `https://<app>/auth/confirm` and `https://<app>/auth/callback` to the redirect allow list.
5. Auth → Email: keep "Confirm email" on. The app signs people in with a one-time link; a password is optional (demo accounts use one).
6. Copy from Project Settings → API: the project URL, the publishable key (`sb_publishable_…`) and the secret/service-role key.

## 2. The app on Vercel

1. Import the GitHub repo, root directory `app`, framework Next.js. Region Singapore (`sin1`, already in `vercel.json`).
2. Environment variables (Production and Preview):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key (server only) |
| `NEXT_PUBLIC_APP_URL` | `https://app.service-flow.app` (or the vercel.app URL) |
| `JOBS_SECRET` | a long random string |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional, for the brief by email |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional, web push |
| `OPENAI_API_KEY` | optional, server-side speech-to-text for browsers without the Web Speech API |

3. Deploy. Add the custom domain in Vercel and point the DNS at it.
4. Create the demo accounts and run the engine once: locally, with the production env in `app/.env`, run `npm run seed`. It creates `gm@demo.serviceflow` and friends (password `SEED_DEMO_PASSWORD`), then produces today's and tomorrow's plans.

## 3. The schedule

In the Supabase SQL editor run `supabase/cron.sql` with `APP_URL` and `JOBS_SECRET` filled in. Every hour the app runs the step due for each hotel at its own local time (brief 18:00, dawn update 03:30, debrief 12:30, report 23:00; all per hotel in Set-up → Hotel). Every 15 minutes `/api/jobs/live` reads the pace of every outlet in service and writes its proposals (cover check, running fast, waste risk); a count logged from the Live screen triggers the same read at once.

To run a step by hand: Set-up → Engine in the app, or `curl -X POST -H "Authorization: Bearer $JOBS_SECRET" https://<app>/api/jobs/brief`.

## 4. First real hotel

1. Set-up → Hotel: currency, time zone, food cost per cover, waste baseline, energy baseline, the three times.
2. Set-up → Outlets & stations: the outlets, their waves, every station with its usual par, cost and kg per unit, and its nationality multipliers.
3. Set-up → Staffing: the service lines with hours per cover (F&B) or minutes per room (housekeeping).
4. Set-up → Imports: PMS history (90 days is enough), covers served, waste history if a bin scale exists, the room inventory, the roster.
5. Set-up → Team: invite the GM, the chef, housekeeping and engineering by email.
6. Set-up → Engine → "Build tomorrow's plan now".

## Local development

`docs/local.md` describes the local stack (Postgres 16 + GoTrue + PostgREST behind a small gateway) used to develop without Docker. With Docker, `supabase start` works as usual: point `.env` at the local URL and keys, apply the migrations and the seed, then `npm run seed` and `npm run dev`.
