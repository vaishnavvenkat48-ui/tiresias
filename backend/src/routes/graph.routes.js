const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');
const ctrl = require('../controllers/graph.controller');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { graphRules, mongoIdParam } = require('../validators/rules');
const { dailyQuota } = require('../services/quota.service');

const router = express.Router();

// Generation and expansion call several external providers + Gemini — throttle per user.
const aiHeavy = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // keyed by user id, not IP
  message: { success: false, message: 'Too many generation requests — please wait a minute.' },
});

const layoutRule = body('layout').optional().custom((v) => {
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('layout must be an object.');
  if (JSON.stringify(v).length > 200000) throw new Error('layout is too large.');
  return true;
});

const topicRule = body('topic').isString().trim().isLength({ min: 1, max: 120 }).withMessage('Topic must be 1–120 characters.');

router.use(authMiddleware);
router.get('/', ctrl.list);
router.post('/generate', aiHeavy, topicRule, body('fresh').optional().isBoolean(), validate, dailyQuota('generate', 'graph generations'), ctrl.generate);
router.post('/generate/stream', aiHeavy, topicRule, body('fresh').optional().isBoolean(), validate, dailyQuota('generate', 'graph generations'), ctrl.generateStream);
router.post('/:id/save', mongoIdParam(), body('saved').optional().isBoolean(), validate, ctrl.save);
router.post('/:id/share', mongoIdParam(), body('enabled').optional().isBoolean(), validate, ctrl.share);
router.get('/:id', mongoIdParam(), validate, ctrl.getById);
router.post('/', graphRules, layoutRule, validate, ctrl.create);
router.put('/:id', mongoIdParam(), layoutRule, validate, ctrl.update);
router.patch('/:id', mongoIdParam(), layoutRule, validate, ctrl.update);
router.patch('/:id/layout', mongoIdParam(), layoutRule, validate, ctrl.updateLayout);
router.post('/:id/favorite', mongoIdParam(), body('favorite').optional().isBoolean(), validate, ctrl.favorite);
router.delete('/:id', mongoIdParam(), validate, ctrl.remove);
router.post('/:id/expand/:nodeId', aiHeavy, mongoIdParam(), param('nodeId').isString().isLength({ min: 1, max: 120 }), validate, dailyQuota('expand', 'node expansions'), ctrl.expandNode);

module.exports = router;
