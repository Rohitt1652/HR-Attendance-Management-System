import { describe, it, expect } from 'vitest';
import {
  getISTDateParts,
  getPresetDateRange,
  calculateReconciliationRate,
  shouldShowHighUnaccountedWarning,
  formatCsvFilename,
  resolveInitialPreset,
  reconciliationPresetReducer,
  getPresetAriaPressed,
  VALID_PRESETS,
} from './reconciliationHelpers';

describe('reconciliationHelpers — Quick Date Presets Boundaries', () => {
  it('1. Yesterday preset on any date', () => {
    // Current date: Mon Sep 14, 2026
    const curDate = new Date('2026-09-14T10:00:00+05:30');
    const res = getPresetDateRange('yesterday', curDate);
    expect(res.startDate).toBe('2026-09-13');
    expect(res.endDate).toBe('2026-09-13');
  });

  it('2. This Week preset on Monday (Sep 14, 2026)', () => {
    // On Monday, "This Week" should return complete previous Monday through Sunday
    const curDate = new Date('2026-09-14T10:00:00+05:30');
    const res = getPresetDateRange('this_week', curDate);
    expect(res.startDate).toBe('2026-09-07'); // Previous Monday
    expect(res.endDate).toBe('2026-09-13');   // Previous Sunday (yesterday)
  });

  it('3. This Week preset on Tuesday (Sep 15, 2026)', () => {
    // On Tuesday, "This Week" should return current Monday through Yesterday (Sep 14 to Sep 14)
    const curDate = new Date('2026-09-15T10:00:00+05:30');
    const res = getPresetDateRange('this_week', curDate);
    expect(res.startDate).toBe('2026-09-14'); // Current Monday
    expect(res.endDate).toBe('2026-09-14');   // Yesterday
  });

  it('4. This Month preset on First day of month (Oct 1, 2026)', () => {
    // On the 1st of month, "This Month" returns complete previous calendar month
    const curDate = new Date('2026-10-01T10:00:00+05:30');
    const res = getPresetDateRange('this_month', curDate);
    expect(res.startDate).toBe('2026-09-01'); // 1st of Sep
    expect(res.endDate).toBe('2026-09-30');   // 30th of Sep (last day of previous month)
  });

  it('5. This Month preset on Second day of month (Oct 2, 2026)', () => {
    // On the 2nd of month, "This Month" returns 1st of current month through Yesterday
    const curDate = new Date('2026-10-02T10:00:00+05:30');
    const res = getPresetDateRange('this_month', curDate);
    expect(res.startDate).toBe('2026-10-01'); // 1st of Oct
    expect(res.endDate).toBe('2026-10-01');   // Yesterday (Oct 1)
  });

  it('6. Month/Year Transition on Jan 1, 2027', () => {
    // On Jan 1, 2027, "This Month" and "Last Month" return complete Dec 2026
    const curDate = new Date('2027-01-01T10:00:00+05:30');
    const thisMonthRes = getPresetDateRange('this_month', curDate);
    expect(thisMonthRes.startDate).toBe('2026-12-01');
    expect(thisMonthRes.endDate).toBe('2026-12-31');

    const lastMonthRes = getPresetDateRange('last_month', curDate);
    expect(lastMonthRes.startDate).toBe('2026-12-01');
    expect(lastMonthRes.endDate).toBe('2026-12-31');
  });

  it('7. IST Date Calculation around UTC Midnight', () => {
    // 2026-09-14T23:30:00Z is 2026-09-15T05:00:00+05:30 (Tuesday morning in IST)
    const curDate = new Date('2026-09-14T23:30:00Z');
    const parts = getISTDateParts(curDate);
    expect(parts.dateStr).toBe('2026-09-15');
    expect(parts.dayOfWeek).toBe(2); // Tuesday

    const res = getPresetDateRange('this_week', curDate);
    expect(res.startDate).toBe('2026-09-14'); // Monday Sep 14
    expect(res.endDate).toBe('2026-09-14');   // Yesterday Sep 14
  });
});

