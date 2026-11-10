const { z } = require('zod');
const gemini = require('./ai/gemini.client');
const { retrieve } = require('./knowledgeRetrieval.service');
const wikipedia = require('./providers/wikipedia.provider');
const graphRepo = require('../repositories/graph.repository');
const graphService = require('./graph.service');
const userRepo = require('../repositories/user.repository');
const { track } = require('./activity.service');
const { ACTIVITY_TYPES } = require('../constants/activityTypes');
const { safely } = require('../utils/http');
const { makeNode, makeEdge, validateGraph, topicKey, cleanLabel, cleanText, hasPair, conceptId } = require('./graph/contract');
const { modeIdForCategory } = require('../constants/categories');

/**
 * Knowledge-graph generation — SOURCES FIRST, AI SECOND.
 *
 * Phase 1 · base (no LLM on the critical path)
 *   retrieve (Wikidata / Wikipedia / OpenAlex) → deterministic graph from the
 *   retrieved records → validate → save → return. Typically 1–4 s.
 *
 * Phase 2 · enrich (asynchronous, optional)
 *   Gemini sees the base graph + the spare candidates and proposes ADDITIONS
 *   only: extra retrieved concepts with a placement, a few missing concepts,
 *   cross-links, and relationship notes. Nothing already on screen moves or
 *   changes provenance. Provenance of every new link is decided here from the
 *   retrieved evidence, never taken from the model.
 *
 * Provenance tiers: verified (Wikidata statement) · search_related (Wikipedia
 * similarity) · ai_suggested (model proposal) · user_added.
 */
const MAX_PRIMARY = 8;
const MAX_ADD = 6;
const MAX_SUGGESTED = 4;

/* ───────────────────────── Phase 1 · deterministic base ───────────────────────── */

const nodeFor = (c, depth, parent, cat) => makeNode({
  label: c.label, description: c.description, depth, parent, category: cat,
  sources: c.sources, provenance: 'verified', url: c.sources[0]?.url || null, source: c.origin, wikidataId: c.wikidataId,
});

/** Edge whose provenance comes from retrieved evidence (or ai_suggested when there is none). */
const evidencedEdge = (bundle, from, to, aiRelationship, type = 'subtopic') => {
  const evidence = bundle.retrievedPairs.get(`${from}|${to}`) || bundle.retrievedPairs.get(`${to}|${from}`);
  if (!evidence) return makeEdge({ source: from, target: to, type, relationship: aiRelationship || 'related to', provenance: 'ai_suggested' });
  return makeEdge({
    source: from, target: to, type, relationship: evidence.relationship,
    description: aiRelationship && aiRelationship !== evidence.relationship ? `AI note: ${aiRelationship}` : '',
    provenance: evidence.provenance || 'verified', sources: evidence.sources,
  });
};

