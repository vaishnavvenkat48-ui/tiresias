const mongoose = require('mongoose');

/**
 * LearningPath — ordered milestones from a starting topic toward mastery.
 * { userId, title, startingTopic, milestones, completionPercentage }
 */
const milestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    resources: { type: [String], default: [] },
    concepts: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const learningPathSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    // Legacy Phase-1 alias
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    estimatedDuration: { type: String, default: '' }, // e.g. "3 weeks"
    graphId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraph', default: null },
    startingTopic: { type: String, default: '' },
    topic: { type: String, default: '' }, // legacy alias
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    milestones: { type: [milestoneSchema], default: [] },
    steps: { type: [milestoneSchema], default: [] }, // legacy alias
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

learningPathSchema.pre('save', function (next) {
  const list = this.milestones?.length ? this.milestones : this.steps;
  if (list?.length) {
    const done = list.filter((m) => m.status === 'completed').length;
    this.completionPercentage = Math.round((done / list.length) * 100);
  }
  if (!this.userId && this.owner) this.userId = this.owner;
  if (!this.owner && this.userId) this.owner = this.userId;
  next();
});

module.exports = mongoose.model('LearningPath', learningPathSchema);
