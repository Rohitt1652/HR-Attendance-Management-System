const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/aiController');

router.use(authenticate);

router.post('/chat', ctrl.chat);
router.post('/parse-leave', authorize('leaves:apply'), ctrl.parseLeaveRequest);
router.post('/generate-review', authorize('performance:manage', 'performance:manage_team'), ctrl.generateReview);
router.get('/attendance-anomalies', authorize('reports:view', 'attendance:dashboard'), ctrl.detectAnomalies);
router.post('/generate-job-description', authorize('hiring:manage'), ctrl.generateJobDescription);
router.post('/generate-announcement', authorize('announcements:create'), ctrl.generateAnnouncement);
router.get('/expense-insights', authorize('expenses:manage', 'expenses:view_all'), ctrl.expenseInsights);
router.post('/parse-expense', authorize('expenses:view_own', 'expenses:manage'), ctrl.parseExpense);
router.get('/task-insights', authorize('tasks:manage'), ctrl.taskInsights);
router.post('/parse-task', authorize('tasks:manage'), ctrl.parseTask);

module.exports = router;
