const pathService = require('../services/path.service');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getPagination } = require('../utils/pagination');

const { toApi } = pathService;

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await pathService.list(req.user, { skip, limit });
  res.json({ success: true, message: 'Learning paths retrieved.', data: { items: items.map(toApi), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } } });
});

const getById = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Learning path retrieved.', data: toApi(await pathService.getById(req.params.id, req.user)) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Learning path updated.', data: toApi(await pathService.update(req.params.id, req.body, req.user)) });
});

const addMilestone = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Milestone added.', data: toApi(await pathService.addMilestone(req.params.id, req.body, req.user)) });
});

const updateMilestone = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Milestone updated.', data: toApi(await pathService.updateMilestone(req.params.id, req.params.index, req.body, req.user)) });
});

/** PATCH /learning-paths/:id/progress { index | stageIndex, status } */
const progress = asyncHandler(async (req, res) => {
  const index = req.body.index ?? req.body.stageIndex;
  sendSuccess(res, { message: 'Progress updated.', data: toApi(await pathService.updateMilestone(req.params.id, index, req.body, req.user)) });
});

const removeMilestone = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Milestone removed.', data: toApi(await pathService.removeMilestone(req.params.id, req.params.index, req.user)) });
});

const remove = asyncHandler(async (req, res) => {
  await pathService.remove(req.params.id, req.user);
  sendSuccess(res, { message: 'Learning path deleted.' });
});

module.exports = { list, getById, update, addMilestone, updateMilestone, progress, removeMilestone, remove };
