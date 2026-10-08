const Leave = require('../models/Leave');
const LeaveType = require('../models/LeaveType');
const LeaveAllocation = require('../models/LeaveAllocation');

// ── Shared CODE_MAP: old migrated MySQL codes → current codes ─────────────────
const CODE_MAP = {
  // Casual Leave
  'CASUA': 'CL',   'CASUAL': 'CL',   'C.L.': 'CL',   'CL': 'CL',
  // Privileged Leave
  'PRIVI': 'PRIV', 'PRIVIL': 'PRIV', 'PRIV': 'PRIV', 'P.L.': 'PRIV', 'PRIVILEGEDLEAVE': 'PRIV',
  // Medical Leave → ML
  'MEDIC': 'ML',   'MEDICAL': 'ML',  'MEDICA': 'ML',
  'SICK':  'ML',   'SICKL': 'ML',    'M.L.': 'ML',   'MEDICALLEAVE': 'ML',
  // Short Leave → SL
  'SHORT': 'SL',   'SHRT': 'SL',     'SHORTL': 'SL', 'S.L.': 'SL',   'SHORTLEAVE': 'SL',
  'BIRTHDAYSHORTLEAVE': 'BSL', 'BIRTHDAYSHORT': 'BSL', 'BIRTHDAYSL': 'BSL', 'BSL': 'BSL',
  // Work From Home
  'WORKF': 'WFH',  'WORKFR': 'WFH',  'W.H.': 'WFH',  'WORKFROMHOME': 'WFH',
  // Paid Leave
  'PAID':  'PL',   'PAIDL': 'PL',
  // Emergency Leave → EL
  'EMERG': 'EL',   'EMPLOY': 'EL',   'EMPLO': 'EL',
  // Marital / Marriage Leave → MARL
  'MARIT': 'MARL', 'MARITA': 'MARL', 'MARITAL': 'MARL', 'M.L.MARITAL': 'MARL',
  'MARITALLEAVE': 'MARL', 'MARRIAGELEAVE': 'MARL', 'MARRIAGE': 'MARL',
  // Maternity → MTL
  'MATER': 'MTL',  'MATERN': 'MTL',  'MATERNITY': 'MTL', 'MATERNITYLEAVE': 'MTL',
  'MATERNITY/PATERNITYLEAVE': 'MTL',
  // Paternity → PTL
  'PATER': 'PTL',  'PATERN': 'PTL',  'PATERNITY': 'PTL', 'PATERNITYLEAVE': 'PTL',
  // Parental Leave → PARL
  'PAREN': 'PARL', 'PARENTAL': 'PARL', 'PARENTALLEAVE': 'PARL', 'PR.L.': 'PARL',
  // Compensatory Off → COMP
  'COMPE': 'COMP', 'COMPEN': 'COMP', 'COMPENSATORYOFF': 'COMP', 'C.OFF': 'COMP', 'CPL': 'COMP', 'CPS': 'COMP',
  // Loss of Pay → LOP
  'LOSSO': 'LOP',  'LOSSOF': 'LOP',  'LOSSOFPAY': 'LOP', 'L.O.P.': 'LOP',
  // Official Visit → OV
  'OFFIC': 'OV',   'OFFICIALEAVE': 'OV', 'O.L.': 'OV',
  // Demise Leave → DL
  'DEMIS': 'DL',   'DEMISE': 'DL',   'DEMISELEAVE': 'DL', 'D.L.': 'DL',
  // Relaxation Leave → RL
  'RELAX': 'RL',   'RELAXA': 'RL',   'RELAXATIONLEAVE': 'RL', 'R.L.': 'RL',
  // Blood Donation Leave → BDL
  'BLOOD': 'BDL',  'EMPBLD': 'BDL',  'EMPLOYEEBLOODDONATION': 'BDL', 'E.B.D.': 'BDL',
  // Organ Donor Leave → ODL
  'ORGAN': 'ODL',  'ORGAND': 'ODL',  'ORGANDONORLEAVE': 'ODL', 'O.D.L.': 'ODL',
  // School Visitation Leave → SVL
  'SCHOO': 'SVL',  'SCHOOL': 'SVL',  'SCHOOLVISITATIONLEAVE': 'SVL', 'S.V.L.': 'SVL',
  // Mandatory Leave → MDL
  'MANDA': 'MDL',  'MANDATORY': 'MDL', 'MANDATORYLEAVE': 'MDL', 'MD.L.': 'MDL',
  // Monthly Leave (old) → SL
  'MONTH': 'SL',   'MONTHLYLEAVE': 'SL', 'MN.L.': 'SL',
  // Note: bare 'SL' is Short Leave — do NOT remap it
};

