/**
 * Centralized Business Date Utilities
 * Timezone: Asia/Kolkata (IST, UTC+05:30)
 */

const ATTENDANCE_TIME_ZONE = 'Asia/Kolkata';

/**
 * Format any Date object or ISO timestamp string into YYYY-MM-DD in Asia/Kolkata timezone
 */
function formatBusinessDate(dateInput) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    return null;
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Get current business date (YYYY-MM-DD) in Asia/Kolkata
 */
function getTodayBusinessDate() {
  return formatBusinessDate(new Date());
}

/**
 * Get yesterday's business date (YYYY-MM-DD) relative to a given IST date string (defaults to today)
 */
function getYesterdayBusinessDate(referenceDateStr = getTodayBusinessDate()) {
  if (!referenceDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)) {
    return formatBusinessDate(new Date(Date.now() - 86400000));
  }
  const [y, m, d] = referenceDateStr.split('-').map(Number);
  const prevDate = new Date(Date.UTC(y, m - 1, d - 1));
  return prevDate.toISOString().slice(0, 10);
}

/**
 * Get half-open UTC Date range for an Asia/Kolkata business date (YYYY-MM-DD)
 * 2026-09-15 00:00:00 IST -> 2026-09-14 18:30:00.000 UTC ($gte: start)
 * 2026-09-16 00:00:00 IST -> 2026-09-15 18:30:00.000 UTC ($lt: nextDayStart)
 */
function getBusinessDayUtcRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // IST is UTC+5:30 -> IST 00:00:00 is previous day 18:30:00 UTC
  const startMs = Date.UTC(y, m - 1, d - 1, 18, 30, 0, 0);
  const nextDayStartMs = Date.UTC(y, m - 1, d, 18, 30, 0, 0);
  return {
    start: new Date(startMs),
    nextDayStart: new Date(nextDayStartMs),
  };
}

/**
 * Get half-open UTC Date range covering inclusive business date range [startDateStr, endDateStr]
 */
function getBusinessDateRangeUtcBounds(startDateStr, endDateStr) {
  const startRange = getBusinessDayUtcRange(startDateStr);
  const endRange = getBusinessDayUtcRange(endDateStr);
  return {
    start: startRange.start,
    nextDayStart: endRange.nextDayStart,
  };
}

/**
 * Parse a YYYY-MM-DD string into a machine-independent UTC Date object for day/month/year calculations
 */
function parseUtcDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

module.exports = {
  ATTENDANCE_TIME_ZONE,
  formatBusinessDate,
  getTodayBusinessDate,
  getYesterdayBusinessDate,
  getBusinessDayUtcRange,
  getBusinessDateRangeUtcBounds,
  parseUtcDateString,
};
