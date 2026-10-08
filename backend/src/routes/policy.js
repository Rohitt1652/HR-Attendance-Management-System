const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/policyController');

router.use(authenticate);

router.get('/', ctrl.listPolicies);
router.get('/pending', ctrl.getPendingPolicies);
router.get('/acceptance-report', authorize('settings:edit', 'leaves:view_all'), ctrl.getAcceptanceReport);
router.post('/:id/accept', ctrl.acceptPolicy);
router.get('/:id/file', authorize('policy:view'), ctrl.getPolicyFile);
router.post('/', authorize('settings:edit'), ctrl.upload.single('file'), ctrl.createPolicy);
router.put('/:id', authorize('settings:edit'), ctrl.upload.single('file'), ctrl.updatePolicy);
router.delete('/:id', authorize('settings:edit'), ctrl.deletePolicy);

module.exports = router;
