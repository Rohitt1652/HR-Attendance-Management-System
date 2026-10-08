/**
 * Helper to compute and format actionable Needs Attention categories for HR/Admin/Team Lead Dashboard.
 *
 * Rules:
 * - count > 0 -> show row, make clickable, preserve exact drill-down link, singular/plural wording
 * - count === 0 -> hide row completely
 * - all zero -> positive empty state ("No attendance issues for {periodLabel}.")
 * - header total -> sum of all approved issue classification counts === sum of visible non-zero rows
 */

export function getNeedsAttentionCategories(needsAttention = {}, options = {}) {
  const {
    isTeamLead = false,
    startDate = '',
    endDate = '',
    periodLabel = '',
  } = options;

  const sDate = startDate || '';
  const eDate = endDate || '';

  const unaccHref = isTeamLead
    ? `/admin/attendance?issue=not_marked&startDate=${sDate}&endDate=${eDate}`
    : `/admin/attendance/reconciliation?startDate=${sDate}&endDate=${eDate}&issueType=not_marked`;

  const missingHref = isTeamLead
    ? `/admin/attendance?issue=missing_punch&startDate=${sDate}&endDate=${eDate}`
    : `/admin/attendance/reconciliation?startDate=${sDate}&endDate=${eDate}&issueType=incomplete_punch`;

  const conflictHref = isTeamLead
    ? `/admin/attendance?issue=conflict&startDate=${sDate}&endDate=${eDate}`
    : `/admin/attendance/reconciliation?startDate=${sDate}&endDate=${eDate}&issueType=conflict`;

  const partialLeaveHref = isTeamLead
    ? `/admin/attendance?issue=partial_leave_missing_attendance&startDate=${sDate}&endDate=${eDate}`
    : `/admin/attendance/reconciliation?startDate=${sDate}&endDate=${eDate}&issueType=partial_leave_missing_attendance`;

  const mismatchHref = isTeamLead
    ? `/admin/attendance?issue=portal_biometric_mismatch&startDate=${sDate}&endDate=${eDate}`
    : `/admin/attendance/reconciliation?startDate=${sDate}&endDate=${eDate}&issueType=portal_biometric_mismatch`;

  const shortLeaveHref = isTeamLead
    ? `/admin/attendance?issue=short_leave_missing_attendance&startDate=${sDate}&endDate=${eDate}`
    : `/admin/attendance/reconciliation?startDate=${sDate}&endDate=${eDate}&issueType=short_leave_missing_attendance`;

  const categoryDefinitions = [
    {
      key: 'unaccountedDates',
      count: Number(needsAttention.unaccountedDates || 0),
      singular: 'Unaccounted Date',
      plural: 'Unaccounted Dates',
      href: unaccHref,
      badgeStyle: { background: '#fff7ed', color: '#c2410c' },
    },
    {
      key: 'missingPunches',
      count: Number(needsAttention.missingPunches || 0),
      singular: 'Missing Punch',
      plural: 'Missing Punches',
      href: missingHref,
      badgeStyle: { background: '#fef2f2', color: '#dc2626' },
    },
    {
      key: 'attendanceConflicts',
      count: Number(needsAttention.attendanceConflicts || 0),
      singular: 'Attendance Conflict',
      plural: 'Attendance Conflicts',
      href: conflictHref,
      badgeStyle: { background: '#f3e8ff', color: '#7e22ce' },
    },
    {
      key: 'partialLeaveExceptions',
      count: Number(needsAttention.partialLeaveExceptions || 0),
      singular: 'Partial Leave Exception',
      plural: 'Partial Leave Exceptions',
      href: partialLeaveHref,
      badgeStyle: { background: '#fef3c7', color: '#b45309' },
    },
    {
      key: 'biometricMismatches',
      count: Number(needsAttention.biometricMismatches || 0),
      singular: 'Biometric Mismatch',
      plural: 'Biometric Mismatches',
      href: mismatchHref,
      badgeStyle: { background: '#e0f2fe', color: '#0369a1' },
    },
    {
      key: 'shortLeaveExceptions',
      count: Number(needsAttention.shortLeaveExceptions || 0),
      singular: 'Short Leave Exception',
      plural: 'Short Leave Exceptions',
      href: shortLeaveHref,
      badgeStyle: { background: '#fef3c7', color: '#b45309' },
    },
  ];

  // Invariant: Header total must equal sum of all approved issue classification counts
  const totalCount = categoryDefinitions.reduce((sum, item) => sum + item.count, 0);

  // Render rule: ONLY include rows where count > 0
  const activeCategories = categoryDefinitions
    .filter(item => item.count > 0)
    .map(item => ({
      ...item,
      label: item.count === 1 ? item.singular : item.plural,
    }));

  const visibleSum = activeCategories.reduce((sum, item) => sum + item.count, 0);
  const hasNoIssues = activeCategories.length === 0;
  const activePeriod = periodLabel || needsAttention.periodLabel || 'this period';
  const emptyStateMessage = `No attendance issues for ${activePeriod}.`;

  return {
    categoryDefinitions,
    activeCategories,
    totalCount,
    visibleSum,
    hasNoIssues,
    emptyStateMessage,
    activePeriod,
  };
}
