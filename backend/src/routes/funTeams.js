const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/funTeamController');

router.use(authenticate);

// All authenticated users can view
router.get('/', ctrl.listTeams);
router.get('/:id', ctrl.getTeam);

// Only admins/hr can manage
router.post('/', authorize('employees:create'), ctrl.upload.single('logo'), ctrl.createTeam);
router.put('/:id', authorize('employees:edit'), ctrl.upload.single('logo'), ctrl.updateTeam);
router.delete('/:id', authorize('employees:delete'), ctrl.deleteTeam);
router.post('/:id/members', authorize('employees:edit'), ctrl.addMember);
router.delete('/:id/members/:userId', authorize('employees:edit'), ctrl.removeMember);

// Events
router.post('/:id/events', authorize('employees:edit'), ctrl.uploadEventImages, ctrl.addEvent);
router.put('/:id/events/:eventId', authorize('employees:edit'), ctrl.uploadEventImages, ctrl.updateEvent);
router.delete('/:id/events/:eventId', authorize('employees:edit'), ctrl.deleteEvent);

module.exports = router;
