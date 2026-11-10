/**
 * Backend integration tests — real Express app + in-memory MongoDB, mocked providers.
 * Run: npm test
 */
const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(async () => { await h.clearDb(); h.resetMocks(); h.installKnowledgeFixtures(); });

const GEMINI = /generativelanguage\.googleapis\.com/;
/** Gemini enrichment plan (phase 2): additions referencing g (graph) / k (spare candidate) ids. */
const planFor = () => ({
  description: 'Neural networks are models that learn from data.',
  domain: 'Machine learning',
  addCandidates: [{ ref: 'k1', parent: 'g1', relationship: 'example of' }, { ref: 'k2', parent: 'g99', relationship: 'invalid parent' }],
  suggested: [{ parent: 'root', label: 'Universal approximation theorem', description: 'A result about the expressiveness of networks.', relationship: 'is justified by' }],
  crossLinks: [{ a: 'g2', b: 'g4', relationship: 'uses' }],
  notes: [{ node: 'g1', relationship: 'is a kind of' }],
});

describe('auth', () => {
  test('register, duplicate email, wrong password, protected route', async () => {
    const { res } = await h.register({ email: 'dup@test.dev' });
    assert.equal(res.status, 201);
    const dup = await h.api('POST', '/auth/register', { body: { name: 'X', username: 'another1', email: 'dup@test.dev', password: 'Str0ng!Pass' } });
    assert.equal(dup.status, 409);
    const bad = await h.api('POST', '/auth/login', { body: { email: 'dup@test.dev', password: 'Wrong!Pass1' } });
    assert.equal(bad.status, 401);
    const anon = await h.api('GET', '/graphs');
    assert.equal(anon.status, 401);
    assert.equal(res.body.user.password, undefined, 'password hash must never be returned');
  });

  test('password change signs in with the new password only', async () => {
    const { token, user } = await h.register();
    const r = await h.api('PATCH', '/users/password', { token, body: { currentPassword: 'Str0ng!Pass', newPassword: 'An0ther!Pass' } });
    assert.equal(r.status, 200);
    assert.equal((await h.api('POST', '/auth/login', { body: { email: user.email, password: 'Str0ng!Pass' } })).status, 401);
    assert.equal((await h.api('POST', '/auth/login', { body: { email: user.email, password: 'An0ther!Pass' } })).status, 200);
  });
});

