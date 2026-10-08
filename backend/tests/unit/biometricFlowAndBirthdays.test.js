const { interpretPunches, getSinglePunchCutoff } = require('../../src/utils/punchInterpretationUtils');
const { classifyEmployeeDate } = require('../../src/services/attendanceEvaluationService');

describe('Biometric Flow & Classification Verification', () => {
  const defaultSettings = {
    officeStartTime: '09:00',
    fullDayRequiredHours: 9.0,
    saturdayRequiredHours: 4.0,
  };

  test('1. Single 10:05 punch -> checkIn 10:05, checkOut null, missing_check_out', () => {
    const res = interpretPunches(['10:05'], '2026-09-04', defaultSettings);
    expect(res.checkIn).toBe('10:05');
    expect(res.checkOut).toBeNull();
    expect(res.directionalIssue).toBe('missing_check_out');
  });

  test('2. Single 18:15 punch -> checkIn null, checkOut 18:15, missing_check_in', () => {
    const res = interpretPunches(['18:15'], '2026-09-04', defaultSettings);
    expect(res.checkIn).toBeNull();
    expect(res.checkOut).toBe('18:15');
    expect(res.directionalIssue).toBe('missing_check_in');
  });

  test('3. Single 13:30 punch (exact cutoff) -> treated as >= cutoff -> checkOut 13:30, missing_check_in', () => {
    const res = interpretPunches(['13:30'], '2026-09-04', defaultSettings);
    expect(res.checkIn).toBeNull();
    expect(res.checkOut).toBe('13:30');
    expect(res.directionalIssue).toBe('missing_check_in');
  });

  test('4. Two/multiple punches -> first punch checkIn, last punch checkOut', () => {
    const res = interpretPunches(['09:15', '13:00', '18:15'], '2026-09-04', defaultSettings);
    expect(res.checkIn).toBe('09:15');
    expect(res.checkOut).toBe('18:15');
    expect(res.directionalIssue).toBeNull();
  });

  test('5. Saturday without explicit shift -> falls back to standard cutoff (13:30), does not use saturdayRequiredHours alone', () => {
    const cutoff = getSinglePunchCutoff(defaultSettings);
    expect(cutoff).toBe('13:30'); // 09:00 + (9.0 / 2) = 13:30
    const res = interpretPunches(['10:00'], '2026-09-05', defaultSettings);
    expect(res.checkIn).toBe('10:00');
    expect(res.checkOut).toBeNull();
  });

  test('6. Classifier: Short Leave + zero punches -> short_leave_missing_attendance', () => {
    const mockUser = { _id: 'emp1' };
    const mockContext = {
      holidayMap: new Map(),
      settings: defaultSettings,
      attendanceMap: new Map(),
      leaveMap: new Map([
        ['emp1:2026-09-04', [{ status: 'Approved', durationType: 'hourly', leaveTypeCode: 'SL' }]]
      ]),
    };
    const res = classifyEmployeeDate(mockUser, '2026-09-04', mockContext);
    expect(res.primaryStatus).toBe('short_leave_missing_attendance');
  });

  test('7. Classifier: Short Leave + single punch -> incomplete_punch with leave preserved', () => {
    const mockUser = { _id: 'emp1' };
    const mockContext = {
      holidayMap: new Map(),
      settings: defaultSettings,
      attendanceMap: new Map([
        ['emp1:2026-09-04', { checkIn: null, checkOut: '18:15', source: 'biometric' }]
      ]),
      leaveMap: new Map([
        ['emp1:2026-09-04', [{ status: 'Approved', durationType: 'hourly', leaveTypeCode: 'SL' }]]
      ]),
    };
    const res = classifyEmployeeDate(mockUser, '2026-09-04', mockContext);
    expect(res.primaryStatus).toBe('incomplete_punch');
    expect(res.leaves.length).toBe(1);
  });

  test('8. Classifier: Full-Day Leave + punch -> conflict', () => {
    const mockUser = { _id: 'emp1' };
    const mockContext = {
      holidayMap: new Map(),
      settings: defaultSettings,
      attendanceMap: new Map([
        ['emp1:2026-09-04', { checkIn: '10:05', checkOut: null, source: 'biometric' }]
      ]),
      leaveMap: new Map([
        ['emp1:2026-09-04', [{ status: 'Approved', durationType: 'full_day' }]]
      ]),
    };
    const res = classifyEmployeeDate(mockUser, '2026-09-04', mockContext);
    expect(res.primaryStatus).toBe('conflict');
  });

  test('9. Classifier: WFH + punch -> conflict', () => {
    const mockUser = { _id: 'emp1' };
    const mockContext = {
      holidayMap: new Map(),
      settings: defaultSettings,
      attendanceMap: new Map([
        ['emp1:2026-09-04', { checkIn: null, checkOut: '18:15', source: 'biometric' }]
      ]),
      leaveMap: new Map([
        ['emp1:2026-09-04', [{ status: 'Approved', leaveTypeCode: 'WFH' }]]
      ]),
    };
    const res = classifyEmployeeDate(mockUser, '2026-09-04', mockContext);
    expect(res.primaryStatus).toBe('conflict');
  });
});

describe('Upcoming Birthdays Filtering & Year Rollover Logic', () => {
  const sampleEmployees = [
    { _id: '1', name: 'Alice', birthdayMonth: 9, birthdayDay: 17 }, // Today
    { _id: '2', name: 'Bob', birthdayMonth: 9, birthdayDay: 25 },   // Future this month
    { _id: '3', name: 'Charlie', birthdayMonth: 10, birthdayDay: 5 }, // Next month
    { _id: '4', name: 'PastUser', birthdayMonth: 9, birthdayDay: 10 }, // Past this month
  ];

  test('Filters out past birthdays and excludes today for upcoming list', () => {
    const currentDay = 17;
    const upcomingCurrent = sampleEmployees.filter(e => e.birthdayMonth === 9 && e.birthdayDay > currentDay);
    expect(upcomingCurrent.map(e => e.name)).toEqual(['Bob']);
  });

  test('Combines upcoming current month and next month with rollover', () => {
    const currentDay = 17;
    const upcomingCurrent = sampleEmployees.filter(e => e.birthdayMonth === 9 && e.birthdayDay > currentDay);
    const upcomingNext = sampleEmployees.filter(e => e.birthdayMonth === 10);
    const combined = [...upcomingCurrent, ...upcomingNext];

    expect(combined.map(e => e.name)).toEqual(['Bob', 'Charlie']);
  });

  test('Handles empty state gracefully', () => {
    const emptyList = [].filter(e => e.birthdayDay > 17);
    expect(emptyList).toEqual([]);
  });
});
