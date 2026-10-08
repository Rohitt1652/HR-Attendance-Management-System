const router = require('express').Router();
const fs = require('fs');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  applyLeave, getMyLeaves, getAllLeaves, approveLeave, rejectLeave, deleteLeave, editLeave,
  getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  getMyBalance, getAllocations, updateAllocation, getLeaveAnalytics, getLeaveSummary, getMonthlyRecord,
  getLeaveProof, leaveProofUpload,
} = require('../controllers/leaveController');

// Leave types
router.get('/types', authenticate, getLeaveTypes);
router.post('/types', authenticate, authorize('settings:edit'), createLeaveType);
router.put('/types/:id', authenticate, authorize('settings:edit'), updateLeaveType);
router.delete('/types/:id', authenticate, authorize('settings:edit'), deleteLeaveType);

// Leave balance
router.get('/balance', authenticate, getMyBalance);

// Allocations (admin)
router.get('/allocations', authenticate, authorize('settings:view'), getAllocations);
router.put('/allocations', authenticate, authorize('settings:edit'), updateAllocation);

// Leave applications
router.use(authenticate);
if (!fs.existsSync('uploads/leaves')) {
  fs.mkdirSync('uploads/leaves', { recursive: true });
}
router.post('/', authorize('leaves:apply'), (req, res, next) => {
  leaveProofUpload.single('proof')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, applyLeave);
router.get('/my', authorize('leaves:view_own'), getMyLeaves);
router.get('/', authorize('leaves:view_all'), getAllLeaves);
router.get('/analytics', authorize('reports:view'), getLeaveAnalytics);
router.get('/summary', authorize('leave_summary:view'), getLeaveSummary);
router.get('/monthly-record', authorize('monthly_record:view'), getMonthlyRecord);
router.get('/:id/proof', getLeaveProof);
router.put('/:id/approve', authorize('leaves:approve'), approveLeave);
router.put('/:id/reject', authorize('leaves:approve'), rejectLeave);
router.put('/:id', authorize('leaves:apply', 'leaves:delete'), editLeave);
router.delete('/:id', authorize('leaves:apply', 'leaves:delete'), deleteLeave);

module.exports = router;
