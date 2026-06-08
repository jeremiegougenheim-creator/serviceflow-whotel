// Cloudflare Worker — voice intent classifier for ServiceFlow.
//
// Now powered by Cloudflare Workers AI (Qwen3 30B A3B FP8) via the AI
// binding declared in wrangler.toml. No external API, no API keys, no secret
// management — just a native env.AI.run call. Free tier covers ~10k requests/day.
//
// Browser POSTs { transcript: string }. Worker returns the parsed intent JSON.

const ALLOWED_ORIGIN_DEFAULT = '*';
const MODEL_DEFAULT = '@cf/qwen/qwen3-30b-a3b-fp8';

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
  return `You are a kitchen waste logging assistant for a hotel breakfast operation in Taipei. Staff speak a mix of Mandarin Chinese and English.

Classify the input into exactly one of: WASTE_LOG | QUESTION | CONFIRM | CANCEL | UNCLEAR

A WASTE_LOG contains: a food item name (in any language), optionally a quantity, optionally a reason.
Examples of WASTE_LOG: "炒蛋剩 2 公斤", "Dim sum over-prep 1.5 kg", "congee overcooked", "蒸籠包 3 份沒人拿"

Return ONLY valid JSON — no explanation, no markdown:
{"intent":"WASTE_LOG","item":"...","quantity":null,"unit":null,"reason":null}
or
{"intent":"QUESTION"}
or
{"intent":"CONFIRM"}
or
{"intent":"CANCEL"}
or
{"intent":"UNCLEAR"}

User said: "${transcript}"`;
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
        whisperResult = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
          audio: audioArray,
          no_speech_threshold: 0.5,
          condition_on_previous_text: false,
        });
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
