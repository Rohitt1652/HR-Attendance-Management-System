const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  placeOrder, getMyOrders, getAllOrders,
  updateOrderStatus, cancelOrder, deleteOrder,
  submitPayment, collectPayment, getPaymentSummary,
} = require('../controllers/cafeOrderController');

router.use(authenticate);

// Employee
router.post('/', placeOrder);
router.get('/my', getMyOrders);
router.put('/:id/cancel', cancelOrder);
router.post('/:id/submit-payment', submitPayment); // employee submits proof

// Admin
router.get('/', authorize('cafe:manage'), getAllOrders);
router.put('/:id/status', authorize('cafe:manage'), updateOrderStatus);
router.delete('/:id', authorize('cafe:manage'), deleteOrder);
router.post('/:id/payment', authorize('cafe:manage'), collectPayment);
router.get('/summary/payments', authorize('cafe:manage'), getPaymentSummary);

module.exports = router;
