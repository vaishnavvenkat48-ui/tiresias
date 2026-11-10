const mongoose = require('mongoose');
const { CATEGORY_VALUES, CATEGORIES } = require('../constants/categories');

/**
 * KnowledgeGraph — persistent AI-generated (or manual) knowledge graph.
 * Nodes/edges are embedded for fast reads; the standalone Node collection
 * mirrors them for deep queries / expansion tracking.
 * {
 *   title, owner, rootTopic, category, nodes, edges,
 *   generatedBy, createdAt, updatedAt
 * }
 */
/** Where a fact or link came from. Only URLs returned by a provider are stored. */
const sourceSchema = new mongoose.Schema(
  { provider: { type: String, required: true }, title: { type: String, default: '' }, url: { type: String, default: '' } },
  { _id: false }
);
/**
 * verified       — a Wikidata statement / inbound link directly supports the relation
 * search_related — Wikipedia's similarity search returned the pair (weak evidence:
 *                  "these articles are similar", not "this relation is true")
 * ai_suggested   — proposed by Gemini from the retrieved context, unverified
 * user_added     — created or edited by the user
 */
const PROVENANCE = ['verified', 'search_related', 'ai_suggested', 'user_added'];

const embeddedNodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    type: { type: String, default: 'concept' }, // root | concept | subtopic (UI)
    category: { type: String, default: '' },
    parentId: { type: String, default: null },
    depth: { type: Number, default: 0 },
    sources: { type: [sourceSchema], default: [] },
    provenance: { type: String, enum: PROVENANCE, default: 'verified' },
    pinned: { type: Boolean, default: false },
    position: { x: Number, y: Number },
    createdAt: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // UI: { parent, url, source, expanded, wikidataId }
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const embeddedEdgeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    label: { type: String, default: '' },
    type: { type: String, default: 'related' }, // subtopic | related (UI line style)
    relationship: { type: String, default: '' }, // e.g. "part of", "influenced by"
    description: { type: String, default: '' },
    provenance: { type: String, enum: PROVENANCE, default: 'verified' },
    sources: { type: [sourceSchema], default: [] },
  },
  { _id: false }
);

const knowledgeGraphSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rootTopic: { type: mongoose.Schema.Types.ObjectId, default: null }, // legacy (Topic collection removed)
    rootTopicTitle: { type: String, default: '', trim: true },
    // Legacy alias so Phase-1 `topic` field keeps working
    topic: { type: String, default: '', trim: true },
    originalTopic: { type: String, default: '', trim: true }, // what the user typed
    topicKey: { type: String, default: '', index: true }, // normalised, for reuse lookups
    category: { type: String, enum: CATEGORY_VALUES, default: CATEGORIES.GENERAL, index: true },
    domain: { type: String, default: '' }, // finer domain label (e.g. OpenAlex field)
    theme: { type: String, default: '' }, // visual mode id at generation time
    isFavorite: { type: Boolean, default: false, index: true },
    // Explicit library membership. Generated graphs start as unsaved drafts that
    // only appear in recent history; the user chooses what goes in the library.
    saved: { type: Boolean, default: false, index: true },
    // Public read-only share link (/g/:shareId) — absent until the owner shares.
    shareId: { type: String, default: undefined, unique: true, sparse: true },
    enrichment: { type: String, enum: ['none', 'pending', 'done', 'failed', 'skipped'], default: 'none' },
    wikidataId: { type: String, default: '' },
    sources: { type: [sourceSchema], default: [] }, // graph-level sources used for generation
    generation: { type: mongoose.Schema.Types.Mixed, default: {} }, // { model, providers[], fallback, ms }
    description: { type: String, default: '' },
    nodes: { type: [embeddedNodeSchema], default: [] },
    edges: { type: [embeddedEdgeSchema], default: [] },
    /**
     * Persisted interactive layout (frontend graph explorer):
     * { positions: { [nodeId]: {x,y} }, pinned: [nodeId], hidden: [nodeId],
     *   expanded: [nodeId], physics: boolean, strength: number }
     */
    layout: { type: mongoose.Schema.Types.Mixed, default: {} },
    generatedBy: { type: String, enum: ['ai', 'manual', 'wikipedia', 'mock'], default: 'mock' },
    visibility: { type: String, enum: ['private', 'public'], default: 'private' },
    viewCount: { type: Number, default: 0 },
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

knowledgeGraphSchema.index({ owner: 1, createdAt: -1 });
knowledgeGraphSchema.index({ owner: 1, topicKey: 1 });
knowledgeGraphSchema.index({ owner: 1, updatedAt: -1 });
knowledgeGraphSchema.index({ title: 'text', description: 'text' });

// Graph model name history: 'Graph' (Phase-1 stub) -> 'KnowledgeGraph'.
// Register both names to the same collection so old refs keep resolving.
let KnowledgeGraph;
if (mongoose.models.KnowledgeGraph) {
  KnowledgeGraph = mongoose.models.KnowledgeGraph;
} else {
  KnowledgeGraph = mongoose.model('KnowledgeGraph', knowledgeGraphSchema, 'graphs');
  if (!mongoose.models.Graph) mongoose.model('Graph', knowledgeGraphSchema, 'graphs');
}

module.exports = KnowledgeGraph;
module.exports.PROVENANCE = PROVENANCE;
