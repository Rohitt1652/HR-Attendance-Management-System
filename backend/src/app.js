const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimiter = require('./middleware/rateLimiter');
const { loginRateLimiter, aiRateLimiter } = rateLimiter;

const app = express();

app.set('trust proxy', 1);

// When ALLOWED_ORIGINS is not set, allow all origins (FTP deploys without .env files).
// Set ALLOWED_ORIGINS in production to lock down to your frontend URL(s).
const rawOrigins = process.env.ALLOWED_ORIGINS?.trim();
const allowedOrigins = rawOrigins
  ? rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

// CORS — must be before all routes
const corsOptions = {
  origin: (origin, callback) => {
    if (!allowedOrigins || !origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight for all routes

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiter (applied to all API routes)
app.use('/api', rateLimiter);

const authenticate = require('./middleware/auth');
const authorize = require('./middleware/rbac');
const fileCtrl = require('./controllers/fileController');

// Protected uploads — requires auth cookie or bearer token
app.get(/^\/uploads\/(.+)/, authenticate, (req, res, next) => {
  req.params = { 0: req.params[0] };
  return fileCtrl.serveUpload(req, res, next);
});
app.get(/^\/api\/files\/(.+)/, authenticate, (req, res, next) => {
  req.params = { 0: req.params[0] };
  return fileCtrl.serveUpload(req, res, next);
});
const multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const aiCtrl = require('./controllers/cafeMenuAiController');

app.post('/api/cafe-menu/parse-pdf',
  authenticate,
  authorize('settings:edit', 'cafe:manage'),
  (req, res, next) => {
    multerUpload.single('pdf')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  aiCtrl.parsePdf
);

app.post('/api/cafe-menu/import-parsed',
  authenticate,
  authorize('settings:edit', 'cafe:manage'),
  aiCtrl.importParsed
);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/fun-teams', require('./routes/funTeams'));
app.use('/api/policies', require('./routes/policy'));
app.use('/api/download-forms', require('./routes/downloadForms'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/cafe-menu', require('./routes/cafeMenu'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/payslips', require('./routes/payslips'));
app.use('/api/calendar-events', require('./routes/calendarEvents'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/hiring', require('./routes/hiring'));
app.use('/api/training', require('./routes/training'));
app.use('/api/cv', require('./routes/cv'));
app.use('/api/cafe-orders', require('./routes/cafeOrders'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/office-tasks', require('./routes/officeTasks'));
app.use('/api/ai', aiRateLimiter, require('./routes/ai'));
app.use('/api/departments', require('./routes/departments'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';
  res.status(status).json({ success: false, message });
});

module.exports = app;