describe('graph generation', () => {
  test('AI plan → validated graph with server-side provenance and real sources only', async () => {
    h.mock(GEMINI, () => h.gemini(planFor()));
    const { token } = await h.register();
    const r = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const g = r.body.data.graph;
    const ids = new Set(g.nodes.map((n) => n.id));
    assert.equal(ids.size, g.nodes.length, 'node ids unique');
    assert.ok(g.edges.every((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target), 'edges reference nodes');
    assert.ok(g.nodes.some((n) => n.id === 'root' && n.depth === 0));
    // the AI-suggested concept is labelled as such and carries no sources
    const sug = g.nodes.find((n) => n.label === 'Universal approximation theorem');
    assert.equal(sug.provenance, 'ai_suggested');
    assert.deepEqual(sug.sources, []);
    // retrieved concepts keep provider sources; every non-AI edge cites https URLs
    assert.ok(g.nodes.filter((n) => n.provenance === 'verified' && n.id !== 'root').every((n) => n.sources.length > 0));
    assert.ok(g.edges.filter((e) => e.provenance !== 'ai_suggested').every((e) => e.sources.length && e.sources.every((s) => s.url.startsWith('https://'))));
    // honest tiers: Wikidata statements are "verified", Wikipedia similarity is only "search_related"
    const verified = g.edges.filter((e) => e.provenance === 'verified');
    const searchRelated = g.edges.filter((e) => e.provenance === 'search_related');
    assert.ok(verified.length >= 2 && verified.every((e) => e.sources.every((s) => s.provider === 'Wikidata')), 'verified ⇒ Wikidata evidence');
    assert.ok(searchRelated.length > 0 && searchRelated.every((e) => e.sources.every((s) => /Wikipedia/.test(s.provider))), 'search_related ⇒ Wikipedia similarity');
    // enrichment is additive: the invalid parent ref ("g99") was dropped, not attached randomly
    assert.equal(g.nodes.filter((n) => n.metadata.parent && !ids.has(n.metadata.parent)).length, 0);
    assert.equal(g.enrichment, 'done');
    assert.equal(r.body.data.generation.fallback, false);
    assert.ok(r.body.data.generation.providers.includes('Wikidata') && r.body.data.generation.providers.includes('Gemini'));
    assert.equal(g.saved, false, 'generated graphs are drafts until the user saves them');
  });

  test('sources-first stream: graph arrives before the AI, then additions, then done', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    h.mock(GEMINI, async () => { await gate; return h.gemini(planFor()); }); // AI is slow
    const { token } = await h.register();
    const events = await h.stream('/graphs/generate/stream', { token, body: { topic: 'Neural network' } }, (ev) => {
      if (ev.event === 'graph') release(); // the graph was delivered while Gemini was still "thinking"
    });
    const names = events.map((e) => e.event);
    assert.ok(names.indexOf('stage') < names.indexOf('graph'), 'real stages precede the graph');
    assert.ok(names.indexOf('graph') < names.indexOf('enrich') && names.indexOf('enrich') < names.indexOf('done'));
    const stages = events.filter((e) => e.event === 'stage').map((e) => e.data.stage);
    assert.ok(stages.includes('wikidata') && stages.includes('candidates') && stages.includes('ai'));
    const base = events.find((e) => e.event === 'graph').data.graph;
    assert.ok(base.edges.every((e) => e.provenance !== 'ai_suggested'), 'the first graph contains no AI links');
    const add = events.find((e) => e.event === 'enrich').data;
    assert.ok(add.nodes.some((n) => n.label === 'Universal approximation theorem'));
    assert.ok(!add.nodes.some((n) => base.nodes.some((b) => b.id === n.id)), 'additions never duplicate existing nodes');
  });

  test('Gemini overloaded → next model in the chain is used', async () => {
    h.mock((u) => GEMINI.test(u) && u.includes('model-a'), () => ({ status: 503, json: { error: { message: 'high demand' } } }));
    h.mock((u) => GEMINI.test(u) && u.includes('model-b'), () => h.gemini(planFor()));
    const { token } = await h.register();
    const r = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.generation.model, 'model-b');
  });

  test('quota exhausted → graph still built from retrieved sources, quota not hammered', async () => {
    h.mock(GEMINI, () => ({ status: 429, json: { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } } }));
    const { token } = await h.register();
    const r1 = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network' } });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.data.generation.fallback, true);
    assert.equal(r1.body.data.graph.enrichment, 'failed');
    assert.ok(r1.body.data.graph.nodes.length > 5);
    assert.ok(r1.body.data.graph.edges.every((e) => e.provenance !== 'ai_suggested'), 'no AI involvement → nothing is ai_suggested');
    const before = h.callsTo(GEMINI).length;
    await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network', fresh: true } });
    assert.equal(h.callsTo(GEMINI).length, before, 'breaker open: no further Gemini calls');
  });

  test('malformed AI JSON gets exactly one corrective retry', async () => {
    let n = 0;
    h.mock(GEMINI, () => { n += 1; return n === 1 ? h.gemini('{"addCandidates": "oops not an array"') : h.gemini(planFor()); });
    const { token } = await h.register();
    const r = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network' } });
    assert.equal(r.status, 201);
    assert.equal(n, 2);
    assert.equal(r.body.data.generation.fallback, false);
  });

  test('same topic is reused unless fresh=true', async () => {
    h.mock(GEMINI, () => h.gemini(planFor()));
    const { token } = await h.register();
    const a = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network' } });
    const b = await h.api('POST', '/graphs/generate', { token, body: { topic: 'neural network' } });
    assert.equal(b.body.data.reused, true);
    assert.equal(b.body.data.graph._id, a.body.data.graph._id);
    const c = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network', fresh: true } });
    assert.notEqual(c.body.data.graph._id, a.body.data.graph._id);
  });

  test('validation: empty topic rejected', async () => {
    const { token } = await h.register();
    const r = await h.api('POST', '/graphs/generate', { token, body: { topic: '' } });
    assert.equal(r.status, 400);
  });
});

