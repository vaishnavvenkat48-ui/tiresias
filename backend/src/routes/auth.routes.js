const express = require('express');
const { register, login, me, logout, refresh } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { registerRules, loginRules } = require('../validators/rules');

const router = express.Router();

router.post('/register', registerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.get('/me', authMiddleware, me);
router.post('/logout', authMiddleware, logout);
router.post('/refresh', refresh);

module.exports = router;
