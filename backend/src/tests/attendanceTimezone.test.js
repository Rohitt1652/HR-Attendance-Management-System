const test = require('node:test');
const assert = require('node:assert/strict');

const formatAttendanceTimeIST = (value, hour12 = true) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
    timeZone: 'Asia/Kolkata',
  });
};

test('Attendance Timezone Formatting & Edge Cases Test Suite', async (t) => {
  await t.test('1. Normal UTC timestamp converts cleanly to Asia/Kolkata (IST 12h)', () => {
    // 05:20 UTC + 5h30m = 10:50 AM IST
    const timestamp = '2026-08-22T05:20:00.000Z';
    const formatted = formatAttendanceTimeIST(timestamp, true);
    assert.strictEqual(formatted, '10:50 am');
  });

  await t.test('2. Normal UTC timestamp converts cleanly to Asia/Kolkata (IST 24h)', () => {
    // 09:39 UTC + 5h30m = 15:09 IST
    const timestamp = '2026-08-22T09:39:00.000Z';
    const formatted = formatAttendanceTimeIST(timestamp, false);
    assert.strictEqual(formatted, '15:09');
  });

  await t.test('3. Midnight boundary timestamp converts cleanly without double-offset', () => {
    // 18:30 UTC + 5h30m = 00:00 AM IST (Next Calendar Day)
    const timestamp = '2026-08-22T18:30:00.000Z';
    const formatted12h = formatAttendanceTimeIST(timestamp, true);
    const formatted24h = formatAttendanceTimeIST(timestamp, false);

    assert.strictEqual(formatted12h, '12:00 am');
    assert.strictEqual(formatted24h, '00:00');
  });

  await t.test('4. Date rollover timestamp converts cleanly to early morning IST', () => {
    // 20:00 UTC + 5h30m = 01:30 AM IST next day
    const timestamp = '2026-08-22T20:00:00.000Z';
    const formatted = formatAttendanceTimeIST(timestamp, true);
    assert.strictEqual(formatted, '01:30 am');
  });

  await t.test('5. Invalid or missing timestamp returns dash fallback', () => {
    assert.strictEqual(formatAttendanceTimeIST(null), '-');
    assert.strictEqual(formatAttendanceTimeIST(undefined), '-');
    assert.strictEqual(formatAttendanceTimeIST('invalid-date-string'), '-');
  });
});
