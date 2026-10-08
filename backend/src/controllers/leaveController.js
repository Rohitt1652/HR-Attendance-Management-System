const Leave = require('../models/Leave');
const LeaveType = require('../models/LeaveType');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Department = require('../models/Department');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { getAttendanceWithWfh } = require('./reportController');
const notify = require('../utils/notify');
const { sendLeaveAppliedEmail, sendLeaveStatusEmail } = require('../services/emailService');
const { canModifyLeave, hasPermission } = require('../utils/accessControl');
const { fileUrlToAbsolutePath } = require('../utils/uploadPath');
const { requiresLeaveProof, getLeaveProofRequirementMessage, isHalfDayOnlyLeaveType, isMedicalLeaveType, isMedicalLeaveRecord } = require('../utils/leaveProof');
const {
  normalizeCode,
  getLeaveAllocation,
  getLeaveDays,
  getBalanceUnit,
  roundDays,
  getMaxHoursPerApplication,
  isFixedDayQuotaAllocation,
  isSameMonthDay,
  getBalanceForUser,
} = require('../services/leaveBalanceService');

const leaveProofStorage = multer.diskStorage({
  destination: 'uploads/leaves/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `proof-${Date.now()}${ext}`);
  },
});

const leaveProofUpload = multer({
  storage: leaveProofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return cb(null, true);
    }
    cb(new Error('Proof must be a PDF or image (JPG, PNG, WEBP)'));
  },
});

exports.leaveProofUpload = leaveProofUpload;

function canViewLeaveProof(req, leave) {
  const employeeId = leave.employeeId?._id || leave.employeeId;
  if (String(employeeId) === String(req.user._id)) return true;
  return hasPermission(req, 'leaves:view_all', 'leaves:approve');
}

