const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  checkIn, checkOut, assignWfh, getMyAttendance, getAllAttendance, getDashboard, deleteAttendance, getMyDashboardSummary,
} = require('../controllers/attendanceController');
const { uploadMiddleware, previewAttendanceUpload, confirmAttendanceImport } = require('../controllers/attendanceBulkController');
const { getAttendanceReconciliation } = require('../controllers/attendanceReconciliationController');

router.use(authenticate);

router.post('/checkin', authorize('attendance:checkin'), checkIn);
router.post('/checkout', authorize('attendance:checkout'), checkOut);
router.post('/wfh', authorize('attendance:manage_wfh'), assignWfh);
router.get('/my-dashboard-summary', authorize('attendance:view_own'), getMyDashboardSummary);
router.get('/my', authorize('attendance:view_own'), getMyAttendance);
router.get('/dashboard', authorize('attendance:dashboard'), getDashboard);
router.get('/reconciliation', authorize('attendance:view_all'), getAttendanceReconciliation);
router.get('/', authorize('attendance:view_all'), getAllAttendance);
router.delete('/:id', authorize('attendance:delete'), deleteAttendance);
router.post('/bulk-upload/preview', authorize('attendance:import'), uploadMiddleware, previewAttendanceUpload);
router.post('/bulk-upload/confirm', authorize('attendance:import'), confirmAttendanceImport);

module.exports = router;
