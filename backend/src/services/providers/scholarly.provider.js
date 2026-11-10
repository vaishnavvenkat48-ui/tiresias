const env = require('../../config/env');
const { request, safely } = require('../../utils/http');
const { cached } = require('../../utils/cache');

/**
 * Scholarly metadata: OpenAlex (primary) + Crossref (DOI enrichment / fallback).
 * Never invents abstracts or full-text links — only fields the APIs return.
 */
const OPENALEX = 'https://api.openalex.org';
const CROSSREF = 'https://api.crossref.org';

/** OpenAlex stores abstracts as an inverted index — rebuild plain text. */
const deinvert = (inv) => {
  if (!inv) return '';
  const words = [];
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(' ');
};
const stripTags = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const normDoi = (doi) => (doi ? String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase() : null);

const openalexWorks = (query, limit = 6) => cached('research', 'openalex', `${query}|${limit}`, async () => {
  const params = new URLSearchParams({
    search: query,
    'per-page': String(limit),
    sort: 'relevance_score:desc',
    select: 'id,doi,display_name,publication_year,authorships,abstract_inverted_index,open_access,primary_location,cited_by_count,topics',
    ...(env.openalexApiKey ? { api_key: env.openalexApiKey } : {}),
  });
  const data = await request('openalex', `${OPENALEX}/works?${params}`, { timeout: 12000 });
  return (data.results || []).map((w) => ({
    id: w.id,
    title: w.display_name,
    year: w.publication_year || null,
    doi: normDoi(w.doi),
    authors: (w.authorships || []).slice(0, 5).map((a) => a.author?.display_name).filter(Boolean),
    abstract: deinvert(w.abstract_inverted_index).slice(0, 900),
    openAccess: !!w.open_access?.is_oa,
    openAccessUrl: w.open_access?.oa_url || null,
    url: w.primary_location?.landing_page_url || (w.doi ? `https://doi.org/${normDoi(w.doi)}` : w.id),
    venue: w.primary_location?.source?.display_name || null,
    citations: w.cited_by_count || 0,
    topics: (w.topics || []).slice(0, 3).map((t) => t.display_name),
    provider: 'OpenAlex',
  }));
}).then((r) => r.value);

/** OpenAlex research topics (field / subfield / domain) — used for classification + graph context. */
const openalexTopics = (query, limit = 5) => cached('research-topics', 'openalex', `${query}|${limit}`, async () => {
  const params = new URLSearchParams({ search: query, 'per-page': String(limit), ...(env.openalexApiKey ? { api_key: env.openalexApiKey } : {}) });
  const data = await request('openalex', `${OPENALEX}/topics?${params}`, { timeout: 10000 });
  return (data.results || []).map((t) => ({
    id: t.id, label: t.display_name, description: t.description || '',
    field: t.field?.display_name, subfield: t.subfield?.display_name, domain: t.domain?.display_name,
    keywords: (t.keywords || []).slice(0, 8),
  }));
}).then((r) => r.value);

const crossrefWorks = (query, limit = 5) => cached('research', 'crossref', `${query}|${limit}`, async () => {
  const params = new URLSearchParams({
    query, rows: String(limit), select: 'DOI,title,author,issued,abstract,URL,container-title,is-referenced-by-count',
    ...(env.crossrefMailto ? { mailto: env.crossrefMailto } : {}),
  });
  const data = await request('crossref', `${CROSSREF}/works?${params}`, { timeout: 12000 });
  return (data.message?.items || []).map((w) => ({
    id: `doi:${normDoi(w.DOI)}`,
    title: stripTags(w.title?.[0] || ''),
    year: w.issued?.['date-parts']?.[0]?.[0] || null,
    doi: normDoi(w.DOI),
    authors: (w.author || []).slice(0, 5).map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
    abstract: stripTags(w.abstract || '').replace(/^abstract\s*/i, '').slice(0, 900),
    openAccess: null,
    openAccessUrl: null,
    url: w.URL || (w.DOI ? `https://doi.org/${w.DOI}` : null),
    venue: w['container-title']?.[0] || null,
    citations: w['is-referenced-by-count'] || 0,
    topics: [],
    provider: 'Crossref',
  })).filter((w) => w.title);
}).then((r) => r.value);

/** Crossref lookup for one DOI (verification / enrichment). */
const crossrefDoi = (doi) => cached('doi', 'crossref', doi, async () => {
  const data = await request('crossref', `${CROSSREF}/works/${encodeURIComponent(doi)}${env.crossrefMailto ? `?mailto=${encodeURIComponent(env.crossrefMailto)}` : ''}`, { timeout: 10000 });
  const w = data.message || {};
  return { doi: normDoi(w.DOI), abstract: stripTags(w.abstract || '').replace(/^abstract\s*/i, ''), venue: w['container-title']?.[0] || null };
}).then((r) => r.value);

/**
 * Combined research list: OpenAlex first, Crossref fills gaps; deduped by DOI/title.
 * Missing abstracts are enriched from Crossref only when it actually has one.
 */
const research = async (query, limit = 6) => {
  const [oa, cr] = await Promise.all([
    safely(openalexWorks(query, limit), [], 'openalex works'),
    safely(crossrefWorks(query, Math.max(3, Math.ceil(limit / 2))), [], 'crossref works'),
  ]);
  const seen = new Set();
  const out = [];
  for (const w of [...oa, ...cr]) {
    const key = w.doi || w.title.toLowerCase().replace(/\W+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  await Promise.all(out.slice(0, limit).filter((w) => !w.abstract && w.doi && w.provider === 'OpenAlex').slice(0, 3).map(async (w) => {
    const extra = await safely(crossrefDoi(w.doi), null, 'crossref doi');
    if (extra?.abstract) { w.abstract = extra.abstract.slice(0, 900); w.abstractSource = 'Crossref'; }
  }));
  return out.slice(0, limit);
};

module.exports = { research, openalexWorks, openalexTopics, crossrefWorks, crossrefDoi };
