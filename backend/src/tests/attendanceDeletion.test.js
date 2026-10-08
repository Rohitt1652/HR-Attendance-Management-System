const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectTestDb, disconnectTestDb, clearCollections } = require('./helpers/testDb');

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { deleteAttendance } = require('../controllers/attendanceController');
const authorize = require('../middleware/rbac');

test('Attendance Deletion Safety & Permission Test Suite', async (t) => {
  t.before(async () => {
    await connectTestDb();
  });

  t.after(async () => {
    await disconnectTestDb();
  });

  t.beforeEach(async () => {
    await clearCollections();
  });

  await t.test('1. Synthetic ID returns controlled HTTP 400 without CastError stack trace', async () => {
    const req = { params: { id: 'wfh-66d1a55c57e03ae02432a232-2026-08-01' } };
    let statusCode = 200;
    let result = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { result = data; },
    };

    await deleteAttendance(req, res, () => {});

    assert.strictEqual(statusCode, 400);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.message, 'This attendance record cannot be deleted.');
    assert.strictEqual(result.stack, undefined);
  });

  await t.test('2. Malformed string ID returns controlled HTTP 400', async () => {
    const req = { params: { id: 'invalid-id-xyz-123' } };
    let statusCode = 200;
    let result = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { result = data; },
    };

    await deleteAttendance(req, res, () => {});

    assert.strictEqual(statusCode, 400);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.message, 'This attendance record cannot be deleted.');
  });

  await t.test('3. Valid nonexistent ObjectId returns controlled HTTP 404', async () => {
    const req = { params: { id: new mongoose.Types.ObjectId().toString() } };
    let statusCode = 200;
    let result = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { result = data; },
    };

    await deleteAttendance(req, res, () => {});

    assert.strictEqual(statusCode, 404);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.message, 'Attendance record not found');
  });

  await t.test('4. Existing valid record deletion with permission', async () => {
    const emp = await User.create({ name: 'Emp Test', employeeId: 'E_DEL', password: 'Password@123', status: 'Active' });
    const att = await Attendance.create({ employeeId: emp._id, date: '2026-09-01', status: 'Present' });

    const req = { params: { id: att._id.toString() } };
    let statusCode = 200;
    let result = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { result = data; },
    };

    await deleteAttendance(req, res, () => {});

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.message, 'Attendance record deleted');

    const check = await Attendance.findById(att._id);
    assert.strictEqual(check, null);
  });

  await t.test('5. RBAC Middleware blocks request without attendance:delete permission (HTTP 403)', async () => {
    const middleware = authorize('attendance:delete');
    const req = { permissions: ['attendance:view_all', 'attendance:manage_wfh'] };
    let statusCode = 200;
    let result = null;
    let nextCalled = false;

    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { result = data; },
    };

    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.message, 'Forbidden: requires permission "attendance:delete"');
  });
});
