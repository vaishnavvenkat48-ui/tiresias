const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const ctrl = require('../controllers/user.controller');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { profileRules } = require('../validators/rules');

const router = express.Router();
const sensitive = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyGenerator: (req) => String(req.user?._id || req.ip), validate: false, message: { success: false, message: 'Too many attempts — try again later.' } });
const newPassword = body('newPassword')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
  .matches(/[A-Z]/).withMessage('Password must include an uppercase letter.')
  .matches(/[a-z]/).withMessage('Password must include a lowercase letter.')
  .matches(/[0-9]/).withMessage('Password must include a number.')
  .matches(/[^A-Za-z0-9]/).withMessage('Password must include a symbol.');

router.use(authMiddleware);
router.get('/profile', ctrl.getProfile);
router.put('/profile', profileRules, validate, ctrl.updateProfile);
router.patch('/profile', profileRules, validate, ctrl.updateProfile);
router.patch('/preferences', body('theme').optional().isIn(['dark', 'light', 'system']), body('visualMode').optional().isString().isLength({ max: 30 }), validate, ctrl.updatePreferences);
router.patch('/password', sensitive, body('currentPassword').isString().notEmpty().withMessage('Current password is required.'), newPassword, validate, ctrl.changePassword);
router.delete('/account', sensitive, body('password').isString().notEmpty().withMessage('Password confirmation is required.'), validate, ctrl.deleteAccount);

module.exports = router;
