require('./helpers/testEnv');

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { connectTestDb, disconnectTestDb, clearCollections } = require('./helpers/testDb');
const {
  seedRoles,
  seedUsers,
  authHeader,
  seedPayslips,
  seedDocument,
  PASSWORD,
} = require('./helpers/fixtures');

let app;
let users;
let payslips;

test.before(async () => {
  await connectTestDb();
  app = require('../app');
});

test.beforeEach(async () => {
  await clearCollections();
  await seedRoles();
  users = await seedUsers();
  payslips = await seedPayslips(users.employee, users.otherEmployee);
});

test.after(async () => {
  await disconnectTestDb();
});

test('blocks inactive users at login', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: users.inactiveEmployee.email, password: PASSWORD });

  assert.equal(res.status, 403);
  assert.match(res.body.message, /inactive/i);
});

test('allows active users to login', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: users.employee.email, password: PASSWORD });

  assert.equal(res.status, 200);
  assert.ok(res.body.data.token);
});

test('forbids employees from resetting another user password', async () => {
  const res = await request(app)
    .post(`/api/auth/reset-password/${users.otherEmployee._id}`)
    .set(authHeader(users.employee._id))
    .send({ newPassword: 'NewPass@123' });

  assert.equal(res.status, 403);
});

test('allows HR to reset another user password', async () => {
  const res = await request(app)
    .post(`/api/auth/reset-password/${users.employee._id}`)
    .set(authHeader(users.hrUser._id))
    .send({ newPassword: 'ResetPass@123' });

  assert.equal(res.status, 200);
});

test('forbids employees from reading another users payslip', async () => {
  const res = await request(app)
    .get(`/api/payslips/${payslips.otherDraft._id}`)
    .set(authHeader(users.employee._id));

  assert.equal(res.status, 403);
});

test('forbids employees from reading their own draft payslip', async () => {
  const res = await request(app)
    .get(`/api/payslips/${payslips.ownDraft._id}`)
    .set(authHeader(users.employee._id));

  assert.equal(res.status, 403);
});

test('allows employees to read their own published payslip', async () => {
  const res = await request(app)
    .get(`/api/payslips/${payslips.ownPublished._id}`)
    .set(authHeader(users.employee._id));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'Published');
});

test('allows HR to read any payslip', async () => {
  const res = await request(app)
    .get(`/api/payslips/${payslips.otherDraft._id}`)
    .set(authHeader(users.hrUser._id));

  assert.equal(res.status, 200);
});

test('requires authentication for protected uploads', async () => {
  const filename = 'protected-test.pdf';
  const uploadDir = path.resolve('uploads/documents');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), 'secret pdf content');
  await seedDocument(users.employee, filename);

  const unauth = await request(app).get(`/uploads/documents/${filename}`);
  assert.equal(unauth.status, 401);

  const forbidden = await request(app)
    .get(`/uploads/documents/${filename}`)
    .set(authHeader(users.otherEmployee._id));
  assert.equal(forbidden.status, 403);

  const allowed = await request(app)
    .get(`/uploads/documents/${filename}`)
    .set(authHeader(users.employee._id));
  assert.equal(allowed.status, 200);
});
