# ServiceFlow intent proxy (Cloudflare Worker + Workers AI)

Classifies browser-side voice transcripts into one of `WASTE_LOG / QUESTION / CONFIRM / CANCEL / UNCLEAR` so the front end can route appropriately. Runs entirely on Cloudflare — no external LLM API, no API keys, no secrets to manage.

## Deploy

```sh
# from repo root
cd worker
npx wrangler login   # one-time
npx wrangler deploy
```

Wrangler prints the public URL, e.g. `https://serviceflow-intent.your-subdomain.workers.dev`. Workers AI is enabled automatically by the `[ai] binding = "AI"` block in `wrangler.toml`.

## Wire the front end

Open `index.html` at the repo root, find `INTENT_PROXY_URL`, paste the Worker URL:

```js
const INTENT_PROXY_URL = 'https://serviceflow-intent.your-subdomain.workers.dev';
```

Commit + push. GitHub Pages picks it up.

## Lock CORS (recommended)

By default the Worker replies `Access-Control-Allow-Origin: *`. Once it's working, restrict to your domain via `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGIN = "https://service-flow.dev"
```

Then `npx wrangler deploy` again.

## Swap the model

Default is `@cf/meta/llama-3.1-8b-instruct` (fast, free tier covers ~10k requests/day, plenty for 5-bucket intent + 3-field extraction). Override via `wrangler.toml`:

```toml
[vars]
AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
```

See https://developers.cloudflare.com/workers-ai/models/ for the full list.

## Test directly

```sh
curl -X POST https://serviceflow-intent.your-subdomain.workers.dev \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"Japanese overprep 2 kilos"}'
```

Expected reply:

```json
{"intent":"WASTE_LOG","station":"Japanese","amount":2,"unit":"kg","confidence":"high"}
```

## Failure modes the front end handles

- Worker unreachable / 5xx → front end falls back to its local keyword parser.
- AI binding missing → returns 500 with explicit message; front end falls back.
- Model returns unparseable text → Worker returns `{intent:"UNCLEAR", reply:"…"}`.
