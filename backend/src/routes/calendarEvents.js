const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/calendarEventController');

router.use(authenticate);
router.get('/', authorize('calendar:view'), ctrl.getEvents);
router.post('/', ctrl.createEvent);
router.put('/:id', ctrl.updateEvent);
router.delete('/:id', ctrl.deleteEvent);

module.exports = router;
