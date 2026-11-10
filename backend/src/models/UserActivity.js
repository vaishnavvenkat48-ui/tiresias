const mongoose = require('mongoose');
const { ACTIVITY_VALUES } = require('../constants/activityTypes');

/**
 * UserActivity — append-only event log powering analytics + personalization.
 * { userId, activityType, targetId, timestamp }
 * targetId is polymorphic (Topic/Graph/Node id or free-form string).
 */
const userActivitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    activityType: { type: String, enum: ACTIVITY_VALUES, required: true, index: true },
    targetId: { type: String, default: '' },
    targetModel: { type: String, default: '' }, // e.g. 'Topic' | 'KnowledgeGraph' | 'Node'
    graphId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraph', default: null },
    nodeId: { type: String, default: '' },
    topic: { type: String, default: '', index: true },
    category: { type: String, default: '', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    sessionDuration: { type: Number, default: 0 }, // seconds, for SESSION_HEARTBEAT
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

userActivitySchema.index({ userId: 1, timestamp: -1 });
userActivitySchema.index({ activityType: 1, timestamp: -1 });

module.exports = mongoose.model('UserActivity', userActivitySchema);
