/**
 * Live integration check for every external provider (needs network; uses keys from .env).
 * Usage: node scripts/check-providers.js "Neural network"
 * Prints a short PASS/FAIL line per provider — never prints keys.
 */
require('dotenv').config();
const topic = process.argv[2] || 'Neural network';
const wikidata = require('../src/services/providers/wikidata.provider');
const wikipedia = require('../src/services/providers/wikipedia.provider');
const scholarly = require('../src/services/providers/scholarly.provider');
const media = require('../src/services/providers/media.provider');
const gemini = require('../src/services/ai/gemini.client');

const check = async (name, fn, describe) => {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`PASS ${name.padEnd(18)} ${String(Date.now() - t).padStart(5)}ms  ${describe(r)}`);
    return r;
  } catch (e) {
    console.log(`FAIL ${name.padEnd(18)} ${String(Date.now() - t).padStart(5)}ms  ${e.message.slice(0, 160)}`);
    return null;
  }
};

(async () => {
  console.log(`Topic: "${topic}"\n`);
  const ent = await check('wikidata.resolve', () => wikidata.resolve(topic), (r) => `${r?.id} — ${r?.description}`);
  if (ent) await check('wikidata.details', () => wikidata.details(ent.id), (r) => `${r.statements.length} statements, ${r.children.length} inbound; facts: ${wikidata.facts(r).slice(0, 3).map((f) => `${f.label}=${f.values[0]}`).join('; ')}`);
  const title = await check('wikipedia.title', () => wikipedia.resolveTitle(topic), (r) => r);
  if (title) {
    await check('wikipedia.summary', () => wikipedia.summary(title), (r) => `${r?.extract.slice(0, 70)}… image=${!!r?.image}`);
    await check('wikipedia.related', () => wikipedia.related(title, 8), (r) => r.map((x) => x.label).slice(0, 4).join(', '));
  }
  await check('openalex.works', () => scholarly.openalexWorks(topic, 3), (r) => r.map((w) => `${w.title.slice(0, 40)} (${w.year})`).join(' | '));
  await check('openalex.topics', () => scholarly.openalexTopics(topic, 3), (r) => r.map((t) => `${t.label} [${t.domain}]`).join(' | '));
  await check('crossref.works', () => scholarly.crossrefWorks(topic, 3), (r) => r.map((w) => w.doi).join(', '));
  await check('youtube.search', () => media.youtube(topic, 3), (r) => (r ? r.map((v) => v.title.slice(0, 40)).join(' | ') : 'no key'));
  await check('commons.search', () => media.commonsSearch(topic, 4), (r) => r.map((i) => `${i.title.slice(0, 30)} [${i.license}]`).join(' | '));
  await check('openverse.search', () => media.openverse(topic, 3), (r) => `${r.length} images`);
  await check('gemini.json', () => gemini.generateJSON({ prompt: 'Return {"ok": true, "word": "graph"} as JSON.', maxTokens: 200 }), (r) => `${JSON.stringify(r.data)} via ${r.model}`);
})();
