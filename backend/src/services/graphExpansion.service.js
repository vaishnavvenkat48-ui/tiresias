const { z } = require('zod');
const gemini = require('./ai/gemini.client');
const { retrieveForConcept } = require('./knowledgeRetrieval.service');
const graphRepo = require('../repositories/graph.repository');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/ApiError');
const { track } = require('./activity.service');
const { ACTIVITY_TYPES } = require('../constants/activityTypes');
const { makeNode, makeEdge, conceptId, hasPair } = require('./graph/contract');

/**
 * Node expansion — adds new subtopics under one node without touching the
 * rest of the graph (existing ids, positions, pins and layout are preserved).
 * Re-expanding the same node fetches *different* concepts: anything already in
 * the graph is excluded from new nodes and becomes a cross-link instead.
 */
const MAX_NEW = 6;
const MAX_LINKS = 3;
const MAX_NODES = 300;

const PickSchema = z.object({
  picks: z.array(z.object({ ref: z.string(), relationship: z.string().max(80).optional().default('') })).max(10),
  links: z.array(z.object({ ref: z.string(), relationship: z.string().max(80).optional().default('') })).max(6).optional().default([]),
});

const ownerOnly = (graph, user) => {
  if (!graph) throw new NotFoundError('Graph not found.');
  const isOwner = String(graph.owner) === String(user._id);
  if (!isOwner && String(user.role).toUpperCase() !== 'ADMIN') throw new ForbiddenError('Only the owner can expand this graph.');
};

const pathTo = (nodes, id) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = [];
  let cur = byId.get(id);
  while (cur && out.length < 6) { out.unshift(cur.label); cur = byId.get(cur.metadata?.parent || cur.parentId); }
  return out;
};

