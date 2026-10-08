const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Replicate/import backend analytics logic for unit verification
function isHourlyRecord(leave) {
  if (!leave) return false;
  if (leave.durationType === 'hourly') return true;
  const code = (leave.leaveTypeCode || '').toUpperCase();
  const type = (leave.leaveType || '').toLowerCase();
  return ['SL', 'SHRT', 'SHORT'].includes(code) || type.includes('short leave');
}

function calculateAnalyticsSummary({ leaves, activeCount, fullDayRequiredHours }) {
  const dayLeaves = leaves.filter(l => !isHourlyRecord(l));
  const hourlyLeaves = leaves.filter(l => isHourlyRecord(l));

  const totalApplications = leaves.length;
  const totalDayApplications = dayLeaves.length;
  const totalApprovedDays = dayLeaves.reduce((sum, l) => sum + (l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1)), 0);

  const unplannedApplications = leaves.filter(l => l.leaveMode === 'Unplanned').length;
  const unplannedDays = dayLeaves.filter(l => l.leaveMode === 'Unplanned').reduce((sum, l) => sum + (l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1)), 0);

  const unplannedApplicationRate = totalApplications > 0
    ? parseFloat(((unplannedApplications / totalApplications) * 100).toFixed(1))
    : 0;

  const unplannedDayRate = totalApprovedDays > 0
    ? parseFloat(((unplannedDays / totalApprovedDays) * 100).toFixed(1))
    : 0;

  const avgDaysPerEmployee = activeCount > 0
    ? parseFloat((totalApprovedDays / activeCount).toFixed(1))
    : 0;

  const totalHourlyHours = hourlyLeaves.reduce((sum, l) => sum + (l.totalHours || l.durationHours || 2), 0);
  const hourlyEquivalentDays = fullDayRequiredHours && fullDayRequiredHours > 0
    ? parseFloat((totalHourlyHours / fullDayRequiredHours).toFixed(1))
    : null;

  return {
    totalApplications,
    totalDayApplications,
    totalApprovedDays,
    unplannedApplications,
    unplannedDays,
    unplannedApplicationRate,
    unplannedDayRate,
    avgDaysPerEmployee,
    totalHourlyHours,
    hourlyEquivalentDays,
  };
}

describe('Leave Analytics Backend Calculations', () => {
  it('correctly identifies hourly leaves using central isHourlyRecord helper', () => {
    assert.equal(isHourlyRecord({ durationType: 'hourly' }), true);
    assert.equal(isHourlyRecord({ leaveTypeCode: 'SHRT' }), true);
    assert.equal(isHourlyRecord({ leaveTypeCode: 'SL' }), true);
    assert.equal(isHourlyRecord({ leaveType: 'Short Leave' }), true);
    assert.equal(isHourlyRecord({ leaveTypeCode: 'CL', durationType: 'full_day' }), false);
  });

  it('handles zero applications gracefully without division by zero', () => {
    const res = calculateAnalyticsSummary({ leaves: [], activeCount: 10, fullDayRequiredHours: 9 });
    assert.equal(res.totalApplications, 0);
    assert.equal(res.totalApprovedDays, 0);
    assert.equal(res.unplannedApplicationRate, 0);
    assert.equal(res.unplannedDayRate, 0);
    assert.equal(res.avgDaysPerEmployee, 0);
  });

  it('calculates unplanned application and day rates naturally between 0% and 100%', () => {
    const leaves = [
      { durationType: 'full_day', totalDays: 1, leaveMode: 'Unplanned' },
      { durationType: 'full_day', totalDays: 3, leaveMode: 'Planned' },
      { durationType: 'half_day', totalDays: 0.5, leaveMode: 'Unplanned' },
    ];
    const res = calculateAnalyticsSummary({ leaves, activeCount: 5, fullDayRequiredHours: 9 });

    assert.equal(res.totalApplications, 3);
    assert.equal(res.unplannedApplications, 2);
    // Rate: 2 / 3 = 66.7%
    assert.equal(res.unplannedApplicationRate, 66.7);
    assert.ok(res.unplannedApplicationRate >= 0 && res.unplannedApplicationRate <= 100);

    // Total Days: 1 + 3 + 0.5 = 4.5. Unplanned Days: 1 + 0.5 = 1.5. Rate: 1.5 / 4.5 = 33.3%
    assert.equal(res.totalApprovedDays, 4.5);
    assert.equal(res.unplannedDays, 1.5);
    assert.equal(res.unplannedDayRate, 33.3);
    assert.ok(res.unplannedDayRate >= 0 && res.unplannedDayRate <= 100);
  });

  it('excludes hourly leaves from day-based totals and tracks hours separately', () => {
    const leaves = [
      { durationType: 'full_day', totalDays: 2, leaveMode: 'Planned', leaveTypeCode: 'PRIV' },
      { durationType: 'hourly', totalHours: 2, leaveMode: 'Planned', leaveTypeCode: 'SHRT' },
      { durationType: 'hourly', totalHours: 4, leaveMode: 'Unplanned', leaveTypeCode: 'SHRT' },
    ];
    const res = calculateAnalyticsSummary({ leaves, activeCount: 2, fullDayRequiredHours: 9 });

    assert.equal(res.totalApplications, 3);
    assert.equal(res.totalDayApplications, 1);
    assert.equal(res.totalApprovedDays, 2);
    assert.equal(res.totalHourlyHours, 6);
    assert.equal(res.hourlyEquivalentDays, 0.7); // 6 / 9 = 0.666 -> 0.7
  });

  it('reconciles department totals + unassigned total with global totals', () => {
    const leaves = [
      { durationType: 'full_day', totalDays: 2, employeeId: { department: 'Engineering' } },
      { durationType: 'full_day', totalDays: 1, employeeId: { department: 'QA' } },
      { durationType: 'full_day', totalDays: 3, employeeId: null }, // Unassigned
    ];

    const dayLeaves = leaves.filter(l => !isHourlyRecord(l));
    const globalTotalDays = dayLeaves.reduce((sum, l) => sum + l.totalDays, 0);

    const deptMap = {};
    dayLeaves.forEach(l => {
      const d = l.employeeId?.department || 'Unassigned';
      deptMap[d] = (deptMap[d] || 0) + l.totalDays;
    });

    const sumDepts = Object.values(deptMap).reduce((s, v) => s + v, 0);
    assert.equal(globalTotalDays, 6);
    assert.equal(sumDepts, globalTotalDays);
    assert.equal(deptMap['Unassigned'], 3);
  });
});
