const mongoose = require('mongoose');

/**
 * Daily usage quotas (per user, per IP, and a global Gemini call cap).
 * Counters live in MongoDB with a TTL so they reset daily and survive restarts;
 * an in-process map is used when the database isn't connected.
 *
 * Limits (env, per UTC day):
 *   QUOTA_GENERATIONS_PER_USER   default 40
 *   QUOTA_EXPANSIONS_PER_USER    default 150
 *   QUOTA_AI_PER_USER            default 80   (chat, explain, recommendations, paths)
 *   QUOTA_TRY_PER_IP             default 3    (anonymous trial graphs)
 *   GEMINI_DAILY_CALL_CAP        default 1500 (all Gemini calls, all users — the spend cap)
 */
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
counterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const UsageCounter = mongoose.models.UsageCounter || mongoose.model('UsageCounter', counterSchema);

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const LIMITS = {
  generate: () => num(process.env.QUOTA_GENERATIONS_PER_USER, 40),
  expand: () => num(process.env.QUOTA_EXPANSIONS_PER_USER, 150),
  ai: () => num(process.env.QUOTA_AI_PER_USER, 80),
  try: () => num(process.env.QUOTA_TRY_PER_IP, 3),
  gemini: () => num(process.env.GEMINI_DAILY_CALL_CAP, 1500),
};

const day = () => new Date().toISOString().slice(0, 10);
const endOfDay = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d; };
const memory = new Map();

/** Atomically increment and return the new count. */
const increment = async (key, by = 1) => {
  const full = `${key}:${day()}`;
  if (mongoose.connection.readyState === 1) {
    const doc = await UsageCounter.findOneAndUpdate(
      { key: full },
      { $inc: { count: by }, $setOnInsert: { expiresAt: new Date(endOfDay().getTime() + 3600e3) } },
      { upsert: true, new: true }
    );
    return doc.count;
  }
  const n = (memory.get(full) || 0) + by;
  memory.set(full, n);
  return n;
};

const peek = async (key) => {
  const full = `${key}:${day()}`;
  if (mongoose.connection.readyState === 1) return (await UsageCounter.findOne({ key: full }).lean())?.count || 0;
  return memory.get(full) || 0;
};

/** Consume one unit; returns { ok, used, limit }. Over-limit calls are rolled back. */
const consume = async (kind, subject) => {
  const limit = LIMITS[kind]();
  const key = `${kind}:${subject}`;
  const used = await increment(key);
  if (used > limit) { await increment(key, -1); return { ok: false, used: limit, limit }; }
  return { ok: true, used, limit };
};

const remaining = async (kind, subject) => Math.max(0, LIMITS[kind]() - (await peek(`${kind}:${subject}`)));

/** Express middleware: per-user daily quota for an action. */
const dailyQuota = (kind, label) => async (req, res, next) => {
  try {
    const subject = req.user?._id ? `u:${req.user._id}` : `ip:${req.ip}`;
    const q = await consume(kind, subject);
    res.set('X-Quota-Remaining', String(Math.max(0, q.limit - q.used)));
    if (!q.ok) {
      return res.status(429).json({ success: false, message: `Daily limit reached: ${q.limit} ${label} per day. It resets at midnight UTC.` });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

const resetMemory = () => memory.clear(); // tests

module.exports = { consume, remaining, dailyQuota, increment, peek, LIMITS, UsageCounter, resetMemory };
