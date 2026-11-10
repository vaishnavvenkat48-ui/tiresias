const mongoose = require('mongoose');
const GeminiService = require('../services/ai/GeminiService');
const wiki = require('../services/providers/wikipedia.provider');
const resources = require('../services/resources.service');
const KnowledgeGraph = require('../models/KnowledgeGraph');
const UserActivity = require('../models/UserActivity');
const LearningPath = require('../models/LearningPath');
const AIConversation = require('../models/AIConversation');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { safely } = require('../utils/http');
const { track } = require('../services/activity.service');
const { ACTIVITY_TYPES } = require('../constants/activityTypes');
const { NotFoundError, BadRequestError } = require('../utils/ApiError');
const userRepo = require('../repositories/user.repository');

/* ───────────── Context assembly (server-side; never trust client-sent graph data) ───────────── */
const loadOwnGraph = async (user, graphId) => {
  if (!graphId || !mongoose.isValidObjectId(graphId)) return null;
  const g = await KnowledgeGraph.findById(graphId).select('title category owner visibility nodes edges').lean();
  if (!g || (String(g.owner) !== String(user._id) && g.visibility !== 'public')) return null;
  return g;
};

const graphContext = (g) => {
  const byId = Object.fromEntries((g.nodes || []).map((n) => [n.id, n]));
  return {
    id: String(g._id),
    title: g.title,
    category: g.category,
    concepts: (g.nodes || []).slice(0, 150).map((n) => ({ id: n.id, label: n.label, description: (n.description || '').slice(0, 240) })),
    relations: (g.edges || []).slice(0, 200).map((e) => `${byId[e.source]?.label || e.source} —${e.relationship || (e.type === 'related' ? 'related to' : 'includes')}→ ${byId[e.target]?.label || e.target} [${e.provenance || 'verified'}]`),
  };
};

const buildContext = async (user, { graphId, focus, question }) => {
  const ctx = { focus: focus ? String(focus).slice(0, 120) : null };
  const g = await loadOwnGraph(user, graphId);
  if (g) ctx.graph = graphContext(g);
  const [recent, others] = await Promise.all([
    UserActivity.find({ userId: user._id, activityType: 'TOPIC_SEARCHED' }).sort({ timestamp: -1 }).limit(12).select('topic metadata.title').lean(),
    KnowledgeGraph.find({ owner: user._id }).sort({ updatedAt: -1 }).limit(12).select('title').lean(),
  ]);
  ctx.recentTopics = [...new Set(recent.map((r) => r.topic || r.metadata?.title).filter(Boolean))];
  ctx.otherGraphs = others.map((o) => o.title).filter((t) => t !== ctx.graph?.title);

  // If the graph doesn't cover the question, retrieve a reference and label it as such.
  const covered = ctx.graph && GeminiService.matchConcepts(question, ctx.graph.concepts).length > 0;
  if (!covered && question) {
    const term = ctx.focus || question.replace(/^(what|who|why|how|explain|tell me about|describe)\b\s*(is|are|was|were|does|do)?\s*/i, '').replace(/[?.!]+$/, '').slice(0, 100);
    const title = await safely(wiki.resolveTitle(term), null, 'wikipedia title');
    const s = title ? await safely(wiki.summary(title), null, 'wikipedia summary') : null;
    if (s?.extract) { ctx.reference = s.extract.slice(0, 1200); ctx.referenceSource = { title: s.title, url: s.url }; }
  }
  return ctx;
};

const recordAI = async (user, question) => {
  await track({ userId: user._id, activityType: ACTIVITY_TYPES.AI_QUERY, metadata: { question: String(question).slice(0, 200) } });
  await userRepo.bumpStat(user._id, 'aiInteractions', 1);
};

/* ───────────── Chat ───────────── */

/** POST /ai/chat { message, conversationId?, graphId?, focus? } — persisted conversation. */
const chat = asyncHandler(async (req, res) => {
  const message = String(req.body.message || req.body.question || '').trim();
  if (!message) throw new BadRequestError('Message is required.');
  let convo = null;
  if (req.body.conversationId) {
    if (!mongoose.isValidObjectId(req.body.conversationId)) throw new BadRequestError('Invalid conversation id.');
    convo = await AIConversation.findOne({ _id: req.body.conversationId, userId: req.user._id });
    if (!convo) throw new NotFoundError('Conversation not found.');
  }
  const graphId = req.body.graphId || convo?.graphId || null;
  const context = await buildContext(req.user, { graphId, focus: req.body.focus, question: message });
  const history = (convo?.messages || []).map((m) => ({ role: m.role, content: m.content }));
  const result = await GeminiService.answerQuestion(message.slice(0, 2000), context, history);

  if (!convo) {
    convo = new AIConversation({ userId: req.user._id, graphId: context.graph ? graphId : null, title: message.slice(0, 80), context: { graphTitle: context.graph?.title || null } });
  }
  convo.messages.push({ role: 'user', content: message.slice(0, 4000) });
  convo.messages.push({ role: 'assistant', content: result.answer.slice(0, 12000), sources: result.sources, provider: result.provider });
  await convo.save();
  await recordAI(req.user, message);

  sendSuccess(res, {
    message: 'AI answer.',
    data: { conversationId: convo._id, answer: result.answer, sources: result.sources, provider: result.provider, context: { graph: context.graph?.title || null, graphId: context.graph?.id || null, usedReference: !!context.reference } },
  });
});

