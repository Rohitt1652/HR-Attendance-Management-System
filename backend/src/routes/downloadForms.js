const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/downloadFormController');

router.use(authenticate);

router.get('/', ctrl.listForms);
router.post('/', authorize('settings:edit'), ctrl.upload.single('file'), ctrl.createForm);
router.put('/:id', authorize('settings:edit'), ctrl.upload.single('file'), ctrl.updateForm);
router.delete('/:id', authorize('settings:edit'), ctrl.deleteForm);
router.post('/:id/download', ctrl.trackDownload);

module.exports = router;
