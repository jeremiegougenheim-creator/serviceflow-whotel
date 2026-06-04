// Cloudflare Worker — Claude intent proxy for ServiceFlow voice log.
//
// Browser POSTs { transcript: string } to this Worker. The Worker forwards
// it to Anthropic with the x-api-key header (key stays server-side), then
// returns the parsed intent JSON to the browser.
//
// Why Haiku 4.5: this is a 5-bucket intent classifier with a tiny entity
// extraction inside one bucket. Haiku is fast (sub-500ms typical), cheap,
// and plenty for the task. Swap to Sonnet only if accuracy on noisy
// transcripts becomes a problem.
//
// Deploy:
//   cd worker/
//   npm i -g wrangler  (if you don't have it)
//   wrangler login
//   wrangler secret put ANTHROPIC_API_KEY    # paste sk-ant-... key
//   wrangler deploy
//   → copy the *.workers.dev URL into index.html INTENT_PROXY_URL.
//
// Restrict CORS in production by setting ALLOWED_ORIGIN as a Worker var
// (e.g. https://service-flow.dev). Defaults to * for local dev convenience.

const ALLOWED_ORIGIN_DEFAULT = '*';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function buildPrompt(transcript) {
  return `You are a hotel kitchen assistant voice parser.
The user said: "${transcript}"

Classify this into exactly one of these intents and respond ONLY with valid JSON:

1. WASTE_LOG — user is logging food waste, e.g. "Japanese 2 kilos", "western hot overprep 500g"
2. QUESTION — user asked a question, e.g. "how much did we waste yesterday", "what's the forecast"
3. CONFIRM — user said yes/confirm/ok/log it after seeing a suggestion
4. CANCEL — user said no/cancel/never mind/stop
5. UNCLEAR — anything else

For WASTE_LOG respond:
{"intent":"WASTE_LOG","station":"[station name as spoken]","amount":[number],"unit":"kg or g","confidence":"high|medium|low"}

For QUESTION respond:
{"intent":"QUESTION","reply":"[a short, direct answer in 1 sentence if you can answer from context, otherwise say what you cannot do]"}

For CONFIRM respond:
{"intent":"CONFIRM"}

For CANCEL respond:
{"intent":"CANCEL"}

For UNCLEAR respond:
{"intent":"UNCLEAR","reply":"I can log waste — try saying a station name and amount, like 'Japanese 2 kilos'."}

Respond with JSON only. No other text.`;
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || ALLOWED_ORIGIN_DEFAULT;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse(
        { error: 'Worker not configured: missing ANTHROPIC_API_KEY secret' },
        500,
        origin
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    const transcript = ((body && body.transcript) || '').trim();
    if (!transcript) {
      return jsonResponse({ error: 'Empty transcript' }, 400, origin);
    }
    // Sanity cap so we don't forward absurdly long inputs.
    if (transcript.length > 800) {
      return jsonResponse({ error: 'Transcript too long' }, 413, origin);
    }

    let claudeRes;
    try {
      claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: buildPrompt(transcript) }],
        }),
      });
    } catch (err) {
      return jsonResponse(
        { error: 'Anthropic fetch failed', message: String(err) },
        502,
        origin
      );
    }

    if (!claudeRes.ok) {
      const detail = await claudeRes.text().catch(() => '');
      return jsonResponse(
        { error: 'Anthropic API error', status: claudeRes.status, detail },
        502,
        origin
      );
    }

    let claudeData;
    try {
      claudeData = await claudeRes.json();
    } catch (err) {
      return jsonResponse(
        { error: 'Anthropic response not JSON', message: String(err) },
        502,
        origin
      );
    }

    const text =
      (claudeData.content && claudeData.content[0] && claudeData.content[0].text) || '';

    // Prefer a direct parse; if the model wrapped the JSON in prose, extract.
    let intent = null;
    try {
      intent = JSON.parse(text.trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          intent = JSON.parse(match[0]);
        } catch {}
      }
    }

    if (!intent || typeof intent.intent !== 'string') {
      return jsonResponse(
        {
          intent: 'UNCLEAR',
          reply:
            "I didn't catch that — try saying a station name and amount, like 'Japanese 2 kilos'.",
        },
        200,
        origin
      );
    }

    return jsonResponse(intent, 200, origin);
  },
};
