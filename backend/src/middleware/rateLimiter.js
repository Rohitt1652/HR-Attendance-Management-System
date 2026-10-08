const rateLimit = require('express-rate-limit');

const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false'
  && (process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_ENABLED === 'true');

const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !rateLimitEnabled,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !rateLimitEnabled,
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.',
  },
});

const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !rateLimitEnabled,
  message: {
    success: false,
    message: 'Too many AI requests, please try again later.',
  },
});

module.exports = rateLimiter;
module.exports.loginRateLimiter = loginRateLimiter;
module.exports.aiRateLimiter = aiRateLimiter;
