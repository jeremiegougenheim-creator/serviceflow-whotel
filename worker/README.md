# ServiceFlow intent proxy (Cloudflare Worker)

Forwards browser-side voice transcripts to Anthropic with the API key kept server-side. Returns a small JSON shape the front end uses to route to one of: `WASTE_LOG`, `QUESTION`, `CONFIRM`, `CANCEL`, `UNCLEAR`.

## Deploy

```sh
# from repo root
cd worker

# one-time
npm install -g wrangler
wrangler login

# store the Anthropic key (never goes in the HTML)
wrangler secret put ANTHROPIC_API_KEY
# paste sk-ant-... when prompted

wrangler deploy
```

Wrangler prints the public URL, e.g. `https://serviceflow-intent.your-subdomain.workers.dev`.

## Wire the front end

Open `index.html` at the repo root, find `INTENT_PROXY_URL`, paste the Worker URL:

```js
const INTENT_PROXY_URL = 'https://serviceflow-intent.your-subdomain.workers.dev';
```

Commit + push. GitHub Pages picks it up.

## Lock CORS (recommended)

By default the Worker replies `Access-Control-Allow-Origin: *`. Once it's working, restrict to your domain:

```sh
wrangler secret put ALLOWED_ORIGIN
# paste: https://service-flow.dev
wrangler deploy
```

Or uncomment the `[vars]` block in `wrangler.toml` and `wrangler deploy`.

## Swap the model

Default is `claude-haiku-4-5-20251001` (fast + cheap, fine for 5-bucket intent + tiny extraction). To use Sonnet for better robustness on noisy transcripts:

```sh
wrangler secret put CLAUDE_MODEL
# paste: claude-sonnet-4-6
wrangler deploy
```

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
- Worker missing key → returns 500 with explicit message; front end falls back.
- Model returns unparseable text → Worker returns `{intent:"UNCLEAR", reply:"…"}`.
