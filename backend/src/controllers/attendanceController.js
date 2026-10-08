const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Settings = require('../models/Settings');
const Leave = require('../models/Leave');
const User = require('../models/User');
const { computeWorkingHours, classifyStatus, isLateCheckIn } = require('../services/attendanceService');
const {
  buildAttendanceContext,
  calculateAttendanceRecord,
  filterCalculatedRecords,
  sortCalculatedRecords,
} = require('../services/attendancePolicyService');

const todayStr = () => new Date().toISOString().slice(0, 10);
const isWfhLeave = (leave) => {
  const code = `${leave?.leaveTypeCode || ''} ${leave?.leaveType || ''}`
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return code.includes('WFH') || code.includes('WORKFROMHOME');
};

async function resolveLastAttendanceImportDate(settings) {
  if (settings.lastAttendanceImportDate) return settings.lastAttendanceImportDate;
  const latestImportedRecord = await Attendance.findOne({ source: 'biometric' }).sort({ date: -1 }).select('date').lean();
  if (!latestImportedRecord?.date) return '';
  settings.lastAttendanceImportDate = latestImportedRecord.date;
  settings.lastAttendanceImportedAt = settings.lastAttendanceImportedAt || new Date();
  await settings.save();
  return settings.lastAttendanceImportDate;
}

