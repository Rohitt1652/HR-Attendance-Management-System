const router = require('express').Router();
const multer = require('multer');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  createEmployee, listEmployees, getEmployee,
  updateEmployee, deleteEmployee, searchEmployees,
  uploadPhoto, uploadMyPhoto, getTodayBirthdays, getMonthBirthdays, getUpcomingBirthdays, getMyTeam,
  suggestEmployeeId,
} = require('../controllers/employeeController');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

router.use(authenticate);

// Public team endpoint — any authenticated user can see the team
router.get('/team', async (req, res, next) => {
  try {
    const User = require('../models/User');
    const Department = require('../models/Department');
    const employees = await User.find({ status: 'Active' })
      .select('name email phone department designation role employeeId profilePhotoUrl joiningDate teamLeadId')
      .sort({ name: 1 })
      .lean();
    const departments = await Department.find({ status: 'active' }).select('name teamLeaderId').lean();
    const deptLeadMap = Object.fromEntries(departments.filter(d => d.teamLeaderId).map(d => [d.name, d.teamLeaderId]));
    const enriched = employees.map(emp => ({
      ...emp,
      resolvedTeamLeadId: emp.teamLeadId || deptLeadMap[emp.department] || null,
    }));
    res.json({ success: true, data: enriched, pagination: { total: enriched.length, page: 1, pages: 1, limit: enriched.length } });
  } catch (err) { next(err); }
});

router.get('/birthdays/today', getTodayBirthdays);
router.get('/birthdays/upcoming', authenticate, getUpcomingBirthdays);
router.get('/birthdays/month/:month', authenticate, getMonthBirthdays);
router.get('/my-team', getMyTeam); // Employee sees TL, TL sees team members
router.post('/me/photo', upload.single('photo'), uploadMyPhoto);
router.get('/search', authorize('employees:view'), searchEmployees);
router.get('/suggest-id', authenticate, suggestEmployeeId);
router.get('/', authorize('employees:view'), listEmployees);
router.post('/', authorize('employees:create'), createEmployee);
router.get('/:id', authorize('employees:view'), getEmployee);
router.put('/:id', authorize('employees:edit', 'employees:edit_team'), updateEmployee);
router.delete('/:id', authorize('employees:delete'), deleteEmployee);
router.post('/:id/photo', authorize('employees:edit', 'employees:edit_team'), upload.single('photo'), uploadPhoto);

module.exports = router;