describe('expansion, layout, isolation', () => {
  const setup = async () => {
    h.mock(GEMINI, () => ({ status: 503, json: {} })); // deterministic: no AI picks
    const owner = await h.register();
    const g = (await h.api('POST', '/graphs/generate', { token: owner.token, body: { topic: 'Neural network' } })).body.data.graph;
    return { owner, g };
  };

  test('expanding twice adds new concepts without duplicates and preserves layout', async () => {
    const { owner, g } = await setup();
    await h.api('PATCH', `/graphs/${g._id}/layout`, { token: owner.token, body: { layout: { positions: { root: { x: 5, y: 6 } }, pinned: ['root'] } } });
    const node = g.nodes.find((n) => n.depth === 1);
    const e1 = await h.api('POST', `/graphs/${g._id}/expand/${encodeURIComponent(node.id)}`, { token: owner.token });
    assert.equal(e1.status, 200);
    assert.ok(e1.body.data.nodes.length > 0);
    assert.ok(e1.body.data.nodes.every((n) => n.metadata.parent === node.id && n.depth === node.depth + 1));
    const e2 = await h.api('POST', `/graphs/${g._id}/expand/${encodeURIComponent(node.id)}`, { token: owner.token });
    const full = (await h.api('GET', `/graphs/${g._id}`, { token: owner.token })).body.data;
    const ids = full.nodes.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate nodes after re-expansion');
    assert.deepEqual(full.layout.positions.root, { x: 5, y: 6 }, 'positions preserved');
    assert.ok(e2.status === 200);
    // the root concept itself is never re-added as a child
    assert.ok(!full.nodes.some((n) => n.id !== 'root' && n.label.toLowerCase() === full.nodes[0].label.toLowerCase()));
    // expansion edges from Wikipedia similarity are never stamped "verified"
    const fromSearch = e1.body.data.edges.filter((e) => e.sources.some((s) => s.provider === 'Wikipedia'));
    assert.ok(fromSearch.length > 0 && fromSearch.every((e) => e.provenance === 'search_related'));
  });

  test('other users cannot read, expand, edit or delete the graph', async () => {
    const { g } = await setup();
    const other = await h.register();
    for (const [m, p] of [['GET', `/graphs/${g._id}`], ['POST', `/graphs/${g._id}/expand/root`], ['PUT', `/graphs/${g._id}`], ['DELETE', `/graphs/${g._id}`], ['PATCH', `/graphs/${g._id}/layout`]]) {
      const r = await h.api(m, p, { token: other.token, body: m === 'GET' ? undefined : { layout: {} } });
      assert.equal(r.status, 403, `${m} ${p} → ${r.status}`);
    }
  });

  test('owner cannot be reassigned through PUT', async () => {
    const { owner, g } = await setup();
    const r = await h.api('PUT', `/graphs/${g._id}`, { token: owner.token, body: { owner: '000000000000000000000000', title: 'Renamed' } });
    assert.equal(r.body.data.title, 'Renamed');
    assert.equal(String(r.body.data.owner), String(g.owner));
  });
});

