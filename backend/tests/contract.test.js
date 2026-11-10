/**
 * Contract tests against the REAL external APIs (network required).
 * Skipped unless LIVE=1 — they catch upstream response-shape changes that the
 * mocked suite cannot. Run: npm run test:contract
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const LIVE = process.env.LIVE === '1';
require('dotenv').config();

describe('provider contracts (live)', { skip: !LIVE && 'set LIVE=1 to run against real APIs' }, () => {
  const wikidata = require('../src/services/providers/wikidata.provider');
  const wikipedia = require('../src/services/providers/wikipedia.provider');
  const scholarly = require('../src/services/providers/scholarly.provider');
  const media = require('../src/services/providers/media.provider');

  test('Wikidata: search → entity with statements, labels and inbound links', async () => {
    const hit = await wikidata.resolve('Black hole');
    assert.match(hit.id, /^Q\d+$/);
    const d = await wikidata.details(hit.id);
    assert.ok(d.label && Array.isArray(d.statements) && d.statements.length > 0);
    assert.ok(d.statements.every((s) => s.property && s.propertyLabel && s.value !== undefined));
    assert.ok(Array.isArray(d.children));
  });

  test('Wikipedia: summary has extract, url and wikidata id; morelike returns related articles', async () => {
    const s = await wikipedia.summary('Black hole');
    assert.ok(s.extract.length > 50 && s.url.startsWith('https://') && /^Q\d+$/.test(s.wikidataId));
    const rel = await wikipedia.related('Black hole', 5);
    assert.ok(rel.length >= 3 && rel.every((r) => r.label && r.url.startsWith('https://en.wikipedia.org/')));
  });

  test('OpenAlex + Crossref: works carry title and a resolvable link', async () => {
    const works = await scholarly.research('black hole', 4);
    assert.ok(works.length > 0);
    assert.ok(works.every((w) => w.title && (w.url || w.doi)));
  });

  test('Wikimedia Commons: images with https thumbnails and licence metadata', async () => {
    const imgs = await media.commonsSearch('black hole', 3);
    assert.ok(imgs.length > 0);
    // Commons serves thumbnails from upload.wikimedia.org or (since 2026) thumb.wikimedia.org
    assert.ok(imgs.every((i) => /^https:\/\/[a-z]+\.wikimedia\.org\//.test(i.thumbnail) && 'license' in i && i.sourceUrl));
  });
});
