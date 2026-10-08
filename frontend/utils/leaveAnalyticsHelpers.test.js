import { describe, it, expect } from 'vitest';
import {
  formatDays,
  formatHours,
  formatPercent,
  normalizeLeaveTypeName,
  getStatusTextLabel,
  getStatusSubLabel,
} from './leaveAnalyticsHelpers';

describe('leaveAnalyticsHelpers', () => {
  it('formats day strings correctly', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(178)).toBe('178 days');
    expect(formatDays(0)).toBe('0 days');
    expect(formatDays(null)).toBe('0 days');
  });

  it('formats hours strings correctly', () => {
    expect(formatHours(1.666666)).toBe('1.67 hours');
    expect(formatHours(1.333333)).toBe('1.33 hours');
    expect(formatHours(1)).toBe('1 hour');
    expect(formatHours(0)).toBe('0 hours');
  });

  it('formats percentages correctly', () => {
    expect(formatPercent(18.52)).toBe('18.5%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(100)).toBe('100%');
  });

  it('normalizes plural leave type names', () => {
    expect(normalizeLeaveTypeName('Marital Leaves')).toBe('Marital Leave');
    expect(normalizeLeaveTypeName('Short Leaves')).toBe('Short Leave');
    expect(normalizeLeaveTypeName('Casual Leave')).toBe('Casual Leave');
  });

  it('returns dynamic status labels', () => {
    expect(getStatusTextLabel('Approved')).toBe('Approved Leave Days');
    expect(getStatusTextLabel('Pending')).toBe('Pending Requested Days');
    expect(getStatusTextLabel('Rejected')).toBe('Rejected Requested Days');
    expect(getStatusTextLabel('All')).toBe('Total Requested Days');
  });

  it('returns status subtext labels', () => {
    expect(getStatusSubLabel('Approved', 142)).toBe('142 approved applications');
    expect(getStatusSubLabel('Pending', 12)).toBe('12 pending applications');
  });
});