/** Root + up to 8 primaries, Wikidata-verified relations first. */
const assembleBase = (bundle) => {
  const cat = bundle.category;
  const root = makeNode({
    id: 'root', label: bundle.title, description: bundle.summary || bundle.description, depth: 0, category: cat,
    sources: bundle.rootSources, provenance: 'verified', url: bundle.url, source: 'wikipedia', wikidataId: bundle.wikidataId,
  });
  root.metadata.expanded = true;
  const nodes = [root];
  const edges = [];
  const ranked = [...bundle.candidates]
    .map((c) => {
      const ev = bundle.retrievedPairs.get(`root|c:${c.key}`);
      return { c, score: (ev?.provenance === 'verified' ? 3 : ev ? 2 : 0) + (c.description ? 1 : 0) + (c.origin === 'openalex' ? -1 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  // Diversity: no more than 5 Wikidata-statement concepts so similar articles also appear
  let wd = 0;
  for (const { c } of ranked) {
    if (nodes.length > MAX_PRIMARY) break;
    if (c.origin === 'wikidata' && wd >= 5) continue;
    if (c.origin === 'wikidata') wd += 1;
    const n = nodeFor(c, 1, 'root', cat);
    nodes.push(n);
    edges.push(evidencedEdge(bundle, 'root', n.id, ''));
  }
  return { nodes, edges };
};

/** Second tier: Wikipedia neighbours of the first primaries ("related by search"). */
const addSecondTier = async (graph, onStage) => {
  const primaries = graph.nodes.filter((n) => n.depth === 1).slice(0, 5);
  onStage?.('branches', `Branching out from ${primaries.length} primary concepts`);
  const lists = await Promise.all(primaries.map((p) => safely(wikipedia.related(p.label, 6), [], 'wikipedia related')));
  const ids = new Set(graph.nodes.map((n) => n.id));
  // The root's id is 'root', so also reserve its concept id — otherwise a neighbour
  // article with the topic's own title would appear as a duplicate node.
  const root = graph.nodes.find((n) => n.id === 'root');
  const rootKey = root ? conceptId(root.label) : null;
  if (rootKey) ids.add(rootKey);
  primaries.forEach((p, i) => {
    let added = 0;
    for (const r of lists[i]) {
      if (added >= 3) break;
      const n = makeNode({ label: r.label, description: r.description, depth: 2, parent: p.id, category: p.category, sources: [{ provider: 'Wikipedia', title: r.label, url: r.url }], provenance: 'verified', url: r.url, source: 'wikipedia', wikidataId: r.wikidataId });
      if (ids.has(n.id)) {
        // already in the graph → a cross-link is more informative than a duplicate
        const target = n.id === rootKey ? 'root' : n.id;
        if (!hasPair(graph.edges, p.id, target) && target !== p.id) graph.edges.push(makeEdge({ source: p.id, target, type: 'related', relationship: 'related to', provenance: 'search_related', sources: [{ provider: 'Wikipedia search', title: `Similar to ${p.label}`, url: r.url }] }));
        continue;
      }
      ids.add(n.id); added += 1;
      graph.nodes.push(n);
      p.metadata.expanded = true;
      graph.edges.push(makeEdge({ source: p.id, target: n.id, type: 'subtopic', relationship: 'related to', provenance: 'search_related', sources: [{ provider: 'Wikipedia search', title: `Similar to ${p.label}`, url: r.url }] }));
    }
  });
  return validateGraph(graph);
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Phase 1. Returns { graph (saved doc), bundle, reused }.
 * onStage(stage, message) receives real pipeline progress.
 */
const buildBase = async (topic, user, { fresh = false, onStage = () => {} } = {}) => {
  const started = Date.now();
  const key = topicKey(topic);

  if (!fresh) {
    const existing = await graphRepo.model.findOne({ owner: user._id, $or: [{ topicKey: key }, { title: new RegExp(`^${escapeRe(topic)}$`, 'i') }] }).sort({ updatedAt: -1 });
    if (existing) {
      onStage('reuse', `Opening your existing graph “${existing.title}”`);
      await recordSearch(user, existing.title, existing.category, existing._id);
      return { graph: existing, bundle: null, reused: true };
    }
  }

  const bundle = await retrieve(topic, { onStage });
  if (!bundle.candidates.length && !bundle.summary) {
    const err = new Error(`Couldn't find reliable information about “${topic}”. Try a more specific or differently-worded topic.`);
    err.statusCode = 422;
    throw err;
  }

  let graph = validateGraph(assembleBase(bundle));
  graph = await addSecondTier(graph, onStage);
  onStage('save', `Built ${graph.nodes.length} concepts and ${graph.edges.length} links from sources`);

  const doc = await graphService.create({
    title: bundle.title,
    rootTopicTitle: bundle.title,
    category: bundle.category,
    description: cleanText(bundle.summary || bundle.description, 1200),
    nodes: graph.nodes,
    edges: graph.edges,
    generatedBy: 'wikipedia',
    visibility: 'private',
  }, user);
  doc.originalTopic = topic;
  doc.topicKey = key;
  doc.domain = bundle.domain || '';
  doc.theme = modeIdForCategory(bundle.category);
  doc.wikidataId = bundle.wikidataId || '';
  doc.saved = false;
  doc.enrichment = gemini.available() && bundle.candidates.length >= 4 ? 'pending' : 'skipped';
  doc.sources = [...bundle.rootSources, ...bundle.papers.slice(0, 3).filter((p) => p.url).map((p) => ({ provider: p.provider, title: `${p.title}${p.year ? ` (${p.year})` : ''}`, url: p.url }))];
  doc.generation = { phase: 'base', providers: bundle.providers, ms: Date.now() - started, model: null, fallback: true, note: null };
  await doc.save();
  await recordSearch(user, bundle.title, bundle.category, doc._id);
  return { graph: doc, bundle, reused: false };
};

const recordSearch = async (user, title, category, graphId) => {
  await track({ userId: user._id, activityType: ACTIVITY_TYPES.TOPIC_SEARCHED, targetId: String(graphId), targetModel: 'KnowledgeGraph', graphId, topic: title, category, metadata: { title } });
  await userRepo.bumpStat(user._id, 'topicsExplored', 1);
};

/* ───────────────────────── Phase 2 · AI enrichment ───────────────────────── */

const EnrichSchema = z.object({
  description: z.string().max(1200).optional().default(''),
  domain: z.string().max(80).optional().default(''),
  addCandidates: z.array(z.object({ ref: z.string(), parent: z.string(), relationship: z.string().max(80).optional().default('') })).max(12).optional().default([]),
  suggested: z.array(z.object({ parent: z.string(), label: z.string().min(2).max(90), description: z.string().max(400).optional().default(''), relationship: z.string().max(80).optional().default('') })).max(8).optional().default([]),
  crossLinks: z.array(z.object({ a: z.string(), b: z.string(), relationship: z.string().max(80).optional().default('') })).max(16).optional().default([]),
  notes: z.array(z.object({ node: z.string(), relationship: z.string().max(80) })).max(16).optional().default([]),
});

const ENRICH_SYSTEM = `You are the knowledge-graph architect of Tiresias, an educational knowledge explorer.
A graph has already been built from Wikidata and Wikipedia. You only propose ADDITIONS:
- "addCandidates": spare retrieved candidates (k ids) worth adding, each placed under an existing node (g ids or "root").
- "suggested": at most ${MAX_SUGGESTED} essential concepts that are genuinely missing; keep descriptions neutral and short.
- "crossLinks": meaningful links between existing nodes in different branches.
- "notes": a short, more specific relationship phrase for how an existing primary (g id) relates to the topic.
Never invent facts, citations, URLs, dates or statistics. Relationships are short lowercase verb phrases. Output strictly the JSON schema requested.`;

const enrichPrompt = (graphDoc, bundle, gRefs, kRefs) => `TOPIC: ${graphDoc.title}
CATEGORY: ${graphDoc.category}${graphDoc.domain ? ` / ${graphDoc.domain}` : ''}
SUMMARY (retrieved): ${(bundle?.summary || graphDoc.description || '').slice(0, 700) || '—'}

CURRENT GRAPH (id | label | parent):
root | ${graphDoc.title} | —
${[...gRefs].filter(([g]) => g !== 'root').map(([g, n]) => `${g} | ${n.label} | ${n.metadata?.parent === 'root' ? 'root' : (graphDoc.nodes.find((x) => x.id === n.metadata?.parent)?.label || 'root')}`).join('\n')}

SPARE RETRIEVED CANDIDATES (id | label | description):
${[...kRefs].map(([k, c]) => `${k} | ${c.label} | ${c.description.slice(0, 140) || '—'}`).join('\n') || '—'}

Return {"description":"2–3 neutral sentences introducing the topic","domain":"short field name","addCandidates":[{"ref":"k1","parent":"g2","relationship":""}],"suggested":[{"parent":"root","label":"","description":"","relationship":""}],"crossLinks":[{"a":"g2","b":"g5","relationship":""}],"notes":[{"node":"g1","relationship":""}]}
Limits: addCandidates ≤ ${MAX_ADD}, suggested ≤ ${MAX_SUGGESTED}, crossLinks ≤ 8.`;

/**
 * Phase 2. Mutates + saves the graph; returns the additions so the client can merge them.
 * Never throws — on failure the graph is marked enrichment:'failed' and stays sources-only.
 */
const enrich = async (graphDoc, bundle, { onStage = () => {} } = {}) => {
  if (!gemini.available() || !bundle || bundle.candidates.length < 4) {
    graphDoc.enrichment = 'skipped';
    await graphDoc.save();
    return { nodes: [], edges: [], updates: [], model: null, skipped: true };
  }
  onStage('ai', 'Gemini is reviewing the graph for missing concepts and connections');
  const present = new Set(graphDoc.nodes.flatMap((n) => [n.id, conceptId(n.label)])); // 'root' has no c:<slug> id
  const gRefs = new Map([['root', graphDoc.nodes.find((n) => n.id === 'root')]]);
  graphDoc.nodes.filter((n) => n.id !== 'root').slice(0, 60).forEach((n, i) => gRefs.set(`g${i + 1}`, n));
  const kRefs = new Map();
  bundle.candidates.filter((c) => !present.has(`c:${c.key}`)).slice(0, 30).forEach((c, i) => kRefs.set(`k${i + 1}`, c));

  let plan;
  let model;
  try {
    const res = await gemini.generateJSON({
      system: ENRICH_SYSTEM,
      prompt: enrichPrompt(graphDoc, bundle, gRefs, kRefs),
      validate: (o) => EnrichSchema.parse(o),
      temperature: 0.3,
      maxTokens: 4096,
    });
    plan = res.data;
    model = res.model;
  } catch (err) {
    console.warn(`[enrich] Gemini failed: ${err.message.slice(0, 160)}`);
    graphDoc.enrichment = 'failed';
    graphDoc.generation = { ...(graphDoc.generation || {}), phase: 'base', note: err.quota ? 'AI quota reached — showing sources only.' : 'AI enrichment unavailable — showing sources only.' };
    graphDoc.markModified('generation');
    await graphDoc.save();
    return { nodes: [], edges: [], updates: [], model: null, failed: true, note: graphDoc.generation.note };
  }

  const nodes = [];
  const edges = [];
  const updates = [];
  const allEdges = () => graphDoc.edges.concat(edges);
  const idOf = (ref) => (ref === 'root' ? 'root' : gRefs.get(ref)?.id);
  const cat = graphDoc.category;

  for (const a of plan.addCandidates.slice(0, MAX_ADD)) {
    const c = kRefs.get(a.ref);
    const parentId = idOf(a.parent);
    if (!c || !parentId) continue;
    const parent = graphDoc.nodes.find((n) => n.id === parentId);
    const n = nodeFor(c, (parent.depth || 0) + 1, parentId, cat);
    if (present.has(n.id)) continue;
    present.add(n.id);
    nodes.push(n);
    // placement under root may be evidenced; deeper placements are the AI's call
    edges.push(parentId === 'root' ? evidencedEdge(bundle, 'root', n.id, a.relationship) : makeEdge({ source: parentId, target: n.id, type: 'subtopic', relationship: a.relationship || 'related to', provenance: 'ai_suggested' }));
  }
  for (const s of plan.suggested.slice(0, MAX_SUGGESTED)) {
    const parentId = idOf(s.parent);
    if (!parentId) continue;
    const parent = graphDoc.nodes.find((n) => n.id === parentId) || nodes.find((n) => n.id === parentId);
    const n = makeNode({ label: cleanLabel(s.label), description: cleanText(s.description, 400), depth: (parent?.depth || 0) + 1, parent: parentId, category: cat, sources: [], provenance: 'ai_suggested', source: 'ai' });
    if (present.has(n.id) || present.has(conceptId(n.label))) continue;
    present.add(n.id);
    nodes.push(n);
    edges.push(makeEdge({ source: parentId, target: n.id, type: 'subtopic', relationship: s.relationship || 'related to', provenance: 'ai_suggested' }));
  }
  for (const l of plan.crossLinks.slice(0, 8)) {
    const a = idOf(l.a);
    const b = idOf(l.b);
    if (!a || !b || a === b || hasPair(allEdges(), a, b)) continue;
    edges.push(evidencedEdge(bundle, a, b, l.relationship, 'related'));
  }
  for (const note of plan.notes) {
    const nodeId = idOf(note.node);
    const edge = graphDoc.edges.find((e) => e.source === 'root' && e.target === nodeId);
    if (!edge || !note.relationship) continue;
    if (edge.provenance === 'ai_suggested') edge.relationship = note.relationship;
    else if (note.relationship !== edge.relationship) edge.description = `AI note: ${note.relationship}`;
    updates.push({ id: edge.id, relationship: edge.relationship, description: edge.description });
  }

  for (const n of nodes) {
    const p = graphDoc.nodes.find((x) => x.id === n.metadata.parent);
    if (p) p.metadata = { ...p.metadata, expanded: true };
  }
  graphDoc.nodes.push(...nodes);
  graphDoc.edges.push(...edges);
  if (plan.description) graphDoc.description = cleanText(plan.description, 1200);
  if (plan.domain) graphDoc.domain = plan.domain;
  graphDoc.enrichment = 'done';
  graphDoc.generatedBy = 'ai';
  graphDoc.generation = { ...(graphDoc.generation || {}), phase: 'enriched', model, fallback: false, providers: [...new Set([...(graphDoc.generation?.providers || []), 'Gemini'])] };
  graphDoc.markModified('nodes');
  graphDoc.markModified('edges');
  graphDoc.markModified('generation');
  await graphDoc.save();
  onStage('ai-done', `Gemini added ${nodes.length} concepts and ${edges.length} links`);
  return { nodes, edges, updates, model, description: graphDoc.description, parentsExpanded: [...new Set(nodes.map((n) => n.metadata.parent))] };
};

/** Phase 2 for a graph id (used by the background job + the non-streaming endpoint). */
const enrichById = async (graphId, user, bundle) => {
  const doc = await graphRepo.findById(graphId);
  if (!doc || String(doc.owner) !== String(user._id)) return null;
  return enrich(doc, bundle);
};

/**
 * Non-streaming API (legacy clients, seed script): base, then enrichment inline.
 * Returns { graph, reused, generation }.
 */
const generate = async (topic, user, { fresh = false, enrichNow = true } = {}) => {
  const { graph, bundle, reused } = await buildBase(topic, user, { fresh });
  if (reused || !enrichNow || graph.enrichment !== 'pending') return { graph, reused, generation: graph.generation };
  await enrich(graph, bundle);
  return { graph, reused, generation: graph.generation };
};

/**
 * Sources-only preview for anonymous trials and the landing showcase:
 * no database writes, no LLM (zero AI cost), cached 7 days per topic.
 */
const preview = (topic) => require('../utils/cache').cached('preview', 'graph', topic, async () => {
  const bundle = await retrieve(topic);
  if (!bundle.candidates.length && !bundle.summary) return null;
  const graph = await addSecondTier(validateGraph(assembleBase(bundle)));
  return {
    title: bundle.title, category: bundle.category, description: cleanText(bundle.summary || bundle.description, 1200),
    nodes: graph.nodes, edges: graph.edges, sources: bundle.rootSources, wikidataId: bundle.wikidataId,
    generation: { phase: 'preview', providers: bundle.providers, model: null },
  };
}, { cacheEmpty: false }).then((r) => r.value);

module.exports = { buildBase, enrich, enrichById, generate, assembleBase, preview };
