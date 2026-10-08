const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

router.use(authenticate);
router.get('/', ctrl.getMyNotifications);
router.put('/read-all', ctrl.markRead);
router.put('/:id/read', ctrl.markOneRead);
router.delete('/:id', ctrl.deleteNotification);

module.exports = router;
