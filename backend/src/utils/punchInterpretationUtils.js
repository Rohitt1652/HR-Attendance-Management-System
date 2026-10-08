/**
 * Utility functions for interpreting biometric punches and resolving single-punch directions.
 */

/**
 * Resolves the single-punch cutoff time in "HH:mm" format.
 * Hierarchy:
 * 1. Explicit settings.singlePunchCutoff if configured.
 * 2. Midpoint of officeStartTime & officeEndTime if both are configured.
 * 3. Fallback derived midpoint: officeStartTime + (fullDayRequiredHours / 2)
 *    For default "09:00" + 4.5h = "13:30" (1:30 PM IST).
 *
 * @param {Object} settings Attendance settings object
 * @returns {string} Cutoff time in "HH:mm" format
 */
function getSinglePunchCutoff(settings = {}) {
  // 1. Explicit override
  if (settings.singlePunchCutoff && typeof settings.singlePunchCutoff === 'string') {
    return settings.singlePunchCutoff;
  }

  const officeStartTime = settings.officeStartTime || '09:00';
  const officeEndTime = settings.officeEndTime;

  // 2. Midpoint of start and end if both exist
  if (officeEndTime && typeof officeEndTime === 'string') {
    const [startH, startM] = officeStartTime.split(':').map(Number);
    const [endH, endM] = officeEndTime.split(':').map(Number);
    const startMins = startH * 60 + (startM || 0);
    const endMins = endH * 60 + (endM || 0);
    if (endMins > startMins) {
      const midMins = Math.floor((startMins + endMins) / 2);
      const h = Math.floor(midMins / 60).toString().padStart(2, '0');
      const m = (midMins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    }
  }

  // 3. Fallback: officeStartTime + (fullDayRequiredHours / 2)
  const requiredHours = Number(settings.fullDayRequiredHours) || 9.0;
  const halfRequiredMins = Math.floor((requiredHours / 2) * 60);
  const [startH, startM] = officeStartTime.split(':').map(Number);
  const totalMins = (startH * 60 + (startM || 0)) + halfRequiredMins;

  const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const m = (totalMins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Interprets an array of punch time strings (e.g. ["18:15"] or ["09:15", "18:15"])
 * into a normalized object containing checkIn, checkOut, punchCount, and directionalIssue.
 *
 * @param {string[]} rawTimes Array of time strings in "HH:mm" format
 * @param {string} dateStr YYYY-MM-DD date string
 * @param {Object} settings Attendance settings
 * @returns {Object} { checkIn, checkOut, punchCount, directionalIssue }
 */
function interpretPunches(rawTimes = [], dateStr = '', settings = {}) {
  // Sort and deduplicate timestamps
  const uniqueTimes = Array.from(new Set(rawTimes.filter(Boolean))).sort((a, b) => a.localeCompare(b));

  if (uniqueTimes.length === 0) {
    return {
      checkIn: null,
      checkOut: null,
      punchCount: 0,
      directionalIssue: null,
    };
  }

  if (uniqueTimes.length === 1) {
    const singlePunch = uniqueTimes[0];
    const cutoff = getSinglePunchCutoff(settings);

    // punch < cutoff -> Check-In (Missing Check-Out)
    // punch >= cutoff -> Check-Out (Missing Check-In)
    if (singlePunch < cutoff) {
      return {
        checkIn: singlePunch,
        checkOut: null,
        punchCount: 1,
        directionalIssue: 'missing_check_out',
      };
    } else {
      return {
        checkIn: null,
        checkOut: singlePunch,
        punchCount: 1,
        directionalIssue: 'missing_check_in',
      };
    }
  }

  // 2 or more punches
  return {
    checkIn: uniqueTimes[0],
    checkOut: uniqueTimes[uniqueTimes.length - 1],
    punchCount: uniqueTimes.length,
    directionalIssue: null,
  };
}

module.exports = {
  getSinglePunchCutoff,
  interpretPunches,
};
