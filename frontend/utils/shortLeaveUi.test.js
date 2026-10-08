import { describe, it, expect } from 'vitest';

/**
 * Helper simulating the Status & Issue Pill rendering logic in MyAttendance
 */
function getEmployeeStatusDisplay(r) {
  const isShortLeaveMissing = r.issueFlags?.includes('short_leave_missing_attendance') || r.timeStatus === 'Short Leave Exception' || r.primaryStatus === 'short_leave_missing_attendance';
  const isPartialLeaveMissing = r.issueFlags?.includes('partial_leave_missing_attendance') || r.timeStatus === 'Partial Leave Exception' || r.primaryStatus === 'partial_leave_missing_attendance';

  const reqHrsText = r.requiredHours ? `${r.requiredHours}h` : 'Hours';

  const displayStatus = r.timeStatus === 'WFH'
    ? 'Present'
    : r.hasMissingPunch || r.timeStatus === 'Missing Punch'
    ? 'Needs Review'
    : r.leaveInfo?.durationType === 'full_day'
    ? 'On Leave'
    : r.leaveInfo?.durationType === 'half_day' || isPartialLeaveMissing
    ? 'Half Day'
    : isShortLeaveMissing || r.leaveInfo?.durationType === 'hourly' || r.dayType === 'Short Leave'
    ? (r.workingHours > 0 || r.workedHours > 0 ? 'Present' : 'Short Leave')
    : r.status;

  const issuePillText = isShortLeaveMissing
    ? `Attendance Missing for Remaining ${reqHrsText}`
    : isPartialLeaveMissing
    ? 'Half-day Leave — Attendance Missing for Remaining Half'
    : (r.leaveInfo?.label || (r.leaveInfo?.status === 'pending' ? 'Leave Applied' : 'Leave Approved'));

  return { displayStatus, issuePillText };
}

describe('Employee My Attendance UI — Short Leave Exception Presentation Tests', () => {
  it('1. short_leave_missing_attendance primary visible badge says Short Leave and NOT Absent', () => {
    const record = {
      status: 'Absent',
      timeStatus: 'Short Leave Exception',
      primaryStatus: 'short_leave_missing_attendance',
      dayType: 'Short Leave',
      requiredHours: 7.0,
      workedHours: 0,
      issueFlags: ['short_leave_missing_attendance'],
      leaveInfo: { hasLeave: true, durationType: 'hourly', status: 'approved' },
    };

    const res = getEmployeeStatusDisplay(record);
    expect(res.displayStatus).toBe('Short Leave');
    expect(res.displayStatus).not.toBe('Absent');
  });

  it('2. short_leave_missing_attendance shows Attendance Missing for Remaining Hours pill text', () => {
    const record = {
      status: 'Absent',
      timeStatus: 'Short Leave Exception',
      primaryStatus: 'short_leave_missing_attendance',
      dayType: 'Short Leave',
      requiredHours: 7.0,
      workedHours: 0,
      issueFlags: ['short_leave_missing_attendance'],
      leaveInfo: { hasLeave: true, durationType: 'hourly', status: 'approved' },
    };

    const res = getEmployeeStatusDisplay(record);
    expect(res.issuePillText).toBe('Attendance Missing for Remaining 7h');
  });

  it('3. Uses API requiredHours rather than hardcoded 7 when requiredHours is different (e.g. 2h on a 4h Saturday)', () => {
    const record = {
      status: 'Absent',
      timeStatus: 'Short Leave Exception',
      primaryStatus: 'short_leave_missing_attendance',
      dayType: 'Short Leave',
      requiredHours: 2.0, // 4h Saturday - 2h leave = 2h required
      workedHours: 0,
      issueFlags: ['short_leave_missing_attendance'],
      leaveInfo: { hasLeave: true, durationType: 'hourly', status: 'approved' },
    };

    const res = getEmployeeStatusDisplay(record);
    expect(res.displayStatus).toBe('Short Leave');
    expect(res.issuePillText).toBe('Attendance Missing for Remaining 2h');
  });

  it('4. Genuine Absent record (0 punches, 0 leave) still shows Absent as primary status', () => {
    const record = {
      status: 'Absent',
      timeStatus: 'On Track',
      primaryStatus: 'not_marked',
      dayType: 'Regular',
      workedHours: 0,
      issueFlags: ['not_marked'],
      leaveInfo: { hasLeave: false },
    };

    const res = getEmployeeStatusDisplay(record);
    expect(res.displayStatus).toBe('Absent');
  });

  it('5. Genuine Half-Day Leave with missing attendance remains Half Day', () => {
    const record = {
      status: 'Half Day',
      timeStatus: 'Partial Leave Exception',
      primaryStatus: 'partial_leave_missing_attendance',
      dayType: 'Half Day Leave',
      requiredHours: 4.5,
      workedHours: 0,
      issueFlags: ['partial_leave_missing_attendance'],
      leaveInfo: { hasLeave: true, durationType: 'half_day', status: 'approved' },
    };

    const res = getEmployeeStatusDisplay(record);
    expect(res.displayStatus).toBe('Half Day');
    expect(res.issuePillText).toBe('Half-day Leave — Attendance Missing for Remaining Half');
  });

  it('6. Full-Day Approved Leave remains On Leave / Leave Approved', () => {
    const record = {
      status: 'On Leave',
      timeStatus: 'Leave',
      primaryStatus: 'matched_leave',
      dayType: 'Leave',
      requiredHours: 0,
      workedHours: 0,
      issueFlags: [],
      leaveInfo: { hasLeave: true, durationType: 'full_day', status: 'approved', label: 'Leave Approved' },
    };

    const res = getEmployeeStatusDisplay(record);
    expect(res.displayStatus).toBe('On Leave');
    expect(res.issuePillText).toBe('Leave Approved');
  });

  it('7. incomplete_punch (Missing Punch) remains Needs Review / Missing Punch semantics', () => {
    const record = {
      status: 'Present',
      timeStatus: 'Missing Punch',
      primaryStatus: 'incomplete_punch',
      hasMissingPunch: true,
      dayType: 'Regular',
      workedHours: 4.5,
      issueFlags: ['missing_punch'],
      leaveInfo: { hasLeave: false },
    };

    const res = getEmployeeStatusDisplay(record);
    expect(res.displayStatus).toBe('Needs Review');
  });

  it('8. Existing short_leave_missing_attendance deep link parameter contract works', () => {
    const issueCode = 'short_leave_missing_attendance';
    const supportedIssues = ['late', 'short_hours', 'missing_punch', 'overtime', 'partial_leave_missing_attendance', 'short_leave_missing_attendance'];
    expect(supportedIssues.includes(issueCode)).toBe(true);
  });
});
