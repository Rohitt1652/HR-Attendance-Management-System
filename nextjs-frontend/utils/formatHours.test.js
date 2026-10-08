import { describe, it, expect } from 'vitest';
import { formatHours } from './formatHours';

describe('formatHours', () => {
  it('formats repeating decimal numbers to 2 decimal places maximum without trailing zeros', () => {
    expect(formatHours(1.6666666666666667)).toBe(1.67);
    expect(formatHours(1.3333333333333333)).toBe(1.33);
    expect(formatHours(1.85)).toBe(1.85);
    expect(formatHours(2.0000)).toBe(2);
  });

  it('handles null, undefined, or invalid inputs gracefully', () => {
    expect(formatHours(null)).toBe(0);
    expect(formatHours(undefined)).toBe(0);
    expect(formatHours('abc')).toBe(0);
  });
});
