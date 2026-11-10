const wikidata = require('./providers/wikidata.provider');
const wikipedia = require('./providers/wikipedia.provider');
const scholarly = require('./providers/scholarly.provider');
const { classify } = require('./TopicClassificationService');
const { CATEGORIES } = require('../constants/categories');
const { safely } = require('../utils/http');
const { slug, brief } = require('./graph/contract');

/**
 * Knowledge retrieval — gathers *facts and candidate concepts* for a topic from
 * real providers, normalises and de-duplicates them, and records exactly which
 * relationships are supported by a retrieved source (`retrievedPairs`).
 *
 * Topic-sensitive fan-out:
 *   Science / Technology / Philosophy / Business → Wikidata + Wikipedia + OpenAlex (+ Crossref via research)
 *   History / Mythology / General               → Wikidata + Wikipedia
 */
const SCHOLARLY_CATEGORIES = new Set([CATEGORIES.SCIENCE, CATEGORIES.TECHNOLOGY, CATEGORIES.PHILOSOPHY, CATEGORIES.BUSINESS]);
const SKIP_VALUE = /^(wikimedia|scholarly article|human|taxon|class of|first-order class|metaclass|concept|academic discipline|branch of science|field of study)$/i;

const src = (provider, title, url) => (url ? [{ provider, title, url }] : []);

/** Wikidata labels are lower-case by convention ("machine learning"); capitalise for display. */
const displayLabel = (s = '') => {
  const t = String(s).trim();
  return /^[a-z]/.test(t) && !/^[a-z]+[A-Z]/.test(t) ? t[0].toUpperCase() + t.slice(1) : t;
};

/** Map an OpenAlex domain/field + Wikidata classes onto our categories. */
const refineCategory = (base, { instanceOf = [], openalexDomain = '' }) => {
  if (base !== CATEGORIES.GENERAL) return base;
  const text = `${instanceOf.join(' ')} ${openalexDomain}`.toLowerCase();
  if (/myth|deity|god|legend|religio/.test(text)) return CATEGORIES.MYTHOLOGY;
  if (/war|empire|dynasty|historical|battle|civilization|period/.test(text)) return CATEGORIES.HISTORY;
  if (/philosoph|ethic|school of thought/.test(text)) return CATEGORIES.PHILOSOPHY;
  if (/compan|econom|business|market|financ|organization/.test(text)) return CATEGORIES.BUSINESS;
  if (/software|programming|computer|technolog|algorithm|engineering/.test(text)) return CATEGORIES.TECHNOLOGY;
  if (/physical sciences|life sciences|health sciences|chemical|physic|biolog|scien/.test(text)) return CATEGORIES.SCIENCE;
  return base;
};

/**
 * @returns {Promise<{
 *   query, title, description, summary, url, wikidataId, category, domain, image,
 *   candidates: Array<{key,label,description,sources,origin,wikidataId,relation}>,
 *   retrievedPairs: Map<string,{relationship,sources}>,  // "root|c:slug" → evidence
 *   papers, providers: string[]
 * }>}
 */
