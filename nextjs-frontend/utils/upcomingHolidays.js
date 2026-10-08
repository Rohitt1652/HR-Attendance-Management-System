const NATIONAL_HOLIDAYS = [
  { month: 1, day: 26, name: 'Republic Day' },
  { month: 8, day: 15, name: 'Independence Day' },
  { month: 10, day: 2, name: 'Gandhi Jayanti' },
];

export const HOLIDAY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseHolidayDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

function buildNationalHolidays(year) {
  return NATIONAL_HOLIDAYS.map((holiday) => ({
    date: new Date(year, holiday.month - 1, holiday.day),
    name: `${holiday.name} 🇮🇳`,
    source: 'national',
  }));
}

function normalizeHolidayName(name) {
  return String(name || '').replace(/🇮🇳/g, '').trim().toLowerCase();
}

/**
 * Merge settings holidays, calendar holiday events, and national holidays.
 */
export function buildUpcomingHolidays({
  settingsHolidays = [],
  calendarEvents = [],
  limit = 5,
  now = new Date(),
} = {}) {
  const today = startOfDay(now);
  const year = today.getFullYear();

  const fromSettings = settingsHolidays
    .map((holiday) => ({
      date: parseHolidayDate(holiday.date),
      name: holiday.name,
      source: 'settings',
    }))
    .filter((holiday) => holiday.date);

  const fromEvents = calendarEvents
    .filter((event) => event.type === 'holiday' && event.isActive !== false)
    .map((event) => ({
      date: parseHolidayDate(event.date),
      name: event.title || event.name,
      source: 'calendar',
    }))
    .filter((holiday) => holiday.date);

  const national = [...buildNationalHolidays(year), ...buildNationalHolidays(year + 1)];

  const upcoming = [...fromSettings, ...fromEvents, ...national]
    .filter((holiday) => holiday.date >= today)
    .sort((a, b) => a.date - b.date);

  const seen = new Set();
  const unique = [];
  for (const holiday of upcoming) {
    const y = holiday.date.getFullYear();
    const m = String(holiday.date.getMonth() + 1).padStart(2, '0');
    const d = String(holiday.date.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}|${normalizeHolidayName(holiday.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(holiday);
  }

  return unique.slice(0, limit);
}

export function getHolidayDaysLeft(holidayDate, now = new Date()) {
  const today = startOfDay(now);
  const target = startOfDay(holidayDate);
  return Math.round((target - today) / 86400000);
}
