/**
 * Warm the cache for the landing-page showcase topics (and any extra topics):
 * sources-only preview graphs + topic cards for every primary concept.
 * Run after deploys so first visitors never wait on a cold pipeline.
 *
 * Usage: node scripts/precache.js [--fresh] ["Extra topic", ...]   (--fresh rebuilds cached previews)
 * Writes to the configured MongoDB (ResourceCache, 7-day TTL).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const generation = require('../src/services/graphGeneration.service');
const resources = require('../src/services/resources.service');
const { SHOWCASE } = require('../src/routes/public.routes');
const ResourceCache = require('../src/models/ResourceCache');

(async () => {
  await connectDB();
  const args = process.argv.slice(2);
  if (args.includes('--fresh')) {
    const { deletedCount } = await ResourceCache.deleteMany({ key: /^preview:/ });
    console.log(`  cleared ${deletedCount} cached previews`);
  }
  const topics = [...SHOWCASE, ...args.filter((a) => a !== '--fresh')];
  for (const topic of topics) {
    const t = Date.now();
    const g = await generation.preview(topic).catch((e) => { console.warn(`  ${topic}: ${e.message}`); return null; });
    if (!g) continue;
    const primaries = g.nodes.filter((n) => n.depth <= 1);
    await Promise.all(primaries.map((n) => resources.topicCard(n.label, { context: n.depth ? g.title : undefined, wikidataId: n.metadata?.wikidataId || undefined }).catch(() => null)));
    console.log(`  ${topic.padEnd(22)} ${g.nodes.length} concepts · ${primaries.length} topic cards · ${Date.now() - t} ms`);
  }
  await mongoose.disconnect();
  process.exit(0);
})();
