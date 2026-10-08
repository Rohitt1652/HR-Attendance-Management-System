const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');
const {
  buildAttendanceContext,
  calculateAttendanceRecord,
  sortCalculatedRecords,
  isWeeklyOff,
} = require('../services/attendancePolicyService');
const {
  buildEvaluationContext,
  aggregateDepartmentMetrics,
} = require('../services/attendanceEvaluationService');

const isWfhLeave = (leave) => {
  const code = `${leave?.leaveTypeCode || ''} ${leave?.leaveType || ''}`
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return code.includes('WFH') || code.includes('WORKFROMHOME');
};

const isShortLeave = (leave) => {
  const code = `${leave?.leaveTypeCode || ''} ${leave?.leaveType || ''}`
    .toLowerCase();
  return code.includes('short') || code.includes('shrt') || /\bsl\b/.test(code) || leave?.durationType === 'hourly';
};

// Date helper: YYYY-MM-DD string array
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

function getISTDateString(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return value.trim().slice(0, 10);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

// Calculate overlap days/hours inside selected [startStr, endStr]
function calculateOverlapDuration(leave, startStr, endStr) {
  const lStartStr = getISTDateString(leave.startDate);
  const lEndStr = getISTDateString(leave.endDate);

  if (!lStartStr || !lEndStr) return { days: 0, hours: 0 };

  const windowStartStr = lStartStr > startStr ? lStartStr : startStr;
  const windowEndStr = lEndStr < endStr ? lEndStr : endStr;

  if (windowStartStr > windowEndStr) return { days: 0, hours: 0 };

  if (isShortLeave(leave)) {
    const hrs = Number(leave.totalHours || leave.durationHours || 2);
    return { days: 0, hours: hrs };
  }

  if (leave.durationType === 'half_day') {
    return { days: 0.5, hours: 0 };
  }

  const daysCount = dateRange(windowStartStr, windowEndStr).length;
  return { days: daysCount, hours: 0 };
}

async function getAttendanceWithWfh(filter, startDate, endDate) {
  const records = await Attendance.find(filter).populate('employeeId', '-password').lean();
  const context = await buildAttendanceContext(startDate, endDate);
  const existingKeys = new Set(records.map(record => `${record.employeeId?._id || record.employeeId}:${record.date}`));
  const filteredIds = filter.employeeId
    ? new Set((filter.employeeId.$in || [filter.employeeId]).map(id => String(id)))
    : null;
  const synthetic = [];
  const employeeIds = new Set();

  for (const [key, leaves] of context.leaveMap.entries()) {
    const separator = key.lastIndexOf(':');
    const employeeId = key.slice(0, separator);
    const date = key.slice(separator + 1);
    if (filteredIds && !filteredIds.has(employeeId)) continue;
    const approvedWfh = leaves.find(leave => leave.status === 'Approved' && isWfhLeave(leave));
    if (!approvedWfh || existingKeys.has(`${employeeId}:${date}`)) continue;
    synthetic.push({ employeeId, date, leave: approvedWfh });
    employeeIds.add(employeeId);
  }

  const employees = await User.find({ _id: { $in: [...employeeIds] }, status: 'Active' }).select('-password').lean();
  const employeeMap = new Map(employees.map(employee => [String(employee._id), employee]));
  const syntheticRecords = synthetic
    .filter(item => employeeMap.has(item.employeeId))
    .map(item => ({
      _id: `wfh-${item.leave._id}-${item.date}`,
      employeeId: employeeMap.get(item.employeeId),
      date: item.date,
      workingHours: 0,
      status: 'Present',
      isLate: false,
      source: 'wfh_leave',
      workMode: 'wfh',
      wfhReason: item.leave.reason || '',
    }));

  return sortCalculatedRecords(
    [...records, ...syntheticRecords].map(record => calculateAttendanceRecord(record, context)),
    'date',
    'desc'
  );
}

exports.getAttendanceWithWfh = getAttendanceWithWfh;

// ── LEAVE REPORT CONTROLLER ──────────────────────────────────────────────────
exports.getLeaveReport = async (req, res, next) => {
  try {
    const { startDate, endDate, status, employeeId, department, leaveType, leaveMode } = req.query;

    const startStr = startDate || `${new Date().getFullYear()}-01-01`;
    const endStr = endDate || new Date().toISOString().slice(0, 10);
    const startObj = new Date(`${startStr}T00:00:00.000Z`);
    const endObj = new Date(`${endStr}T23:59:59.999Z`);

    // Date Overlap Rule: leave.startDate <= endObj AND leave.endDate >= startObj
    const match = {
      startDate: { $lte: endObj },
      endDate: { $gte: startObj },
    };

    if (status) match.status = status;
    if (employeeId) match.employeeId = employeeId;
    if (leaveType) match.leaveType = leaveType;
    if (leaveMode) match.leaveMode = leaveMode;

    let leaves = await Leave.find(match)
      .populate('employeeId', '-password')
      .sort({ appliedAt: -1, startDate: -1 })
      .lean();

    // Department filter post-population if department is specified
    if (department) {
      leaves = leaves.filter(l => l.employeeId?.department === department);
    }

    // Summary Aggregations
    const totalApplications = leaves.length;
    const approvedCount = leaves.filter(l => l.status === 'Approved').length;
    const pendingCount = leaves.filter(l => l.status === 'Pending').length;
    const rejectedCount = leaves.filter(l => l.status === 'Rejected').length;

    const decidedCount = approvedCount + rejectedCount;
    const approvalRate = decidedCount > 0 ? parseFloat(((approvedCount / decidedCount) * 100).toFixed(1)) : 'N/A';

    const unplannedCount = leaves.filter(l => l.status === 'Approved' && l.leaveMode === 'Unplanned').length;
    const unplannedRate = totalApplications > 0 ? parseFloat(((unplannedCount / totalApplications) * 100).toFixed(1)) : 'N/A';

    let totalApprovedDays = 0;
    let totalApprovedHours = 0;
    const typeDaysMap = {};

    leaves.forEach(l => {
      if (l.status === 'Approved') {
        const { days, hours } = calculateOverlapDuration(l, startStr, endStr);
        totalApprovedDays += days;
        totalApprovedHours += hours;

        const typeName = l.leaveType || 'Other';
        if (!typeDaysMap[typeName]) typeDaysMap[typeName] = { name: typeName, days: 0, hours: 0, count: 0 };
        typeDaysMap[typeName].days += days;
        typeDaysMap[typeName].hours += hours;
        typeDaysMap[typeName].count += 1;
      }
    });

    const dayBasedTypes = Object.values(typeDaysMap).filter(t => t.days > 0).sort((a, b) => b.days - a.days);
    const topLeaveType = dayBasedTypes.length > 0 ? dayBasedTypes[0] : null;

    const summary = {
      totalApplications,
      approvedCount,
      pendingCount,
      rejectedCount,
      approvalRate,
      unplannedCount,
      unplannedRate,
      totalApprovedDays: parseFloat(totalApprovedDays.toFixed(1)),
      totalApprovedHours: parseFloat(totalApprovedHours.toFixed(1)),
      statusBreakdown: { approved: approvedCount, pending: pendingCount, rejected: rejectedCount },
      modeBreakdown: {
        planned: leaves.filter(l => l.leaveMode !== 'Unplanned').length,
        unplanned: leaves.filter(l => l.leaveMode === 'Unplanned').length,
      },
      topLeaveType,
    };

    res.json({ success: true, data: leaves, summary });
  } catch (err) {
    next(err);
  }
};

// ── DAILY ATTENDANCE CONTROLLER ──────────────────────────────────────────────
exports.getDailyReport = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required' });

    const context = await buildAttendanceContext(date, date);
    const isHoliday = context.holidayMap.has(date);
    const weeklyOff = isWeeklyOff(date, context.settings);

    // Active eligible employees joining on or before target date
    const expectedUsers = await User.find({
      role: { $ne: 'superadmin' },
      status: { $ne: 'Inactive' },
      $or: [{ joiningDate: null }, { joiningDate: { $lte: new Date(`${date}T23:59:59`) } }],
    }).select('-password').lean();

    const expectedCount = expectedUsers.length;

    if (isHoliday || weeklyOff) {
      return res.json({
        success: true,
        data: [],
        summary: {
          isNonWorkingDay: true,
          dayReason: isHoliday ? (context.holidayMap.get(date)?.title || 'Holiday') : 'Weekend Off',
          expectedEmployees: expectedCount,
          present: 0,
          halfDay: 0,
          wfh: 0,
          onLeave: 0,
          absent: 'N/A',
          attendanceRate: 'N/A',
          lateCount: 0,
        },
      });
    }

    const records = await getAttendanceWithWfh({ date }, date, date);
    const recMap = new Map(records.map(r => [String(r.employeeId?._id || r.employeeId), r]));

    let presentCount = 0;
    let halfDayCount = 0;
    let wfhCount = 0;
    let leaveCount = 0;
    let conflictCount = 0;
    let lateCount = 0;

    const classified = expectedUsers.map(user => {
      const empIdStr = String(user._id);
      const rec = recMap.get(empIdStr);
      const userLeaves = context.leaveMap.get(`${empIdStr}:${date}`) || [];
      const approvedLeave = userLeaves.find(l => l.status === 'Approved' && !isWfhLeave(l));
      const approvedWfh = userLeaves.find(l => l.status === 'Approved' && isWfhLeave(l));

      let primaryCategory = 'Absent';
      let workMode = 'Office';

      if (rec && rec.isLate) lateCount += 1;

      // Primary Category Precedence:
      // 1. Conflict (if employee checked in AND has an approved full-day leave)
      // 2. Present (Office or WFH)
      // 3. Half Day
      // 4. Approved Leave
      // 5. Absent
      if (rec && rec.status === 'Present' && approvedLeave && approvedLeave.durationType === 'full_day') {
        primaryCategory = 'Conflict';
        conflictCount += 1;
      } else if (rec && rec.status === 'Present') {
        primaryCategory = 'Present';
        presentCount += 1;
        if (rec.workMode === 'wfh' || approvedWfh) {
          workMode = 'WFH';
          wfhCount += 1;
        }
      } else if (rec && rec.status === 'Half Day') {
        primaryCategory = 'Half Day';
        halfDayCount += 1;
      } else if (approvedLeave && approvedLeave.durationType === 'full_day') {
        primaryCategory = 'Approved Leave';
        leaveCount += 1;
      } else {
        primaryCategory = 'Absent';
      }

      return {
        ...user,
        attendanceRecord: rec || null,
        primaryCategory,
        workMode,
      };
    });

    const absentCount = expectedCount - (presentCount + halfDayCount + leaveCount + conflictCount);
    const weightedPresence = presentCount + (halfDayCount * 0.5);
    const attendanceRate = expectedCount > 0 ? parseFloat(((weightedPresence / expectedCount) * 100).toFixed(1)) : 'N/A';

    const summary = {
      isNonWorkingDay: false,
      expectedEmployees: expectedCount,
      present: presentCount,
      halfDay: halfDayCount,
      wfh: wfhCount, // Subset of Present
      onLeave: leaveCount,
      absent: Math.max(0, absentCount),
      conflict: conflictCount,
      accountedEmployees: presentCount + halfDayCount + leaveCount,
      attendanceRate,
      lateCount,
    };

    res.json({ success: true, data: records, summary, classified });
  } catch (err) {
    next(err);
  }
};

