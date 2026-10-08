const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  getLeaveReport, getDailyReport, getMonthlyReport, getEmployeeReport, getDepartmentReport, exportReport,
} = require('../controllers/reportController');

router.use(authenticate, authorize('reports:view'));

router.get('/leave', getLeaveReport);
router.get('/daily', getDailyReport);
router.get('/monthly', getMonthlyReport);
router.get('/employee/:id', getEmployeeReport);
router.get('/department', getDepartmentReport);
router.get('/export', authorize('reports:export'), exportReport);

module.exports = router;