describe('library, sharing and public access', () => {
  const make = async () => {
    h.mock(GEMINI, () => ({ status: 503, json: {} }));
    const owner = await h.register();
    const g = (await h.api('POST', '/graphs/generate', { token: owner.token, body: { topic: 'Neural network' } })).body.data.graph;
    return { owner, g };
  };

  test('saving is explicit: drafts stay out of the library until saved', async () => {
    const { owner, g } = await make();
    assert.equal((await h.api('GET', '/graphs?owner=me&saved=1', { token: owner.token })).body.data.items.length, 0);
    const s = await h.api('POST', `/graphs/${g._id}/save`, { token: owner.token, body: { saved: true } });
    assert.equal(s.body.data.saved, true);
    assert.equal((await h.api('GET', '/graphs?owner=me&saved=1', { token: owner.token })).body.data.items.length, 1);
  });

  test('share links are public, read-only and revocable', async () => {
    const { owner, g } = await make();
    const other = await h.register();
    assert.equal((await h.api('POST', `/graphs/${g._id}/share`, { token: other.token, body: { enabled: true } })).status, 403);
    const on = await h.api('POST', `/graphs/${g._id}/share`, { token: owner.token, body: { enabled: true } });
    const { shareId } = on.body.data;
    assert.ok(/^[A-Za-z0-9_-]{8,}$/.test(shareId));
    const pub = await h.api('GET', `/public/graphs/${shareId}`); // no token
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.title, g.title);
    assert.equal(pub.body.data.owner, 'Test User');
    assert.equal(pub.body.data.ownerId, undefined, 'no private fields leak');
    await h.api('POST', `/graphs/${g._id}/share`, { token: owner.token, body: { enabled: false } });
    assert.equal((await h.api('GET', `/public/graphs/${shareId}`)).status, 404);
  });

  test('anonymous trial: sources-only (no Gemini), limited per IP per day', async () => {
    const before = h.callsTo(GEMINI).length;
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await h.api('POST', '/public/try', { body: { topic: 'Neural network' } })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429]);
    assert.equal(h.callsTo(GEMINI).length, before, 'trials never call the AI');
    const r = await h.api('GET', '/public/showcase?topic=Black%20hole');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.graph.nodes.length > 0);
  });
});

describe('quotas', () => {
  test('per-user daily generation quota returns 429 with a clear message', async () => {
    process.env.QUOTA_GENERATIONS_PER_USER = '2';
    try {
      h.mock(GEMINI, () => ({ status: 503, json: {} }));
      const { token } = await h.register();
      const codes = [];
      for (const t of ['Neural network', 'Perceptron', 'Backpropagation']) codes.push((await h.api('POST', '/graphs/generate', { token, body: { topic: t, fresh: true } })).status);
      assert.deepEqual(codes, [201, 201, 429]);
    } finally { delete process.env.QUOTA_GENERATIONS_PER_USER; }
  });

  test('global Gemini daily cap stops AI calls and falls back to sources', async () => {
    process.env.GEMINI_DAILY_CALL_CAP = '1';
    try {
      h.mock(GEMINI, () => h.gemini(planFor()));
      const { token } = await h.register();
      const a = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network', fresh: true } });
      assert.equal(a.body.data.graph.enrichment, 'done');
      const calls = h.callsTo(GEMINI).length;
      const b = await h.api('POST', '/graphs/generate', { token, body: { topic: 'Perceptron', fresh: true } });
      assert.equal(b.status, 201);
      assert.equal(b.body.data.graph.enrichment, 'failed');
      assert.equal(h.callsTo(GEMINI).length, calls, 'cap reached → no Gemini call made');
    } finally { delete process.env.GEMINI_DAILY_CALL_CAP; }
  });
});

