const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const ctrl = require('../controllers/cafeMenuController');

// Multer and AI controller are handled directly in app.js for the parse-pdf route

router.use(authenticate);

router.get('/', ctrl.getAllMenus);
router.get('/today', ctrl.getTodayMenu);
router.get('/config', ctrl.getCafeConfig);
router.put('/config', authorize('cafe:manage'), ctrl.updateCafeConfig);

// Note: parse-pdf and import-parsed are registered directly in app.js

// Sync item images across duplicate items on different days
router.post('/sync/images', authorize('settings:edit'), ctrl.syncItemImages);

router.get('/:day', ctrl.getDayMenu);

// Admin only
router.put('/:day', authorize('settings:edit'), ctrl.updateDayMenu);
router.post('/:day/items', authorize('settings:edit'), ctrl.addItem);
router.put('/:day/items/:itemId', authorize('settings:edit'), ctrl.updateItem);
router.delete('/:day/items/:itemId', authorize('settings:edit'), ctrl.deleteItem);

module.exports = router;
