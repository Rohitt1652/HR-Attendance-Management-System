/**
 * Utility functions for Birthday Popup & Personal Celebration state management & scoping
 * Timezone: Asia/Kolkata
 */

export function getKolkataDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

export function getWishedStorageKey(userId, dateStr) {
  return `birthday_wished_${userId}_${dateStr}`;
}

export function getDismissedStorageKey(userId, dateStr) {
  return `birthday_dismissed_${userId}_${dateStr}`;
}

export function getCelebrationSeenStorageKey(userId, dateStr) {
  return `birthdayCelebrationSeen_${userId}_${dateStr}`;
}

export function getUserId(user) {
  return user?._id || user?.id || null;
}

/**
 * Checks if a birthday employee object matches the authenticated user.
 * Matches by _id/id, employeeId, or email (never display name).
 */
export function isSameUser(emp, user) {
  if (!emp || !user) return false;
  const empId = emp._id || emp.id;
  const userId = user._id || user.id;

  if (empId && userId && String(empId) === String(userId)) {
    return true;
  }
  if (
    emp.employeeId &&
    user.employeeId &&
    String(emp.employeeId).trim().toLowerCase() === String(user.employeeId).trim().toLowerCase()
  ) {
    return true;
  }
  if (
    emp.email &&
    user.email &&
    String(emp.email).trim().toLowerCase() === String(user.email).trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

/**
 * Filters out the logged-in user from the birthday recipients list.
 */
export function getWishableBirthdays(todayBirthdays, user) {
  if (!Array.isArray(todayBirthdays) || !user) return [];
  return todayBirthdays.filter((emp) => !isSameUser(emp, user));
}

/**
 * Returns true if today is the logged-in user's birthday.
 */
export function isUserBirthdayToday(todayBirthdays, user) {
  if (!Array.isArray(todayBirthdays) || !user) return false;
  return todayBirthdays.some((emp) => isSameUser(emp, user));
}

/**
 * Determines whether to show the personal full-screen birthday celebration.
 * Scoped by user ID and Asia/Kolkata business date in localStorage.
 */
export function shouldShowBirthdayCelebration({ todayBirthdays, user, now = new Date(), storage = {} }) {
  if (!isUserBirthdayToday(todayBirthdays, user)) return false;

  const userId = getUserId(user);
  if (!userId) return false;

  const dateStr = getKolkataDateString(now);
  const localStore = storage.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);

  if (localStore?.getItem(getCelebrationSeenStorageKey(userId, dateStr))) {
    return false;
  }

  return true;
}

/**
 * Records that the logged-in user has seen their personal birthday celebration for the business date.
 */
export function recordBirthdayCelebrationSeen({ user, now = new Date(), storage = {} }) {
  const userId = getUserId(user);
  if (!userId) return;

  const dateStr = getKolkataDateString(now);
  const localStore = storage.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (localStore) {
    localStore.setItem(getCelebrationSeenStorageKey(userId, dateStr), 'seen');
  }
}

/**
 * Determines whether to show the normal Wish Them All birthday popup for colleagues.
 * Excludes self from recipients list and respects wished / dismissed storage flags.
 */
export function shouldShowBirthdayPopup({ wishableBirthdays, todayBirthdays, user, now = new Date(), storage = {} }) {
  const wishables = wishableBirthdays !== undefined ? wishableBirthdays : getWishableBirthdays(todayBirthdays, user);
  if (!wishables || wishables.length === 0) return false;

  const userId = getUserId(user);
  if (!userId) return false; // Do not fall back to guest while loading identity

  const dateStr = getKolkataDateString(now);
  const localStore = storage.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);
  const sessionStore = storage.sessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : null);

  if (localStore?.getItem(getWishedStorageKey(userId, dateStr))) {
    return false;
  }

  if (sessionStore?.getItem(getDismissedStorageKey(userId, dateStr))) {
    return false;
  }

  return true;
}

export function recordBirthdayWished({ user, now = new Date(), storage = {} }) {
  const userId = getUserId(user);
  if (!userId) return;

  const dateStr = getKolkataDateString(now);
  const localStore = storage.localStorage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (localStore) {
    localStore.setItem(getWishedStorageKey(userId, dateStr), 'wished');
  }
}

export function recordBirthdayDismissed({ user, now = new Date(), storage = {} }) {
  const userId = getUserId(user);
  if (!userId) return;

  const dateStr = getKolkataDateString(now);
  const sessionStore = storage.sessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (sessionStore) {
    sessionStore.setItem(getDismissedStorageKey(userId, dateStr), 'dismissed');
  }
}

export function filterUpcomingBirthdays(upcomingBirthdays, now = new Date()) {
  if (!Array.isArray(upcomingBirthdays)) return [];

  const kolkataParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);

  let currentMonth = now.getMonth() + 1;
  let currentDay = now.getDate();

  for (const part of kolkataParts) {
    if (part.type === 'month') currentMonth = parseInt(part.value, 10);
    if (part.type === 'day') currentDay = parseInt(part.value, 10);
  }

  return upcomingBirthdays.filter(p => !(p.birthdayMonth === currentMonth && p.birthdayDay === currentDay));
}

