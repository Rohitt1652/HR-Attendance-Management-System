const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  listRoles, getRole, createRole, updateRole, deleteRole, syncPermissions,
} = require('../controllers/roleController');

router.use(authenticate);

router.get('/', authorize('roles:view'), listRoles);
router.get('/:id', authorize('roles:view'), getRole);
router.post('/', authorize('roles:edit'), createRole);
router.post('/sync-permissions', authorize('roles:edit'), syncPermissions);
router.put('/:id', authorize('roles:edit'), updateRole);
router.delete('/:id', authorize('roles:edit'), deleteRole);

module.exports = router;
