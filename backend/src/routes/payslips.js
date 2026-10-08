const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/payslipController');

router.use(authenticate);

router.get('/my', authorize('payslips:view_own'), ctrl.getMyPayslips);
router.get('/', authorize('payslips:view_all', 'payslips:manage'), ctrl.listPayslips);
router.get('/:id', ctrl.getPayslip);
router.get('/:id/pdf', ctrl.downloadPayslipPdf);
router.post('/bulk-generate', authorize('payslips:manage'), ctrl.bulkGeneratePayslips);
router.post('/', authorize('payslips:manage'), ctrl.upsertPayslip);
router.put('/:id/publish', authorize('payslips:manage'), ctrl.publishPayslip);
router.delete('/:id', authorize('payslips:manage'), ctrl.deletePayslip);

module.exports = router;
