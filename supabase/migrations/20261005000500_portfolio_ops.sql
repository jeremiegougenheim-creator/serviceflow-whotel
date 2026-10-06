-- ============================================================================
-- ServiceFlow — schema v2 · 5/7 · nightly reports, portfolio, notifications,
-- imports, jobs, audit
-- ============================================================================

-- "Tonight, graded." One row per property and night.
CREATE TABLE nightly_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  service_date  date NOT NULL,
  grades        jsonb NOT NULL DEFAULT '{}',   -- {"fnb":{"grade":"B+","note":"..."},"labour":{...},"leakage":{...},"esg":{...}}
  summary       jsonb NOT NULL DEFAULT '{}',   -- {"outlets":5,"rooms":196,"departments":4,...}
  best_log      jsonb,                         -- {"outlet":"Japanese kitchen","note":"every entry under 20 s","score":"5/5"}
  computed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, service_date)
);

-- Monthly financials per property, for the owner's and the CEO's views.
CREATE TABLE property_financials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  period        date NOT NULL,                 -- first day of the month
  revenue       numeric(14,2),
  gop           numeric(14,2),
  noi           numeric(14,2),
  asset_value   numeric(16,2),
  revpar        numeric(10,2),
  occupancy     numeric(5,4),
  currency      char(3) NOT NULL DEFAULT 'USD',
  fx_to_org     numeric(12,6) NOT NULL DEFAULT 1,   -- multiply to reach the org's reporting currency
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv','api')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, period)
);
CREATE INDEX idx_property_financials_lookup ON property_financials(property_id, period DESC);
CREATE TRIGGER trg_property_financials_touch BEFORE UPDATE ON property_financials FOR EACH ROW EXECUTE FUNCTION sf_touch_updated_at();

-- In-app notifications (email and push are delivered from the same row).
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE,
  kind          text NOT NULL,                 -- brief, dawn_update, live_alert, debrief, roster, flag
  title         text NOT NULL,
  body          text,
  href          text,
  channels      text[] NOT NULL DEFAULT '{in_app}',
  payload       jsonb NOT NULL DEFAULT '{}',
  sent_at       timestamptz,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  keys          jsonb NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- CSV imports (PMS history, waste history, roster, financials, energy).
CREATE TABLE imports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('pms_daily','waste_logs','service_actuals','roster_shifts','property_financials','energy_readings','rooms','bookings_daily')),
  file_name     text,
  rows_total    int NOT NULL DEFAULT 0,
  rows_ok       int NOT NULL DEFAULT 0,
  rows_failed   int NOT NULL DEFAULT 0,
  errors        jsonb NOT NULL DEFAULT '[]',
  status        text NOT NULL DEFAULT 'done' CHECK (status IN ('pending','done','failed')),
  imported_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Engine runs (evening brief, dawn update, debrief, staffing, nightly report).
CREATE TABLE job_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid REFERENCES properties(id) ON DELETE CASCADE,
  outlet_id     uuid REFERENCES outlets(id) ON DELETE CASCADE,
  job           text NOT NULL CHECK (job IN ('evening_brief','dawn_update','debrief','staffing','nightly_report','live','backtest','import')),
  service_date  date,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed','skipped')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  log           jsonb NOT NULL DEFAULT '{}',
  error         text
);
CREATE INDEX idx_job_runs_lookup ON job_runs(property_id, job, started_at DESC);

-- Who changed what (writes through the app).
CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  property_id   uuid REFERENCES properties(id) ON DELETE CASCADE,
  user_id       uuid,
  action        text NOT NULL,                 -- approve_decision, confirm_plan, log_waste, apply_roster…
  table_name    text,
  row_id        uuid,
  before        jsonb,
  after         jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_lookup ON audit_log(property_id, at DESC);
