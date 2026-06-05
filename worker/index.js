// Cloudflare Worker — voice intent classifier for ServiceFlow.
//
// Now powered by Cloudflare Workers AI (Llama 3.1 8B Instruct) via the AI
// binding declared in wrangler.toml. No external API, no API keys, no secret
// management — just a native env.AI.run call. Free tier covers ~10k requests/day.
//
// Browser POSTs { transcript: string }. Worker returns the parsed intent JSON.

const ALLOWED_ORIGIN_DEFAULT = '*';
const MODEL_DEFAULT = '@cf/meta/llama-3.1-8b-instruct';

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
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (!env.AI) {
      return jsonResponse(
        { error: 'Worker not configured: missing AI binding' },
        500,
        origin
      );
    }

    // POST /transcribe — Cloudflare Whisper audio transcription
    if (url.pathname === '/transcribe' && request.method === 'POST') {
      const audioBuffer = await request.arrayBuffer();
      const audioArray = [...new Uint8Array(audioBuffer)];
      let whisperResult;
      try {
        whisperResult = await env.AI.run('@cf/openai/whisper', { audio: audioArray });
      } catch (err) {
        return jsonResponse({ error: 'Whisper failed', message: String(err) }, 502, origin);
      }
      return new Response(JSON.stringify({ text: whisperResult.text || '' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
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
    if (transcript.length > 800) {
      return jsonResponse({ error: 'Transcript too long' }, 413, origin);
    }

    let aiResponse;
    try {
      aiResponse = await env.AI.run(env.AI_MODEL || MODEL_DEFAULT, {
        messages: [{ role: 'user', content: buildPrompt(transcript) }],
      });
    } catch (err) {
      return jsonResponse(
        { error: 'Workers AI call failed', message: String(err) },
        502,
        origin
      );
    }

    // Workers AI text-generation shape: { response: "..." } for most models;
    // newer models may also include tool_calls etc. We only need the text.
    const text =
      (aiResponse && (aiResponse.response || aiResponse.result || aiResponse.output_text)) || '';

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
