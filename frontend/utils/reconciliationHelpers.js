/**
 * Utility functions for Missing Attendance Reconciliation
 * Timezone: Asia/Kolkata
 */

export function getISTDateParts(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const dateStr = formatter.format(d); // "YYYY-MM-DD"
  const [year, month, day] = dateStr.split('-').map(Number);
  const istDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = istDate.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  return { year, month, day, dateStr, istDate, dayOfWeek };
}

export function getPresetDateRange(preset, currentDate = new Date()) {
  const todayParts = getISTDateParts(currentDate);
  const yesterdayDate = new Date(todayParts.istDate.getTime() - 86400000);
  const yesterdayParts = getISTDateParts(yesterdayDate);

  if (preset === 'yesterday') {
    return {
      startDate: yesterdayParts.dateStr,
      endDate: yesterdayParts.dateStr,
    };
  }

  if (preset === 'this_week') {
    if (todayParts.dayOfWeek === 1) {
      // Monday: Complete previous Monday through Sunday
      const prevMondayDate = new Date(todayParts.istDate.getTime() - 7 * 86400000);
      return {
        startDate: getISTDateParts(prevMondayDate).dateStr,
        endDate: yesterdayParts.dateStr,
      };
    } else {
      // Tuesday through Sunday: Current Monday through Yesterday
      const daysToSub = todayParts.dayOfWeek === 0 ? 6 : todayParts.dayOfWeek - 1;
      const currentMondayDate = new Date(todayParts.istDate.getTime() - daysToSub * 86400000);
      return {
        startDate: getISTDateParts(currentMondayDate).dateStr,
        endDate: yesterdayParts.dateStr,
      };
    }
  }

  if (preset === 'this_month') {
    if (todayParts.day >= 2) {
      // From 2nd onward: 1st of current month through Yesterday
      const startStr = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-01`;
      return {
        startDate: startStr,
        endDate: yesterdayParts.dateStr,
      };
    } else {
      // On the 1st: Complete previous calendar month
      const prevMonthYear = todayParts.month === 1 ? todayParts.year - 1 : todayParts.year;
      const prevMonth = todayParts.month === 1 ? 12 : todayParts.month - 1;
      const lastDayOfPrevMonth = new Date(Date.UTC(prevMonthYear, prevMonth, 0)).getUTCDate();
      return {
        startDate: `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-01`,
        endDate: `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`,
      };
    }
  }

  if (preset === 'last_month') {
    const prevMonthYear = todayParts.month === 1 ? todayParts.year - 1 : todayParts.year;
    const prevMonth = todayParts.month === 1 ? 12 : todayParts.month - 1;
    const lastDayOfPrevMonth = new Date(Date.UTC(prevMonthYear, prevMonth, 0)).getUTCDate();
    return {
      startDate: `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-01`,
      endDate: `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`,
    };
  }

  return {
    startDate: yesterdayParts.dateStr,
    endDate: yesterdayParts.dateStr,
  };
}

export const INITIAL_PRESET = 'this_month';
export const VALID_PRESETS = ['yesterday', 'this_week', 'this_month', 'last_month'];

/**
 * Resolves the initial activePreset based on URL query parameters
 */
export function resolveInitialPreset(urlPreset, urlStart, urlEnd) {
  if (urlPreset && VALID_PRESETS.includes(urlPreset)) {
    return urlPreset;
  }
  if (!urlStart && !urlEnd) {
    return INITIAL_PRESET;
  }
  return null;
}

/**
 * Reducer for managing Quick Date Preset State transitions
 */
export function reconciliationPresetReducer(state, action) {
  switch (action.type) {
    case 'SELECT_PRESET': {
      if (!VALID_PRESETS.includes(action.preset)) return state;
      const { startDate, endDate } = getPresetDateRange(action.preset, action.currentDate);
      return {
        ...state,
        activePreset: action.preset,
        startDate,
        endDate,
      };
    }
    case 'MANUAL_DATE_CHANGE': {
      return {
        ...state,
        activePreset: null,
        ...(action.startDate !== undefined ? { startDate: action.startDate } : {}),
        ...(action.endDate !== undefined ? { endDate: action.endDate } : {}),
      };
    }
    case 'CLEAR_FILTERS': {
      const defaultPreset = INITIAL_PRESET;
      const { startDate, endDate } = getPresetDateRange(defaultPreset, action.currentDate);
      return {
        ...state,
        activePreset: defaultPreset,
        startDate,
        endDate,
      };
    }
    default:
      return state;
  }
}

/**
 * Returns aria-pressed attribute string for preset buttons
 */
export function getPresetAriaPressed(activePreset, presetKey) {
  return activePreset === presetKey ? 'true' : 'false';
}

export function calculateReconciliationRate(reconciled, checked) {
  const numChecked = Number(checked) || 0;
  const numReconciled = Number(reconciled) || 0;

  if (numChecked <= 0) {
    return 'N/A';
  }

  const rate = Math.round((numReconciled / numChecked) * 100);
  return rate;
}

export function shouldShowHighUnaccountedWarning(unaccounted, checked) {
  const numChecked = Number(checked) || 0;
  const numUnaccounted = Number(unaccounted) || 0;

  if (numChecked <= 0) {
    return false;
  }

  return (numUnaccounted / numChecked) >= 0.5;
}

export function formatCsvFilename(startDate, endDate) {
  const start = startDate || 'start';
  const end = endDate || 'end';
  return `missing-attendance-reconciliation-${start}-to-${end}.csv`;
}

/**
 * Validates YYYY-MM-DD date string
 */
export function isValidIsoDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return dateObj.getUTCFullYear() === y && dateObj.getUTCMonth() === m - 1 && dateObj.getUTCDate() === d;
}

/**
 * Builds a safe Attendance page URL with employee and date parameters for Reconciliation deep-linking
 */
export function buildAttendanceUrl(employeeId, date) {
  const params = new URLSearchParams();
  if (employeeId && String(employeeId).trim() !== '') {
    params.set('employeeId', String(employeeId).trim());
  }
  if (isValidIsoDate(date)) {
    params.set('startDate', date);
    params.set('endDate', date);
  }
  params.set('from', 'reconciliation');
  return `/admin/attendance?${params.toString()}`;
}

/**
 * Returns guidance text for Recommended Action column instead of duplicate navigation links
 */
export function getRecommendedActionGuidance(issueType) {
  switch (issueType) {
    case 'not_marked':
      return 'Verify whether Leave, WFH, or attendance should be recorded.';
    case 'pending_leave':
      return 'Review the pending leave request.';
    case 'incomplete_punch':
      return 'Verify and correct the missing punch.';
    case 'conflict':
      return 'Review the attendance and approved leave/WFH overlap.';
    case 'portal_biometric_mismatch':
      return 'Verify portal attendance against biometric evidence.';
    case 'partial_leave_missing_attendance':
      return 'Verify complementary half-day attendance.';
    case 'short_leave_missing_attendance':
      return 'Verify attendance for the remaining working hours.';
    default:
      return 'Verify exception details and evidence.';
  }
}

/**
 * Formats YYYY-MM-DD into "11 Sep 2026"
 */
export function formatPrettyDate(dateStr) {
  if (!isValidIsoDate(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * Parses and validates Attendance page search parameters
 */
export function parseAttendanceQueryParams(searchParams) {
  if (!searchParams) return { fromReconciliation: false };
  const from = searchParams.get('from');
  const employeeId = searchParams.get('employeeId') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const issue = searchParams.get('issue') || '';
  const status = searchParams.get('status') || '';
  const workMode = searchParams.get('workMode') || '';
  const dayType = searchParams.get('dayType') || '';

  const fromReconciliation = from === 'reconciliation';
  const hasValidDates = isValidIsoDate(startDate) && isValidIsoDate(endDate);

  return {
    fromReconciliation,
    employeeId,
    issue,
    status,
    workMode,
    dayType,
    startDate: hasValidDates ? startDate : '',
    endDate: hasValidDates ? endDate : '',
    isValid: (fromReconciliation || Boolean(issue) || Boolean(status) || Boolean(employeeId)) && hasValidDates,
  };
}
