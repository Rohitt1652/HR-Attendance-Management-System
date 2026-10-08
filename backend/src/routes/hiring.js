const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  getJobs, createJob, updateJob, deleteJob,
  getCandidates, createCandidate, updateCandidate, deleteCandidate,
  getInterviews, scheduleInterview, updateInterview, deleteInterview,
  uploadResume, uploadCandidateResume,
} = require('../controllers/jobController');

router.use(authenticate);

// Jobs
router.get('/jobs', getJobs);
router.post('/jobs', authorize('hiring:manage'), createJob);
router.put('/jobs/:id', authorize('hiring:manage'), updateJob);
router.delete('/jobs/:id', authorize('hiring:manage'), deleteJob);

// Candidates
router.get('/candidates', authorize('hiring:manage'), getCandidates);
router.post('/candidates', authorize('hiring:manage'), createCandidate);
router.put('/candidates/:id', authorize('hiring:manage'), updateCandidate);
router.delete('/candidates/:id', authorize('hiring:manage'), deleteCandidate);
router.post('/candidates/:id/resume', authorize('hiring:manage'), uploadResume, uploadCandidateResume);

// Interviews
router.get('/interviews', authorize('hiring:manage'), getInterviews);
router.post('/interviews', authorize('hiring:manage'), scheduleInterview);
router.put('/interviews/:id', authorize('hiring:manage'), updateInterview);
router.delete('/interviews/:id', authorize('hiring:manage'), deleteInterview);

module.exports = router;
