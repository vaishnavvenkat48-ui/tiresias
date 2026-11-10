const env = require('../../config/env');
const { request, ProviderError, isOpen, trip } = require('../../utils/http');

/**
 * Gemini REST client.
 *  - Model chain: GEMINI_MODEL, then GEMINI_FALLBACK_MODELS. A model that is
 *    overloaded (503/500), retired (404) or rate-limited is skipped for the next.
 *  - Quota exhaustion trips a per-model breaker (see utils/http) — no hammering.
 *  - JSON mode via responseMimeType; malformed JSON gets one corrective retry.
 *  - Raw model output never leaves this module except as parsed, validated data.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const available = () => !!env.gemini.apiKey;
const models = () => [env.gemini.model, ...env.gemini.fallbackModels].filter((m, i, a) => m && a.indexOf(m) === i);

const textOf = (data) => (data?.candidates?.[0]?.content?.parts || [])
  .filter((p) => typeof p.text === 'string' && !p.thought)
  .map((p) => p.text)
  .join('')
  .trim();

const callModel = async (model, { contents, system, json, temperature, maxTokens, timeout }) => {
  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  const data = await request(`gemini:${model}`, `${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.gemini.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    timeout,
    retries: 0, // the model chain is the retry: an overloaded model is skipped for the next one
    cooldownMs: 30 * 60 * 1000,
  });
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new ProviderError('gemini', `prompt blocked (${block})`);
  const text = textOf(data);
  if (!text) throw new ProviderError('gemini', `empty response (${data?.candidates?.[0]?.finishReason || 'unknown'})`, { retryable: true });
  return text;
};

const HEDGE_MS = Number(process.env.GEMINI_HEDGE_MS) || 9000;

/**
 * Run the model chain with *hedging*: start the preferred model; if it hasn't
 * answered within HEDGE_MS (overloaded models often hang instead of failing),
 * start the next model in parallel and take whichever answers first. Hard
 * failures (503/404/timeout/quota) advance the chain immediately.
 */
/** Global daily spend cap across all users (GEMINI_DAILY_CALL_CAP). */
const withinCap = async () => {
  const quota = require('../quota.service');
  const q = await quota.consume('gemini', 'global').catch(() => ({ ok: true }));
  return q.ok;
};

const generate = async (opts) => {
  if (!available()) throw new ProviderError('gemini', 'GEMINI_API_KEY not configured');
  if (!(await withinCap())) throw new ProviderError('gemini', 'daily Gemini call cap reached', { quota: true });
  return runChain(opts);
};

const runChain = (opts) => new Promise((resolve, reject) => {
  const chain = models().filter((m) => !isOpen(`gemini:${m}`));
  if (!chain.length) { reject(new ProviderError('gemini', 'all models are temporarily unavailable', { quota: true })); return; }
  let next = 0;
  let pending = 0;
  let settled = false;
  let lastErr = null;

  const finishIfExhausted = () => {
    if (!settled && pending === 0 && next >= chain.length) {
      settled = true;
      reject(lastErr || new ProviderError('gemini', 'all models are temporarily unavailable', { quota: true }));
    }
  };

  const launch = () => {
    if (settled || next >= chain.length) { finishIfExhausted(); return; }
    const i = next++;
    const model = chain[i];
    pending += 1;
    // The last model gets the full budget; earlier ones a shorter leash.
    const timeout = i < chain.length - 1 ? Math.min(opts.timeout, 20000) : opts.timeout;
    const hedge = i < chain.length - 1 ? setTimeout(launch, HEDGE_MS) : null;
    callModel(model, { ...opts, timeout })
      .then((text) => {
        clearTimeout(hedge);
        pending -= 1;
        if (!settled) { settled = true; resolve({ text, model }); }
      })
      .catch((err) => {
        clearTimeout(hedge);
        pending -= 1;
        lastErr = err;
        const advance = err.quota || err.retryable || [404, 500, 503].includes(err.status);
        if (!advance) {
          if (!settled) { settled = true; reject(err); }
          return;
        }
        // Overloaded / hanging models are skipped for a while (quota errors already
        // tripped a longer breaker inside utils/http).
        if (!err.quota) trip(`gemini:${model}`, err.status === 404 ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000);
        if (!env.isTest && !settled) console.warn(`[gemini] ${model} unavailable (${err.status || err.message.slice(0, 60)}), trying next model`);
        // Advance immediately, even if a slower (hedged) request is still pending —
        // a fast failure must not leave us waiting on a hanging model.
        if (next < chain.length) launch();
        else finishIfExhausted();
      });
  };
  launch();
});

const parseJson = (text) => {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new SyntaxError('Model did not return JSON');
};

/**
 * generateJSON({ prompt, system, validate }) → parsed object.
 * `validate(obj)` may throw; a validation/parse failure gets ONE corrective retry.
 */
const generateJSON = async ({ prompt, system, validate = (x) => x, temperature = 0.4, maxTokens = 8192, timeout = 30000 }) => {
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  const first = await generate({ contents, system, json: true, temperature, maxTokens, timeout });
  try {
    return { data: validate(parseJson(first.text)), model: first.model };
  } catch (err) {
    const retryContents = [
      ...contents,
      { role: 'model', parts: [{ text: first.text.slice(0, 6000) }] },
      { role: 'user', parts: [{ text: `That response was invalid (${err.message.slice(0, 200)}). Return ONLY corrected JSON that matches the requested schema.` }] },
    ];
    const second = await generate({ contents: retryContents, system, json: true, temperature: 0.2, maxTokens, timeout });
    return { data: validate(parseJson(second.text)), model: second.model };
  }
};

/** generateText({ prompt | messages, system }) → plain text (chat). */
const generateText = async ({ prompt, messages, system, temperature = 0.6, maxTokens = 2048, timeout = 25000 }) => {
  const contents = messages
    ? messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    : [{ role: 'user', parts: [{ text: prompt }] }];
  const { text, model } = await generate({ contents, system, json: false, temperature, maxTokens, timeout });
  return { text, model };
};

module.exports = { available, generateJSON, generateText, models };
