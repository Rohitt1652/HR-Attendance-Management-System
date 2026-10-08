process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
