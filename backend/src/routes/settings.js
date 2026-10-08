const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const {
  getSettings, updateSettings, addHoliday, removeHoliday,
  getDepartments, addDepartment, updateDepartment, removeDepartment,
} = require('../controllers/settingsController');

// Public endpoint — returns only branding fields (no auth required, used on login page)
router.get('/public', async (req, res, next) => {
  try {
    const Settings = require('../models/Settings');
    const s = await Settings.getGlobal();
    res.json({
      success: true,
      data: {
        companyName: s.companyName,
        companyTagline: s.companyTagline,
        companyLogo: s.companyLogo,
        companyFavicon: s.companyFavicon,
      },
    });
  } catch (err) { next(err); }
});

router.use(authenticate);

router.get('/', getSettings); // All authenticated users can read settings
router.put('/', authorize('settings:edit'), updateSettings);
router.post('/holidays', authorize('holidays:create', 'holidays:manage'), addHoliday);
router.delete('/holidays/:date', authorize('holidays:delete', 'holidays:manage'), removeHoliday);

// Departments
router.get('/departments', getDepartments);
router.post('/departments', authorize('settings:edit'), addDepartment);
router.put('/departments', authorize('settings:edit'), updateDepartment);
router.delete('/departments/:name', authorize('settings:edit'), removeDepartment);

module.exports = router;
