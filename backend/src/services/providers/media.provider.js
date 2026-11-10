const env = require('../../config/env');
const { request, safely, safeMediaUrl, safeLinkUrl } = require('../../utils/http');
const { cached } = require('../../utils/cache');

/**
 * Media providers: YouTube Data API v3 (videos), Wikimedia Commons, Openverse,
 * Unsplash (optional) for images. Attribution + licence fields come only from
 * the providers' own metadata — never invented.
 */
const stripTags = (s = '') => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const decode = (s = '') => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/* ───────────── YouTube ───────────── */
const youtube = (query, limit = 6) => cached('videos', 'youtube', `${query}|${limit}`, async () => {
  if (!env.youtubeApiKey) return null;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', q: query, maxResults: String(Math.min(limit, 10)),
    relevanceLanguage: 'en', safeSearch: 'strict', videoEmbeddable: 'true', order: 'relevance', key: env.youtubeApiKey,
  });
  // search.list costs 100 quota units — the cache above means once per topic per 7 days.
  const data = await request('youtube', `https://www.googleapis.com/youtube/v3/search?${params}`, { timeout: 10000, retries: 1, cooldownMs: 6 * 60 * 60 * 1000 });
  return (data.items || []).filter((v) => v.id?.videoId).map((v) => ({
    videoId: v.id.videoId,
    title: decode(v.snippet.title),
    description: decode(v.snippet.description || ''),
    channel: decode(v.snippet.channelTitle || ''),
    publishedAt: v.snippet.publishedAt,
    thumbnail: safeMediaUrl(v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || ''),
    url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.id.videoId}`,
    provider: 'YouTube',
  }));
}, { cacheEmpty: false }).then((r) => r.value);

/* ───────────── Wikimedia Commons ───────────── */
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const commonsInfo = (pages) => pages
  .map((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii) return null;
    const m = ii.extmetadata || {};
    const thumb = safeMediaUrl(ii.thumburl || ii.url);
    const full = safeMediaUrl(ii.url);
    if (!thumb || !/^image\//.test(ii.mime || 'image/')) return null;
    return {
      id: `commons:${p.pageid}`,
      title: stripTags(m.ObjectName?.value || p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')),
      description: stripTags(m.ImageDescription?.value || '').slice(0, 300),
      thumbnail: thumb,
      imageUrl: full,
      width: ii.thumbwidth || ii.width,
      height: ii.thumbheight || ii.height,
      creator: stripTags(m.Artist?.value || '') || null,
      license: m.LicenseShortName?.value || null,
      licenseUrl: safeLinkUrl(m.LicenseUrl?.value || '') || null,
      sourceUrl: safeLinkUrl(ii.descriptionurl) || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      provider: 'Wikimedia Commons',
      index: p.index ?? 0,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.index - b.index)
  .map(({ index, ...rest }) => rest);

const commonsSearch = (query, limit = 8) => cached('images', 'commons', `${query}|${limit}`, async () => {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search',
    gsrsearch: `${query} filetype:bitmap|drawing -fileres:0`, gsrnamespace: '6', gsrlimit: String(limit * 2),
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '640',
    iiextmetadatafilter: 'ObjectName|ImageDescription|Artist|LicenseShortName|LicenseUrl',
  });
  const data = await request('commons', `${COMMONS}?${params}`, { timeout: 10000 });
  return commonsInfo(data.query?.pages || []).filter((i) => (i.width || 0) >= 160).slice(0, limit);
}).then((r) => r.value);

/** One Commons file by name (e.g. Wikidata P18 "image" value). */
const commonsFile = (fileName) => cached('images', 'commons-file', fileName, async () => {
  const title = `File:${decodeURIComponent(String(fileName).split('/').pop()).replace(/^File:/, '')}`;
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', titles: title,
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '800',
    iiextmetadatafilter: 'ObjectName|ImageDescription|Artist|LicenseShortName|LicenseUrl',
  });
  const data = await request('commons', `${COMMONS}?${params}`, { timeout: 10000 });
  return commonsInfo(data.query?.pages || [])[0] || null;
}).then((r) => r.value);

/* ───────────── Openverse (secondary, optional) ───────────── */
const openverse = (query, limit = 6) => cached('images', 'openverse', `${query}|${limit}`, async () => {
  const params = new URLSearchParams({ q: query, page_size: String(limit), mature: 'false' });
  const data = await request('openverse', `https://api.openverse.org/v1/images/?${params}`, {
    timeout: 7000, retries: 0, headers: env.openverseToken ? { Authorization: `Bearer ${env.openverseToken}` } : {},
  });
  return (data.results || []).map((r) => {
    const thumb = safeMediaUrl(r.thumbnail || '') || safeMediaUrl(r.url || '');
    if (!thumb) return null;
    return {
      id: `openverse:${r.id}`,
      title: r.title || query,
      description: '',
      thumbnail: thumb,
      imageUrl: safeMediaUrl(r.url || '') || thumb,
      creator: r.creator || null,
      license: r.license ? `${String(r.license).toUpperCase()} ${r.license_version || ''}`.trim() : null,
      licenseUrl: safeLinkUrl(r.license_url || '') || null,
      sourceUrl: safeLinkUrl(r.foreign_landing_url || '') || null,
      provider: `Openverse${r.source ? ` · ${r.source}` : ''}`,
    };
  }).filter(Boolean);
}).then((r) => r.value);

/* ───────────── Unsplash (optional enrichment) ───────────── */
const unsplash = (query, limit = 4) => cached('images', 'unsplash', `${query}|${limit}`, async () => {
  if (!env.unsplashAccessKey) return null;
  const params = new URLSearchParams({ query, per_page: String(limit), content_filter: 'high' });
  const data = await request('unsplash', `https://api.unsplash.com/search/photos?${params}`, {
    timeout: 8000, headers: { Authorization: `Client-ID ${env.unsplashAccessKey}`, 'Accept-Version': 'v1' },
  });
  return (data.results || []).map((p) => ({
    id: `unsplash:${p.id}`,
    title: p.alt_description || p.description || query,
    description: p.description || '',
    thumbnail: safeMediaUrl(p.urls?.small || ''),
    imageUrl: safeMediaUrl(p.urls?.regular || ''),
    creator: p.user?.name || null,
    license: 'Unsplash License',
    licenseUrl: 'https://unsplash.com/license',
    sourceUrl: safeLinkUrl(`${p.links?.html}?utm_source=tiresias&utm_medium=referral`),
    provider: 'Unsplash',
  })).filter((i) => i.thumbnail);
}, { cacheEmpty: false }).then((r) => r.value);

/**
 * Image search with fallback: Commons → Openverse (if < 4) → Unsplash (optional).
 * Results are deduped by thumbnail URL.
 */
const images = async (query, limit = 8) => {
  const out = [];
  const seen = new Set();
  const push = (list) => { for (const i of list || []) if (i && !seen.has(i.thumbnail)) { seen.add(i.thumbnail); out.push(i); } };
  push(await safely(commonsSearch(query, limit), [], 'commons search'));
  if (out.length < 4) push(await safely(openverse(query, limit - out.length + 2), [], 'openverse search'));
  if (out.length < limit && env.unsplashAccessKey) push(await safely(unsplash(query, 4), [], 'unsplash search'));
  return out.slice(0, limit);
};

module.exports = { youtube, images, commonsSearch, commonsFile, openverse, unsplash };
