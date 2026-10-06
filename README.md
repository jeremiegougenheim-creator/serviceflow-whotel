# ServiceFlow by SparkEdge

Tomorrow's kitchen production and staffing plan, built every evening from the hotel's own forecast. A person approves every change; nothing is ordered or rostered on its own.

- `app/` — the application (Next.js 16, Supabase, PWA). See `docs/deploy.md` to run it for a hotel and `docs/local.md` to develop.
- `supabase/` — schema, illustrative seed, scheduling.
- `index.html` — the static demonstration at the repository root.
- `legacy/` — the 2025 prototype application and notes, kept for reference, not built.

Everything a hotel configures (outlets, stations, waves, costs, staffing ratios, the three daily times) is data, edited in the app under Set-up, or imported from CSV.

Demo accounts after `npm run seed`: `gm@`, `chef@`, `hk@`, `eng@`, `owner@`, `vp@`, `ceo@` at `demo.serviceflow`, password `SEED_DEMO_PASSWORD` (default `serviceflow-demo`). The illustrative group holds seven fictional hotels; nothing in the seed is a real property.
