const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Settings = require('../models/Settings');
const CalendarEvent = require('../models/CalendarEvent');
const { connectTestDb, disconnectTestDb } = require('./helpers/testDb');

const {
  buildEvaluationContext,
  classifyEmployeeDate,
  aggregateEmployeeMetrics,
  aggregateDepartmentMetrics,
} = require('../services/attendanceEvaluationService');

test.describe('Department Report Attendance-Summary & Classification Invariants', () => {
  test.before(async () => {
    await connectTestDb();
    await Settings.create({
      officeHours: { start: '09:30', end: '18:30', halfDayHours: 4.5, fullDayHours: 8 },
      weekendDays: [0, 6], // Sun, Sat
    });
  });

  test.after(async () => {
    await disconnectTestDb();
  });

  test.beforeEach(async () => {
    await User.deleteMany({});
    await Attendance.deleteMany({});
    await Leave.deleteMany({});
    await CalendarEvent.deleteMany({});
  });

  test('1. Half Attendance + Approved Half Leave becomes matched_partial_covered (50% Weighted Att, 100% Completion)', async () => {
    const user = await User.create({
      employeeId: 'EMP-101',
      name: 'Half Day User',
      email: 'halfday@test.com',
      department: 'Engineering',
      joiningDate: new Date('2026-08-01'),
      password: 'Password@123',
    });

    const dateStr = '2026-08-03'; // Monday

    // Half day attendance
    await Attendance.create({
      employeeId: user._id,
      date: dateStr,
      status: 'Half Day',
      checkIn: new Date(`${dateStr}T09:30:00.000Z`),
      checkOut: new Date(`${dateStr}T14:00:00.000Z`),
      workingHours: 4.5,
      source: 'biometric',
    });

    // Approved half day leave
    await Leave.create({
      employeeId: user._id,
      leaveType: 'Casual Leave',
      durationType: 'half_day',
      startDate: new Date(`${dateStr}T00:00:00.000Z`),
      endDate: new Date(`${dateStr}T23:59:59.999Z`),
      status: 'Approved',
      reason: 'Doctor appointment',
    });

    const context = await buildEvaluationContext(dateStr, dateStr);
    const classification = classifyEmployeeDate(user, dateStr, context);

    assert.equal(classification.primaryStatus, 'matched_partial_covered');
    assert.equal(classification.isEligibleWorkingDate, true);

    const metrics = aggregateEmployeeMetrics(user, dateStr, dateStr, context);
    assert.equal(metrics.expectedDays, 1);
    assert.equal(metrics.fullPresentDays, 0);
    assert.equal(metrics.halfAttendanceDays, 0.5);
    assert.equal(metrics.approvedLeaveDays, 0.5);
    assert.equal(metrics.weightedPresenceDays, 0.25);
    assert.equal(metrics.weightedAttendanceRate, 25.0); // 0.25 / 1 * 100
    assert.equal(metrics.completedEmployeeDates, 1);
    assert.equal(metrics.recordCompletionRate, 100.0);
    assert.equal(metrics.unaccountedDays, 0);
  });

  test('2. Action-required classifications reduce Record Completion Rate', async () => {
    const user = await User.create({
      employeeId: 'EMP-102',
      name: 'Action Required User',
      email: 'actionreq@test.com',
      department: 'QA',
      joiningDate: new Date('2026-08-01'),
      password: 'Password@123',
    });

    // Aug 3: Incomplete Punch
    await Attendance.create({
      employeeId: user._id,
      date: '2026-08-03',
      status: 'Present',
      checkIn: new Date('2026-08-03T09:30:00.000Z'),
      source: 'biometric',
    });

    // Aug 4: Pending Leave
    await Leave.create({
      employeeId: user._id,
      leaveType: 'Sick Leave',
      durationType: 'full_day',
      startDate: new Date('2026-08-04T00:00:00.000Z'),
      endDate: new Date('2026-08-04T18:29:59.999Z'),
      status: 'Pending',
      reason: 'Feeling unwell',
    });

    // Aug 5: Conflict (punch on approved leave)
    await Attendance.create({
      employeeId: user._id,
      date: '2026-08-05',
      status: 'Present',
      checkIn: new Date('2026-08-05T09:30:00.000Z'),
      checkOut: new Date('2026-08-05T18:30:00.000Z'),
      source: 'biometric',
    });
    await Leave.create({
      employeeId: user._id,
      leaveType: 'Privilege Leave',
      durationType: 'full_day',
      startDate: new Date('2026-08-05T00:00:00.000Z'),
      endDate: new Date('2026-08-05T18:29:59.999Z'),
      status: 'Approved',
      reason: 'Personal work',
    });

    // Aug 6: Matched Present (Complete)
    await Attendance.create({
      employeeId: user._id,
      date: '2026-08-06',
      status: 'Present',
      checkIn: new Date('2026-08-06T09:30:00.000Z'),
      checkOut: new Date('2026-08-06T18:30:00.000Z'),
      source: 'biometric',
    });

    const context = await buildEvaluationContext('2026-08-03', '2026-08-06');
    const metrics = aggregateEmployeeMetrics(user, '2026-08-03', '2026-08-06', context);

    assert.equal(metrics.expectedDays, 4);
    assert.equal(metrics.statusCounts.incomplete_punch, 1);
    assert.equal(metrics.statusCounts.pending_leave, 1);
    assert.equal(metrics.statusCounts.conflict, 1);
    assert.equal(metrics.statusCounts.matched_present, 1);

    assert.equal(metrics.completedEmployeeDates, 1); // Only Aug 6 is completed
    assert.equal(metrics.actionRequiredDays, 2); // 1 incomplete_punch + 1 conflict (pending_leave is tracked separately)
    assert.equal(metrics.unaccountedDays, 0); // All action required are classified issues (incomplete, conflict)
    assert.equal(metrics.otherIssuesDays, 2);
    assert.equal(metrics.recordCompletionRate, 25.0); // 1 / 4 = 25%
  });

  test('3. Complete 12-primary-status reconciliation invariant holds across all days', async () => {
    const user = await User.create({
      employeeId: 'EMP-103',
      name: 'Invariant User',
      email: 'invariant@test.com',
      department: 'DevOps',
      joiningDate: new Date('2026-08-01'),
      password: 'Password@123',
    });

    // Range Aug 3 (Mon) to Aug 7 (Fri) = 5 working days
    const context = await buildEvaluationContext('2026-08-03', '2026-08-07');
    const metrics = aggregateEmployeeMetrics(user, '2026-08-03', '2026-08-07', context);

    assert.equal(metrics.expectedDays, 5);
    const sumPrimaryStatuses =
      metrics.statusCounts.matched_present +
      metrics.statusCounts.matched_wfh +
      metrics.statusCounts.matched_leave +
      metrics.statusCounts.matched_absent +
      metrics.statusCounts.matched_partial_covered +
      metrics.statusCounts.conflict +
      metrics.statusCounts.incomplete_punch +
      metrics.statusCounts.portal_biometric_mismatch +
      metrics.statusCounts.partial_leave_missing_attendance +
      metrics.statusCounts.short_leave_missing_attendance +
      metrics.statusCounts.pending_leave +
      metrics.statusCounts.not_marked;

    assert.equal(sumPrimaryStatuses, metrics.expectedDays);
    assert.equal(metrics.completedEmployeeDates + metrics.actionRequiredDays, metrics.expectedDays);
  });

  test('4. Weekend attendance remains outside expected working days invariant', async () => {
    const user = await User.create({
      employeeId: 'EMP-104',
      name: 'Weekend User',
      email: 'weekend@test.com',
      department: 'Support',
      joiningDate: new Date('2026-08-01'),
      password: 'Password@123',
    });

    // Sat Aug 8: Weekend Punch
    await Attendance.create({
      employeeId: user._id,
      date: '2026-08-08',
      status: 'Present',
      checkIn: new Date('2026-08-08T10:00:00.000Z'),
      checkOut: new Date('2026-08-08T15:00:00.000Z'),
      source: 'biometric',
    });

    const context = await buildEvaluationContext('2026-08-03', '2026-08-09');
    const classification = classifyEmployeeDate(user, '2026-08-08', context);

    assert.equal(classification.primaryStatus, 'weekend_attendance');
    assert.equal(classification.isEligibleWorkingDate, false);

    const metrics = aggregateEmployeeMetrics(user, '2026-08-03', '2026-08-09', context);
    assert.equal(metrics.expectedDays, 5); // 5 Mon-Fri working days
    assert.equal(metrics.statusCounts.weekend_attendance, 1);
  });

  test('5. WFH is included once in Full Present and Record Completion', async () => {
    const user = await User.create({
      employeeId: 'EMP-105',
      name: 'WFH User',
      email: 'wfh@test.com',
      department: 'Marketing',
      joiningDate: new Date('2026-08-01'),
      password: 'Password@123',
    });

    const dateStr = '2026-08-03';
    await Attendance.create({
      employeeId: user._id,
      date: dateStr,
      status: 'Present',
      workMode: 'wfh',
      source: 'portal',
    });

    const context = await buildEvaluationContext(dateStr, dateStr);
    const metrics = aggregateEmployeeMetrics(user, dateStr, dateStr, context);

    assert.equal(metrics.expectedDays, 1);
    assert.equal(metrics.fullPresentDays, 1);
    assert.equal(metrics.wfhDays, 1);
    assert.equal(metrics.weightedPresenceDays, 1.0);
    assert.equal(metrics.weightedAttendanceRate, 100.0);
    assert.equal(metrics.recordCompletionRate, 100.0);
    assert.equal(metrics.actionRequiredDays, 0); // Zero Action Required
    assert.equal(metrics.otherIssuesDays, 0);
  });

  test('6. Unaccounted is a subset of Action Required, and Action Required equals Expected minus Completed', async () => {
    const user = await User.create({
      employeeId: 'EMP-106',
      name: 'Reconciled User',
      email: 'reconciled@test.com',
      department: 'Sales',
      joiningDate: new Date('2026-08-01'),
      password: 'Password@123',
    });

    // 2026-08-03: Complete
    await Attendance.create({
      employeeId: user._id,
      date: '2026-08-03',
      status: 'Present',
      checkIn: new Date('2026-08-03T09:30:00.000Z'),
      checkOut: new Date('2026-08-03T18:30:00.000Z'),
      source: 'biometric',
    });

    // 2026-08-04: Not Marked (Unaccounted)
    // 2026-08-05: Incomplete Punch (Other Issue)
    await Attendance.create({
      employeeId: user._id,
      date: '2026-08-05',
      status: 'Present',
      checkIn: new Date('2026-08-05T09:30:00.000Z'),
      source: 'biometric',
    });

    const context = await buildEvaluationContext('2026-08-03', '2026-08-05');
    const metrics = aggregateEmployeeMetrics(user, '2026-08-03', '2026-08-05', context);

    assert.equal(metrics.expectedDays, 3);
    assert.equal(metrics.completedEmployeeDates, 1);
    assert.equal(metrics.actionRequiredDays, 2);
    assert.equal(metrics.expectedDays - metrics.completedEmployeeDates, metrics.actionRequiredDays);
    assert.equal(metrics.unaccountedDays, 1);
    assert.equal(metrics.otherIssuesDays, 1);
    assert.equal(metrics.unaccountedDays + metrics.otherIssuesDays, metrics.actionRequiredDays);
  });
});

