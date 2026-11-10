const pathRepo = require('../repositories/path.repository');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/ApiError');
const { track } = require('./activity.service');
const { ACTIVITY_TYPES } = require('../constants/activityTypes');

/**
 * LearningPathService — list/read/edit the user's learning paths.
 * Generation lives in ai.controller (POST /api/ai/learning-path).
 * `milestones` is canonical; `steps` is a legacy mirror kept in sync.
 */
const STATUSES = ['pending', 'in_progress', 'completed'];

const own = async (id, user) => {
  const path = await pathRepo.findById(id);
  if (!path) throw new NotFoundError('Learning path not found.');
  if (String(path.userId) !== String(user._id) && String(user.role).toUpperCase() !== 'ADMIN') {
    throw new ForbiddenError('You do not have access to this learning path.');
  }
  return path;
};

const list = async (user, { skip = 0, limit = 50 } = {}) => {
  const filter = { userId: user._id };
  const [items, total] = await Promise.all([
    pathRepo.find(filter, { skip, limit, sort: { updatedAt: -1 } }),
    pathRepo.count(filter),
  ]);
  return { items, total };
};

const getById = async (id, user) => {
  const path = await own(id, user);
  await track({ userId: user._id, activityType: ACTIVITY_TYPES.LEARNING_PATH_VIEWED, targetId: String(id), targetModel: 'LearningPath' });
  return path;
};

const syncSteps = (path) => {
  path.steps = path.milestones.map((m) => ({ ...(m.toObject ? m.toObject() : m) }));
  path.markModified('milestones');
  path.markModified('steps');
};

const addMilestone = async (id, { title, description = '', resources = [] }, user) => {
  if (!title || !String(title).trim()) throw new BadRequestError('Milestone title is required.');
  const path = await own(id, user);
  const exists = path.milestones.some((m) => m.title.toLowerCase() === String(title).trim().toLowerCase());
  if (exists) return path;
  path.milestones.push({
    title: String(title).trim().slice(0, 200),
    description: String(description).slice(0, 2000),
    resources: Array.isArray(resources) ? resources.slice(0, 10).map(String) : [],
    status: 'pending',
    order: path.milestones.length + 1,
  });
  syncSteps(path);
  await path.save();
  return path;
};

const updateMilestone = async (id, index, { status }, user) => {
  const path = await own(id, user);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= path.milestones.length) throw new BadRequestError('Invalid milestone index.');
  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw new BadRequestError(`Status must be one of ${STATUSES.join(', ')}.`);
    path.milestones[i].status = status;
    await track({ userId: user._id, activityType: ACTIVITY_TYPES.LEARNING_PATH_PROGRESS, targetId: String(path._id), topic: path.milestones[i].title, metadata: { status, path: path.title } });
  }
  syncSteps(path);
  await path.save();
  return path;
};

const removeMilestone = async (id, index, user) => {
  const path = await own(id, user);
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= path.milestones.length) throw new BadRequestError('Invalid milestone index.');
  path.milestones.splice(i, 1);
  path.milestones.forEach((m, k) => { m.order = k + 1; });
  syncSteps(path);
  await path.save();
  return path;
};

/** PATCH /learning-paths/:id — title/description/duration/level, and milestone order. */
const update = async (id, patch, user) => {
  const path = await own(id, user);
  for (const k of ['title', 'description', 'estimatedDuration']) if (typeof patch[k] === 'string') path[k] = patch[k].slice(0, k === 'description' ? 1000 : 160);
  if (['beginner', 'intermediate', 'advanced'].includes(patch.level)) path.level = patch.level;
  if (Array.isArray(patch.order)) {
    // order = array of current indexes in the desired order (must be a permutation)
    const n = path.milestones.length;
    const valid = patch.order.length === n && new Set(patch.order).size === n && patch.order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
    if (!valid) throw new BadRequestError('order must be a permutation of milestone indexes.');
    path.milestones = patch.order.map((i, k) => ({ ...path.milestones[i].toObject(), order: k + 1 }));
  }
  syncSteps(path);
  await path.save();
  return path;
};

const remove = async (id, user) => {
  const path = await own(id, user);
  await path.deleteOne();
  return path;
};

/** API shape: milestones plus the brief's `stages / completedStages / progress` aliases. */
const toApi = (path) => {
  const o = path.toObject ? path.toObject() : path;
  return { ...o, stages: o.milestones, completedStages: (o.milestones || []).filter((m) => m.status === 'completed').length, progress: o.completionPercentage || 0 };
};

module.exports = { list, getById, addMilestone, updateMilestone, removeMilestone, update, remove, toApi };
