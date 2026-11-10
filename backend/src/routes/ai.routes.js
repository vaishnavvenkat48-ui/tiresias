const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const ctrl = require('../controllers/ai.controller');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { dailyQuota } = require('../services/quota.service');

const router = express.Router();
const aiLimit = rateLimit({
  windowMs: 60 * 1000, max: 20, keyGenerator: (req) => String(req.user?._id || req.ip),
  standardHeaders: true, legacyHeaders: false, validate: false,
  message: { success: false, message: 'Too many AI requests — please wait a minute.' },
});
const daily = dailyQuota('ai', 'AI requests');
const text = (f, max) => body(f).optional().isString().isLength({ max }).withMessage(`${f} is too long.`);

router.use(authMiddleware);
router.post('/chat', aiLimit, text('message', 4000), text('focus', 160), validate, daily, ctrl.chat);
router.get('/conversations', ctrl.listConversations);
router.get('/conversations/:id', ctrl.getConversation);
router.delete('/conversations/:id', ctrl.deleteConversation);
router.post('/explain', aiLimit, body('topic').isString().trim().isLength({ min: 1, max: 160 }), text('context', 160), validate, daily, ctrl.explain);
router.post('/recommendations', aiLimit, daily, ctrl.recommendations);

module.exports = router;
