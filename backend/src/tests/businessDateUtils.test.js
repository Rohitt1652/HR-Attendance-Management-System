const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatBusinessDate,
  getTodayBusinessDate,
  getYesterdayBusinessDate,
  getBusinessDayUtcRange,
  getBusinessDateRangeUtcBounds,
  parseUtcDateString,
} = require('../utils/businessDateUtils');

test('Centralized Business Date Utilities Tests (Asia/Kolkata)', async (t) => {
  await t.test('1. IST 00:01 boundary converts to current IST business date', () => {
    // 00:01 AM IST on Sep 15, 2026 is Sep 14, 2026 18:31:00 UTC
    const date1 = new Date('2026-09-14T18:31:00.000Z');
    assert.equal(formatBusinessDate(date1), '2026-09-15');
  });

  await t.test('2. IST 23:59 boundary converts to current IST business date', () => {
    // 23:59 PM IST on Sep 15, 2026 is Sep 15, 2026 18:29:00 UTC
    const date2 = new Date('2026-09-15T18:29:00.000Z');
    assert.equal(formatBusinessDate(date2), '2026-09-15');
  });

  await t.test('3. getBusinessDayUtcRange produces exact half-open UTC range for IST day', () => {
    const range = getBusinessDayUtcRange('2026-09-15');
    assert.equal(range.start.toISOString(), '2026-09-14T18:30:00.000Z');
    assert.equal(range.nextDayStart.toISOString(), '2026-09-15T18:30:00.000Z');
  });

  await t.test('4. getBusinessDateRangeUtcBounds produces exact half-open range for inclusive dates', () => {
    const range = getBusinessDateRangeUtcBounds('2026-09-01', '2026-09-15');
    assert.equal(range.start.toISOString(), '2026-08-31T18:30:00.000Z');
    assert.equal(range.nextDayStart.toISOString(), '2026-09-15T18:30:00.000Z');
  });

  await t.test('5. getYesterdayBusinessDate safely calculates previous IST business date', () => {
    assert.equal(getYesterdayBusinessDate('2026-09-15'), '2026-09-14');
    assert.equal(getYesterdayBusinessDate('2026-01-01'), '2025-12-31');
  });

  await t.test('6. parseUtcDateString is machine-timezone independent', () => {
    const utcDate = parseUtcDateString('2026-09-15');
    assert.equal(utcDate.getUTCFullYear(), 2026);
    assert.equal(utcDate.getUTCMonth(), 8); // 0-indexed September = 8
    assert.equal(utcDate.getUTCDate(), 15);
    assert.equal(utcDate.getUTCDay(), 2); // Tuesday = 2
  });
});
