/**
 * Knowledge sources for graph generation + expansion.
 *
 * Live:    Wikipedia (CirrusSearch `morelike:` for semantically related
 *          articles, with intro extracts) — CORS-enabled, no key needed.
 * Offline: a deterministic sample generator, clearly flagged as `source:'sample'`
 *          so the UI can say so. It is isolated here and can be swapped for
 *          backend AI generation (POST /api/graphs) without touching the UI.
 */
import { makeNode, mergeExpansion } from './model';

const WIKI = 'https://en.wikipedia.org/w/api.php';
const BAD_TITLE = /(disambiguation|^list of|^outline of|^index of|^glossary of|^lists of|\(film\)|\(album\)|\(song\)|\(band\)|\(tv series\))/i;
const wikiUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

const q = async (params, signal) => {
  const url = `${WIKI}?${new URLSearchParams({ format: 'json', origin: '*', formatversion: '2', ...params })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return res.json();
};

const clean = (s = '') => s.replace(/\s+/g, ' ').replace(/\s*\([^)]*listen[^)]*\)/gi, '').trim();

/** Articles most similar to `title`, with short extracts. */
const related = async (title, limit, signal) => {
  const data = await q({
    action: 'query',
    generator: 'search',
    gsrsearch: `morelike:${title}`,
    gsrnamespace: '0',
    gsrlimit: String(limit),
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exsentences: '2',
    exlimit: String(Math.min(limit, 20)),
  }, signal);
  return (data.query?.pages || [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => !BAD_TITLE.test(p.title) && p.title.toLowerCase() !== title.toLowerCase())
    .map((p) => ({ label: p.title, description: clean(p.extract || ''), url: wikiUrl(p.title), source: 'wikipedia' }));
};

const resolveTitle = async (topic, signal) => {
  const s = await q({ action: 'query', list: 'search', srsearch: topic, srlimit: '1', srnamespace: '0' }, signal);
  const hit = s.query?.search?.[0];
  if (!hit) return null;
  const d = await q({ action: 'query', titles: hit.title, prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '3', redirects: '1' }, signal);
  const page = d.query?.pages?.[0];
  return { title: page?.title || hit.title, description: clean(page?.extract || hit.snippet?.replace(/<[^>]+>/g, '') || '') };
};

/**
 * Build an initial graph: root → ~8 primary concepts → ~3 secondary each
 * (for the first 6 primaries). Roughly 25–30 nodes, enough to feel like a web.
 */
export const generateGraph = async (topic, { signal } = {}) => {
  try {
    const root = await resolveTitle(topic, signal);
    if (!root) return { ...sampleGraph(topic), source: 'sample', reason: 'No Wikipedia article matched this topic.' };
    let graph = { nodes: [makeNode({ id: 'root', label: root.title, description: root.description, url: wikiUrl(root.title), depth: 0 })], edges: [] };
    const primary = await related(root.title, 12, signal);
    if (!primary.length) return { ...sampleGraph(topic), source: 'sample', reason: 'Wikipedia returned no related concepts.' };
    graph = mergeExpansion(graph, 'root', primary, { maxNew: 8 }).graph;
    const firstTier = graph.nodes.filter((n) => n.depth === 1).slice(0, 6);
    const second = await Promise.all(firstTier.map((n) => related(n.label, 7, signal).catch(() => [])));
    firstTier.forEach((n, i) => {
      graph = mergeExpansion(graph, n.id, second[i], { maxNew: 3, maxLinks: 1 }).graph;
    });
    return { title: root.title, ...graph, source: 'wikipedia' };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return { ...sampleGraph(topic), source: 'sample', reason: 'Wikipedia is unreachable — showing an offline sample graph.' };
  }
};

/** Fetch related concepts for one node (expansion). */
export const fetchExpansion = async (node, { signal } = {}) => {
  if (node.metadata?.source !== 'sample') {
    try {
      const items = await related(node.label, 10, signal);
      if (items.length) return { items, source: 'wikipedia' };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
    }
  }
  return { items: sampleChildren(node.label, node.depth), source: 'sample' };
};

/* ─────────── Offline sample generator (deterministic) ─────────── */

const FACETS = [
  ['Origins', 'Where {t} begins — the conditions everything else grows from.'],
  ['Key Concepts', 'The essential vocabulary of {t}, distilled.'],
  ['Key Figures', 'The people whose ideas define {t}.'],
  ['Methods', 'How knowledge about {t} is produced and tested.'],
  ['Applications', 'Where {t} shows up in practice.'],
  ['Open Questions', 'What {t} still cannot answer.'],
  ['Criticism', 'Where {t} is weakest — and what critics get right.'],
  ['Related Fields', 'Neighbouring disciplines that illuminate {t}.'],
  ['History', 'The eras and turning points that shaped {t}.'],
  ['Future Directions', 'Where {t} is heading next.'],
];

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};

export const sampleChildren = (label, depth = 0) => {
  const rot = hash(label.toLowerCase()) % FACETS.length;
  const order = [...FACETS.slice(rot), ...FACETS.slice(0, rot)];
  const short = label.split(' · ').pop().slice(0, 40);
  return order.slice(0, depth === 0 ? 8 : 4).map(([f, d]) => ({
    // Primary facets stay short; deeper ones are qualified so IDs stay unique.
    label: depth === 0 ? f : `${short} · ${f}`,
    description: d.replace('{t}', depth === 0 ? label : short),
    url: null,
    source: 'sample',
  }));
};

export const sampleGraph = (topic = 'Knowledge') => {
  const title = (topic || 'Knowledge').trim() || 'Knowledge';
  let graph = { nodes: [makeNode({ id: 'root', label: title, description: `The conceptual centre of ${title}.`, depth: 0, source: 'sample' })], edges: [] };
  graph.nodes[0].metadata.source = 'sample';
  graph = mergeExpansion(graph, 'root', sampleChildren(title, 0), { maxNew: 8 }).graph;
  graph.nodes.filter((n) => n.depth === 1).slice(0, 5).forEach((n) => {
    graph = mergeExpansion(graph, n.id, sampleChildren(n.label, 1).slice(0, 2), { maxNew: 2 }).graph;
  });
  return { title, ...graph };
};
