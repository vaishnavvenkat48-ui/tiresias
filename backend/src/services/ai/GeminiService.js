const { z } = require('zod');
const gemini = require('./gemini.client');
const { classify } = require('../TopicClassificationService');
const wikipedia = require('../providers/wikipedia.provider');
const { safely } = require('../../utils/http');
const { cached } = require('../../utils/cache');
const { brief } = require('../graph/contract');

/**
 * AI features built on gemini.client. Every function grounds the model in
 * retrieved or user data, validates structured output, and has an honest
 * offline fallback (labelled provider: 'offline') when Gemini is unavailable.
 */

/* ───────────── Explain a concept ───────────── */
const ExplainSchema = z.object({
  summary: z.string().min(20).max(1600),
  keyPoints: z.array(z.string().max(300)).min(1).max(6),
  analogy: z.string().max(400).optional().default(''),
  nextConcepts: z.array(z.string().max(90)).max(5).optional().default([]),
});

const generateTopicSummary = async (topic, { context = '', facts = [] } = {}) => {
  const key = `${topic}|${context}`;
  const title = await safely(wikipedia.resolveTitle(context ? `${topic} ${context}` : topic), null, 'wikipedia title');
  const wiki = title ? await safely(wikipedia.summary(title), null, 'wikipedia summary') : null;
  const sources = wiki?.url ? [{ provider: 'Wikipedia', title: wiki.title, url: wiki.url }] : [];

  if (gemini.available()) {
    try {
      const { value } = await cached('ai', 'explain', key, async () => {
        const { data, model } = await gemini.generateJSON({
          system: 'You are Tiresias, a precise and friendly tutor. Ground explanations in the provided reference text; if the reference is thin, stay general and avoid specific numbers, dates or names you are not sure of. Output JSON only.',
          prompt: `Explain "${topic}"${context ? ` in the context of "${context}"` : ''} to a curious learner.
REFERENCE (Wikipedia): ${brief(wiki?.extract || '', 1400) || '—'}
${facts.length ? `FACTS (Wikidata): ${facts.map((f) => `${f.label}: ${f.values.join(', ')}`).join('; ')}` : ''}
Return {"summary":"3-4 sentences","keyPoints":["3-5 short points"],"analogy":"one intuitive analogy","nextConcepts":["2-4 concepts to explore next"]}`,
          validate: (o) => ExplainSchema.parse(o),
          temperature: 0.4,
          maxTokens: 1500,
        });
        return { ...data, model };
      }, { cacheEmpty: false });
      return { title: topic, category: classify(topic, ''), ...value, provider: value.model, sources };
    } catch (err) {
      console.warn(`[ai] explain failed: ${err.message.slice(0, 140)}`);
    }
  }
  const sentences = (wiki?.extract || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  return {
    title: topic,
    category: classify(topic, ''),
    summary: sentences.slice(0, 3).join(' ') || `No reference text was found for “${topic}”.`,
    keyPoints: sentences.slice(3, 6).length ? sentences.slice(3, 6) : facts.slice(0, 3).map((f) => `${f.label}: ${f.values.join(', ')}`),
    analogy: '',
    nextConcepts: [],
    provider: 'offline',
    sources,
  };
};

/* ───────────── Learning paths ───────────── */
const PathSchema = z.object({
  title: z.string().max(140),
  description: z.string().max(600).optional().default(''),
  estimatedDuration: z.string().max(60).optional().default(''),
  stages: z.array(z.object({
    title: z.string().min(2).max(140),
    description: z.string().max(600).optional().default(''),
    concepts: z.array(z.string().max(90)).max(8).optional().default([]),
  })).min(3).max(10),
});

const generateLearningPath = async (topic, level = 'beginner', { graph = null } = {}) => {
  if (gemini.available()) {
    try {
      const concepts = graph ? graph.nodes.slice(0, 60).map((n) => n.label).join('; ') : '';
      const { data, model } = await gemini.generateJSON({
        system: 'You design learning roadmaps for Tiresias. Order stages from prerequisites to mastery. When a concept list is given, build the path from those concepts. No URLs. JSON only.',
        prompt: `Create a ${level} learning path for "${topic}".
${concepts ? `CONCEPTS FROM THE LEARNER'S KNOWLEDGE GRAPH: ${concepts}` : ''}
Return {"title":"","description":"1-2 sentences","estimatedDuration":"e.g. 3 weeks at 4h/week","stages":[{"title":"","description":"what to learn and how to know you've got it","concepts":["concepts from the graph or field"]}]} with 4-7 stages.`,
        validate: (o) => PathSchema.parse(o),
        temperature: 0.4,
        maxTokens: 3000,
      });
      const milestones = data.stages.map((s, i) => ({ title: s.title, description: s.description, resources: [], status: 'pending', order: i + 1, concepts: s.concepts }));
      return { title: data.title || `Learning ${topic}`, description: data.description, estimatedDuration: data.estimatedDuration, startingTopic: topic, level, milestones, provider: model };
    } catch (err) {
      console.warn(`[ai] learning path failed: ${err.message.slice(0, 140)}`);
    }
  }
  // Offline: derive stages from the graph's own structure when available
  const primaries = graph ? graph.nodes.filter((n) => n.depth === 1).slice(0, 6) : [];
  const milestones = primaries.length >= 3
    ? primaries.map((n, i) => ({ title: n.label, description: n.description || '', resources: [], status: 'pending', order: i + 1 }))
    : [
      { title: `Foundations of ${topic}`, description: 'Core vocabulary and mental models.', resources: [], status: 'pending', order: 1 },
      { title: `${topic} in depth`, description: 'Key sub-domains and debates.', resources: [], status: 'pending', order: 2 },
      { title: `Applied ${topic}`, description: 'Case studies and practice.', resources: [], status: 'pending', order: 3 },
      { title: `${topic} mastery`, description: 'Teach it, extend it, critique it.', resources: [], status: 'pending', order: 4 },
    ];
  return { title: `Learning ${topic}`, description: primaries.length ? 'Built from the primary concepts of your graph.' : '', estimatedDuration: '', startingTopic: topic, level, milestones, provider: 'offline' };
};

/* ───────────── Grounded chat ───────────── */
const matchConcepts = (question, concepts = []) => {
  const words = String(question).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  if (!words.length) return [];
  return concepts
    .map((c) => ({ c, score: words.filter((w) => `${c.label} ${c.description}`.toLowerCase().includes(w)).length + words.filter((w) => c.label.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.c);
};

const describeContext = (ctx = {}) => {
  const lines = [];
  if (ctx.graph) {
    lines.push(`SAVED GRAPH "${ctx.graph.title}" (${ctx.graph.category}, ${ctx.graph.concepts.length} concepts).`);
    lines.push(`CONCEPTS: ${ctx.graph.concepts.map((c) => `${c.label}${c.description ? ` — ${c.description.slice(0, 120)}` : ''}`).join(' | ')}`);
    if (ctx.graph.relations?.length) lines.push(`RELATIONS (provenance in brackets): ${ctx.graph.relations.slice(0, 80).join('; ')}`);
  }
  if (ctx.focus) lines.push(`SELECTED NODE: ${ctx.focus}`);
  if (ctx.recentTopics?.length) lines.push(`RECENTLY EXPLORED: ${ctx.recentTopics.join(', ')}`);
  if (ctx.otherGraphs?.length) lines.push(`OTHER SAVED GRAPHS: ${ctx.otherGraphs.join(', ')}`);
  if (ctx.reference) lines.push(`NEWLY RETRIEVED REFERENCE (Wikipedia, not from the user's graph): ${ctx.reference}`);
  return lines.join('\n');
};

const CHAT_SYSTEM = `You are Tiresias, a tutor inside a knowledge-graph app. Use the learner's data below.
- When you rely on concepts from their graph, name them exactly as written.
- If the graph lacks what's needed, say so and clearly label anything you add as "Beyond your graph:".
- Respect provenance: relations marked [ai_suggested] are hypotheses, not verified facts.
- Be concise (≤ 220 words), structured with short paragraphs or bullets, and end with one suggestion of what to explore next.
- Never invent citations or URLs.`;

/**
 * answerQuestion(question, context, history[]) → { answer, sources, provider }
 * sources = graph concepts actually matched + any freshly retrieved reference.
 */
const answerQuestion = async (question, context = {}, history = []) => {
  const conceptSources = (context.graph ? matchConcepts(question, context.graph.concepts) : []).map((c) => ({ type: 'concept', label: c.label, origin: 'graph' }));
  const extraSources = context.referenceSource ? [{ type: 'web', label: context.referenceSource.title, url: context.referenceSource.url, origin: 'retrieved' }] : [];
  if (gemini.available()) {
    try {
      const messages = [
        ...history.slice(-8).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
        { role: 'user', content: `${describeContext(context) || 'No saved graph selected.'}\n\nQUESTION: ${question}` },
      ];
      const { text, model } = await gemini.generateText({ system: CHAT_SYSTEM, messages, temperature: 0.5, maxTokens: 1200 });
      // only cite graph concepts the answer actually mentions
      const mentioned = context.graph ? context.graph.concepts.filter((c) => text.toLowerCase().includes(c.label.toLowerCase())).slice(0, 8).map((c) => ({ type: 'concept', label: c.label, origin: 'graph' })) : [];
      const sources = [...new Map([...mentioned, ...conceptSources].map((s) => [s.label, s])).values()].slice(0, 8);
      return { answer: text, sources: [...sources, ...extraSources], provider: model };
    } catch (err) {
      console.warn(`[ai] chat failed: ${err.message.slice(0, 140)}`);
    }
  }
  const brief1 = (s = '') => s.match(/^.{20,220}?[.!?](\s|$)/)?.[0]?.trim() || (s.length > 180 ? `${s.slice(0, 180).replace(/\s+\S*$/, '')}…` : s);
  const parts = [];
  if (context.graph) {
    const hits = matchConcepts(question, context.graph.concepts);
    parts.push(`From your graph “${context.graph.title}” (${context.graph.concepts.length} concepts):`);
    if (hits.length) parts.push(...hits.map((c) => `• ${c.label}${c.description ? ` — ${brief1(c.description)}` : ''}`));
    else parts.push(`No concept in this graph matches directly. Closest starting points: ${context.graph.concepts.slice(1, 4).map((c) => c.label).join(', ')}.`);
  } else if (context.reference) {
    parts.push(`Beyond your graph (Wikipedia): ${brief1(context.reference)}`);
  } else if (context.recentTopics?.length) {
    parts.push(`You recently explored: ${context.recentTopics.slice(0, 5).join(', ')}. Pick a saved graph to ground answers in it.`);
  } else {
    parts.push('Explore a topic or select a saved graph, and I can answer using it.');
  }
  parts.push('', '(Offline tutor — the AI model is unavailable right now.)');
  return { answer: parts.join('\n'), sources: [...conceptSources, ...extraSources], provider: 'offline' };
};

/* ───────────── Recommendations ───────────── */
const RecSchema = z.object({
  recommendations: z.array(z.object({ topic: z.string().min(2).max(90), reason: z.string().max(300), connectsTo: z.array(z.string().max(90)).max(4).optional().default([]) })).min(1).max(8),
});

const recommend = async ({ recentTopics = [], graphTitles = [], categories = [], frontier = [] }) => {
  if (gemini.available() && (recentTopics.length || graphTitles.length)) {
    try {
      const { data, model } = await gemini.generateJSON({
        system: 'You recommend what a learner should explore next in Tiresias. Prefer topics that bridge their existing interests. No URLs. JSON only.',
        prompt: `RECENT TOPICS: ${recentTopics.join(', ') || '—'}
SAVED GRAPHS: ${graphTitles.join(', ') || '—'}
FAVOURITE CATEGORIES: ${categories.join(', ') || '—'}
UNEXPANDED CONCEPTS IN THEIR GRAPHS: ${frontier.slice(0, 30).join(', ') || '—'}
Recommend 5 topics (not already explored) with a one-sentence reason each and which of their interests each connects to.
Return {"recommendations":[{"topic":"","reason":"","connectsTo":[""]}]}`,
        validate: (o) => RecSchema.parse(o),
        temperature: 0.7,
        maxTokens: 1500,
      });
      return { recommendations: data.recommendations, provider: model };
    } catch (err) {
      console.warn(`[ai] recommend failed: ${err.message.slice(0, 140)}`);
    }
  }
  // Offline: unexpanded frontier concepts are genuine next steps from the user's own graphs
  return {
    recommendations: frontier.slice(0, 5).map((t) => ({ topic: t, reason: 'An unexplored branch in one of your saved graphs.', connectsTo: [] })),
    provider: 'offline',
  };
};

module.exports = { generateTopicSummary, generateLearningPath, answerQuestion, recommend, matchConcepts, describeContext };