exports.checkIn = async (req, res, next) => {
  try {
    const date = todayStr();
    const existing = await Attendance.findOne({ employeeId: req.user._id, date });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Already checked in today' });
    }
    const settings = await Settings.getGlobal();
    const now = new Date();
    const late = isLateCheckIn(now, settings.lateThreshold);
    const record = await Attendance.create({
      employeeId: req.user._id,
      date,
      checkIn: now,
      isLate: late,
      ipAddress: req.ip,
      deviceInfo: req.headers['user-agent'] || 'unknown',
    });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

exports.checkOut = async (req, res, next) => {
  try {
    const date = todayStr();
    const record = await Attendance.findOne({ employeeId: req.user._id, date });
    if (!record || !record.checkIn) {
      return res.status(400).json({ success: false, message: 'No check-in found for today' });
    }
    if (record.checkOut) {
      return res.status(409).json({ success: false, message: 'Already checked out today' });
    }
    const now = new Date();
    if (now < record.checkIn) {
      return res.status(400).json({ success: false, message: 'Check-out time is before check-in time' });
    }
    const hours = computeWorkingHours(record.checkIn, now);
    record.checkOut = now;
    record.workingHours = parseFloat(hours.toFixed(2));
    record.status = classifyStatus(hours);
    await record.save();
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

exports.getMyAttendance = async (req, res, next) => {
  try {
    const filter = { employeeId: req.user._id };
    const settings = await Settings.getGlobal();
    const lastAttendanceImportDate = await resolveLastAttendanceImportDate(settings);
    const isValidDateStr = (str) => {
      if (!str || typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
      const d = new Date(`${str}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
    };
    const rawStartDate = isValidDateStr(req.query.startDate) ? req.query.startDate : null;
    const rawEndDate = isValidDateStr(req.query.endDate) ? req.query.endDate : null;

    const requestedEndDate = rawEndDate || todayStr();
    const effectiveEndDate = lastAttendanceImportDate && requestedEndDate > lastAttendanceImportDate
      ? lastAttendanceImportDate
      : requestedEndDate;
    const calculatedFilter = {};
    if (req.query.status) calculatedFilter.status = req.query.status;
    if (req.query.workMode) calculatedFilter.workMode = req.query.workMode;
    if (req.query.issue) calculatedFilter.issue = req.query.issue;
    if (req.query.timeStatus) calculatedFilter.timeStatus = req.query.timeStatus;
    if (req.query.dayType) calculatedFilter.dayType = req.query.dayType;
    if (req.query.isLate === 'true') calculatedFilter.isLate = 'true';
    if (rawStartDate || rawEndDate) {
      filter.date = {};
      if (rawStartDate) filter.date.$gte = rawStartDate;
      if (effectiveEndDate) filter.date.$lte = effectiveEndDate;
    }
    const isInvalidBiometricQuery = Boolean(filter.date && filter.date.$gte && filter.date.$lte && filter.date.$gte > filter.date.$lte);
    const records = isInvalidBiometricQuery
      ? []
      : await Attendance.find(filter).populate('employeeId', '-password').lean();

    const rangeStart = rawStartDate || (records.length > 0 ? records.map(r => r.date).sort()[0] : (todayStr().slice(0, 7) + '-01'));
    const rangeEnd = requestedEndDate;
    const context = await buildAttendanceContext(rangeStart, rangeEnd);
    const existingDates = new Set(records.map(r => r.date));
    const leaveOnlyRecords = [];
    for (const [key, leaves] of context.leaveMap.entries()) {
      const [employeeId, date] = key.split(':');
      if (String(employeeId) !== String(req.user._id) || existingDates.has(date)) continue;
      leaveOnlyRecords.push({
        _id: `leave-${date}`,
        employeeId: req.user,
        date,
        checkIn: null,
        checkOut: null,
        workingHours: 0,
        status: 'On Leave',
        isLate: false,
        source: 'leave',
      });
    }
    const sourceRecords = [...records, ...leaveOnlyRecords];
    const sortDir = req.query.sortDir || 'desc';
    const calculated = sortCalculatedRecords(
      filterCalculatedRecords(sourceRecords.map(r => calculateAttendanceRecord(r, context)), calculatedFilter),
      req.query.sortBy || 'date',
      sortDir
    );
    res.json({
      success: true,
      data: calculated,
      meta: {
        lastAttendanceImportDate: lastAttendanceImportDate || null,
        lastAttendanceImportedAt: settings.lastAttendanceImportedAt || null,
        requestedEndDate,
        effectiveEndDate,
      },
    });
  } catch (err) {
    console.error('getMyAttendance error:', err);
    next(err);
  }
};

exports.assignWfh = async (req, res, next) => {
  try {
    const { employeeId, reason } = req.body;
    const startDate = String(req.body.startDate || req.body.date || todayStr());
    const endDate = String(req.body.endDate || req.body.date || startDate);
    const isValidDate = (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return /^\d{4}-\d{2}-\d{2}$/.test(value)
        && !Number.isNaN(parsed.getTime())
        && parsed.toISOString().slice(0, 10) === value;
    };
    const trimmedReason = String(reason || '').trim();
    if (!User.db.base.Types.ObjectId.isValid(employeeId) || !isValidDate(startDate) || !isValidDate(endDate) || !trimmedReason || trimmedReason.length > 500) {
      return res.status(400).json({ success: false, message: 'Employee, valid from/to dates, and reason are required' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: 'To date cannot be before from date' });
    }
    const employee = await User.findOne({ _id: employeeId, status: 'Active' }).select('_id name employeeId teamLeadId department');
    if (!employee) return res.status(404).json({ success: false, message: 'Active employee not found' });
    const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');
    const workforceScope = await resolveAuthorizedWorkforceScope(req.user);
    if (!workforceScope.isUnrestricted) {
      const allowedStrs = (workforceScope.authorizedEmployeeIds || []).map(id => String(id));
      if (!allowedStrs.includes(String(employee._id))) {
        return res.status(403).json({ success: false, message: 'Team leaders can assign WFH only to their managed team members' });
      }
    }
    const dates = [];
    for (
      let day = new Date(`${startDate}T00:00:00.000Z`);
      day <= new Date(`${endDate}T00:00:00.000Z`);
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      dates.push(day.toISOString().slice(0, 10));
    }
    if (dates.length > 366) {
      return res.status(400).json({ success: false, message: 'WFH date range cannot exceed 366 days' });
    }
    await Attendance.bulkWrite(
      dates.map(date => ({
        updateOne: {
          filter: { employeeId: employee._id, date },
          update: {
            $set: {
              workMode: 'wfh',
              wfhReason: trimmedReason,
              wfhAssignedBy: req.user._id,
              status: 'Present',
              isLate: false,
            },
            $setOnInsert: { employeeId: employee._id, date, source: 'manual' },
          },
          upsert: true,
        },
      })),
      { ordered: true }
    );
    const records = await Attendance.find({ employeeId: employee._id, date: { $in: dates } })
      .populate('employeeId', '-password')
      .populate('wfhAssignedBy', 'name employeeId')
      .sort({ date: 1 });
    const dateLabel = startDate === endDate ? `on ${startDate}` : `from ${startDate} to ${endDate}`;
    res.status(201).json({
      success: true,
      message: `WFH added for ${employee.name} ${dateLabel}`,
      data: records,
      count: records.length,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'This attendance record cannot be deleted.' });
    }
    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    await Attendance.findByIdAndDelete(id);
    res.json({ success: true, message: 'Attendance record deleted' });
  } catch (err) {
    next(err);
  }
};

exports.getAllAttendance = async (req, res, next) => {
  try {
    const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const filter = {};

    const workforceScope = await resolveAuthorizedWorkforceScope(req.user);
    let scopedEmployeeIds = null;

    if (!workforceScope.isUnrestricted) {
      scopedEmployeeIds = (workforceScope.authorizedEmployeeIds || []).map(id => String(id));
      filter.employeeId = { $in: scopedEmployeeIds };
    }

    if (req.query.employeeId) {
      const requestedId = String(req.query.employeeId);
      if (scopedEmployeeIds) {
        if (scopedEmployeeIds.includes(requestedId)) {
          filter.employeeId = requestedId;
        } else {
          filter.employeeId = { $in: [] };
        }
      } else {
        filter.employeeId = requestedId;
      }
    }
    const validStatus = ['', 'present', 'half_day', 'absent', 'on_leave', 'Present', 'Full Day', 'Half Day', 'Absent', 'On Leave'];
    const validWorkMode = ['', 'office', 'wfh'];
    const validIssue = ['', 'on_track', 'late', 'short_hours', 'missing_punch', 'overtime', 'worked_non_working_day', 'conflict', 'not_marked', 'partial_leave_missing_attendance', 'On Track', 'Late', 'Missing Punch', 'Short Time', 'Short Hours', 'Overtime', 'Worked on Holiday', 'Conflict', 'Not Marked', 'Partial Leave Exception', 'Partial Leave Exceptions'];
    const validDayType = ['', 'working_day', 'weekly_off', 'holiday', 'Working Day', 'Weekly Off', 'Holiday'];

    if (req.query.status && !validStatus.includes(req.query.status)) {
      return res.status(400).json({ success: false, message: `Invalid status filter parameter: ${req.query.status}` });
    }
    if (req.query.workMode && !validWorkMode.includes(req.query.workMode)) {
      return res.status(400).json({ success: false, message: `Invalid workMode filter parameter: ${req.query.workMode}` });
    }
    if (req.query.issue && !validIssue.includes(req.query.issue)) {
      return res.status(400).json({ success: false, message: `Invalid issue filter parameter: ${req.query.issue}` });
    }
    if (req.query.dayType && !validDayType.includes(req.query.dayType)) {
      return res.status(400).json({ success: false, message: `Invalid dayType filter parameter: ${req.query.dayType}` });
    }

    const calculatedFilter = {};
    if (req.query.status) calculatedFilter.status = req.query.status;
    if (req.query.workMode) calculatedFilter.workMode = req.query.workMode;
    if (req.query.issue) calculatedFilter.issue = req.query.issue;
    if (req.query.timeStatus) calculatedFilter.timeStatus = req.query.timeStatus;
    if (req.query.dayType) calculatedFilter.dayType = req.query.dayType;
    if (req.query.isLate === 'true') calculatedFilter.isLate = 'true';
    if (req.query.date) filter.date = req.query.date;
    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) filter.date.$gte = req.query.startDate;
      if (req.query.endDate) filter.date.$lte = req.query.endDate;
    }
    if (req.query.department) {
      const empIds = await User.find({ department: { $regex: req.query.department, $options: 'i' }, status: 'Active' }).distinct('_id');
      const empIdStrs = empIds.map(id => String(id));
      const ids = scopedEmployeeIds ? empIdStrs.filter(id => scopedEmployeeIds.includes(id)) : empIdStrs;
      filter.employeeId = { $in: ids };
    } else if (req.query.activeOnly === 'true' && !req.query.employeeId) {
      const activeIds = await User.find({ status: 'Active' }).distinct('_id');
      const activeIdStrs = activeIds.map(id => String(id));
      const ids = scopedEmployeeIds ? activeIdStrs.filter(id => scopedEmployeeIds.includes(id)) : activeIdStrs;
      filter.employeeId = { $in: ids };
    }
    if (req.query.employeeName) {
      const search = req.query.employeeName;
      const empIds = await User.find({
        status: 'Active',
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { employeeId: { $regex: search, $options: 'i' } },
          { biometricId: { $regex: search, $options: 'i' } },
        ],
      }).distinct('_id');
      const empIdStrs = empIds.map(id => String(id));
      const ids = scopedEmployeeIds ? empIdStrs.filter(id => scopedEmployeeIds.includes(id)) : empIdStrs;
      filter.employeeId = { $in: ids };
    }
    const sortField = req.query.sortBy || 'date';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
    const records = await Attendance.find(filter)
      .populate('employeeId', '-password')
      .lean();
    const dates = records.map(r => r.date).sort();
    const context = await buildAttendanceContext(
      req.query.startDate || dates[0] || todayStr(),
      req.query.endDate || dates[dates.length - 1] || todayStr()
    );
    const existingKeys = new Set(records.map(r => `${r.employeeId?._id || r.employeeId}:${r.date}`));
    const permittedEmployeeIds = filter.employeeId
      ? new Set(
        (filter.employeeId.$in || [filter.employeeId])
          .map(id => String(id))
      )
      : null;
    const wfhLeaveDays = [];
    const wfhEmployeeIds = new Set();
    for (const [key, leaves] of context.leaveMap.entries()) {
      const separator = key.lastIndexOf(':');
      const employeeId = key.slice(0, separator);
      const date = key.slice(separator + 1);
      if (permittedEmployeeIds && !permittedEmployeeIds.has(employeeId)) continue;
      const approvedWfh = leaves.find(leave => leave.status === 'Approved' && isWfhLeave(leave));
      if (!approvedWfh || existingKeys.has(`${employeeId}:${date}`)) continue;
      wfhLeaveDays.push({ employeeId, date, leave: approvedWfh });
      wfhEmployeeIds.add(employeeId);
    }
    const wfhEmployees = await User.find({
      _id: { $in: [...wfhEmployeeIds] },
      status: 'Active',
    }).select('-password').lean();
    const wfhEmployeeMap = new Map(wfhEmployees.map(employee => [String(employee._id), employee]));
    const wfhLeaveRecords = wfhLeaveDays
      .filter(item => wfhEmployeeMap.has(item.employeeId))
      .map(item => ({
        _id: `wfh-${item.leave._id}-${item.date}`,
        employeeId: wfhEmployeeMap.get(item.employeeId),
        date: item.date,
        checkIn: null,
        checkOut: null,
        workingHours: 0,
        status: 'Present',
        isLate: false,
        source: 'wfh_leave',
        workMode: 'wfh',
        wfhReason: item.leave.reason || '',
        wfhAssignedBy: item.leave.approvedBy || null,
      }));
    const notMarkedRecords = [];
    if (calculatedFilter.issue === 'not_marked' || calculatedFilter.issue === 'Not Marked') {
      const { buildEvaluationContext, classifyEmployeeDate } = require('../services/attendanceEvaluationService');
      const evalStartDate = req.query.startDate || (dates[0] ? dates[0] : todayStr());
      const evalEndDate = req.query.endDate || (dates[dates.length - 1] ? dates[dates.length - 1] : todayStr());

      let userQueryFilter = {};
      if (permittedEmployeeIds) {
        userQueryFilter._id = { $in: Array.from(permittedEmployeeIds) };
      }

      const evalContext = await buildEvaluationContext(evalStartDate, evalEndDate, userQueryFilter);

      for (const user of evalContext.users) {
        for (const d of evalContext.allDays) {
          if (existingKeys.has(`${user._id || user}:${d}`)) continue;
          const cls = classifyEmployeeDate(user, d, evalContext);
          if (cls.primaryStatus === 'not_marked') {
            notMarkedRecords.push({
              _id: `not_marked-${user._id}-${d}`,
              employeeId: user,
              date: d,
              checkIn: null,
              checkOut: null,
              workingHours: 0,
              workedHours: 0,
              requiredHours: 9,
              status: 'Absent',
              isLate: false,
              source: 'calculated_unaccounted',
              workMode: 'office',
              dayType: 'Working Day',
              timeStatus: 'Not Marked',
              issueFlags: ['not_marked'],
              primaryStatus: 'not_marked',
            });
          }
        }
      }
    }
    const partialLeaveMissingRecords = [];
    if (calculatedFilter.issue === 'partial_leave_missing_attendance' || calculatedFilter.issue === 'Partial Leave Exception' || calculatedFilter.issue === 'Partial Leave Exceptions') {
      const { buildEvaluationContext, classifyEmployeeDate } = require('../services/attendanceEvaluationService');
      const evalStartDate = req.query.startDate || (dates[0] ? dates[0] : todayStr());
      const evalEndDate = req.query.endDate || (dates[dates.length - 1] ? dates[dates.length - 1] : todayStr());

      let userQueryFilter = {};
      if (permittedEmployeeIds) {
        userQueryFilter._id = { $in: Array.from(permittedEmployeeIds) };
      }

      const evalContext = await buildEvaluationContext(evalStartDate, evalEndDate, userQueryFilter);

      for (const user of evalContext.users) {
        for (const d of evalContext.allDays) {
          if (existingKeys.has(`${user._id || user}:${d}`)) continue;
          const cls = classifyEmployeeDate(user, d, evalContext);
          if (cls.primaryStatus === 'partial_leave_missing_attendance') {
            partialLeaveMissingRecords.push({
              _id: `partial_leave_missing-${user._id}-${d}`,
              employeeId: user,
              date: d,
              checkIn: null,
              checkOut: null,
              workingHours: 0,
              workedHours: 0,
              requiredHours: 4.5,
              status: 'On Leave',
              isLate: false,
              source: 'calculated_partial_leave_missing',
              workMode: 'office',
              dayType: 'Half Day Leave',
              timeStatus: 'Partial Leave Exception',
              issueFlags: ['partial_leave_missing_attendance'],
              primaryStatus: 'partial_leave_missing_attendance',
            });
          }
        }
      }
    }
    const sourceRecords = [...records, ...wfhLeaveRecords, ...notMarkedRecords, ...partialLeaveMissingRecords];
    const calculated = sortCalculatedRecords(
      filterCalculatedRecords(sourceRecords.map(r => calculateAttendanceRecord(r, context)), calculatedFilter),
      sortField,
      sortDir
    );
    const total = calculated.length;
    const paged = calculated.slice((page - 1) * limit, page * limit);
    res.json({
      success: true,
      data: paged,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

function getTodayIST() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

exports.getDashboard = async (req, res, next) => {
  try {
    const { buildEvaluationContext, classifyEmployeeDate, aggregateDepartmentMetrics } = require('../services/attendanceEvaluationService');
    const { isWeeklyOff } = require('../services/attendancePolicyService');
    const { getTodayBusinessDate, formatBusinessDate } = require('../utils/businessDateUtils');
    const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');
    const dateStr = getTodayBusinessDate();
    const EXCLUDED_ROLES = ['superadmin', 'admin', 'Administrator', 'administrator'];

    // Resolve Centralized Authorized Scope
    const workforceScope = await resolveAuthorizedWorkforceScope(req.user);
    const scopeUserQueryFilter = { role: { $nin: EXCLUDED_ROLES } };

    if (!workforceScope.isUnrestricted) {
      scopeUserQueryFilter._id = { $in: workforceScope.authorizedEmployeeIds || [] };
    }

    // 1. Live Current HR Status for Today (100% independent of biometric log availability)
    const todayEvalContext = await buildEvaluationContext(dateStr, dateStr, scopeUserQueryFilter);
    const isHoliday = todayEvalContext.holidayMap.has(dateStr);
    const isWkOff = isWeeklyOff(dateStr, todayEvalContext.settings);
    const isNonWorkingDay = !(!isHoliday && !isWkOff);
    const dayReason = isHoliday ? (todayEvalContext.holidayMap.get(dateStr)?.title || 'Holiday') : (isWkOff ? 'Weekend Off' : null);

    const eligibleUsersToday = todayEvalContext.users.filter((user) => {
      if (!user.joiningDate) return true;
      const joinStr = formatBusinessDate(user.joiningDate);
      return joinStr <= dateStr;
    });

    let liveOnLeaveToday = 0;
    let liveWfhToday = 0;

    eligibleUsersToday.forEach((user) => {
      const result = classifyEmployeeDate(user, dateStr, todayEvalContext);
      if (result.primaryStatus === 'matched_leave') liveOnLeaveToday += 1;
      if (result.primaryStatus === 'matched_wfh') liveWfhToday += 1;
    });

    const totalEmployees = eligibleUsersToday.length;

    // 2. Resolve Biometric Attendance Coverage & Fallback Period
    const settings = await Settings.getGlobal();
    let latestBiometricDate = settings.lastAttendanceImportDate || '';

    if (!latestBiometricDate) {
      const latestBiometricRecord = await Attendance.findOne({ source: 'biometric' }).sort({ date: -1 }).select('date').lean();
      if (latestBiometricRecord?.date) {
        latestBiometricDate = latestBiometricRecord.date;
        settings.lastAttendanceImportDate = latestBiometricDate;
        settings.lastAttendanceImportedAt = settings.lastAttendanceImportedAt || new Date();
        await settings.save();
      }
    }

    const currentMonthStr = dateStr.slice(0, 7); // e.g., "2026-09"
    const latestMonthStr = latestBiometricDate ? latestBiometricDate.slice(0, 7) : null;
    const isCurrentMonthCovered = (latestMonthStr === currentMonthStr);

    let period = null;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    if (!latestBiometricDate) {
      period = {
        hasBiometricData: false,
        periodLabel: 'No Biometric Data Uploaded Yet',
        startDate: null,
        endDate: null,
        isCurrentMonthCovered: false,
        latestBiometricDate: null,
        noticeMessage: 'No biometric attendance data has been uploaded yet.',
      };
    } else if (isCurrentMonthCovered) {
      const [y, m] = currentMonthStr.split('-').map(Number);
      const periodLabel = `${months[m - 1]} ${y}`;
      period = {
        hasBiometricData: true,
        periodLabel,
        startDate: `${currentMonthStr}-01`,
        endDate: latestBiometricDate,
        isCurrentMonthCovered: true,
        latestBiometricDate,
        noticeMessage: null,
      };
    } else {
      // Current month biometric records missing -> fallback to latest biometric month (e.g. August 2026)
      const [y, m] = latestMonthStr.split('-').map(Number);
      const monthName = months[m - 1];
      const periodLabel = `${monthName} ${y}`;
      const startDate = `${latestMonthStr}-01`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const monthEndStr = `${latestMonthStr}-${String(lastDay).padStart(2, '0')}`;
      const endDate = latestBiometricDate > monthEndStr ? latestBiometricDate : monthEndStr;

      const currentMonthName = months[Number(currentMonthStr.split('-')[1]) - 1];
      period = {
        hasBiometricData: true,
        periodLabel,
        startDate,
        endDate,
        isCurrentMonthCovered: false,
        latestBiometricDate,
        noticeMessage: `${currentMonthName} biometric attendance is not available yet. Showing attendance data for ${periodLabel}.`,
      };
    }

    // 3. Evaluate Period Metrics for Attendance Overview & Needs Attention (if biometric data exists)
    let periodSummary = null;
    let periodMissingPunches = 0;
    let periodConflicts = 0;
    let periodPartialLeaveMissing = 0;
    let periodShortLeaveMissing = 0;
    let periodBiometricMismatch = 0;

    if (period.hasBiometricData && period.startDate && period.endDate) {
      const periodEvalContext = await buildEvaluationContext(period.startDate, period.endDate, scopeUserQueryFilter);
      periodSummary = aggregateDepartmentMetrics('all', period.startDate, period.endDate, periodEvalContext);

      // Compute specific issue counts for period Needs Attention
      periodSummary.empComparison.forEach(emp => {
        periodMissingPunches += (emp.statusCounts.incomplete_punch || 0);
        periodConflicts += (emp.statusCounts.conflict || 0);
        periodPartialLeaveMissing += (emp.statusCounts.partial_leave_missing_attendance || 0);
        periodShortLeaveMissing += (emp.statusCounts.short_leave_missing_attendance || 0);
        periodBiometricMismatch += (emp.statusCounts.portal_biometric_mismatch || 0);
      });
    }

    // Pending Leaves Count & Recent List (Live Current-Day)
    const pendingLeaveFilter = { status: 'Pending' };
    if (!workforceScope.isUnrestricted) {
      const Department = require('../models/Department');
      const deptNames = workforceScope.managedDepartments || [];
      const leaveTeamMembers = await User.find({
        $or: [
          ...(deptNames.length ? [{ department: { $in: deptNames }, role: 'employee' }] : []),
          { teamLeadId: req.user._id },
        ],
      }).distinct('_id');
      pendingLeaveFilter.employeeId = { $in: leaveTeamMembers };
    }

    const recentPendingLeaves = await Leave.find(pendingLeaveFilter)
      .populate('employeeId', '-password')
      .sort({ appliedAt: -1 })
      .limit(6)
      .lean();
    const pendingLeaveTotalCount = await Leave.countDocuments(pendingLeaveFilter);

    const attendanceIssuesCount = periodSummary ? periodSummary.summary.totalActionRequired : 0;
    const unaccountedDates = periodSummary ? periodSummary.summary.totalUnaccounted : 0;

    const needsAttention = {
      pendingLeaves: pendingLeaveTotalCount,
      missingPunches: periodMissingPunches,
      unaccountedDates: unaccountedDates,
      attendanceConflicts: periodConflicts,
      partialLeaveExceptions: periodPartialLeaveMissing,
      shortLeaveExceptions: periodShortLeaveMissing,
      biometricMismatches: periodBiometricMismatch,
      periodLabel: period.periodLabel,
    };

    const attendanceOverview = periodSummary ? {
      periodLabel: period.periodLabel,
      startDate: period.startDate,
      endDate: period.endDate,
      workingDays: periodSummary.summary.workingDays,
      totalExpectedDays: periodSummary.summary.totalExpectedDays,
      attendanceRate: periodSummary.summary.avgWeightedAttendanceRate,
      presentDays: periodSummary.summary.totalFullPresent,
      wfhDays: periodSummary.summary.totalWfh,
      halfDays: periodSummary.summary.totalHalfAttendance,
      approvedLeaveDays: periodSummary.summary.totalLeaveDays,
      explicitAbsentDays: periodSummary.summary.totalExplicitAbsent,
      unaccountedDays: periodSummary.summary.totalUnaccounted,
      attendanceIssuesCount: periodSummary.summary.totalActionRequired,
    } : null;

    const todaysAttendance = periodSummary ? {
      matched_present: periodSummary.summary.totalFullPresent - periodSummary.summary.totalWfh,
      matched_wfh: periodSummary.summary.totalWfh,
      matched_partial_covered: periodSummary.summary.totalHalfAttendance,
      matched_leave: periodSummary.summary.totalLeaveDays,
      matched_absent: periodSummary.summary.totalExplicitAbsent,
      not_marked: periodSummary.summary.totalUnaccounted,
      incomplete_punch: periodMissingPunches,
      conflict: periodConflicts,
      portal_biometric_mismatch: periodBiometricMismatch,
      partial_leave_missing_attendance: periodPartialLeaveMissing,
      short_leave_missing_attendance: periodShortLeaveMissing,
      pending_leave: 0,
      sumPrimaryCategories: periodSummary.summary.totalExpectedDays,
    } : {
      matched_present: 0, matched_wfh: 0, matched_partial_covered: 0, matched_leave: 0,
      matched_absent: 0, not_marked: 0, incomplete_punch: 0, conflict: 0,
      portal_biometric_mismatch: 0, partial_leave_missing_attendance: 0,
      short_leave_missing_attendance: 0, pending_leave: 0, sumPrimaryCategories: 0,
    };

    const kpis = {
      totalEmployees,
      presentToday: 0, // 0 for Today because September biometric data is not uploaded
      wfhCount: liveWfhToday,
      halfDayCount: periodSummary ? periodSummary.summary.totalHalfAttendance : 0,
      onLeaveToday: liveOnLeaveToday,
      absentToday: 0,
      attendanceIssuesCount,
    };

    res.json({
      success: true,
      data: {
        date: dateStr,
        isNonWorkingDay,
        dayReason,
        dataCoverage: period,
        workforceScope: {
          isUnrestricted: workforceScope.isUnrestricted,
          managedDepartments: workforceScope.managedDepartments,
        },
        liveHrStatus: {
          totalEmployees,
          onLeaveToday: liveOnLeaveToday,
          wfhToday: liveWfhToday,
          pendingLeaveTotalCount,
        },
        attendanceOverview,
        kpis,
        needsAttention,
        todaysAttendance,
        recentPendingLeaves,
        // Legacy fields for backwards compatibility
        totalEmployees,
        presentCount: 0,
        absentCount: 0,
        lateCount: periodMissingPunches,
        onLeaveCount: liveOnLeaveToday,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getMyDashboardSummary = async (req, res, next) => {
  try {
    const employeeId = req.user._id;
    const { getTodayBusinessDate, formatBusinessDate } = require('../utils/businessDateUtils');
    const { buildEvaluationContext, classifyEmployeeDate } = require('../services/attendanceEvaluationService');
    const { normalizeCode } = require('../services/leaveBalanceService');
    const Settings = require('../models/Settings');
    const Leave = require('../models/Leave');
    const Attendance = require('../models/Attendance');
    const Policy = require('../models/Policy');
    const PolicyAcceptance = require('../models/PolicyAcceptance');

    const dateStr = getTodayBusinessDate();
    const currentYear = parseInt(dateStr.slice(0, 4));
    const currentMonth = dateStr.slice(0, 7);

    // 1. Resolve Biometric Coverage Date (for historical attendance checks only)
    const settings = await Settings.getGlobal();
    let lastAttendanceImportDate = settings.lastAttendanceImportDate || '';
    if (!lastAttendanceImportDate) {
      const latestBiometricRecord = await Attendance.findOne({ source: 'biometric' }).sort({ date: -1 }).select('date').lean();
      if (latestBiometricRecord?.date) {
        lastAttendanceImportDate = latestBiometricRecord.date;
      }
    }

    const formatReadableDate = (rawDateStr) => {
      if (!rawDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) return rawDateStr || '';
      const [y, m, d] = rawDateStr.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d));
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(dateObj);
    };
    const formattedCoverageDate = formatReadableDate(lastAttendanceImportDate);

    // 2. Fetch Approved Requests covering Today
    const startOfToday = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${dateStr}T23:59:59.999Z`);
    const approvedLeavesToday = await Leave.find({
      employeeId,
      status: 'Approved',
      startDate: { $lte: endOfToday },
      endDate: { $gte: startOfToday },
    }).lean();

    const fullDayLeave = approvedLeavesToday.find(l => l.durationType === 'full_day' && !isWfhLeave(l));
    const fullDayWfh = approvedLeavesToday.find(l => l.durationType === 'full_day' && isWfhLeave(l));
    const partialLeave = approvedLeavesToday.find(l => l.durationType === 'half_day' || l.durationType === 'hourly');

    // Determine Today's Work Status using independent HR data sources
    let todayWorkStatus = {
      primaryStatus: 'working_day',
      title: 'Regular Working Day',
      subtitle: 'No approved leave or WFH today',
      badgeColor: 'blue',
    };

    if (fullDayLeave) {
      todayWorkStatus = {
        primaryStatus: 'on_leave',
        title: 'On Leave',
        subtitle: `${fullDayLeave.leaveType || 'Approved Leave'} · Full Day`,
        badgeColor: 'purple',
      };
    } else if (fullDayWfh) {
      todayWorkStatus = {
        primaryStatus: 'wfh',
        title: 'Work From Home',
        subtitle: 'Approved for today',
        badgeColor: 'blue',
      };
    } else if (partialLeave) {
      if (partialLeave.durationType === 'half_day') {
        const period = partialLeave.halfDayPeriod ? ` (${partialLeave.halfDayPeriod})` : '';
        todayWorkStatus = {
          primaryStatus: 'half_day_leave',
          title: 'Half Day Leave',
          subtitle: `Half Day Leave approved${period}`,
          badgeColor: 'purple',
        };
      } else if (partialLeave.durationType === 'hourly') {
        const timeRange = partialLeave.startTime && partialLeave.endTime ? `${partialLeave.startTime}–${partialLeave.endTime}` : '';
        todayWorkStatus = {
          primaryStatus: 'working_day',
          title: 'Regular Working Day',
          subtitle: `Short Leave approved${timeRange ? ` · ${timeRange}` : ''}`,
          badgeColor: 'blue',
        };
      }
    }

    // 3. Calculate Operational KPIs
    const { getBalanceForUser } = require('../services/leaveBalanceService');
    const userBalances = await getBalanceForUser(req.user);
    const clBal = userBalances.find(b => b.code === 'CL');
    const plBal = userBalances.find(b => b.code === 'PRIV' || b.code === 'PL');
    const mlBal = userBalances.find(b => b.code === 'ML');
    const clRemaining = clBal ? (clBal.remaining != null ? clBal.remaining : 0) : 0;
    const plRemaining = plBal ? (plBal.remaining != null ? plBal.remaining : 0) : 0;
    const mlRemaining = mlBal ? (mlBal.remaining != null ? mlBal.remaining : 0) : 0;
    const leaveBalanceSummary = `${clRemaining} CL  |  ${plRemaining} PL  |  ${mlRemaining} ML`;

    const yearStart = new Date(`${currentYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${currentYear}-12-31T23:59:59.999Z`);
    const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);

    const yearLeaves = await Leave.find({
      employeeId,
      startDate: { $gte: yearStart, $lte: yearEnd },
    }).lean();

    const awaitingApproval = yearLeaves.filter(l => l.status === 'Pending').length;
    const approvedLeaves = yearLeaves.filter(l => {
      if (l.status !== 'Approved') return false;
      const code = normalizeCode(l.leaveTypeCode);
      return ['CL', 'PRIV', 'ML', 'PL'].includes(code);
    }).length;

    const approvedThisMonth = yearLeaves.filter(l => l.status === 'Approved' && new Date(l.startDate) >= monthStart);
    const shortLeaveThisMonth = approvedThisMonth.filter(l => normalizeCode(l.leaveTypeCode) === 'SL').length;
    const wfhThisMonth = approvedThisMonth
      .filter(l => normalizeCode(l.leaveTypeCode) === 'WFH')
      .reduce((sum, l) => sum + (l.durationType === 'half_day' ? 0.5 : (l.totalDays || 1)), 0);

    // 4. Policy Acknowledgement Status
    const activePolicies = await Policy.find({ isActive: { $ne: false } }).lean();
    const userRole = req.user.role;
    const visiblePolicies = activePolicies.filter(p => {
      if (!p.visibleToRoles || p.visibleToRoles.length === 0) return true;
      return p.visibleToRoles.includes(userRole);
    });

    const userAcceptances = await PolicyAcceptance.find({ userId: employeeId }).lean();
    const acceptanceMap = new Map();
    userAcceptances.forEach(a => {
      const key = String(a.policyId);
      const existing = acceptanceMap.get(key);
      if (!existing || a.policyVersion > existing.policyVersion) {
        acceptanceMap.set(key, a);
      }
    });

    const pendingPolicies = visiblePolicies.filter(policy => {
      const requiresAccept = policy.requiresAcceptance !== false;
      if (!requiresAccept) return false;
      const version = policy.version || 1;
      const acc = acceptanceMap.get(String(policy._id));
      return !acc || acc.policyVersion < version;
    });

    // 5. Actionable Needs Your Attention Items ONLY (Excludes own pending requests)
    const needsAttention = [];

    if (pendingPolicies.length > 0) {
      needsAttention.push({
        id: 'pending_policy',
        type: 'policy',
        title: `${pendingPolicies.length} company policy(ies) require your acknowledgement`,
        subtitle: 'Please review and accept mandatory policies',
        link: '/employee/policy',
        actionLabel: 'Review now',
      });
    }

    if (lastAttendanceImportDate) {
      const missingPunchRecords = await Attendance.find({
        employeeId,
        date: { $lte: lastAttendanceImportDate, $gte: `${currentYear}-01-01` },
        checkIn: { $ne: null },
        checkOut: null,
        workMode: { $ne: 'wfh' },
      }).lean();

      const approvedLeaveDates = new Set(
        yearLeaves
          .filter(l => l.status === 'Approved' && l.durationType === 'full_day')
          .flatMap(l => {
            const dates = [];
            let cur = new Date(l.startDate);
            const end = new Date(l.endDate);
            while (cur <= end) {
              dates.push(formatBusinessDate(cur));
              cur.setDate(cur.getDate() + 1);
            }
            return dates;
          })
      );

      const actionableMissingPunches = missingPunchRecords.filter(r => !approvedLeaveDates.has(r.date));
      if (actionableMissingPunches.length > 0) {
        const count = actionableMissingPunches.length;
        const titleText = count === 1 ? '1 missing punch needs attention' : `${count} missing punches need attention`;
        const subtitleText = formattedCoverageDate ? `Attendance checked through ${formattedCoverageDate}` : 'In covered biometric period';

        const affectedDates = actionableMissingPunches.map(r => r.date).sort();
        const earliestDate = affectedDates[0];
        const rangeStartDate = `${earliestDate.slice(0, 7)}-01`;
        const rangeEndDate = lastAttendanceImportDate;

        needsAttention.push({
          id: 'missing_punch',
          type: 'missing_punch',
          title: titleText,
          subtitle: subtitleText,
          link: `/employee/attendance?issue=missing_punch&startDate=${rangeStartDate}&endDate=${rangeEndDate}`,
          actionLabel: count === 1 ? 'Review missing punch' : 'Review missing punches',
          count,
          issue: 'missing_punch',
          startDate: rangeStartDate,
          endDate: rangeEndDate,
        });
      }
    }

    res.json({
      success: true,
      data: {
        todayDate: dateStr,
        todayWorkStatus,
        kpis: {
          clRemaining,
          plRemaining,
          mlRemaining,
          leaveBalanceSummary,
          availableLeaveDays: clRemaining + plRemaining + mlRemaining,
          awaitingApproval,
          approvedLeaves,
          shortLeaveThisMonth,
          wfhThisMonth,
          attendanceUpdatedDate: formattedCoverageDate || 'No data yet',
        },
        needsAttention,
        policySummary: {
          totalPolicies: visiblePolicies.length,
          acceptedPoliciesCount: visiblePolicies.length - pendingPolicies.length,
          pendingPoliciesCount: pendingPolicies.length,
          allAccepted: pendingPolicies.length === 0 && visiblePolicies.length > 0,
        },
        biometricCoverage: {
          lastAttendanceImportDate: lastAttendanceImportDate || null,
          formattedCoverageDate,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
