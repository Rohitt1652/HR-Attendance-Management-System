const { interpretPunches, getSinglePunchCutoff } = require('../../src/utils/punchInterpretationUtils');

describe('punchInterpretationUtils', () => {
  describe('getSinglePunchCutoff', () => {
    test('uses explicit singlePunchCutoff when provided', () => {
      const settings = { singlePunchCutoff: '12:00' };
      expect(getSinglePunchCutoff(settings)).toBe('12:00');
    });

    test('calculates midpoint when officeStartTime and officeEndTime exist', () => {
      const settings = { officeStartTime: '09:00', officeEndTime: '18:00' };
      expect(getSinglePunchCutoff(settings)).toBe('13:30');
    });

    test('falls back to officeStartTime + (fullDayRequiredHours / 2) when officeEndTime is missing', () => {
      const settings = { officeStartTime: '09:00', fullDayRequiredHours: 9.0 };
      expect(getSinglePunchCutoff(settings)).toBe('13:30');
    });
  });

  describe('interpretPunches', () => {
    const settings = { officeStartTime: '09:00', fullDayRequiredHours: 9.0 }; // Cutoff 13:30

    test('returns nulls for 0 punches', () => {
      const res = interpretPunches([], '2026-09-04', settings);
      expect(res).toEqual({
        checkIn: null,
        checkOut: null,
        punchCount: 0,
        directionalIssue: null,
      });
    });

    test('interprets early single punch (10:05) as checkIn (missing_check_out)', () => {
      const res = interpretPunches(['10:05'], '2026-09-04', settings);
      expect(res).toEqual({
        checkIn: '10:05',
        checkOut: null,
        punchCount: 1,
        directionalIssue: 'missing_check_out',
      });
    });

    test('interprets late single punch (18:15) as checkOut (missing_check_in)', () => {
      const res = interpretPunches(['18:15'], '2026-09-04', settings);
      expect(res).toEqual({
        checkIn: null,
        checkOut: '18:15',
        punchCount: 1,
        directionalIssue: 'missing_check_in',
      });
    });

    test('interprets exact cutoff punch (13:30) as checkOut (missing_check_in)', () => {
      const res = interpretPunches(['13:30'], '2026-09-04', settings);
      expect(res).toEqual({
        checkIn: null,
        checkOut: '13:30',
        punchCount: 1,
        directionalIssue: 'missing_check_in',
      });
    });

    test('interprets multiple punches as first checkIn and last checkOut', () => {
      const res = interpretPunches(['09:15', '13:00', '18:15'], '2026-09-04', settings);
      expect(res).toEqual({
        checkIn: '09:15',
        checkOut: '18:15',
        punchCount: 3,
        directionalIssue: null,
      });
    });
  });
});
