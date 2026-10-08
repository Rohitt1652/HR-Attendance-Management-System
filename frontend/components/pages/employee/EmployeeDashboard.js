'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getMyDashboardSummary } from '@/api/attendanceApi';
import { getMyBalance } from '@/api/leaveApi';
import { getTodayBirthdays, getUpcomingBirthdays } from '@/api/employeeApi';
import { getDayMenu } from '@/api/cafeMenuApi';
import { getSettings } from '@/api/settingsApi';
import { getEvents } from '@/api/calendarEventApi';
import { listPolicies, getPendingPolicies } from '@/api/policyApi';
import { buildUpcomingHolidays, getHolidayDaysLeft, HOLIDAY_MONTHS } from '@/utils/upcomingHolidays';
import {
  shouldShowBirthdayPopup,
  recordBirthdayWished,
  recordBirthdayDismissed,
  filterUpcomingBirthdays,
  getWishableBirthdays,
  shouldShowBirthdayCelebration,
  recordBirthdayCelebrationSeen,
} from '@/utils/birthdayPopupHelpers';
import BirthdayModal from '@/components/BirthdayModal';
import BirthdayCelebration from '@/components/BirthdayCelebration';
import PolicyAcceptanceModal from '@/components/PolicyAcceptanceModal';
import { ENABLE_CAFE_FEATURE } from '@/utils/featureFlags';

import { useAuth } from '@/context/AuthContext';
import {
  CalendarCheck, Clock, Palmtree, AlertCircle, CalendarDays, Coffee, Cake,
  UtensilsCrossed, Sparkles, ClipboardList, CheckCircle2, AlertTriangle,
  ShieldAlert, UserCheck, FileText, Plus, Gift
} from 'lucide-react';
import styles from './EmployeeDashboard.module.css';

const MONTHS = HOLIDAY_MONTHS;

