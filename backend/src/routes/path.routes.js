const express = require('express');
const { body, param } = require('express-validator');
const ctrl = require('../controllers/path.controller');
const ai = require('../controllers/ai.controller');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { mongoIdParam } = require('../validators/rules');
const { dailyQuota } = require('../services/quota.service');

/** Mounted at /api/learning-paths (shelved in the UI; API kept). */
const router = express.Router();
const indexParam = param('index').isInt({ min: 0 }).withMessage('Invalid milestone index.');
const status = body('status').isIn(['pending', 'in_progress', 'completed']).withMessage('Invalid status.');

router.use(authMiddleware);
router.post('/generate', dailyQuota('ai', 'AI requests'), body('topic').isString().trim().isLength({ min: 1, max: 160 }), body('level').optional().isIn(['beginner', 'intermediate', 'advanced']), validate, ai.learningPath);
router.get('/', ctrl.list);
router.get('/:id', mongoIdParam(), validate, ctrl.getById);
router.patch('/:id', mongoIdParam(), body('order').optional().isArray({ max: 50 }), validate, ctrl.update);
router.patch('/:id/progress', mongoIdParam(), body('index').optional().isInt({ min: 0 }), body('stageIndex').optional().isInt({ min: 0 }), status, validate, ctrl.progress);
router.delete('/:id', mongoIdParam(), validate, ctrl.remove);
router.post(
  '/:id/milestones',
  mongoIdParam(),
  body('title').trim().notEmpty().withMessage('Milestone title is required.').isLength({ max: 200 }),
  body('description').optional().isLength({ max: 2000 }),
  validate,
  ctrl.addMilestone
);
router.patch('/:id/milestones/:index', mongoIdParam(), indexParam, status, validate, ctrl.updateMilestone);
router.delete('/:id/milestones/:index', mongoIdParam(), indexParam, validate, ctrl.removeMilestone);

module.exports = router;
