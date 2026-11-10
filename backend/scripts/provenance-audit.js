/**
 * Provenance audit — does "verified" actually mean verified?
 *
 * For each benchmark topic, builds the sources-only graph (no DB, no AI), then
 * independently re-asks Wikidata (SPARQL ASK) whether a direct statement links
 * the two entities of every edge labelled `verified`. Also tallies the tiers
 * and writes a human spot-check sheet of `search_related` links.
 *
 * Usage: node scripts/provenance-audit.js [--topics "A,B,C"] [--out ../docs/provenance-audit.md]
 * Needs network. Uses cached provider responses when available.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { request } = require('../src/utils/http');
const generation = require('../src/services/graphGeneration.service');

const DEFAULT_TOPICS = [
  'Black hole', 'Photosynthesis', 'Machine learning', 'Roman Empire', 'Stoicism', 'Norse mythology',
  'Behavioral economics', 'Renaissance', 'DNA', 'Plate tectonics', 'Quantum mechanics', 'French Revolution',
  'Existentialism', 'Blockchain', 'Impressionism', 'Climate change', 'Greek mythology', 'Supply and demand',
  'Neural network', 'Byzantine Empire',
];
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const topics = arg('--topics') ? arg('--topics').split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_TOPICS;
const out = path.resolve(__dirname, arg('--out') || '../../docs/provenance-audit.md');

const ask = async (a, b) => {
  const q = `ASK { { wd:${a} ?p wd:${b} } UNION { wd:${b} ?p wd:${a} } }`;
  const r = await request('wikidata', `https://query.wikidata.org/sparql?${new URLSearchParams({ query: q, format: 'json' })}`, { timeout: 15000, headers: { Accept: 'application/sparql-results+json' } });
  return !!r.boolean;
};

(async () => {
  const rows = [];
  const spot = [];
  let verified = 0; let confirmed = 0; let unknown = 0; let searchRel = 0; let ai = 0;
  for (const topic of topics) {
    const g = await generation.preview(topic).catch((e) => { console.warn(`  ${topic}: ${e.message}`); return null; });
    if (!g) { rows.push({ topic, nodes: 0 }); continue; }
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const qid = (id) => (id === 'root' ? g.wikidataId : byId.get(id)?.metadata?.wikidataId);
    let v = 0; let ok = 0; let unk = 0; let sr = 0;
    for (const e of g.edges) {
      if (e.provenance === 'search_related') { sr += 1; if (spot.length < 60 && Math.random() < 0.35) spot.push({ topic, a: byId.get(e.source)?.label, b: byId.get(e.target)?.label }); continue; }
      if (e.provenance === 'ai_suggested') { ai += 1; continue; }
      v += 1;
      const a = qid(e.source); const b = qid(e.target);
      if (!a || !b) { unk += 1; continue; }
      // eslint-disable-next-line no-await-in-loop
      if (await ask(a, b).catch(() => false)) ok += 1;
    }
    verified += v; confirmed += ok; unknown += unk; searchRel += sr;
    rows.push({ topic, nodes: g.nodes.length, verified: v, confirmed: ok, unknown: unk, searchRelated: sr });
    console.log(`  ${topic.padEnd(22)} nodes ${String(g.nodes.length).padStart(3)} · verified ${v} (confirmed ${ok}${unk ? `, ${unk} without QIDs` : ''}) · search-related ${sr}`);
  }
  const checkable = verified - unknown;
  const precision = checkable ? ((confirmed / checkable) * 100).toFixed(1) : 'n/a';
  const md = [
    '# Provenance audit',
    '',
    `Generated ${new Date().toISOString()} · ${topics.length} topics · sources-only graphs (no AI).`,
    '',
    `**Verified-link precision: ${precision}%** — ${confirmed} of ${checkable} "verified" links have a direct Wikidata statement between the two entities (re-checked independently with SPARQL ASK). ${unknown} verified links could not be re-checked because an endpoint has no Wikidata id.`,
    '',
    `Tier totals: verified ${verified} · search-related ${searchRel} · AI-suggested ${ai}.`,
    '',
    '| Topic | Nodes | Verified | Confirmed | No QID | Search-related |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.topic} | ${r.nodes} | ${r.verified ?? '-'} | ${r.confirmed ?? '-'} | ${r.unknown ?? '-'} | ${r.searchRelated ?? '-'} |`),
    '',
    '## Human spot-check: "related by search" links',
    'Mark each as ✅ meaningful / ⚠️ loose / ❌ wrong. These are *not* labelled verified in the UI.',
    '',
    '| Topic | From | To | Verdict |',
    '|---|---|---|---|',
    ...spot.map((s) => `| ${s.topic} | ${s.a} | ${s.b} |  |`),
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md);
  console.log(`\nVerified-link precision: ${precision}% (${confirmed}/${checkable}) · report → ${path.relative(process.cwd(), out)}`);
  process.exit(0);
})();
