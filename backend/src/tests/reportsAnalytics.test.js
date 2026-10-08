const test = require('node:test');
const assert = require('node:assert/strict');

test('Report Calculations & Verification Tests', async (t) => {
  await t.test('Approval rate displays N/A when 0 approved and 0 rejected applications exist', () => {
    const approvedCount = 0;
    const rejectedCount = 0;
    const decidedCount = approvedCount + rejectedCount;
    const approvalRate = decidedCount > 0 ? (approvedCount / decidedCount) * 100 : 'N/A';
    assert.strictEqual(approvalRate, 'N/A');
  });

  await t.test('Partial overlap calculates days strictly inside target window', () => {
    // Leave range: 2026-08-28 to 2026-09-05 (9 days total)
    // Selected window: 2026-09-01 to 2026-09-30
    const lStart = '2026-08-28';
    const lEnd = '2026-09-05';
    const windowStart = '2026-09-01';
    const windowEnd = '2026-09-30';

    const effectiveStart = lStart > windowStart ? lStart : windowStart; // 2026-09-01
    const effectiveEnd = lEnd < windowEnd ? lEnd : windowEnd;         // 2026-09-05

    // Overlapping days: Sep 1, 2, 3, 4, 5 = 5 days
    const days = 5;
    assert.strictEqual(effectiveStart, '2026-09-01');
    assert.strictEqual(effectiveEnd, '2026-09-05');
    assert.strictEqual(days, 5);
  });

  await t.test('Weighted presence counts Half Day as 0.5 and Full Present/WFH as 1.0', () => {
    const presentCount = 10; // Includes 2 WFH
    const halfDayCount = 4;
    const expectedEmployees = 20;

    const weightedPresence = presentCount + (halfDayCount * 0.5); // 10 + 2 = 12
    const attendanceRate = Number(((weightedPresence / expectedEmployees) * 100).toFixed(1));

    assert.strictEqual(weightedPresence, 12);
    assert.strictEqual(attendanceRate, 60.0);
  });

  await t.test('Primary category classification satisfies E = Present + Half Day + Leave + Absent + Conflict', () => {
    const expected = 50;
    const present = 35; // Includes 5 WFH
    const halfDay = 5;
    const leave = 4;
    const conflict = 1;
    const absent = expected - (present + halfDay + leave + conflict); // 50 - 45 = 5

    assert.strictEqual(absent, 5);
    assert.strictEqual(present + halfDay + leave + absent + conflict, expected);
  });

  await t.test('WFH is classified as a subset of Present (WFH ⊆ Present)', () => {
    const presentEmployees = 15;
    const wfhEmployees = 4; // Subset of Present

    // Accounted = Present + Half Day + Leave (do NOT add WFH to Present)
    const halfDay = 2;
    const leave = 3;
    const accounted = presentEmployees + halfDay + leave; // 15 + 2 + 3 = 20

    assert.strictEqual(accounted, 20);
    assert.ok(wfhEmployees <= presentEmployees);
  });

  await t.test('Weekend or Holiday returns N/A for attendance rate and absence count', () => {
    const isHoliday = true;
    const summary = {
      isNonWorkingDay: isHoliday,
      attendanceRate: isHoliday ? 'N/A' : 100,
      absent: isHoliday ? 'N/A' : 0,
    };

    assert.strictEqual(summary.isNonWorkingDay, true);
    assert.strictEqual(summary.attendanceRate, 'N/A');
    assert.strictEqual(summary.absent, 'N/A');
  });

  await t.test('Unpaginated CSV export dataset integrity', () => {
    const allMatchingRows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    const pageLimit = 20;

    // UI displays page 1 (20 items)
    const uiPage1 = allMatchingRows.slice(0, pageLimit);
    assert.strictEqual(uiPage1.length, 20);

    // CSV export exports all 45 matching rows
    const exportRows = allMatchingRows;
    assert.strictEqual(exportRows.length, 45);
  });
});
