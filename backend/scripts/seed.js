/**
 * Seed script — `npm run seed` creates a demo account (+ optional admin) and a
 * few showcase graphs built by the real pipeline. Safe to re-run: it only
 * removes the accounts it creates (matched by email) and their data.
 *
 * Credentials are NEVER hard-coded. Provide them via environment variables;
 * if a password is missing a random one is generated and printed once.
 *
 *   SEED_DEMO_EMAIL      (default demo@tiresias.local)
 *   SEED_DEMO_PASSWORD   (default: random)
 *   SEED_ADMIN_EMAIL     (optional — only created when set)
 *   SEED_ADMIN_PASSWORD  (default: random)
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');
const KnowledgeGraph = require('../src/models/KnowledgeGraph');
const UserActivity = require('../src/models/UserActivity');
const generation = require('../src/services/graphGeneration.service');

const randomPassword = () => `${crypto.randomBytes(9).toString('base64url')}A1!`;

const upsertUser = async ({ email, password, name, username, role }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    await KnowledgeGraph.deleteMany({ owner: existing._id });
    await UserActivity.deleteMany({ userId: existing._id });
    await existing.deleteOne();
  }
  return User.create({ name, username, email, password, role });
};

const seed = async () => {
  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    console.error('[seed] no database connection');
    process.exit(1);
  }

  const demoEmail = process.env.SEED_DEMO_EMAIL || 'demo@tiresias.local';
  const demoPassword = process.env.SEED_DEMO_PASSWORD || randomPassword();
  const demo = await upsertUser({ email: demoEmail, password: demoPassword, name: 'Demo Explorer', username: 'demo', role: 'USER' });
  console.log(`[seed] demo user: ${demoEmail}${process.env.SEED_DEMO_PASSWORD ? '' : ` / generated password: ${demoPassword}`}`);

  if (process.env.SEED_ADMIN_EMAIL) {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || randomPassword();
    await upsertUser({ email: process.env.SEED_ADMIN_EMAIL, password: adminPassword, name: 'Admin', username: 'admin', role: 'ADMIN' });
    console.log(`[seed] admin user: ${process.env.SEED_ADMIN_EMAIL}${process.env.SEED_ADMIN_PASSWORD ? '' : ` / generated password: ${adminPassword}`}`);
  }

  // Real pipeline (Wikidata/Wikipedia/OpenAlex, + Gemini enrichment when configured); needs network.
  let made = 0;
  for (const topic of ['Stoicism', 'Black hole', 'Roman Empire']) {
    try {
      const { graph } = await generation.generate(topic, demo, { fresh: true });
      graph.saved = true;
      await graph.save();
      made += 1;
    } catch (e) {
      console.warn(`[seed] could not generate "${topic}": ${e.message}`);
    }
  }
  console.log(`[seed] graphs: ${made}`);
  await mongoose.disconnect();
  console.log('[seed] done');
  process.exit(0);
};

seed().catch((e) => {
  console.error('[seed] failed:', e.message);
  process.exit(1);
});