// Compute total days between two dates (inclusive, weekdays only optional)
function computeTotalDays(start, end) {
  const ms = new Date(end) - new Date(start);
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

// Compute hours between two "HH:MM" strings
function computeHours(startTime, endTime) {
  return computeMinutes(startTime, endTime) / 60;
}

function computeMinutes(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function insufficientBalanceMessage(leaveTypeName, requestedDays, availableBalance, usedPendingDays, allocatedDays) {
  return `Insufficient ${leaveTypeName} balance. Requested: ${roundDays(requestedDays)}d, Available: ${roundDays(availableBalance)}d, Used/Pending: ${roundDays(usedPendingDays)}d out of ${roundDays(allocatedDays)}d allocated.`;
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateOnlyString(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonthsToDateString(dateString, months) {
  const [inputYear, inputMonth, inputDay] = dateString.split('-').map(Number);
  const targetMonthIndex = inputMonth - 1 + months;
  const lastTargetDay = new Date(inputYear, targetMonthIndex + 1, 0).getDate();
  const date = new Date(inputYear, targetMonthIndex, Math.min(inputDay, lastTargetDay));
  const outputYear = date.getFullYear();
  const outputMonth = String(date.getMonth() + 1).padStart(2, '0');
  const outputDay = String(date.getDate()).padStart(2, '0');
  return `${outputYear}-${outputMonth}-${outputDay}`;
}

function isSaturdayDate(value) {
  if (!value) return false;
  const dateString = getDateOnlyString(value);
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).getDay() === 6;
}

function getDateRestrictionError(leaveMode, startDate) {
  const startDateString = getDateOnlyString(startDate);
  const todayString = getTodayDateString();
  if (leaveMode === 'Planned' && startDateString <= todayString) {
    return 'Planned leave can be applied only for future dates.';
  }
  if (leaveMode === 'Unplanned') {
    const minDateString = addMonthsToDateString(todayString, -1);
    if (startDateString < minDateString) {
      return 'Unplanned leave can be applied only up to 1 month in the past.';
    }
  }
  return '';
}

exports.applyLeave = async (req, res, next) => {
  try {
    const {
      leaveType, durationType = 'full_day',
      startDate, endDate,
      halfDayPeriod,
      startTime, endTime,
      reason,
      leaveMode = 'Planned',
      currentProject = null,
    } = req.body;

    if (!leaveType || !startDate || !reason) {
      return res.status(400).json({ success: false, message: 'leaveType, startDate, and reason are required' });
    }

    // Validate leave type exists
    const ltDoc = await LeaveType.findOne({ $or: [{ name: leaveType }, { code: leaveType }], isActive: true });
    if (!ltDoc) {
      return res.status(400).json({ success: false, message: `Leave type "${leaveType}" not found or inactive` });
    }

    const start = new Date(startDate);
    const end = durationType === 'hourly' ? start : new Date(endDate || startDate);
    const requestedDaysForProof = durationType === 'half_day' ? 0.5 : (durationType === 'hourly' ? 0 : computeTotalDays(start, end));
    const proofOptions = { durationType, startDate, endDate, requestedDays: requestedDaysForProof };

    if (isMedicalLeaveType(ltDoc)) {
      const windowStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 60);
      const windowEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 60, 23, 59, 59, 999);
      const adjacentLeaves = await Leave.find({
        employeeId: req.user._id,
        status: { $in: ['Pending', 'Approved'] },
        startDate: { $lte: windowEnd },
        endDate: { $gte: windowStart },
      }).select('startDate endDate leaveType leaveTypeCode status').lean();
      proofOptions.existingLeaves = adjacentLeaves.filter(isMedicalLeaveRecord);
    }

    if (requiresLeaveProof(ltDoc, proofOptions) && !req.file) {
      return res.status(400).json({
        success: false,
        message: getLeaveProofRequirementMessage(ltDoc, proofOptions),
      });
    }

    // Validate duration type is allowed
    const halfDayOnly = isHalfDayOnlyLeaveType(ltDoc);
    if (halfDayOnly && durationType !== 'half_day') {
      return res.status(400).json({ success: false, message: `${ltDoc.name} can only be applied as half day (0.5 day).` });
    }
    if (durationType === 'full_day' && ltDoc.allowFullDay === false) {
      return res.status(400).json({ success: false, message: `${ltDoc.name} does not allow full-day leaves` });
    }
    if (durationType === 'hourly' && !ltDoc.allowHourly) {
      return res.status(400).json({ success: false, message: `${ltDoc.name} does not allow hourly leaves` });
    }
    if (durationType === 'half_day' && !ltDoc.allowHalfDay && !halfDayOnly) {
      return res.status(400).json({ success: false, message: `${ltDoc.name} does not allow half-day leaves` });
    }

    if (ltDoc.birthdayOnly) {
      if (!req.user.dateOfBirth) {
        return res.status(400).json({ success: false, message: `${ltDoc.name} requires your date of birth to be set in your profile.` });
      }
      if (!isSameMonthDay(start, req.user.dateOfBirth)) {
        return res.status(400).json({ success: false, message: `${ltDoc.name} can be applied only on your birthday.` });
      }
      if (durationType !== 'hourly') {
        return res.status(400).json({ success: false, message: `${ltDoc.name} can be applied only as hourly short leave.` });
      }
      const birthdayYearStart = new Date(start.getFullYear(), 0, 1);
      const birthdayYearEnd = new Date(start.getFullYear(), 11, 31, 23, 59, 59);
      const alreadyApplied = await Leave.exists({
        employeeId: req.user._id,
        leaveTypeCode: ltDoc.code,
        status: { $in: ['Pending', 'Approved'] },
        startDate: { $gte: birthdayYearStart, $lte: birthdayYearEnd },
      });
      if (alreadyApplied) {
        return res.status(400).json({ success: false, message: `${ltDoc.name} has already been used or is pending for this year.` });
      }
    }

    const dateRestrictionError = getDateRestrictionError(leaveMode, startDate);
    if (dateRestrictionError) {
      return res.status(400).json({ success: false, message: dateRestrictionError });
    }
    if (isSaturdayDate(startDate) && ['half_day', 'hourly'].includes(durationType)) {
      return res.status(400).json({ success: false, message: 'Half-day and short/hourly leave are not allowed on Saturdays. Please apply full-day leave for Saturday.' });
    }

    // Validate hourly fields
    if (durationType === 'hourly') {
      if (!startTime || !endTime) {
        return res.status(400).json({ success: false, message: 'startTime and endTime required for hourly leave' });
      }
      const durationMinutes = computeMinutes(startTime, endTime);
      if (durationMinutes <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid time range' });
      }
      // Enforce max hours per application
      const maxHoursPerApplication = getMaxHoursPerApplication(ltDoc);
      if (maxHoursPerApplication && durationMinutes > maxHoursPerApplication * 60) {
        return res.status(400).json({ success: false, message: `${ltDoc.name} cannot exceed ${maxHoursPerApplication} hours.` });
      }
    }

    const LeaveAllocationModel = getLeaveAllocation();
    const allocation = await LeaveAllocationModel.findOne({ role: req.user.role, leaveTypeCode: ltDoc.code });

    // Free-hand leave types skip ALL quota/balance checks — admin approves ad-hoc
    const isFreeHand = !!ltDoc.isFreeHand;

    // Enforce configured monthly day limit (e.g., WFH = 2 days/month, half-day = 0.5)
    if (!isFreeHand && (allocation?.period === 'monthly' || ltDoc.maxPerMonth)) {
      const monthlyLimit = allocation?.daysAllowed ?? ltDoc.maxPerMonth;
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
      const monthLeaves = await Leave.find({
        employeeId: req.user._id,
        status: { $in: ['Pending', 'Approved'] },
        startDate: { $gte: monthStart, $lte: monthEnd },
      });
      const matchedLeaves = monthLeaves.filter(l => normalizeCode(l.leaveTypeCode) === ltDoc.code || l.leaveTypeCode === ltDoc.code);
      const monthUsed = matchedLeaves.reduce((s, l) => s + getLeaveDays(l), 0);
      const requestedDays = durationType === 'half_day' ? 0.5 : (durationType === 'hourly' ? 0 : computeTotalDays(start, end));
      if (monthUsed + requestedDays > monthlyLimit) {
        return res.status(400).json({ success: false, message: `${ltDoc.name} is limited to ${monthlyLimit} day(s) per month. You have already used ${monthUsed} day(s) this month.` });
      }
    }

    // Validate half-day
    if (durationType === 'half_day' && !halfDayPeriod) {
      return res.status(400).json({ success: false, message: 'halfDayPeriod (morning/afternoon) required for half-day leave' });
    }

    // Overlap check — block any leave on a day that already has a leave
    // Uses date-only comparison (strip time) to avoid timezone edge cases
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    const overlap = await Leave.findOne({
      employeeId: req.user._id,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: endDay },
      endDate: { $gte: startDay },
    });
    // Find all overlapping leaves on the same day(s)
    const overlaps = await Leave.find({
      employeeId: req.user._id,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: endDay },
      endDate: { $gte: startDay },
    });
    if (overlaps.length > 0) {
      const newIsHalfDay = durationType === 'half_day';
      // Check each overlap — block if any conflict
      for (const overlap of overlaps) {
        const existingIsHalfDay = overlap.durationType === 'half_day';
        // Allow: both are half-day AND different periods (morning+afternoon)
        const compatible = newIsHalfDay && existingIsHalfDay && halfDayPeriod && overlap.halfDayPeriod && halfDayPeriod !== overlap.halfDayPeriod;
        if (!compatible) {
          const existingType = overlap.leaveType || 'leave';
          const existingDuration = overlap.durationType === 'half_day' ? `half-day (${overlap.halfDayPeriod})` : 'full-day';
          return res.status(409).json({ success: false, message: `Cannot apply — you already have a ${existingDuration} ${existingType} on this date. To apply two half-day leaves on the same day, both must be half-day with different periods (morning + afternoon).` });
        }
      }
      // If we get here, all overlaps are compatible half-day leaves with different periods
      // But max 2 half-days per day (morning + afternoon = full day)
      if (overlaps.length >= 2) {
        return res.status(409).json({ success: false, message: 'This day already has two half-day leaves (morning + afternoon)' });
      }
    }

    const restrictedLeaveCodes = new Set(['CL', 'ML', 'PL', 'PRIV']);
    const normalizedRequestedCode = normalizeCode(ltDoc.code);
    if (restrictedLeaveCodes.has(normalizedRequestedCode)) {
      const adjacentStart = new Date(startDay);
      adjacentStart.setDate(adjacentStart.getDate() - 1);
      const adjacentEnd = new Date(endDay);
      adjacentEnd.setDate(adjacentEnd.getDate() + 1);
      const adjacentLeaves = await Leave.find({
        employeeId: req.user._id,
        status: { $in: ['Pending', 'Approved'] },
        startDate: { $lte: adjacentEnd },
        endDate: { $gte: adjacentStart },
        leaveTypeCode: { $in: Array.from(restrictedLeaveCodes) },
      });
      const conflictingLeaves = adjacentLeaves.filter(l => normalizeCode(l.leaveTypeCode) !== normalizedRequestedCode);
      if (conflictingLeaves.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot apply ${ltDoc.name} next to another paid leave type (Casual, Medical, Paid, or Privileged) without at least one working day in between.`
        });
      }
    }

    // Quota check — count both Pending + Approved against allocation
    // Skip for free-hand leave types (no quota enforcement)
    if (durationType !== 'hourly' && !isFreeHand) {
      const alloc = allocation;
      if (isFixedDayQuotaAllocation(alloc, ltDoc)) {
        const year = start.getFullYear();
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31, 23, 59, 59);
        const h1End = new Date(year, 5, 30, 23, 59, 59);
        const h2Start = new Date(year, 6, 1);
        const period = alloc.period || 'biannual';
        const isH1 = start <= h1End;

        // Code mapping for old migrated leaves — use shared CODE_MAP
        const matchCode = (l) => {
          const norm = normalizeCode(l.leaveTypeCode);
          return norm === ltDoc.code || l.leaveTypeCode === ltDoc.code;
        };

        if (period === 'biannual') {
          // Check current half-year quota
          const h1Quota = alloc.h1Days != null ? alloc.h1Days : alloc.daysAllowed / 2;
          const h2BaseQuota = alloc.daysAllowed - h1Quota;

          // Get all leaves this year for this type
          const allYearLeaves = await Leave.find({
            employeeId: req.user._id,
            status: { $in: ['Pending', 'Approved'] },
            startDate: { $gte: yearStart, $lte: yearEnd },
          });
          const matchedLeaves = allYearLeaves.filter(l => matchCode(l));

          const h1Used = matchedLeaves
            .filter(l => new Date(l.startDate) <= h1End)
            .reduce((s, l) => s + getLeaveDays(l), 0);
          const h2Used = matchedLeaves
            .filter(l => new Date(l.startDate) >= h2Start)
            .reduce((s, l) => s + getLeaveDays(l), 0);

          // Carry forward: unused H1 days added to H2
          const carryForward = alloc.carryForward !== false;
          const h1Unused = Math.max(0, h1Quota - h1Used);
          const h2Quota = h2BaseQuota + (carryForward ? h1Unused : 0);

          const currentQuota = isH1 ? h1Quota : h2Quota;
          const currentUsed = isH1 ? h1Used : h2Used;
          const requestedDays = durationType === 'full_day' ? computeTotalDays(start, end) : 0.5;
          const availableBalance = Math.max(0, currentQuota - currentUsed);

          if (requestedDays > availableBalance) {
            const periodLabel = isH1 ? 'Jan–Jun' : 'Jul–Dec';
            return res.status(400).json({
              success: false,
              message: insufficientBalanceMessage(ltDoc.name, requestedDays, availableBalance, currentUsed, currentQuota)
            });
          }
        } else if (period === 'monthly') {
          const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
          const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
          const usedLeaves = await Leave.find({
            employeeId: req.user._id,
            status: { $in: ['Pending', 'Approved'] },
            startDate: { $gte: monthStart, $lte: monthEnd },
          });
          const usedDays = usedLeaves.filter(l => matchCode(l)).reduce((s, l) => s + getLeaveDays(l), 0);
          const requestedDays = durationType === 'full_day' ? computeTotalDays(start, end) : 0.5;
          const availableBalance = Math.max(0, alloc.daysAllowed - usedDays);
          if (requestedDays > availableBalance) {
            return res.status(400).json({
              success: false,
              message: insufficientBalanceMessage(ltDoc.name, requestedDays, availableBalance, usedDays, alloc.daysAllowed)
            });
          }
        } else {
          // Annual period — check full year
          const usedLeaves = await Leave.find({
            employeeId: req.user._id,
            status: { $in: ['Pending', 'Approved'] },
            startDate: { $gte: yearStart, $lte: yearEnd },
          });
          const usedDays = usedLeaves.filter(l => matchCode(l)).reduce((s, l) => s + getLeaveDays(l), 0);
          const requestedDays = durationType === 'full_day' ? computeTotalDays(start, end) : 0.5;
          const availableBalance = Math.max(0, alloc.daysAllowed - usedDays);
          if (requestedDays > availableBalance) {
            return res.status(400).json({
              success: false,
              message: insufficientBalanceMessage(ltDoc.name, requestedDays, availableBalance, usedDays, alloc.daysAllowed)
            });
          }
        }
      }
    }

    // Compute totals
    let totalDays = null;
    let totalHours = null;
    if (durationType === 'full_day') totalDays = computeTotalDays(start, end);
    if (durationType === 'half_day') totalDays = 0.5;
    if (durationType === 'hourly') totalHours = computeHours(startTime, endTime);

    const leave = await Leave.create({
      employeeId: req.user._id,
      leaveType: ltDoc.name,
      leaveTypeCode: ltDoc.code,
      durationType,
      startDate: start,
      endDate: end,
      halfDayPeriod: durationType === 'half_day' ? halfDayPeriod : null,
      startTime: durationType === 'hourly' ? startTime : null,
      endTime: durationType === 'hourly' ? endTime : null,
      totalDays,
      totalHours,
      reason,
      currentProject,
      leaveMode,
      proofUrl: req.file ? `/uploads/leaves/${req.file.filename}` : null,
      proofFileName: req.file ? req.file.originalname : null,
    });

    // Notify the approver(s) about the new leave request
    const User = require('../models/User');
    const applicant = req.user;
    const durationText = durationType === 'hourly' ? `${startTime}–${endTime}` : durationType === 'half_day' ? '0.5 day' : `${totalDays} day(s)`;
    const notifyMsg = `${applicant.name} has applied for ${ltDoc.name} (${durationText}) from ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`;

    // Find who should be notified based on hierarchy
    if (applicant.role === 'employee' || applicant.role === 'team_lead') {
      // Notify assigned team lead if employee
      if (applicant.role === 'employee' && applicant.teamLeadId) {
        await notify(applicant.teamLeadId, 'leave_applied', 'New Leave Request', notifyMsg, '/admin/leaves?status=Pending');
        // Email the team lead
        const tl = await User.findById(applicant.teamLeadId).select('email name');
        if (tl) await sendLeaveAppliedEmail(tl.email, tl.name, applicant.name, ltDoc.name, durationText, start.toLocaleDateString('en-IN'));
      }
      // Also notify all HR and admin users
      const managers = await User.find({ role: { $in: ['hr', 'admin', 'md'] }, status: 'Active' }).select('_id email name');
      for (const mgr of managers) {
        await notify(mgr._id, 'leave_applied', 'New Leave Request', notifyMsg, '/admin/leaves?status=Pending');
        await sendLeaveAppliedEmail(mgr.email, mgr.name, applicant.name, ltDoc.name, durationText, start.toLocaleDateString('en-IN'));
      }
    } else {
      // For HR/admin/MD — notify other admins/MD
      const managers = await User.find({ role: { $in: ['admin', 'md'] }, status: 'Active', _id: { $ne: applicant._id } }).select('_id email name');
      for (const mgr of managers) {
        await notify(mgr._id, 'leave_applied', 'New Leave Request', notifyMsg, '/admin/leaves?status=Pending');
        await sendLeaveAppliedEmail(mgr.email, mgr.name, applicant.name, ltDoc.name, durationText, start.toLocaleDateString('en-IN'));
      }
    }

    res.status(201).json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveProof = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id).select('employeeId proofUrl proofFileName');
    if (!leave?.proofUrl) {
      return res.status(404).json({ success: false, message: 'Leave proof not found' });
    }
    if (!canViewLeaveProof(req, leave)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const absolutePath = fileUrlToAbsolutePath(leave.proofUrl);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'Proof file not found on server' });
    }

    res.sendFile(absolutePath);
  } catch (err) {
    next(err);
  }
};

exports.getMyLeaves = async (req, res, next) => {
  try {
    const filter = { employeeId: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.leaveType) filter.leaveType = req.query.leaveType;
    if (req.query.leaveMode) filter.leaveMode = req.query.leaveMode;
    if (req.query.startDate || req.query.endDate) {
      filter.startDate = {};
      if (req.query.startDate) filter.startDate.$gte = new Date(req.query.startDate + 'T00:00:00.000Z');
      if (req.query.endDate) filter.startDate.$lte = new Date(req.query.endDate + 'T23:59:59.999Z');
    }
    const sortField = req.query.sortBy || 'appliedAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    const leaves = await Leave.find(filter).sort({ [sortField]: sortDir }).lean();
    const leaveTypes = await LeaveType.find({ isActive: true }).lean();
    const allocations = await getLeaveAllocation().find({ role: req.user.role }).lean();
    const enriched = leaves.map(leave => {
      const leaveType = leaveTypes.find(lt => normalizeCode(leave.leaveTypeCode) === lt.code || leave.leaveTypeCode === lt.code);
      const allocation = allocations.find(a => a.leaveTypeCode === leaveType?.code);
      const durationMinutes = leave.totalHours ? Math.round(leave.totalHours * 60) : (leave.startTime && leave.endTime ? computeMinutes(leave.startTime, leave.endTime) : null);
      return {
        ...leave,
        fromTime: leave.startTime || null,
        toTime: leave.endTime || null,
        durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : null,
        durationHours: durationMinutes && durationMinutes > 0 ? roundDays(durationMinutes / 60) : null,
        unit: leaveType ? getBalanceUnit(leaveType, allocation) : 'days',
        period: allocation?.period || null,
        isFixedDayQuota: leaveType ? isFixedDayQuotaAllocation(allocation, leaveType) : false,
        allowFullDay: leaveType?.allowFullDay !== false,
        allowHourly: !!leaveType?.allowHourly,
        allowHalfDay: !!leaveType?.allowHalfDay,
      };
    });
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

exports.getAllLeaves = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.leaveType) filter.leaveType = req.query.leaveType;
    if (req.query.durationType) filter.durationType = req.query.durationType;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    if (req.query.leaveMode) filter.leaveMode = req.query.leaveMode;
    if (req.query.startDate || req.query.endDate) {
      filter.startDate = {};
      if (req.query.startDate) filter.startDate.$gte = new Date(req.query.startDate + 'T00:00:00.000Z');
      if (req.query.endDate) filter.startDate.$lte = new Date(req.query.endDate + 'T23:59:59.999Z');
    }
    // Month filter (1-12)
    if (req.query.month) {
      const m = parseInt(req.query.month);
      const year = new Date().getFullYear();
      const monthStart = new Date(year, m - 1, 1);
      const monthEnd = new Date(year, m, 0, 23, 59, 59);
      filter.startDate = { ...filter.startDate, $gte: monthStart, $lte: monthEnd };
    }

    const User = require('../models/User');

    // Hierarchy-based filtering
    const requesterRole = req.user.role;
    if (requesterRole === 'team_lead') {
      // Team lead sees only employees from departments they lead
      const ledDepartments = await Department.find({ teamLeaderId: req.user._id, status: 'active' }).select('name');
      const deptNames = ledDepartments.map(d => d.name);

      // Find employees in those departments OR directly assigned via teamLeadId
      const teamMembers = await User.find({
        $or: [
          { department: { $in: deptNames }, role: 'employee' },
          { teamLeadId: req.user._id },
        ],
      }).distinct('_id');
      // If a specific employee is requested, intersect with team members
      if (req.query.employeeId) {
        const requestedInTeam = teamMembers.some(id => id.toString() === req.query.employeeId.toString());
        if (requestedInTeam) {
          filter.employeeId = req.query.employeeId;
        } else {
          return res.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
        }
      } else {
        filter.employeeId = { $in: teamMembers };
      }
    } else if (requesterRole === 'hr') {
      // HR sees employees and team leads (not admin/md)
      const visibleUsers = await User.find({ role: { $in: ['employee', 'team_lead'] } }).distinct('_id');
      if (!req.query.employeeId) filter.employeeId = { $in: visibleUsers };
    }
    // admin/md see all — no filter needed

    if (req.query.department) {
      const empIds = await User.find({ department: { $regex: req.query.department, $options: 'i' } }).distinct('_id');
      filter.employeeId = { $in: empIds };
    }

    // Filter by employee active/inactive status
    if (req.query.empStatus) {
      const statusEmpIds = await User.find({ status: req.query.empStatus }).distinct('_id');
      if (filter.employeeId && filter.employeeId.$in) {
        // Intersect with existing filter
        const existing = new Set(filter.employeeId.$in.map(String));
        filter.employeeId = { $in: statusEmpIds.filter(id => existing.has(String(id))) };
      } else if (!req.query.employeeId) {
        filter.employeeId = { $in: statusEmpIds };
      }
    }

    const sortField = req.query.sortBy || 'appliedAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    const total = await Leave.countDocuments(filter);
    const leaves = await Leave.find(filter)
      .populate('employeeId', '-password')
      .populate('approvedBy', 'name')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ [sortField]: sortDir });
    res.json({ success: true, data: leaves, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.approveLeave = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id).populate('employeeId', 'name role department teamLeadId');
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(409).json({ success: false, message: 'Leave is already actioned' });

    const approver = req.user;
    const applicant = leave.employeeId;

    // Hierarchy check
    const canApprove = await checkApprovalPermission(approver, applicant);
    if (!canApprove.allowed) {
      return res.status(403).json({ success: false, message: canApprove.reason });
    }

    leave.status = 'Approved';
    leave.approvedBy = approver._id;
    leave.updatedAt = new Date();
    await leave.save();
    await notify(leave.employeeId._id || leave.employeeId, 'leave_approved', 'Leave Approved ✅',
      `Your ${leave.leaveType} request has been approved.`, '/employee/leaves');
    // Email the employee
    const emp = await User.findById(leave.employeeId._id || leave.employeeId).select('email name');
    if (emp) await sendLeaveStatusEmail(emp.email, emp.name, leave.leaveType, 'Approved', null);
    res.json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
};

exports.rejectLeave = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id).populate('employeeId', 'name role department teamLeadId');
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'Pending') return res.status(409).json({ success: false, message: 'Leave is already actioned' });

    const approver = req.user;
    const applicant = leave.employeeId;

    const canApprove = await checkApprovalPermission(approver, applicant);
    if (!canApprove.allowed) {
      return res.status(403).json({ success: false, message: canApprove.reason });
    }

    leave.status = 'Rejected';
    leave.approvedBy = approver._id;
    leave.rejectionReason = req.body.reason || null;
    leave.updatedAt = new Date();
    await leave.save();
    await notify(leave.employeeId._id || leave.employeeId, 'leave_rejected', 'Leave Rejected ❌',
      `Your ${leave.leaveType} request was rejected.${leave.rejectionReason ? ' Reason: ' + leave.rejectionReason : ''}`, '/employee/leaves');
    // Email the employee
    const empR = await User.findById(leave.employeeId._id || leave.employeeId).select('email name');
    if (empR) await sendLeaveStatusEmail(empR.email, empR.name, leave.leaveType, 'Rejected', leave.rejectionReason);
    res.json({ success: true, data: leave });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeave = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (!canModifyLeave(req, leave)) {
      return res.status(403).json({ success: false, message: 'You can only delete your own pending leaves' });
    }
    await Leave.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Leave deleted' });
  } catch (err) { next(err); }
};

exports.editLeave = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    if (!canModifyLeave(req, leave)) {
      return res.status(403).json({ success: false, message: 'You can only edit your own pending leaves' });
    }
    if (!hasPermission(req, 'leaves:delete') && leave.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending leaves can be edited' });
    }

    const {
      leaveType, durationType, startDate, endDate,
      halfDayPeriod, startTime, endTime, reason, leaveMode,
    } = req.body;

    // Validate leave type if changed
    let ltDoc = null;
    if (leaveType) {
      ltDoc = await LeaveType.findOne({ $or: [{ name: leaveType }, { code: leaveType }], isActive: true });
      if (!ltDoc) return res.status(400).json({ success: false, message: `Leave type "${leaveType}" not found or inactive` });
    }

    const finalDurationType = durationType || leave.durationType;
    const finalStartDate = startDate ? new Date(startDate) : leave.startDate;
    const finalEndDate = finalDurationType === 'hourly'
      ? finalStartDate
      : (endDate ? new Date(endDate) : leave.endDate || finalStartDate);
    const finalLeaveMode = leaveMode || leave.leaveMode;

    const dateRestrictionError = getDateRestrictionError(finalLeaveMode, finalStartDate);
    if (dateRestrictionError) {
      return res.status(400).json({ success: false, message: dateRestrictionError });
    }

    // Overlap check (exclude current leave from the check)
    const startDay = new Date(finalStartDate.getFullYear(), finalStartDate.getMonth(), finalStartDate.getDate());
    const endDay = new Date(finalEndDate.getFullYear(), finalEndDate.getMonth(), finalEndDate.getDate(), 23, 59, 59, 999);
    const overlap = await Leave.findOne({
      _id: { $ne: leave._id },
      employeeId: leave.employeeId,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: endDay },
      endDate: { $gte: startDay },
    });
    if (overlap) {
      const finalHalfDayPeriod = halfDayPeriod || leave.halfDayPeriod;
      const isBothHalfDay = finalDurationType === 'half_day' && overlap.durationType === 'half_day';
      const isDifferentPeriod = isBothHalfDay && finalHalfDayPeriod !== overlap.halfDayPeriod;
      if (!isDifferentPeriod) {
        return res.status(409).json({ success: false, message: 'Leave dates overlap with an existing leave' });
      }
    }

    // Compute totals
    let totalDays = leave.totalDays;
    let totalHours = leave.totalHours;
    if (finalDurationType === 'full_day') {
      totalDays = computeTotalDays(finalStartDate, finalEndDate);
      totalHours = null;
    } else if (finalDurationType === 'half_day') {
      totalDays = 0.5;
      totalHours = null;
    } else if (finalDurationType === 'hourly') {
      totalDays = null;
      const st = startTime || leave.startTime;
      const et = endTime || leave.endTime;
      totalHours = st && et ? computeHours(st, et) : leave.totalHours;
    }

    // Update fields
    if (ltDoc) {
      leave.leaveType = ltDoc.name;
      leave.leaveTypeCode = ltDoc.code;
    }
    if (durationType) leave.durationType = durationType;
    if (startDate) leave.startDate = finalStartDate;
    leave.endDate = finalEndDate;
    if (halfDayPeriod !== undefined) leave.halfDayPeriod = finalDurationType === 'half_day' ? halfDayPeriod : null;
    if (startTime !== undefined) leave.startTime = finalDurationType === 'hourly' ? startTime : null;
    if (endTime !== undefined) leave.endTime = finalDurationType === 'hourly' ? endTime : null;
    if (reason) leave.reason = reason;
    if (leaveMode) leave.leaveMode = leaveMode;
    leave.totalDays = totalDays;
    leave.totalHours = totalHours;
    leave.updatedAt = new Date();

    await leave.save();
    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
};

// ── Hierarchy helper ──────────────────────────────────────────────────────────
async function checkApprovalPermission(approver, applicant) {
  const approverRole = approver.role;  const applicantRole = applicant?.role || 'employee';

  // Admin and MD can approve anyone
  if (['admin', 'md'].includes(approverRole)) {
    return { allowed: true };
  }

  // HR can approve employees and team leads (but not admin/md)
  if (approverRole === 'hr') {
    if (['employee', 'team_lead'].includes(applicantRole)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'HR can only approve employee and team lead leaves' };
  }

  // Team Lead can only approve their own team members (employees assigned to them)
  if (approverRole === 'team_lead') {
    if (applicantRole !== 'employee') {
      return { allowed: false, reason: 'Team leads can only approve employee leaves. Team lead leaves require HR or MD approval.' };
    }

    // Department.teamLeaderId is the source of truth for department leadership.
    // This must match the department-based filtering used when listing leaves.
    if (applicant.department) {
      const ledDepartment = await Department.exists({
        name: applicant.department,
        teamLeaderId: approver._id,
        status: 'active',
      });
      if (ledDepartment) {
        return { allowed: true };
      }
    }

    // Preserve direct assignments for employees not managed through a department.
    const assignedTL = applicant.teamLeadId?.toString();
    if (assignedTL && assignedTL === approver._id.toString()) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'You can only approve leaves of employees in your team' };
  }

  return { allowed: false, reason: 'You do not have permission to approve leaves' };
}

// Get leave type list (for frontend dropdowns)
exports.getLeaveTypes = async (req, res, next) => {
  try {
    const role = req.user?.role;
    const userPerms = req.permissions || [];
    const isManager = userPerms.includes('settings:edit') || ['admin', 'md', 'hr'].includes(role);

    // Managers see ALL leave types (including inactive) for admin purposes
    // Regular users only see active types visible to their role
    let filter;
    if (isManager) {
      filter = {}; // Show all — active and inactive
    } else {
      filter = {
        isActive: true,
        $or: [
          { visibleToRoles: { $exists: false } },
          { visibleToRoles: { $size: 0 } },
          { visibleToRoles: role },
        ],
      };
    }
    const types = await LeaveType.find(filter).sort({ name: 1 });
    res.json({ success: true, data: types });
  } catch (err) {
    next(err);
  }
};

// Admin: CRUD for leave types
exports.createLeaveType = async (req, res, next) => {
  try {
    if (req.body.allowFullDay === false && !req.body.allowHalfDay && !req.body.allowHourly) {
      return res.status(400).json({ success: false, message: 'Select at least one duration option' });
    }
    const lt = await LeaveType.create(req.body);
    res.status(201).json({ success: true, data: lt });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Leave type code already exists' });
    next(err);
  }
};

exports.updateLeaveType = async (req, res, next) => {
  try {
    if (req.body.allowFullDay === false && !req.body.allowHalfDay && !req.body.allowHourly) {
      return res.status(400).json({ success: false, message: 'Select at least one duration option' });
    }
    const lt = await LeaveType.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lt) return res.status(404).json({ success: false, message: 'Leave type not found' });
    res.json({ success: true, data: lt });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeaveType = async (req, res, next) => {
  try {
    await LeaveType.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Leave type deactivated' });
  } catch (err) {
    next(err);
  }
};

// Get leave balance for the current user (used days vs allocated, with bi-annual carry-forward)
exports.getMyBalance = async (req, res, next) => {
  try {
    const balance = await getBalanceForUser(req.user, req.query.asOfDate);
    res.json({ success: true, data: balance });
  } catch (err) {
    next(err);
  }
};

// Admin: get/update allocations
exports.getAllocations = async (req, res, next) => {
  try {
    const allocations = await getLeaveAllocation().find().sort({ role: 1, leaveTypeCode: 1 });
    res.json({ success: true, data: allocations });
  } catch (err) { next(err); }
};

// Admin: Leave Summary — all employees with availed & balanced leaves
exports.getLeaveSummary = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);

    const User = require('../models/User');
    const employees = await User.find({ status: 'Active' }).select('name employeeId department designation role').sort({ name: 1 });
    const leaveTypes = await LeaveType.find({ isActive: true }).sort({ name: 1 });
    const allocations = await getLeaveAllocation().find();

    // Get all approved leaves for the year
    const allLeaves = await Leave.find({
      status: { $in: ['Approved', 'Pending'] },
      startDate: { $gte: yearStart, $lte: yearEnd },
    });

    // Use shared CODE_MAP at top of file for normalization

    // Current month boundaries (for monthly-period leave types like WFH)
    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const curMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const summary = employees.map(emp => {
      const empLeaves = allLeaves.filter(l => String(l.employeeId) === String(emp._id));
      const empAllocs = allocations.filter(a => a.role === emp.role);

      const leaveData = {};
      leaveTypes.forEach(lt => {
        // SL (Short Leave) is monthly period — included and shown with monthly stats
        const alloc = empAllocs.find(a => a.leaveTypeCode === lt.code);
        const daysAllowed = alloc?.daysAllowed ?? lt.maxDaysPerYear ?? 0;
        const isMonthly = alloc?.period === 'monthly';

        // Match leaves by current code OR any old code that maps to this type
        const matchedLeaves = empLeaves
          .filter(l => normalizeCode(l.leaveTypeCode) === lt.code || l.leaveTypeCode === lt.code);

        // For monthly leave types, availed/balance is for current month only
        const leavesForCount = isMonthly
          ? matchedLeaves.filter(l => new Date(l.startDate) >= curMonthStart && new Date(l.startDate) <= curMonthEnd)
          : matchedLeaves;

        const used = leavesForCount
          .reduce((s, l) => s + (l.durationType === 'half_day' ? 0.5 : (l.totalDays || 1)), 0);

        // Dates for tooltip — all dates (grouped by month in frontend for monthly types)
        const dates = [];
        matchedLeaves.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).forEach(l => {
          if (l.durationType === 'full_day' && l.totalDays > 1 && l.endDate) {
            const s = new Date(l.startDate);
            const e = new Date(l.endDate);
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
              dates.push({ date: new Date(d), type: 'full_day' });
            }
          } else {
            dates.push({ date: l.startDate, type: l.durationType || 'full_day' });
          }
        });

        leaveData[lt.code] = {
          availed: parseFloat(used.toFixed(1)),
          balance: parseFloat((daysAllowed - used).toFixed(1)),
          allocated: daysAllowed,
          isMonthly,
          dates,
        };
      });

      return {
        _id: emp._id,
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.department,
        designation: emp.designation,
        role: emp.role,
        leaves: leaveData,
      };
    });

    // Return leave type codes for table headers — include period from allocation (employee role default)
    const leaveTypeCodes = leaveTypes
      .map(lt => {
        // Use employee-role allocation to determine period for this leave type
        const alloc = allocations.find(a => a.leaveTypeCode === lt.code && a.role === 'employee');
        return { code: lt.code, name: lt.name, shortName: lt.code, period: alloc?.period || 'annual' };
      });

    res.json({ success: true, data: { summary, leaveTypes: leaveTypeCodes, year } });
  } catch (err) { next(err); }
};

// Admin: Monthly Attendance Record — leaves taken per employee in a specific month
exports.getMonthlyRecord = async (req, res, next) => {
  try {
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

    const User = require('../models/User');
    const employees = await User.find({ status: 'Active' }).select('name employeeId department role').sort({ name: 1 });
    const leaveTypes = await LeaveType.find({ isActive: true }).sort({ name: 1 });

    // Use shared CODE_MAP at top of file for normalization

    const allLeaves = await Leave.find({
      status: { $in: ['Approved', 'Pending'] },
      startDate: { $lte: monthEnd },
      $or: [
        { endDate: { $gte: monthStart } },
        { endDate: { $exists: false } },
        { endDate: null }
      ]
    });
    const attendanceRecords = await getAttendanceWithWfh({ date: { $gte: monthStartStr, $lte: monthEndStr } }, monthStartStr, monthEndStr);

    // All active leave types — SL (Short Leave) is monthly, shown with monthly stats
    const visibleTypes = leaveTypes;
    const validCodes = new Set(visibleTypes.map(lt => lt.code));

    const attendanceWfhMap = attendanceRecords.reduce((map, rec) => {
      if (rec.workMode === 'wfh' || rec.timeStatus === 'WFH') {
        const key = String(rec.employeeId?._id || rec.employeeId);
        map[key] = (map[key] || 0) + 1;
      }
      return map;
    }, {});
    const attendanceWfhDates = attendanceRecords.reduce((map, rec) => {
      if (rec.workMode === 'wfh' || rec.timeStatus === 'WFH') {
        const key = String(rec.employeeId?._id || rec.employeeId);
        map[key] = map[key] || [];
        map[key].push({ date: rec.date, type: 'full_day' });
      }
      return map;
    }, {});

    const records = employees.map(emp => {
      const empLeaves = allLeaves.filter(l => String(l.employeeId) === String(emp._id));
      const leaves = {};
      const leaveDates = {};

      const wfhDateSet = new Set();
      const addWfhDateSet = new Set();
      empLeaves.forEach(l => {
        const code = normalizeCode(l.leaveTypeCode);
        if (!validCodes.has(code)) return;

        const isWfh = (code === 'WFH');
        if (!isWfh && !leaveDates[code]) leaveDates[code] = [];
        if (isWfh && !leaveDates['WFH']) leaveDates['WFH'] = [];

        if (l.durationType === 'full_day' && l.endDate) {
          const s = new Date(l.startDate);
          const e = new Date(l.endDate);
          for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
            if (d >= monthStart && d <= monthEnd) {
              const dayDate = new Date(d);
              if (!isWfh) {
                leaves[code] = (leaves[code] || 0) + 1;
                leaveDates[code].push({ date: dayDate, type: 'full_day' });
              } else {
                const dateKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
                if (!wfhDateSet.has(dateKey)) {
                  wfhDateSet.add(dateKey);
                  leaveDates['WFH'].push({ date: dayDate, type: 'full_day' });
                }
              }
            }
          }
        } else {
          const s = new Date(l.startDate);
          if (s >= monthStart && s <= monthEnd) {
            const days = l.durationType === 'half_day' ? 0.5 : (l.durationType === 'hourly' ? 0 : 1);
            if (!isWfh) {
              leaves[code] = (leaves[code] || 0) + days;
              leaveDates[code].push({ date: s, type: l.durationType || 'full_day' });
            } else {
              const dateKey = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
              if (!wfhDateSet.has(dateKey)) {
                wfhDateSet.add(dateKey);
                leaveDates['WFH'].push({ date: s, type: l.durationType || 'full_day' });
              }
            }
          }
        }
      });

      const wfhDates = attendanceWfhDates[String(emp._id)] || [];
      if (wfhDates.length > 0) {
        wfhDates.forEach(d => {
          const dateKey = String(d.date).slice(0, 10);
          if (!wfhDateSet.has(dateKey) && !addWfhDateSet.has(dateKey)) {
            addWfhDateSet.add(dateKey);
            leaveDates['ADD_WFH'] = leaveDates['ADD_WFH'] || [];
            leaveDates['ADD_WFH'].push(d);
          }
        });
      }

      if (validCodes.has('WFH')) {
        leaves['WFH'] = wfhDateSet.size;
      }
      leaves['ADD_WFH'] = addWfhDateSet.size;

      // Round values and sort dates
      Object.keys(leaves).forEach(k => { leaves[k] = parseFloat(leaves[k].toFixed(1)); });
      Object.keys(leaveDates).forEach(k => { leaveDates[k].sort((a, b) => new Date(a.date) - new Date(b.date)); });

      return {
        _id: emp._id,
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.department,
        leaves,
        leaveDates,
      };
    }).filter(emp => {
      // Only show employees who have at least one leave this month
      return Object.values(emp.leaves).some(v => v > 0);
    });

    const allocations = await getLeaveAllocation().find();
    const leaveTypeCodes = visibleTypes.map(lt => {
      const alloc = allocations.find(a => a.leaveTypeCode === lt.code && a.role === 'employee');
      return { code: lt.code, name: lt.name, period: alloc?.period || 'annual' };
    });

    if (!leaveTypeCodes.some(lt => lt.code === 'ADD_WFH')) {
      const wfhIdx = leaveTypeCodes.findIndex(lt => lt.code === 'WFH');
      const addWfhObj = { code: 'ADD_WFH', name: 'Add-on WFH', period: 'monthly' };
      if (wfhIdx !== -1) {
        leaveTypeCodes.splice(wfhIdx + 1, 0, addWfhObj);
      } else {
        leaveTypeCodes.push(addWfhObj);
      }
    }
    res.json({ success: true, data: { records, leaveTypes: leaveTypeCodes, month, year } });
  } catch (err) { next(err); }
};

exports.updateAllocation = async (req, res, next) => {
  try {
    const { role, leaveTypeCode, daysAllowed, h1Days, carryForward, period, isEarned, notApplicable } = req.body;
    const isNotApplicable = !!notApplicable;
    const leaveType = await LeaveType.findOne({ code: leaveTypeCode }).lean();
    const isEarnedAllocation = !!isEarned && !!leaveType?.isFreeHand;
    const parsedDaysAllowed = Number(daysAllowed);
    const parsedH1Days = h1Days === '' || h1Days == null ? null : Number(h1Days);
    const alloc = await getLeaveAllocation().findOneAndUpdate(
      { role, leaveTypeCode },
      { role, leaveTypeCode, daysAllowed: (isEarnedAllocation || isNotApplicable) ? 0 : (Number.isFinite(parsedDaysAllowed) ? parsedDaysAllowed : 0), h1Days: Number.isFinite(parsedH1Days) ? parsedH1Days : null, carryForward: carryForward !== false, period: period || 'biannual', isEarned: isEarnedAllocation, notApplicable: isNotApplicable, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: alloc });
  } catch (err) { next(err); }
};

// ── Leave Analytics ───────────────────────────────────────────────────────────
// Helper to determine if a leave record is hourly/short leave
function isHourlyRecord(leave) {
  if (!leave) return false;
  if (leave.durationType === 'hourly') return true;
  const code = (leave.leaveTypeCode || '').toUpperCase();
  const type = (leave.leaveType || '').toLowerCase();
  return ['SL', 'SHRT', 'SHORT'].includes(code) || type.includes('short leave');
}

exports.getLeaveAnalytics = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);

    const User = require('../models/User');
    const Settings = require('../models/Settings');

    // Fetch company settings for working hours conversion factor
    const settings = await Settings.findOne({ key: 'global' });
    const fullDayRequiredHours = settings?.fullDayRequiredHours || null;

    // Build base query
    const leaveQuery = {
      startDate: { $gte: yearStart, $lte: yearEnd },
    };

    // Filter by status (default: Approved)
    const statusFilter = req.query.status || 'Approved';
    if (statusFilter !== 'All') {
      leaveQuery.status = statusFilter;
    }

    // Filter by leaveMode if specified
    if (req.query.leaveMode && req.query.leaveMode !== 'All') {
      leaveQuery.leaveMode = req.query.leaveMode;
    }

    // Filter by leaveType if specified
    if (req.query.leaveType && req.query.leaveType !== 'All') {
      leaveQuery.leaveType = req.query.leaveType;
    }

    const allLeaves = await Leave.find(leaveQuery)
      .populate('employeeId', 'name department designation employeeId profilePhotoUrl role status')
      .sort({ startDate: -1 });

    // Exclude WFH (attendance mode)
    let leaves = allLeaves.filter(leave => normalizeCode(leave.leaveTypeCode) !== 'WFH');

    // Optional Department Filter
    if (req.query.department && req.query.department !== 'All') {
      const targetDept = req.query.department;
      leaves = leaves.filter(l => {
        const dept = l.employeeId?.department?.trim() || 'Unassigned';
        return dept === targetDept;
      });
    }

    // Optional Employee Search Filter
    if (req.query.search && req.query.search.trim()) {
      const s = req.query.search.trim().toLowerCase();
      leaves = leaves.filter(l => {
        const name = (l.employeeId?.name || '').toLowerCase();
        const code = (l.employeeId?.employeeId || '').toLowerCase();
        return name.includes(s) || code.includes(s);
      });
    }

    // Active Headcount calculation (excluding superadmin & system roles)
    const activeUserQuery = {
      status: 'Active',
      role: { $ne: 'superadmin' },
    };
    if (req.query.department && req.query.department !== 'All') {
      activeUserQuery.department = req.query.department;
    }
    const totalActiveEmployees = await User.countDocuments(activeUserQuery);

    // Active Headcount by Department
    const activeUsers = await User.find({ status: 'Active', role: { $ne: 'superadmin' } }).select('department');
    const deptActiveMap = {};
    activeUsers.forEach(u => {
      const d = u.department?.trim() || 'Unassigned';
      deptActiveMap[d] = (deptActiveMap[d] || 0) + 1;
    });

    // Unit Separation: Day-based vs Hourly
    const dayLeaves = leaves.filter(l => !isHourlyRecord(l));
    const hourlyLeaves = leaves.filter(l => isHourlyRecord(l));

    // Global Totals & Rates
    const totalApplications = leaves.length;
    const totalDayApplications = dayLeaves.length;
    const totalApprovedDays = dayLeaves.reduce((sum, l) => sum + (l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1)), 0);

    const unplannedApplications = leaves.filter(l => l.leaveMode === 'Unplanned').length;
    const plannedApplications = leaves.filter(l => l.leaveMode === 'Planned').length;

    const unplannedDays = dayLeaves.filter(l => l.leaveMode === 'Unplanned').reduce((sum, l) => sum + (l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1)), 0);
    const plannedDays = dayLeaves.filter(l => l.leaveMode === 'Planned').reduce((sum, l) => sum + (l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1)), 0);

    const unplannedApplicationRate = totalApplications > 0
      ? parseFloat(((unplannedApplications / totalApplications) * 100).toFixed(1))
      : 0;

    const unplannedDayRate = totalApprovedDays > 0
      ? parseFloat(((unplannedDays / totalApprovedDays) * 100).toFixed(1))
      : 0;

    const avgDaysPerEmployee = totalActiveEmployees > 0
      ? parseFloat((totalApprovedDays / totalActiveEmployees).toFixed(1))
      : 0;

    // Hourly Leaves Total Summary
    const totalHourlyApplications = hourlyLeaves.length;
    const totalHourlyHours = hourlyLeaves.reduce((sum, l) => sum + (l.totalHours || l.durationHours || 2), 0);
    const hourlyEquivalentDays = fullDayRequiredHours && fullDayRequiredHours > 0
      ? parseFloat((totalHourlyHours / fullDayRequiredHours).toFixed(1))
      : null;

    // 1. By Department Summary
    const deptMap = {};
    leaves.forEach(l => {
      const d = l.employeeId?.department?.trim() || 'Unassigned';
      if (!deptMap[d]) {
        deptMap[d] = {
          dept: d,
          activeEmployees: deptActiveMap[d] || 0,
          totalApplications: 0,
          approvedDays: 0,
          unplannedApplications: 0,
          unplannedDays: 0,
        };
      }
      deptMap[d].totalApplications += 1;
      if (l.leaveMode === 'Unplanned') {
        deptMap[d].unplannedApplications += 1;
      }
      if (!isHourlyRecord(l)) {
        const days = l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1);
        deptMap[d].approvedDays += days;
        if (l.leaveMode === 'Unplanned') {
          deptMap[d].unplannedDays += days;
        }
      }
    });

    const byDept = Object.values(deptMap).map(d => {
      const activeCount = d.activeEmployees || 0;
      const avgDays = activeCount > 0 ? parseFloat((d.approvedDays / activeCount).toFixed(1)) : 0;
      const unplanAppRate = d.totalApplications > 0
        ? parseFloat(((d.unplannedApplications / d.totalApplications) * 100).toFixed(1))
        : 0;
      const unplanDayRate = d.approvedDays > 0
        ? parseFloat(((d.unplannedDays / d.approvedDays) * 100).toFixed(1))
        : 0;

      return {
        dept: d.dept,
        activeEmployees: activeCount,
        totalApplications: d.totalApplications,
        approvedDays: parseFloat(d.approvedDays.toFixed(1)),
        avgDaysPerEmployee: avgDays,
        unplannedApplications: d.unplannedApplications,
        unplannedDays: parseFloat(d.unplannedDays.toFixed(1)),
        unplannedApplicationRate: unplanAppRate,
        unplannedDayRate: unplanDayRate,
      };
    }).sort((a, b) => b.avgDaysPerEmployee - a.avgDaysPerEmployee);

    // 2. By Leave Type Summary (Split Day-based vs Hourly)
    const typeMap = {};
    leaves.forEach(l => {
      const t = l.leaveType || 'Other';
      const isH = isHourlyRecord(l);
      if (!typeMap[t]) {
        typeMap[t] = {
          type: t,
          isHourly: isH,
          applications: 0,
          totalDays: 0,
          totalHours: 0,
        };
      }
      typeMap[t].applications += 1;
      if (isH) {
        typeMap[t].totalHours += l.totalHours || l.durationHours || 2;
      } else {
        typeMap[t].totalDays += l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1);
      }
    });

    const dayBasedTypes = [];
    const hourlyTypes = [];

    Object.values(typeMap).forEach(t => {
      if (t.isHourly) {
        const avgHours = t.applications > 0 ? parseFloat((t.totalHours / t.applications).toFixed(1)) : 0;
        const equivDays = fullDayRequiredHours ? parseFloat((t.totalHours / fullDayRequiredHours).toFixed(1)) : null;
        hourlyTypes.push({
          type: t.type,
          isHourly: true,
          applications: t.applications,
          totalHours: parseFloat(t.totalHours.toFixed(1)),
          avgHoursPerApp: avgHours,
          equivalentDays: equivDays,
          sharePercent: null,
          shareText: 'Excluded from day-based share',
        });
      } else {
        const avgDays = t.applications > 0 ? parseFloat((t.totalDays / t.applications).toFixed(1)) : 0;
        const sharePct = totalApprovedDays > 0
          ? parseFloat(((t.totalDays / totalApprovedDays) * 100).toFixed(1))
          : 0;
        dayBasedTypes.push({
          type: t.type,
          isHourly: false,
          applications: t.applications,
          totalDays: parseFloat(t.totalDays.toFixed(1)),
          avgDaysPerApp: avgDays,
          sharePercent: sharePct,
        });
      }
    });

    dayBasedTypes.sort((a, b) => b.totalDays - a.totalDays);
    hourlyTypes.sort((a, b) => b.applications - a.applications);

    // Highest Leave Category determination
    const highestDaysType = dayBasedTypes[0] || null;
    const mostRequestedType = Object.values(typeMap).sort((a, b) => b.applications - a.applications)[0] || null;

    // 3. Monthly Trend
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const isFuture = year === currentYear && i > currentMonth;
      return {
        monthIndex: i + 1,
        month: MONTHS[i],
        isFuture,
        plannedDays: 0,
        unplannedDays: 0,
        totalDays: 0,
        plannedApplications: 0,
        unplannedApplications: 0,
        totalApplications: 0,
      };
    });

    leaves.forEach(l => {
      const m = new Date(l.startDate).getMonth();
      if (m >= 0 && m < 12) {
        monthly[m].totalApplications += 1;
        if (l.leaveMode === 'Unplanned') monthly[m].unplannedApplications += 1;
        else monthly[m].plannedApplications += 1;

        if (!isHourlyRecord(l)) {
          const days = l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1);
          monthly[m].totalDays += days;
          if (l.leaveMode === 'Unplanned') monthly[m].unplannedDays += days;
          else monthly[m].plannedDays += days;
        }
      }
    });

    monthly.forEach(m => {
      m.plannedDays = parseFloat(m.plannedDays.toFixed(1));
      m.unplannedDays = parseFloat(m.unplannedDays.toFixed(1));
      m.totalDays = parseFloat(m.totalDays.toFixed(1));
    });

    // 4. Employee Utilization Leaderboard
    const empMap = {};
    leaves.forEach(l => {
      const id = l.employeeId?._id?.toString() || 'unassigned';
      const empObj = l.employeeId || { _id: id, name: 'Unassigned / Deleted Employee', department: 'Unassigned' };

      if (!empMap[id]) {
        empMap[id] = {
          _id: empObj._id,
          name: empObj.name,
          department: empObj.department || 'Unassigned',
          employeeId: empObj.employeeId || '',
          profilePhotoUrl: empObj.profilePhotoUrl || '',
          totalApprovedDays: 0,
          totalApplications: 0,
          unplannedDays: 0,
          unplannedApplications: 0,
        };
      }
      empMap[id].totalApplications += 1;
      if (l.leaveMode === 'Unplanned') {
        empMap[id].unplannedApplications += 1;
      }
      if (!isHourlyRecord(l)) {
        const days = l.totalDays || (l.durationType === 'half_day' ? 0.5 : 1);
        empMap[id].totalApprovedDays += days;
        if (l.leaveMode === 'Unplanned') {
          empMap[id].unplannedDays += days;
        }
      }
    });

    const leaderboard = Object.values(empMap).map(e => ({
      _id: e._id,
      name: e.name,
      department: e.department,
      employeeId: e.employeeId,
      profilePhotoUrl: e.profilePhotoUrl,
      totalApprovedDays: parseFloat(e.totalApprovedDays.toFixed(1)),
      totalApplications: e.totalApplications,
      unplannedDays: parseFloat(e.unplannedDays.toFixed(1)),
      unplannedApplications: e.unplannedApplications,
    }));

    res.json({
      success: true,
      data: {
        year,
        statusFilter,
        fullDayRequiredHours,
        totalActiveEmployees,
        totalApplications,
        totalDayApplications,
        totalApprovedDays: parseFloat(totalApprovedDays.toFixed(1)),
        plannedApplications,
        unplannedApplications,
        plannedDays: parseFloat(plannedDays.toFixed(1)),
        unplannedDays: parseFloat(unplannedDays.toFixed(1)),
        unplannedApplicationRate,
        unplannedDayRate,
        avgDaysPerEmployee,
        hourlySummary: {
          totalApplications: totalHourlyApplications,
          totalHours: parseFloat(totalHourlyHours.toFixed(1)),
          equivalentDays: hourlyEquivalentDays,
        },
        highestCategory: {
          highestDays: highestDaysType ? {
            type: highestDaysType.type,
            days: highestDaysType.totalDays,
            sharePercent: highestDaysType.sharePercent,
          } : null,
          mostRequested: mostRequestedType ? {
            type: mostRequestedType.type,
            applications: mostRequestedType.applications,
            isHourly: mostRequestedType.isHourly,
          } : null,
        },
        byDept,
        dayBasedTypes,
        hourlyTypes,
        monthly,
        leaderboard,
      },
    });
  } catch (err) { next(err); }
};
