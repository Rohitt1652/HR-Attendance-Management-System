/**
 * Compute working hours as decimal between two Date objects.
 */
const ATTENDANCE_TIME_ZONE = 'Asia/Kolkata';

const computeWorkingHours = (checkIn, checkOut) => {
  const ms = new Date(checkOut) - new Date(checkIn);
  return ms / (1000 * 60 * 60);
};

/**
 * Classify attendance status based on working hours.
 * < 4h  → Half Day
 * 4–8h  → Present
 * >= 8h → Full Day
 */
const classifyStatus = (hours) => {
  if (hours < 4) return 'Half Day';
  if (hours >= 8) return 'Full Day';
  return 'Present';
};

/**
 * Returns true if checkInTime (Date) is strictly after threshold ("HH:MM").
 */
const isLateCheckIn = (checkInTime, threshold) => {
  const d = new Date(checkInTime);
  if (Number.isNaN(d.getTime())) return false;
  const [th, tm] = threshold.split(':').map(Number);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  const minute = Number(parts.find(p => p.type === 'minute')?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;
  const checkInMinutes = hour * 60 + minute;
  const thresholdMinutes = th * 60 + tm;
  return checkInMinutes > thresholdMinutes;
};

module.exports = { computeWorkingHours, classifyStatus, isLateCheckIn };
