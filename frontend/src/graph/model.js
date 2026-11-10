/**
 * Graph data model (shared contract with backend KnowledgeGraph documents).
 *
 * Node:  { id, label, description, depth, type: 'root'|'concept'|'subtopic',
 *          metadata: { parent, url, source, expanded } }
 * Edge:  { id, source, target, type: 'subtopic'|'related' }
 * Layout:{ positions: {id:{x,y}}, pinned: [id], hidden: [id], physics, strength }
 *
 * IDs are derived from the concept title (`c:<slug>`) so the same concept is
 * the same node no matter how it was reached — expansions de-duplicate and
 * surface cross-links instead of cloning nodes.
 */

export const slug = (s = '') =>
  String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

export const conceptId = (label) => `c:${slug(label)}`;

export const makeNode = ({ id, label, description = '', depth, parent = null, url = null, source = 'wikipedia' }) => ({
  id: id || conceptId(label),
  label,
  description,
  depth,
  type: depth === 0 ? 'root' : depth === 1 ? 'concept' : 'subtopic',
  metadata: { parent, url, source, expanded: false },
});

export const edgeId = (a, b, type) => `e:${type}:${a}>${b}`;

export const hasEdgeBetween = (edges, a, b) => edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));

/**
 * Merge freshly fetched concepts under `parentId`.
 * New titles become children; titles already in the graph become "related"
 * cross-links (capped) — that is how hidden connections appear.
 */
export const mergeExpansion = (graph, parentId, items, { maxNew = 6, maxLinks = 3 } = {}) => {
  const parent = graph.nodes.find((n) => n.id === parentId);
  if (!parent) return { graph, added: [], linked: [] };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes = graph.nodes.map((n) => (n.id === parentId ? { ...n, metadata: { ...n.metadata, expanded: true } } : n));
  const edges = [...graph.edges];
  const added = [];
  const linked = [];
  for (const item of items) {
    const id = conceptId(item.label);
    if (id === parentId) continue;
    if (byId.has(id)) {
      if (linked.length < maxLinks && !hasEdgeBetween(edges, parentId, id)) {
        edges.push({ id: edgeId(parentId, id, 'related'), source: parentId, target: id, type: 'related' });
        linked.push(id);
      }
      continue;
    }
    if (added.length >= maxNew) continue;
    const node = makeNode({ label: item.label, description: item.description, url: item.url, source: item.source, depth: (parent.depth || 0) + 1, parent: parentId });
    nodes.push(node);
    byId.set(id, node);
    edges.push({ id: edgeId(parentId, id, 'subtopic'), source: parentId, target: id, type: 'subtopic' });
    added.push(id);
  }
  return { graph: { ...graph, nodes, edges }, added, linked };
};

/** All nodes whose parent chain leads to `id` (not including `id`). */
export const descendantsOf = (nodes, id) => {
  const kids = new Map();
  for (const n of nodes) {
    const p = n.metadata?.parent;
    if (!p) continue;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(n.id);
  }
  const out = [];
  const stack = [...(kids.get(id) || [])];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    stack.push(...(kids.get(cur) || []));
  }
  return out;
};

export const childrenOf = (nodes, id) => nodes.filter((n) => n.metadata?.parent === id);

/** Shape a graph for the backend (strip UI-only fields, keep the contract). */
export const toPersisted = (graph) => ({
  nodes: graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    title: n.label,
    description: n.description || '',
    type: n.type,
    depth: n.depth,
    metadata: n.metadata || {},
  })),
  edges: graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type || 'related', label: e.type === 'subtopic' ? 'subtopic of' : 'related to' })),
});

/** One server node → UI node (keeps provenance + sources for the inspector). */
export const normalizeNode = (n) => ({
  id: n.id,
  label: n.label || n.title,
  description: n.description || '',
  depth: Number.isFinite(n.depth) ? n.depth : n.id === 'root' ? 0 : 1,
  type: n.type || 'concept',
  provenance: n.provenance || 'verified',
  sources: n.sources || [],
  metadata: { parent: n.parentId ?? null, url: null, source: 'saved', expanded: false, ...(n.metadata || {}) },
});

export const normalizeEdge = (e) => ({
  id: e.id,
  source: e.source,
  target: e.target,
  type: e.type === 'related' || e.type === 'subtopic' ? e.type : 'subtopic',
  relationship: e.relationship || e.label || '',
  description: e.description || '',
  provenance: e.provenance || 'verified',
  sources: e.sources || [],
});

/** Accept backend documents — including older graphs that lack depth/parent. */
export const fromPersisted = (doc) => {
  const nodes = (doc.nodes || []).map(normalizeNode);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (doc.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target)).map(normalizeEdge);
  // Infer missing parents from subtopic edges (older documents)
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const t = byId.get(e.target);
    if (t && !t.metadata.parent && t.depth > 0 && e.type === 'subtopic') t.metadata.parent = e.source;
  }
  return {
    id: doc._id,
    title: doc.title,
    category: doc.category,
    nodes,
    edges,
    layout: { positions: {}, pinned: [], hidden: [], ...(doc.layout || {}) },
    updatedAt: doc.updatedAt,
    generatedBy: doc.generatedBy,
    isFavorite: !!doc.isFavorite,
    generation: doc.generation || null,
    sources: doc.sources || [],
    wikidataId: doc.wikidataId || null,
  };
};

export const emptyLayout = (prefs = {}) => ({ positions: {}, pinned: [], hidden: [], physics: prefs.physics ?? true, strength: prefs.strength ?? 1 });
