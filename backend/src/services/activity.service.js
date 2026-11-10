const activityRepo = require('../repositories/activity.repository');

/**
 * ActivityService — single choke point for all tracking.
 * Fire-and-forget safe: never throws (analytics must not break requests).
 */
const track = async ({
  userId = null, activityType, targetId = '', targetModel = '', metadata = {}, sessionDuration = 0,
  graphId = null, nodeId = '', topic = '', category = '',
}) => {
  try {
    return await activityRepo.create({
      userId, activityType, targetId, targetModel, metadata, sessionDuration,
      graphId: graphId || null, nodeId, topic: String(topic || metadata?.title || metadata?.topic || '').slice(0, 200), category,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.warn('[activity] track failed:', err.message);
    return null;
  }
};

module.exports = { track };