const retrieve = async (topic, { onStage = () => {} } = {}) => {
  const providers = new Set();
  onStage('resolve', 'Looking up the topic on Wikipedia and Wikidata');
  const [title, entityHit] = await Promise.all([
    safely(wikipedia.resolveTitle(topic), null, 'wikipedia title'),
    safely(wikidata.resolve(topic), null, 'wikidata resolve'),
  ]);
  const summary = title ? await safely(wikipedia.summary(title), null, 'wikipedia summary') : null;
  if (summary) providers.add('Wikipedia');
  onStage('wikipedia', summary ? `Found the Wikipedia article “${summary.title}”` : 'No exact Wikipedia article — continuing with Wikidata');

  const wikidataId = summary?.wikidataId || entityHit?.id || null;
  const [entity, related] = await Promise.all([
    wikidataId ? safely(wikidata.details(wikidataId), null, 'wikidata details') : null,
    title ? safely(wikipedia.related(title, 14), [], 'wikipedia related') : [],
  ]);
  if (entity) providers.add('Wikidata');
  onStage('wikidata', entity ? `Wikidata: ${entity.statements.length} statements, ${entity.children.length} linked concepts · Wikipedia: ${related.length} similar articles` : `Wikidata: no matching entity · Wikipedia: ${related.length} similar articles`);

  const rootLabel = summary?.title || entity?.label || entityHit?.label || topic;
  const description = entity?.description || summary?.description || '';
  const instanceOf = (entity?.statements || []).filter((s) => s.property === 'P31' || s.property === 'P279').map((s) => s.value);

  let category = classify(`${topic} ${rootLabel}`, `${description} ${instanceOf.join(' ')}`);
  let domain = '';
  let papers = [];
  let researchTopics = [];
  // Only fetch scholarly data when the domain benefits (saves shared OpenAlex budget)
  const wantsScholarly = SCHOLARLY_CATEGORIES.has(category) || category === CATEGORIES.GENERAL;
  if (wantsScholarly) {
    [researchTopics, papers] = await Promise.all([
      safely(scholarly.openalexTopics(rootLabel, 4), [], 'openalex topics'),
      SCHOLARLY_CATEGORIES.has(category) ? safely(scholarly.openalexWorks(rootLabel, 4), [], 'openalex works') : [],
    ]);
    if (researchTopics.length || papers.length) providers.add('OpenAlex');
    onStage('openalex', `OpenAlex: ${researchTopics.length} research topics, ${papers.length} papers`);
    domain = researchTopics[0]?.field || researchTopics[0]?.domain || '';
    category = refineCategory(category, { instanceOf, openalexDomain: `${researchTopics[0]?.domain || ''} ${researchTopics[0]?.field || ''}` });
  } else {
    category = refineCategory(category, { instanceOf });
  }

  /* ── Candidate concepts (deduped by slug) ── */
  // "Neural network (machine learning)" ≡ "neural network" ≡ the user's own wording
  const rootKeys = new Set([slug(rootLabel), slug(rootLabel.replace(/\s*\([^)]*\)\s*$/, '')), slug(topic), slug(entity?.label || '')].filter(Boolean));
  const byKey = new Map();
  const retrievedPairs = new Map();
  const add = (c) => {
    c.label = displayLabel(c.label);
    const key = slug(c.label);
    if (!key || rootKeys.has(key) || c.label.length > 90) return null;
    const prev = byKey.get(key);
    if (prev) {
      if (!prev.description && c.description) prev.description = c.description;
      prev.sources.push(...c.sources.filter((s) => !prev.sources.some((p) => p.url === s.url)));
      return prev;
    }
    const entry = { key, ...c };
    byKey.set(key, entry);
    return entry;
  };

  // 1) Wikidata statements about the topic (verified relations)
  for (const s of entity?.statements || []) {
    if (!s.valueId || !s.relation || SKIP_VALUE.test(s.value)) continue;
    const c = add({
      label: s.value, description: s.valueDescription, origin: 'wikidata', wikidataId: s.valueId,
      sources: src('Wikidata', `${rootLabel} — ${s.propertyLabel}`, wikidata.entityUrl(wikidataId)), relation: s.relation,
    });
    if (c) retrievedPairs.set(`root|c:${c.key}`, { relationship: s.relation, provenance: 'verified', sources: src('Wikidata', `${s.propertyLabel}: ${s.value}`, wikidata.entityUrl(wikidataId)) });
  }
  // 2) Wikidata inbound links (X part of / subclass of topic) — verified
  for (const ch of entity?.children || []) {
    const c = add({
      label: ch.label, description: ch.description, origin: 'wikidata', wikidataId: ch.id,
      sources: src('Wikidata', ch.label, wikidata.entityUrl(ch.id)), relation: ch.relation,
    });
    if (c) retrievedPairs.set(`root|c:${c.key}`, { relationship: `has ${ch.relation === 'subclass of' ? 'subclass' : ch.relation === 'facet of' ? 'facet' : 'part'}`, provenance: 'verified', sources: src('Wikidata', `${ch.label} — ${ch.relation} ${rootLabel}`, wikidata.entityUrl(ch.id)) });
  }
  // 3) Wikipedia "more like this" — retrieved similarity
  for (const r of related) {
    const c = add({ label: r.label, description: r.description, origin: 'wikipedia', wikidataId: r.wikidataId, sources: src('Wikipedia', r.label, r.url), relation: null });
    if (c && !retrievedPairs.has(`root|c:${c.key}`)) retrievedPairs.set(`root|c:${c.key}`, { relationship: 'related to', provenance: 'search_related', sources: src('Wikipedia search', `Similar article to ${rootLabel}`, r.url) });
  }
  // 4) OpenAlex research topics (academic sub-areas) — context candidates
  for (const t of researchTopics.slice(0, 3)) {
    add({ label: t.label, description: t.description, origin: 'openalex', wikidataId: null, sources: src('OpenAlex', t.label, t.id), relation: null });
  }

  const candidates = [...byKey.values()].map((c) => ({ ...c, description: brief(c.description, 280) })).slice(0, 40);
  const verifiedCount = [...retrievedPairs.values()].filter((p) => p.provenance === 'verified').length;
  onStage('candidates', `Collected ${candidates.length} concepts (${verifiedCount} with Wikidata-verified relations)`);

  return {
    query: topic,
    title: rootLabel,
    description,
    summary: summary?.extract || description,
    url: summary?.url || entity?.wikipediaUrl || null,
    wikidataId,
    category,
    domain,
    image: summary?.image || null,
    candidates,
    retrievedPairs,
    papers: papers.map((p) => ({ title: p.title, year: p.year, doi: p.doi, url: p.url, provider: p.provider })),
    rootSources: [
      ...src('Wikipedia', summary?.title, summary?.url),
      ...(wikidataId ? src('Wikidata', rootLabel, wikidata.entityUrl(wikidataId)) : []),
    ],
    providers: [...providers],
  };
};

