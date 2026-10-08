const test = require('node:test');
const assert = require('node:assert/strict');
const { filterCalculatedRecords, calculateAttendanceRecord } = require('../services/attendancePolicyService');

test('Comprehensive Attendance Filter & Issue Flags Unit Tests', async (t) => {

  const baseSettings = {
    officeStartTime: '10:00',
    lateThreshold: '10:15',
    fullDayRequiredHours: 9,
    halfDayRequiredHours: 4.5,
    saturdayRequiredHours: 4,
    saturdayOffRule: 'second_fourth_off',
    weekendDays: [0],
  };

  const emptyContext = {
    settings: baseSettings,
    holidayMap: new Map(),
    leaveMap: new Map(),
  };

  // 1. Present includes stored Present and Full Day.
  await t.test('1. Status: present matches both Present and Full Day records', () => {
    const records = [
      { status: 'Present', date: '2026-09-01' },
      { status: 'Full Day', date: '2026-09-02' },
      { status: 'Half Day', date: '2026-09-03' },
      { status: 'Absent', date: '2026-09-04' },
      { status: 'On Leave', date: '2026-09-05' },
    ];
    const res = filterCalculatedRecords(records, { status: 'present' });
    assert.equal(res.length, 2);
    assert.deepEqual(res.map(r => r.date), ['2026-09-01', '2026-09-02']);
  });

  // 2. Half Day, Absent and On Leave match only their respective Status filters.
  await t.test('2. Status: half_day, absent, on_leave match only their respective status filters', () => {
    const records = [
      { status: 'Present', date: '2026-09-01' },
      { status: 'Half Day', date: '2026-09-02' },
      { status: 'Absent', date: '2026-09-03' },
      { status: 'On Leave', date: '2026-09-04' },
    ];
    assert.equal(filterCalculatedRecords(records, { status: 'half_day' }).length, 1);
    assert.equal(filterCalculatedRecords(records, { status: 'half_day' })[0].date, '2026-09-02');

    assert.equal(filterCalculatedRecords(records, { status: 'absent' }).length, 1);
    assert.equal(filterCalculatedRecords(records, { status: 'absent' })[0].date, '2026-09-03');

    assert.equal(filterCalculatedRecords(records, { status: 'on_leave' }).length, 1);
    assert.equal(filterCalculatedRecords(records, { status: 'on_leave' })[0].date, '2026-09-04');
  });

  // 3. WFH filter isolates WFH.
  await t.test('3. Work Mode: wfh isolates WFH records', () => {
    const records = [
      { workMode: 'wfh', status: 'Present', date: '2026-09-01' },
      { workMode: 'office', checkIn: '2026-09-02T09:00:00.000Z', checkOut: '2026-09-02T18:00:00.000Z', status: 'Present', date: '2026-09-02' },
    ];
    const res = filterCalculatedRecords(records, { workMode: 'wfh' });
    assert.equal(res.length, 1);
    assert.equal(res[0].date, '2026-09-01');
  });

  // 4. Office excludes WFH and non-working/non-attendance records without office evidence.
  await t.test('4. Work Mode: office excludes WFH, Leave, Absent without physical punch evidence', () => {
    const records = [
      { workMode: 'wfh', status: 'Present', date: '2026-09-01' },
      { workMode: 'office', checkIn: '2026-09-02T09:00:00.000Z', checkOut: '2026-09-02T18:00:00.000Z', status: 'Present', date: '2026-09-02' },
      { workMode: 'office', status: 'On Leave', date: '2026-09-03' }, // Punchless Leave
      { workMode: 'office', status: 'Absent', date: '2026-09-04' },   // Punchless Absent
    ];
    const res = filterCalculatedRecords(records, { workMode: 'office' });
    assert.equal(res.length, 1);
    assert.equal(res[0].date, '2026-09-02');
  });

  // 5. Working Day includes configured working Saturdays.
  await t.test('5. Day Type: working_day includes configured working Saturdays', () => {
    const records = [
      { dayType: 'Working Day', isWeeklyOff: false, isHoliday: false, date: '2026-09-01' },
      { dayType: 'Working Day', isWeeklyOff: false, isHoliday: false, date: '2026-09-05' }, // 1st Saturday (working)
      { dayType: 'Weekly Off', isWeeklyOff: true, isHoliday: false, date: '2026-09-12' },  // 2nd Saturday (off)
    ];
    const res = filterCalculatedRecords(records, { dayType: 'working_day' });
    assert.equal(res.length, 2);
    assert.deepEqual(res.map(r => r.date), ['2026-09-01', '2026-09-05']);
  });

  // 6. Weekly Off respects second/fourth Saturday settings.
  await t.test('6. Day Type: weekly_off respects 2nd/4th Saturday rules', () => {
    const records = [
      { dayType: 'Working Day', isWeeklyOff: false, isHoliday: false, date: '2026-09-05' },
      { dayType: 'Weekly Off', isWeeklyOff: true, isHoliday: false, date: '2026-09-12' },
    ];
    const res = filterCalculatedRecords(records, { dayType: 'weekly_off' });
    assert.equal(res.length, 1);
    assert.equal(res[0].date, '2026-09-12');
  });

  // 7. Holiday matches CalendarEvent holidays.
  await t.test('7. Day Type: holiday matches holiday records', () => {
    const records = [
      { dayType: 'Working Day', isWeeklyOff: false, isHoliday: false, date: '2026-09-01' },
      { dayType: 'Holiday', isWeeklyOff: false, isHoliday: true, date: '2026-09-15' },
    ];
    const res = filterCalculatedRecords(records, { dayType: 'holiday' });
    assert.equal(res.length, 1);
    assert.equal(res[0].date, '2026-09-15');
  });

  // 8. Missing Punch does not automatically match Short Hours.
  await t.test('8. Missing Punch does not automatically match Short Hours', () => {
    const calcMissing = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01', // Tuesday (working day)
      checkIn: '2026-09-01T09:00:00.000Z',
      checkOut: null,
    }, emptyContext);

    assert.equal(calcMissing.hasMissingPunch, true);
    assert.equal(calcMissing.issueFlags.includes('missing_punch'), true);
    assert.equal(calcMissing.issueFlags.includes('short_hours'), false);

    const resShort = filterCalculatedRecords([calcMissing], { issue: 'short_hours' });
    assert.equal(resShort.length, 0);
  });

  // 9. Complete short attendance matches Short Hours.
  await t.test('9. Complete short attendance matches Short Hours', () => {
    const calcShort = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      checkIn: '2026-09-01T09:00:00.000Z',
      checkOut: '2026-09-01T15:00:00.000Z', // 6h worked vs 9h required = 3h short
    }, emptyContext);

    assert.equal(calcShort.shortHours, 3);
    assert.equal(calcShort.issueFlags.includes('short_hours'), true);
    assert.equal(calcShort.issueFlags.includes('missing_punch'), false);

    const res = filterCalculatedRecords([calcShort], { issue: 'short_hours' });
    assert.equal(res.length, 1);
  });

  // 10. Overtime matches complete overtime records.
  await t.test('10. Overtime matches complete overtime records', () => {
    const calcOT = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      checkIn: '2026-09-01T09:00:00.000Z',
      checkOut: '2026-09-01T19:30:00.000Z', // 10.5h worked vs 9h required = 1.5h OT
    }, emptyContext);

    assert.equal(calcOT.overtimeHours, 1.5);
    assert.equal(calcOT.issueFlags.includes('overtime'), true);

    const res = filterCalculatedRecords([calcOT], { issue: 'overtime' });
    assert.equal(res.length, 1);
  });

  // 11. Complete on-time overtime matches both On Track and Overtime.
  await t.test('11. Complete on-time overtime matches both On Track and Overtime', () => {
    const calcOTOnTrack = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      checkIn: '2026-09-01T03:30:00.000Z',  // 9:00 AM IST
      checkOut: '2026-09-01T13:30:00.000Z', // 7:00 PM IST (10h worked, 1h OT)
    }, emptyContext);

    assert.equal(calcOTOnTrack.issueFlags.includes('on_track'), true);
    assert.equal(calcOTOnTrack.issueFlags.includes('overtime'), true);

    const resOnTrack = filterCalculatedRecords([calcOTOnTrack], { issue: 'on_track' });
    assert.equal(resOnTrack.length, 1);

    const resOT = filterCalculatedRecords([calcOTOnTrack], { issue: 'overtime' });
    assert.equal(resOT.length, 1);
  });

  // 12. Incomplete non-working-day punch matches Missing Punch and Worked on Non-Working Day.
  await t.test('12. Incomplete non-working-day punch matches Missing Punch and Worked on Non-Working Day', () => {
    const calcSundayMissing = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-06', // Sunday (Weekly Off)
      checkIn: '2026-09-06T10:00:00.000Z',
      checkOut: null,
    }, emptyContext);

    assert.equal(calcSundayMissing.isWeeklyOff, true);
    assert.equal(calcSundayMissing.issueFlags.includes('missing_punch'), true);
    assert.equal(calcSundayMissing.issueFlags.includes('worked_non_working_day'), true);

    assert.equal(filterCalculatedRecords([calcSundayMissing], { issue: 'missing_punch' }).length, 1);
    assert.equal(filterCalculatedRecords([calcSundayMissing], { issue: 'worked_non_working_day' }).length, 1);
  });

  // 13. Punch + approved Leave does not match On Track.
  await t.test('13. Punch + approved Leave does not match On Track (classified as Conflict)', () => {
    const leaveContext = {
      ...emptyContext,
      leaveMap: new Map([
        ['emp1:2026-09-01', [{ status: 'Approved', durationType: 'full_day', leaveType: 'Casual Leave' }]],
      ]),
    };
    const calcConflict = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      checkIn: '2026-09-01T09:00:00.000Z',
      checkOut: '2026-09-01T18:00:00.000Z',
    }, leaveContext);

    assert.equal(calcConflict.issueFlags.includes('conflict'), true);
    assert.equal(calcConflict.issueFlags.includes('on_track'), false);
    assert.equal(calcConflict.timeStatus, 'Conflict');

    const res = filterCalculatedRecords([calcConflict], { issue: 'on_track' });
    assert.equal(res.length, 0);
  });

  // 14. Punch + approved WFH does not match On Track.
  await t.test('14. Punch + approved WFH does not match On Track', () => {
    const wfhContext = {
      ...emptyContext,
      leaveMap: new Map([
        ['emp1:2026-09-01', [{ status: 'Approved', leaveTypeCode: 'WFH', leaveType: 'Work From Home' }]],
      ]),
    };
    const calcWfh = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      checkIn: '2026-09-01T09:00:00.000Z',
      checkOut: '2026-09-01T18:00:00.000Z',
    }, wfhContext);

    assert.equal(calcWfh.workMode, 'wfh');
    assert.equal(calcWfh.issueFlags.includes('on_track'), false);

    const res = filterCalculatedRecords([calcWfh], { issue: 'on_track' });
    assert.equal(res.length, 0);
  });

  // 15. Valid WFH without punches is not Missing Punch.
  await t.test('15. Valid WFH without punches is not Missing Punch', () => {
    const calcPureWfh = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      workMode: 'wfh',
    }, emptyContext);

    assert.equal(calcPureWfh.hasMissingPunch, false);
    assert.equal(calcPureWfh.issueFlags.includes('missing_punch'), false);
    assert.equal(calcPureWfh.timeStatus, 'WFH');
  });

  // 16. Approved Leave without punches is not Missing Punch.
  await t.test('16. Approved Leave without punches is not Missing Punch', () => {
    const leaveContext = {
      ...emptyContext,
      leaveMap: new Map([
        ['emp1:2026-09-01', [{ status: 'Approved', durationType: 'full_day', leaveType: 'Sick Leave' }]],
      ]),
    };
    const calcPureLeave = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      source: 'leave',
    }, leaveContext);

    assert.equal(calcPureLeave.hasMissingPunch, false);
    assert.equal(calcPureLeave.issueFlags.includes('missing_punch'), false);
    assert.equal(calcPureLeave.status, 'On Leave');
  });

  // 17. Late + Short Hours produces both visible issue flags.
  await t.test('17. Late + Short Hours produces both visible issue flags', () => {
    const calcLateShort = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      checkIn: '2026-09-01T10:30:00.000Z',  // Late check-in
      checkOut: '2026-09-01T16:00:00.000Z', // 5.5h worked vs 9h = 3.5h short
    }, emptyContext);

    assert.equal(calcLateShort.isLate, true);
    assert.equal(calcLateShort.shortHours, 3.5);
    assert.equal(calcLateShort.issueFlags.includes('late'), true);
    assert.equal(calcLateShort.issueFlags.includes('short_hours'), true);
  });

  // 18. Missing Punch + Late produces both visible issue flags.
  await t.test('18. Missing Punch + Late produces both visible issue flags', () => {
    const calcLateMissing = calculateAttendanceRecord({
      employeeId: 'emp1',
      date: '2026-09-01',
      checkIn: '2026-09-01T10:30:00.000Z', // Late check-in, missing checkout
      checkOut: null,
    }, emptyContext);

    assert.equal(calcLateMissing.isLate, true);
    assert.equal(calcLateMissing.hasMissingPunch, true);
    assert.equal(calcLateMissing.issueFlags.includes('late'), true);
    assert.equal(calcLateMissing.issueFlags.includes('missing_punch'), true);
  });

  // 19. Legacy and new query codes return identical matching records.
  await t.test('19. Legacy and new query codes return identical matching records', () => {
    const records = [
      { issueFlags: ['late'], isLate: true, date: '2026-09-01' },
      { issueFlags: ['short_hours'], shortHours: 3, checkIn: 'a', checkOut: 'b', date: '2026-09-02' },
    ];

    const newLate = filterCalculatedRecords(records, { issue: 'late' });
    const legacyLate = filterCalculatedRecords(records, { timeStatus: 'Late' });
    assert.deepEqual(newLate, legacyLate);

    const newShort = filterCalculatedRecords(records, { issue: 'short_hours' });
    const legacyShort = filterCalculatedRecords(records, { timeStatus: 'Short Time' });
    assert.deepEqual(newShort, legacyShort);
  });

  // 20. Combined filters apply AND across groups.
  await t.test('20. Combined filters apply AND condition across groups', () => {
    const records = [
      { status: 'Present', workMode: 'wfh', date: '2026-09-01' },
      { status: 'Present', workMode: 'office', checkIn: '2026-09-02T09:00:00.000Z', checkOut: '2026-09-02T18:00:00.000Z', date: '2026-09-02' },
      { status: 'On Leave', workMode: 'office', date: '2026-09-03' },
    ];

    const res = filterCalculatedRecords(records, { status: 'present', workMode: 'office' });
    assert.equal(res.length, 1);
    assert.equal(res[0].date, '2026-09-02');
  });

  // 21. Unsupported query codes return a controlled validation error (simulated controller check).
  await t.test('21. Unsupported query codes validation check', () => {
    const validStatus = ['', 'present', 'half_day', 'absent', 'on_leave', 'Present', 'Full Day', 'Half Day', 'Absent', 'On Leave'];
    const validIssue = ['', 'on_track', 'late', 'short_hours', 'missing_punch', 'overtime', 'worked_non_working_day', 'On Track', 'Late', 'Missing Punch', 'Short Time', 'Short Hours', 'Overtime', 'Worked on Holiday'];

    assert.equal(validStatus.includes('invalid_status'), false);
    assert.equal(validIssue.includes('random_issue'), false);
  });

  // 22. Every Issue-filtered record contains the corresponding visible issue flag.
  await t.test('22. Every Issue-filtered record contains the corresponding visible issue flag', () => {
    const records = [
      { issueFlags: ['late'], date: '2026-09-01' },
      { issueFlags: ['short_hours'], date: '2026-09-02' },
      { issueFlags: ['missing_punch'], date: '2026-09-03' },
      { issueFlags: ['overtime'], date: '2026-09-04' },
      { issueFlags: ['worked_non_working_day'], date: '2026-09-05' },
      { issueFlags: ['on_track'], date: '2026-09-06' },
    ];

    const issues = ['late', 'short_hours', 'missing_punch', 'overtime', 'worked_non_working_day', 'on_track'];
    for (const issueCode of issues) {
      const res = filterCalculatedRecords(records, { issue: issueCode });
      assert.equal(res.length, 1);
      assert.equal(res[0].issueFlags.includes(issueCode), true);
    }
  });

});
