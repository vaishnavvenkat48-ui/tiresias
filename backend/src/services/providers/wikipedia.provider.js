const { request } = require('../../utils/http');
const { cached } = require('../../utils/cache');

/** Wikipedia — supplementary explanations + "more like this" neighbours (no key). */
const API = 'https://en.wikipedia.org/w/api.php';
const REST = 'https://en.wikipedia.org/api/rest_v1';
const P = 'wikipedia';
const BAD = /(disambiguation|^list of|^lists of|^outline of|^index of|^glossary of|\(film\)|\(album\)|\(song\)|\(band\)|\(tv series\)|\(novel\)|\(video game\))/i;
const articleUrl = (t) => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}`;
const clean = (s = '') => s.replace(/\s+/g, ' ').replace(/\s*\([^)]*listen[^)]*\)/gi, '').trim();

const q = (params, timeout = 9000) => request(P, `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, { timeout });

/** Best-matching article title. */
const resolveTitle = (query) => cached('wiki-title', P, query, async () => {
  const s = await q({ action: 'query', list: 'search', srsearch: query, srlimit: '1', srnamespace: '0' });
  return s.query?.search?.[0]?.title || null;
}).then((r) => r.value);

/** Lead summary + thumbnail + wikidata id. */
const summary = (title) => cached('summary', P, title, async () => {
  try {
    const j = await request(P, `${REST}/page/summary/${encodeURIComponent(String(title).replace(/ /g, '_'))}?redirect=true`, { timeout: 8000 });
    if (j.type === 'disambiguation') return null;
    return {
      title: j.title,
      extract: clean(j.extract || ''),
      description: j.description || '',
      thumbnail: j.thumbnail?.source || null,
      image: j.originalimage?.source || null,
      wikidataId: j.wikibase_item || null,
      url: j.content_urls?.desktop?.page || articleUrl(j.title),
    };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}).then((r) => r.value);

/** Semantically related articles (CirrusSearch morelike) with short extracts. */
const related = (title, limit = 10) => cached('related', P, `${title}|${limit}`, async () => {
  const d = await q({
    action: 'query', generator: 'search', gsrsearch: `morelike:${title}`, gsrnamespace: '0', gsrlimit: String(limit),
    prop: 'extracts|pageprops', exintro: '1', explaintext: '1', exsentences: '2', exlimit: String(Math.min(limit, 20)), ppprop: 'wikibase_item',
  }, 12000);
  return (d.query?.pages || [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => !BAD.test(p.title) && p.title.toLowerCase() !== String(title).toLowerCase())
    .map((p) => ({ label: p.title, description: clean(p.extract || ''), url: articleUrl(p.title), wikidataId: p.pageprops?.wikibase_item || null }));
}).then((r) => r.value);

/** Plain search (titles + snippets). */
const searchTopic = (query, limit = 5) => cached('wiki-search', P, `${query}|${limit}`, async () => {
  const s = await q({ action: 'query', list: 'search', srsearch: query, srlimit: String(limit), srnamespace: '0' });
  return (s.query?.search || []).map((x) => ({ title: x.title, snippet: x.snippet?.replace(/<[^>]+>/g, ''), url: articleUrl(x.title) }));
}).then((r) => r.value);

module.exports = { resolveTitle, summary, related, searchTopic, articleUrl };
