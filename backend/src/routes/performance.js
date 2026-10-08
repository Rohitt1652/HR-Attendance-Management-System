const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/performanceController');

router.use(authenticate);

router.get('/my', authorize('performance:view_own'), ctrl.getMyReviews);
router.get('/summary', authorize('performance:view_all'), ctrl.getTeamSummary);
router.get('/reviewable-employees', authorize('performance:manage', 'performance:manage_team'), ctrl.getReviewableEmployees);
router.get('/', authorize('performance:view_all'), ctrl.listReviews);
router.get('/:id', authorize('performance:view_own', 'performance:view_all'), ctrl.getReview);
router.post('/', authorize('performance:manage', 'performance:manage_team'), ctrl.upsertReview);
router.put('/:id/publish', authorize('performance:manage', 'performance:manage_team'), ctrl.publishReview);
router.delete('/:id', authorize('performance:manage', 'performance:manage_team'), ctrl.deleteReview);

module.exports = router;
