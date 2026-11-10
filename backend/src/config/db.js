const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

let memoryServer = null;

/**
 * Zero-setup development database: a real `mongod` (downloaded and managed by
 * mongodb-memory-server) storing its files in backend/.data/db, so graphs,
 * history and conversations SURVIVE restarts. Set MONGO_EPHEMERAL=true for a
 * throwaway in-memory instance instead (e.g. demos you want to reset).
 */
const startLocalDB = async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const ephemeral = String(process.env.MONGO_EPHEMERAL || '').toLowerCase() === 'true';
  if (ephemeral) {
    memoryServer = await MongoMemoryServer.create();
  } else {
    // Another process (e.g. the running API server) may already own the embedded
    // instance — share it instead of fighting over the same data directory.
    const port = Number(process.env.LOCAL_DB_PORT) || 27027;
    try {
      await mongoose.connect(`mongodb://127.0.0.1:${port}/tiresias`, { serverSelectionTimeoutMS: 1200 });
      console.log(`[db] Connected to the already-running embedded MongoDB on port ${port}.`);
      return mongoose.connection;
    } catch {
      await mongoose.disconnect().catch(() => null);
    }
    const dbPath = path.resolve(process.env.LOCAL_DB_PATH || path.join(__dirname, '..', '..', '.data', 'db'));
    fs.mkdirSync(dbPath, { recursive: true });
    memoryServer = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger', port: Number(process.env.LOCAL_DB_PORT) || 27027 } });
  }
  const uri = memoryServer.getUri('tiresias');
  await mongoose.connect(uri);
  console.log(ephemeral
    ? '[db] Using ephemeral in-memory MongoDB (MONGO_EPHEMERAL=true — data resets on restart).'
    : '[db] Using embedded local MongoDB with on-disk storage (backend/.data/db) — data persists across restarts.');
  const stop = async () => { try { await mongoose.disconnect(); await memoryServer?.stop({ doCleanup: ephemeral }); } catch { /* noop */ } process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return mongoose.connection;
};

/**
 * Connect to MongoDB. Strategy:
 *  1. If MONGO_URI is set, try it (fail fast, 5s timeout).
 *  2. Otherwise — or on failure outside production — fall back to in-memory.
 * Never throws: the server always boots and /api/health reports db status.
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  const isProd = process.env.NODE_ENV === 'production';

  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log(`[db] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
      return mongoose.connection;
    } catch (err) {
      console.error(`[db] Could not reach MONGO_URI (${err.message})`);
      if (isProd) return null;
      console.warn('[db] Falling back to the embedded local MongoDB for development…');
    }
  } else {
    console.warn('[db] MONGO_URI not set.');
    if (isProd) return null;
  }

  try {
    return await startLocalDB();
  } catch (err) {
    console.error(`[db] In-memory fallback failed: ${err.message}`);
    console.warn('[db] Server continues without DB. Protected routes return 503 until a database is available.');
    return null;
  }
};

const stopMemoryDB = async () => {
  if (memoryServer) {
    await mongoose.disconnect();
    await memoryServer.stop();
    memoryServer = null;
  }
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.stopMemoryDB = stopMemoryDB;
