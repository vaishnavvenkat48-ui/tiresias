/**
 * Analytics aggregation job placeholder.
 * Phase 2: schedule with node-cron to pre-compute dashboard rollups
 * into a dedicated collection for fast reads.
 */
const runAnalyticsRollup = async () => ({ ok: true, at: new Date().toISOString(), note: 'placeholder' });

module.exports = { runAnalyticsRollup };