const expand = async (graphId, nodeId, user) => {
  const graph = await graphRepo.findById(graphId);
  ownerOnly(graph, user);
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new NotFoundError('Node not found in this graph.');
  if (graph.nodes.length >= MAX_NODES) throw new BadRequestError(`This graph already has ${MAX_NODES} concepts — collapse or hide branches first.`);

  // Match existing concepts by label key as well as id ('root' has no c:<slug> id)
  const idByKey = new Map();
  for (const n of graph.nodes) {
    idByKey.set(conceptId(n.label), n.id);
    idByKey.set(conceptId(String(n.label).replace(/\s*\([^)]*\)\s*$/, '')), n.id);
  }
  const existing = new Set([...graph.nodes.map((n) => n.id), ...idByKey.keys()]);
  const { candidates } = await retrieveForConcept(node.label, { wikidataId: node.metadata?.wikidataId, exclude: existing });
  const fresh = candidates.filter((c) => !c.existing);
  const known = candidates.filter((c) => c.existing && `c:${c.key}` !== nodeId);

  // Gemini chooses the most relevant subtopics for THIS node in the context of the graph
  let picks = null;
  let model = null;
  if (gemini.available() && fresh.length > MAX_NEW) {
    try {
      const refs = new Map(fresh.map((c, i) => [`k${i + 1}`, c]));
      const linkRefs = new Map(known.map((c, i) => [`e${i + 1}`, c]));
      const res = await gemini.generateJSON({
        system: 'You expand one node of an educational knowledge graph. Choose only from the given ids. No new facts, no URLs. Output JSON only.',
        prompt: `GRAPH TOPIC: ${graph.title}
PATH TO NODE: ${pathTo(graph.nodes, nodeId).join(' → ')}
NODE: ${node.label} — ${node.description?.slice(0, 200) || ''}

NEW CANDIDATES (id | label | description):
${[...refs].map(([k, c]) => `${k} | ${c.label} | ${c.description.slice(0, 140) || '—'}`).join('\n')}
${linkRefs.size ? `\nCONCEPTS ALREADY IN THE GRAPH that the node may connect to:\n${[...linkRefs].map(([k, c]) => `${k} | ${c.label}`).join('\n')}` : ''}

Pick up to ${MAX_NEW} candidates that are genuine subtopics or closely related concepts of "${node.label}" *as understood within* "${graph.title}" (skip off-topic namesakes). Give each a short relationship phrase from the node's perspective. Optionally list up to ${MAX_LINKS} existing concepts ("links") that "${node.label}" directly relates to.
Return {"picks":[{"ref":"k1","relationship":""}],"links":[{"ref":"e1","relationship":""}]}`,
        validate: (o) => PickSchema.parse(o),
        temperature: 0.2,
        maxTokens: 2048,
      });
      picks = {
        nodes: res.data.picks.map((p) => ({ c: refs.get(p.ref), rel: p.relationship })).filter((p) => p.c),
        links: res.data.links.map((p) => ({ c: linkRefs.get(p.ref), rel: p.relationship })).filter((p) => p.c),
      };
      model = res.model;
    } catch (err) {
      console.warn(`[expand] Gemini pick failed: ${err.message.slice(0, 140)}`);
    }
  }

  const chosen = (picks?.nodes?.length ? picks.nodes : fresh.map((c) => ({ c, rel: '' }))).slice(0, MAX_NEW);
  const linkTargets = (picks?.links?.length ? picks.links : known.map((c) => ({ c, rel: '' }))).slice(0, MAX_LINKS);

  const newNodes = [];
  const newEdges = [];
  for (const { c, rel } of chosen) {
    const n = makeNode({
      label: c.label, description: c.description, depth: (node.depth || 0) + 1, parent: nodeId, category: graph.category,
      sources: c.sources, provenance: 'verified', url: c.sources[0]?.url || null, source: c.origin, wikidataId: c.wikidataId,
    });
    if (existing.has(n.id)) continue;
    existing.add(n.id);
    idByKey.set(n.id, n.id);
    newNodes.push(n);
    // the relation is retrieved (verified) when it came from Wikidata/Wikipedia for this node;
    // an AI-chosen phrasing is kept as a note, never as the verified label
    // Wikidata relations are verified; Wikipedia similarity is only "related by search".
    // An AI-chosen phrasing is kept as a note, never as the verified label.
    newEdges.push(makeEdge({
      source: nodeId, target: n.id, type: 'subtopic', relationship: c.relation || 'related to',
      description: rel && rel !== c.relation ? `AI note: ${rel}` : '', provenance: c.evidence === 'verified' ? 'verified' : 'search_related', sources: c.sources,
    }));
  }
  for (const { c, rel } of linkTargets) {
    const target = idByKey.get(conceptId(c.label));
    if (!target || target === nodeId || hasPair(graph.edges.concat(newEdges), nodeId, target)) continue;
    const provenance = c.evidence === 'verified' ? 'verified' : picks?.links?.length ? 'ai_suggested' : 'search_related';
    newEdges.push(makeEdge({ source: nodeId, target, type: 'related', relationship: c.evidence === 'verified' ? c.relation : rel || 'related to', provenance, sources: provenance === 'ai_suggested' ? [] : c.sources }));
  }

  // Persist: append only; mark the node expanded. Layout/positions untouched.
  node.metadata = { ...(node.metadata || {}), expanded: true };
  graph.nodes.push(...newNodes);
  graph.edges.push(...newEdges);
  graph.markModified('nodes');
  graph.markModified('edges');
  await graph.save();
  await track({
    userId: user._id, activityType: ACTIVITY_TYPES.NODE_EXPANDED, targetId: `${graph._id}:${nodeId}`, targetModel: 'Node',
    graphId: graph._id, nodeId, topic: node.label, category: graph.category, metadata: { added: newNodes.length, model },
  });

  return {
    nodes: newNodes,
    edges: newEdges,
    node: { id: nodeId, metadata: node.metadata },
    updatedAt: graph.updatedAt,
    model,
    exhausted: !newNodes.length && !newEdges.length,
  };
};

module.exports = { expand };
