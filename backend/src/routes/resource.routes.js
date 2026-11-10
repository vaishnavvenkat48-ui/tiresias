const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('express-validator');
const ctrl = require('../controllers/resource.controller');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');

const router = express.Router();
const topicRule = query('topic').isString().trim().isLength({ min: 1, max: 160 }).withMessage('topic (1–160 chars) is required.');
const perUser = rateLimit({
  windowMs: 60 * 1000, max: 90, keyGenerator: (req) => String(req.user?._id || req.ip),
  standardHeaders: true, legacyHeaders: false, validate: false,
  message: { success: false, message: 'Too many resource requests — slow down a little.' },
});

router.use(authMiddleware, perUser);
router.get('/videos', topicRule, validate, ctrl.videos);
router.get('/images', topicRule, validate, ctrl.images);
router.get('/research', topicRule, validate, ctrl.research);
router.get('/topic', topicRule, query('wikidataId').optional().matches(/^Q\d+$/), validate, ctrl.topic);

module.exports = router;
