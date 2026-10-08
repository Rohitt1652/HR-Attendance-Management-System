const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/officeTaskController');

router.use(authenticate);

router.get('/stats', authorize('reports:view'), ctrl.getStats);
router.get('/', ctrl.listTasks);
router.post('/', ctrl.createTask);
router.get('/:id', ctrl.getTask);
router.put('/:id', ctrl.updateTask);
router.post('/:id/submit-expense', ctrl.submitExpense);
router.put('/:id/approve-expense', authorize('reports:view'), ctrl.approveExpense);
router.put('/:id/reject-expense', authorize('reports:view'), ctrl.rejectExpense);
router.delete('/:id', authorize('settings:edit'), ctrl.deleteTask);

module.exports = router;
