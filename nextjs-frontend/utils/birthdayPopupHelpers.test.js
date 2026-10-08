import { describe, test, beforeEach, expect } from 'vitest';
import {
  getKolkataDateString,
  getWishedStorageKey,
  getDismissedStorageKey,
  getCelebrationSeenStorageKey,
  shouldShowBirthdayPopup,
  recordBirthdayWished,
  recordBirthdayDismissed,
  filterUpcomingBirthdays,
  isSameUser,
  getWishableBirthdays,
  isUserBirthdayToday,
  shouldShowBirthdayCelebration,
  recordBirthdayCelebrationSeen,
} from './birthdayPopupHelpers';

class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('Birthday Popup & State Scoping Unit Tests', () => {
  let localStorageMock;
  let sessionStorageMock;
  const userA = { _id: 'user_123', employeeId: 'EMP123', email: 'yugam@company.com', name: 'Yugam Uppal' };
  const userB = { _id: 'user_456', employeeId: 'EMP456', email: 'akash@company.com', name: 'Akash Kumar' };
  const todayBirthdays = [
    { _id: 'user_123', employeeId: 'EMP123', email: 'yugam@company.com', name: 'Yugam Uppal' },
    { _id: 'user_456', employeeId: 'EMP456', email: 'akash@company.com', name: 'Akash Kumar' },
    { _id: 'emp_99', employeeId: 'EMP099', email: 'shruti@company.com', name: 'Shruti' },
  ];

  beforeEach(() => {
    localStorageMock = new MockStorage();
    sessionStorageMock = new MockStorage();
  });

  test('1. First visit + birthday today -> popup opens (returns true)', () => {
    const show = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userA,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(show).toBe(true);
  });

  test('2. Unauthenticated / loading user identity -> returns false (does not use guest fallback)', () => {
    const show = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: null,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(show).toBe(false);
  });

  test('3. Successful Wish Them All -> sets wished flag in localStorage and suppresses popup', () => {
    recordBirthdayWished({
      user: userA,
      storage: { localStorage: localStorageMock },
    });
    const dateStr = getKolkataDateString();
    expect(localStorageMock.getItem(getWishedStorageKey(userA._id, dateStr))).toBe('wished');

    const show = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userA,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(show).toBe(false);
  });

  test('4. Refresh / rerender on same date after Wish Them All -> stays closed (wished in localStorage)', () => {
    recordBirthdayWished({
      user: userA,
      storage: { localStorage: localStorageMock },
    });

    // Simulate page refresh (new sessionStorage, existing localStorage)
    sessionStorageMock.clear();

    const show = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userA,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(show).toBe(false);
  });

  test('5. X or Not Now -> sets dismissed flag in sessionStorage (NOT localStorage)', () => {
    recordBirthdayDismissed({
      user: userA,
      storage: { sessionStorage: sessionStorageMock },
    });
    const dateStr = getKolkataDateString();
    expect(sessionStorageMock.getItem(getDismissedStorageKey(userA._id, dateStr))).toBe('dismissed');
    expect(localStorageMock.getItem(getWishedStorageKey(userA._id, dateStr))).toBeNull();

    const show = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userA,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(show).toBe(false);
  });

  test('6. New browser session after only X / Not Now -> eligible to show popup again', () => {
    // User dismissed in session 1
    recordBirthdayDismissed({
      user: userA,
      storage: { sessionStorage: sessionStorageMock },
    });

    // New browser session (sessionStorage cleared)
    const newSessionStorage = new MockStorage();

    const show = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userA,
      storage: { localStorage: localStorageMock, sessionStorage: newSessionStorage },
    });
    expect(show).toBe(true);
  });

  test('7. Wish failure -> no completion flag set, retryable (shouldShowBirthdayPopup remains true)', () => {
    // Failure happens, recordBirthdayWished is NOT called
    const show = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userA,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(show).toBe(true);
  });

  test('8. Different authenticated user -> previous user state does not suppress popup', () => {
    recordBirthdayWished({
      user: userA,
      storage: { localStorage: localStorageMock },
    });

    const showUserB = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userB,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(showUserB).toBe(true);
  });

  test('9. Next Asia/Kolkata date -> eligible again', () => {
    const today = new Date();
    recordBirthdayWished({
      user: userA,
      now: today,
      storage: { localStorage: localStorageMock },
    });

    // Tomorrow in Asia/Kolkata
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const showTomorrow = shouldShowBirthdayPopup({
      todayBirthdays: [{ _id: 'emp_99', name: 'John Birthday' }],
      user: userA,
      now: tomorrow,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(showTomorrow).toBe(true);
  });

  test('10. filterUpcomingBirthdays strictly excludes today birthdays', () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const upcomingList = [
      { _id: '1', name: 'Today Bday', birthdayMonth: currentMonth, birthdayDay: currentDay },
      { _id: '2', name: 'Future Bday', birthdayMonth: currentMonth, birthdayDay: currentDay + 1 },
    ];

    const filtered = filterUpcomingBirthdays(upcomingList, now);
    expect(filtered.map(b => b.name)).toEqual(['Future Bday']);
  });

  test('11. Self-exclusion: getWishableBirthdays excludes logged-in user by _id, employeeId, or email', () => {
    const wishables = getWishableBirthdays(todayBirthdays, userA);
    expect(wishables.map(b => b.name)).toEqual(['Akash Kumar', 'Shruti']);

    // Match by employeeId fallback
    const userByEmpId = { employeeId: 'EMP123' };
    expect(getWishableBirthdays(todayBirthdays, userByEmpId).map(b => b.name)).toEqual(['Akash Kumar', 'Shruti']);

    // Match by email fallback
    const userByEmail = { email: 'YUGAM@COMPANY.COM' };
    expect(getWishableBirthdays(todayBirthdays, userByEmail).map(b => b.name)).toEqual(['Akash Kumar', 'Shruti']);
  });

  test('12. isUserBirthdayToday returns true if user is in todayBirthdays', () => {
    expect(isUserBirthdayToday(todayBirthdays, userA)).toBe(true);
    expect(isUserBirthdayToday(todayBirthdays, { _id: 'user_999' })).toBe(false);
  });

  test('13. Personal birthday celebration: shows when today is user birthday and not seen today', () => {
    const show = shouldShowBirthdayCelebration({
      todayBirthdays,
      user: userA,
      storage: { localStorage: localStorageMock },
    });
    expect(show).toBe(true);

    // Record seen
    recordBirthdayCelebrationSeen({ user: userA, storage: { localStorage: localStorageMock } });
    const dateStr = getKolkataDateString();
    expect(localStorageMock.getItem(getCelebrationSeenStorageKey(userA._id, dateStr))).toBe('seen');

    // Subsequent check on same date returns false
    const showAgain = shouldShowBirthdayCelebration({
      todayBirthdays,
      user: userA,
      storage: { localStorage: localStorageMock },
    });
    expect(showAgain).toBe(false);
  });

  test('14. Personal celebration suppression is per-user and per-date', () => {
    recordBirthdayCelebrationSeen({ user: userA, storage: { localStorage: localStorageMock } });

    // User B on same browser has not seen their celebration
    const showUserB = shouldShowBirthdayCelebration({
      todayBirthdays,
      user: userB,
      storage: { localStorage: localStorageMock },
    });
    expect(showUserB).toBe(true);
  });

  test('15. Single birthday (user only): wishableBirthdays is empty -> shouldShowBirthdayPopup returns false', () => {
    const singleUserBirthday = [{ _id: 'user_123', name: 'Yugam Uppal' }];
    const wishables = getWishableBirthdays(singleUserBirthday, userA);
    expect(wishables.length).toBe(0);

    const showModal = shouldShowBirthdayPopup({
      wishableBirthdays: wishables,
      user: userA,
      storage: { localStorage: localStorageMock, sessionStorage: sessionStorageMock },
    });
    expect(showModal).toBe(false);
  });
});

