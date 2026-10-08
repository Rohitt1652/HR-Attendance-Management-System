const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  getTrainings, createTraining, updateTraining, deleteTraining,
  getEnrollments, getMyEnrollments, enrollUser, updateEnrollment,
  collectTrainingPayment, getTrainingPaymentSummary,
} = require('../controllers/trainingController');

router.use(authenticate);

// Trainings
router.get('/', getTrainings);
router.post('/', authorize('training:manage'), createTraining);
router.put('/:id', authorize('training:manage'), updateTraining);
router.delete('/:id', authorize('training:manage'), deleteTraining);

// Enrollments
router.get('/enrollments', authorize('training:manage'), getEnrollments);
router.get('/my-enrollments', getMyEnrollments);
router.post('/enroll', enrollUser);
router.put('/enrollments/:id', authorize('training:manage'), updateEnrollment);
router.post('/enrollments/:id/payment', authorize('training:manage'), collectTrainingPayment);
router.get('/:trainingId/payment-summary', authorize('training:manage'), getTrainingPaymentSummary);

module.exports = router;
