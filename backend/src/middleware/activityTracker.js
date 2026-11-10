const { track } = require('../services/activity.service');

/**
 * activityTracker(type, opts) — Express middleware factory that records
 * a UserActivity row after the response finishes. Never blocks/errors.
 * Example: router.post('/', authMiddleware, activityTracker('TOPIC_SEARCHED'), create)
 */
const activityTracker = (activityType, { targetModel = '', getTargetId = null } = {}) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    try {
      const targetId = typeof getTargetId === 'function' ? getTargetId(req, res) : req.params.id || '';
      track({ userId: req.user?._id || null, activityType, targetId: String(targetId || ''), targetModel });
    } catch {
      /* ignore */
    }
  });
  next();
};

module.exports = { activityTracker };
