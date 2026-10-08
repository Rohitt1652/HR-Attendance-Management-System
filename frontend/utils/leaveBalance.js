export function isDayBasedBalance(balance) {
  if (!balance) return false;
  if (typeof balance.isFixedDayQuota === 'boolean') return balance.isFixedDayQuota;
  return (balance.unit || 'days') === 'days'
    && balance.period !== 'monthly'
    && !balance.isEarned
    && balance.daysAllowed != null
    && balance.daysAllowed > 0;
}

export function getAvailableBalance(balance) {
  if (!balance) return null;
  return balance.availableBalance ?? balance.remaining ?? balance.totalRemaining ?? null;
}

/** Higher = more available; free-hand / unlimited sorts first. */
export function getLeaveBalanceSortValue(balance) {
  if (!balance) return -1;
  if (balance.isFreeHand) return Number.POSITIVE_INFINITY;
  const avail = getAvailableBalance(balance);
  if (avail === null) return Number.POSITIVE_INFINITY;
  return Number(avail);
}

export function sortLeavesByBalance(leaves = []) {
  return [...leaves].sort((a, b) => {
    const diff = getLeaveBalanceSortValue(b) - getLeaveBalanceSortValue(a);
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export function getDayBalanceTotals(balances = []) {
  return balances.filter(isDayBasedBalance).reduce((totals, balance) => {
    const used = Number(balance.totalUsed ?? balance.usedPendingDays ?? balance.used ?? 0);
    const remaining = Number(balance.totalRemaining ?? getAvailableBalance(balance) ?? 0);
    return {
      used: totals.used + used,
      remaining: totals.remaining + remaining,
      allocated: totals.allocated + used + remaining,
    };
  }, { allocated: 0, used: 0, remaining: 0 });
}

export function getBalanceViewValues(balance, view = 'half') {
  const yearly = view === 'year';
  const periodView = !isDayBasedBalance(balance) || balance?.period === 'monthly';

  if (periodView) {
    const used = Number(balance?.used ?? 0);
    const remaining = Number(balance?.remaining ?? 0);
    const quota = Number(balance?.remaining != null ? used + remaining : balance?.daysAllowed || 0);
    return { used, remaining, quota, periodLabel: balance?.period === 'monthly' ? 'this month' : 'this half' };
  }

  if (yearly) {
    return {
      used: Number(balance?.totalUsed ?? 0),
      remaining: Number(balance?.totalRemaining ?? 0),
      quota: Number(balance?.daysAllowed ?? 0),
      periodLabel: 'this year',
    };
  }

  const currentHalf = balance?.currentHalf || (new Date().getMonth() < 6 ? 'H1' : 'H2');
  const isH1 = currentHalf === 'H1' || String(balance?.currentPeriodLabel || '').startsWith('H1');
  const annualTotal = Number(balance?.annualTotal ?? balance?.daysAllowed ?? 0);
  const h1Quota = balance?.h1Days != null ? Number(balance.h1Days) : (balance?.h1Quota != null ? Number(balance.h1Quota) : annualTotal / 2);
  // h2Quota includes unused H1 carry-forward from the backend. Prefer it over
  // h2Days, which is only the base H2 allocation.
  const h2Quota = balance?.h2Quota != null
    ? Number(balance.h2Quota)
    : (balance?.h2Days != null ? Number(balance.h2Days) : (annualTotal ? annualTotal - h1Quota : 0));
  const quota = isH1 ? h1Quota : h2Quota;
  const used = Number(isH1 ? (balance?.h1Used ?? balance?.usedPendingDays ?? balance?.used ?? 0) : (balance?.h2Used ?? balance?.usedPendingDays ?? balance?.used ?? 0));
  const remaining = Math.max(0, quota - used);

  return { used, remaining, quota, periodLabel: 'this half' };
}
