/**
 * Live end-to-end API check against a running backend (default http://localhost:5000/api).
 * Exercises auth, generation, expansion, resources, paths, AI and analytics with real providers.
 * Usage: node scripts/live-api-check.js [topic]
 */
const BASE = process.env.API || 'http://localhost:5000/api';
const topic = process.argv[2] || 'Neural network';
let token = '';
const call = async (method, path, body) => {
  const t = Date.now();
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t, ...j };
};
const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);

(async () => {
  const u = `live${Date.now() % 1e6}`;
  const reg = await call('POST', '/auth/register', { name: 'Live Check', username: u, email: `${u}@tiresias.dev`, password: 'Str0ng!Pass' });
  token = reg.token;
  ok('register', reg.status === 201 && token);

  const gen = await call('POST', '/graphs/generate', { topic });
  const g = gen.data?.graph;
  ok('generate', gen.status === 201 && g?.nodes?.length > 5, `${gen.ms}ms · ${g?.nodes?.length} nodes / ${g?.edges?.length} edges · model=${gen.data?.generation?.model} fallback=${gen.data?.generation?.fallback} · providers=${gen.data?.generation?.providers?.join('+')} · category=${g?.category}`);
  const ids = new Set(g.nodes.map((n) => n.id));
  ok('  ids unique', ids.size === g.nodes.length);
  ok('  edges valid', g.edges.every((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target));
  const prov = g.edges.reduce((a, e) => ({ ...a, [e.provenance]: (a[e.provenance] || 0) + 1 }), {});
  ok('  provenance tagged', g.edges.every((e) => ['verified', 'ai_suggested', 'user_added'].includes(e.provenance)), JSON.stringify(prov));
  ok('  verified edges carry sources', g.edges.filter((e) => e.provenance === 'verified').every((e) => e.sources?.length && e.sources.every((s) => /^https:\/\//.test(s.url))));
  ok('  ai nodes have no fabricated sources', g.nodes.filter((n) => n.provenance === 'ai_suggested').every((n) => !n.sources?.length));
  console.log(`     primaries: ${g.nodes.filter((n) => n.depth === 1).map((n) => `${n.label}${n.provenance === 'ai_suggested' ? '*' : ''}`).join(', ')}`);

  const reuse = await call('POST', '/graphs/generate', { topic });
  ok('reuse existing graph', reuse.data?.reused === true && reuse.data.graph._id === g._id, `${reuse.ms}ms`);

  const target = g.nodes.find((n) => n.depth === 1);
  const ex1 = await call('POST', `/graphs/${g._id}/expand/${encodeURIComponent(target.id)}`);
  ok('expand', ex1.status === 200 && ex1.data.nodes.length > 0, `${ex1.ms}ms · +${ex1.data?.nodes?.length} nodes, +${ex1.data?.edges?.length} edges under "${target.label}" (model=${ex1.data?.model})`);
  const ex2 = await call('POST', `/graphs/${g._id}/expand/${encodeURIComponent(target.id)}`);
  const after = await call('GET', `/graphs/${g._id}`);
  const all = after.data.nodes.map((n) => n.id);
  ok('re-expand adds no duplicates', new Set(all).size === all.length, `+${ex2.data?.nodes?.length} more · total ${all.length}`);

  const lay = await call('PATCH', `/graphs/${g._id}/layout`, { layout: { positions: { root: { x: 1, y: 2 } }, pinned: ['root'], physics: false } });
  ok('layout patch', lay.data?.layout?.pinned?.[0] === 'root');
  const fav = await call('POST', `/graphs/${g._id}/favorite`, { favorite: true });
  ok('favorite', fav.data?.isFavorite === true);
  const favs = await call('GET', '/graphs?owner=me&favorite=1');
  ok('list favorites', favs.data?.items?.length === 1);

  const card = await call('GET', `/resources/topic?topic=${encodeURIComponent(target.label)}&context=${encodeURIComponent(g.title)}`);
  ok('topic card', card.status === 200 && card.data?.title, `${card.ms}ms · image=${card.data?.image ? `${card.data.image.provider} [${card.data.image.license}]` : 'none'} · facts=${card.data?.facts?.length} · wikidata=${card.data?.wikidataId}`);
  const imgs = await call('GET', `/resources/images?topic=${encodeURIComponent(target.label)}`);
  ok('images', imgs.data?.images?.length > 0 && imgs.data.images.every((i) => i.license !== undefined && /^https:/.test(i.thumbnail)), `${imgs.ms}ms · ${imgs.data?.images?.length} images`);
  const vids = await call('GET', `/resources/videos?topic=${encodeURIComponent(target.label)}`);
  ok('videos', vids.data?.videos?.length > 0, `${vids.ms}ms · ${vids.data?.videos?.[0]?.title || vids.data?.note}`);
  const vids2 = await call('GET', `/resources/videos?topic=${encodeURIComponent(target.label)}`);
  ok('videos cached (no 2nd quota spend)', vids2.ms < 300, `${vids2.ms}ms`);
  const res = await call('GET', `/resources/research?topic=${encodeURIComponent(g.title)}`);
  ok('research', res.data?.works?.length > 0, `${res.ms}ms · ${res.data?.works?.map((w) => w.provider).join(',')}`);

  const exp = await call('POST', '/ai/explain', { topic: target.label, context: g.title });
  ok('ai explain', !!exp.data?.summary, `${exp.ms}ms · provider=${exp.data?.provider}`);
  const chat = await call('POST', '/ai/chat', { message: `How is ${target.label} related to ${g.title}?`, graphId: g._id });
  ok('ai chat (grounded)', !!chat.data?.answer, `${chat.ms}ms · provider=${chat.data?.provider} · sources=${chat.data?.sources?.map((s) => s.label).slice(0, 4).join(', ')}`);
  const chat2 = await call('POST', '/ai/chat', { message: 'Summarise that in one sentence.', conversationId: chat.data?.conversationId });
  ok('ai chat follow-up (history)', !!chat2.data?.answer && chat2.data.conversationId === chat.data.conversationId);
  const recs = await call('POST', '/ai/recommendations');
  ok('ai recommendations', Array.isArray(recs.data?.recommendations), `${recs.ms}ms · ${recs.data?.recommendations?.map((r) => r.topic).slice(0, 3).join(', ')} (${recs.data?.provider})`);

  const path = await call('POST', '/learning-paths/generate', { topic: g.title, graphId: g._id });
  ok('learning path generate', path.status === 201 && path.data?.stages?.length >= 3, `${path.ms}ms · ${path.data?.stages?.length} stages · ${path.data?.estimatedDuration} (${path.data?.provider})`);
  const prog = await call('PATCH', `/learning-paths/${path.data._id}/progress`, { index: 0, status: 'completed' });
  ok('learning path progress', prog.data?.progress > 0, `${prog.data?.progress}%`);

  const ov = await call('GET', '/analytics/overview?days=7');
  ok('analytics overview', ov.data?.totals?.graphsCreated === 1, JSON.stringify(ov.data?.totals));
  const gr = await call('GET', '/analytics/graphs');
  ok('analytics graphs', gr.data?.graphs?.[0]?.expansions === 2, `expansions=${gr.data?.graphs?.[0]?.expansions} verified=${gr.data?.graphs?.[0]?.verifiedLinks} ai=${gr.data?.graphs?.[0]?.aiSuggestedLinks}`);
  const cat = await call('GET', `/analytics/categories?category=${g.category}`);
  ok('analytics category filter', cat.data?.categories?.[0]?.name === g.category);
  const recent = await call('GET', '/activity/recent');
  ok('activity recent', recent.data?.items?.length > 0, recent.data?.items?.map((i) => i.topic).slice(0, 3).join(', '));
  const post = await call('POST', '/activity', { action: 'NODE_SELECTED', graphId: g._id, nodeId: target.id, topic: target.label });
  ok('activity post', post.status === 201);
  const bad = await call('POST', '/activity', { action: 'GRAPH_CREATED' });
  ok('activity rejects server-only types', bad.status === 400);

  // isolation: a second user cannot read or expand the first user's graph
  const myToken = token;
  const u2 = `${u}b`;
  token = (await call('POST', '/auth/register', { name: 'Other', username: u2, email: `${u2}@tiresias.dev`, password: 'Str0ng!Pass' })).token;
  const steal = await call('GET', `/graphs/${g._id}`);
  const stealExp = await call('POST', `/graphs/${g._id}/expand/root`);
  ok('user isolation', steal.status === 403 && stealExp.status === 403, `${steal.status}/${stealExp.status}`);
  const adminOnly = await call('GET', '/analytics/dashboard');
  ok('platform analytics admin-only', adminOnly.status === 403);
  token = myToken;

  const pw = await call('PATCH', '/users/password', { currentPassword: 'wrong', newPassword: 'N3w!Passw0rd' });
  ok('password change rejects wrong current', pw.status === 401);
  const del = await call('DELETE', '/users/account', { password: 'Str0ng!Pass' });
  ok('account delete (cascade)', del.status === 200 && del.data?.deletedGraphs === 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
