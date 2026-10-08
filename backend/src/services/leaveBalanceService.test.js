const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCode,
  getLeaveDays,
  computeBiannualQuotas,
  roundDays,
} = require('../services/leaveBalanceService');

test('normalizeCode maps legacy migrated codes', () => {
  assert.equal(normalizeCode('WORKFROMHOME'), 'WFH');
  assert.equal(normalizeCode('CASUAL'), 'CL');
  assert.equal(normalizeCode('SHRT'), 'SL');
  assert.equal(normalizeCode('WFH'), 'WFH');
});

test('getLeaveDays handles half-day and hourly leaves', () => {
  assert.equal(getLeaveDays({ durationType: 'half_day' }), 0.5);
  assert.equal(getLeaveDays({ durationType: 'hourly', totalHours: 4 }), 0.5);
  assert.equal(getLeaveDays({ durationType: 'full_day', totalDays: 3 }), 3);
});

test('computeBiannualQuotas carries unused H1 into H2', () => {
  const withCarry = computeBiannualQuotas(12, null, true, 4);
  assert.equal(withCarry.h1Quota, 6);
  assert.equal(withCarry.h1Unused, 2);
  assert.equal(withCarry.h2Quota, 8);

  const withoutCarry = computeBiannualQuotas(12, null, false, 4);
  assert.equal(withoutCarry.h2Quota, 6);
});

test('roundDays rounds to one decimal place', () => {
  assert.equal(roundDays(1.234), 1.2);
  assert.equal(roundDays(0), 0);
});