// ── MONTHLY ATTENDANCE CONTROLLER ────────────────────────────────────────────
exports.getMonthlyReport = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month required' });

    const y = Number(year);
    const m = Number(month);
    const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
    const monthLastDayStr = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    // Safeguard: Current month limits evaluation up to today
    const evalEndStr = monthLastDayStr < todayStr ? monthLastDayStr : (startStr > todayStr ? startStr : todayStr);

    if (startStr > todayStr) {
      return res.json({
        success: true,
        data: [],
        summary: {
          isFutureMonth: true,
          evaluatedWorkingDays: 0,
          expectedEmployeeDays: 0,
          presentDays: 0,
          halfDays: 0,
          absentDays: 0,
          leaveDays: 0,
          wfhDays: 0,
          lateCount: 0,
          avgWorkingHours: 0,
          avgAttendanceRate: 'N/A',
        },
      });
    }

    const context = await buildAttendanceContext(startStr, evalEndStr);
    const allDays = dateRange(startStr, evalEndStr);
    const workingDays = allDays.filter(d => !context.holidayMap.has(d) && !isWeeklyOff(d, context.settings));

    const records = await getAttendanceWithWfh({ date: { $gte: startStr, $lte: evalEndStr } }, startStr, evalEndStr);
    const activeUsers = await User.find({ role: { $ne: 'superadmin' }, status: { $ne: 'Inactive' } }).select('-password').lean();

    let expectedEmployeeDays = 0;
    workingDays.forEach(d => {
      const activeOnDate = activeUsers.filter(u => !u.joiningDate || new Date(u.joiningDate).toISOString().slice(0, 10) <= d);
      expectedEmployeeDays += activeOnDate.length;
    });

    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let wfhDays = 0;
    let lateCount = 0;
    let totalWorkingHours = 0;
    let workedRecordCount = 0;

    records.forEach(r => {
      if (r.status === 'Present') {
        presentDays += 1;
        if (r.workMode === 'wfh') wfhDays += 1;
      } else if (r.status === 'Half Day') {
        halfDays += 1;
      } else if (r.status === 'On Leave') {
        leaveDays += 1;
      } else if (r.status === 'Absent') {
        absentDays += 1;
      }
      if (r.isLate) lateCount += 1;
      if (r.workingHours && r.workingHours > 0) {
        totalWorkingHours += r.workingHours;
        workedRecordCount += 1;
      }
    });

    const weightedPresenceDays = presentDays + (halfDays * 0.5);
    const avgAttendanceRate = expectedEmployeeDays > 0 ? parseFloat(((weightedPresenceDays / expectedEmployeeDays) * 100).toFixed(1)) : 'N/A';
    const avgWorkingHours = workedRecordCount > 0 ? parseFloat((totalWorkingHours / workedRecordCount).toFixed(1)) : 0;

    const summary = {
      evaluatedWorkingDays: workingDays.length,
      expectedEmployeeDays,
      presentDays,
      halfDays,
      absentDays,
      leaveDays,
      wfhDays,
      lateCount,
      avgWorkingHours,
      avgAttendanceRate,
    };

    res.json({ success: true, data: records, summary });
  } catch (err) {
    next(err);
  }
};

