const { request } = require('../../utils/http');
const { cached } = require('../../utils/cache');

/**
 * Wikidata — structured knowledge (no key; public API + SPARQL endpoint).
 * Queries are bounded (LIMITs, selected properties only) per the WDQS usage policy.
 */
const API = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';
const P = 'wikidata';

// Properties worth showing / using as graph relations (label, relation verb)
const PROPS = {
  P31: ['instance of', 'is a'],
  P279: ['subclass of', 'is a kind of'],
  P361: ['part of', 'part of'],
  P527: ['has part', 'includes'],
  P1269: ['facet of', 'facet of'],
  P2578: ['studies', 'studies'],
  P2579: ['studied by', 'studied by'],
  P737: ['influenced by', 'influenced by'],
  P138: ['named after', 'named after'],
  P61: ['discoverer or inventor', 'discovered by'],
  P170: ['creator', 'created by'],
  P50: ['author', 'authored by'],
  P571: ['inception', null],
  P575: ['time of discovery', null],
  P580: ['start time', null],
  P582: ['end time', null],
  P17: ['country', 'located in'],
  P495: ['country of origin', 'originates from'],
  P106: ['occupation', null],
  P101: ['field of work', 'works in'],
  P1056: ['product or material produced', 'produces'],
  P366: ['has use', 'used for'],
  P1542: ['has effect', 'causes'],
  P828: ['has cause', 'caused by'],
  P1889: ['different from', null],
  P460: ['said to be the same as', null],
  P18: ['image', null],
};

const entityUrl = (id) => `https://www.wikidata.org/wiki/${id}`;

/** Search entities by name. */
const search = (q, limit = 5) => cached('entity-search', P, `${q}|${limit}`, async () => {
  const params = new URLSearchParams({ action: 'wbsearchentities', search: q, language: 'en', uselang: 'en', type: 'item', limit: String(limit), format: 'json' });
  const data = await request(P, `${API}?${params}`, { timeout: 8000 });
  return (data.search || []).map((s) => ({ id: s.id, label: s.label, description: s.description || '', url: entityUrl(s.id) }));
}).then((r) => r.value);

/** Best entity for a topic (prefers ones with a description). */
const resolve = async (q) => {
  const hits = await search(q, 5);
  return hits.find((h) => h.description && !/disambiguation|wikimedia/i.test(h.description)) || hits[0] || null;
};

const sparql = async (query, timeout = 12000) => {
  const data = await request(P, `${SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, { timeout, headers: { Accept: 'application/sparql-results+json' } });
  return data?.results?.bindings || [];
};

const qid = (uri = '') => uri.split('/').pop();

/**
 * Entity details: label/description + selected statements (with value labels)
 * + inbound "part of / subclass of" children. One bounded SPARQL query each.
 */
const details = (id) => cached('entity', P, id, async () => {
  if (!/^Q\d+$/.test(id)) return null;
  const props = Object.keys(PROPS).map((p) => `wdt:${p}`).join(' ');
  const out = await sparql(`
    SELECT ?prop ?value ?valueLabel ?valueDescription WHERE {
      VALUES ?prop { ${props} }
      wd:${id} ?prop ?value .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 120`);
  const inbound = await sparql(`
    SELECT ?item ?itemLabel ?itemDescription ?rel WHERE {
      VALUES ?rel { wdt:P361 wdt:P279 wdt:P1269 }
      ?item ?rel wd:${id} .
      ?item wikibase:sitelinks ?links .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY DESC(?links) LIMIT 25`).catch(() => []);
  const meta = await request(P, `${API}?${new URLSearchParams({ action: 'wbgetentities', ids: id, props: 'labels|descriptions|aliases|sitelinks/urls', languages: 'en', sitefilter: 'enwiki', format: 'json' })}`, { timeout: 8000 });
  const e = meta.entities?.[id] || {};

  const statements = [];
  for (const b of out) {
    const pid = qid(b.prop.value);
    const isItem = b.value.type === 'uri' && /entity\/Q\d+$/.test(b.value.value);
    const raw = b.valueLabel?.value || b.value.value;
    if (pid !== 'P18' && isItem && /^Q\d+$/.test(raw)) continue; // unlabeled item
    statements.push({
      property: pid,
      propertyLabel: PROPS[pid]?.[0] || pid,
      relation: PROPS[pid]?.[1] || null,
      value: pid === 'P18' ? b.value.value : raw.replace(/T00:00:00Z$/, ''),
      valueId: isItem ? qid(b.value.value) : null,
      valueDescription: b.valueDescription?.value || '',
    });
  }
  return {
    id,
    label: e.labels?.en?.value || id,
    description: e.descriptions?.en?.value || '',
    aliases: (e.aliases?.en || []).slice(0, 6).map((a) => a.value),
    wikipediaUrl: e.sitelinks?.enwiki?.url || null,
    url: entityUrl(id),
    statements,
    children: inbound.map((b) => ({
      id: qid(b.item.value),
      label: b.itemLabel?.value,
      description: b.itemDescription?.value || '',
      relation: qid(b.rel.value) === 'P279' ? 'subclass of' : qid(b.rel.value) === 'P1269' ? 'facet of' : 'part of',
    })).filter((c) => c.label && !/^Q\d+$/.test(c.label)),
  };
}).then((r) => r.value);

/** Human-friendly facts for the topic card (dates, origins, people, classes). */
const facts = (d) => {
  if (!d) return [];
  const grouped = new Map();
  for (const s of d.statements) {
    if (s.property === 'P18') continue;
    const list = grouped.get(s.propertyLabel) || [];
    if (!list.includes(s.value) && list.length < 4) list.push(s.value);
    grouped.set(s.propertyLabel, list);
  }
  return [...grouped].slice(0, 10).map(([label, values]) => ({ label, values }));
};

module.exports = { search, resolve, details, facts, PROPS, entityUrl };
