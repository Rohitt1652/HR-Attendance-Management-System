const Settings = require('../models/Settings');
const CalendarEvent = require('../models/CalendarEvent');
const Leave = require('../models/Leave');
const { formatBusinessDate, parseUtcDateString, getBusinessDateRangeUtcBounds } = require('../utils/businessDateUtils');


const ATTENDANCE_TIME_ZONE = 'Asia/Kolkata';
const SHORT_HOURS_TOLERANCE = 0.05;

function roundHours(value) {
  return Number(Math.max(0, value || 0).toFixed(2));
}

function normalizeShortHours(value) {
  const rounded = roundHours(value);
  return rounded < SHORT_HOURS_TOLERANCE ? 0 : rounded;
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dateTimeToMinutesInAttendanceZone(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  const minute = Number(parts.find(p => p.type === 'minute')?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function dateToString(value) {
  return formatBusinessDate(value);
}

function dateRange(start, end) {
  const days = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const last = new Date(Date.UTC(ey, em - 1, ed));
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function saturdayNumber(dateStr) {
  const d = parseUtcDateString(dateStr);
  return d ? Math.ceil(d.getUTCDate() / 7) : 1;
}

function isSaturdayOff(dateStr, settings) {
  const nth = saturdayNumber(dateStr);
  switch (settings.saturdayOffRule || 'second_fourth_off') {
    case 'all_saturdays_off':
      return true;
    case 'first_second_off':
      return [1, 2].includes(nth);
    case 'second_fourth_off':
      return [2, 4].includes(nth);
    case 'no_saturday_off':
      return false;
    case 'custom':
      return (settings.customSaturdayOffs || []).includes(nth);
    default:
      return (settings.weekendDays || []).includes(6);
  }
}

function isWeeklyOff(dateStr, settings) {
  const d = parseUtcDateString(dateStr);
  if (!d) return false;
  const day = d.getUTCDay();
  if (day === 0) return true;
  if (day === 6) return isSaturdayOff(dateStr, settings);
  return (settings.weekendDays || []).includes(day);
}

function eventCoversDate(event, dateStr) {
  const start = event.date;
  const end = event.endDate || event.date;
  return start <= dateStr && end >= dateStr;
}

async function buildAttendanceContext(startDate, endDate) {
  const settings = await Settings.getGlobal();
  const utcBounds = getBusinessDateRangeUtcBounds(startDate, endDate);
  const [holidayEvents, leaves] = await Promise.all([
    CalendarEvent.find({
      type: 'holiday',
      isActive: true,
      date: { $lte: endDate },
      $or: [{ endDate: null }, { endDate: { $gte: startDate } }, { endDate: { $exists: false } }],
    }).lean(),
    Leave.find({
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lt: utcBounds.nextDayStart },
      endDate: { $gte: utcBounds.start },
    }).lean(),
  ]);

  const holidayMap = new Map();
  for (const event of holidayEvents) {
    for (const day of dateRange(event.date, event.endDate || event.date)) {
      if (day >= startDate && day <= endDate) holidayMap.set(day, event);
    }
  }

  const leaveMap = new Map();
  for (const leave of leaves) {
    const start = dateToString(leave.startDate);
    const end = dateToString(leave.endDate);
    if (!start || !end) continue;
    for (const day of dateRange(start, end)) {
      if (day < startDate || day > endDate) continue;
      const key = `${leave.employeeId}:${day}`;
      if (!leaveMap.has(key)) leaveMap.set(key, []);
      leaveMap.get(key).push(leave);
    }
  }

  return { settings, holidayMap, leaveMap };
}

function isShortLeave(leave) {
  const text = `${leave?.leaveType || ''} ${leave?.leaveTypeCode || ''}`.toLowerCase();
  return text.includes('short') || text.includes('shrt') || /\bsl\b/.test(text);
}

function isWfhLeave(leave) {
  const text = `${leave?.leaveType || ''} ${leave?.leaveTypeCode || ''}`
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return text.includes('WFH') || text.includes('WORKFROMHOME');
}

function leaveHours(leave, fallbackHours = 0) {
  const start = timeToMinutes(leave.startTime);
  const end = timeToMinutes(leave.endTime);
  const computed = start !== null && end !== null ? (end - start) / 60 : null;
  const hours = Number(leave.totalHours || leave.durationHours || computed || fallbackHours);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

function leaveAdjustment(leaves, settings) {
  let requiredReduction = 0;
  let fullDay = false;
  let halfDay = false;
  let hourlyHours = 0;
  let primaryLeave = null;

  for (const leave of (leaves || []).filter(l => ['Approved', 'Pending'].includes(l.status))) {
    if (isShortLeave(leave)) {
      hourlyHours += leaveHours(leave, 2);
      primaryLeave = primaryLeave || leave;
    } else if (leave.durationType === 'full_day') {
      fullDay = true;
      primaryLeave = primaryLeave || leave;
      requiredReduction = Math.max(requiredReduction, Number(settings.fullDayRequiredHours || 9));
    } else if (leave.durationType === 'half_day') {
      halfDay = true;
      primaryLeave = primaryLeave || leave;
      requiredReduction += Number(settings.halfDayRequiredHours || 4.5);
    } else if (leave.durationType === 'hourly') {
      const hours = leaveHours(leave);
      if (Number.isFinite(hours) && hours > 0) hourlyHours += hours;
      primaryLeave = primaryLeave || leave;
    }
  }

  const totalReduction = requiredReduction + hourlyHours;
  if (totalReduction >= Number(settings.fullDayRequiredHours || 9)) fullDay = true;

  return { fullDay, halfDay, hourlyHours, requiredReduction: totalReduction, primaryLeave };
}

function buildLeaveInfo(leaves, leave) {
  if (!leaves?.length) return { hasLeave: false };
  const primaryLeave = leave.primaryLeave || leaves.find(l => l.status === 'Approved') || leaves.find(l => l.status === 'Pending') || leaves[0];
  const type = primaryLeave?.leaveType || 'Leave';
  const durationType = isShortLeave(primaryLeave) ? 'hourly' : leave.fullDay ? 'full_day' : leave.halfDay ? 'half_day' : leave.hourlyHours > 0 ? 'hourly' : primaryLeave?.durationType;
  const durationHours = durationType === 'hourly' ? roundHours(leave.hourlyHours || leaveHours(primaryLeave)) : primaryLeave?.totalHours || primaryLeave?.durationHours || null;
  const status = primaryLeave?.status === 'Pending' ? 'pending' : 'approved';
  const label = status === 'pending' ? 'Leave Applied' : 'Leave Approved';
  let tooltip = `${type} ${status === 'pending' ? 'approval pending' : 'approved'}`;
  if (durationType === 'full_day') tooltip = `Full Day Leave ${status === 'pending' ? 'approval pending' : 'approved'}`;
  else if (durationType === 'half_day') tooltip = `Half Day Leave ${status === 'pending' ? 'approval pending' : 'approved'}`;
  else if (durationType === 'hourly') tooltip = `${type} - ${durationHours || 0} hour${Number(durationHours) === 1 ? '' : 's'} ${status === 'pending' ? 'approval pending' : 'approved'}`;

  return {
    hasLeave: true,
    leaveType: type,
    durationType,
    durationHours,
    status,
    label,
    tooltip,
  };
}

function calculateAttendanceRecord(record, context) {
  const settings = context.settings;
  const employee = record.employeeId || {};
  const workedHours = roundHours(record.workingHours ?? (record.checkIn && record.checkOut ? (new Date(record.checkOut) - new Date(record.checkIn)) / 3600000 : 0));
  const dateStr = record.date;
  const isHoliday = context.holidayMap.has(dateStr);
  const weeklyOff = isWeeklyOff(dateStr, settings);
  const leaves = context.leaveMap.get(`${employee._id || employee}:${dateStr}`) || [];
  const leave = leaveAdjustment(leaves, settings);
  const leaveInfo = buildLeaveInfo(leaves, leave);
  const approvedWfh = leaves.find(l => l.status === 'Approved' && isWfhLeave(l));
  const isSaturday = new Date(`${dateStr}T00:00:00`).getDay() === 6;
  let requiredHours = isSaturday ? Number(settings.saturdayRequiredHours || 4) : Number(settings.fullDayRequiredHours || 9);
  let dayType = 'Working Day';

  if (record.workMode === 'wfh' || approvedWfh) {
    const wfhLeaveInfo = approvedWfh
      ? {
        ...leaveInfo,
        leaveType: 'WFH',
        label: 'WFH Approved',
        tooltip: `WFH approved${approvedWfh.reason ? ` - ${approvedWfh.reason}` : ''}`,
      }
      : leaveInfo;
    const hasAnyPunch = Boolean(record.checkIn || record.checkOut || record.source === 'biometric');
    const isConflict = Boolean(hasAnyPunch && (leave.fullDay || approvedWfh || record.workMode === 'wfh' || record.isConflict || record.status === 'conflict' || record.issueFlags?.includes('conflict')));
    return {
      ...record,
      workMode: 'wfh',
      wfhReason: record.wfhReason || approvedWfh?.reason || '',
      employeeId: employee,
      biometricId: employee.biometricId || record.biometricId || '',
      workedHours,
      workingHours: workedHours,
      requiredHours: 0,
      shortHours: 0,
      overtimeHours: 0,
      hasMissingPunch: false,
      isLate: false,
      isHoliday,
      isWeeklyOff: false,
      dayType: 'Work From Home',
      timeStatus: isConflict ? 'Conflict' : 'WFH',
      status: 'Present',
      leaveInfo: wfhLeaveInfo,
      issueFlags: isConflict ? ['conflict'] : [],
      attendancePolicy: {
        officeStartTime: settings.officeStartTime,
        lateThreshold: settings.lateThreshold,
        holiday: isHoliday ? context.holidayMap.get(dateStr)?.title : null,
        leaves: [],
      },
    };
  }

  if (record.source === 'leave' && leaveInfo.hasLeave) {
    const isApprovedShortLeave = (leaveInfo.durationType === 'hourly' || leave.hourlyHours > 0) && leaveInfo.status === 'approved';
    if (isApprovedShortLeave) {
      const standardFullDayRequiredHours = isSaturday
        ? Number(settings.saturdayRequiredHours || 4)
        : Number(settings.fullDayRequiredHours || 9);
      const leaveHrs = leaveInfo.durationHours || leave.hourlyHours || 2;
      const reqHours = Math.max(0, standardFullDayRequiredHours - leaveHrs);
      return {
        ...record,
        employeeId: employee,
        biometricId: employee.biometricId || record.biometricId || '',
        workedHours,
        workingHours: workedHours,
        requiredHours: roundHours(reqHours),
        shortHours: roundHours(reqHours),
        overtimeHours: 0,
        hasMissingPunch: false,
        isLate: false,
        isHoliday,
        isWeeklyOff: false,
        dayType: 'Short Leave',
        timeStatus: 'Short Leave Exception',
        status: 'Absent',
        primaryStatus: 'short_leave_missing_attendance',
        leaveInfo,
        issueFlags: ['short_leave_missing_attendance'],
        attendancePolicy: {
          officeStartTime: settings.officeStartTime,
          lateThreshold: settings.lateThreshold,
          holiday: isHoliday ? context.holidayMap.get(dateStr)?.title : null,
          leaves: leaves.map(l => ({ id: l._id, type: l.leaveType, durationType: l.durationType, totalHours: l.totalHours })),
        },
      };
    }

    const isApprovedHalfLeave = leaveInfo.durationType === 'half_day' && leaveInfo.status === 'approved';
    if (isApprovedHalfLeave) {
      const reqHours = Number(settings.halfDayRequiredHours || 4.5);
      return {
        ...record,
        employeeId: employee,
        biometricId: employee.biometricId || record.biometricId || '',
        workedHours,
        workingHours: workedHours,
        requiredHours: roundHours(reqHours),
        shortHours: reqHours,
        overtimeHours: 0,
        hasMissingPunch: false,
        isLate: false,
        isHoliday,
        isWeeklyOff: false,
        dayType: 'Half Day Leave',
        timeStatus: 'Partial Leave Exception',
        status: 'Half Day',
        primaryStatus: 'partial_leave_missing_attendance',
        leaveInfo,
        issueFlags: ['partial_leave_missing_attendance'],
        attendancePolicy: {
          officeStartTime: settings.officeStartTime,
          lateThreshold: settings.lateThreshold,
          holiday: isHoliday ? context.holidayMap.get(dateStr)?.title : null,
          leaves: leaves.map(l => ({ id: l._id, type: l.leaveType, durationType: l.durationType, totalHours: l.totalHours })),
        },
      };
    }

    const isFullDay = leaveInfo.durationType === 'full_day' || leave.fullDay;
    const status = isFullDay ? 'On Leave' : (leaveInfo.durationType === 'hourly' ? 'Present' : 'Half Day');
    const dayType = leaveInfo.status === 'pending'
      ? 'Leave Applied'
      : (isFullDay ? 'Leave' : (leaveInfo.durationType === 'hourly' ? 'Short Leave' : 'Half Day Leave'));

    return {
      ...record,
      employeeId: employee,
      biometricId: employee.biometricId || record.biometricId || '',
      workedHours,
      workingHours: workedHours,
      requiredHours: 0,
      shortHours: 0,
      overtimeHours: 0,
      hasMissingPunch: false,
      isLate: false,
      isHoliday,
      isWeeklyOff: false,
      dayType,
      timeStatus: leaveInfo.status === 'pending' ? 'Leave Applied' : 'Leave',
      status,
      leaveInfo,
      issueFlags: [],
      attendancePolicy: {
        officeStartTime: settings.officeStartTime,
        lateThreshold: settings.lateThreshold,
        holiday: isHoliday ? context.holidayMap.get(dateStr)?.title : null,
        leaves: leaves.map(l => ({ id: l._id, type: l.leaveType, durationType: l.durationType, totalHours: l.totalHours })),
      },
    };
  }

  if (isHoliday) {
    requiredHours = 0;
    dayType = 'Holiday';
  } else if (weeklyOff) {
    requiredHours = 0;
    dayType = 'Weekly Off';
  } else if (leave.fullDay) {
    requiredHours = 0;
    dayType = 'Leave';
  } else if (leave.halfDay) {
    requiredHours = Number(settings.halfDayRequiredHours || 4.5);
    dayType = 'Half Day Leave';
  } else if (leave.hourlyHours > 0) {
    requiredHours = Math.max(0, requiredHours - leave.hourlyHours);
    dayType = 'Short Leave';
  }

  const approvedLeaves = leaves.filter(l => l.status === 'Approved');
  const approvedWfhLeave = approvedLeaves.find(l => isWfhLeave(l));
  const approvedShortLeave = approvedLeaves.find(l => !isWfhLeave(l) && isShortLeave(l));
  const approvedHalfLeave = approvedLeaves.find(l => !isWfhLeave(l) && !isShortLeave(l) && l.durationType === 'half_day');
  const approvedFullLeave = approvedLeaves.find(l => !isWfhLeave(l) && !isShortLeave(l) && (l.durationType === 'full_day' || !l.durationType));
  const hasAnyApprovedLeave = Boolean(approvedFullLeave || approvedHalfLeave || approvedShortLeave || approvedWfhLeave || leave.fullDay || leave.halfDay || leave.hourlyHours > 0);

  const thresholdMinutes = timeToMinutes(settings.lateThreshold || settings.officeStartTime || '10:00');
  const checkInMinutes = dateTimeToMinutesInAttendanceZone(record.checkIn);
  const policyLate = requiredHours > 0 && !hasAnyApprovedLeave && thresholdMinutes !== null && checkInMinutes !== null && checkInMinutes > thresholdMinutes;
  const hasMissingPunch = Boolean(!leave.fullDay && !approvedFullLeave && ((record.checkIn && !record.checkOut) || (!record.checkIn && record.checkOut)));
  const isLate = Boolean(!isHoliday && !weeklyOff && !hasAnyApprovedLeave && policyLate);
  const standardFullDayRequiredHours = isSaturday
    ? Number(settings.saturdayRequiredHours || 4)
    : Number(settings.fullDayRequiredHours || 9);
  const isLeaveAdjusted = Boolean(leave.halfDay || leave.hourlyHours > 0 || (leaveInfo.hasLeave && leaveInfo.durationType !== 'full_day'));
  const overtimeThreshold = isLeaveAdjusted ? standardFullDayRequiredHours : requiredHours;
  const shortHours = requiredHours > 0 ? normalizeShortHours(Math.max(0, requiredHours - workedHours)) : 0;
  const overtimeHours = workedHours > overtimeThreshold ? roundHours(workedHours - overtimeThreshold) : 0;

  const hasBothPunches = Boolean(record.checkIn && record.checkOut);
  const hasAnyPunch = Boolean(record.checkIn || record.checkOut || record.source === 'biometric');
  const isNonWorking = Boolean(isHoliday || weeklyOff);
  const isConflict = Boolean(hasAnyPunch && (approvedFullLeave || approvedWfhLeave || record.workMode === 'wfh' || record.isConflict || record.status === 'conflict' || record.issueFlags?.includes('conflict')));

  const issueFlags = [];
  if (record.issueFlags?.includes('not_marked') || record.source === 'calculated_unaccounted' || record.primaryStatus === 'not_marked') {
    issueFlags.push('not_marked');
  }

  const isShortLeaveMissing = Boolean(
    approvedShortLeave && !hasAnyPunch && !approvedWfhLeave
  ) || record.issueFlags?.includes('short_leave_missing_attendance') || record.source === 'calculated_short_leave_missing' || record.primaryStatus === 'short_leave_missing_attendance';

  if (isShortLeaveMissing && !hasMissingPunch) {
    issueFlags.push('short_leave_missing_attendance');
  }

  const isPartialLeaveMissing = Boolean(
    approvedHalfLeave && !hasAnyPunch && !approvedWfhLeave
  ) || record.issueFlags?.includes('partial_leave_missing_attendance') || record.source === 'calculated_partial_leave_missing' || record.primaryStatus === 'partial_leave_missing_attendance';

  if (isPartialLeaveMissing && !hasMissingPunch) {
    issueFlags.push('partial_leave_missing_attendance');
  }
  if (isConflict) issueFlags.push('conflict');
  if (hasMissingPunch) issueFlags.push('missing_punch');
  if (isNonWorking && hasAnyPunch) issueFlags.push('worked_non_working_day');
  if (isLate) issueFlags.push('late');
  if (hasBothPunches && shortHours > 0) issueFlags.push('short_hours');
  if (hasBothPunches && overtimeHours > 0) issueFlags.push('overtime');

  const status = (hasAnyPunch || (record && record.status === 'Present'))
    ? (shortHours === 0 ? 'Present' : workedHours >= Number(settings.halfDayRequiredHours || 4.5) ? 'Half Day' : record.status || 'Present')
    : (requiredHours === 0
      ? (dayType === 'Holiday' ? 'Holiday' : dayType === 'Weekly Off' ? 'Weekend' : 'On Leave')
      : 'Absent');

  const isWfh = record.workMode === 'wfh' || Boolean(approvedWfhLeave);
  const isOnLeave = status === 'On Leave' || Boolean(approvedFullLeave);

  if (!isNonWorking && !isWfh && !isOnLeave && !isConflict && hasBothPunches && !isLate && shortHours === 0 && !hasMissingPunch) {
    issueFlags.push('on_track');
  }

  let timeStatus = 'On Track';
  if (isConflict) timeStatus = 'Conflict';
  else if (issueFlags.includes('short_leave_missing_attendance')) timeStatus = 'Short Leave Exception';
  else if (issueFlags.includes('partial_leave_missing_attendance')) timeStatus = 'Partial Leave Exception';
  else if (issueFlags.includes('missing_punch')) timeStatus = 'Missing Punch';
  else if (issueFlags.includes('worked_non_working_day')) timeStatus = 'Worked on Non-Working Day';
  else if (issueFlags.includes('late')) timeStatus = 'Late';
  else if (issueFlags.includes('short_hours')) timeStatus = 'Short Time';
  else if (issueFlags.includes('overtime')) timeStatus = 'Overtime';
  else if (issueFlags.includes('on_track')) timeStatus = 'On Track';
  else if (isWfh) timeStatus = 'WFH';
  else if (isOnLeave) timeStatus = 'Leave';
  else if (dayType === 'Weekly Off') timeStatus = 'Weekly Off';
  else if (dayType === 'Holiday') timeStatus = 'Holiday';

  return {
    ...record,
    employeeId: employee,
    biometricId: employee.biometricId || record.biometricId || '',
    workedHours,
    workingHours: workedHours,
    requiredHours: roundHours(requiredHours),
    shortHours,
    overtimeHours,
    hasMissingPunch,
    isLate,
    isHoliday,
    isWeeklyOff: weeklyOff,
    dayType,
    timeStatus,
    status,
    leaveInfo,
    issueFlags,
    attendancePolicy: {
      officeStartTime: settings.officeStartTime,
      lateThreshold: settings.lateThreshold,
      holiday: isHoliday ? context.holidayMap.get(dateStr)?.title : null,
      leaves: leaves.map(l => ({ id: l._id, type: l.leaveType, durationType: l.durationType, totalHours: l.totalHours })),
    },
  };
}

function filterCalculatedRecords(records, query = {}) {
  const { status, workMode, issue, timeStatus, dayType, isLate } = query;

  return records.filter(record => {
    // 1. Status Filter
    if (status) {
      if (status === 'present' || status === 'Present') {
        const isPresent = record.status === 'Present' || record.status === 'Full Day';
        if (!isPresent) return false;
      } else if (status === 'half_day' || status === 'Half Day') {
        if (record.status !== 'Half Day') return false;
      } else if (status === 'absent' || status === 'Absent') {
        if (record.status !== 'Absent') return false;
      } else if (status === 'on_leave' || status === 'On Leave') {
        if (record.status !== 'On Leave') return false;
      }
    }

    // 2. Work Mode Filter
    const effectiveWorkMode = workMode || (timeStatus === 'WFH' ? 'wfh' : null);
    if (effectiveWorkMode) {
      if (effectiveWorkMode === 'wfh') {
        if (record.workMode !== 'wfh') return false;
      } else if (effectiveWorkMode === 'office') {
        if (record.workMode === 'wfh') return false;
        const hasPunch = Boolean(record.checkIn || record.checkOut);
        const hasPhysicalStatus = ['Present', 'Full Day', 'Half Day'].includes(record.status);
        if (!hasPunch && !hasPhysicalStatus) return false;
      }
    }

    // 3. Day Type Filter
    const effectiveDayType = dayType || (timeStatus === 'Weekly Off' ? 'weekly_off' : null);
    if (effectiveDayType) {
      if (effectiveDayType === 'working_day' || effectiveDayType === 'Working Day') {
        if (record.isWeeklyOff || record.isHoliday || record.dayType === 'Weekly Off' || record.dayType === 'Holiday') {
          return false;
        }
      } else if (effectiveDayType === 'weekly_off' || effectiveDayType === 'Weekly Off') {
        if (!record.isWeeklyOff && record.dayType !== 'Weekly Off') return false;
      } else if (effectiveDayType === 'holiday' || effectiveDayType === 'Holiday') {
        if (!record.isHoliday && record.dayType !== 'Holiday') return false;
      }
    }

    // 4. Issue Filter
    let issueQuery = issue;
    if (!issueQuery && isLate === 'true') issueQuery = 'late';
    if (!issueQuery && timeStatus && !['WFH', 'Weekly Off', 'Leave'].includes(timeStatus)) {
      const legacyMap = {
        'On Track': 'on_track',
        'Late': 'late',
        'Missing Punch': 'missing_punch',
        'Short Time': 'short_hours',
        'Short Hours': 'short_hours',
        'Overtime': 'overtime',
        'Worked on Holiday': 'worked_non_working_day',
      };
      issueQuery = legacyMap[timeStatus] || timeStatus;
    }

    if (issueQuery) {
      if (issueQuery === 'late') {
        if (!record.issueFlags?.includes('late') && !record.isLate) return false;
      } else if (issueQuery === 'short_hours') {
        if (!record.issueFlags?.includes('short_hours')) return false;
      } else if (issueQuery === 'missing_punch') {
        if (!record.issueFlags?.includes('missing_punch') && !record.hasMissingPunch) return false;
      } else if (issueQuery === 'overtime') {
        if (!record.issueFlags?.includes('overtime')) return false;
      } else if (issueQuery === 'worked_non_working_day') {
        if (!record.issueFlags?.includes('worked_non_working_day')) return false;
      } else if (issueQuery === 'on_track') {
        if (!record.issueFlags?.includes('on_track')) return false;
      } else if (issueQuery === 'conflict' || issueQuery === 'Conflict') {
        if (!record.issueFlags?.includes('conflict') && record.status !== 'conflict' && !record.isConflict) return false;
      } else if (issueQuery === 'not_marked' || issueQuery === 'Not Marked') {
        if (!record.issueFlags?.includes('not_marked') && record.status !== 'not_marked' && record.primaryStatus !== 'not_marked' && !(record.status === 'Absent' && !record.checkIn && !record.checkOut)) return false;
      } else if (issueQuery === 'partial_leave_missing_attendance' || issueQuery === 'partial_leave_missing' || issueQuery === 'Partial Leave Exception' || issueQuery === 'Partial Leave Exceptions') {
        if (!record.issueFlags?.includes('partial_leave_missing_attendance') && record.status !== 'partial_leave_missing_attendance' && record.primaryStatus !== 'partial_leave_missing_attendance') return false;
      }
    }

    return true;
  });
}

function sortCalculatedRecords(records, sortBy = 'date', sortDir = 'desc') {
  const dir = sortDir === 'asc' ? 1 : -1;
  const checkInTime = (record) => record.checkIn ? new Date(record.checkIn).getTime() : null;
  const compareFallback = (a, b) => {
    if (a.date !== b.date) return a.date > b.date ? 1 : -1;
    const an = a.employeeId?.name || '';
    const bn = b.employeeId?.name || '';
    return an.localeCompare(bn);
  };
  if (sortBy === 'lateCheckIn') {
    return [...records].sort((a, b) => {
      if (a.isLate !== b.isLate) return a.isLate ? -1 : 1;
      if (!a.isLate && !b.isLate) return compareFallback(a, b);
      const av = checkInTime(a);
      const bv = checkInTime(b);
      if (av === bv) return compareFallback(a, b);
      if (av === null) return 1;
      if (bv === null) return -1;
      return av > bv ? dir : -dir;
    });
  }
  const fieldMap = {
    date: r => r.date,
    workingHours: r => r.workedHours,
    workedHours: r => r.workedHours,
    shortHours: r => r.hasMissingPunch || r.timeStatus === 'Missing Punch' ? -1 : r.shortHours,
    overtimeHours: r => r.overtimeHours,
  };
  const getter = fieldMap[sortBy] || fieldMap.date;
  return [...records].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
}

module.exports = {
  buildAttendanceContext,
  calculateAttendanceRecord,
  filterCalculatedRecords,
  sortCalculatedRecords,
  isWeeklyOff,
};
