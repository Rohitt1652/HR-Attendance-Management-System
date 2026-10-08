const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/announcementController');

router.use(authenticate);
router.get('/', ctrl.getAnnouncements);
router.post('/', authorize('announcements:create'), ctrl.createAnnouncement);
router.put('/:id', authorize('announcements:create'), ctrl.updateAnnouncement);
router.delete('/:id', authorize('announcements:create'), ctrl.deleteAnnouncement);

module.exports = router;
