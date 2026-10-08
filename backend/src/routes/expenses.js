const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  submitExpense,
  getMyExpenses,
  getAllExpenses,
  approveExpense,
  rejectExpense,
  markPaid,
  deleteExpense,
  getExpenseSummary,
} = require('../controllers/expenseController');

// All routes require authentication
router.use(authenticate);

// Employee routes
router.post('/', submitExpense);
router.get('/my', getMyExpenses);

// HR/admin routes
router.get('/summary', authorize('reports:view'), getExpenseSummary);
router.get('/', authorize('reports:view'), getAllExpenses);
router.put('/:id/approve', authorize('reports:view'), approveExpense);
router.put('/:id/reject', authorize('reports:view'), rejectExpense);

// Admin-only routes
router.put('/:id/mark-paid', authorize('settings:edit'), markPaid);
router.delete('/:id', authorize('expenses:view_own', 'expenses:manage'), deleteExpense);

module.exports = router;
