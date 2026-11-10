const graphService = require('../services/graph.service');
const generation = require('../services/graphGeneration.service');
const expansion = require('../services/graphExpansion.service');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const { getPagination } = require('../utils/pagination');

const bool = (v) => (v === undefined ? undefined : v === '1' || v === 'true');

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await graphService.list({
    owner: req.query.owner, page, limit, skip, user: req.user,
    favorite: bool(req.query.favorite) === true,
    saved: bool(req.query.saved),
    q: req.query.q, category: req.query.category,
  });
  sendPaginated(res, { message: 'Graphs retrieved.', items, page, limit, total });
});

const getById = asyncHandler(async (req, res) => {
  const graph = await graphService.getById(req.params.id, req.user);
  sendSuccess(res, { message: 'Graph retrieved.', data: graph });
});

/** POST /graphs/generate { topic, fresh? } — base + AI enrichment in one response (non-streaming clients). */
const generate = asyncHandler(async (req, res) => {
  const { graph, reused, generation: meta } = await generation.generate(req.body.topic, req.user, { fresh: !!req.body.fresh });
  sendSuccess(res, { statusCode: reused ? 200 : 201, message: reused ? 'Opened your existing graph for this topic.' : 'Graph generated.', data: { graph, reused, generation: meta || graph.generation || null } });
});

/**
 * POST /graphs/generate/stream { topic, fresh? } — Server-Sent Events.
 *   event: stage   { stage, message }        real pipeline progress
 *   event: graph   { graph, reused }         sources-only graph, saved — render immediately
 *   event: enrich  { nodes, edges, updates, model, description }   AI additions to merge
 *   event: done    { enrichment }            stream finished
 *   event: error   { message, status }
 * Enrichment continues (and is saved) even if the client disconnects.
 */
const generateStream = async (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  let open = true;
  req.on('close', () => { open = false; });
  const send = (event, data) => {
    if (!open) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => open && res.write(': keep-alive\n\n'), 15000);
  try {
    const onStage = (stage, message) => send('stage', { stage, message });
    const { graph, bundle, reused } = await generation.buildBase(req.body.topic, req.user, { fresh: !!req.body.fresh, onStage });
    send('graph', { graph, reused });
    if (!reused && graph.enrichment === 'pending') {
      const result = await generation.enrich(graph, bundle, { onStage });
      send('enrich', result);
    }
    send('done', { enrichment: graph.enrichment, generation: graph.generation });
  } catch (err) {
    send('error', { message: err.statusCode ? err.message : 'Could not build a graph for this topic.', status: err.statusCode || 500 });
    if (!err.statusCode) console.error('[generate/stream]', err.message);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
};

/** POST /graphs — save client-supplied nodes; without nodes it runs the generation pipeline. */
const create = asyncHandler(async (req, res) => {
  if (!req.body.nodes?.length) {
    const { graph } = await generation.generate(req.body.title, req.user, { fresh: true });
    return sendSuccess(res, { statusCode: 201, message: 'Graph generated.', data: graph });
  }
  const graph = await graphService.create(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Graph created.', data: graph });
});

const update = asyncHandler(async (req, res) => {
  const graph = await graphService.update(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Graph updated.', data: graph });
});

/** PATCH /graphs/:id/layout { layout } — lightweight autosave of positions/pins/hidden/physics. */
const updateLayout = asyncHandler(async (req, res) => {
  const graph = await graphService.update(req.params.id, { layout: req.body.layout ?? req.body }, req.user);
  sendSuccess(res, { message: 'Layout saved.', data: { _id: graph._id, layout: graph.layout, updatedAt: graph.updatedAt } });
});

const favorite = asyncHandler(async (req, res) => {
  const graph = await graphService.setFavorite(req.params.id, req.body.favorite, req.user);
  sendSuccess(res, { message: graph.isFavorite ? 'Added to favourites.' : 'Removed from favourites.', data: { _id: graph._id, isFavorite: graph.isFavorite } });
});

/** POST /graphs/:id/save { saved? } — explicit library membership (omit to toggle). */
const save = asyncHandler(async (req, res) => {
  const graph = await graphService.setSaved(req.params.id, req.body.saved, req.user);
  sendSuccess(res, { message: graph.saved ? 'Saved to your library.' : 'Removed from your library.', data: { _id: graph._id, saved: graph.saved } });
});

/** POST /graphs/:id/share { enabled } → { shareId } (null when disabled). */
const share = asyncHandler(async (req, res) => {
  const graph = await graphService.setShare(req.params.id, req.body.enabled !== false, req.user);
  sendSuccess(res, { message: graph.shareId ? 'Share link created.' : 'Share link removed.', data: { _id: graph._id, shareId: graph.shareId || null, saved: graph.saved } });
});

const remove = asyncHandler(async (req, res) => {
  await graphService.remove(req.params.id, req.user);
  sendSuccess(res, { message: 'Graph deleted.' });
});

/** POST /graphs/:id/expand/:nodeId → { nodes, edges } that were added (existing ones untouched). */
const expandNode = asyncHandler(async (req, res) => {
  const result = await expansion.expand(req.params.id, req.params.nodeId, req.user);
  sendSuccess(res, { message: result.exhausted ? 'No new related concepts found.' : 'Node expanded.', data: result });
});

module.exports = { list, getById, generate, generateStream, create, update, updateLayout, favorite, save, share, remove, expandNode };
