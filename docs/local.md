# Local stack without Docker

The app talks to Supabase through two HTTP services and one Postgres database. Locally, the same three pieces run as plain processes:

| Piece | Local | Port |
| --- | --- | --- |
| Postgres 16 | the system cluster, database `serviceflow` | 5432 |
| Auth (GoTrue) | `auth` binary from supabase/auth releases | 9999 |
| REST (PostgREST) | `postgrest` binary | 3001 |
| Gateway | `gateway.js` (routes `/auth/v1` and `/rest/v1`, adds CORS) | 54321 |

Steps:

1. Create the roles Supabase expects (`anon`, `authenticated`, `service_role`, `authenticator`, `supabase_auth_admin`), the `auth` schema and the `auth.uid()` / `auth.role()` helpers. The hosted platform provides these; locally they are created once (see `scripts/local/*.sql` for the exact statements).
2. Generate a JWT secret and sign two long-lived tokens with `role: anon` and `role: service_role` (HS256). They become `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Start GoTrue with `GOTRUE_DB_NAMESPACE=auth`, `GOTRUE_JWT_SECRET`, `GOTRUE_MAILER_AUTOCONFIRM=true`; start PostgREST with `db-schemas = "public"`, `db-anon-role = "anon"` and the same `jwt-secret`.
4. Apply `supabase/migrations/*.sql` then `supabase/seed.sql` to the database.
5. `npm run seed` (demo accounts + the engine), then `npm run dev`.

Realtime is not part of the local stack; pages refresh on navigation and after every action.