const normalizeCode = (code) => {
  if (!code) return code;
  const upper = String(code).toUpperCase().trim();
  return CODE_MAP[upper] || code;
};

function getLeaveAllocation() {
  return LeaveAllocation;
}

function getLeaveDays(l) {
  if (l.durationType === 'half_day') return 0.5;
  if (l.durationType === 'hourly') return (l.totalHours || 0) / 8;
  return l.totalDays || 1;
}

function getMonthlyBalanceUnit(leaveType) {
  if (leaveType.maxPerMonth) return 'count';
  if (leaveType.allowHourly && !leaveType.allowHalfDay && leaveType.maxHoursPerApplication) return 'hours';
  return 'days';
}

function getBalanceUnit(leaveType, allocation) {
  if (allocation) {
    if (allocation.notApplicable || allocation.daysAllowed <= 0) return 'not_applicable';
    if (allocation.isEarned) return 'earned';
    if (allocation.period === 'monthly') {
      if (leaveType.allowHalfDay) return 'days';
      return 'count';
    }
    if (allocation.daysAllowed > 0) return 'days';
  }
  if (leaveType.maxPerMonth) return 'count';
  if (leaveType.allowHourly && !leaveType.allowHalfDay && leaveType.maxHoursPerApplication) return 'hours';
  return 'days';
}

function getMaxHoursPerApplication(leaveType) {
  if (leaveType.maxHoursPerApplication) return leaveType.maxHoursPerApplication;
  return null;
}

function isFixedDayQuotaAllocation(allocation, leaveType) {
  if (!allocation || allocation.notApplicable || allocation.isEarned || allocation.period === 'monthly') return false;
  const daysAllowed = allocation.daysAllowed ?? leaveType.maxDaysPerYear;
  return daysAllowed != null && daysAllowed > 0;
}

function roundDays(value) {
  return parseFloat((value || 0).toFixed(1));
}

function isSameMonthDay(left, right) {
  if (!left || !right) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return leftDate.getMonth() === rightDate.getMonth() && leftDate.getDate() === rightDate.getDate();
}

function computeBiannualQuotas(daysAllowed, h1Days, carryForward, h1Used) {
  const h1Quota = h1Days != null ? h1Days : (daysAllowed != null ? daysAllowed / 2 : null);
  const h2BaseQuota = daysAllowed != null ? daysAllowed - (h1Quota ?? 0) : null;
  const h1Unused = h1Quota != null ? Math.max(0, h1Quota - h1Used) : 0;
  const h2Quota = h2BaseQuota != null ? h2BaseQuota + (carryForward ? h1Unused : 0) : null;
  return { h1Quota, h2Quota, h1Unused };
}

