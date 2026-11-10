/**
 * Test harness: in-memory MongoDB + the real Express app on an ephemeral port,
 * with ALL outbound provider traffic answered by a programmable fake fetch.
 * Nothing here touches the network or real API keys.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GEMINI_MODEL = 'model-a';
process.env.GEMINI_FALLBACK_MODELS = 'model-b';
process.env.YOUTUBE_API_KEY = 'test-youtube-key';
delete process.env.MONGO_URI;

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const realFetch = global.fetch;
const routes = []; // [{ match: RegExp|fn, reply: fn(url, init) }]
const calls = [];

/** Register a fake provider response. `reply` returns { status?, json?, text? }. */
const mock = (match, reply) => routes.unshift({ match, reply });
const resetMocks = () => { routes.length = 0; calls.length = 0; };
const callsTo = (re) => calls.filter((c) => re.test(c.url));

global.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  calls.push({ url, init });
  const route = routes.find((r) => (typeof r.match === 'function' ? r.match(url, init) : r.match.test(url)));
  if (!route) return new Response(JSON.stringify({ error: 'no mock' }), { status: 599, headers: { 'content-type': 'application/json' } });
  const out = await route.reply(url, init);
  if (out instanceof Error) throw out;
  const body = out.text !== undefined ? out.text : JSON.stringify(out.json ?? {});
  return new Response(body, { status: out.status || 200, headers: { 'content-type': 'application/json' } });
};

let mem;
let server;
let base;

const start = async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri('tiresias-test'));
  const createApp = require('../src/app');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
};

const stop = async () => {
  server?.close();
  await mongoose.disconnect();
  await mem?.stop();
};

const clearDb = async () => {
  const cols = await mongoose.connection.db.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
  require('../src/utils/cache').clearL1();
  require('../src/utils/http').resetBreakers();
  require('../src/services/quota.service').resetMemory();
};

const api = async (method, path, { token, body } = {}) => {
  const r = await realFetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

/** POST to an SSE endpoint and collect events; onEvent fires as each one arrives. */
const stream = async (path, { token, body } = {}, onEvent = () => {}) => {
  const r = await realFetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });
  const events = [];
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of r.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (!ev) continue;
      const e = { event: ev, data: data ? JSON.parse(data) : null };
      events.push(e);
      onEvent(e);
    }
  }
  return events;
};

let seq = 0;
const register = async (overrides = {}) => {
  seq += 1;
  const u = `user${seq}${Date.now() % 1000}`;
  const res = await api('POST', '/auth/register', { body: { name: 'Test User', username: u, email: `${u}@test.dev`, password: 'Str0ng!Pass', ...overrides } });
  return { token: res.body.token, user: res.body.user, res };
};

/* ── Canned provider fixtures ── */
const gemini = (obj) => ({ json: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }] } });

const installKnowledgeFixtures = () => {
  mock(/wikipedia\.org\/w\/api\.php.*list=search/, () => ({ json: { query: { search: [{ title: 'Neural network', snippet: 'A model' }] } } }));
  mock(/rest_v1\/page\/summary/, (url) => {
    const t = decodeURIComponent(url.split('/summary/')[1].split('?')[0]).replace(/_/g, ' ');
    return { json: { type: 'standard', title: t, extract: `${t} is a computational model inspired by the brain. It learns from data.`, description: 'computational model', wikibase_item: t === 'Neural network' ? 'Q1' : null, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${encodeURIComponent(t)}` } } } };
  });
  mock(/wikipedia\.org\/w\/api\.php.*morelike/, (url) => {
    const base = decodeURIComponent(url.match(/morelike%3A([^&]+)/)[1]).replace(/\+/g, ' ');
    const names = base === 'Neural network'
      ? ['Deep learning', 'Perceptron', 'Backpropagation', 'Convolutional neural network', 'Recurrent neural network', 'Activation function', 'Gradient descent', 'Transformer (deep learning)']
      : [`${base} history`, `${base} theory`, `${base} applications`, 'Perceptron', 'Gradient descent', `${base} criticism`, `${base} research`];
    return { json: { query: { pages: names.map((n, i) => ({ title: n, index: i + 1, extract: `${n} is related to ${base}.`, pageprops: {} })) } } };
  });
  mock(/wikidata\.org\/w\/api\.php.*wbsearchentities/, () => ({ json: { search: [{ id: 'Q1', label: 'neural network', description: 'computational model' }] } }));
  mock(/wikidata\.org\/w\/api\.php.*wbgetentities/, () => ({ json: { entities: { Q1: { labels: { en: { value: 'neural network' } }, descriptions: { en: { value: 'computational model' } }, sitelinks: { enwiki: { url: 'https://en.wikipedia.org/wiki/Neural_network' } } } } } }));
  mock(/query\.wikidata\.org\/sparql/, (url) => {
    if (/%3Fitem/.test(url) || /\?item/.test(decodeURIComponent(url))) {
      return { json: { results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q10' }, itemLabel: { value: 'Spiking neural network' }, itemDescription: { value: 'biologically inspired NN' }, rel: { value: 'http://www.wikidata.org/prop/direct/P279' } }] } } };
    }
    return { json: { results: { bindings: [
      { prop: { value: 'http://www.wikidata.org/prop/direct/P279' }, value: { type: 'uri', value: 'http://www.wikidata.org/entity/Q2' }, valueLabel: { value: 'machine learning model' }, valueDescription: { value: 'model trained on data' } },
      { prop: { value: 'http://www.wikidata.org/prop/direct/P527' }, value: { type: 'uri', value: 'http://www.wikidata.org/entity/Q3' }, valueLabel: { value: 'artificial neuron' }, valueDescription: { value: 'mathematical function' } },
      { prop: { value: 'http://www.wikidata.org/prop/direct/P18' }, value: { type: 'uri', value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Neural%20net.png' } },
    ] } } };
  });
  mock(/api\.openalex\.org\/topics/, () => ({ json: { results: [{ id: 'https://openalex.org/T1', display_name: 'Neural Networks and Applications', description: 'research on NNs', field: { display_name: 'Computer Science' }, domain: { display_name: 'Physical Sciences' }, keywords: [] }] } }));
  mock(/api\.openalex\.org\/works/, () => ({ json: { results: [{ id: 'https://openalex.org/W1', doi: 'https://doi.org/10.1/abc', display_name: 'Learning representations by back-propagating errors', publication_year: 1986, authorships: [{ author: { display_name: 'D. Rumelhart' } }], abstract_inverted_index: { Neural: [0], nets: [1] }, open_access: { is_oa: false }, primary_location: { landing_page_url: 'https://www.nature.com/articles/323533a0' }, cited_by_count: 1000 }] } }));
  mock(/api\.crossref\.org\/works/, () => ({ json: { message: { items: [{ DOI: '10.2/xyz', title: ['Neural networks survey'], author: [{ given: 'A', family: 'B' }], issued: { 'date-parts': [[2020]] }, URL: 'https://doi.org/10.2/xyz' }] } } }));
  mock(/commons\.wikimedia\.org\/w\/api\.php/, () => ({ json: { query: { pages: [{ pageid: 7, title: 'File:Neural net.png', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Neural_net.png', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Neural_net.png/640px.png', thumbwidth: 640, thumbheight: 400, mime: 'image/png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Neural_net.png', extmetadata: { Artist: { value: '<a href="x">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, ObjectName: { value: 'Neural net' } } }] }] } } }));
  mock(/api\.openverse\.org/, () => ({ json: { results: [] } }));
};

module.exports = { start, stop, clearDb, api, stream, register, mock, resetMocks, callsTo, calls, gemini, installKnowledgeFixtures };
