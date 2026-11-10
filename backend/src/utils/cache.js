const mongoose = require('mongoose');
const ResourceCache = require('../models/ResourceCache');

/**
 * Two-level cache for provider results:
 *  L1 — small in-process LRU (hot keys, survives DB hiccups)
 *  L2 — MongoDB ResourceCache with TTL index (survives restarts when Mongo is persistent)
 * Concurrent identical requests share one in-flight promise (no duplicate quota spend).
 */
const L1_MAX = 500;
const l1 = new Map();
const inflight = new Map();

const DAY = 24 * 60 * 60 * 1000;
const TTL = {
  videos: 7 * DAY,
  images: 7 * DAY,
  topic: 7 * DAY,
  research: 3 * DAY,
  entity: 14 * DAY,
  related: 7 * DAY,
  summary: 7 * DAY,
  ai: 3 * DAY,
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const makeKey = (type, provider, query) => `${type}:${provider}:${norm(query)}`;

const l1Get = (key) => {
  const hit = l1.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) { l1.delete(key); return undefined; }
  l1.delete(key); l1.set(key, hit); // LRU bump
  return hit.value;
};
const l1Set = (key, value, expiresAt) => {
  l1.set(key, { value, expiresAt });
  if (l1.size > L1_MAX) l1.delete(l1.keys().next().value);
};
const dbReady = () => mongoose.connection.readyState === 1;

/**
 * cached(type, provider, query, loader, { ttl, cacheEmpty })
 * Returns { value, cached }. Empty results are cached for a shorter time.
 */
const cached = async (type, provider, query, loader, { ttl = TTL[type] || DAY, cacheEmpty = true } = {}) => {
  const key = makeKey(type, provider, query);
  const hot = l1Get(key);
  if (hot !== undefined) return { value: hot, cached: true };

  if (dbReady()) {
    const doc = await ResourceCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean().catch(() => null);
    if (doc) { l1Set(key, doc.results, new Date(doc.expiresAt).getTime()); return { value: doc.results, cached: true }; }
  }

  if (inflight.has(key)) return { value: await inflight.get(key), cached: true };
  const p = (async () => {
    const value = await loader();
    const empty = value == null || (Array.isArray(value) && !value.length);
    if (empty && !cacheEmpty) return value;
    const expiresAt = Date.now() + (empty ? Math.min(ttl, 6 * 60 * 60 * 1000) : ttl);
    l1Set(key, value, expiresAt);
    if (dbReady()) {
      await ResourceCache.updateOne(
        { key },
        { $set: { key, query: norm(query), resourceType: type, provider, results: value, expiresAt: new Date(expiresAt) } },
        { upsert: true }
      ).catch(() => {});
    }
    return value;
  })();
  inflight.set(key, p);
  try {
    return { value: await p, cached: false };
  } finally {
    inflight.delete(key);
  }
};

const clearL1 = () => l1.clear();

module.exports = { cached, makeKey, TTL, clearL1 };
