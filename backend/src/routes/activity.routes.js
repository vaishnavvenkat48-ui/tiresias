const express = require('express');
const mongoose = require('mongoose');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const { getPagination } = require('../utils/pagination');
const { track } = require('../services/activity.service');
const analytics = require('../services/analytics.service');
const UserActivity = require('../models/UserActivity');
const { CLIENT_ACTIVITY_TYPES } = require('../constants/activityTypes');

/** /api/activity — client-reported interactions + the user's own history. */
const router = express.Router();
router.use(authMiddleware);

router.post(
  '/',
  body('action').isIn(CLIENT_ACTIVITY_TYPES).withMessage(`action must be one of ${CLIENT_ACTIVITY_TYPES.join(', ')}.`),
  body('graphId').optional({ nullable: true }).custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid graphId.'),
  body('nodeId').optional().isString().isLength({ max: 120 }),
  body('topic').optional().isString().isLength({ max: 200 }),
  body('category').optional().isString().isLength({ max: 40 }),
  validate,
  asyncHandler(async (req, res) => {
    const { action, graphId, nodeId = '', topic = '', category = '', metadata = {} } = req.body;
    const safeMeta = Object.fromEntries(Object.entries(metadata || {}).slice(0, 10).map(([k, v]) => [String(k).slice(0, 40), typeof v === 'string' ? v.slice(0, 300) : typeof v === 'number' || typeof v === 'boolean' ? v : null]));
    const doc = await track({ userId: req.user._id, activityType: action, graphId: graphId || null, nodeId, topic, category, metadata: safeMeta });
    sendSuccess(res, { statusCode: 201, message: 'Activity recorded.', data: { id: doc?._id || null } });
  })
);

router.get('/history', asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await analytics.userActivity(req.user._id, { limit, skip, type: req.query.type || null, from: req.query.from, to: req.query.to, category: req.query.category });
  sendPaginated(res, { message: 'Activity history.', items, page, limit, total });
}));

/** Recent distinct topics (for "continue exploring"). */
router.get('/recent', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);
  const items = await UserActivity.aggregate([
    { $match: { userId: req.user._id, activityType: { $in: ['TOPIC_SEARCHED', 'GRAPH_VIEWED', 'NODE_EXPANDED', 'GRAPH_CREATED'] } } },
    { $addFields: { t: { $ifNull: ['$metadata.title', '$topic'] } } },
    { $match: { t: { $nin: [null, ''] } } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: { $toLower: '$t' }, topic: { $first: '$t' }, graphId: { $first: '$graphId' }, last: { $first: '$timestamp' }, type: { $first: '$activityType' } } },
    { $sort: { last: -1 } },
    { $limit: limit },
  ]);
  sendSuccess(res, { message: 'Recent topics.', data: { items: items.map(({ _id, ...r }) => r) } });
}));

module.exports = router;
