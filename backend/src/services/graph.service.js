const graphRepo = require('../repositories/graph.repository');
const { NotFoundError, ForbiddenError } = require('../utils/ApiError');
const { classify } = require('./TopicClassificationService');
const { ACTIVITY_TYPES } = require('../constants/activityTypes');
const { track } = require('./activity.service');
const userRepo = require('../repositories/user.repository');

const ownerIdOf = (owner) => {
  if (!owner) return '';
  if (typeof owner === 'object' && (owner._id || owner.id)) return String(owner._id || owner.id);
  return String(owner);
};
const userIdOf = (user) => String(user?._id || user?.id || '');

const canAccess = (graph, user) => {
  if (!graph) return false;
  if (graph.visibility === 'public') return true;
  if (!user) return false;
  if (String(user.role).toUpperCase() === 'ADMIN') return true;
  return ownerIdOf(graph.owner) === userIdOf(user);
};

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const list = async ({ owner, page, limit, skip, user, favorite = false, saved, q, category }) => {
  const filter = {};
  const isAdmin = String(user?.role).toUpperCase() === 'ADMIN';
  if (owner === 'me' && user) filter.owner = user._id;
  else if (owner && isAdmin) filter.owner = owner; // only admins may list another user's graphs
  else if (user && !isAdmin) {
    filter.$or = [{ owner: user._id }, { visibility: 'public' }];
  }
  if (favorite) filter.isFavorite = true;
  if (saved === true) filter.saved = true;
  if (saved === false) filter.saved = { $ne: true };
  if (category) filter.category = String(category).slice(0, 40);
  if (q) filter.title = new RegExp(escapeRe(String(q).slice(0, 80)), 'i');
  const [items, total] = await Promise.all([
    graphRepo.find(filter, { skip, limit, sort: { updatedAt: -1 } }),
    graphRepo.count(filter),
  ]);
  return { items, total };
};

const getById = async (id, user) => {
  const graph = await graphRepo.findById(id);
  if (!graph) throw new NotFoundError('Graph not found.');
  if (!canAccess(graph, user)) throw new ForbiddenError('You do not have access to this graph.');
  await graphRepo.model.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });
  if (user?._id) await track({ userId: user._id, activityType: ACTIVITY_TYPES.GRAPH_VIEWED, targetId: String(id), targetModel: 'KnowledgeGraph' });
  return graph;
};

const create = async ({ title, rootTopic, rootTopicTitle, category, description, nodes = [], edges = [], generatedBy = 'mock', visibility = 'private' }, user) => {
  const graph = await graphRepo.create({
    title,
    owner: user._id,
    rootTopic: rootTopic || null,
    rootTopicTitle: rootTopicTitle || title,
    topic: rootTopicTitle || title, // legacy alias
    category: category || classify(title, description),
    description: description || '',
    nodes,
    edges,
    generatedBy,
    visibility,
  });
  await userRepo.bumpStat(user._id, 'graphsCreated', 1);
  await track({ userId: user._id, activityType: ACTIVITY_TYPES.GRAPH_CREATED, targetId: String(graph._id), targetModel: 'KnowledgeGraph', graphId: graph._id, topic: title, category: graph.category, metadata: { title } });
  return graph;
};

const update = async (id, patch, user) => {
  const graph = await graphRepo.findById(id);
  if (!graph) throw new NotFoundError('Graph not found.');
  if (ownerIdOf(graph.owner) !== userIdOf(user) && String(user.role).toUpperCase() !== 'ADMIN') {
    throw new ForbiddenError('Only the owner can edit this graph.');
  }
  // Allowlist — never let a client reassign owner/viewCount/savedBy.
  const EDITABLE = ['title', 'description', 'category', 'nodes', 'edges', 'layout', 'visibility', 'isFavorite', 'saved', 'theme'];
  for (const key of EDITABLE) if (patch[key] !== undefined) graph[key] = patch[key];
  if (patch.layout !== undefined) graph.markModified('layout');
  await graph.save();
  return graph;
};

const remove = async (id, user) => {
  const graph = await graphRepo.findById(id);
  if (!graph) throw new NotFoundError('Graph not found.');
  if (ownerIdOf(graph.owner) !== userIdOf(user) && String(user.role).toUpperCase() !== 'ADMIN') {
    throw new ForbiddenError('Only the owner can delete this graph.');
  }
  await graph.deleteOne();
  return graph;
};

const setFavorite = async (id, value, user) => {
  const graph = await graphRepo.findById(id);
  if (!graph) throw new NotFoundError('Graph not found.');
  if (ownerIdOf(graph.owner) !== userIdOf(user)) throw new ForbiddenError('Only the owner can favourite this graph.');
  graph.isFavorite = value === undefined ? !graph.isFavorite : !!value;
  await graph.save();
  if (graph.isFavorite) await track({ userId: user._id, activityType: ACTIVITY_TYPES.GRAPH_FAVORITED, targetId: String(id), targetModel: 'KnowledgeGraph', graphId: id, topic: graph.title, category: graph.category });
  return graph;
};

const ownGraph = async (id, user) => {
  const graph = await graphRepo.findById(id);
  if (!graph) throw new NotFoundError('Graph not found.');
  if (ownerIdOf(graph.owner) !== userIdOf(user)) throw new ForbiddenError('Only the owner can change this graph.');
  return graph;
};

/** Explicit library membership. */
const setSaved = async (id, value, user) => {
  const graph = await ownGraph(id, user);
  graph.saved = value === undefined ? !graph.saved : !!value;
  await graph.save();
  if (graph.saved) await track({ userId: user._id, activityType: ACTIVITY_TYPES.GRAPH_SAVED, targetId: String(id), targetModel: 'KnowledgeGraph', graphId: id, topic: graph.title, category: graph.category, metadata: { title: graph.title } });
  return graph;
};

/** Public read-only link: enabling creates an unguessable id; disabling removes it. */
const setShare = async (id, enabled, user) => {
  const graph = await ownGraph(id, user);
  if (enabled) {
    if (!graph.shareId) graph.shareId = require('crypto').randomBytes(9).toString('base64url');
    graph.saved = true; // sharing implies keeping it
  } else {
    graph.shareId = undefined;
  }
  await graph.save();
  return graph;
};

const getShared = async (shareId) => {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(String(shareId))) throw new NotFoundError('Shared graph not found.');
  const graph = await graphRepo.model.findOne({ shareId }).populate('owner', 'name').lean();
  if (!graph) throw new NotFoundError('Shared graph not found.');
  await graphRepo.model.updateOne({ _id: graph._id }, { $inc: { viewCount: 1 } });
  return {
    title: graph.title, description: graph.description, category: graph.category, domain: graph.domain,
    nodes: graph.nodes, edges: graph.edges, layout: graph.layout, sources: graph.sources,
    owner: graph.owner?.name || 'A Tiresias explorer', updatedAt: graph.updatedAt, shareId,
  };
};

module.exports = { list, getById, create, update, remove, setFavorite, setSaved, setShare, getShared };
