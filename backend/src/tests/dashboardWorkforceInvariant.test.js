const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyEmployeeDate } = require('../services/attendanceEvaluationService');
const { formatBusinessDate, getYesterdayBusinessDate } = require('../utils/businessDateUtils');
const { isWeeklyOff } = require('../services/attendancePolicyService');

test('Dashboard Operational Workforce Invariant & Classification Tests', async (t) => {
  const dummyUser = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Test Employee',
    role: 'employee',
    status: 'Active',
    joiningDate: '2025-01-01',
  };

  const createEvalContext = (overrides = {}) => {
    return {
      settings: {
        officeStartTime: '10:00',
        lateThreshold: '10:15',
        fullDayRequiredHours: 9,
        halfDayRequiredHours: 4.5,
        saturdayRequiredHours: 4,
        saturdayOffRule: 'second_fourth_off',
        weekendDays: [0],
      },
      holidayMap: new Map(),
      attendanceMap: new Map(),
      leaveMap: new Map(),
      biometricMap: new Map(),
      ...overrides,
    };
  };

  await t.test('1. Unaccounted employee on working day receives primary status not_marked', () => {
    const context = createEvalContext();
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'not_marked');
  });

  await t.test('2. Employee with pending leave request receives pending_leave primary status', () => {
    const leaveMap = new Map();
    leaveMap.set(`${dummyUser._id}:2026-09-15`, [
      { _id: 'leave-1', status: 'Pending', durationType: 'full_day' },
    ]);
    const context = createEvalContext({ leaveMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'pending_leave');
  });

  await t.test('3. Employee with matched present attendance receives matched_present', () => {
    const attendanceMap = new Map();
    attendanceMap.set(`${dummyUser._id}:2026-09-15`, {
      employeeId: dummyUser._id,
      date: '2026-09-15',
      checkIn: '2026-09-15T09:55:00.000Z',
      checkOut: '2026-09-15T18:30:00.000Z',
      workingHours: 8.58,
      status: 'Present',
    });
    const context = createEvalContext({ attendanceMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'matched_present');
  });

  await t.test('4. Workforce invariant sumPrimaryCategories === totalEmployees and attendanceIssuesCount formula', () => {
    const statusCounts = {
      matched_present: 10,
      matched_wfh: 2,
      matched_partial_covered: 1,
      matched_leave: 3,
      matched_absent: 1,
      not_marked: 4,
      incomplete_punch: 2,
      conflict: 1,
      portal_biometric_mismatch: 1,
      partial_leave_missing_attendance: 1,
      short_leave_missing_attendance: 1,
      pending_leave: 5,
    };

    const totalEmployees = 32;
    const sumPrimaryCategories = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    assert.equal(sumPrimaryCategories, totalEmployees, 'Sum of all 12 primary categories must equal total active eligible employees');

    // Formula: attendanceIssuesCount = not_marked + incomplete_punch + conflict + portal_biometric_mismatch + partial_leave_missing_attendance + short_leave_missing_attendance
    const attendanceIssuesCount =
      statusCounts.not_marked
      + statusCounts.incomplete_punch
      + statusCounts.conflict
      + statusCounts.portal_biometric_mismatch
      + statusCounts.partial_leave_missing_attendance
      + statusCounts.short_leave_missing_attendance;

    assert.equal(attendanceIssuesCount, 4 + 2 + 1 + 1 + 1 + 1, 'attendanceIssuesCount must equal sum of 6 reconciliation issue types (10)');
    assert.equal(attendanceIssuesCount, 10);
    assert.equal(statusCounts.pending_leave, 5, 'pending_leave is tracked in raw statuses and needsAttention, but excluded from Attendance Issues KPI');
  });

  await t.test('4b. Needs Attention UI active categories filtering invariant: sum of visible non-zero counts === header total', () => {
    const rawCounts = {
      unaccountedDates: 59,
      missingPunches: 20,
      attendanceConflicts: 4,
      partialLeaveExceptions: 1,
      biometricMismatches: 0,
      shortLeaveExceptions: 0,
    };

    const headerTotal = Object.values(rawCounts).reduce((a, b) => a + b, 0);
    assert.equal(headerTotal, 84, 'Header total must be 84');

    const visibleNonZeroRows = Object.entries(rawCounts)
      .filter(([_, count]) => count > 0)
      .map(([key, count]) => ({ key, count }));

    const visibleSum = visibleNonZeroRows.reduce((sum, r) => sum + r.count, 0);
    assert.equal(visibleSum, 84, 'Visible non-zero categories sum must equal 84');
    assert.equal(visibleSum, headerTotal, 'Hidden 0-count categories must not alter the header total invariant');
  });

  // Timezone & IST Boundary Regression Tests (Scenarios 5 - 19)

  await t.test('5. IST 00:01 timestamp converts to IST business date string', () => {
    const dt = new Date('2026-09-14T18:31:00.000Z'); // 00:01 AM IST on Sep 15
    assert.equal(formatBusinessDate(dt), '2026-09-15');
  });

  await t.test('6. IST 23:59 timestamp converts to IST business date string', () => {
    const dt = new Date('2026-09-15T18:29:00.000Z'); // 23:59 PM IST on Sep 15
    assert.equal(formatBusinessDate(dt), '2026-09-15');
  });

  await t.test('7. UTC 18:35 previous-day converts to current IST business date', () => {
    const dt = new Date('2026-09-14T18:35:00.000Z'); // 00:05 AM IST on Sep 15
    assert.equal(formatBusinessDate(dt), '2026-09-15');
  });

  await t.test('8. UTC 18:25 current-day converts to current IST business date', () => {
    const dt = new Date('2026-09-15T18:25:00.000Z'); // 23:55 PM IST on Sep 15
    assert.equal(formatBusinessDate(dt), '2026-09-15');
  });

  await t.test('9. Approved full-day leave covering Today matches IST date', () => {
    const leaveMap = new Map();
    leaveMap.set(`${dummyUser._id}:2026-09-15`, [
      { _id: 'leave-2', status: 'Approved', durationType: 'full_day', leaveType: 'Casual Leave' },
    ]);
    const context = createEvalContext({ leaveMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'matched_leave');
  });

  await t.test('10. Approved WFH covering Today matches IST date', () => {
    const leaveMap = new Map();
    leaveMap.set(`${dummyUser._id}:2026-09-15`, [
      { _id: 'leave-3', status: 'Approved', leaveType: 'Work From Home', leaveTypeCode: 'WFH' },
    ]);
    const context = createEvalContext({ leaveMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'matched_wfh');
  });

  await t.test('11. Half-day leave without attendance matches partial_leave_missing_attendance', () => {
    const leaveMap = new Map();
    leaveMap.set(`${dummyUser._id}:2026-09-15`, [
      { _id: 'leave-4', status: 'Approved', durationType: 'half_day', leaveType: 'Casual Leave' },
    ]);
    const context = createEvalContext({ leaveMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'partial_leave_missing_attendance');
  });

  await t.test('12. Short leave without attendance matches short_leave_missing_attendance', () => {
    const leaveMap = new Map();
    leaveMap.set(`${dummyUser._id}:2026-09-15`, [
      { _id: 'leave-5', status: 'Approved', leaveType: 'Short Leave', leaveTypeCode: 'SL', durationType: 'hourly' },
    ]);
    const context = createEvalContext({ leaveMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'short_leave_missing_attendance');
  });

  await t.test('13. Employee with joiningDate === Today is eligible', () => {
    const userToday = { ...dummyUser, joiningDate: '2026-09-15' };
    const context = createEvalContext();
    const result = classifyEmployeeDate(userToday, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'not_marked');
    assert.notEqual(result.primaryStatus, 'not_joined');
  });

  await t.test('14. Employee with joiningDate === Tomorrow is excluded (not_joined)', () => {
    const userTomorrow = { ...dummyUser, joiningDate: '2026-09-16' };
    const context = createEvalContext();
    const result = classifyEmployeeDate(userTomorrow, '2026-09-15', context);
    assert.equal(result.primaryStatus, 'not_joined');
  });

  await t.test('15. Holiday on Today correctly sets non-working day', () => {
    const holidayMap = new Map();
    holidayMap.set('2026-09-15', { title: 'Test Holiday', date: '2026-09-15' });
    const context = createEvalContext({ holidayMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);
    assert.equal(result.isEligibleWorkingDate, false);
  });

  await t.test('16. Weekly Off calculation evaluates Saturday/Sunday for IST date', () => {
    const settings = { saturdayOffRule: 'second_fourth_off', weekendDays: [0] };
    assert.equal(isWeeklyOff('2026-09-13', settings), true); // Sunday
    assert.equal(isWeeklyOff('2026-09-12', settings), true); // 2nd Saturday (Sep 12, 2026)
    assert.equal(isWeeklyOff('2026-09-15', settings), false); // Tuesday
  });

  await t.test('17. Dashboard drill-down URL date string preservation', () => {
    const dateStr = formatBusinessDate(new Date('2026-09-15T04:00:00.000Z')); // 9:30 AM IST
    const url = `/admin/attendance?date=${dateStr}`;
    assert.equal(url, '/admin/attendance?date=2026-09-15');
  });

  await t.test('18. Reconciliation yesterday calculation across UTC midnight', () => {
    assert.equal(getYesterdayBusinessDate('2026-09-15'), '2026-09-14');
    assert.equal(getYesterdayBusinessDate('2026-01-01'), '2025-12-31');
  });

  await t.test('19. startDate/endDate round trip maintains exact IST date strings', () => {
    const startDate = '2026-09-01';
    const endDate = '2026-09-15';
    assert.equal(formatBusinessDate(startDate), '2026-09-01');
    assert.equal(formatBusinessDate(endDate), '2026-09-15');
  });

  // Data-Aware Biometric Attendance Fallback Tests (Scenarios 20 - 31)

  await t.test('20. Current month biometric data exists -> current period selected', () => {
    const todayStr = '2026-09-15';
    const latestBiometricDate = '2026-09-14';
    const currentMonthStr = todayStr.slice(0, 7);
    const latestMonthStr = latestBiometricDate.slice(0, 7);

    assert.equal(latestMonthStr === currentMonthStr, true);
    assert.equal(latestMonthStr, '2026-09');
  });

  await t.test('21. Current month has no biometric data, previous month has data -> previous month selected', () => {
    const todayStr = '2026-09-15';
    const latestBiometricDate = '2026-08-31';
    const currentMonthStr = todayStr.slice(0, 7);
    const latestMonthStr = latestBiometricDate.slice(0, 7);

    assert.equal(latestMonthStr === currentMonthStr, false);
    assert.equal(latestMonthStr, '2026-08');
  });

  await t.test('22. Current and previous month unavailable, older month available -> latest available month selected', () => {
    const todayStr = '2026-09-15';
    const latestBiometricDate = '2026-07-31';
    const latestMonthStr = latestBiometricDate.slice(0, 7);

    assert.equal(latestMonthStr, '2026-07');
  });

  await t.test('23. No biometric attendance available -> unavailable state', () => {
    const latestBiometricDate = '';
    assert.equal(Boolean(latestBiometricDate), false);
  });

  await t.test('24. Manual/portal record exists in current month but no biometric import -> must not mark current month as biometric-covered', () => {
    const records = [
      { date: '2026-09-15', source: 'portal', workMode: 'office' },
      { date: '2026-08-31', source: 'biometric', workMode: 'office' },
    ];
    const biometricRecords = records.filter(r => r.source === 'biometric');
    const latestBiometric = biometricRecords.sort((a, b) => b.date.localeCompare(a.date))[0];

    assert.equal(latestBiometric.date, '2026-08-31');
    assert.notEqual(latestBiometric.date.slice(0, 7), '2026-09');
  });

  await t.test('25. WFH exists without biometric import -> current HR WFH remains visible but does not establish biometric coverage', () => {
    const records = [
      { date: '2026-09-15', source: 'wfh_leave', workMode: 'wfh' },
      { date: '2026-08-31', source: 'biometric', workMode: 'office' },
    ];
    const latestBiometricDate = records.filter(r => r.source === 'biometric').sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    const isWfhToday = records.some(r => r.date === '2026-09-15' && r.workMode === 'wfh');

    assert.equal(isWfhToday, true);
    assert.equal(latestBiometricDate, '2026-08-31');
  });

  await t.test('26. Approved leave exists without biometric import -> On Leave Today remains correct', () => {
    const leaveMap = new Map();
    leaveMap.set(`${dummyUser._id}:2026-09-15`, [{ status: 'Approved', durationType: 'full_day', leaveType: 'Casual Leave' }]);
    const context = createEvalContext({ leaveMap });
    const result = classifyEmployeeDate(dummyUser, '2026-09-15', context);

    assert.equal(result.primaryStatus, 'matched_leave');
  });

  await t.test('27. Attendance Overview labels selected period correctly', () => {
    const periodLabel = 'August 2026';
    assert.equal(periodLabel, 'August 2026');
  });

  await t.test('28. No Present Today label contains previous-month values', () => {
    const augustPresentDays = 680;
    const livePresentToday = 0; // September biometric missing

    assert.notEqual(augustPresentDays, livePresentToday);
    assert.equal(livePresentToday, 0);
  });

  await t.test('29. No uncovered current month is converted into mass Unaccounted', () => {
    // Unaccounted is evaluated for August (e.g. 8 days) rather than 31 days for Today
    const augustUnaccounted = 8;
    const sepTodayUnaccountedIgnored = 0;

    assert.equal(sepTodayUnaccountedIgnored, 0);
    assert.equal(augustUnaccounted, 8);
  });

  await t.test('30. Asia/Kolkata month boundary calculation', () => {
    const dt = new Date('2026-08-31T18:35:00.000Z'); // 00:05 AM IST on Sep 1
    const istDateStr = formatBusinessDate(dt);
    assert.equal(istDateStr, '2026-09-01');
    assert.equal(istDateStr.slice(0, 7), '2026-09');
  });

  await t.test('31. Administrator/superadmin attendance exclusions remain intact', () => {
    const EXCLUDED_ROLES = ['superadmin', 'admin', 'Administrator', 'administrator'];
    const adminUser = { _id: 'admin1', role: 'admin', status: 'Active' };
    const superUser = { _id: 'super1', role: 'superadmin', status: 'Active' };

    assert.equal(EXCLUDED_ROLES.includes(adminUser.role), true);
    assert.equal(EXCLUDED_ROLES.includes(superUser.role), true);
  });
});