/** Retrieval for one concept being expanded (neighbours not already in the graph). */
const retrieveForConcept = async (label, { wikidataId = null, exclude = new Set(), limit = 14 } = {}) => {
  const [related, entity] = await Promise.all([
    safely(wikipedia.related(label, limit), [], 'wikipedia related'),
    (async () => {
      const id = wikidataId || (await safely(wikidata.resolve(label), null, 'wikidata resolve'))?.id;
      return id ? safely(wikidata.details(id), null, 'wikidata details') : null;
    })(),
  ]);
  const out = [];
  const seen = new Set();
  const selfKeys = new Set([slug(label), slug(label.replace(/\s*\([^)]*\)\s*$/, '')), slug(entity?.label || '')]);
  const push = (c) => {
    c.label = displayLabel(c.label);
    const key = slug(c.label);
    if (!key || seen.has(key) || selfKeys.has(key)) return;
    seen.add(key);
    out.push({ ...c, key, existing: exclude.has(`c:${key}`), description: brief(c.description, 280) });
  };
  for (const ch of entity?.children || []) push({ label: ch.label, description: ch.description, origin: 'wikidata', evidence: 'verified', wikidataId: ch.id, relation: `has ${ch.relation.replace(' of', '')}`, sources: src('Wikidata', ch.label, wikidata.entityUrl(ch.id)) });
  for (const s of entity?.statements || []) {
    if (s.valueId && s.relation && !SKIP_VALUE.test(s.value)) push({ label: s.value, description: s.valueDescription, origin: 'wikidata', evidence: 'verified', wikidataId: s.valueId, relation: s.relation, sources: src('Wikidata', `${label} — ${s.propertyLabel}`, wikidata.entityUrl(entity.id)) });
  }
  for (const r of related) push({ label: r.label, description: r.description, origin: 'wikipedia', evidence: 'search_related', wikidataId: r.wikidataId, relation: 'related to', sources: src('Wikipedia', r.label, r.url) });
  return { candidates: out, entity };
};

module.exports = { retrieve, retrieveForConcept };
