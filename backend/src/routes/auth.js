const router = require('express').Router();
const Joi = require('joi');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const { loginRateLimiter } = require('../middleware/rateLimiter');
const { login, logout, getMe, changePassword, adminResetPassword } = require('../controllers/authController');

const loginSchema = Joi.object({
  email: Joi.string().email(),
  employeeId: Joi.string(),
  password: Joi.string().required(),
}).or('email', 'employeeId');

router.post('/login', loginRateLimiter, validate(loginSchema), login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, changePassword);
router.post('/reset-password/:id', authenticate, authorize('employees:edit'), adminResetPassword);

module.exports = router;
