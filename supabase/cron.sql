-- ============================================================================
-- Scheduling with pg_cron + pg_net (free on Supabase). Run once in the SQL editor
-- after the app is deployed. Replace APP_URL and JOBS_SECRET.
--
-- Every hour the app runs, for each hotel, the step whose configured local hour
-- it is: the evening brief (18:00), the dawn update (03:30 → 03), the debrief
-- (12:30 → 12) and the nightly report (23:00). Times live in properties.settings.
-- Every 15 minutes the live tick runs for every outlet in service at its hotel's
-- clock: cover check, running fast, waste risk (proposals, never actions).
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('serviceflow-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'serviceflow-hourly');

SELECT cron.schedule(
  'serviceflow-hourly',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url     := 'APP_URL/api/jobs/daily',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer JOBS_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
  $$
);

SELECT cron.unschedule('serviceflow-live') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'serviceflow-live');

SELECT cron.schedule(
  'serviceflow-live',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'APP_URL/api/jobs/live',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer JOBS_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Check: SELECT * FROM cron.job;  and  SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
