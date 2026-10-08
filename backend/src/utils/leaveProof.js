const { normalizeCode } = require('../services/leaveBalanceService');

const PROOF_REQUIRED_CODES = new Set(['BDL']);
const MEDICAL_PROOF_THRESHOLD_DAYS = 2;

function isBloodDonationLeaveType(leaveTypeOrCode) {
  if (!leaveTypeOrCode) return false;
  if (typeof leaveTypeOrCode === 'string') {
    const upper = leaveTypeOrCode.toUpperCase();
    return normalizeCode(upper) === 'BDL' || upper.includes('BLOOD');
  }
  const code = normalizeCode(leaveTypeOrCode.code || '');
  const name = String(leaveTypeOrCode.name || '').toLowerCase();
  return code === 'BDL' || name.includes('blood donation');
}

function isMedicalLeaveType(leaveTypeOrCode) {
  if (!leaveTypeOrCode) return false;
  if (typeof leaveTypeOrCode === 'string') {
    const upper = leaveTypeOrCode.toUpperCase();
    const code = normalizeCode(upper);
    return code === 'ML' || upper.includes('MEDICAL') || upper.includes('MEDIC');
  }
  const code = normalizeCode(leaveTypeOrCode.code || '');
  const name = String(leaveTypeOrCode.name || '').toLowerCase();
  return code === 'ML' || name.includes('medical');
}

function isMedicalLeaveRecord(leave) {
  if (!leave) return false;
  return isMedicalLeaveType({ code: leave.leaveTypeCode, name: leave.leaveType });
}

function toDateString(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function expandLeaveToDateStrings(leave) {
  if (!leave?.startDate) return [];
  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate || leave.startDate);
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dates = [];
  while (cur <= endDay) {
    dates.push(toDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function expandApplicationToDateStrings(options = {}) {
  const { durationType, startDate, endDate } = options;
  if (!startDate) return [];
  if (durationType === 'hourly') return [toDateString(startDate)];
  return expandLeaveToDateStrings({ startDate, endDate: endDate || startDate });
}

function maxContinuousDaysForAnchors(dateSet, anchorDates) {
  if (!anchorDates?.length) return 0;
  let maxRun = 0;
  for (const anchor of anchorDates) {
    if (!dateSet.has(anchor)) continue;
    let count = 1;
    const base = new Date(anchor + 'T12:00:00');
    const prev = new Date(base);
    prev.setDate(prev.getDate() - 1);
    while (dateSet.has(toDateString(prev))) {
      count += 1;
      prev.setDate(prev.getDate() - 1);
    }
    const next = new Date(base);
    next.setDate(next.getDate() + 1);
    while (dateSet.has(toDateString(next))) {
      count += 1;
      next.setDate(next.getDate() + 1);
    }
    if (count > maxRun) maxRun = count;
  }
  return maxRun;
}

function computeMedicalContinuousDays(existingLeaves = [], options = {}) {
  const dateSet = new Set();
  for (const leave of existingLeaves) {
    if (!isMedicalLeaveRecord(leave)) continue;
    expandLeaveToDateStrings(leave).forEach((d) => dateSet.add(d));
  }
  const newDates = expandApplicationToDateStrings(options);
  newDates.forEach((d) => dateSet.add(d));
  return maxContinuousDaysForAnchors(dateSet, newDates);
}

function computeRequestedLeaveDays(durationType, startDate, endDate) {
  if (durationType === 'half_day') return 0.5;
  if (durationType === 'hourly') return 0;
  if (!startDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  const ms = end - start;
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

function requiresLeaveProof(leaveTypeOrCode, options = {}) {
  if (isBloodDonationLeaveType(leaveTypeOrCode)) return true;

  if (isMedicalLeaveType(leaveTypeOrCode)) {
    if (options.continuousDays != null) {
      return Number(options.continuousDays) > MEDICAL_PROOF_THRESHOLD_DAYS;
    }
    if (options.existingLeaves?.length) {
      return computeMedicalContinuousDays(options.existingLeaves, options) > MEDICAL_PROOF_THRESHOLD_DAYS;
    }
    const requestedDays = options.requestedDays != null
      ? Number(options.requestedDays)
      : computeRequestedLeaveDays(options.durationType, options.startDate, options.endDate);
    return requestedDays > MEDICAL_PROOF_THRESHOLD_DAYS;
  }

  return false;
}

function getLeaveProofRequirementMessage(leaveTypeOrCode, options = {}) {
  if (isBloodDonationLeaveType(leaveTypeOrCode)) {
    return 'Blood donation slip proof is required for Blood Donation Leave.';
  }
  if (isMedicalLeaveType(leaveTypeOrCode) && requiresLeaveProof(leaveTypeOrCode, options)) {
    return 'Medical certificate proof is required when Medical Leave exceeds 2 consecutive days (including adjacent single-day applications).';
  }
  return 'Leave proof is required for this application.';
}

function isHalfDayOnlyLeaveType(leaveTypeOrCode) {
  return isBloodDonationLeaveType(leaveTypeOrCode);
}

module.exports = {
  requiresLeaveProof,
  getLeaveProofRequirementMessage,
  isHalfDayOnlyLeaveType,
  isBloodDonationLeaveType,
  isMedicalLeaveType,
  isMedicalLeaveRecord,
  computeRequestedLeaveDays,
  computeMedicalContinuousDays,
  MEDICAL_PROOF_THRESHOLD_DAYS,
  PROOF_REQUIRED_CODES,
};
