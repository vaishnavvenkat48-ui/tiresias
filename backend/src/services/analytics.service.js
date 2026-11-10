const mongoose = require('mongoose');
const UserActivity = require('../models/UserActivity');
const KnowledgeGraph = require('../models/KnowledgeGraph');
const User = require('../models/User');

/**
 * AnalyticsService — all numbers are aggregated from real collections
 * (graphs, users, and the append-only activity log).
 */
const searchedTopics = (limit) => UserActivity.aggregate([
  { $match: { activityType: 'TOPIC_SEARCHED' } },
  { $addFields: { t: { $ifNull: ['$metadata.title', '$topic'] } } },
  { $match: { t: { $nin: [null, ''] } } },
  { $group: { _id: { $toLower: '$t' }, title: { $last: '$t' }, category: { $last: '$category' }, searches: { $sum: 1 } } },
  { $sort: { searches: -1 } },
  ...(limit ? [{ $limit: limit }] : []),
]);

/** Platform-wide totals (admin only). */
const dashboard = async () => {
  const [topicList, graphs, users, activities, aiQueries, nodeExpansions, graphViews] = await Promise.all([
    searchedTopics(),
    KnowledgeGraph.countDocuments(),
    User.countDocuments(),
    UserActivity.countDocuments(),
    UserActivity.countDocuments({ activityType: 'AI_QUERY' }),
    UserActivity.countDocuments({ activityType: 'NODE_EXPANDED' }),
    UserActivity.countDocuments({ activityType: 'GRAPH_VIEWED' }),
  ]);
  return {
    totals: { topics: topicList.length, graphs, users, activities, aiQueries, nodeExpansions, graphViews },
    meta: { generatedAt: new Date().toISOString() },
  };
};

/** Most-searched topics across all users (admin only). */
const topicsAnalytics = async (limit = 10) => {
  const top = await searchedTopics(limit);
  const byCategory = await KnowledgeGraph.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
  return { top: top.map((t) => ({ title: t.title, category: t.category || null, searches: t.searches })), byCategory };
};

const usersAnalytics = async () => {
  const total = await User.countDocuments();
  const byRole = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  const recent = await User.find().sort({ createdAt: -1 }).limit(5).select('name username email role createdAt');
  return { total, byRole, recent };
};

const activityFeed = async ({ page = 1, limit = 20, skip = 0, type = null }) => {
  const filter = type ? { activityType: type } : {};
  const [items, total] = await Promise.all([
    UserActivity.find(filter).populate('userId', 'name username').sort({ timestamp: -1 }).skip(skip).limit(limit),
    UserActivity.countDocuments(filter),
  ]);
  const byType = await UserActivity.aggregate([{ $group: { _id: '$activityType', count: { $sum: 1 } } }]);
  return { items, total, byType };
};

/* ════════════ Personal (user-scoped) analytics ════════════ */

