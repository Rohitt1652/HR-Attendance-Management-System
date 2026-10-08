const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const CalendarEvent = require('../models/CalendarEvent');
const Settings = require('../models/Settings');
const { buildEvaluationContext, classifyEmployeeDate, isWfhLeave, isShortLeave } = require('../services/attendanceEvaluationService');

/**
 * Format a Date object to YYYY-MM-DD in Asia/Kolkata timezone
 */
function formatDateIST(dateObj) {
  if (!dateObj || Number.isNaN(new Date(dateObj).getTime())) return null;
  const d = new Date(dateObj);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Format a Date object or ISO time string to HH:mm in Asia/Kolkata timezone
 */
function formatTimeIST(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) {
    const [h, m] = value.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

/**
 * Get current date string in Asia/Kolkata
 */
function getTodayIST() {
  return formatDateIST(new Date());
}

/**
 * Get yesterday date string in Asia/Kolkata
 */
function getYesterdayIST() {
  const { getYesterdayBusinessDate } = require('../utils/businessDateUtils');
  return getYesterdayBusinessDate();
}

/**
 * Generate inclusive array of YYYY-MM-DD date strings between start and end
 */
function getDatesInRange(startDateStr, endDateStr) {
  const dates = [];
  const curr = new Date(`${startDateStr}T00:00:00.000+05:30`);
  const end = new Date(`${endDateStr}T00:00:00.000+05:30`);

  while (curr <= end) {
    dates.push(formatDateIST(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

/**
 * Returns available MVP resolution actions based on issue type
 */
function getAvailableActions(issueType) {
  switch (issueType) {
    case 'not_marked':
      return [
        { type: 'add_wfh', label: 'Add WFH' },
        { type: 'view_attendance', label: 'View Attendance', url: '/admin/attendance' },
      ];
    case 'pending_leave':
      return [
        { type: 'view_leave', label: 'View Pending Leave', url: '/admin/leaves' },
      ];
    case 'conflict':
      return [
        { type: 'view_attendance', label: 'View Attendance', url: '/admin/attendance' },
        { type: 'view_leave', label: 'View Leave/WFH', url: '/admin/leaves' },
      ];
    case 'incomplete_punch':
    case 'portal_biometric_mismatch':
    case 'partial_leave_missing_attendance':
    case 'short_leave_missing_attendance':
    default:
      return [
        { type: 'view_attendance', label: 'View Attendance', url: '/admin/attendance' },
      ];
  }
}

/**
 * GET /api/attendance/reconciliation
 */
exports.getAttendanceReconciliation = async (req, res, next) => {
  try {
    const todayStr = getTodayIST();
    const yesterdayStr = getYesterdayIST();

    let { startDate, endDate, department, employeeId, employeeCode, issueType = 'action_required', exportCsv = 'false', page = 1, limit = 20 } = req.query;

    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 20;

    // Handle default date range if not provided
    if (!startDate || !endDate) {
      const nowIST = new Date();
      const dayOfMonth = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(nowIST), 10);
      
      if (dayOfMonth === 1) {
        // First day of month: default to 1st to last day of previous month
        const prevMonthDate = new Date(nowIST);
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const year = prevMonthDate.getFullYear();
        const month = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
        const lastDayOfPrevMonth = new Date(year, prevMonthDate.getMonth() + 1, 0).getDate();
        startDate = `${year}-${month}-01`;
        endDate = `${year}-${month}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;
      } else {
        // Default: 1st of current month to Yesterday
        const year = nowIST.getFullYear();
        const month = String(nowIST.getMonth() + 1).padStart(2, '0');
        startDate = `${year}-${month}-01`;
        endDate = yesterdayStr;
      }
    }

    if (startDate > endDate) {
      return res.status(400).json({ success: false, message: 'startDate cannot be after endDate' });
    }

    const sDate = new Date(`${startDate}T00:00:00.000+05:30`);
    const eDate = new Date(`${endDate}T00:00:00.000+05:30`);
    const diffDays = Math.ceil((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 366) {
      return res.status(400).json({ success: false, message: 'Date range cannot exceed 366 days' });
    }

    const isTodayIncluded = endDate >= todayStr;

    // 1. Resolve employee query filter (handles both Mongo _id and employeeCode like DT-125)
    // Exclude superadmin and administrator roles (company owners/admins not expected to punch biometric)
    const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');
    const EXCLUDED_ROLES = ['superadmin', 'admin', 'Administrator', 'administrator'];
    const targetEmpQuery = employeeCode || employeeId;
    const userQuery = { status: 'Active', role: { $nin: EXCLUDED_ROLES } };

    const workforceScope = await resolveAuthorizedWorkforceScope(req.user);
    let scopedEmployeeIds = null;

    if (!workforceScope.isUnrestricted) {
      if (!workforceScope.authorizedEmployeeIds || workforceScope.authorizedEmployeeIds.length === 0) {
        // Fail closed: 0 authorized employees
        const emptySummary = {
          employeeDatesChecked: 0,
          matchedCount: 0,
          actionRequiredCount: 0,
          reconciliationRate: 'N/A',
          not_marked: 0,
          conflict: 0,
          incomplete_punch: 0,
          pending_leave: 0,
          portal_biometric_mismatch: 0,
          partial_leave_missing_attendance: 0,
          short_leave_missing_attendance: 0,
          matched_present: 0,
          matched_wfh: 0,
          matched_leave: 0,
          matched_absent: 0,
        };

        if (exportCsv === 'true') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="attendance_reconciliation_${startDate}_to_${endDate}.csv"`);
          return res.send('Date,Employee,Employee ID,Department,Biometric Check In,Biometric Check Out,Portal Status,Leave/WFH,Issue,Explanation,Recommended Action\n');
        }

        return res.json({
          success: true,
          data: {
            summary: emptySummary,
            dateRange: { startDate, endDate, todayStr, isTodayIncluded },
            pagination: { totalRows: 0, page: 1, limit, totalPages: 0 },
            rows: [],
          },
        });
      }

      scopedEmployeeIds = workforceScope.authorizedEmployeeIds.map(id => String(id));
      userQuery._id = { $in: workforceScope.authorizedEmployeeIds };
    }

    if (department && department !== 'all') {
      if (workforceScope.managedDepartments && !workforceScope.managedDepartments.includes(department)) {
        userQuery._id = { $in: [] };
      } else {
        userQuery.department = department;
      }
    }

    if (targetEmpQuery && targetEmpQuery !== 'all') {
      if (mongoose.Types.ObjectId.isValid(targetEmpQuery)) {
        userQuery.$or = [{ _id: targetEmpQuery }, { employeeId: targetEmpQuery }];
      } else {
        userQuery.employeeId = targetEmpQuery;
      }
    }

    const employees = await User.find(userQuery)
      .select('_id employeeId name department designation joiningDate status')
      .lean();

    if (!employees.length) {
      const emptySummary = {
        employeeDatesChecked: 0,
        matchedCount: 0,
        actionRequiredCount: 0,
        reconciliationRate: 'N/A',
        not_marked: 0,
        conflict: 0,
        incomplete_punch: 0,
        pending_leave: 0,
        portal_biometric_mismatch: 0,
        partial_leave_missing_attendance: 0,
        short_leave_missing_attendance: 0,
        matched_present: 0,
        matched_wfh: 0,
        matched_leave: 0,
        matched_absent: 0,
      };

      if (exportCsv === 'true') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="attendance_reconciliation_${startDate}_to_${endDate}.csv"`);
        return res.send('Date,Employee,Employee ID,Department,Biometric Check In,Biometric Check Out,Portal Status,Leave/WFH,Issue,Explanation,Recommended Action\n');
      }

      return res.json({
        success: true,
        data: {
          summary: emptySummary,
          dateRange: { startDate, endDate, todayStr, isTodayIncluded },
          pagination: { totalRows: 0, page: 1, limit, totalPages: 0 },
          rows: [],
        },
      });
    }

    // 2. Build Evaluation Context via Shared Evaluation Service
    const evalUserFilter = {};
    if (!workforceScope.isUnrestricted) {
      evalUserFilter._id = { $in: workforceScope.authorizedEmployeeIds || [] };
    }
    if (department && department !== 'all') evalUserFilter.department = department;
    if (targetEmpQuery && targetEmpQuery !== 'all') {
      if (mongoose.Types.ObjectId.isValid(targetEmpQuery)) {
        evalUserFilter.$or = [{ _id: targetEmpQuery }, { employeeId: targetEmpQuery }];
      } else {
        evalUserFilter.employeeId = targetEmpQuery;
      }
    }

    const context = await buildEvaluationContext(startDate, endDate, evalUserFilter);

    // 3. Evaluate all eligible employee-dates
    const allDates = getDatesInRange(startDate, endDate);

    let employeeDatesChecked = 0;
    const counts = {
      not_marked: 0,
      conflict: 0,
      incomplete_punch: 0,
      pending_leave: 0,
      portal_biometric_mismatch: 0,
      partial_leave_missing_attendance: 0,
      short_leave_missing_attendance: 0,
      matched_present: 0,
      matched_wfh: 0,
      matched_leave: 0,
      matched_absent: 0,
      matched_partial_covered: 0,
    };

    const allCalculatedRows = [];

    for (const d of allDates) {
      // Exclude future dates
      if (d > todayStr) continue;

      for (const emp of employees) {
        const result = classifyEmployeeDate(emp, d, context);

        if (!result.isEligibleWorkingDate) continue;

        employeeDatesChecked++;

        const primaryStatus = result.primaryStatus;
        counts[primaryStatus] = (counts[primaryStatus] || 0) + 1;

        let issueTitle = '';
        let explanation = '';
        let recommendedActionText = '';

        switch (primaryStatus) {
          case 'not_marked':
            issueTitle = 'Unaccounted';
            explanation = 'Nothing explains the working date.';
            recommendedActionText = 'Add WFH or View Attendance';
            break;
          case 'incomplete_punch':
            issueTitle = 'Incomplete Punch';
            explanation = 'Check-in or check-out is missing.';
            recommendedActionText = 'View Attendance';
            break;
          case 'conflict':
            issueTitle = 'Attendance / Leave Conflict';
            explanation = 'Punch or Absent conflicts with approved Leave/WFH.';
            recommendedActionText = 'View Attendance or View Leave';
            break;
          case 'portal_biometric_mismatch':
            issueTitle = 'Portal / Biometric Mismatch';
            explanation = 'Portal attendance exists without matching biometric evidence.';
            recommendedActionText = 'View Attendance';
            break;
          case 'pending_leave':
            issueTitle = 'Leave Approval Pending';
            explanation = 'Leave exists but is awaiting approval.';
            recommendedActionText = 'View Pending Leave';
            break;
          case 'partial_leave_missing_attendance':
            issueTitle = 'Half-day Leave Needs Attendance';
            explanation = 'Remaining half day has no attendance.';
            recommendedActionText = 'View Attendance';
            break;
          case 'short_leave_missing_attendance':
            issueTitle = 'Short Leave Needs Attendance';
            explanation = 'Short leave does not explain the complete working day.';
            recommendedActionText = 'View Attendance';
            break;
          case 'matched_present':
            issueTitle = 'Matched – Present';
            explanation = 'Matched complete biometric/office punch attendance.';
            recommendedActionText = 'None';
            break;
          case 'matched_wfh':
            issueTitle = 'Matched – WFH';
            explanation = 'Matched approved Work From Home.';
            recommendedActionText = 'None';
            break;
          case 'matched_leave':
            issueTitle = 'Matched – On Leave';
            explanation = 'Matched approved full-day leave.';
            recommendedActionText = 'None';
            break;
          case 'matched_absent':
            issueTitle = 'Matched – Absent';
            explanation = 'Matched stored portal absence record.';
            recommendedActionText = 'None';
            break;
          case 'matched_partial_covered':
            issueTitle = 'Matched – Partial Covered';
            explanation = 'Half-day attendance combined with approved half-day leave.';
            recommendedActionText = 'None';
            break;
          default:
            issueTitle = primaryStatus;
            explanation = 'Requires HR review.';
            recommendedActionText = 'Review required';
            break;
        }

        const isActionRequired = [
          'conflict',
          'incomplete_punch',
          'pending_leave',
          'portal_biometric_mismatch',
          'partial_leave_missing_attendance',
          'short_leave_missing_attendance',
          'not_marked',
        ].includes(primaryStatus);

        let isFilterMatch = false;
        if (issueType === 'all') isFilterMatch = true;
        else if (issueType === 'action_required') isFilterMatch = isActionRequired;
        else if (issueType === primaryStatus) isFilterMatch = true;

        if (isFilterMatch) {
          const att = result.rec;
          const userLeaves = result.leaves || [];
          const activeLeave = userLeaves.find(l => l.status === 'Approved' || l.status === 'Pending');

          // Biometric Punch formatting (Asia/Kolkata timezone)
          let biometricPunchText = 'No punch';
          let biometricCheckIn = att?.checkIn ? formatTimeIST(att.checkIn) : null;
          let biometricCheckOut = att?.checkOut ? formatTimeIST(att.checkOut) : null;

          if (att && (att.checkIn || att.checkOut)) {
            if (att.checkIn && att.checkOut) biometricPunchText = `${biometricCheckIn || 'None'} – ${biometricCheckOut || 'None'}`;
            else if (att.checkIn) biometricPunchText = `Check-in only: ${biometricCheckIn}`;
            else if (att.checkOut) biometricPunchText = `Check-out only: ${biometricCheckOut}`;
          }

          // Portal Attendance formatting
          let portalStatusText = 'No record';
          if (att) {
            if (att.workMode === 'wfh' || att.source === 'wfh_leave') portalStatusText = 'WFH';
            else if (att.status) portalStatusText = att.status;
          }

          // Leave / WFH formatting
          let leaveWfhText = 'None';
          const appWfh = userLeaves.find(l => l.status === 'Approved' && isWfhLeave(l));
          const appShort = userLeaves.find(l => l.status === 'Approved' && !isWfhLeave(l) && isShortLeave(l));
          const appHalf = userLeaves.find(l => l.status === 'Approved' && !isWfhLeave(l) && !isShortLeave(l) && l.durationType === 'half_day');
          const appFull = userLeaves.find(l => l.status === 'Approved' && !isWfhLeave(l) && !isShortLeave(l) && (l.durationType === 'full_day' || !l.durationType));
          const pendLeave = userLeaves.find(l => l.status === 'Pending');

          if (appWfh) leaveWfhText = 'Approved WFH';
          else if (appShort) leaveWfhText = `Approved Short Leave (${appShort.totalHours || appShort.durationHours || 2}h)`;
          else if (appHalf) leaveWfhText = 'Approved Half-Day Leave';
          else if (appFull) leaveWfhText = 'Approved Full-Day Leave';
          else if (pendLeave) leaveWfhText = 'Pending Leave';

          allCalculatedRows.push({
            employee: {
              _id: emp._id,
              employeeId: emp.employeeId,
              name: emp.name,
              department: emp.department,
              designation: emp.designation,
            },
            date: d,
            issueType: primaryStatus,
            issueTitle,
            explanation,
            description: explanation,
            recommendedActionText,
            biometricPunchText,
            biometricCheckIn,
            biometricCheckOut,
            portalStatusText,
            leaveWfhText,
            isActionRequired,
            attendanceRecord: att ? {
              _id: att._id,
              status: att.status,
              checkIn: att.checkIn,
              checkOut: att.checkOut,
              source: att.source,
              workMode: att.workMode,
            } : null,
            leaveRecord: activeLeave ? {
              _id: activeLeave._id,
              leaveType: activeLeave.leaveType,
              status: activeLeave.status,
              reason: activeLeave.reason,
            } : null,
            availableActions: getAvailableActions(primaryStatus),
          });
        }
      }
    }

    // 4. Summary metrics calculation
    const matchedCount = counts.matched_present + counts.matched_wfh + counts.matched_leave + counts.matched_absent + (counts.matched_partial_covered || 0);
    const actionRequiredCount = counts.conflict + counts.incomplete_punch + counts.pending_leave + counts.portal_biometric_mismatch + counts.partial_leave_missing_attendance + counts.short_leave_missing_attendance + counts.not_marked;

    const reconciliationRate = employeeDatesChecked > 0
      ? Number(((matchedCount / employeeDatesChecked) * 100).toFixed(1))
      : 'N/A';

    const summary = {
      employeeDatesChecked,
      matchedCount,
      actionRequiredCount,
      reconciliationRate,
      ...counts,
    };

    // 5. Deterministic Sorting: Primary by date (descending), Secondary by employeeId (ascending)
    allCalculatedRows.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const codeA = a.employee.employeeId || '';
      const codeB = b.employee.employeeId || '';
      return codeA.localeCompare(codeB);
    });

    // 6. CSV Export Handling
    if (exportCsv === 'true') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_reconciliation_${startDate}_to_${endDate}.csv"`);

      let csvText = 'Date,Employee,Employee ID,Department,Biometric Check In,Biometric Check Out,Portal Status,Leave/WFH,Issue,Explanation,Recommended Action\n';
      allCalculatedRows.forEach(r => {
        const rowVals = [
          r.date,
          `"${(r.employee.name || '').replace(/"/g, '""')}"`,
          `"${(r.employee.employeeId || '').replace(/"/g, '""')}"`,
          `"${(r.employee.department || '').replace(/"/g, '""')}"`,
          `"${(r.biometricCheckIn || 'None').replace(/"/g, '""')}"`,
          `"${(r.biometricCheckOut || 'None').replace(/"/g, '""')}"`,
          `"${(r.portalStatusText || 'No record').replace(/"/g, '""')}"`,
          `"${(r.leaveWfhText || 'None').replace(/"/g, '""')}"`,
          `"${(r.issueTitle || '').replace(/"/g, '""')}"`,
          `"${(r.explanation || '').replace(/"/g, '""')}"`,
          `"${(r.recommendedActionText || 'Review required').replace(/"/g, '""')}"`,
        ];
        csvText += rowVals.join(',') + '\n';
      });

      return res.send(csvText);
    }

    // 7. Pagination
    const totalRows = allCalculatedRows.length;
    const totalPages = Math.ceil(totalRows / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedRows = allCalculatedRows.slice(startIndex, startIndex + limit);

    return res.json({
      success: true,
      data: {
        summary,
        dateRange: {
          startDate,
          endDate,
          todayStr,
          isTodayIncluded,
        },
        pagination: {
          totalRows,
          page,
          limit,
          totalPages,
        },
        rows: paginatedRows,
      },
    });
  } catch (err) {
    console.error('[Attendance Reconciliation] Failed:', err);
    next(err);
  }
};