// ── EMPLOYEE REPORT CONTROLLER ───────────────────────────────────────────────
exports.getEmployeeReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const empId = req.params.id;

    const user = await User.findById(empId).select('-password').lean();
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });

    const startStr = startDate || `${new Date().getFullYear()}-01-01`;
    const endStr = endDate || new Date().toISOString().slice(0, 10);

    const attendance = await getAttendanceWithWfh({
      employeeId: empId,
      date: { $gte: startStr, $lte: endStr },
    }, startStr, endStr);

    const leaves = await Leave.find({
      employeeId: empId,
      startDate: { $lte: new Date(`${endStr}T23:59:59`) },
      endDate: { $gte: new Date(`${startStr}T00:00:00`) },
    }).sort({ startDate: -1 }).lean();

    const nonWfhLeaves = leaves.filter(l => !isWfhLeave(l));
    const context = await buildAttendanceContext(startStr, endStr);
    const allDays = dateRange(startStr, endStr);
    const workingDays = allDays.filter(d => !context.holidayMap.has(d) && !isWeeklyOff(d, context.settings));

    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let wfhDays = 0;
    let lateCount = 0;
    let totalWorkingHours = 0;
    let workedRecordCount = 0;

    attendance.forEach(r => {
      if (r.status === 'Present') {
        presentDays += 1;
        if (r.workMode === 'wfh') wfhDays += 1;
      } else if (r.status === 'Half Day') {
        halfDays += 1;
      } else if (r.status === 'On Leave') {
        leaveDays += 1;
      } else if (r.status === 'Absent') {
        absentDays += 1;
      }
      if (r.isLate) lateCount += 1;
      if (r.workingHours && r.workingHours > 0) {
        totalWorkingHours += r.workingHours;
        workedRecordCount += 1;
      }
    });

    const weightedPresence = presentDays + (halfDays * 0.5);
    const totalWorkingDaysCount = workingDays.length;
    const attendanceRate = totalWorkingDaysCount > 0 ? parseFloat(((weightedPresence / totalWorkingDaysCount) * 100).toFixed(1)) : 'N/A';

    const summary = {
      employee: { name: user.name, employeeId: user.employeeId, department: user.department },
      workingDays: totalWorkingDaysCount,
      presentDays,
      halfDays,
      absentDays,
      leaveDays,
      wfhDays,
      lateCount,
      avgWorkingHours: workedRecordCount > 0 ? parseFloat((totalWorkingHours / workedRecordCount).toFixed(1)) : 0,
      attendanceRate,
    };

    res.json({ success: true, data: { attendance, leaves: nonWfhLeaves }, summary });
  } catch (err) {
    next(err);
  }
};