const DAY = 864e5;
const safeTz = (tz) => {
  try { if (/^[A-Za-z0-9_/+-]{1,64}$/.test(tz || '')) { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch { /* invalid */ }
  return 'UTC';
};

/**
 * Normalise filters: explicit `from`/`to` (ISO dates) win; otherwise `days`
 * (7/30/90 or custom up to 365). `ranged` tells whether totals should be
 * windowed (explicit range) or all-time (default, as the dashboard expects).
 */
const parseRange = ({ days = 30, from, to, tz } = {}) => {
  const timezone = safeTz(tz);
  const end = to && !Number.isNaN(Date.parse(to)) ? new Date(new Date(to).getTime() + DAY - 1) : new Date();
  let start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(end.getTime() - (Math.min(Math.max(Number(days) || 30, 1), 365) - 1) * DAY);
  if (start > end) start = new Date(end.getTime() - 29 * DAY);
  if (end - start > 366 * DAY) start = new Date(end.getTime() - 365 * DAY);
  const span = Math.max(1, Math.round((end - start) / DAY) + (from ? 0 : 0));
  return { start, end, timezone, span: Math.min(span, 366), ranged: !!(from || to) };
};

const actMatch = (uid, { start, end, ranged }, category, extra = {}) => ({
  userId: uid,
  ...(ranged ? { timestamp: { $gte: start, $lte: end } } : {}),
  ...(category ? { category } : {}),
  ...extra,
});

/**
 * Personal analytics for one user — powers Analytics, Dashboard and Profile.
 * Everything is derived from the user's own graphs, paths and activity log.
 * Options: { days, from, to, tz, category }.
 */
const forUser = async (userId, opts = {}) => {
  const LearningPath = require('../models/LearningPath');
  const uid = new mongoose.Types.ObjectId(String(userId));
  const range = parseRange(opts);
  const category = opts.category ? String(opts.category).slice(0, 40) : null;
  const graphFilter = { owner: uid, ...(category ? { category } : {}), ...(range.ranged ? { createdAt: { $gte: range.start, $lte: range.end } } : {}) };

  const [graphs, paths, byType, daily, hourly, searched] = await Promise.all([
    KnowledgeGraph.find(graphFilter).select('title category nodes.id isFavorite viewCount updatedAt createdAt').lean(),
    LearningPath.find({ userId: uid }).select('title completionPercentage milestones.status').lean(),
    UserActivity.aggregate([{ $match: actMatch(uid, range, category) }, { $group: { _id: '$activityType', count: { $sum: 1 } } }]),
    UserActivity.aggregate([
      { $match: actMatch(uid, { ...range, ranged: true }, category) }, // the timeline is always windowed
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: range.timezone } }, type: '$activityType' }, count: { $sum: 1 } } },
    ]),
    UserActivity.aggregate([
      { $match: actMatch(uid, range, category) },
      { $group: { _id: { $hour: { date: '$timestamp', timezone: range.timezone } }, count: { $sum: 1 } } },
    ]),
    UserActivity.aggregate([
      { $match: actMatch(uid, range, category, { activityType: 'TOPIC_SEARCHED' }) },
      { $addFields: { t: { $ifNull: ['$metadata.title', '$topic'] } } },
      { $match: { t: { $nin: [null, ''] } } },
      { $group: { _id: { $toLower: '$t' }, title: { $last: '$t' }, count: { $sum: 1 }, last: { $max: '$timestamp' }, category: { $last: '$category' } } },
      { $sort: { count: -1, last: -1 } },
    ]),
  ]);

  const typeCount = Object.fromEntries(byType.map((t) => [t._id, t.count]));
  const nodesDiscovered = graphs.reduce((s, g) => s + (g.nodes?.length || 0), 0);

  // Categories: graphs per category, plus searches per category where recorded
  const catMap = {};
  for (const g of graphs) catMap[g.category || 'General'] = (catMap[g.category || 'General'] || 0) + 1;
  const categories = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: range.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKeys = [];
  for (let t = range.start.getTime(); t <= range.end.getTime() && dayKeys.length < 366; t += DAY) {
    const k = fmtDay.format(new Date(t));
    if (!dayKeys.includes(k)) dayKeys.push(k);
  }
  const lastKey = fmtDay.format(range.end);
  if (!dayKeys.includes(lastKey)) dayKeys.push(lastKey);
  const timeline = dayKeys.map((day) => {
    const row = { day, searches: 0, expansions: 0, ai: 0, graphs: 0, resources: 0 };
    for (const d of daily) {
      if (d._id.day !== day) continue;
      const t = d._id.type;
      if (t === 'TOPIC_SEARCHED') row.searches += d.count;
      else if (t === 'NODE_EXPANDED') row.expansions += d.count;
      else if (t === 'AI_QUERY') row.ai += d.count;
      else if (t === 'GRAPH_CREATED' || t === 'GRAPH_SAVED') row.graphs += d.count;
      else if (t === 'VIDEO_RECOMMENDED' || t === 'RESEARCH_VIEWED' || t === 'RESOURCE_OPENED') row.resources += d.count;
    }
    return row;
  });
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourly.find((x) => x._id === h)?.count || 0 }));

  return {
    totals: {
      topicsExplored: searched.length,
      searches: typeCount.TOPIC_SEARCHED || 0,
      graphsCreated: graphs.length,
      favorites: graphs.filter((g) => g.isFavorite).length,
      nodesDiscovered,
      nodeExpansions: typeCount.NODE_EXPANDED || 0,
      aiQueries: typeCount.AI_QUERY || 0,
      learningPaths: paths.length,
      pathCompletion: paths.length ? Math.round(paths.reduce((s, p) => s + (p.completionPercentage || 0), 0) / paths.length) : 0,
      milestonesCompleted: paths.reduce((s, p) => s + (p.milestones || []).filter((m) => m.status === 'completed').length, 0),
    },
    categories,
    topTopics: searched.slice(0, 8).map((s) => ({ name: s.title || s._id, value: s.count, last: s.last, category: s.category || null })),
    recentTopics: [...searched].sort((a, b) => new Date(b.last) - new Date(a.last)).slice(0, 10).map((s) => ({ name: s.title, last: s.last })),
    timeline,
    hours,
    byType: typeCount,
    meta: { from: range.start.toISOString(), to: range.end.toISOString(), days: dayKeys.length, ranged: range.ranged, category, timezone: range.timezone, generatedAt: new Date().toISOString() },
  };
};

