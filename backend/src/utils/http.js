const env = require('../config/env');

/**
 * Outbound HTTP for provider modules.
 *  - per-request timeout (AbortSignal.timeout)
 *  - descriptive User-Agent (required by Wikimedia's API policy)
 *  - retry with exponential backoff + jitter on network errors / 5xx / 503
 *  - NEVER retries quota/auth failures (429 with quota reason, 401, 403, 400)
 *  - per-provider circuit breaker: after a quota error the provider is
 *    skipped until `cooldownMs` elapses, instead of hammering it
 */
class ProviderError extends Error {
  constructor(provider, message, { status, quota = false, retryable = false } = {}) {
    super(`[${provider}] ${message}`);
    this.provider = provider;
    this.status = status;
    this.quota = quota;
    this.retryable = retryable;
  }
}

const breakers = new Map(); // provider -> openUntil (ms epoch)
const isOpen = (provider) => (breakers.get(provider) || 0) > Date.now();
const trip = (provider, ms) => {
  breakers.set(provider, Date.now() + ms);
  if (!env.isTest) console.warn(`[provider] ${provider} paused for ${Math.round(ms / 60000)} min (quota/rate limit).`);
};
const providerStatus = () => Object.fromEntries([...breakers].map(([p, until]) => [p, until > Date.now() ? new Date(until).toISOString() : 'ok']));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const QUOTA_RE = /quota|RESOURCE_EXHAUSTED|rateLimitExceeded|dailyLimitExceeded/i;

/**
 * @returns parsed JSON (or text when `as: 'text'`)
 */
const request = async (provider, url, {
  method = 'GET', headers = {}, body, timeout = 10000, retries = 2, as = 'json', cooldownMs = 60 * 60 * 1000,
} = {}) => {
  if (isOpen(provider)) throw new ProviderError(provider, 'temporarily disabled after a quota/rate-limit response', { quota: true });
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': env.userAgent, Accept: as === 'json' ? 'application/json' : '*/*', ...headers },
        body,
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const quota = res.status === 429 || (res.status === 403 && QUOTA_RE.test(text)) || QUOTA_RE.test(text.slice(0, 600));
        if (quota) {
          // 429 without a quota marker is a short rate limit; real quota exhaustion pauses longer
          trip(provider, QUOTA_RE.test(text) ? cooldownMs : 60 * 1000);
          throw new ProviderError(provider, `quota or rate limit reached (${res.status})`, { status: res.status, quota: true });
        }
        const retryable = res.status >= 500;
        throw new ProviderError(provider, `HTTP ${res.status} ${text.slice(0, 160).replace(/\s+/g, ' ')}`, { status: res.status, retryable });
      }
      return as === 'json' ? await res.json() : await res.text();
    } catch (err) {
      const retryable = err instanceof ProviderError ? err.retryable : true; // network/timeout errors are retryable
      if (!retryable || attempt >= retries) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError(provider, err.name === 'TimeoutError' ? `timed out after ${timeout}ms` : err.message, { retryable: true });
      }
      attempt += 1;
      await sleep(Math.min(4000, 300 * 2 ** attempt) + Math.random() * 200);
    }
  }
};

/** Run a provider call, returning `fallback` instead of throwing (logs once, no secrets). */
const safely = async (promise, fallback, label) => {
  try {
    return await promise;
  } catch (err) {
    if (!env.isTest) console.warn(`[provider] ${label || 'call'} failed: ${err.message}`);
    return fallback;
  }
};

/** Only accept https URLs on known hosts for media we hand to the browser. */
const MEDIA_HOSTS = [/\.wikimedia\.org$/, /\.wikipedia\.org$/, /(^|\.)openverse\.org$/, /\.staticflickr\.com$/, /\.flickr\.com$/, /images\.unsplash\.com$/, /\.ytimg\.com$/, /^i\.ytimg\.com$/];
const safeMediaUrl = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && MEDIA_HOSTS.some((re) => re.test(url.hostname)) ? url.toString() : null;
  } catch { return null; }
};
const safeLinkUrl = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
};

const resetBreakers = () => breakers.clear(); // tests only

module.exports = { request, safely, ProviderError, isOpen, trip, providerStatus, safeMediaUrl, safeLinkUrl, resetBreakers };
