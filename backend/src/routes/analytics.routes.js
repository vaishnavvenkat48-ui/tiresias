const express = require('express');
const ctrl = require('../controllers/analytics.controller');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

/**
 * All endpoints are scoped to the authenticated user, except /admin/* which
 * exposes platform-wide numbers to admins only.
 * Filters: ?days=7|30|90 or ?from=YYYY-MM-DD&to=YYYY-MM-DD, ?category=, ?tz=IANA
 */
const router = express.Router();
router.use(authMiddleware);

router.get('/overview', ctrl.overview);
router.get('/activity', ctrl.activity);
router.get('/topics', ctrl.topics);
router.get('/categories', ctrl.categories);
router.get('/graphs', ctrl.graphs);
router.get('/me', ctrl.me);
router.get('/me/activity', ctrl.myActivity);

router.get('/dashboard', authorize('ADMIN'), ctrl.dashboard);
router.get('/admin/users', authorize('ADMIN'), ctrl.users);
router.get('/admin/topics', authorize('ADMIN'), ctrl.platformTopics);
router.get('/admin/activity', authorize('ADMIN'), ctrl.platformActivity);
router.get('/users', authorize('ADMIN'), ctrl.users);

module.exports = router;
