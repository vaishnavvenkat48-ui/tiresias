const mongoose = require('mongoose');

/**
 * ResourceCache — provider responses keyed by (resourceType, provider, query).
 * MongoDB's TTL monitor deletes documents after `expiresAt`, so quota-limited
 * providers (YouTube) are only queried once per topic per TTL window.
 */
const resourceCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    query: { type: String, required: true },
    resourceType: { type: String, required: true, index: true }, // videos | images | research | topic | entity | ...
    provider: { type: String, required: true },
    results: { type: mongoose.Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

resourceCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.ResourceCache || mongoose.model('ResourceCache', resourceCacheSchema);
