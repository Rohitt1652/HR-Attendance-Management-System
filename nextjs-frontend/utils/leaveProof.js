export const MEDICAL_PROOF_THRESHOLD_DAYS = 2;

export function isBloodDonationLeaveName(name) {
  return String(name || '').toLowerCase().includes('blood donation');
}

export function isMedicalLeaveName(name) {
  return String(name || '').toLowerCase().includes('medical');
}

export function isBloodDonationLeaveType(leaveType) {
  if (!leaveType) return false;
  if (typeof leaveType === 'string') {
    const upper = leaveType.toUpperCase();
    return upper === 'BDL' || isBloodDonationLeaveName(leaveType);
  }
  const code = String(leaveType.code || leaveType.leaveTypeCode || '').toUpperCase();
  const name = String(leaveType.name || leaveType.leaveType || '').toLowerCase();
  return code === 'BDL' || isBloodDonationLeaveName(name);
}

export function isMedicalLeaveType(leaveType) {
  if (!leaveType) return false;
  if (typeof leaveType === 'string') {
    const upper = leaveType.toUpperCase();
    return upper === 'ML' || upper.includes('MEDICAL') || isMedicalLeaveName(leaveType);
  }
  const code = String(leaveType.code || leaveType.leaveTypeCode || '').toUpperCase();
  const name = String(leaveType.name || leaveType.leaveType || '').toLowerCase();
  return code === 'ML' || isMedicalLeaveName(name);
}

function isMedicalLeaveRecord(leave) {
  if (!leave) return false;
  return isMedicalLeaveType({ code: leave.leaveTypeCode, name: leave.leaveType });
}

function toDateString(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function expandLeaveToDateStrings(leave) {
  if (!leave?.startDate) return [];
  const start = toDateString(leave.startDate);
  const end = toDateString(leave.endDate || leave.startDate);
  const dates = [];
  const cur = new Date(start + 'T12:00:00');
  const endDay = new Date(end + 'T12:00:00');
  while (cur <= endDay) {
    dates.push(toDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function expandApplicationToDateStrings(form) {
  if (!form?.startDate) return [];
  if (form.durationType === 'hourly') return [toDateString(form.startDate)];
  const endDate = form.durationType === 'full_day' ? (form.endDate || form.startDate) : form.startDate;
  return expandLeaveToDateStrings({ startDate: form.startDate, endDate });
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

export function computeMedicalContinuousDays(existingLeaves = [], form) {
  const dateSet = new Set();
  for (const leave of existingLeaves) {
    if (!isMedicalLeaveRecord(leave)) continue;
    if (!['Pending', 'Approved'].includes(leave.status)) continue;
    expandLeaveToDateStrings(leave).forEach((d) => dateSet.add(d));
  }
  const newDates = expandApplicationToDateStrings(form);
  newDates.forEach((d) => dateSet.add(d));
  return maxContinuousDaysForAnchors(dateSet, newDates);
}

export function computeRequestedLeaveDays(form) {
  if (!form) return null;
  if (form.durationType === 'half_day' && form.startDate) return 0.5;
  if (form.durationType === 'full_day' && form.startDate && form.endDate) {
    const days = Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1;
    return days > 0 ? days : null;
  }
  if (form.durationType === 'hourly') return 0;
  return null;
}

export function requiresLeaveProof(leaveType, requestedDays = null, options = {}) {
  if (isBloodDonationLeaveType(leaveType)) return true;
  if (isMedicalLeaveType(leaveType)) {
    if (options.continuousDays != null) {
      return Number(options.continuousDays) > MEDICAL_PROOF_THRESHOLD_DAYS;
    }
    if (options.existingLeaves?.length && options.form) {
      return computeMedicalContinuousDays(options.existingLeaves, options.form) > MEDICAL_PROOF_THRESHOLD_DAYS;
    }
    if (requestedDays != null) {
      return Number(requestedDays) > MEDICAL_PROOF_THRESHOLD_DAYS;
    }
  }
  return false;
}

export function getLeaveProofRequirement(leaveType, requestedDays = null, options = {}) {
  if (isBloodDonationLeaveType(leaveType)) {
    return {
      required: true,
      kind: 'bdl',
      label: 'Blood Donation Slip',
      hint: 'Upload donation certificate or slip (PDF or image, max 5MB)',
      errorMessage: 'Please attach blood donation slip proof',
    };
  }
  const continuousDays = options.continuousDays != null
    ? Number(options.continuousDays)
    : (options.existingLeaves?.length && options.form
      ? computeMedicalContinuousDays(options.existingLeaves, options.form)
      : (requestedDays != null ? Number(requestedDays) : null));

  if (isMedicalLeaveType(leaveType) && continuousDays != null && continuousDays > MEDICAL_PROOF_THRESHOLD_DAYS) {
    return {
      required: true,
      kind: 'medical',
      label: 'Medical Certificate',
      hint: 'Required when Medical Leave exceeds 2 consecutive days, including adjacent single-day applications (PDF or image, max 5MB)',
      errorMessage: 'Please attach medical certificate proof',
    };
  }
  return null;
}

export function isHalfDayOnlyLeaveType(leaveType) {
  return isBloodDonationLeaveType(leaveType);
}

export function getLeaveProofUrl(leaveId) {
  return `/api/leaves/${leaveId}/proof`;
}