// ── DEPARTMENT REPORT CONTROLLER ─────────────────────────────────────────────
exports.getDepartmentReport = async (req, res, next) => {
  try {
    const { department, startDate, endDate } = req.query;
    if (!department) return res.status(400).json({ success: false, message: 'department is required' });

    const startStr = startDate || `${new Date().getFullYear()}-01-01`;
    const endStr = endDate || new Date().toISOString().slice(0, 10);

    const evalContext = await buildEvaluationContext(startStr, endStr, { department });
    const { summary, empComparison } = aggregateDepartmentMetrics(department, startStr, endStr, evalContext);

    const employees = evalContext.users.filter(u => department === 'all' || u.department === department);
    const ids = employees.map(e => e._id);

    const attendance = await getAttendanceWithWfh({
      employeeId: { $in: ids },
      date: { $gte: startStr, $lte: endStr },
    }, startStr, endStr);

    const leaves = await Leave.find({
      employeeId: { $in: ids },
      startDate: { $lte: new Date(`${endStr}T23:59:59`) },
      endDate: { $gte: new Date(`${startStr}T00:00:00`) },
    }).populate('employeeId', '-password').lean();

    res.json({
      success: true,
      data: {
        attendance,
        leaves: leaves.filter(l => !isWfhLeave(l)),
        empComparison: empComparison.map(item => ({
          employee: item.employee.name,
          empId: item.employee.employeeId,
          expectedDays: item.expectedDays,
          fullPresentDays: item.fullPresentDays,
          halfAttendanceDays: item.halfAttendanceDays,
          wfhDays: item.wfhDays,
          approvedLeaveDays: item.approvedLeaveDays,
          approvedShortLeaveHours: item.approvedShortLeaveHours,
          explicitAbsentDays: item.explicitAbsentDays,
          unaccountedDays: item.unaccountedDays,
          actionRequiredDays: item.actionRequiredDays,
          otherIssuesDays: item.otherIssuesDays,
          completedEmployeeDates: item.completedEmployeeDates,
          lateDays: item.lateDays,
          punchedDays: item.punchedDays,
          punchingRate: item.punchingRate,
          weightedAttendanceRate: item.weightedAttendanceRate,
          recordCompletionRate: item.recordCompletionRate,
          lateRate: item.lateRate,
          statusCounts: item.statusCounts,
          // Legacy backwards compatibility alias
          presentDays: item.fullPresentDays,
          halfDays: item.halfAttendanceDays,
          absentDays: item.explicitAbsentDays,
          leaveDays: item.approvedLeaveDays,
          lateCount: item.lateDays,
          attendanceRate: item.weightedAttendanceRate,
        })),
      },
      summary: {
        ...summary,
        presentDays: summary.totalFullPresent,
        halfDays: summary.totalHalfAttendance,
        absentDays: summary.totalUnaccounted,
        wfhDays: summary.totalWfh,
        avgAttendanceRate: summary.avgWeightedAttendanceRate,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Helper functions for Asia/Kolkata timezone formatting in CSV export
function formatTimeIST(value) {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '-';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateIST(value) {
  if (!value) return '-';
  const istStr = getISTDateString(value);
  if (!istStr) return typeof value === 'string' ? value : '-';
  const [y, m, d] = istStr.split('-');
  return `${d}/${m}/${y}`;
}

// ── UNPAGINATED CSV EXPORT CONTROLLER ─────────────────────────────────────────
exports.exportReport = async (req, res, next) => {
  try {
    const { format, type, date, year, month, employeeId, department, startDate, endDate, status, leaveType, leaveMode } = req.query;
    if (format !== 'csv') {
      return res.status(400).json({ success: false, message: 'Only format=csv is supported in this endpoint' });
    }

    let rows = [];

    if (type === 'leave') {
      const startStr = startDate || `${new Date().getFullYear()}-01-01`;
      const endStr = endDate || new Date().toISOString().slice(0, 10);
      const match = {
        startDate: { $lte: new Date(`${endStr}T23:59:59.999Z`) },
        endDate: { $gte: new Date(`${startStr}T00:00:00.000Z`) },
      };
      if (status) match.status = status;
      if (employeeId) match.employeeId = employeeId;
      if (leaveType) match.leaveType = leaveType;
      if (leaveMode) match.leaveMode = leaveMode;

      let leaves = await Leave.find(match).populate('employeeId', '-password').sort({ appliedAt: -1 }).lean();
      if (department) leaves = leaves.filter(l => l.employeeId?.department === department);

      rows = leaves.map(l => ({
        'Employee': l.employeeId?.name || '-',
        'Emp ID': l.employeeId?.employeeId || '-',
        'Department': l.employeeId?.department || '-',
        'Leave Type': l.leaveType || '-',
        'From': formatDateIST(l.startDate),
        'To': formatDateIST(l.endDate),
        'Duration': l.totalDays ? `${l.totalDays} day${l.totalDays === 1 ? '' : 's'}` : (l.totalHours ? `${l.totalHours} hrs` : '-'),
        'Mode': l.leaveMode || 'Planned',
        'Status': l.status || '-',
        'Project': l.currentProject || '—',
        'Applied On': formatDateIST(l.appliedAt),
      }));
    } else {
      let records = [];
      if (type === 'daily' && date) {
        records = await getAttendanceWithWfh({ date }, date, date);
      } else if (type === 'monthly' && year && month) {
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const end = new Date(Date.UTC(Number(year), Number(month), 0)).toISOString().slice(0, 10);
        records = await getAttendanceWithWfh({ date: { $gte: start, $lte: end } }, start, end);
      } else if (type === 'employee' && employeeId) {
        records = await getAttendanceWithWfh({ employeeId, date: { $gte: startDate, $lte: endDate } }, startDate, endDate);
      } else if (type === 'department' && department) {
        const evalContext = await buildEvaluationContext(startDate, endDate, { department });
        const { empComparison } = aggregateDepartmentMetrics(department, startDate, endDate, evalContext);
        rows = empComparison.map(r => ({
          'Employee': r.employee.name,
          'Emp ID': r.employee.employeeId,
          'Expected Days': r.expectedDays,
          'Full Present': r.fullPresentDays,
          'Half Attendance': r.halfAttendanceDays,
          'WFH Days': r.wfhDays,
          'Approved Leave Days': r.approvedLeaveDays,
          'Unaccounted Days': r.unaccountedDays,
          'Action Required Days': r.actionRequiredDays,
          'Other Issues Days': r.otherIssuesDays,
          'Late Days': r.lateDays,
          'Punched Days': r.punchedDays,
          'Punching Rate': r.punchingRate !== 'N/A' ? `${r.punchingRate}%` : 'N/A',
          'Weighted Attendance Rate': r.weightedAttendanceRate !== 'N/A' ? `${r.weightedAttendanceRate}%` : 'N/A',
          'Record Completion Rate': r.recordCompletionRate !== 'N/A' ? `${r.recordCompletionRate}%` : 'N/A',
          'Late Rate': r.lateRate !== 'N/A' ? `${r.lateRate}%` : 'N/A',
        }));
      }

      if (type !== 'department') {
        rows = records.map(r => ({
          'Employee': r.employeeId?.name || '-',
          'Emp ID': r.employeeId?.employeeId || '-',
          'Department': r.employeeId?.department || '-',
          'Date': r.date ? formatDateIST(r.date) : '-',
          'Status': r.status || '-',
          'Work Mode': r.workMode === 'wfh' ? 'WFH' : 'Office',
          'Check In': formatTimeIST(r.checkIn),
          'Check Out': formatTimeIST(r.checkOut),
          'Hours': r.workingHours ? r.workingHours.toFixed(1) : '-',
          'Late': r.isLate ? 'Yes' : 'No',
        }));
      }
    }

    const { format: csvFormat } = require('@fast-csv/format');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type || 'report'}.csv`);
    const stream = csvFormat({ headers: true });
    stream.pipe(res);
    rows.forEach(r => stream.write(r));
    stream.end();
  } catch (err) {
    next(err);
  }
};