describe('reconciliationHelpers — Quick Date Preset State Management & Accessibility', () => {
  const mockCurrentDate = new Date('2026-09-14T10:00:00+05:30'); // Mon Sep 14, 2026

  it('1. Clicking Last Month sets activePreset = "last_month"', () => {
    const initialState = { activePreset: 'this_month', startDate: '2026-09-01', endDate: '2026-09-13' };
    const nextState = reconciliationPresetReducer(initialState, {
      type: 'SELECT_PRESET',
      preset: 'last_month',
      currentDate: mockCurrentDate,
    });

    expect(nextState.activePreset).toBe('last_month');
    expect(nextState.startDate).toBe('2026-08-01');
    expect(nextState.endDate).toBe('2026-08-31');
  });

  it('2. Last Month remains active after report completion (unhandled reducer action)', () => {
    const state = { activePreset: 'last_month', startDate: '2026-08-01', endDate: '2026-08-31' };
    const nextState = reconciliationPresetReducer(state, { type: 'REPORT_LOADED_SUCCESS' });
    expect(nextState.activePreset).toBe('last_month');
  });

  it('3. Issue Type and pagination changes do not clear the preset', () => {
    const state = { activePreset: 'last_month', startDate: '2026-08-01', endDate: '2026-08-31' };
    const stateAfterIssue = reconciliationPresetReducer(state, { type: 'CHANGE_ISSUE_TYPE', issueType: 'not_marked' });
    const stateAfterPage = reconciliationPresetReducer(stateAfterIssue, { type: 'CHANGE_PAGE', page: 2 });
    expect(stateAfterPage.activePreset).toBe('last_month');
  });

  it('4. Manual Start Date change clears activePreset to null', () => {
    const state = { activePreset: 'last_month', startDate: '2026-08-01', endDate: '2026-08-31' };
    const nextState = reconciliationPresetReducer(state, { type: 'MANUAL_DATE_CHANGE', startDate: '2026-08-05' });
    expect(nextState.activePreset).toBeNull();
    expect(nextState.startDate).toBe('2026-08-05');
  });

  it('5. Manual End Date change clears activePreset to null', () => {
    const state = { activePreset: 'this_month', startDate: '2026-09-01', endDate: '2026-09-13' };
    const nextState = reconciliationPresetReducer(state, { type: 'MANUAL_DATE_CHANGE', endDate: '2026-09-10' });
    expect(nextState.activePreset).toBeNull();
    expect(nextState.endDate).toBe('2026-09-10');
  });

  it('6. Clear restores the correct default preset state ("this_month")', () => {
    const state = { activePreset: null, startDate: '2026-08-05', endDate: '2026-08-25' };
    const clearedState = reconciliationPresetReducer(state, { type: 'CLEAR_FILTERS', currentDate: mockCurrentDate });
    expect(clearedState.activePreset).toBe('this_month');
    expect(clearedState.startDate).toBe('2026-09-01');
    expect(clearedState.endDate).toBe('2026-09-13');
  });

  it('7. Only one preset has aria-pressed="true" (or all "false" if null)', () => {
    // Case A: activePreset is 'last_month'
    const active = 'last_month';
    const pressedMapActive = VALID_PRESETS.reduce((acc, p) => {
      acc[p] = getPresetAriaPressed(active, p);
      return acc;
    }, {});

    expect(pressedMapActive).toEqual({
      yesterday: 'false',
      this_week: 'false',
      this_month: 'false',
      last_month: 'true',
    });
    expect(Object.values(pressedMapActive).filter(v => v === 'true').length).toBe(1);

    // Case B: activePreset is null
    const nullActive = null;
    const pressedMapNull = VALID_PRESETS.reduce((acc, p) => {
      acc[p] = getPresetAriaPressed(nullActive, p);
      return acc;
    }, {});

    expect(pressedMapNull).toEqual({
      yesterday: 'false',
      this_week: 'false',
      this_month: 'false',
      last_month: 'false',
    });
    expect(Object.values(pressedMapNull).filter(v => v === 'true').length).toBe(0);
  });

  it('8. Initial preset resolution works correctly from URL or default', () => {
    expect(resolveInitialPreset('last_month', '2026-08-01', '2026-08-31')).toBe('last_month');
    expect(resolveInitialPreset('', '', '')).toBe('this_month');
    expect(resolveInitialPreset('', '2026-08-05', '2026-08-25')).toBeNull();
  });
});

describe('reconciliationHelpers — Reconciliation Rate & Warnings', () => {
  it('calculateReconciliationRate calculates rounded percentage correctly', () => {
    expect(calculateReconciliationRate(18, 20)).toBe(90);
    expect(calculateReconciliationRate(1, 3)).toBe(33);
  });

  it('calculateReconciliationRate returns "N/A" when checked is 0', () => {
    expect(calculateReconciliationRate(0, 0)).toBe('N/A');
    expect(calculateReconciliationRate(0, null)).toBe('N/A');
  });

  it('shouldShowHighUnaccountedWarning detects >= 50% ratio', () => {
    expect(shouldShowHighUnaccountedWarning(10, 20)).toBe(true);  // 50%
    expect(shouldShowHighUnaccountedWarning(11, 20)).toBe(true);  // 55%
    expect(shouldShowHighUnaccountedWarning(9, 20)).toBe(false);  // 45%
    expect(shouldShowHighUnaccountedWarning(5, 0)).toBe(false);   // checked = 0
  });

  it('formatCsvFilename produces expected name', () => {
    expect(formatCsvFilename('2026-09-01', '2026-09-14')).toBe('missing-attendance-reconciliation-2026-09-01-to-2026-09-14.csv');
  });
});