function HolidayIllustration() {
  return (
    <svg width="140" height="85" viewBox="0 0 140 85" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.heroSvg}>
      {/* Background soft glow */}
      <circle cx="95" cy="42" r="38" fill="#fde68a" fillOpacity="0.4" />
      <circle cx="118" cy="28" r="22" fill="#fef08a" fillOpacity="0.5" />
      
      {/* Plant leaves behind */}
      <path d="M118 42 C118 28 126 18 132 14 C130 23 123 32 118 42 Z" fill="#d97706" opacity="0.6" />
      <path d="M122 46 C126 35 136 30 140 26 C136 35 128 43 122 46 Z" fill="#eab308" opacity="0.7" />

      {/* Desk Calendar Easel Stand */}
      <path d="M85 24 L74 62 M105 24 L116 62 M95 18 L95 62" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
      
      {/* Calendar Card Body */}
      <rect x="76" y="26" width="38" height="30" rx="4" fill="#ffffff" stroke="#d97706" strokeWidth="1.2" />
      
      {/* Calendar Rings top */}
      <circle cx="83" cy="26" r="1.2" fill="#b45309" />
      <circle cx="90" cy="26" r="1.2" fill="#b45309" />
      <circle cx="97" cy="26" r="1.2" fill="#b45309" />
      <circle cx="104" cy="26" r="1.2" fill="#b45309" />
      <path d="M83 23 v3 M90 23 v3 M97 23 v3 M104 23 v3" stroke="#92400e" strokeWidth="1.2" strokeLinecap="round" />

      {/* Calendar Header Bar & Grid Dots (Purely Decorative) */}
      <path d="M76 33 H114" stroke="#fde68a" strokeWidth="2.5" />
      <circle cx="84" cy="39" r="1.5" fill="#f59e0b" />
      <circle cx="91" cy="39" r="1.5" fill="#d97706" />
      <circle cx="98" cy="39" r="1.5" fill="#d97706" />
      <circle cx="105" cy="39" r="1.5" fill="#d97706" />
      <circle cx="84" cy="46" r="1.5" fill="#d97706" />
      <circle cx="91" cy="46" r="1.5" fill="#d97706" />
      <circle cx="98" cy="46" r="1.5" fill="#ea580c" />
      <circle cx="105" cy="46" r="1.5" fill="#d97706" />

      {/* Coffee Cup */}
      <rect x="118" y="45" width="11" height="10" rx="2" fill="#d97706" />
      <path d="M129 48 C131 48 132 50 132 51 C132 52 131 54 129 54" stroke="#d97706" strokeWidth="1.2" fill="none" />
      <path d="M121 42 C121 39 123 40 123 38" stroke="#f59e0b" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
      <path d="M125 42 C125 40 127 40 127 38" stroke="#f59e0b" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function BirthdayIllustration() {
  return (
    <svg width="140" height="85" viewBox="0 0 140 85" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.heroSvg}>
      {/* Soft background glow */}
      <circle cx="108" cy="42" r="38" fill="#ddd6fe" fillOpacity="0.5" />
      <circle cx="78" cy="60" r="18" fill="#ede9fe" fillOpacity="0.6" />

      {/* Confetti & Leaves */}
      <path d="M128 22 C132 16 136 13 140 9 C136 16 130 21 128 22 Z" fill="#8b5cf6" opacity="0.6" />
      <circle cx="68" cy="22" r="1.8" fill="#c084fc" />
      <circle cx="74" cy="15" r="1.2" fill="#818cf8" />
      <path d="M66 28 L70 24" stroke="#a855f7" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M132 30 L136 27" stroke="#a855f7" strokeWidth="1.2" strokeLinecap="round" />

      {/* Gift Box Base */}
      <rect x="82" y="36" width="32" height="26" rx="3" fill="#c084fc" stroke="#7c3aed" strokeWidth="1.2" />
      {/* Gift Box Lid */}
      <rect x="80" y="30" width="36" height="7" rx="2" fill="#a855f7" stroke="#6d28d9" strokeWidth="1.2" />

      {/* Ribbon Vertical */}
      <rect x="95" y="30" width="6" height="32" fill="#6d28d9" />
      {/* Ribbon Horizontal */}
      <rect x="80" y="43" width="36" height="5" fill="#6d28d9" />

      {/* Bow on Top */}
      <path d="M98 30 C93 22 84 22 90 30 Z" fill="#7c3aed" stroke="#5b21b6" strokeWidth="0.8" />
      <path d="M98 30 C103 22 112 22 106 30 Z" fill="#7c3aed" stroke="#5b21b6" strokeWidth="0.8" />
      <circle cx="98" cy="30" r="2" fill="#5b21b6" />

      {/* Birthday Card Leaning */}
      <g transform="rotate(7 120 42)">
        <rect x="108" y="27" width="20" height="27" rx="2" fill="#ffffff" stroke="#a78bfa" strokeWidth="1" />
        <text x="118" y="36" textAnchor="middle" fontSize="4" fontWeight="bold" fill="#6d28d9" fontFamily="sans-serif">HAPPY</text>
        <text x="118" y="41" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#7c3aed" fontFamily="sans-serif">BIRTHDAY</text>
        <circle cx="118" cy="48" r="2.5" fill="none" stroke="#8b5cf6" strokeWidth="0.7" />
        <circle cx="117" cy="47" r="0.4" fill="#8b5cf6" />
        <circle cx="119" cy="47" r="0.4" fill="#8b5cf6" />
        <path d="M116.5 49.2 Q118 50.5 119.5 49.2" stroke="#8b5cf6" strokeWidth="0.5" fill="none" />
      </g>
    </svg>
  );
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [summaryData, setSummaryData]         = useState(null);
  const [balance, setBalance]                 = useState([]);
  const [balanceView, setBalanceView]         = useState('half');
  const [loading, setLoading]                 = useState(true);
  const [birthdays, setBirthdays]             = useState([]);
  const [wishableBirthdays, setWishableBirthdays] = useState([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState([]);
  const [showPersonalCelebration, setShowPersonalCelebration] = useState(false);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [todayMenu, setTodayMenu]             = useState(null);
  const [cafeMenuLoading, setCafeMenuLoading] = useState(ENABLE_CAFE_FEATURE);

  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [todayDay, setTodayDay]               = useState('');
  const [greeting, setGreeting]               = useState('Good morning');
  const [todayStr, setTodayStr]               = useState('');
  const [now, setNow]                         = useState(null);
  const [policies, setPolicies]               = useState([]);
  const [pendingPolicies, setPendingPolicies] = useState([]);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  const loadPolicies = useCallback((options = {}) => {
    const { initialLoad = false } = options;
    listPolicies()
      .then((res) => setPolicies(res.data.data || []))
      .catch(() => {});
    getPendingPolicies()
      .then((res) => {
        const pending = res.data.data || [];
        setPendingPolicies((prev) => {
          const prevIds = new Set(prev.map((p) => String(p._id)));
          const hasNewPending = pending.some((p) => !prevIds.has(String(p._id)));
          if (pending.length > 0 && (initialLoad || hasNewPending)) {
            setShowPolicyModal(true);
          }
          return pending;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const n = new Date();
    const h = n.getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
    setTodayStr(n.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][n.getDay()];
    setTodayDay(dayName);
    setNow(n);

    const requests = [
      getMyDashboardSummary(),
      getMyBalance(),
      getTodayBirthdays(),
      getUpcomingBirthdays(),
      getSettings(),
      getEvents(),
      listPolicies(),
      getPendingPolicies(),
    ];

    if (ENABLE_CAFE_FEATURE) {
      requests.push(getDayMenu(dayName));
    }

    Promise.allSettled(requests).then((results) => {
      const [summaryRes, balRes, bdayRes, upcomingBdayRes, settingsRes, eventsRes, policyListRes, pendingPolicyRes, menuRes] = results;

      if (summaryRes.status === 'fulfilled') {
        setSummaryData(summaryRes.value.data.data);
      }

      if (balRes.status === 'fulfilled') {
        setBalance(balRes.value.data.data || []);
      }

      if (bdayRes.status === 'fulfilled' && bdayRes.value.data.data?.length > 0) {
        const fetchedBirthdays = bdayRes.value.data.data;
        setBirthdays(fetchedBirthdays);

        const wishables = getWishableBirthdays(fetchedBirthdays, user);
        setWishableBirthdays(wishables);

        if (shouldShowBirthdayCelebration({ todayBirthdays: fetchedBirthdays, user, now: n })) {
          setShowPersonalCelebration(true);
        } else if (shouldShowBirthdayPopup({ wishableBirthdays: wishables, user, now: n })) {
          setShowBirthdayModal(true);
        }
      }

      if (upcomingBdayRes.status === 'fulfilled') {
        setUpcomingBirthdays(upcomingBdayRes.value.data.data || []);
      }

      if (ENABLE_CAFE_FEATURE && menuRes) {
        if (menuRes.status === 'fulfilled') {
          setTodayMenu(menuRes.value.data.data);
        } else {
          setTodayMenu({ day: dayName, items: [], specialNote: '' });
        }
      }

      const settingsHolidays = settingsRes.status === 'fulfilled' ? settingsRes.value.data.data?.holidays || [] : [];
      const calendarEvents   = eventsRes.status === 'fulfilled' ? eventsRes.value.data.data || [] : [];
      setUpcomingHolidays(buildUpcomingHolidays({ settingsHolidays, calendarEvents, limit: 5 }));

      if (policyListRes.status === 'fulfilled') setPolicies(policyListRes.value.data.data || []);
      if (pendingPolicyRes.status === 'fulfilled') {
        const pending = pendingPolicyRes.value.data.data || [];
        setPendingPolicies(pending);
        if (pending.length > 0) setShowPolicyModal(true);
      }
    }).finally(() => {
      setLoading(false);
      setCafeMenuLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (birthdays.length > 0 && user) {
      const wishables = getWishableBirthdays(birthdays, user);
      setWishableBirthdays(wishables);

      if (shouldShowBirthdayCelebration({ todayBirthdays: birthdays, user, now: now || new Date() })) {
        setShowPersonalCelebration(true);
      } else if (shouldShowBirthdayPopup({ wishableBirthdays: wishables, user, now: now || new Date() })) {
        setShowBirthdayModal(true);
      }
    }
  }, [birthdays, user, now]);

  useEffect(() => {
    const checkForNewPolicies = () => loadPolicies();
    const interval = setInterval(checkForNewPolicies, 90000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForNewPolicies();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadPolicies]);

  const handleCelebrationComplete = () => {
    recordBirthdayCelebrationSeen({ user, now: now || new Date() });
    setShowPersonalCelebration(false);

    const wishables = getWishableBirthdays(birthdays, user);
    if (shouldShowBirthdayPopup({ wishableBirthdays: wishables, user, now: now || new Date() })) {
      setShowBirthdayModal(true);
    }
  };

  const handleWishAll = async () => {
    recordBirthdayWished({ user, now: now || new Date() });
    setShowBirthdayModal(false);
  };

  const handleCloseBirthdayModal = () => {
    recordBirthdayDismissed({ user, now: now || new Date() });
    setShowBirthdayModal(false);
  };

  const availableMenuItems = todayMenu?.items?.filter(i => i.isAvailable !== false) || [];
  const topBalances = balance.filter(b => ['CL', 'SL', 'PRIV', 'PL', 'ML'].includes(b.code));
  const pendingPolicyCount = pendingPolicies.length;
  const needsAttentionList = summaryData?.needsAttention || [];

  const displayHolidays = upcomingHolidays.slice(0, 4);
  const displayBirthdays = filterUpcomingBirthdays(upcomingBirthdays, now || new Date()).slice(0, 4);

  return (
    <div className={styles.page}>
      {showPersonalCelebration && (
        <BirthdayCelebration
          user={user}
          onComplete={handleCelebrationComplete}
        />
      )}
      {showBirthdayModal && wishableBirthdays.length > 0 && (
        <BirthdayModal
          people={wishableBirthdays}
          onWishAll={handleWishAll}
          onClose={handleCloseBirthdayModal}
        />
      )}
      {showPolicyModal && pendingPolicies.length > 0 && (
        <PolicyAcceptanceModal
          policies={pendingPolicies}
          onComplete={() => {
            setShowPolicyModal(false);
            loadPolicies();
          }}
          onClose={() => setShowPolicyModal(false)}
        />
      )}

      {/* Clean Greeting Hero Banner */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeContent}>
          <p className={`text-sm ${styles.welcomeGreeting}`}>{greeting}</p>
          <h2 className={styles.welcomeName}>{user?.name}</h2>
          <p className={`text-sm ${styles.welcomeDate}`}>{todayStr}</p>
        </div>
        <div className={styles.welcomeBlob} />
      </div>

      {/* Quick Actions Row */}
      <div className={styles.quickActions}>
        <Link href="/employee/leaves/apply" className={styles.actionBtnPrimary}>
          <Plus size={16} /> Apply Leave
        </Link>
        <Link href="/employee/attendance" className={styles.actionBtnSecondary}>
          <UserCheck size={16} /> My Attendance
        </Link>
        <Link href="/employee/leaves" className={styles.actionBtnSecondary}>
          <CalendarDays size={16} /> My Leaves
        </Link>
        {ENABLE_CAFE_FEATURE && (
          <Link href="/employee/cafe" className={styles.actionBtnSecondary}>
            <UtensilsCrossed size={16} /> Cafe Menu
          </Link>
        )}
      </div>

      {/* Top Operational KPI Cards */}
      <div className={styles.statGrid}>
        {/* Card 1: Leave Balance Summary */}
        <Link
          href="/employee/leaves"
          className={`card rounded-2xl ${styles.statCard} ${styles.statCardClickable}`}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div className={styles.statTopBar} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }} />
          <div className={styles.statHeader}>
            <p className="dash-stat-label">LEAVE BALANCE</p>
            <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
              <CalendarCheck size={17} color="#fff" strokeWidth={2.5} />
            </div>
          </div>
          <p className={styles.statValue} style={{ fontSize: '1.2rem' }}>
            {loading ? '—' : (summaryData?.kpis?.leaveBalanceSummary || `${balance.find(b => b.code==='CL')?.remaining ?? 0} CL  |  ${balance.find(b => b.code==='PRIV' || b.code==='PL')?.remaining ?? 0} PL  |  ${balance.find(b => b.code==='ML')?.remaining ?? 0} ML`)}
          </p>
          <p className={styles.splitStatLabel} style={{ marginTop: '0.4rem', color: '#64748b' }}>
            Casual, Privileged &amp; Medical Leave
          </p>
        </Link>

        {/* Card 2: Awaiting Approval */}
        <Link
          href="/employee/leaves?status=Pending"
          className={`card rounded-2xl ${styles.statCard} ${styles.statCardClickable}`}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div className={styles.statTopBar} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
          <div className={styles.statHeader}>
            <p className="dash-stat-label">AWAITING APPROVAL</p>
            <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <AlertCircle size={17} color="#fff" strokeWidth={2.5} />
            </div>
          </div>
          <p className={styles.statValue}>{loading ? '—' : summaryData?.kpis?.awaitingApproval ?? 0}</p>
          <p className={styles.splitStatLabel} style={{ marginTop: '0.4rem', color: '#64748b' }}>
            Your pending requests
          </p>
        </Link>

        {/* Card 3: This Month SL / WFH */}
        <div
          className={`card rounded-2xl ${styles.statCard} ${styles.statCardStatic}`}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div className={styles.statTopBar} style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }} />
          <div className={styles.statHeader}>
            <p className="dash-stat-label">THIS MONTH</p>
            <div className={styles.statIcon} style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
              <Palmtree size={17} color="#fff" strokeWidth={2.5} />
            </div>
          </div>
          <div className={styles.splitStat}>
            <div>
              <p className={styles.splitStatValue}>{loading ? '—' : `${summaryData?.kpis?.shortLeaveThisMonth ?? 0} SL`}</p>
              <p className={styles.splitStatLabel}>Short Leave</p>
            </div>
            <div className={styles.splitDivider} />
            <div>
              <p className={styles.splitStatValue}>{loading ? '—' : `${summaryData?.kpis?.wfhThisMonth ?? 0} WFH`}</p>
              <p className={styles.splitStatLabel}>Work From Home</p>
            </div>
          </div>
        </div>

        {/* Card 4: Company Policies */}
        <Link
          href="/employee/policy"
          className={`card rounded-2xl ${styles.statCard} ${styles.statCardClickable}`}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
          <div className={styles.statTopBar} style={{ background: pendingPolicyCount > 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)' }} />
          <div className={styles.statHeader}>
            <p className="dash-stat-label">COMPANY POLICIES</p>
            <div className={styles.statIcon} style={{ background: pendingPolicyCount > 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)' }}>
              <FileText size={17} color="#fff" strokeWidth={2.5} />
            </div>
          </div>
          <p className={styles.statValue}>
            {loading ? '—' : (summaryData?.policySummary ? `${summaryData.policySummary.acceptedPoliciesCount} / ${summaryData.policySummary.totalPolicies}` : `${policies.length - pendingPolicyCount} / ${policies.length}`)}
          </p>
          <p className={styles.splitStatLabel} style={{ marginTop: '0.4rem', color: pendingPolicyCount > 0 ? '#b45309' : '#64748b', fontWeight: pendingPolicyCount > 0 ? 700 : 600 }}>
            {loading ? 'Loading...' : pendingPolicyCount === 0 ? 'All policies accepted' : (pendingPolicyCount === 1 ? '1 policy requires acknowledgement' : `${pendingPolicyCount} policies require acknowledgement`)}
          </p>
        </Link>
      </div>

      {/* Main 2-Column Dashboard Grid */}
      <div className={styles.mainLayoutGrid}>
        {/* Left Column (Needs Your Attention & Leave Balance) */}
        <div className={styles.leftColumn}>
          {/* Needs Your Attention Section */}
          <div className={`dash-card ${styles.needsAttentionSection}`}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleWrap}>
                <div className="dash-section-icon" style={{ background: '#fee2e2' }}>
                  <ShieldAlert size={15} color="#dc2626" strokeWidth={2} />
                </div>
                <h3 className={styles.sectionTitle}>Needs Your Attention</h3>
              </div>
            </div>

            {loading ? (
              <p className={styles.sectionEmpty}>Loading attention items...</p>
            ) : needsAttentionList.length > 0 ? (
              <div className={styles.attentionGrid}>
                {needsAttentionList.map((item) => (
                  <div key={item.id} className={styles.attentionCard}>
                    <div className={styles.attentionContent}>
                      <div className={styles.attentionIcon}>
                        <AlertTriangle size={16} />
                      </div>
                      <div>
                        <p className={styles.attentionTitle}>{item.title}</p>
                        <p className={styles.attentionSubtitle}>{item.subtitle}</p>
                      </div>
                    </div>
                    {item.type === 'policy' ? (
                      <button
                        type="button"
                        className={styles.attentionAction}
                        onClick={() => setShowPolicyModal(true)}>
                        {item.actionLabel || 'Action required'}
                      </button>
                    ) : (
                      <Link href={item.link || '#'} className={styles.attentionAction}>
                        {item.actionLabel || 'View'}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.attentionClearCard}>
                <CheckCircle2 size={20} color="#16a34a" strokeWidth={2} />
                <div>
                  <p className={styles.attentionClearTitle}>✓ You&apos;re all caught up</p>
                  <p className={styles.attentionClearSubtitle}>No pending actions right now.</p>
                </div>
              </div>
            )}
          </div>

          {/* Detailed Leave Balance Card */}
          <div className="dash-card">
            <div className={`${styles.sectionHeader} ${styles.balanceHeader}`}>
              <h3 className={styles.sectionTitle}>Leave Balance</h3>
              <div className="d-flex align-items-center gap-2">
                <div className={styles.balanceToggle}>
                  <button className={`${styles.balanceToggleButton} ${balanceView === 'half' ? styles.balanceToggleActive : ''}`} onClick={() => setBalanceView('half')}>6 Months</button>
                  <button className={`${styles.balanceToggleButton} ${balanceView === 'year' ? styles.balanceToggleActive : ''}`} onClick={() => setBalanceView('year')}>Yearly</button>
                </div>
                <Link href="/employee/leaves" className={styles.actionLink}>View details →</Link>
              </div>
            </div>
            {topBalances.length === 0 ? (
              <p className={styles.balanceEmpty}>No balance data</p>
            ) : topBalances.map(b => {
              const isYearly  = balanceView === 'year';
              const used      = isYearly ? (b.totalUsed || 0) : (b.used || 0);
              const remaining = isYearly ? (b.totalRemaining || 0) : (b.remaining != null ? b.remaining : 0);
              const quota     = isYearly ? (b.daysAllowed || 0) : (b.remaining != null ? (b.used || 0) + b.remaining : b.daysAllowed || 0);
              const pct       = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
              const exceeded  = remaining < 0;
              return (
                <div key={b.code} className={styles.balanceRow}>
                  <div className={styles.balanceRowTop}>
                    <div className={styles.balanceNameWrap}>
                      <div className={styles.balanceDot} style={{ background: b.color || '#6366f1' }} />
                      <span className={styles.balanceName}>{b.name}</span>
                    </div>
                    <span className={`${styles.balanceRemaining} ${exceeded ? styles.negative : ''}`}>{remaining}d <span className={styles.balanceRemainingUnit}>left</span></span>
                  </div>
                  <div className={styles.balanceProgressRow}>
                    <div className={styles.balanceTrack}>
                      <div className={styles.balanceFill} style={{ width: `${pct}%`, background: exceeded ? '#ef4444' : b.color }} />
                    </div>
                    <span className={styles.balanceMeta}>{used}/{quota}d</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (ONE Combined Upcoming Card) */}
        <div className={styles.rightColumn}>
          <div className={`dash-card ${styles.upcomingOuterCard}`}>
            {/* Top Action Bar */}
            <div className={styles.upcomingCardTopBar}>
              <Link href="/employee/calendar" className={styles.viewCalendarLink}>
                View calendar →
              </Link>
            </div>

            {/* Inner Grid with 2 Equal Columns */}
            <div className={styles.upcomingInnerGrid}>
              {/* Left Column: Upcoming Holidays */}
              <div className={styles.upcomingColumn}>
                {/* Holiday Hero Banner */}
                <div className={styles.holidayHeroBanner}>
                  <div className={styles.heroBannerContent}>
                    <div className={styles.heroTitleRow}>
                      <div className={styles.holidayHeroIcon}>
                        <CalendarDays size={18} color="#ea580c" strokeWidth={2.2} />
                      </div>
                      <h4 className={styles.heroTitleHoliday}>Upcoming Holidays</h4>
                    </div>
                    <p className={styles.heroSubtitleHoliday}>Plan your time around upcoming holidays</p>
                  </div>
                  <div className={styles.heroGraphic}>
                    <HolidayIllustration />
                  </div>
                </div>

                {/* Holiday Rows List */}
                {displayHolidays.length === 0 ? (
                  <p className={styles.sectionEmpty}>No upcoming holidays</p>
                ) : (
                  <div className={styles.holidayList}>
                    {displayHolidays.map((h, i) => {
                      const daysLeft = now ? getHolidayDaysLeft(h.date, now) : 0;
                      const isNearest = i === 0;
                      return (
                        <div
                          key={`${h.date.toISOString()}-${h.name}-${i}`}
                          className={`${styles.holidayRow} ${isNearest ? styles.holidayRowHighlight : ''}`}
                        >
                          <div className={`${styles.holidayDateBadge} ${isNearest ? styles.badgeNearest : ''}`}>
                            <span className={styles.holidayMonthText}>{MONTHS[h.date.getMonth()]}</span>
                            <span className={styles.holidayDayText}>{h.date.getDate()}</span>
                          </div>
                          <div className={styles.holidayInfo}>
                            <p className={styles.holidayName}>{h.name}</p>
                            <p className={styles.holidaySubtext}>
                              {h.type === 'calendar' ? 'Calendar Event' : 'National Holiday'}
                            </p>
                          </div>
                          <div className={styles.holidayDaysBadgeWrap}>
                            <span className={`${styles.daysPill} ${isNearest ? styles.daysPillNearest : styles.daysPillMuted}`}>
                              {daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Subtle Vertical Divider */}
              <div className={styles.upcomingVerticalDivider} />

              {/* Right Column: Upcoming Birthdays */}
              <div className={styles.upcomingColumn}>
                {/* Birthday Hero Banner */}
                <div className={styles.birthdayHeroBanner}>
                  <div className={styles.heroBannerContent}>
                    <div className={styles.heroTitleRow}>
                      <div className={styles.birthdayHeroIcon}>
                        <Gift size={18} color="#7c3aed" strokeWidth={2.2} />
                      </div>
                      <h4 className={styles.heroTitleBirthday}>Upcoming Birthdays</h4>
                    </div>
                    <p className={styles.heroSubtitleBirthday}>Let&apos;s celebrate together</p>
                  </div>
                  <div className={styles.heroGraphic}>
                    <BirthdayIllustration />
                  </div>
                </div>

                {/* Birthday Rows List */}
                {displayBirthdays.length === 0 ? (
                  <p className={styles.sectionEmpty}>No upcoming birthdays</p>
                ) : (
                  <div className={styles.birthdayList}>
                    {displayBirthdays.map((p, i) => {
                      const n = now || new Date();
                      const year = n.getFullYear();
                      const currentMonth = n.getMonth() + 1;
                      const currentDay = n.getDate();
                      let targetYear = year;
                      if (p.birthdayMonth < currentMonth || (p.birthdayMonth === currentMonth && p.birthdayDay < currentDay)) {
                        targetYear = year + 1;
                      }
                      const bDayDate = (p.birthdayMonth && p.birthdayDay) ? new Date(targetYear, p.birthdayMonth - 1, p.birthdayDay) : null;
                      const daysLeft = bDayDate && n ? Math.ceil((bDayDate - n) / (1000 * 60 * 60 * 24)) : null;
                      const monthAbbr = bDayDate ? MONTHS[bDayDate.getMonth()] : (p.birthdayMonth ? MONTHS[(p.birthdayMonth - 1) % 12]?.slice(0, 3) : '');
                      const dayNum = bDayDate ? bDayDate.getDate() : p.birthdayDay;
                      const isNearest = i === 0;

                      return (
                        <div
                          key={p._id || i}
                          className={`${styles.birthdayRow} ${isNearest ? styles.birthdayRowHighlight : ''}`}
                        >
                          <div className={styles.birthdayAvatar}>
                            {p.profilePhotoUrl ? (
                              <img
                                className={styles.avatarImage}
                                src={p.profilePhotoUrl}
                                alt={p.name}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className={styles.avatarInitials}
                              style={{ display: p.profilePhotoUrl ? 'none' : 'flex' }}
                            >
                              {p.name?.[0]?.toUpperCase() || 'E'}
                            </div>
                          </div>

                          <div className={styles.birthdayInfo}>
                            <p className={styles.birthdayName}>{p.name}</p>
                            <p className={styles.birthdayMeta}>{p.designation || p.department || 'Team Member'}</p>
                          </div>

                          <div className={styles.birthdayDateRight}>
                            <div className={styles.birthdayDateBadgeText}>
                              <span className={styles.bdayMonthAbbr}>{monthAbbr}</span>
                              <span className={styles.bdayDayNum}>{dayNum}</span>
                            </div>
                            {daysLeft !== null && (
                              <span className={`${styles.bdayDaysPill} ${isNearest ? styles.bdayDaysPillNearest : styles.bdayDaysPillMuted}`}>
                                {daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cafe Menu (if enabled) */}
          {ENABLE_CAFE_FEATURE && (
            <div className="dash-card">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleWrap}>
                  <div className="dash-section-icon">
                    <Coffee size={15} color="#f97316" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className={styles.sectionTitle}>Cafe Menu</h3>
                    <p className={styles.menuDay}>{todayDay}</p>
                  </div>
                </div>
                <Link href="/employee/cafe" className={styles.actionLink}>View menu →</Link>
              </div>
              {cafeMenuLoading ? (
                <p className={styles.sectionEmpty}>Loading menu...</p>
              ) : availableMenuItems.length === 0 ? (
                <div className="dash-empty-center">
                  <div className="dash-empty-icon">
                    <UtensilsCrossed size={20} color="#f97316" strokeWidth={1.5} />
                  </div>
                  <p className={styles.sectionEmpty}>No menu for today</p>
                </div>
              ) : (
                <div className={styles.menuList}>
                  {availableMenuItems.slice(0, 5).map(item => (
                    <div key={item._id} className="dash-menu-row">
                      <div className={styles.menuItemMain}>
                        <div className={`${styles.menuDot} ${item.isVeg ? styles.veg : styles.nonVeg}`} />
                        <p className={styles.menuName}>{item.name}</p>
                      </div>
                      <span className={styles.menuPrice}>₹{item.price}</span>
                    </div>
                  ))}
                  {availableMenuItems.length > 5 && <p className={styles.moreMenu}>+{availableMenuItems.length - 5} more</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