const listConversations = asyncHandler(async (req, res) => {
  const items = await AIConversation.find({ userId: req.user._id }).sort({ updatedAt: -1 }).limit(30).select('title graphId context updatedAt createdAt').lean();
  sendSuccess(res, { message: 'Conversations.', data: { items } });
});

const getConversation = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new BadRequestError('Invalid conversation id.');
  const convo = await AIConversation.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!convo) throw new NotFoundError('Conversation not found.');
  sendSuccess(res, { message: 'Conversation.', data: convo });
});

const deleteConversation = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new BadRequestError('Invalid conversation id.');
  await AIConversation.deleteOne({ _id: req.params.id, userId: req.user._id });
  sendSuccess(res, { message: 'Conversation deleted.' });
});

/* ───────────── Explain / summarise ───────────── */

/** POST /ai/explain { topic, context?, wikidataId? } */
const explain = asyncHandler(async (req, res) => {
  const topic = String(req.body.topic || req.params.topic || '').trim();
  if (!topic) throw new BadRequestError('Topic is required.');
  const context = String(req.body.context || '').slice(0, 120);
  const card = await safely(resources.topicCard(topic, { context, wikidataId: req.body.wikidataId }), null, 'topic card');
  const result = await GeminiService.generateTopicSummary(topic, { context, facts: card?.facts || [] });
  await recordAI(req.user, `explain: ${topic}`);
  sendSuccess(res, { message: 'Explanation.', data: result });
});

/* ───────────── Recommendations ───────────── */
const recommendations = asyncHandler(async (req, res) => {
  const uid = req.user._id;
  const [recent, graphs] = await Promise.all([
    UserActivity.find({ userId: uid, activityType: 'TOPIC_SEARCHED' }).sort({ timestamp: -1 }).limit(15).select('topic metadata.title').lean(),
    KnowledgeGraph.find({ owner: uid }).sort({ updatedAt: -1 }).limit(10).select('title category nodes.label nodes.depth nodes.metadata.expanded').lean(),
  ]);
  const recentTopics = [...new Set(recent.map((r) => r.topic || r.metadata?.title).filter(Boolean))];
  const categories = [...new Set(graphs.map((g) => g.category))];
  const known = new Set([...recentTopics, ...graphs.map((g) => g.title)].map((t) => t.toLowerCase()));
  const frontier = [...new Set(graphs.flatMap((g) => (g.nodes || []).filter((n) => n.depth >= 1 && !n.metadata?.expanded).map((n) => n.label)))].filter((t) => !known.has(t.toLowerCase()));
  const result = await GeminiService.recommend({ recentTopics, graphTitles: graphs.map((g) => g.title), categories, frontier });
  result.recommendations = result.recommendations.filter((r) => !known.has(r.topic.toLowerCase()));
  sendSuccess(res, { message: 'Recommendations.', data: result });
});

/* ───────────── Learning paths (generation) ───────────── */
const learningPath = asyncHandler(async (req, res) => {
  const topic = String(req.body.topic || '').trim();
  if (!topic) throw new BadRequestError('Topic is required.');
  const level = ['beginner', 'intermediate', 'advanced'].includes(req.body.level) ? req.body.level : 'beginner';
  const graph = await loadOwnGraph(req.user, req.body.graphId);
  const gen = await GeminiService.generateLearningPath(topic, level, { graph });
  const saved = await LearningPath.create({
    userId: req.user._id, owner: req.user._id, title: gen.title, description: gen.description, estimatedDuration: gen.estimatedDuration,
    startingTopic: topic, topic, level, milestones: gen.milestones, steps: gen.milestones, graphId: graph?._id || null,
  });
  await track({ userId: req.user._id, activityType: ACTIVITY_TYPES.LEARNING_PATH_GENERATED, targetId: String(saved._id), topic, metadata: { topic, provider: gen.provider } });
  const out = saved.toObject();
  sendSuccess(res, { statusCode: 201, message: 'Learning path generated.', data: { ...out, stages: out.milestones, provider: gen.provider } });
});

module.exports = { chat, listConversations, getConversation, deleteConversation, explain, recommendations, learningPath };
