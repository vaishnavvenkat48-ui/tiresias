const mongoose = require('mongoose');

/**
 * AIConversation — assistant chat history, per user (optionally per graph).
 * Only what the UI needs is stored; history is capped to the last 40 messages.
 */
const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 12000 },
    sources: { type: [mongoose.Schema.Types.Mixed], default: [] }, // [{ type: 'concept'|'web', label, url?, origin }]
    provider: { type: String, default: '' }, // gemini model id or 'offline'
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const aiConversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    graphId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraph', default: null },
    title: { type: String, default: 'Conversation', maxlength: 160 },
    messages: { type: [messageSchema], default: [] },
    context: { type: mongoose.Schema.Types.Mixed, default: {} }, // { focus, graphTitle }
  },
  { timestamps: true }
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });
aiConversationSchema.pre('save', function (next) {
  if (this.messages.length > 40) this.messages = this.messages.slice(-40);
  next();
});

module.exports = mongoose.models.AIConversation || mongoose.model('AIConversation', aiConversationSchema);
