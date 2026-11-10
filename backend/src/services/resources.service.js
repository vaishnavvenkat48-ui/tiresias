const wikidata = require('./providers/wikidata.provider');
const wikipedia = require('./providers/wikipedia.provider');
const scholarly = require('./providers/scholarly.provider');
const media = require('./providers/media.provider');
const { cached } = require('../utils/cache');
const { safely, isOpen } = require('../utils/http');
const env = require('../config/env');

/**
 * Learning resources for a concept. Every method is cached (see utils/cache TTLs)
 * and degrades to partial results when a provider is down.
 *
 * `context` (e.g. the graph's root topic) disambiguates short / generic labels:
 * "Origins" in a Roman Empire graph searches "Origins Roman Empire".
 */
const contextual = (topic, context) => {
  const t = String(topic || '').trim();
  const c = String(context || '').trim();
  if (!c || t.toLowerCase().includes(c.toLowerCase())) return t;
  return t.split(/\s+/).length <= 2 ? `${t} ${c}` : t;
};

/** Commons file name from an upload.wikimedia.org URL (only for Commons-hosted files). */
const commonsFileFromUrl = (url = '') => {
  const m = String(url).match(/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
};

const videos = async (topic, context) => {
  const query = contextual(topic, context);
  if (!env.youtubeApiKey) return { topic, query, videos: [], provider: 'none', note: 'YouTube is not configured.' };
  if (isOpen('youtube')) return { topic, query, videos: [], provider: 'YouTube', note: 'YouTube daily quota reached — try again later.' };
  const list = await safely(media.youtube(query, 6), null, 'youtube');
  return { topic, query, videos: list || [], provider: 'YouTube', ...(list ? {} : { note: 'YouTube is temporarily unavailable.' }) };
};

const images = async (topic, context) => {
  const query = contextual(topic, context);
  return { topic, query, images: await media.images(query, 8) };
};

const research = async (topic, context) => {
  const query = contextual(topic, context);
  return { topic, query, works: await scholarly.research(query, 6) };
};

/**
 * Topic card: the most relevant image (Wikidata P18 → Wikipedia lead image on
 * Commons → Commons search), a Wikidata description + facts, and the Wikipedia
 * summary. Wikipedia-local (non-free) lead images are never returned.
 */
const topicCard = (topic, { context, wikidataId } = {}) => cached('topic', 'card', `${topic}|${context || ''}|${wikidataId || ''}`, async () => {
  const query = contextual(topic, context);
  const title = await safely(wikipedia.resolveTitle(query), null, 'wikipedia title');
  const summary = title ? await safely(wikipedia.summary(title), null, 'wikipedia summary') : null;
  const qid = (wikidataId && /^Q\d+$/.test(wikidataId) ? wikidataId : null) || summary?.wikidataId || (await safely(wikidata.resolve(query), null, 'wikidata resolve'))?.id || null;
  const entity = qid ? await safely(wikidata.details(qid), null, 'wikidata details') : null;

  let image = null;
  const p18 = entity?.statements?.find((s) => s.property === 'P18')?.value;
  if (p18) image = await safely(media.commonsFile(p18), null, 'commons P18');
  if (!image && summary?.image) {
    const file = commonsFileFromUrl(summary.image);
    if (file) image = await safely(media.commonsFile(file), null, 'commons lead image');
  }
  if (!image) image = (await safely(media.commonsSearch(query, 3), [], 'commons search'))[0] || null;

  return {
    topic,
    title: summary?.title || entity?.label || topic,
    description: entity?.description || summary?.description || '',
    summary: summary?.extract || '',
    image,
    facts: wikidata.facts(entity),
    aliases: entity?.aliases || [],
    wikidataId: qid,
    wikidataUrl: qid ? wikidata.entityUrl(qid) : null,
    wikipediaUrl: summary?.url || entity?.wikipediaUrl || null,
    sources: [
      ...(summary?.url ? [{ provider: 'Wikipedia', title: summary.title, url: summary.url }] : []),
      ...(qid ? [{ provider: 'Wikidata', title: entity?.label || qid, url: wikidata.entityUrl(qid) }] : []),
    ],
  };
}).then((r) => r.value);

module.exports = { videos, images, research, topicCard, contextual };
