const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const generation = require('../services/graphGeneration.service');
const resources = require('../services/resources.service');
const graphService = require('../services/graph.service');
const quota = require('../services/quota.service');

/**
 * /api/public — no account needed. Everything here is sources-only (no Gemini
 * calls → no AI cost) and protected by per-IP rate limits; trial graphs also
 * have a per-IP DAILY quota (QUOTA_TRY_PER_IP, default 3).
 */
const router = express.Router();

/** Topics pre-built for the landing page (warm with `npm run precache`). */
const SHOWCASE = ['Black hole', 'Roman Empire', 'Stoicism', 'Machine learning', 'Norse mythology', 'Behavioral economics', 'Photosynthesis', 'Renaissance'];

const perIp = (max, windowMs = 60 * 1000) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests — please slow down.' },
});

router.get('/showcase', perIp(60), asyncHandler(async (req, res) => {
  const topic = String(req.query.topic || SHOWCASE[0]);
  if (!SHOWCASE.some((t) => t.toLowerCase() === topic.toLowerCase())) {
    return sendSuccess(res, { message: 'Showcase topics.', data: { topics: SHOWCASE } });
  }
  const graph = await generation.preview(topic);
  return sendSuccess(res, { message: 'Showcase graph.', data: { topics: SHOWCASE, graph } });
}));

router.post(
  '/try',
  perIp(10),
  body('topic').isString().trim().isLength({ min: 1, max: 120 }).withMessage('Topic must be 1–120 characters.'),
  validate,
  asyncHandler(async (req, res) => {
    const q = await quota.consume('try', `ip:${req.ip}`);
    if (!q.ok) {
      return res.status(429).json({ success: false, code: 'TRY_LIMIT', message: `You've used your ${q.limit} free explorations for today. Create a free account to keep exploring, save graphs and unlock AI features.` });
    }
    const graph = await generation.preview(req.body.topic);
    if (!graph) return res.status(422).json({ success: false, message: `Couldn't find reliable information about “${req.body.topic}”. Try a different wording.` });
    return sendSuccess(res, { message: 'Trial graph.', data: { graph, remaining: Math.max(0, q.limit - q.used) } });
  })
);

router.get(
  '/topic',
  perIp(60),
  query('topic').isString().trim().isLength({ min: 1, max: 160 }),
  query('wikidataId').optional().matches(/^Q\d+$/),
  validate,
  asyncHandler(async (req, res) => {
    const data = await resources.topicCard(String(req.query.topic), { context: req.query.context ? String(req.query.context).slice(0, 120) : undefined, wikidataId: req.query.wikidataId });
    sendSuccess(res, { message: 'Topic card.', data });
  })
);

router.get('/graphs/:shareId', perIp(60), param('shareId').isString().isLength({ min: 8, max: 32 }), validate, asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Shared graph.', data: await graphService.getShared(req.params.shareId) });
}));

module.exports = router;
module.exports.SHOWCASE = SHOWCASE;
