const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const CalendarEvent = require('../models/CalendarEvent');
const Settings = require('../models/Settings');
const { buildAttendanceContext, isWeeklyOff } = require('./attendancePolicyService');
const { formatBusinessDate, getBusinessDateRangeUtcBounds } = require('../utils/businessDateUtils');


/**
 * Helper to test if a leave is WFH
 */
function isWfhLeave(leave) {
  const code = `${leave?.leaveTypeCode || ''} ${leave?.leaveType || ''}`
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return code.includes('WFH') || code.includes('WORKFROMHOME');
}

/**
 * Helper to test if a leave is Short Leave (hourly)
 */
function isShortLeave(leave) {
  const code = `${leave?.leaveTypeCode || ''} ${leave?.leaveType || ''}`.toLowerCase();
  return code.includes('short') || code.includes('shrt') || /\bsl\b/.test(code) || leave?.durationType === 'hourly';
}

/**
 * Generate date strings array (YYYY-MM-DD) inclusive
 */
function dateRange(startStr, endStr) {
  const days = [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const last = new Date(Date.UTC(ey, em - 1, ed));
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * Bulk-load 5 data sources for evaluation context in parallel/indexed pass:
 * 1. Users
 * 2. Attendance
 * 3. Leaves
 * 4. Calendar Event Holidays / Holiday Policy Context
 * 5. Settings
 */
async function buildEvaluationContext(startDate, endDate, userQueryFilter = {}) {
  const policyContext = await buildAttendanceContext(startDate, endDate);

  const EXCLUDED_ROLES = ['superadmin', 'admin', 'Administrator', 'administrator'];
  const finalUserQuery = {
    role: { $nin: EXCLUDED_ROLES },
    status: { $ne: 'Inactive' },
    ...userQueryFilter,
  };

  const utcBounds = getBusinessDateRangeUtcBounds(startDate, endDate);
  const [users, attendanceRecords, leaves] = await Promise.all([
    User.find(finalUserQuery).select('-password').lean(),
    Attendance.find({
      date: { $gte: startDate, $lte: endDate },
    }).populate('employeeId', '-password').lean(),
    Leave.find({
      startDate: { $lt: utcBounds.nextDayStart },
      endDate: { $gte: utcBounds.start },
    }).populate('employeeId', '-password').lean(),
  ]);


  // Index Attendance Records by employeeId:date
  const attendanceMap = new Map();
  attendanceRecords.forEach(rec => {
    const empIdStr = String(rec.employeeId?._id || rec.employeeId);
    attendanceMap.set(`${empIdStr}:${rec.date}`, rec);
  });

  // Index Leaves by employeeId:date
  const leaveMap = new Map();

  leaves.forEach(l => {
    const empIdStr = String(l.employeeId?._id || l.employeeId);
    const lStart = formatBusinessDate(l.startDate);
    const lEnd = formatBusinessDate(l.endDate);
    if (!lStart || !lEnd) return;


    const winStart = lStart > startDate ? lStart : startDate;
    const winEnd = lEnd < endDate ? lEnd : endDate;

    if (winStart <= winEnd) {
      const activeDates = dateRange(winStart, winEnd);
      activeDates.forEach(d => {
        const key = `${empIdStr}:${d}`;
        if (!leaveMap.has(key)) leaveMap.set(key, []);
        leaveMap.get(key).push(l);
      });
    }
  });

  const allDays = dateRange(startDate, endDate);

  return {
    startDate,
    endDate,
    allDays,
    users,
    attendanceMap,
    leaveMap,
    holidayMap: policyContext.holidayMap,
    settings: policyContext.settings,
    policyContext,
  };
}

/**
 * Classify a single employee-date into exactly ONE of the 12 primary statuses
 * or weekend/holiday category.
 */
function classifyEmployeeDate(user, dateStr, context) {
  const empIdStr = String(user._id || user);
  const key = `${empIdStr}:${dateStr}`;

  // Check if date is prior to user joining date
  if (user.joiningDate) {
    const joinStr = formatBusinessDate(user.joiningDate);
    if (joinStr && joinStr > dateStr) {
      return { primaryStatus: 'not_joined', isEligibleWorkingDate: false };
    }
  }


  const isHoliday = context.holidayMap.has(dateStr);
  const isWkOff = isWeeklyOff(dateStr, context.settings);
  const isEligibleWorkingDate = !isHoliday && !isWkOff;

  const rec = context.attendanceMap.get(key);
  const userLeaves = context.leaveMap.get(key) || [];

  const approvedLeaves = userLeaves.filter(l => l.status === 'Approved');
  const pendingLeaves = userLeaves.filter(l => l.status === 'Pending');

  const approvedWfh = approvedLeaves.find(l => isWfhLeave(l));
  const approvedShortLeave = approvedLeaves.find(l => !isWfhLeave(l) && isShortLeave(l));
  const approvedHalfLeave = approvedLeaves.find(l => !isWfhLeave(l) && !isShortLeave(l) && l.durationType === 'half_day');
  const approvedFullLeave = approvedLeaves.find(l => !isWfhLeave(l) && !isShortLeave(l) && (l.durationType === 'full_day' || !l.durationType));

  const hasPunchTimestamps = Boolean(rec && (rec.checkIn || rec.checkOut));
  const hasPunch = Boolean(rec && (hasPunchTimestamps || rec.source === 'biometric'));
  const isIncompletePunch = Boolean(rec && ((rec.checkIn && !rec.checkOut) || (!rec.checkIn && rec.checkOut)));

  // Non-working day evaluation
  if (!isEligibleWorkingDate) {
    if (hasPunch || (rec && rec.status === 'Present')) {
      return { primaryStatus: 'weekend_attendance', isEligibleWorkingDate: false, rec, leaves: userLeaves };
    }
    return { primaryStatus: 'weekend_non_working', isEligibleWorkingDate: false, rec, leaves: userLeaves };
  }

  // Eligible Working Day Primary Status Resolution (Precedence Matrix)

  // 1. Conflict: Biometric or portal punch AND approved full-day Leave or WFH
  if (hasPunch && (approvedFullLeave || approvedWfh || (rec && rec.workMode === 'wfh'))) {
    return { primaryStatus: 'conflict', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 2. Incomplete Punch: Check-in without Check-out or vice-versa
  if (isIncompletePunch) {
    return { primaryStatus: 'incomplete_punch', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 3. Matched Partial Covered: Valid Half-Day Attendance + Approved Half-Day Leave explaining 100% of the day
  if (rec && rec.status === 'Half Day' && approvedHalfLeave) {
    return { primaryStatus: 'matched_partial_covered', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 4. Matched WFH: Valid WFH attendance or approved WFH without punch conflict
  if ((rec && rec.status === 'Present' && (rec.workMode === 'wfh' || rec.source === 'wfh_leave')) || (approvedWfh && !hasPunch)) {
    return { primaryStatus: 'matched_wfh', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 5. Matched Present: Valid full-day Office attendance with punches
  if (rec && rec.status === 'Present' && hasPunch) {
    return { primaryStatus: 'matched_present', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 6. Matched Leave: Approved full-day non-WFH leave
  if (approvedFullLeave && !hasPunch) {
    return { primaryStatus: 'matched_leave', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 7. Matched Absent: Persisted explicit Attendance record marked status === 'Absent'
  if (rec && rec.status === 'Absent') {
    return { primaryStatus: 'matched_absent', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 8. Portal / Biometric Mismatch: Punchless Present/Half Day without check-in/out or approved leave
  if (rec && (rec.status === 'Present' || rec.status === 'Half Day') && !hasPunch && !approvedFullLeave && !approvedHalfLeave && !approvedWfh) {
    return { primaryStatus: 'portal_biometric_mismatch', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 9. Partial Leave Missing Attendance: Approved half-day leave without complementary half-day attendance
  if (approvedHalfLeave && (!rec || rec.status !== 'Half Day')) {
    return { primaryStatus: 'partial_leave_missing_attendance', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 10. Short Leave Missing Attendance: Approved short leave without required attendance
  if (approvedShortLeave) {
    return { primaryStatus: 'short_leave_missing_attendance', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 11. Pending Leave: Pending leave request exists and no attendance punch
  if (pendingLeaves.length > 0 && !hasPunch) {
    return { primaryStatus: 'pending_leave', isEligibleWorkingDate: true, rec, leaves: userLeaves };
  }

  // 12. Not Marked: Unexplained missing record on eligible working date
  return { primaryStatus: 'not_marked', isEligibleWorkingDate: true, rec, leaves: userLeaves };
}

/**
 * Aggregate metrics for a single employee over evaluated date range
 */
function aggregateEmployeeMetrics(user, startDate, endDate, context) {
  const dates = context.allDays.filter(d => d >= startDate && d <= endDate);

  const statusCounts = {
    matched_present: 0,
    matched_wfh: 0,
    matched_leave: 0,
    matched_absent: 0,
    matched_partial_covered: 0,
    conflict: 0,
    incomplete_punch: 0,
    portal_biometric_mismatch: 0,
    partial_leave_missing_attendance: 0,
    short_leave_missing_attendance: 0,
    pending_leave: 0,
    not_marked: 0,
    weekend_attendance: 0,
    weekend_non_working: 0,
    not_joined: 0,
  };

  let expectedDays = 0;
  let punchedDays = 0;
  let lateDays = 0;
  let approvedShortLeaveHours = 0;

  dates.forEach(d => {
    const result = classifyEmployeeDate(user, d, context);
    statusCounts[result.primaryStatus] = (statusCounts[result.primaryStatus] || 0) + 1;

    if (result.isEligibleWorkingDate) {
      expectedDays += 1;
    }

    const rec = result.rec;
    const hasPunch = Boolean(rec && (rec.checkIn || rec.checkOut || rec.source === 'biometric' || rec.source === 'portal' || rec.source === 'manual'));
    if (result.isEligibleWorkingDate && hasPunch) {
      punchedDays += 1;
      if (rec.isLate) lateDays += 1;
    }

    // Accumulate short leave hours
    if (result.leaves) {
      const appShorts = result.leaves.filter(l => l.status === 'Approved' && isShortLeave(l));
      appShorts.forEach(l => {
        approvedShortLeaveHours += Number(l.totalHours || l.durationHours || 2);
      });
    }
  });

  // Reconciled Invariant Check
  const completedEmployeeDates =
    statusCounts.matched_present +
    statusCounts.matched_wfh +
    statusCounts.matched_leave +
    statusCounts.matched_absent +
    statusCounts.matched_partial_covered;

  const actionRequiredDays =
    statusCounts.conflict +
    statusCounts.incomplete_punch +
    statusCounts.portal_biometric_mismatch +
    statusCounts.partial_leave_missing_attendance +
    statusCounts.short_leave_missing_attendance +
    statusCounts.not_marked;

  // Invariant Assertion: expectedDays MUST equal completedEmployeeDates + actionRequiredDays
  if (expectedDays !== completedEmployeeDates + actionRequiredDays) {
    console.warn(`[Evaluation Invariant Warning] User ${user.employeeId}: expectedDays (${expectedDays}) !== completed (${completedEmployeeDates}) + actionRequired (${actionRequiredDays})`);
  }

  // Presentation Metrics
  const fullPresentDays = statusCounts.matched_present + statusCounts.matched_wfh;
  const halfAttendanceDays = (statusCounts.matched_partial_covered * 0.5); // Add standalone half attendance when present
  const wfhDays = statusCounts.matched_wfh;
  const approvedLeaveDays = statusCounts.matched_leave + (statusCounts.matched_partial_covered * 0.5) + (statusCounts.partial_leave_missing_attendance * 0.5);
  const explicitAbsentDays = statusCounts.matched_absent;
  const unaccountedDays = statusCounts.not_marked;

  const weightedPresenceDays = fullPresentDays + (halfAttendanceDays * 0.5);

  const punchingRate = expectedDays > 0 ? parseFloat(((punchedDays / expectedDays) * 100).toFixed(1)) : 'N/A';
  const weightedAttendanceRate = expectedDays > 0 ? parseFloat(((weightedPresenceDays / expectedDays) * 100).toFixed(1)) : 'N/A';
  const recordCompletionRate = expectedDays > 0 ? parseFloat(((completedEmployeeDates / expectedDays) * 100).toFixed(1)) : 'N/A';
  const lateRate = punchedDays > 0 ? parseFloat(((lateDays / punchedDays) * 100).toFixed(1)) : 'N/A';

  const otherIssuesDays = actionRequiredDays - unaccountedDays;

  return {
    employee: {
      _id: user._id,
      name: user.name,
      employeeId: user.employeeId,
      department: user.department,
      designation: user.designation,
      joiningDate: user.joiningDate,
    },
    expectedDays,
    completedEmployeeDates,
    actionRequiredDays,
    otherIssuesDays,
    fullPresentDays,
    halfAttendanceDays,
    wfhDays,
    approvedLeaveDays,
    approvedShortLeaveHours,
    explicitAbsentDays,
    unaccountedDays,
    lateDays,
    punchedDays,
    statusCounts,
    punchingRate,
    weightedPresenceDays,
    weightedAttendanceRate,
    recordCompletionRate,
    lateRate,
  };
}

/**
 * Aggregate metrics across all active users in a department
 */
function aggregateDepartmentMetrics(department, startDate, endDate, context) {
  const targetUsers = department && department !== 'all'
    ? context.users.filter(u => u.department === department)
    : context.users;

  const empComparison = targetUsers.map(user =>
    aggregateEmployeeMetrics(user, startDate, endDate, context)
  );

  const totalExpectedDays = empComparison.reduce((sum, item) => sum + item.expectedDays, 0);
  const totalCompletedDates = empComparison.reduce((sum, item) => sum + item.completedEmployeeDates, 0);
  const totalActionRequired = empComparison.reduce((sum, item) => sum + item.actionRequiredDays, 0);
  const totalFullPresent = empComparison.reduce((sum, item) => sum + item.fullPresentDays, 0);
  const totalHalfAttendance = empComparison.reduce((sum, item) => sum + item.halfAttendanceDays, 0);
  const totalWfh = empComparison.reduce((sum, item) => sum + item.wfhDays, 0);
  const totalLeaveDays = empComparison.reduce((sum, item) => sum + item.approvedLeaveDays, 0);
  const totalExplicitAbsent = empComparison.reduce((sum, item) => sum + item.explicitAbsentDays, 0);
  const totalUnaccounted = empComparison.reduce((sum, item) => sum + item.unaccountedDays, 0);
  const totalPunchedDays = empComparison.reduce((sum, item) => sum + item.punchedDays, 0);
  const totalLateDays = empComparison.reduce((sum, item) => sum + item.lateDays, 0);
  const totalWeightedPresence = empComparison.reduce((sum, item) => sum + item.weightedPresenceDays, 0);

  const avgPunchingRate = totalExpectedDays > 0 ? parseFloat(((totalPunchedDays / totalExpectedDays) * 100).toFixed(1)) : 'N/A';
  const avgWeightedAttendanceRate = totalExpectedDays > 0 ? parseFloat(((totalWeightedPresence / totalExpectedDays) * 100).toFixed(1)) : 'N/A';
  const avgRecordCompletionRate = totalExpectedDays > 0 ? parseFloat(((totalCompletedDates / totalExpectedDays) * 100).toFixed(1)) : 'N/A';

  return {
    summary: {
      departmentName: department || 'All Departments',
      activeEmployees: targetUsers.length,
      workingDays: context.allDays.filter(d => !context.holidayMap.has(d) && !isWeeklyOff(d, context.settings)).length,
      totalExpectedDays,
      totalCompletedDates,
      totalActionRequired,
      totalFullPresent,
      totalHalfAttendance,
      totalWfh,
      totalLeaveDays,
      totalExplicitAbsent,
      totalUnaccounted,
      totalPunchedDays,
      totalLateDays,
      totalWeightedPresence,
      avgPunchingRate,
      avgWeightedAttendanceRate,
      avgRecordCompletionRate,
    },
    empComparison,
  };
}

module.exports = {
  buildEvaluationContext,
  classifyEmployeeDate,
  aggregateEmployeeMetrics,
  aggregateDepartmentMetrics,
  isWfhLeave,
  isShortLeave,
};
