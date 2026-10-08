const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const { getMyCV, updateMyCV, uploadCVFile, getCVById, getAllCVs, upload } = require('../controllers/cvController');

router.use(authenticate);

router.get('/my', getMyCV);
router.put('/my', updateMyCV);
router.post('/my/upload', upload.single('cv'), uploadCVFile);
router.get('/', authorize('employees:view'), getAllCVs);
router.get('/:id', authorize('employees:view'), getCVById);

module.exports = router;
