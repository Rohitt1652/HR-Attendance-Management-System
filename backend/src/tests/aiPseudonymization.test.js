const test = require('node:test');
const assert = require('node:assert/strict');
const { connectTestDb, disconnectTestDb, clearCollections } = require('./helpers/testDb');

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { detectAnomalies } = require('../controllers/aiController');

test('AI Pseudonymization & Privacy Safety Test Suite', async (t) => {
  t.before(async () => {
    await connectTestDb();
  });

  t.after(async () => {
    await disconnectTestDb();
  });

  t.beforeEach(async () => {
    await clearCollections();
  });

  await t.test('1. Rule-based fallback returns structured anomalies when Groq API key is missing', async () => {
    const origKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      const emp = await User.create({ name: 'Sensitive User', employeeId: 'SENS001', department: 'Engineering', password: 'Password@123', status: 'Active' });
      for (let i = 1; i <= 4; i++) {
        await Attendance.create({
          employeeId: emp._id,
          date: `2026-09-0${i}`,
          status: 'Present',
          isLate: true,
        });
      }

      const req = { query: { month: '9', year: '2026' }, user: { role: 'admin' } };
      let result = null;
      const res = { json: (data) => { result = data; } };

      await detectAnomalies(req, res, () => {});

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.isFallback, true);
      assert.strictEqual(result.data.length, 1);
      assert.strictEqual(result.data[0].employeeName, 'Sensitive User');
      assert.strictEqual(result.data[0].department, 'Engineering');
      assert.ok(result.data[0].issue.includes('4 late check-ins'));
    } finally {
      process.env.GROQ_API_KEY = origKey;
    }
  });

  await t.test('2. Empty attendance returns success response with zero anomalies', async () => {
    const req = { query: { month: '9', year: '2026' }, user: { role: 'admin' } };
    let result = null;
    const res = { json: (data) => { result = data; } };

    await detectAnomalies(req, res, () => {});

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.length, 0);
    assert.strictEqual(result.message, 'No attendance data for this period.');
  });
});