/** Per-graph engagement: size, expansions, views, AI-vs-verified links, last activity. */
const graphsAnalytics = async (userId, { category } = {}) => {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const graphs = await KnowledgeGraph.find({ owner: uid, ...(category ? { category } : {}) })
    .select('title category isFavorite viewCount createdAt updatedAt nodes.id nodes.depth edges.provenance').lean();
  const expansions = await UserActivity.aggregate([
    { $match: { userId: uid, activityType: 'NODE_EXPANDED', graphId: { $in: graphs.map((g) => g._id) } } },
    { $group: { _id: '$graphId', count: { $sum: 1 }, last: { $max: '$timestamp' } } },
  ]);
  const ex = new Map(expansions.map((e) => [String(e._id), e]));
  return graphs.map((g) => ({
    id: g._id,
    title: g.title,
    category: g.category,
    isFavorite: !!g.isFavorite,
    nodes: g.nodes?.length || 0,
    maxDepth: Math.max(0, ...(g.nodes || []).map((n) => n.depth || 0)),
    verifiedLinks: (g.edges || []).filter((e) => (e.provenance || 'verified') === 'verified').length,
    searchRelatedLinks: (g.edges || []).filter((e) => e.provenance === 'search_related').length,
    aiSuggestedLinks: (g.edges || []).filter((e) => e.provenance === 'ai_suggested').length,
    expansions: ex.get(String(g._id))?.count || 0,
    views: g.viewCount || 0,
    lastActivity: ex.get(String(g._id))?.last || g.updatedAt,
    createdAt: g.createdAt,
  })).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
};

/** The user's own activity log (History page). */
const userActivity = async (userId, { limit = 30, skip = 0, type = null, from, to, category } = {}) => {
  const filter = { userId };
  if (type) filter.activityType = type;
  if (category) filter.category = String(category).slice(0, 40);
  if (from || to) {
    filter.timestamp = {};
    if (from && !Number.isNaN(Date.parse(from))) filter.timestamp.$gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) filter.timestamp.$lte = new Date(new Date(to).getTime() + DAY - 1);
  }
  const [items, total] = await Promise.all([
    UserActivity.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
    UserActivity.countDocuments(filter),
  ]);
  return { items, total };
};

module.exports = { dashboard, topicsAnalytics, usersAnalytics, activityFeed, forUser, graphsAnalytics, userActivity, parseRange };

