const test = require('node:test');
const assert = require('node:assert/strict');
const { connectTestDb, disconnectTestDb, clearCollections } = require('./helpers/testDb');

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const CalendarEvent = require('../models/CalendarEvent');
const Settings = require('../models/Settings');

const { getAttendanceReconciliation } = require('../controllers/attendanceReconciliationController');
const { confirmAttendanceImport, buildPreview } = require('../controllers/attendanceBulkController');

test('Attendance Reconciliation MVP Test Suite', async (t) => {
  t.before(async () => {
    await connectTestDb();
  });

  t.after(async () => {
    await disconnectTestDb();
  });

  t.beforeEach(async () => {
    await clearCollections();
    // Default settings: Saturday (6) and Sunday (0) are weekend days
    await Settings.create({
      weekendDays: [0, 6],
    });
  });

  await t.test('1. Employee joining mid-period produces correct Employee-Dates Checked (14, not 20)', async () => {
    // 10 working days in past range: 2026-08-03 (Mon) to 2026-08-14 (Fri) [excluding weekends Aug 8,9]
    // Working days: Aug 3, 4, 5, 6, 7, 10, 11, 12, 13, 14 (10 working days)
    const empA = await User.create({
      name: 'Emp A',
      employeeId: 'EMP001',
      joiningDate: new Date('2026-01-01'),
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    const empB = await User.create({
      name: 'Emp B',
      employeeId: 'EMP002',
      joiningDate: new Date('2026-08-11'), // Eligible for Aug 11, 12, 13, 14 = 4 working days
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    const req = {
      query: {
        startDate: '2026-08-03',
        endDate: '2026-08-14',
      },
    };

    let resultData = null;
    const res = {
      json: (data) => { resultData = data.data; },
    };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(resultData.summary.employeeDatesChecked, 14);
  });

  await t.test('2. Zero Employee-Dates Checked returns reconciliation rate as "N/A"', async () => {
    // No active employees
    const req = {
      query: {
        startDate: '2026-09-01',
        endDate: '2026-09-05',
      },
    };

    let resultData = null;
    const res = {
      json: (data) => { resultData = data.data; },
    };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(resultData.summary.employeeDatesChecked, 0);
    assert.strictEqual(resultData.summary.reconciliationRate, 'N/A');
  });

  await t.test('3. Single-day holiday before selected range is not fetched/counted', async () => {
    await CalendarEvent.create({
      title: 'Aug Holiday',
      date: '2026-08-25',
      type: 'holiday',
      isActive: true,
    });

    const emp = await User.create({
      name: 'Emp Test',
      employeeId: 'EMP100',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    // 2026-09-01 (Tue) - 1 working day
    const req = {
      query: {
        startDate: '2026-09-01',
        endDate: '2026-09-01',
      },
    };

    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(resultData.summary.employeeDatesChecked, 1);
  });

  await t.test('4. Multi-day holiday overlapping selected range excludes holiday dates', async () => {
    // Holiday from Aug 28 to Sep 02
    await CalendarEvent.create({
      title: 'Festival',
      date: '2026-08-28',
      endDate: '2026-09-02',
      type: 'holiday',
      isActive: true,
    });

    const emp = await User.create({
      name: 'Emp Test',
      employeeId: 'EMP100',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    // Range Sep 01 to Sep 04 (4 calendar days: Sep 1 Tue, Sep 2 Wed, Sep 3 Thu, Sep 4 Fri)
    // Sep 1 & 2 are holidays, so evaluated working days = Sep 3, Sep 4 (2 days)
    const req = {
      query: {
        startDate: '2026-09-01',
        endDate: '2026-09-04',
      },
    };

    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(resultData.summary.employeeDatesChecked, 2);
  });

  await t.test('5. Server-side biometric import skips portal/manual/WFH conflicts by default', async () => {
    const emp = await User.create({
      name: 'Emp Conflict',
      employeeId: 'EMP200',
      biometricId: 'BIO200',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    // Create existing portal attendance and WFH record
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-09-01',
      source: 'portal',
      checkIn: new Date('2026-09-01T09:00:00Z'),
      status: 'Present',
    });

    await Attendance.create({
      employeeId: emp._id,
      date: '2026-09-02',
      source: 'portal',
      workMode: 'wfh',
      status: 'Present',
    });

    const importRows = [
      {
        matchedEmployee: { _id: emp._id },
        date: '2026-09-01',
        checkIn: '09:15',
        checkOut: '17:15',
        totalHours: 8,
        status: 'Present',
        canImport: true, // Tampered client payload
      },
      {
        matchedEmployee: { _id: emp._id },
        date: '2026-09-02',
        checkIn: '09:00',
        checkOut: '17:00',
        totalHours: 8,
        status: 'Present',
        canImport: true, // Tampered client payload
      },
    ];

    const req = { body: { rows: importRows } };
    let responseJson = null;
    const res = {
      status: () => res,
      json: (data) => { responseJson = data; },
    };

    await confirmAttendanceImport(req, res, () => {});

    // Backend must skip both conflict rows
    assert.strictEqual(responseJson.data.skippedConflictCount, 2);
    assert.strictEqual(responseJson.data.saved, 0);

    // Verify DB records were NOT overwritten
    const att1 = await Attendance.findOne({ employeeId: emp._id, date: '2026-09-01' });
    assert.strictEqual(att1.source, 'portal');

    const att2 = await Attendance.findOne({ employeeId: emp._id, date: '2026-09-02' });
    assert.strictEqual(att2.workMode, 'wfh');
  });

  await t.test('6. Department and employee filters affect summary population', async () => {
    const empEng = await User.create({
      name: 'Eng Dev',
      employeeId: 'ENG01',
      department: 'Engineering',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    const empHr = await User.create({
      name: 'HR Exec',
      employeeId: 'HR01',
      department: 'HR',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    const req = {
      query: {
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        department: 'Engineering',
      },
    };

    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(resultData.summary.employeeDatesChecked, 1);
  });

  await t.test('7. Issue-type filter does not change overall summary metrics', async () => {
    const emp = await User.create({
      name: 'Emp Test',
      employeeId: 'EMP300',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    // 2 working days: Sep 1, Sep 2
    // Sep 1: Present (Biometric)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-09-01',
      source: 'biometric',
      checkIn: new Date('2026-09-01T09:00:00Z'),
      checkOut: new Date('2026-09-01T17:00:00Z'),
      status: 'Present',
    });

    // Sep 2: Not marked (no attendance)

    // Request with issueType = 'not_marked'
    const req = {
      query: {
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        issueType: 'not_marked',
      },
    };

    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    // Overall summary still evaluates both employee-dates
    assert.strictEqual(resultData.summary.employeeDatesChecked, 2);
    assert.strictEqual(resultData.summary.matched_present, 1);
    assert.strictEqual(resultData.summary.not_marked, 1);
    assert.strictEqual(resultData.summary.reconciliationRate, 50);

    // Filtered row set only contains not_marked row
    assert.strictEqual(resultData.rows.length, 1);
    assert.strictEqual(resultData.rows[0].issueType, 'not_marked');
  });

  await t.test('8. Automated verification of all 11 primary status classifications & single-status invariant', async () => {
    const emp = await User.create({
      name: 'Test All Statuses',
      employeeId: 'STATUS01',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    // 1. matched_present: Complete biometric punch (Aug 03 Mon)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      source: 'biometric',
      checkIn: new Date('2026-08-03T09:00:00Z'),
      checkOut: new Date('2026-08-03T17:00:00Z'),
      status: 'Present',
    });

    // 2. matched_wfh: Approved WFH record (Aug 04 Tue)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-04',
      source: 'portal',
      workMode: 'wfh',
      status: 'Present',
    });

    // 3. matched_leave: Approved full-day leave (Aug 05 Wed)
    await Leave.create({
      employeeId: emp._id,
      startDate: new Date('2026-08-05T00:00:00.000Z'),
      endDate: new Date('2026-08-05T18:29:59.999Z'),
      leaveType: 'casual',
      reason: 'Test Leave Reason',
      status: 'Approved',
    });

    // 4. matched_absent: Persisted Attendance record with status === 'Absent' without punches (Aug 06 Thu)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-06',
      status: 'Absent',
      source: 'portal',
    });

    // 5. conflict: Biometric punch AND approved full-day leave (Aug 07 Fri)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-07',
      source: 'biometric',
      checkIn: new Date('2026-08-07T09:00:00Z'),
      checkOut: new Date('2026-08-07T17:00:00Z'),
      status: 'Present',
    });
    await Leave.create({
      employeeId: emp._id,
      startDate: new Date('2026-08-07T00:00:00.000Z'),
      endDate: new Date('2026-08-07T18:29:59.999Z'),
      leaveType: 'sick',
      reason: 'Test Leave',
      status: 'Approved',
    });

    // Aug 08, 09 (Sat, Sun): Weekend (excluded)

    // 6. incomplete_punch: Biometric check-in only (Aug 10 Mon)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-10',
      source: 'biometric',
      checkIn: new Date('2026-08-10T09:00:00Z'),
      status: 'Present',
    });

    // 7. pending_leave: Leave request pending (Aug 11 Tue)
    await Leave.create({
      employeeId: emp._id,
      startDate: new Date('2026-08-11T00:00:00.000Z'),
      endDate: new Date('2026-08-11T18:29:59.999Z'),
      leaveType: 'casual',
      reason: 'Test Leave',
      status: 'Pending',
    });

    // 8. portal_biometric_mismatch: Manual punch or punchless Present record (Aug 12 Wed)
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-12',
      source: 'manual',
      status: 'Present',
    });

    // 9. partial_leave_missing_attendance: Half day leave approved without punch (Aug 13 Thu)
    await Leave.create({
      employeeId: emp._id,
      startDate: new Date('2026-08-13T00:00:00.000Z'),
      endDate: new Date('2026-08-13T18:29:59.999Z'),
      leaveType: 'casual',
      durationType: 'half_day',
      reason: 'Test Leave',
      status: 'Approved',
    });

    // 10. short_leave_missing_attendance: Short leave approved without punch (Aug 14 Fri)
    await Leave.create({
      employeeId: emp._id,
      startDate: new Date('2026-08-14T00:00:00.000Z'),
      endDate: new Date('2026-08-14T18:29:59.999Z'),
      leaveType: 'short_leave',
      durationType: 'hourly',
      reason: 'Test Leave',
      status: 'Approved',
    });

    // Aug 15, 16 (Sat, Sun): Weekend (excluded)

    // 11. not_marked: Aug 17 Mon (working day with zero attendance/leave records)

    const req = {
      query: {
        startDate: '2026-08-03',
        endDate: '2026-08-17',
        issueType: 'all',
        employeeId: emp._id.toString(),
      },
    };

    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    // Working days evaluated = 12 days (Aug 3-7, 10-14, 15, 17 - Aug 15 is 3rd working Saturday)
    assert.strictEqual(resultData.summary.employeeDatesChecked, 12);
    assert.strictEqual(resultData.summary.matched_present, 1);
    assert.strictEqual(resultData.summary.matched_wfh, 1);
    assert.strictEqual(resultData.summary.matched_leave, 1);
    assert.strictEqual(resultData.summary.matched_absent, 1);
    assert.strictEqual(resultData.summary.conflict, 1);
    assert.strictEqual(resultData.summary.incomplete_punch, 1);
    assert.strictEqual(resultData.summary.pending_leave, 1);
    assert.strictEqual(resultData.summary.portal_biometric_mismatch, 1);
    assert.strictEqual(resultData.summary.partial_leave_missing_attendance, 1);
    assert.strictEqual(resultData.summary.short_leave_missing_attendance, 1);
    assert.strictEqual(resultData.summary.not_marked, 2);

    // Sum invariant: Matched + Action Required == Employee-Dates Checked
    const totalSum = resultData.summary.matchedCount + resultData.summary.actionRequiredCount;
    assert.strictEqual(totalSum, resultData.summary.employeeDatesChecked);
  });

  await t.test('9. Persisted Absent plus approved Leave classification', async () => {
    const emp = await User.create({
      name: 'Emp Conflict Absent',
      employeeId: 'EMP400',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
    });

    await Attendance.create({
      employeeId: emp._id,
      date: '2026-09-01',
      status: 'Absent',
      source: 'portal',
    });

    await Leave.create({
      employeeId: emp._id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-01'),
      leaveType: 'casual',
      reason: 'Test Leave Reason',
      status: 'Approved',
    });

    const req = {
      query: {
        startDate: '2026-09-01',
        endDate: '2026-09-01',
      },
    };

    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.ok(resultData.summary.matched_leave === 1 || resultData.summary.conflict === 1);
  });

  await t.test('10. Default date range defaults to current month through yesterday', async () => {
    await User.create({ name: 'Emp Test', employeeId: 'E10', password: 'Password@123', status: 'Active' });
    const req = { query: {} };
    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.ok(resultData.dateRange.startDate);
    assert.ok(resultData.dateRange.endDate);
    assert.ok(resultData.dateRange.startDate.endsWith('-01'));
  });

  await t.test('11. Stable pagination ordering (sorted by date desc, then employeeId asc)', async () => {
    const e1 = await User.create({ name: 'Alpha', employeeId: 'EMP_A', password: 'Password@123', status: 'Active' });
    const e2 = await User.create({ name: 'Beta', employeeId: 'EMP_B', password: 'Password@123', status: 'Active' });

    const req = {
      query: { startDate: '2026-08-03', endDate: '2026-08-04', page: 1, limit: 10 },
    };

    let resultData = null;
    const res = { json: (data) => { resultData = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(resultData.rows.length, 4);
    assert.strictEqual(resultData.rows[0].date, '2026-08-04');
    assert.strictEqual(resultData.rows[0].employee.employeeId, 'EMP_A');
    assert.strictEqual(resultData.rows[1].employee.employeeId, 'EMP_B');
    assert.strictEqual(resultData.rows[2].date, '2026-08-03');
  });

  await t.test('12. CSV export includes all filtered rows ignoring page/limit', async () => {
    await User.create({ name: 'Emp 1', employeeId: 'E1', password: 'Password@123', status: 'Active' });
    await User.create({ name: 'Emp 2', employeeId: 'E2', password: 'Password@123', status: 'Active' });

    const req = {
      query: { startDate: '2026-08-03', endDate: '2026-08-04', exportCsv: 'true', page: 1, limit: 1 },
    };

    let headers = {};
    let csvData = '';
    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      send: (text) => { csvData = text; },
    };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(headers['Content-Type'], 'text/csv');
    assert.ok(csvData.includes('Date,Employee,Employee ID'));
    // 2 employees * 2 working days = 4 CSV rows
    const lines = csvData.trim().split('\n');
    assert.strictEqual(lines.length, 5); // 1 header + 4 data lines
  });

  await t.test('13. CSV respects issue type, employee, department and date filters', async () => {
    const e1 = await User.create({ name: 'Dev One', employeeId: 'DEV1', department: 'Engineering', password: 'Password@123', status: 'Active' });
    await User.create({ name: 'HR One', employeeId: 'HR1', department: 'HR', password: 'Password@123', status: 'Active' });

    // Single day: 2026-08-03
    const req = {
      query: {
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        department: 'Engineering',
        exportCsv: 'true',
      },
    };

    let csvData = '';
    const res = { setHeader: () => {}, send: (text) => { csvData = text; } };

    await getAttendanceReconciliation(req, res, () => {});

    const lines = csvData.trim().split('\n');
    assert.strictEqual(lines.length, 2); // 1 header + 1 row for DEV1
    assert.ok(csvData.includes('DEV1'));
    assert.ok(!csvData.includes('HR1'));
  });

  await t.test('14. Manual record without check-in/check-out is protected on server-side import', async () => {
    const emp = await User.create({ name: 'Emp Manual', employeeId: 'EMPM', password: 'Password@123', status: 'Active' });

    // Stored manual attendance with no check-in/out
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      source: 'manual',
      status: 'Present',
    });

    const req = {
      body: {
        rows: [{
          matchedEmployee: { _id: emp._id },
          date: '2026-08-03',
          checkIn: '09:00',
          checkOut: '17:00',
          canImport: true, // Tampered client payload
        }],
      },
    };

    let resultData = null;
    const res = { status: () => res, json: (data) => { resultData = data; } };

    await confirmAttendanceImport(req, res, () => {});

    assert.strictEqual(resultData.data.skippedConflictCount, 1);
    assert.strictEqual(resultData.data.saved, 0);

    const att = await Attendance.findOne({ employeeId: emp._id, date: '2026-08-03' });
    assert.strictEqual(att.source, 'manual');
  });

  await t.test('15. Preview classification and Confirm Import protection return consistent conflict results', async () => {
    const emp = await User.create({ name: 'Emp Preview', employeeId: 'EMPP', password: 'Password@123', status: 'Active' });

    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      source: 'portal',
      status: 'Present',
    });

    const records = [{ employeeCode: 'EMPP', date: '2026-08-03', checkIn: '09:00', checkOut: '17:00', status: 'Present' }];

    const previewResult = await buildPreview(records, 'normal-parser');
    const previewRow = previewResult.rows[0];

    assert.strictEqual(previewRow.isPortalConflict, true);
    assert.strictEqual(previewRow.canImport, false);

    // Confirm import with previewRow
    const req = { body: { rows: [previewRow] } };
    let confirmResult = null;
    const res = { status: () => res, json: (data) => { confirmResult = data; } };

    await confirmAttendanceImport(req, res, () => {});

    assert.strictEqual(confirmResult.data.skippedConflictCount, 1);
    assert.strictEqual(confirmResult.data.saved, 0);
  });

  await t.test('16. Empty result returns valid success response with zero counts', async () => {
    // Zero active users in DB
    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03' } };
    let result = null;
    const res = { json: (data) => { result = data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.summary.employeeDatesChecked, 0);
    assert.strictEqual(result.data.summary.reconciliationRate, 'N/A');
    assert.strictEqual(result.data.rows.length, 0);
  });

  await t.test('17. Invalid date range (startDate > endDate) returns validation error 400', async () => {
    const req = { query: { startDate: '2026-08-10', endDate: '2026-08-01' } };
    let statusCode = 200;
    let result = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { result = data; },
    };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(statusCode, 400);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.message, 'startDate cannot be after endDate');
  });

  await t.test('18. Date range exceeding 366 days is rejected with error 400', async () => {
    const req = { query: { startDate: '2024-01-01', endDate: '2025-02-01' } }; // 398 days
    let statusCode = 200;
    let result = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { result = data; },
    };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(statusCode, 400);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.message, 'Date range cannot exceed 366 days');
  });

  await t.test('19. Biometric punch + approved WFH produces conflict', async () => {
    const emp = await User.create({ name: 'Emp WFH Bio', employeeId: 'WFH_BIO', password: 'Password@123', status: 'Active' });
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      source: 'biometric',
      checkIn: new Date('2026-08-03T09:00:00Z'),
      checkOut: new Date('2026-08-03T17:00:00Z'),
      workMode: 'wfh',
      status: 'Present',
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.summary.conflict, 1);
    assert.strictEqual(result.summary.matched_present, 0);
  });

  await t.test('20. Portal/manual punch + assigned WFH produces conflict', async () => {
    const emp = await User.create({ name: 'Emp WFH Manual', employeeId: 'WFH_MAN', password: 'Password@123', status: 'Active' });
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      source: 'manual',
      checkIn: new Date('2026-08-03T09:00:00Z'),
      workMode: 'wfh',
      status: 'Present',
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.summary.conflict, 1);
    assert.strictEqual(result.summary.portal_biometric_mismatch, 0);
  });

  await t.test('21. Empty assigned WFH (Present, workMode: wfh, no punches) produces matched_wfh', async () => {
    const emp = await User.create({ name: 'Emp WFH Empty', employeeId: 'WFH_EMP', password: 'Password@123', status: 'Active' });
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      workMode: 'wfh',
      status: 'Present',
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.summary.matched_wfh, 1);
    assert.strictEqual(result.summary.portal_biometric_mismatch, 0);
  });

  await t.test('22. Synthetic WFH (Leave with leaveType: wfh) without punches produces matched_wfh', async () => {
    const emp = await User.create({ name: 'Emp WFH Leave', employeeId: 'WFH_LV', password: 'Password@123', status: 'Active' });
    await Leave.create({
      employeeId: emp._id,
      startDate: new Date('2026-08-03'),
      endDate: new Date('2026-08-03'),
      leaveType: 'wfh',
      reason: 'Approved WFH',
      status: 'Approved',
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.summary.matched_wfh, 1);
    assert.strictEqual(result.summary.matched_leave, 0);
  });

  await t.test('23. Punchless Present without WFH produces portal_biometric_mismatch', async () => {
    const emp = await User.create({ name: 'Emp Punchless Present', employeeId: 'P_PRES', password: 'Password@123', status: 'Active' });
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      source: 'portal',
      status: 'Present',
      // workMode default office, no check-in/out
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.summary.portal_biometric_mismatch, 1);
    assert.strictEqual(result.summary.matched_present, 0);
    assert.strictEqual(result.summary.matched_wfh, 0);
  });

  await t.test('24. Punchless Half Day without supporting leave produces portal_biometric_mismatch', async () => {
    const emp = await User.create({ name: 'Emp HalfDay', employeeId: 'P_HALF', password: 'Password@123', status: 'Active' });
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      source: 'portal',
      status: 'Half Day',
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.summary.portal_biometric_mismatch, 1);
  });

  await t.test('25. WFH never contributes to portal_biometric_mismatch and employee-date receives exactly one primary status', async () => {
    const emp = await User.create({ name: 'Emp WFH Check', employeeId: 'WFH_CHK', password: 'Password@123', status: 'Active' });
    await Attendance.create({
      employeeId: emp._id,
      date: '2026-08-03',
      workMode: 'wfh',
      status: 'Present',
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03', issueType: 'all' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    assert.strictEqual(result.summary.portal_biometric_mismatch, 0);
    assert.strictEqual(result.summary.matched_wfh, 1);
    assert.strictEqual(result.summary.employeeDatesChecked, 1);
    assert.strictEqual(result.summary.matchedCount + result.summary.actionRequiredCount, 1);
  });

  await t.test('26. Administrator role (admin / Administrator) users are excluded from reconciliation evaluation', async () => {
    const regularEmp = await User.create({
      name: 'Regular Employee',
      employeeId: 'REG001',
      password: 'Password@123',
      status: 'Active',
      role: 'employee',
      joiningDate: new Date('2026-01-01'),
    });

    const adminOwner = await User.create({
      name: 'Company Owner Admin',
      employeeId: 'ADM001',
      password: 'Password@123',
      status: 'Active',
      role: 'admin',
      joiningDate: new Date('2026-01-01'),
    });

    const administratorUser = await User.create({
      name: 'Administrator User',
      employeeId: 'ADM002',
      password: 'Password@123',
      status: 'Active',
      role: 'Administrator',
      joiningDate: new Date('2026-01-01'),
    });

    const req = { query: { startDate: '2026-08-03', endDate: '2026-08-03', issueType: 'all' } };
    let result = null;
    const res = { json: (data) => { result = data.data; } };

    await getAttendanceReconciliation(req, res, () => {});

    // Only regularEmp should be checked (1 employee-date), admin & Administrator are excluded
    assert.strictEqual(result.summary.employeeDatesChecked, 1);
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].employee._id.toString(), regularEmp._id.toString());
  });
});
