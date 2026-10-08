import { describe, it, expect } from 'vitest';
import {
  buildAttendanceUrl,
  getRecommendedActionGuidance,
  isValidIsoDate,
  formatPrettyDate,
  parseAttendanceQueryParams,
} from './reconciliationHelpers';

describe('reconciliationHelpers — Navigation & Guidance Helpers', () => {
  it('1. Correct Attendance URL generation using URLSearchParams', () => {
    const url = buildAttendanceUrl('65e123456789abcdef012345', '2026-09-11');
    expect(url).toBe('/admin/attendance?employeeId=65e123456789abcdef012345&startDate=2026-09-11&endDate=2026-09-11&from=reconciliation');
  });

  it('2. Employee identifier and special characters encoding', () => {
    const url = buildAttendanceUrl('DT-125 & Special', '2026-09-11');
    expect(url).toContain('employeeId=DT-125+%26+Special');
    expect(url).toContain('from=reconciliation');
  });

  it('3. Exact same start and end exception date', () => {
    const url = buildAttendanceUrl('65e123', '2026-09-14');
    expect(url).toContain('startDate=2026-09-14');
    expect(url).toContain('endDate=2026-09-14');
  });

  it('4. Invalid dates rejected or omitted safely', () => {
    const urlInvalidDate = buildAttendanceUrl('65e123', 'invalid-date');
    expect(urlInvalidDate).toBe('/admin/attendance?employeeId=65e123&from=reconciliation');
    expect(urlInvalidDate).not.toContain('startDate');
  });

  it('5. Missing employee identifier handled safely', () => {
    const urlNoEmp = buildAttendanceUrl('', '2026-09-11');
    expect(urlNoEmp).toBe('/admin/attendance?startDate=2026-09-11&endDate=2026-09-11&from=reconciliation');
  });

  it('6. Recommended Action returns clean guidance text without duplicate links', () => {
    expect(getRecommendedActionGuidance('not_marked')).toBe('Verify whether Leave, WFH, or attendance should be recorded.');
    expect(getRecommendedActionGuidance('pending_leave')).toBe('Review the pending leave request.');
    expect(getRecommendedActionGuidance('incomplete_punch')).toBe('Verify and correct the missing punch.');
    expect(getRecommendedActionGuidance('conflict')).toBe('Review the attendance and approved leave/WFH overlap.');
    expect(getRecommendedActionGuidance('portal_biometric_mismatch')).toBe('Verify portal attendance against biometric evidence.');
    expect(getRecommendedActionGuidance('partial_leave_missing_attendance')).toBe('Verify complementary half-day attendance.');
    expect(getRecommendedActionGuidance('short_leave_missing_attendance')).toBe('Verify attendance for the remaining working hours.');
  });

  it('7. parseAttendanceQueryParams correctly parses searchParams interface', () => {
    const mockParams = {
      get: (key) => {
        const data = {
          employeeId: '65e123',
          startDate: '2026-09-11',
          endDate: '2026-09-11',
          from: 'reconciliation',
        };
        return data[key] || null;
      },
    };
    const parsed = parseAttendanceQueryParams(mockParams);
    expect(parsed.fromReconciliation).toBe(true);
    expect(parsed.employeeId).toBe('65e123');
    expect(parsed.startDate).toBe('2026-09-11');
    expect(parsed.endDate).toBe('2026-09-11');
    expect(parsed.isValid).toBe(true);
  });

  it('8. formatPrettyDate converts YYYY-MM-DD to readable format', () => {
    expect(formatPrettyDate('2026-09-11')).toBe('11 Sep 2026');
  });
});
