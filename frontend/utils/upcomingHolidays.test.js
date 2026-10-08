import { describe, it, expect } from 'vitest';
import { buildUpcomingHolidays, getHolidayDaysLeft } from './upcomingHolidays';

describe('buildUpcomingHolidays', () => {
  const now = new Date(2026, 7, 18); // Aug 18, 2026

  it('includes settings holidays and national holidays', () => {
    const holidays = buildUpcomingHolidays({
      settingsHolidays: [{ date: '2026-09-05', name: 'Company Off' }],
      now,
      limit: 5,
    });

    expect(holidays.some((h) => h.name === 'Company Off')).toBe(true);
    expect(holidays.some((h) => h.name.includes('Gandhi Jayanti'))).toBe(true);
    expect(holidays.some((h) => h.name.includes('Republic Day'))).toBe(true);
  });

  it('includes calendar holiday events', () => {
    const holidays = buildUpcomingHolidays({
      calendarEvents: [{ type: 'holiday', date: '2026-11-01', title: 'Diwali' }],
      now,
      limit: 5,
    });

    expect(holidays.some((h) => h.name === 'Diwali')).toBe(true);
  });

  it('deduplicates same holiday from multiple sources', () => {
    const holidays = buildUpcomingHolidays({
      settingsHolidays: [{ date: '2026-10-02', name: 'Gandhi Jayanti' }],
      now,
      limit: 5,
    });

    const gandhi = holidays.filter((h) => h.date.getFullYear() === 2026 && h.name.includes('Gandhi Jayanti'));
    expect(gandhi.length).toBe(1);
  });
});

describe('getHolidayDaysLeft', () => {
  it('counts whole days from today', () => {
    const now = new Date(2026, 7, 18, 15, 30);
    const target = new Date(2026, 9, 2);
    expect(getHolidayDaysLeft(target, now)).toBe(45);
  });
});