const { getAttendanceReconciliation } = require('../controllers/attendanceReconciliationController');

async function callReconciliationAPI(queryParams) {
  let jsonResult = null;
  let textResult = null;
  let statusResult = 200;
  let headers = {};

  const req = { query: queryParams };
  const res = {
    status: (code) => { statusResult = code; return res; },
    setHeader: (k, v) => { headers[k] = v; return res; },
    send: (txt) => { textResult = txt; return res; },
    json: (obj) => { jsonResult = obj; return res; },
  };

  await getAttendanceReconciliation(req, res, (err) => {
    if (err) throw err;
  });

  return { status: statusResult, headers, json: jsonResult, text: textResult };
}

test.describe('Missing Attendance Reconciliation API & Deep-link Tests', () => {
  test.before(async () => {
    await connectTestDb();
    await Settings.deleteMany({});
    await Settings.create({
      officeHours: { start: '09:30', end: '18:30', halfDayHours: 4.5, fullDayHours: 8 },
      weekendDays: [0, 6], // Sun, Sat
    });
  });

  test.after(async () => {
    await disconnectTestDb();
  });

  test.beforeEach(async () => {
    await User.deleteMany({});
    await Attendance.deleteMany({});
    await Leave.deleteMany({});
    await CalendarEvent.deleteMany({});
  });

  test('7. Priyanka-style fixture: 18 completed + 5 action required = 23 total expected days', async () => {
    const priyanka = await User.create({
      employeeId: 'DT-125',
      name: 'Priyanka Arora',
      email: 'priyanka@test.com',
      department: 'Web Development',
      joiningDate: new Date('2026-01-01'),
      status: 'Active',
      password: 'Password@123',
    });

    // August 2026 working days (Aug 3 to Aug 31, Mon-Fri): 21 working days in Aug 3-31 + Aug 1 is Sat.
    // Let's create Aug 3-21 (15 complete days), Aug 24-26 (3 complete days = 18 total complete)
    // Aug 27-29: Aug 27, 28 (2 incomplete punches), Aug 31 (1 unaccounted) + Aug 3-4 (2 unaccounted) = 3 unaccounted + 2 incomplete = 5 action required.
    
    // 19 complete days
    const completeDates = [
      '2026-08-01', '2026-08-05', '2026-08-06', '2026-08-07',
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-15', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-29'
    ];

    for (const d of completeDates) {
      await Attendance.create({
        employeeId: priyanka._id,
        date: d,
        status: 'Present',
        checkIn: new Date(`${d}T09:30:00.000Z`),
        checkOut: new Date(`${d}T18:30:00.000Z`),
        source: 'biometric',
      });
    }

    // 2 Incomplete Punches: Aug 27, Aug 28
    await Attendance.create({
      employeeId: priyanka._id,
      date: '2026-08-27',
      status: 'Present',
      checkIn: new Date('2026-08-27T09:30:00.000Z'),
      source: 'biometric',
    });
    await Attendance.create({
      employeeId: priyanka._id,
      date: '2026-08-28',
      status: 'Present',
      checkIn: new Date('2026-08-28T09:30:00.000Z'),
      source: 'biometric',
    });

    // 3 Unaccounted: Aug 3, Aug 4, Aug 31 (no attendance or leave records)

    const res = await callReconciliationAPI({
      employeeId: 'DT-125',
      department: 'Web Development',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      issueType: 'action_required',
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    const data = res.json.data;

    assert.equal(data.summary.employeeDatesChecked, 24);
    assert.equal(data.summary.matchedCount, 19);
    assert.equal(data.summary.actionRequiredCount, 5); // 2 incomplete + 3 unaccounted
    assert.equal(data.summary.incomplete_punch, 2);
    assert.equal(data.summary.not_marked, 3);
    assert.equal(data.rows.length, 5);
  });

  test('8. Employee code vs Mongo _id parameter contract works identically', async () => {
    const user = await User.create({
      employeeId: 'DT-125',
      name: 'Priyanka Arora',
      email: 'priyanka2@test.com',
      department: 'Web Development',
      joiningDate: new Date('2026-01-01'),
      status: 'Active',
      password: 'Password@123',
    });

    // Call using human readable code DT-125 under employeeId parameter
    const res1 = await callReconciliationAPI({
      employeeId: 'DT-125',
      startDate: '2026-08-03',
      endDate: '2026-08-07',
    });

    // Call using Mongo _id under employeeId parameter
    const res2 = await callReconciliationAPI({
      employeeId: user._id.toString(),
      startDate: '2026-08-03',
      endDate: '2026-08-07',
    });

    // Call using employeeCode parameter
    const res3 = await callReconciliationAPI({
      employeeCode: 'DT-125',
      startDate: '2026-08-03',
      endDate: '2026-08-07',
    });

    assert.equal(res1.json.data.summary.employeeDatesChecked, 5);
    assert.equal(res2.json.data.summary.employeeDatesChecked, 5);
    assert.equal(res3.json.data.summary.employeeDatesChecked, 5);
    assert.equal(res1.json.data.rows.length, res2.json.data.rows.length);
    assert.equal(res2.json.data.rows.length, res3.json.data.rows.length);
  });

  test('9. Siddharth-style fixture: 19 completed + 4 action required (2 unaccounted + 2 conflicts)', async () => {
    const siddharth = await User.create({
      employeeId: 'MAS-288',
      name: 'Siddharth Sharma',
      email: 'siddharth@test.com',
      department: 'Mobile App',
      joiningDate: new Date('2026-01-01'),
      status: 'Active',
      password: 'Password@123',
    });

    // Aug 3 (Mon) to Aug 7 (Fri) = 5 working days
    // 3 complete days
    await Attendance.create({
      employeeId: siddharth._id,
      date: '2026-08-03',
      status: 'Present',
      checkIn: new Date('2026-08-03T09:30:00.000Z'),
      checkOut: new Date('2026-08-03T18:30:00.000Z'),
      source: 'biometric',
    });
    await Attendance.create({
      employeeId: siddharth._id,
      date: '2026-08-04',
      status: 'Present',
      checkIn: new Date('2026-08-04T09:30:00.000Z'),
      checkOut: new Date('2026-08-04T18:30:00.000Z'),
      source: 'biometric',
    });
    await Attendance.create({
      employeeId: siddharth._id,
      date: '2026-08-05',
      status: 'Present',
      checkIn: new Date('2026-08-05T09:30:00.000Z'),
      checkOut: new Date('2026-08-05T18:30:00.000Z'),
      source: 'biometric',
    });

    // 1 Conflict: Punch + Approved Leave on Aug 6
    await Attendance.create({
      employeeId: siddharth._id,
      date: '2026-08-06',
      status: 'Present',
      checkIn: new Date('2026-08-06T09:30:00.000Z'),
      checkOut: new Date('2026-08-06T18:30:00.000Z'),
      source: 'biometric',
    });
    await Leave.create({
      employeeId: siddharth._id,
      leaveType: 'Privilege Leave',
      durationType: 'full_day',
      startDate: new Date('2026-08-06T00:00:00.000Z'),
      endDate: new Date('2026-08-06T18:29:59.999Z'),
      status: 'Approved',
      reason: 'Personal work',
    });

    // 1 Unaccounted: Aug 7 (no punch, no leave)

    const res = await callReconciliationAPI({
      employeeId: 'MAS-288',
      startDate: '2026-08-03',
      endDate: '2026-08-07',
      issueType: 'action_required',
    });

    assert.equal(res.json.data.summary.employeeDatesChecked, 5);
    assert.equal(res.json.data.summary.matchedCount, 3);
    assert.equal(res.json.data.summary.actionRequiredCount, 2); // 1 conflict + 1 unaccounted
    assert.equal(res.json.data.summary.conflict, 1);
    assert.equal(res.json.data.summary.not_marked, 1);
  });

  test('10. CSV Export contains human-readable headers and values without hidden Mongo _ids', async () => {
    const user = await User.create({
      employeeId: 'DT-125',
      name: 'Priyanka Arora',
      email: 'priyanka_csv@test.com',
      department: 'Web Development',
      joiningDate: new Date('2026-01-01'),
      status: 'Active',
      password: 'Password@123',
    });

    await Attendance.create({
      employeeId: user._id,
      date: '2026-08-03',
      status: 'Present',
      checkIn: new Date('2026-08-03T09:30:00.000Z'),
      source: 'biometric',
    });

    const res = await callReconciliationAPI({
      employeeId: 'DT-125',
      startDate: '2026-08-03',
      endDate: '2026-08-03',
      exportCsv: 'true',
    });

    assert.equal(res.headers['Content-Type'], 'text/csv');
    assert.ok(res.text.includes('Date,Employee,Employee ID,Department,Biometric Check In,Biometric Check Out,Portal Status,Leave/WFH,Issue,Explanation,Recommended Action'));
    assert.ok(res.text.includes('Priyanka Arora'));
    assert.ok(res.text.includes('DT-125'));
    assert.ok(res.text.includes('Incomplete Punch'));
    // Ensure raw Mongo ObjectIds are not present in CSV columns
    assert.ok(!res.text.includes(user._id.toString()));
  });

  test('11. Empty result state returns 0 rows and N/A completion rate', async () => {
    const res = await callReconciliationAPI({
      startDate: '2026-08-01',
      endDate: '2026-08-02', // Sat-Sun (non-working days)
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.data.summary.employeeDatesChecked, 0);
    assert.equal(res.json.data.summary.reconciliationRate, 'N/A');
    assert.equal(res.json.data.rows.length, 0);
  });
});

