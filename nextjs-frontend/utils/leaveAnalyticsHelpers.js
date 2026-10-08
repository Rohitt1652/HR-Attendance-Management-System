/**
 * Presentation-only helper utilities for Leave Analytics Dashboard.
 * All authoritative totals, percentages, shares, rankings, and averages
 * are computed on the backend.
 */

export function formatDays(val) {
  if (val === null || val === undefined || isNaN(val)) return '0 days';
  const num = Number(val);
  return `${num} ${num === 1 ? 'day' : 'days'}`;
}

export function formatHours(val) {
  if (val === null || val === undefined || isNaN(val)) return '0 hours';
  const num = Number(val);
  const formatted = parseFloat(num.toFixed(2));
  return `${formatted} ${formatted === 1 ? 'hour' : 'hours'}`;
}

export function formatPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '0%';
  const num = Number(val);
  const formatted = parseFloat(num.toFixed(1));
  return `${formatted}%`;
}

export function normalizeLeaveTypeName(name) {
  if (!name) return 'Other';
  const trimmed = String(name).trim();
  // Plural label fixes: e.g. "Marital Leaves" -> "Marital Leave"
  if (trimmed === 'Marital Leaves') return 'Marital Leave';
  if (trimmed === 'Short Leaves') return 'Short Leave';
  if (trimmed === 'Emergency Leaves') return 'Emergency Leave';
  return trimmed;
}

export function getStatusTextLabel(status) {
  switch (status) {
    case 'Pending':
      return 'Pending Requested Days';
    case 'Rejected':
      return 'Rejected Requested Days';
    case 'All':
      return 'Total Requested Days';
    case 'Approved':
    default:
      return 'Approved Leave Days';
  }
}

export function getStatusSubLabel(status, totalApps) {
  switch (status) {
    case 'Pending':
      return `${totalApps} pending applications`;
    case 'Rejected':
      return `${totalApps} rejected applications`;
    case 'All':
      return `${totalApps} total applications`;
    case 'Approved':
    default:
      return `${totalApps} approved applications`;
  }
}