async function getBalanceForUser(user, asOfDate) {
  const requestedDate = asOfDate ? new Date(`${asOfDate}T00:00:00`) : new Date();
  const now = Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate;
  const year = now.getFullYear();
  const currentHalf = now.getMonth() < 6 ? 'H1' : 'H2';
  const yearStart = new Date(year, 0, 1);
  const h1End = new Date(year, 5, 30, 23, 59, 59);
  const h2Start = new Date(year, 6, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const allocations = await getLeaveAllocation().find({ role: user.role });
  const role = user.role;
  const leaveTypes = (await LeaveType.find({
    isActive: true,
    $or: [
      { visibleToRoles: { $exists: false } },
      { visibleToRoles: { $size: 0 } },
      { visibleToRoles: role },
    ],
  })).filter(lt => !lt.birthdayOnly || isSameMonthDay(now, user.dateOfBirth));

  const allApproved = await Leave.find({
    employeeId: user._id,
    status: { $in: ['Approved', 'Pending'] },
    startDate: { $gte: yearStart, $lte: yearEnd },
  });

  return leaveTypes.map(lt => {
    const alloc = allocations.find(a => a.leaveTypeCode === lt.code);
    const daysAllowed = alloc?.daysAllowed ?? lt.maxDaysPerYear ?? null;
    const period = alloc?.period || 'biannual';
    const carryForward = alloc?.carryForward !== false;
    const matchesCode = (l) => {
      const normalized = normalizeCode(l.leaveTypeCode);
      return normalized === lt.code || l.leaveTypeCode === lt.code;
    };

    if (lt.birthdayOnly) {
      const usedThisYear = allApproved.some(l => matchesCode(l));
      return {
        code: lt.code, name: lt.name, color: lt.color,
        allowFullDay: lt.allowFullDay !== false, allowHourly: lt.allowHourly, allowHalfDay: lt.allowHalfDay,
        birthdayOnly: true,
        maxHoursPerApplication: getMaxHoursPerApplication(lt),
        maxPerMonth: null, daysAllowed: 1, period: 'birthday',
        isEarned: false, isFixedDayQuota: false, isFreeHand: false,
        carryForward: false, unit: 'count',
        h1Quota: null, h2Quota: null, h1Days: null, h2Days: null,
        annualTotal: 1, currentHalf: null,
        h1Used: 0, h2Used: 0, carryForwardDays: 0,
        currentPeriodLabel: `Birthday ${year}`,
        used: usedThisYear ? 1 : 0,
        remaining: usedThisYear ? 0 : 1,
        totalUsed: usedThisYear ? 1 : 0,
        totalRemaining: usedThisYear ? 0 : 1,
        allocatedDays: 1,
        usedDays: usedThisYear ? 1 : 0,
        pendingDays: 0,
        usedPendingDays: usedThisYear ? 1 : 0,
        availableBalance: usedThisYear ? 0 : 1,
      };
    }

    if (lt.isFreeHand) {
      const usedDays = allApproved
        .filter(l => l.status === 'Approved' && matchesCode(l))
        .reduce((s, l) => s + getLeaveDays(l), 0);
      const pendingDays = allApproved
        .filter(l => l.status === 'Pending' && matchesCode(l))
        .reduce((s, l) => s + getLeaveDays(l), 0);
      return {
        code: lt.code, name: lt.name, color: lt.color,
        allowFullDay: lt.allowFullDay !== false, allowHourly: lt.allowHourly, allowHalfDay: lt.allowHalfDay,
        maxHoursPerApplication: getMaxHoursPerApplication(lt),
        maxPerMonth: null, daysAllowed: null, period: 'none',
        isEarned: false, isFixedDayQuota: false, isFreeHand: true,
        carryForward: false, unit: 'days',
        h1Quota: null, h2Quota: null, h1Days: null, h2Days: null,
        annualTotal: null, currentHalf: null,
        h1Used: 0, h2Used: 0, carryForwardDays: 0,
        currentPeriodLabel: 'No quota (approval-based)',
        used: roundDays(usedDays + pendingDays),
        remaining: null,
        totalUsed: roundDays(usedDays + pendingDays),
        totalRemaining: null,
        allocatedDays: null,
        usedDays: roundDays(usedDays),
        pendingDays: roundDays(pendingDays),
        usedPendingDays: roundDays(usedDays + pendingDays),
        availableBalance: null,
      };
    }

    if (period === 'monthly') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const unit = getBalanceUnit(lt, alloc);
      const usageValue = (l) => unit === 'count' ? 1 : getLeaveDays(l);
      const monthUsed = allApproved
        .filter(l => matchesCode(l) && new Date(l.startDate) >= monthStart && new Date(l.startDate) <= monthEnd)
        .reduce((s, l) => s + usageValue(l), 0);
      const monthLimit = alloc?.daysAllowed ?? lt.maxPerMonth ?? 2;
      const monthApproved = allApproved
        .filter(l => l.status === 'Approved' && matchesCode(l) && new Date(l.startDate) >= monthStart && new Date(l.startDate) <= monthEnd)
        .reduce((s, l) => s + usageValue(l), 0);
      const monthPending = allApproved
        .filter(l => l.status === 'Pending' && matchesCode(l) && new Date(l.startDate) >= monthStart && new Date(l.startDate) <= monthEnd)
        .reduce((s, l) => s + usageValue(l), 0);
      const availableBalance = Math.max(0, monthLimit - monthUsed);
      return {
        code: lt.code, name: lt.name, color: lt.color,
        allowFullDay: lt.allowFullDay !== false, allowHourly: lt.allowHourly, allowHalfDay: lt.allowHalfDay,
        maxHoursPerApplication: getMaxHoursPerApplication(lt),
        maxPerMonth: lt.maxPerMonth || monthLimit,
        daysAllowed: monthLimit,
        period: 'monthly',
        isEarned: !!alloc?.isEarned,
        isFixedDayQuota: false,
        carryForward: false,
        unit,
        currentPeriodLabel: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`,
        used: roundDays(monthUsed),
        remaining: roundDays(availableBalance),
        totalUsed: roundDays(monthUsed),
        totalRemaining: roundDays(availableBalance),
        allocatedDays: monthLimit,
        usedDays: roundDays(monthApproved),
        pendingDays: roundDays(monthPending),
        usedPendingDays: roundDays(monthUsed),
        availableBalance: roundDays(availableBalance),
        h1Quota: null, h2Quota: null, h1Used: 0, h2Used: 0, carryForwardDays: 0,
      };
    }

    const h1Used = allApproved
      .filter(l => matchesCode(l) && new Date(l.startDate) <= h1End)
      .reduce((s, l) => s + getLeaveDays(l), 0);

    const h2Used = allApproved
      .filter(l => matchesCode(l) && new Date(l.startDate) >= h2Start)
      .reduce((s, l) => s + getLeaveDays(l), 0);

    const totalUsed = h1Used + h2Used;

    const { h1Quota, h2Quota, h1Unused } = computeBiannualQuotas(
      daysAllowed,
      alloc?.h1Days,
      carryForward,
      h1Used,
    );
    const h2BaseQuota = daysAllowed != null ? daysAllowed - (h1Quota ?? 0) : null;

    let currentQuota, currentUsed, currentPeriodLabel;
    if (period === 'annual') {
      currentQuota = daysAllowed;
      currentUsed = totalUsed;
      currentPeriodLabel = `${year}`;
    } else if (currentHalf === 'H1') {
      currentQuota = h1Quota;
      currentUsed = h1Used;
      currentPeriodLabel = `H1 ${year} (Jan–Jun)`;
    } else {
      currentQuota = h2Quota;
      currentUsed = h2Used;
      currentPeriodLabel = `H2 ${year} (Jul–Dec)`;
    }

    const periodLeaves = allApproved.filter(l => {
      const leaveDate = new Date(l.startDate);
      if (!matchesCode(l)) return false;
      if (period === 'annual') return true;
      if (currentHalf === 'H1') return leaveDate <= h1End;
      return leaveDate >= h2Start;
    });
    const usedDays = periodLeaves
      .filter(l => l.status === 'Approved')
      .reduce((s, l) => s + getLeaveDays(l), 0);
    const pendingDays = periodLeaves
      .filter(l => l.status === 'Pending')
      .reduce((s, l) => s + getLeaveDays(l), 0);
    const usedPendingDays = usedDays + pendingDays;
    const availableBalance = currentQuota != null ? Math.max(0, currentQuota - usedPendingDays) : null;

    return {
      code: lt.code,
      name: lt.name,
      color: lt.color,
      allowFullDay: lt.allowFullDay !== false,
      allowHourly: lt.allowHourly,
      allowHalfDay: lt.allowHalfDay,
      maxHoursPerApplication: getMaxHoursPerApplication(lt),
      maxPerMonth: lt.maxPerMonth || null,
      unit: getBalanceUnit(lt, alloc),
      daysAllowed,
      period,
      isEarned: !!alloc?.isEarned,
      isFixedDayQuota: isFixedDayQuotaAllocation(alloc, lt),
      carryForward,
      h1Quota,
      h2Quota,
      h1Days: h1Quota,
      h2Days: h2BaseQuota,
      annualTotal: daysAllowed,
      currentHalf,
      h1Used: parseFloat(h1Used.toFixed(1)),
      h2Used: parseFloat(h2Used.toFixed(1)),
      carryForwardDays: carryForward ? parseFloat(h1Unused.toFixed(1)) : 0,
      currentPeriodLabel,
      used: parseFloat(currentUsed.toFixed(1)),
      remaining: availableBalance != null ? roundDays(availableBalance) : null,
      totalUsed: parseFloat(totalUsed.toFixed(1)),
      totalRemaining: daysAllowed != null ? parseFloat((daysAllowed - totalUsed).toFixed(1)) : null,
      allocatedDays: currentQuota,
      usedDays: roundDays(usedDays),
      pendingDays: roundDays(pendingDays),
      usedPendingDays: roundDays(usedPendingDays),
      availableBalance: availableBalance != null ? roundDays(availableBalance) : null,
    };
  });
}

async function buildChatBalanceContext(user) {
  const MAIN_CODES = ['CL', 'PRIV', 'ML'];
  const balance = await getBalanceForUser(user);

  const filtered = balance.filter(b => {
    if (b.isFreeHand || b.unit === 'not_applicable' || b.birthdayOnly) return false;
    return (b.allocatedDays != null && b.allocatedDays > 0) || b.used > 0 || b.remaining != null;
  });

  const mainBalances = filtered.filter(b => MAIN_CODES.includes(b.code));
  const otherBalances = filtered.filter(b => !MAIN_CODES.includes(b.code));
  const mainTotal = mainBalances.reduce((s, b) => s + (b.remaining ?? 0), 0);

  let context = '';
  if (mainBalances.length) {
    context += `\nAllocated Leave Balance (main 20 days split as CL+PRIV+ML per half-year): ${mainBalances.map(b => `${b.code}: ${b.remaining} remaining of ${b.allocatedDays ?? b.daysAllowed} (${b.currentPeriodLabel || b.period})`).join(', ')}. Total main leaves remaining: ${parseFloat(mainTotal.toFixed(1))}`;
  }
  if (otherBalances.length) {
    context += `\nOther Leave Balance: ${otherBalances.map(b => {
      const allowed = b.allocatedDays ?? b.daysAllowed;
      const remaining = b.remaining != null ? b.remaining : 'unlimited';
      const allowedPart = allowed != null ? ` of ${allowed}` : '';
      return `${b.code}: ${remaining} remaining${allowedPart} (${b.currentPeriodLabel || b.period})`;
    }).join(', ')}`;
  }
  context += `\nIMPORTANT: When user asks "how many leaves remain", answer with ONLY main allocated leaves (CL, PRIV, ML). Short Leave and WFH are NOT day-based leaves — they are hourly/monthly counted separately.`;
  return context;
}

module.exports = {
  CODE_MAP,
  normalizeCode,
  getLeaveAllocation,
  getLeaveDays,
  getBalanceUnit,
  getMaxHoursPerApplication,
  isFixedDayQuotaAllocation,
  roundDays,
  isSameMonthDay,
  computeBiannualQuotas,
  getBalanceForUser,
  buildChatBalanceContext,
};
