/**
 * Graph contract shared with the React Flow frontend (frontend/src/graph/model.js).
 * IDs derive from the concept title so the same concept is always the same node:
 * duplicates collapse, and re-expanding a node never clones existing concepts.
 */
const slug = (s = '') =>
  String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

const conceptId = (label) => `c:${slug(label)}`;
const edgeId = (a, b, type) => `e:${type}:${a}>${b}`;
const topicKey = (s = '') => slug(s);

const cleanLabel = (s = '') => String(s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const cleanText = (s = '', max = 600) => String(s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** One-sentence-ish description (never cut mid-word). */
const brief = (s = '', max = 320) => {
  const t = cleanText(s, 2000);
  if (t.length <= max) return t;
  const sentence = t.slice(0, max).match(/^.*[.!?](\s|$)/)?.[0]?.trim();
  return sentence && sentence.length > 60 ? sentence : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`;
};

const makeNode = ({ label, description = '', depth, parent = null, category = '', sources = [], provenance = 'verified', url = null, source = 'wikipedia', wikidataId = null, id }) => ({
  id: id || conceptId(label),
  label: cleanLabel(label),
  title: cleanLabel(label),
  description: brief(description),
  type: depth === 0 ? 'root' : depth === 1 ? 'concept' : 'subtopic',
  category,
  parentId: parent,
  depth,
  sources,
  provenance,
  pinned: false,
  createdAt: new Date(),
  metadata: { parent, url, source, expanded: false, wikidataId },
});

const makeEdge = ({ source, target, type = 'subtopic', relationship = '', description = '', provenance = 'ai_suggested', sources = [] }) => ({
  id: edgeId(source, target, type),
  source,
  target,
  type,
  label: relationship,
  relationship: cleanText(relationship, 80),
  description: cleanText(description, 300),
  provenance,
  sources,
});

/**
 * Structural validation: unique ids, edges reference nodes, no self-loops,
 * no duplicate pairs, every non-root node reachable through its parent.
 * Returns a cleaned copy (never throws on bad edges — drops them).
 */
const validateGraph = ({ nodes, edges }, { maxNodes = 300 } = {}) => {
  const seen = new Set();
  const outNodes = [];
  for (const n of nodes) {
    if (!n?.id || !n.label || seen.has(n.id)) continue;
    seen.add(n.id);
    outNodes.push(n);
    if (outNodes.length >= maxNodes) break;
  }
  const pairs = new Set();
  const outEdges = [];
  for (const e of edges) {
    if (!e || !seen.has(e.source) || !seen.has(e.target) || e.source === e.target) continue;
    const pair = [e.source, e.target].sort().join('|');
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    outEdges.push(e);
  }
  // Parent must exist; otherwise re-home under root so nothing floats unattached.
  for (const n of outNodes) {
    if (n.depth > 0 && (!n.metadata?.parent || !seen.has(n.metadata.parent))) {
      n.metadata = { ...n.metadata, parent: 'root' };
      n.parentId = 'root';
      if (!outEdges.some((e) => e.target === n.id || e.source === n.id)) {
        outEdges.push(makeEdge({ source: 'root', target: n.id, type: 'subtopic', relationship: 'related to', provenance: n.provenance }));
      }
    }
  }
  return { nodes: outNodes, edges: outEdges };
};

const hasPair = (edges, a, b) => edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));

module.exports = { slug, conceptId, edgeId, topicKey, cleanLabel, cleanText, brief, makeNode, makeEdge, validateGraph, hasPair };