describe('resources', () => {
  test('videos are cached: one YouTube call for repeated requests', async () => {
    h.mock(/googleapis\.com\/youtube/, () => ({ json: { items: [{ id: { videoId: 'abc123' }, snippet: { title: 'Neural nets explained', description: '', channelTitle: '3B1B', publishedAt: '2017-01-01', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg' } } } }] } }));
    const { token } = await h.register();
    const a = await h.api('GET', '/resources/videos?topic=Neural%20network', { token });
    const b = await h.api('GET', '/resources/videos?topic=Neural%20network', { token });
    assert.equal(a.body.data.videos[0].url, 'https://www.youtube.com/watch?v=abc123');
    assert.deepEqual(a.body.data.videos, b.body.data.videos);
    assert.equal(h.callsTo(/googleapis\.com\/youtube/).length, 1);
    assert.ok(!JSON.stringify(a.body).includes('test-youtube-key'), 'API key never leaks');
  });

  test('YouTube quota exceeded → empty list with a note, then no more calls', async () => {
    h.mock(/googleapis\.com\/youtube/, () => ({ status: 403, json: { error: { errors: [{ reason: 'quotaExceeded' }], message: 'quota' } } }));
    const { token } = await h.register();
    const a = await h.api('GET', '/resources/videos?topic=Perceptron', { token });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.data.videos, []);
    await h.api('GET', '/resources/videos?topic=Backpropagation', { token });
    assert.equal(h.callsTo(/googleapis\.com\/youtube/).length, 1);
  });

  test('images carry attribution + licence; unsafe hosts are dropped', async () => {
    const { token } = await h.register();
    const r = await h.api('GET', '/resources/images?topic=Neural%20network', { token });
    const img = r.body.data.images[0];
    assert.equal(img.provider, 'Wikimedia Commons');
    assert.equal(img.creator, 'Jane Doe');
    assert.equal(img.license, 'CC BY-SA 4.0');
    assert.ok(img.thumbnail.startsWith('https://upload.wikimedia.org/'));
  });

  test('topic card: Wikidata facts + P18 image', async () => {
    const { token } = await h.register();
    const r = await h.api('GET', '/resources/topic?topic=Neural%20network', { token });
    assert.equal(r.body.data.wikidataId, 'Q1');
    assert.ok(r.body.data.facts.some((f) => f.label === 'has part'));
    assert.equal(r.body.data.image.license, 'CC BY-SA 4.0');
  });

  test('research merges OpenAlex + Crossref and rebuilds abstracts', async () => {
    const { token } = await h.register();
    const r = await h.api('GET', '/resources/research?topic=Neural%20network', { token });
    const providers = r.body.data.works.map((w) => w.provider);
    assert.ok(providers.includes('OpenAlex') && providers.includes('Crossref'));
    assert.equal(r.body.data.works[0].abstract, 'Neural nets');
  });

  test('a failing provider degrades gracefully', async () => {
    h.mock(/api\.openalex\.org/, () => new Error('network down'));
    const { token } = await h.register();
    const r = await h.api('GET', '/resources/research?topic=Neural%20network', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.works.every((w) => w.provider === 'Crossref'));
  });
});

describe('analytics & activity', () => {
  test('numbers are user-scoped, filterable and real', async () => {
    h.mock(GEMINI, () => h.gemini(planFor()));
    const a = await h.register();
    const b = await h.register();
    await h.api('POST', '/graphs/generate', { token: a.token, body: { topic: 'Neural network' } });
    const ov = await h.api('GET', '/analytics/overview?days=7', { token: a.token });
    assert.equal(ov.body.data.totals.graphsCreated, 1);
    assert.equal(ov.body.data.totals.topicsExplored, 1);
    const ovB = await h.api('GET', '/analytics/overview', { token: b.token });
    assert.equal(ovB.body.data.totals.graphsCreated, 0, "user B doesn't see A's data");
    const cat = await h.api('GET', '/analytics/categories?category=History', { token: a.token });
    assert.deepEqual(cat.body.data.categories, []);
    const range = await h.api('GET', '/analytics/overview?from=2001-01-01&to=2001-01-31', { token: a.token });
    assert.equal(range.body.data.totals.graphsCreated, 0, 'custom range excludes today');
    const admin = await h.api('GET', '/analytics/dashboard', { token: a.token });
    assert.equal(admin.status, 403);
  });

  test('client may only record client-side activity types', async () => {
    const { token } = await h.register();
    assert.equal((await h.api('POST', '/activity', { token, body: { action: 'NODE_SELECTED', topic: 'Perceptron' } })).status, 201);
    assert.equal((await h.api('POST', '/activity', { token, body: { action: 'GRAPH_CREATED' } })).status, 400);
    const hist = await h.api('GET', '/activity/history', { token });
    assert.ok(hist.body.data.items.some((i) => i.activityType === 'NODE_SELECTED'));
  });
});

describe('learning paths & assistant', () => {
  test('AI learning path is validated; progress updates percentage', async () => {
    h.mock(GEMINI, () => h.gemini({ title: 'Neural networks from scratch', description: 'd', estimatedDuration: '3 weeks', stages: [{ title: 'Linear models' }, { title: 'Perceptrons' }, { title: 'Backpropagation' }, { title: 'Deep networks' }] }));
    const { token } = await h.register();
    const p = await h.api('POST', '/learning-paths/generate', { token, body: { topic: 'Neural network' } });
    assert.equal(p.status, 201);
    assert.equal(p.body.data.stages.length, 4);
    const prog = await h.api('PATCH', `/learning-paths/${p.body.data._id}/progress`, { token, body: { index: 1, status: 'completed' } });
    assert.equal(prog.body.data.progress, 25);
    const list = await h.api('GET', '/learning-paths', { token });
    assert.equal(list.body.data.items.length, 1);
    assert.equal((await h.api('GET', '/paths', { token })).status, 404, 'legacy /paths alias removed');
  });

  test('chat is grounded in the selected graph and keeps history', async () => {
    let lastBody = null;
    h.mock(GEMINI, (_u, init) => {
      lastBody = JSON.parse(init.body);
      return lastBody.generationConfig?.responseMimeType ? h.gemini(planFor()) : h.gemini('Deep learning stacks many layers of a neural network.');
    });
    const { token } = await h.register();
    const g = (await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network' } })).body.data.graph;
    const c1 = await h.api('POST', '/ai/chat', { token, body: { message: 'How is deep learning related to neural networks?', graphId: g._id } });
    assert.equal(c1.status, 200);
    const prompt = lastBody.contents.at(-1).parts[0].text;
    assert.ok(prompt.includes('Deep learning') && prompt.includes(`SAVED GRAPH "${g.title}"`), 'graph context was sent');
    assert.ok(c1.body.data.sources.some((s) => s.label === 'Deep learning'));
    const c2 = await h.api('POST', '/ai/chat', { token, body: { message: 'And in one line?', conversationId: c1.body.data.conversationId } });
    assert.equal(c2.status, 200);
    assert.ok(lastBody.contents.length >= 3, 'previous turns included');
    const other = await h.register();
    const steal = await h.api('POST', '/ai/chat', { token: other.token, body: { message: 'hi', conversationId: c1.body.data.conversationId } });
    assert.equal(steal.status, 404, "can't continue someone else's conversation");
  });
});

describe('account deletion', () => {
  test('requires the password and removes everything the user owns', async () => {
    h.mock(GEMINI, () => h.gemini(planFor()));
    const { token, user } = await h.register();
    await h.api('POST', '/graphs/generate', { token, body: { topic: 'Neural network' } });
    assert.equal((await h.api('DELETE', '/users/account', { token, body: { password: 'nope' } })).status, 401);
    const r = await h.api('DELETE', '/users/account', { token, body: { password: 'Str0ng!Pass' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.deletedGraphs, 1);
    assert.equal((await h.api('POST', '/auth/login', { body: { email: user.email, password: 'Str0ng!Pass' } })).status, 401);
  });
});
