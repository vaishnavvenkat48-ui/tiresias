/**
 * Central env access + startup validation.
 * Required in production: JWT_SECRET, JWT_REFRESH_SECRET, MONGO_URI (or MONGODB_URI).
 * Everything provider-related is optional — services degrade gracefully when a key is missing.
 */
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  isProd: (process.env.NODE_ENV || '') === 'production',
  isTest: (process.env.NODE_ENV || '') === 'test',

  // Providers (all optional)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    fallbackModels: list(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-flash-lite-latest'),
  },
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  openalexApiKey: process.env.OPENALEX_API_KEY || '',
  unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || '',
  openverseToken: process.env.OPENVERSE_TOKEN || '',
  crossrefMailto: process.env.CROSSREF_MAILTO || '',
  userAgent: process.env.WIKIMEDIA_USER_AGENT || 'Tiresias/1.0 (educational knowledge explorer; https://github.com/tiresias)',
};
env.geminiApiKey = env.gemini.apiKey; // legacy alias
if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;

const validate = () => {
  const problems = [];
  if (env.isProd) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be set (≥ 32 chars) in production.');
    if (!process.env.JWT_REFRESH_SECRET) problems.push('JWT_REFRESH_SECRET must be set in production.');
    if (!env.mongoUri) problems.push('MONGO_URI (or MONGODB_URI) must be set in production.');
  }
  if (problems.length) {
    problems.forEach((p) => console.error(`[env] ${p}`));
    throw new Error('Invalid environment configuration.');
  }
  if (!env.isTest) {
    if (!process.env.JWT_SECRET) console.warn('[env] JWT_SECRET not set — using insecure dev fallback.');
    const on = (k) => (k ? 'on' : 'off');
    console.log(`[env] providers: gemini=${on(env.gemini.apiKey)} (${env.gemini.model}) youtube=${on(env.youtubeApiKey)} openalexKey=${on(env.openalexApiKey)} unsplash=${on(env.unsplashAccessKey)} · keyless: wikidata, wikipedia, commons, crossref, openverse`);
  }
};

module.exports = env;
module.exports.validate = validate;
