export const RESTRICTED_LEAVE_NAMES = new Set(['Casual Leave', 'Medical Leave', 'Paid Leave', 'Privileged Leave']);
export const RESTRICTED_LEAVE_MESSAGE = 'Cannot apply this leave next to another paid leave type (Casual, Medical, Paid, or Privileged) without at least one working day in between.';

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameOrAdjacent(requestedStart, requestedEnd, existingStart, existingEnd) {
  const adjacentStart = new Date(requestedStart);
  adjacentStart.setDate(adjacentStart.getDate() - 1);
  const adjacentEnd = new Date(requestedEnd);
  adjacentEnd.setDate(adjacentEnd.getDate() + 1);
  return existingEnd >= adjacentStart && existingStart <= adjacentEnd;
}

export function getRestrictedLeaveSequenceConflict({ leaveType, startDate, endDate, existingLeaves = [] }) {
  if (!RESTRICTED_LEAVE_NAMES.has(leaveType)) return null;
  const requestedStart = toDateOnly(startDate);
  const requestedEnd = toDateOnly(endDate || startDate);
  if (!requestedStart || !requestedEnd) return null;

  const conflict = existingLeaves.some((leave) => {
    const existingName = leave.leaveType || '';
    if (!RESTRICTED_LEAVE_NAMES.has(existingName) || existingName === leaveType) return false;
    const existingStart = toDateOnly(leave.startDate);
    const existingEnd = toDateOnly(leave.endDate || leave.startDate);
    if (!existingStart || !existingEnd) return false;
    return isSameOrAdjacent(requestedStart, requestedEnd, existingStart, existingEnd);
  });

  return conflict ? RESTRICTED_LEAVE_MESSAGE : null;
}
