const analytics = require('../services/analytics.service');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const { getPagination } = require('../utils/pagination');

const opts = (req) => ({
  days: Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365),
  from: req.query.from,
  to: req.query.to,
  tz: String(req.query.tz || 'UTC').slice(0, 64),
  category: req.query.category,
});

/* ── Admin-only, platform-wide ── */
const dashboard = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'Platform analytics.', data: await analytics.dashboard() }));
const users = asyncHandler(async (_req, res) => sendSuccess(res, { message: 'User analytics.', data: await analytics.usersAnalytics() }));
const platformTopics = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Topic analytics.', data: await analytics.topicsAnalytics(parseInt(req.query.limit, 10) || 10) }));
const platformActivity = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total, byType } = await analytics.activityFeed({ page, limit, skip, type: req.query.type || null });
  res.json({ success: true, message: 'Activity feed.', data: { items, byType, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } } });
});

/* ── Personal (authenticated user only) ── */
const me = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Personal analytics.', data: await analytics.forUser(req.user._id, opts(req)) }));

const overview = asyncHandler(async (req, res) => {
  const d = await analytics.forUser(req.user._id, opts(req));
  sendSuccess(res, { message: 'Overview.', data: { totals: d.totals, byType: d.byType, recentTopics: d.recentTopics, meta: d.meta } });
});
const activity = asyncHandler(async (req, res) => {
  const d = await analytics.forUser(req.user._id, opts(req));
  sendSuccess(res, { message: 'Activity over time.', data: { timeline: d.timeline, hours: d.hours, meta: d.meta } });
});
const topics = asyncHandler(async (req, res) => {
  const d = await analytics.forUser(req.user._id, opts(req));
  sendSuccess(res, { message: 'Topics.', data: { topTopics: d.topTopics, recentTopics: d.recentTopics, meta: d.meta } });
});
const categories = asyncHandler(async (req, res) => {
  const d = await analytics.forUser(req.user._id, opts(req));
  sendSuccess(res, { message: 'Categories.', data: { categories: d.categories, meta: d.meta } });
});
const graphs = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Graph engagement.', data: { graphs: await analytics.graphsAnalytics(req.user._id, { category: req.query.category }) } });
});

const myActivity = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await analytics.userActivity(req.user._id, { limit, skip, type: req.query.type || null, from: req.query.from, to: req.query.to, category: req.query.category });
  sendPaginated(res, { message: 'Your activity.', items, page, limit, total });
});

module.exports = { dashboard, users, platformTopics, platformActivity, me, overview, activity, topics, categories, graphs, myActivity };
