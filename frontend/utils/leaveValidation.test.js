import { describe, it, expect } from 'vitest';
import { getRestrictedLeaveSequenceConflict, RESTRICTED_LEAVE_MESSAGE } from './leaveValidation';

describe('getRestrictedLeaveSequenceConflict', () => {
  it('returns null for non-restricted leave types', () => {
    const result = getRestrictedLeaveSequenceConflict({
      leaveType: 'Work From Home',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      existingLeaves: [{ leaveType: 'Casual Leave', startDate: '2026-08-09', endDate: '2026-08-09' }],
    });

    expect(result).toBeNull();
  });

  it('returns null when there is no adjacent restricted leave', () => {
    const result = getRestrictedLeaveSequenceConflict({
      leaveType: 'Casual Leave',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      existingLeaves: [{ leaveType: 'Medical Leave', startDate: '2026-08-08', endDate: '2026-08-08' }],
    });

    expect(result).toBeNull();
  });

  it('returns a message when existing restricted leave is adjacent before the request', () => {
    const result = getRestrictedLeaveSequenceConflict({
      leaveType: 'Casual Leave',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      existingLeaves: [{ leaveType: 'Medical Leave', startDate: '2026-08-09', endDate: '2026-08-09' }],
    });

    expect(result).toBe(RESTRICTED_LEAVE_MESSAGE);
  });

  it('returns a message when existing restricted leave is adjacent after the request', () => {
    const result = getRestrictedLeaveSequenceConflict({
      leaveType: 'Privileged Leave',
      startDate: '2026-08-10',
      endDate: '2026-08-12',
      existingLeaves: [{ leaveType: 'Paid Leave', startDate: '2026-08-13', endDate: '2026-08-13' }],
    });

    expect(result).toBe(RESTRICTED_LEAVE_MESSAGE);
  });

  it('returns null for the same restricted leave type adjacent to itself', () => {
    const result = getRestrictedLeaveSequenceConflict({
      leaveType: 'Paid Leave',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      existingLeaves: [{ leaveType: 'Paid Leave', startDate: '2026-08-09', endDate: '2026-08-09' }],
    });

    expect(result).toBeNull();
  });
});
