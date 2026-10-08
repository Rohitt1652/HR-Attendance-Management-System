import { describe, test, expect } from 'vitest';
import { getNeedsAttentionCategories } from './dashboardNeedsAttentionHelpers';

describe('Needs Attention Refinement & Invariant Tests', () => {
  test('1 & 2. count > 0 is rendered, count = 0 is omitted', () => {
    const input = {
      unaccountedDates: 59,
      missingPunches: 20,
      attendanceConflicts: 4,
      partialLeaveExceptions: 1,
      biometricMismatches: 0,
      shortLeaveExceptions: 0,
      periodLabel: 'August 2026',
    };

    const result = getNeedsAttentionCategories(input, {
      isTeamLead: false,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    const activeKeys = result.activeCategories.map(c => c.key);
    expect(activeKeys).toEqual([
      'unaccountedDates',
      'missingPunches',
      'attendanceConflicts',
      'partialLeaveExceptions',
    ]);
    expect(activeKeys.includes('biometricMismatches')).toBe(false);
    expect(activeKeys.includes('shortLeaveExceptions')).toBe(false);
  });

  test('3. Biometric mismatch becomes visible automatically when count > 0', () => {
    const zeroInput = { biometricMismatches: 0, periodLabel: 'August 2026' };
    const zeroResult = getNeedsAttentionCategories(zeroInput);
    expect(zeroResult.activeCategories.some(c => c.key === 'biometricMismatches')).toBe(false);

    const nonZeroInput = { biometricMismatches: 3, periodLabel: 'August 2026' };
    const nonZeroResult = getNeedsAttentionCategories(nonZeroInput);
    const mismatchItem = nonZeroResult.activeCategories.find(c => c.key === 'biometricMismatches');
    expect(mismatchItem).toBeTruthy();
    expect(mismatchItem.count).toBe(3);
    expect(mismatchItem.label).toBe('Biometric Mismatches');
  });

  test('4. Singular/plural labels are correctly evaluated', () => {
    const singleInput = {
      unaccountedDates: 1,
      missingPunches: 1,
      attendanceConflicts: 1,
      partialLeaveExceptions: 1,
      biometricMismatches: 1,
      shortLeaveExceptions: 1,
    };

    const singleResult = getNeedsAttentionCategories(singleInput);
    const singleLabels = singleResult.activeCategories.map(c => ({ key: c.key, label: c.label }));
    expect(singleLabels).toEqual([
      { key: 'unaccountedDates', label: 'Unaccounted Date' },
      { key: 'missingPunches', label: 'Missing Punch' },
      { key: 'attendanceConflicts', label: 'Attendance Conflict' },
      { key: 'partialLeaveExceptions', label: 'Partial Leave Exception' },
      { key: 'biometricMismatches', label: 'Biometric Mismatch' },
      { key: 'shortLeaveExceptions', label: 'Short Leave Exception' },
    ]);

    const pluralInput = {
      unaccountedDates: 59,
      missingPunches: 20,
      attendanceConflicts: 4,
      partialLeaveExceptions: 2,
      biometricMismatches: 5,
      shortLeaveExceptions: 3,
    };

    const pluralResult = getNeedsAttentionCategories(pluralInput);
    const pluralLabels = pluralResult.activeCategories.map(c => ({ key: c.key, label: c.label }));
    expect(pluralLabels).toEqual([
      { key: 'unaccountedDates', label: 'Unaccounted Dates' },
      { key: 'missingPunches', label: 'Missing Punches' },
      { key: 'attendanceConflicts', label: 'Attendance Conflicts' },
      { key: 'partialLeaveExceptions', label: 'Partial Leave Exceptions' },
      { key: 'biometricMismatches', label: 'Biometric Mismatches' },
      { key: 'shortLeaveExceptions', label: 'Short Leave Exceptions' },
    ]);
  });

  test('5. All issue counts = 0 shows positive empty state with dynamic period', () => {
    const zeroInput = {
      unaccountedDates: 0,
      missingPunches: 0,
      attendanceConflicts: 0,
      partialLeaveExceptions: 0,
      biometricMismatches: 0,
      shortLeaveExceptions: 0,
      periodLabel: 'August 2026',
    };

    const result = getNeedsAttentionCategories(zeroInput);
    expect(result.hasNoIssues).toBe(true);
    expect(result.activeCategories.length).toBe(0);
    expect(result.emptyStateMessage).toBe('No attendance issues for August 2026.');
  });

  test('6 & 7. Header total and visible sum remain mathematically equal', () => {
    const input = {
      unaccountedDates: 59,
      missingPunches: 20,
      attendanceConflicts: 4,
      partialLeaveExceptions: 1,
      biometricMismatches: 0,
      shortLeaveExceptions: 0,
    };

    const result = getNeedsAttentionCategories(input);
    expect(result.totalCount).toBe(84);
    expect(result.visibleSum).toBe(84);
    expect(result.visibleSum).toBe(result.totalCount);
  });

  test('8 & 10. HR/Admin drill-down links preserve exact reconciliation issueType params', () => {
    const input = {
      unaccountedDates: 10,
      missingPunches: 5,
      attendanceConflicts: 2,
      partialLeaveExceptions: 1,
      biometricMismatches: 1,
      shortLeaveExceptions: 1,
    };

    const options = {
      isTeamLead: false,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    };

    const result = getNeedsAttentionCategories(input, options);
    const hrefMap = Object.fromEntries(result.activeCategories.map(c => [c.key, c.href]));

    expect(hrefMap.unaccountedDates).toBe('/admin/attendance/reconciliation?startDate=2026-08-01&endDate=2026-08-31&issueType=not_marked');
    expect(hrefMap.missingPunches).toBe('/admin/attendance/reconciliation?startDate=2026-08-01&endDate=2026-08-31&issueType=incomplete_punch');
    expect(hrefMap.attendanceConflicts).toBe('/admin/attendance/reconciliation?startDate=2026-08-01&endDate=2026-08-31&issueType=conflict');
    expect(hrefMap.partialLeaveExceptions).toBe('/admin/attendance/reconciliation?startDate=2026-08-01&endDate=2026-08-31&issueType=partial_leave_missing_attendance');
    expect(hrefMap.biometricMismatches).toBe('/admin/attendance/reconciliation?startDate=2026-08-01&endDate=2026-08-31&issueType=portal_biometric_mismatch');
    expect(hrefMap.shortLeaveExceptions).toBe('/admin/attendance/reconciliation?startDate=2026-08-01&endDate=2026-08-31&issueType=short_leave_missing_attendance');
  });

  test('9. Team Lead drill-down links preserve team-scoped attendance issue params', () => {
    const input = {
      unaccountedDates: 10,
      missingPunches: 5,
      attendanceConflicts: 2,
      partialLeaveExceptions: 1,
      biometricMismatches: 1,
      shortLeaveExceptions: 1,
    };

    const options = {
      isTeamLead: true,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    };

    const result = getNeedsAttentionCategories(input, options);
    const hrefMap = Object.fromEntries(result.activeCategories.map(c => [c.key, c.href]));

    expect(hrefMap.unaccountedDates).toBe('/admin/attendance?issue=not_marked&startDate=2026-08-01&endDate=2026-08-31');
    expect(hrefMap.missingPunches).toBe('/admin/attendance?issue=missing_punch&startDate=2026-08-01&endDate=2026-08-31');
    expect(hrefMap.attendanceConflicts).toBe('/admin/attendance?issue=conflict&startDate=2026-08-01&endDate=2026-08-31');
    expect(hrefMap.partialLeaveExceptions).toBe('/admin/attendance?issue=partial_leave_missing_attendance&startDate=2026-08-01&endDate=2026-08-31');
    expect(hrefMap.biometricMismatches).toBe('/admin/attendance?issue=portal_biometric_mismatch&startDate=2026-08-01&endDate=2026-08-31');
    expect(hrefMap.shortLeaveExceptions).toBe('/admin/attendance?issue=short_leave_missing_attendance&startDate=2026-08-01&endDate=2026-08-31');
  });
});
