const test = require('node:test');
const assert = require('node:assert/strict');
const { connectTestDb, disconnectTestDb, clearCollections } = require('./helpers/testDb');

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Policy = require('../models/Policy');
const PolicyAcceptance = require('../models/PolicyAcceptance');
const Settings = require('../models/Settings');
const { getMyDashboardSummary, getMyAttendance } = require('../controllers/attendanceController');
const { getTodayBusinessDate } = require('../utils/businessDateUtils');

test('Employee Dashboard Summary Refined Business Logic Test Suite', async (t) => {
  t.before(async () => {
    await connectTestDb();
  });

  t.after(async () => {
    await disconnectTestDb();
  });

  t.beforeEach(async () => {
    await clearCollections();
  });

  await t.test('1. Employee Self-Scope: req.user._id is authoritative and ignores query/body employeeId tampering', async () => {
    const emp1 = await User.create({ name: 'Employee One', email: 'emp1@test.com', employeeId: 'EMP001', role: 'employee', password: 'Password@123', status: 'Active' });
    const emp2 = await User.create({ name: 'Employee Two', email: 'emp2@test.com', employeeId: 'EMP002', role: 'employee', password: 'Password@123', status: 'Active' });

    // Create a pending leave for emp2
    await Leave.create({
      employeeId: emp2._id,
      leaveType: 'Casual Leave',
      leaveTypeCode: 'CL',
      startDate: new Date('2026-09-20'),
      endDate: new Date('2026-09-21'),
      status: 'Pending',
      reason: 'Personal',
    });

    // emp1 requests summary, but malicious query parameter attempts to pass emp2._id
    const req = {
      user: emp1,
      query: { employeeId: emp2._id.toString() },
      body: { employeeId: emp2._id.toString() },
    };

    let statusCode = 200;
    let resultData = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { resultData = data; },
    };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(resultData.success, true);
    // emp1 has 0 pending requests, while emp2 has 1
    assert.strictEqual(resultData.data.kpis.awaitingApproval, 0);
  });

  await t.test('2. No Biometric Upload for Today produces "Regular Working Day" when no approved exception exists', async () => {
    const emp = await User.create({ name: 'Normal Emp', email: 'norm@test.com', employeeId: 'EMP_NORM', role: 'employee', password: 'Password@123', status: 'Active' });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.strictEqual(resultData.data.todayWorkStatus.primaryStatus, 'working_day');
    assert.strictEqual(resultData.data.todayWorkStatus.title, 'Regular Working Day');
    assert.strictEqual(resultData.data.todayWorkStatus.subtitle, 'No approved leave or WFH today');
  });

  await t.test('3. Approved Full-Day Leave Today returns "On Leave"', async () => {
    const emp = await User.create({ name: 'On Leave Emp', email: 'leave@test.com', employeeId: 'EMP_LEAVE', role: 'employee', password: 'Password@123', status: 'Active' });
    const todayStr = getTodayBusinessDate();

    await Leave.create({
      employeeId: emp._id,
      leaveType: 'Casual Leave',
      leaveTypeCode: 'CL',
      durationType: 'full_day',
      startDate: new Date(`${todayStr}T00:00:00.000Z`),
      endDate: new Date(`${todayStr}T23:59:59.999Z`),
      status: 'Approved',
      reason: 'Vacation',
    });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.strictEqual(resultData.data.todayWorkStatus.primaryStatus, 'on_leave');
    assert.strictEqual(resultData.data.todayWorkStatus.title, 'On Leave');
    assert.strictEqual(resultData.data.todayWorkStatus.badgeColor, 'purple');
  });

  await t.test('4. Approved Full-Day WFH Today returns "Work From Home"', async () => {
    const emp = await User.create({ name: 'WFH Emp', email: 'wfh@test.com', employeeId: 'EMP_WFH', role: 'employee', password: 'Password@123', status: 'Active' });
    const todayStr = getTodayBusinessDate();

    await Leave.create({
      employeeId: emp._id,
      leaveType: 'Work From Home',
      leaveTypeCode: 'WFH',
      durationType: 'full_day',
      startDate: new Date(`${todayStr}T00:00:00.000Z`),
      endDate: new Date(`${todayStr}T23:59:59.999Z`),
      status: 'Approved',
      reason: 'Remote Work',
    });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.strictEqual(resultData.data.todayWorkStatus.primaryStatus, 'wfh');
    assert.strictEqual(resultData.data.todayWorkStatus.title, 'Work From Home');
    assert.strictEqual(resultData.data.todayWorkStatus.subtitle, 'Approved for today');
    assert.strictEqual(resultData.data.todayWorkStatus.badgeColor, 'blue');
  });

  await t.test('5. Short Leave augments "Regular Working Day" instead of replacing it', async () => {
    const emp = await User.create({ name: 'Short Leave Emp', email: 'sl@test.com', employeeId: 'EMP_SL', role: 'employee', password: 'Password@123', status: 'Active' });
    const todayStr = getTodayBusinessDate();

    await Leave.create({
      employeeId: emp._id,
      leaveType: 'Short Leave',
      leaveTypeCode: 'SL',
      durationType: 'hourly',
      startTime: '15:30',
      endTime: '17:30',
      startDate: new Date(`${todayStr}T00:00:00.000Z`),
      endDate: new Date(`${todayStr}T23:59:59.999Z`),
      status: 'Approved',
      reason: 'Doctor Visit',
    });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.strictEqual(resultData.data.todayWorkStatus.primaryStatus, 'working_day');
    assert.strictEqual(resultData.data.todayWorkStatus.title, 'Regular Working Day');
    assert.ok(resultData.data.todayWorkStatus.subtitle.includes('Short Leave approved · 15:30–17:30'));
  });

  await t.test('6. Uncovered dates never create Missing Punch or Attendance Issues', async () => {
    const emp = await User.create({ name: 'Coverage Test Emp', email: 'cov@test.com', employeeId: 'EMP_COV', role: 'employee', password: 'Password@123', status: 'Active' });

    // Biometric data imported only through August 31, 2026
    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    // Uncovered September dates must NOT generate an issue
    const missingPunchIssue = resultData.data.needsAttention.find(item => item.type === 'missing_punch');
    assert.strictEqual(missingPunchIssue, undefined);
  });

  await t.test('7. Covered historical missing punch appears in Needs Your Attention with singular/plural wording', async () => {
    const emp = await User.create({ name: 'Historical Issue Emp', email: 'hist@test.com', employeeId: 'EMP_HIST', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    // Create 1 genuine missing checkout punch within covered period
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-15',
      checkIn: new Date('2026-08-15T04:15:00.000Z'),
      checkOut: null,
      source: 'biometric',
    });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    const missingPunchIssue = resultData.data.needsAttention.find(item => item.type === 'missing_punch');
    assert.ok(missingPunchIssue);
    assert.strictEqual(missingPunchIssue.title, '1 missing punch needs attention');
    assert.strictEqual(missingPunchIssue.subtitle, 'Attendance checked through Aug 31, 2026');
  });

  await t.test('8. Own pending request appears in Awaiting Approval KPI but NOT in Needs Your Attention', async () => {
    const emp = await User.create({ name: 'Pending Request Emp', email: 'req@test.com', employeeId: 'EMP_REQ', role: 'employee', password: 'Password@123', status: 'Active' });

    await Leave.create({
      employeeId: emp._id,
      leaveType: 'Casual Leave',
      leaveTypeCode: 'CL',
      startDate: new Date('2026-09-25'),
      endDate: new Date('2026-09-25'),
      status: 'Pending',
      reason: 'Personal',
    });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.strictEqual(resultData.data.kpis.awaitingApproval, 1);
    const pendingInAttention = resultData.data.needsAttention.find(item => item.id === 'pending_leave');
    assert.strictEqual(pendingInAttention, undefined);
  });

  await t.test('9. KPIs return distinct clRemaining, plRemaining, mlRemaining, and formatted leaveBalanceSummary', async () => {
    const emp = await User.create({ name: 'Leave Bal Emp', email: 'bal@test.com', employeeId: 'EMP_BAL', role: 'employee', password: 'Password@123', status: 'Active' });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.ok('clRemaining' in resultData.data.kpis);
    assert.ok('plRemaining' in resultData.data.kpis);
    assert.ok('mlRemaining' in resultData.data.kpis);
    assert.ok(typeof resultData.data.kpis.leaveBalanceSummary === 'string');
    assert.ok(resultData.data.kpis.leaveBalanceSummary.includes('CL'));
    assert.ok(resultData.data.kpis.leaveBalanceSummary.includes('PL'));
    assert.ok(resultData.data.kpis.leaveBalanceSummary.includes('ML'));
  });

  await t.test('10. Zero ML and fractional balances are formatted correctly in leaveBalanceSummary', async () => {
    const emp = await User.create({ name: 'Fractional Emp', email: 'frac@test.com', employeeId: 'EMP_FRAC', role: 'employee', password: 'Password@123', status: 'Active' });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    const { clRemaining, plRemaining, mlRemaining, leaveBalanceSummary } = resultData.data.kpis;
    assert.strictEqual(typeof clRemaining, 'number');
    assert.strictEqual(typeof plRemaining, 'number');
    assert.strictEqual(typeof mlRemaining, 'number');
    assert.strictEqual(leaveBalanceSummary, `${clRemaining} CL  |  ${plRemaining} PL  |  ${mlRemaining} ML`);
  });

  await t.test('11. policySummary payload and attendance coverage data remain intact for dashboard KPIs', async () => {
    const emp = await User.create({ name: 'Policy Payload Emp', email: 'polpayload@test.com', employeeId: 'EMP_POLPAYLOAD', role: 'employee', password: 'Password@123', status: 'Active' });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.ok('policySummary' in resultData.data);
    assert.ok('totalPolicies' in resultData.data.policySummary);
    assert.ok('acceptedPoliciesCount' in resultData.data.policySummary);
    assert.ok('pendingPoliciesCount' in resultData.data.policySummary);
    assert.ok('attendanceUpdatedDate' in resultData.data.kpis);
    assert.ok('biometricCoverage' in resultData.data);
  });

  await t.test('12. getMyAttendance metadata exposes lastAttendanceImportDate for uncovered period detection', async () => {
    const emp = await User.create({ name: 'Att Coverage Emp', email: 'attcov@test.com', employeeId: 'EMP_ATTCOV', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    const req = { user: emp, query: { startDate: '2026-09-01', endDate: '2026-09-16' }, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyAttendance(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.strictEqual(resultData.meta.lastAttendanceImportDate, '2026-08-31');
    assert.strictEqual(resultData.meta.effectiveEndDate, '2026-08-31');
  });

  await t.test('13. Approved leave in uncovered period is returned by getMyAttendance independently of biometric data', async () => {
    const emp = await User.create({ name: 'Leave Uncovered Emp', email: 'leaveuncov@test.com', employeeId: 'EMP_LEAVEUNCOV', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    await Leave.create({
      employeeId: emp._id,
      leaveType: 'Casual Leave',
      leaveTypeCode: 'CL',
      durationType: 'full_day',
      startDate: new Date('2026-09-05T00:00:00.000Z'),
      endDate: new Date('2026-09-05T23:59:59.999Z'),
      status: 'Approved',
      reason: 'Personal',
    });

    const req = { user: emp, query: { startDate: '2026-09-01', endDate: '2026-09-16' }, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyAttendance(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    const leaveRecord = resultData.data.find(r => r.date === '2026-09-05');
    assert.ok(leaveRecord);
    assert.strictEqual(leaveRecord.status, 'On Leave');
  });

  await t.test('14. Policy summary accurately reflects zero vs 1 pending policy', async () => {
    const emp = await User.create({ name: 'Policy Check Emp', email: 'polcheck@test.com', employeeId: 'EMP_POLCHECK', role: 'employee', password: 'Password@123', status: 'Active' });

    const policy1 = await Policy.create({ title: 'Attendance Policy', version: 1, isMandatory: true, visibleToRoles: ['employee'] });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.data.policySummary.pendingPoliciesCount, 1);
    assert.strictEqual(resultData.data.policySummary.allAccepted, false);

    // Accept policy
    await PolicyAcceptance.create({ userId: emp._id, policyId: policy1._id, policyVersion: 1, acceptedAt: new Date() });

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.data.policySummary.pendingPoliciesCount, 0);
    assert.strictEqual(resultData.data.policySummary.allAccepted, true);
  });

  await t.test('15. Half-day leave overtime suppression: 4.7h worked on 4.5h required half-day leave is NOT Overtime', async () => {
    const emp = await User.create({ name: 'HalfDay OT Emp', email: 'hfot@test.com', employeeId: 'EMP_HFOT', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    await Leave.create({
      employeeId: emp._id,
      leaveType: 'Casual Leave',
      leaveTypeCode: 'CL',
      durationType: 'half_day',
      startDate: new Date('2026-08-31T00:00:00.000Z'),
      endDate: new Date('2026-08-31T23:59:59.999Z'),
      status: 'Approved',
      reason: 'Doctor Visit',
    });

    // Worked 4.7 hours (08:20 to 13:03)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-31',
      checkIn: new Date('2026-08-31T08:20:00.000Z'),
      checkOut: new Date('2026-08-31T13:03:00.000Z'),
      workingHours: 4.7,
      status: 'Half Day',
      source: 'biometric',
    });

    const req = { user: emp, query: { startDate: '2026-08-31', endDate: '2026-08-31' }, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyAttendance(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    const rec = resultData.data.find(r => r.date === '2026-08-31');
    assert.ok(rec);
    assert.strictEqual(rec.overtimeHours, 0);
    assert.notStrictEqual(rec.timeStatus, 'Overtime');
    assert.strictEqual(rec.timeStatus, 'On Track');
  });

  await t.test('16. Normal overtime: 9.5h worked on standard 9.0h workday evaluates to Overtime', async () => {
    const emp = await User.create({ name: 'Normal OT Emp', email: 'normot@test.com', employeeId: 'EMP_NORMOT', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    // 2026-08-25 is a Tuesday (working day). 04:30 UTC = 10:00 IST (on-time), 14:00 UTC = 19:30 IST (9.5h worked)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-25',
      checkIn: new Date('2026-08-25T04:30:00.000Z'),
      checkOut: new Date('2026-08-25T14:00:00.000Z'),
      workingHours: 9.5,
      status: 'Present',
      source: 'biometric',
    });

    const req = { user: emp, query: { startDate: '2026-08-25', endDate: '2026-08-25' }, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyAttendance(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    const rec = resultData.data.find(r => r.date === '2026-08-25');
    assert.ok(rec);
    assert.strictEqual(rec.overtimeHours, 0.5);
    assert.strictEqual(rec.timeStatus, 'Overtime');
  });

  await t.test('17. Issue filtering in getMyAttendance correctly filters by issue parameter', async () => {
    const emp = await User.create({ name: 'Issue Filter Emp', email: 'issueflt@test.com', employeeId: 'EMP_ISSUEFLT', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    // Missing punch record
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-20',
      checkIn: new Date('2026-08-20T09:00:00.000Z'),
      checkOut: null,
      workingHours: 0,
      status: 'Present',
      source: 'biometric',
    });

    // Short time record
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-21',
      checkIn: new Date('2026-08-21T09:00:00.000Z'),
      checkOut: new Date('2026-08-21T15:00:00.000Z'),
      workingHours: 6.0,
      status: 'Half Day',
      source: 'biometric',
    });

    const req = { user: emp, query: { startDate: '2026-08-01', endDate: '2026-08-31', issue: 'missing_punch' }, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyAttendance(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.strictEqual(resultData.data.length, 1);
    assert.strictEqual(resultData.data[0].date, '2026-08-20');
  });

  await t.test('18. getMyAttendance employee self-scope security prevents tampering', async () => {
    const emp1 = await User.create({ name: 'Scope Emp 1', email: 'scope1@test.com', employeeId: 'EMP_SCP1', role: 'employee', password: 'Password@123', status: 'Active' });
    const emp2 = await User.create({ name: 'Scope Emp 2', email: 'scope2@test.com', employeeId: 'EMP_SCP2', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    await Attendance.create({
      employeeId: emp2._id,
      date: '2026-08-20',
      checkIn: new Date('2026-08-20T09:00:00.000Z'),
      checkOut: new Date('2026-08-20T18:00:00.000Z'),
      workingHours: 9.0,
      status: 'Present',
      source: 'biometric',
    });

    // emp1 attempts to pass emp2._id in query
    const req = { user: emp1, query: { startDate: '2026-08-01', endDate: '2026-08-31', employeeId: emp2._id.toString() }, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };
    await getMyAttendance(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    // emp1 has 0 records, emp2's record must NOT be returned
    assert.strictEqual(resultData.data.length, 0);
  });

  await t.test('19. Needs Your Attention missing punch item generates contextual deep link with dates and actionLabel', async () => {
    const emp = await User.create({ name: 'DeepLink Emp', email: 'deeplink@test.com', employeeId: 'EMP_DLINK', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-20',
      checkIn: new Date('2026-08-20T04:30:00.000Z'),
      checkOut: null,
      workingHours: 0,
      status: 'Present',
      source: 'biometric',
    });

    const req = { user: emp, query: {}, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyDashboardSummary(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    const item = resultData.data.needsAttention.find(i => i.type === 'missing_punch');
    assert.ok(item);
    assert.strictEqual(item.actionLabel, 'Review missing punch');
    assert.ok(item.link.includes('issue=missing_punch'));
    assert.ok(item.link.includes('startDate=2026-08-01'));
    assert.ok(item.link.includes('endDate=2026-08-31'));
  });

  await t.test('20. getMyAttendance handles invalid issue or date parameters safely without throwing', async () => {
    const emp = await User.create({ name: 'Safe Query Emp', email: 'safequery@test.com', employeeId: 'EMP_SAFEQRY', role: 'employee', password: 'Password@123', status: 'Active' });

    await Settings.getGlobal();
    await Settings.updateOne({}, { lastAttendanceImportDate: '2026-08-31' });

    const req = { user: emp, query: { issue: 'invalid_issue_name', startDate: 'not-a-date', endDate: 'invalid' }, body: {} };
    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await getMyAttendance(req, res, () => {});

    assert.strictEqual(resultData.success, true);
    assert.ok(Array.isArray(resultData.data));
  });
});
