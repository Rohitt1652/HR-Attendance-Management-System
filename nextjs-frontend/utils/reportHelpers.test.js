import { describe, it, expect } from 'vitest';
import {
  formatReportDate,
  formatDurationDisplay,
  getMonthDateRange,
  generateExportFilename,
  generateScopeBannerText,
  generateReportInsight,
} from './reportHelpers';

describe('reportHelpers Utilities', () => {
  it('formats dates consistently as DD MMM YYYY', () => {
    expect(formatReportDate('2026-09-01')).toBe('1 Sep 2026');
    expect(formatReportDate('2026-12-31')).toBe('31 Dec 2026');
    expect(formatReportDate(null)).toBe('—');
  });

  it('formats duration display explicitly for days and hours', () => {
    expect(formatDurationDisplay(0.5, 0, 'half_day')).toBe('0.5 day');
    expect(formatDurationDisplay(1, 0, 'full_day')).toBe('1 day');
    expect(formatDurationDisplay(2.5, 0, 'full_day')).toBe('2.5 days');
    expect(formatDurationDisplay(null, 2, 'hourly')).toBe('2 hours');
    expect(formatDurationDisplay(null, 1, 'hourly')).toBe('1 hour');
  });

  it('generates start and end dates for a given month and year', () => {
    const Sept2026 = getMonthDateRange(2026, 9);
    expect(Sept2026.start).toBe('2026-09-01');
    expect(Sept2026.end).toBe('2026-09-30');
    expect(Sept2026.monthName).toBe('September');

    const Feb2024 = getMonthDateRange(2024, 2);
    expect(Feb2024.end).toBe('2024-02-29'); // Leap year
  });

  it('generates meaningful contextual export filenames', () => {
    expect(generateExportFilename('leave', { startDate: '2026-09-01', endDate: '2026-09-30' }))
      .toBe('leave-report-2026-09-01-to-2026-09-30.csv');
    expect(generateExportFilename('daily', { date: '2026-09-11' }))
      .toBe('daily-report-2026-09-11.csv');
    expect(generateExportFilename('monthly', { year: 2026, month: 9 }))
      .toBe('monthly-report-september-2026.csv');
  });

  it('generates scope banner text', () => {
    const banner = generateScopeBannerText('leave', { startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(banner).toBe('Showing Leave Report (1 Sep 2026 – 30 Sep 2026)');
  });

  it('generates factual neutral insight text', () => {
    const insight = generateReportInsight('leave', { totalApplications: 10, unplannedCount: 4 }, [{ id: 1 }]);
    expect(insight).toBe('40% of leave applications in this period were unplanned (4 of 10).');
  });
});
