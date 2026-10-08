const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  listDepartments, getDepartment, createDepartment,
  updateDepartment, updateDepartmentStatus, deleteDepartment, getDepartmentNames,
} = require('../controllers/departmentController');

router.use(authenticate);

// Lightweight list for dropdowns
router.get('/names', authorize('departments:view'), getDepartmentNames);

// Full CRUD
router.get('/', authorize('departments:view'), listDepartments);
router.get('/:id', authorize('departments:view'), getDepartment);
router.post('/', authorize('departments:create'), createDepartment);
router.put('/:id', authorize('departments:edit'), updateDepartment);
router.patch('/:id', authorize('departments:edit'), updateDepartment);
router.patch('/:id/status', authorize('departments:delete', 'departments:manage-status'), updateDepartmentStatus);
router.delete('/:id', authorize('departments:delete', 'departments:manage-status'), deleteDepartment);

module.exports = router;
