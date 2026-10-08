'use client';
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getDashboard } from '@/api/attendanceApi';
import { getTodayBirthdays } from '@/api/employeeApi';
import { getDayMenu } from '@/api/cafeMenuApi';
import { getSettings } from '@/api/settingsApi';
import { getEvents } from '@/api/calendarEventApi';
import { buildUpcomingHolidays, getHolidayDaysLeft, HOLIDAY_MONTHS } from '@/utils/upcomingHolidays';
import { getAnnouncements } from '@/api/announcementApi';
import { getPendingPolicies } from '@/api/policyApi';
import { ENABLE_CAFE_FEATURE } from '@/utils/featureFlags';
import BirthdayModal from '@/components/BirthdayModal';
import PolicyAcceptanceModal from '@/components/PolicyAcceptanceModal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Users, Clock, Palmtree, TrendingUp, Calendar, Coffee,
  Megaphone, Cake, CalendarDays, UtensilsCrossed, PartyPopper, Sparkles, Gift,
  ClipboardList, CheckCircle2, AlertTriangle, AlertCircle, BarChart3, ChevronRight, CheckSquare,
  Building2, Briefcase, BookOpen,
} from 'lucide-react';
import { getISTDateParts } from '@/utils/reconciliationHelpers';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getNeedsAttentionCategories } from '@/utils/dashboardNeedsAttentionHelpers';
import { getWishableBirthdays } from '@/utils/birthdayPopupHelpers';
import styles from './AdminDashboard.module.css';

const MONTHS = HOLIDAY_MONTHS;
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #818cf8, #7c3aed)',
  'linear-gradient(135deg, #f472b6, #ec4899)',
  'linear-gradient(135deg, #38bdf8, #0284c7)',
  'linear-gradient(135deg, #fbbf24, #d97706)',
];

function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData]                         = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [dashError, setDashError]               = useState(null);
  const [birthdays, setBirthdays]               = useState([]);
  const [showBirthday, setShowBirthday]         = useState(false);
  const [todayMenu, setTodayMenu]               = useState(null);
  const [cafeMenuLoading, setCafeMenuLoading]   = useState(ENABLE_CAFE_FEATURE);
  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [announcements, setAnnouncements]       = useState([]);
  const [pendingPolicies, setPendingPolicies]   = useState([]);
  const [showPolicyModal, setShowPolicyModal]   = useState(false);
  const [greeting, setGreeting]                 = useState('Good morning');
  const [todayStr, setTodayStr]                 = useState('');
  const [todayDay, setTodayDay]                 = useState('');

  const loadPendingPolicies = useCallback((options = {}) => {
    const { initialLoad = false } = options;
    getPendingPolicies()
      .then((res) => {
        const pending = res.data.data || [];
        setPendingPolicies((previous) => {
          const previousIds = new Set(previous.map((policy) => String(policy._id)));
          const hasNewPending = pending.some((policy) => !previousIds.has(String(policy._id)));
          if (pending.length > 0 && (initialLoad || hasNewPending)) {
            setShowPolicyModal(true);
          }
          return pending;
        });
      })
      .catch(() => {});
  }, []);

  const loadDashboardData = useCallback(() => {
    const now = new Date();
    const h = now.getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
    const todayParts = getISTDateParts(now);
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = dayNames[todayParts.dayOfWeek];
    setTodayDay(dayName);

    const istMonthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    setTodayStr(`${dayName}, ${istMonthNames[todayParts.month - 1]} ${todayParts.day}, ${todayParts.year}`);

    const todayISO = todayParts.dateStr;

    const requests = [
      getDashboard(),
      getTodayBirthdays(),
      getSettings(),
      getEvents(),
      getAnnouncements(),
      getPendingPolicies(),
    ];

    if (ENABLE_CAFE_FEATURE) {
      requests.push(getDayMenu(dayName));
    }

    Promise.allSettled(requests).then((results) => {
      const [dashRes, bdayRes, settingsRes, eventsRes, annRes, policyRes, menuRes] = results;

      if (dashRes.status === 'fulfilled') {
        setData(dashRes.value.data.data);
        setDashError(null);
      } else {
        const msg = dashRes.reason?.response?.data?.message || dashRes.reason?.message || 'Dashboard data could not be loaded.';
        setDashError(msg);
      }

      if (bdayRes.status === 'fulfilled' && bdayRes.value.data.data?.length > 0) {
        setBirthdays(bdayRes.value.data.data);
        const dismissed = localStorage.getItem('birthday_dismissed');
        if (dismissed !== todayISO) setShowBirthday(true);
      }

      const settingsHolidays = settingsRes.status === 'fulfilled' ? settingsRes.value.data.data?.holidays || [] : [];
      const calendarEvents   = eventsRes.status === 'fulfilled' ? eventsRes.value.data.data || [] : [];
      setUpcomingHolidays(buildUpcomingHolidays({ settingsHolidays, calendarEvents, limit: 5 }));

      if (annRes.status === 'fulfilled') {
        setAnnouncements(annRes.value.data.data?.slice(0, 3) || []);
      }

      if (policyRes.status === 'fulfilled') {
        const pending = policyRes.value.data.data || [];
        setPendingPolicies(pending);
        if (pending.length > 0) setShowPolicyModal(true);
      }

      if (ENABLE_CAFE_FEATURE && menuRes) {
        if (menuRes.status === 'fulfilled') {
          setTodayMenu(menuRes.value.data.data);
        } else {
          setTodayMenu({ day: dayName, items: [], specialNote: '' });
        }
      }
    }).finally(() => {
      setLoading(false);
      setCafeMenuLoading(false);
    });
  }, []);

  useEffect(() => {
    loadDashboardData();
    const policyInterval = setInterval(() => loadPendingPolicies(), 90000);
    return () => {
      clearInterval(policyInterval);
    };
  }, [loadDashboardData, loadPendingPolicies]);

  const todayDateStr = getISTDateParts().dateStr;
  const todayLeaveRoute = `/admin/leaves?status=Approved&startDate=${todayDateStr}&endDate=${todayDateStr}`;
  const navigateTo = (href) => router.push(href);
  const isTeamLead = user?.role === 'team_lead';

  const kpis = data?.kpis || {
    totalEmployees: 0,
    presentToday: 0,
    wfhCount: 0,
    halfDayCount: 0,
    onLeaveToday: 0,
    absentToday: 0,
    attendanceIssuesCount: 0,
  };

  const needsAttention = data?.needsAttention || {
    pendingLeaves: 0,
    missingPunches: 0,
    unaccountedDates: 0,
    attendanceConflicts: 0,
    partialLeaveExceptions: 0,
  };

  const recentPendingLeaves = data?.recentPendingLeaves || [];

  const liveHrStatus = data?.liveHrStatus || {
    totalEmployees: kpis.totalEmployees,
    onLeaveToday: kpis.onLeaveToday,
    wfhToday: kpis.wfhCount,
    pendingLeaveTotalCount: needsAttention.pendingLeaves,
  };

  const attendanceOverview = data?.attendanceOverview || null;
  const dataCoverage = data?.dataCoverage || null;

  const statCards = [
    {
      label: isTeamLead ? 'Team Members' : 'Total Employees',
      value: loading ? '—' : (dashError && !data ? '—' : liveHrStatus.totalEmployees),
      subtext: isTeamLead ? 'In your managed team' : 'Active & attendance eligible',
      color: '#6366f1',
      bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      Icon: Users,
      href: isTeamLead ? '/admin/attendance' : '/admin/employees',
    },
    { label: 'On Leave Today',       value: loading ? '—' : (dashError && !data ? '—' : liveHrStatus.onLeaveToday),    subtext: 'Approved leave today', color: '#8b5cf6', bg: 'linear-gradient(135deg, #8b5cf6, #ec4899)', Icon: Palmtree,     href: todayLeaveRoute },
    { label: 'WFH Today',            value: loading ? '—' : (dashError && !data ? '—' : liveHrStatus.wfhToday),        subtext: 'Approved WFH today',   color: '#0ea5e9', bg: 'linear-gradient(135deg, #0ea5e9, #0284c7)', Icon: CheckCircle2, href: `/admin/attendance?date=${todayDateStr}&workMode=wfh` },
    { label: 'Pending Requests',     value: loading ? '—' : (dashError && !data ? '—' : needsAttention.pendingLeaves), subtext: 'Awaiting your review', color: '#f59e0b', bg: 'linear-gradient(135deg, #f59e0b, #d97706)', Icon: AlertTriangle, href: '/admin/leaves?status=Pending' },
  ];

  const allQuickLinks = [
    { label: 'Attendance',     href: '/admin/attendance',                color: '#0ea5e9', Icon: Clock,         allowedRoles: ['admin', 'hr', 'md', 'superadmin', 'team_lead'] },
    { label: 'Reconciliation', href: '/admin/attendance/reconciliation', color: '#ef4444', Icon: CheckSquare,   allowedRoles: ['admin', 'hr', 'md', 'superadmin'] },
    { label: 'Leave Requests', href: '/admin/leaves',                    color: '#f59e0b', Icon: ClipboardList, allowedRoles: ['admin', 'hr', 'md', 'superadmin', 'team_lead'] },
    { label: 'Reports',        href: '/admin/reports',                   color: '#6366f1', Icon: BarChart3,     allowedRoles: ['admin', 'hr', 'md', 'superadmin'] },
    { label: 'Announcements',  href: '/admin/announcements',             color: '#a855f7', Icon: Megaphone,      allowedRoles: ['admin', 'hr', 'md', 'superadmin', 'team_lead'] },
    { label: 'Employees',      href: '/admin/employees',                 color: '#10b981', Icon: Users,          allowedRoles: ['admin', 'hr', 'md', 'superadmin'] },
    { label: 'Policies',       href: '/admin/policy',                    color: '#0284c7', Icon: BookOpen,       allowedRoles: ['admin', 'hr', 'md', 'superadmin', 'team_lead'] },
  ];

  const quickLinks = allQuickLinks.filter(link => !user?.role || link.allowedRoles.includes(user.role));
  const sDate = dataCoverage?.startDate || attendanceOverview?.startDate || todayDateStr;
  const eDate = dataCoverage?.endDate || attendanceOverview?.endDate || todayDateStr;
  const periodText = needsAttention.periodLabel || 'this period';

  const {
    activeCategories: visibleNeedsAttentionCategories,
    hasNoIssues,
    emptyStateMessage,
    totalCount: totalNeedsAttentionCount,
  } = getNeedsAttentionCategories(needsAttention, {
    isTeamLead,
    startDate: sDate,
    endDate: eDate,
    periodLabel: needsAttention.periodLabel,
  });

  return (
    <div className={styles.pageContainer}>
      {showBirthday && (
        <BirthdayModal people={getWishableBirthdays(birthdays, user)} onClose={() => {
          const today = getISTDateParts().dateStr;
          localStorage.setItem('birthday_dismissed', today);
          setShowBirthday(false);
        }} />
      )}
      {showPolicyModal && pendingPolicies.length > 0 && (
        <PolicyAcceptanceModal
          policies={pendingPolicies}
          onComplete={() => {
            setShowPolicyModal(false);
            loadPendingPolicies();
          }}
          onClose={() => setShowPolicyModal(false)}
        />
      )}

      {/* Welcome banner */}
      <div className="welcome-banner">
        <div style={{ zIndex: 1 }}>
          <p className="text-sm" style={{ opacity: 0.8, marginBottom: '4px' }}>{greeting}</p>
          <h2 className="font-extrabold tracking-tight" style={{ fontSize: '1.4rem', margin: 0 }}>{user?.name}</h2>
          <p className="topbar-date text-sm" style={{ opacity: 0.7, marginTop: '5px' }}>{todayStr}</p>
        </div>

        {/* Decorative HR Workforce Composition (Right Side) */}
        <div className={styles.heroDecorationContainer} aria-hidden="true">
          <div className={styles.heroIconBadgeSubLeft}>
            <Briefcase size={15} color="#ffffff" strokeWidth={2} />
          </div>
          <div className={styles.heroIconBadgeMain}>
            <Users size={22} color="#ffffff" strokeWidth={2} />
          </div>
          <div className={styles.heroIconBadgeSubRight}>
            <Building2 size={15} color="#ffffff" strokeWidth={2} />
          </div>
        </div>

        <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '140px', height: '140px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '40%', bottom: '-30px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
      </div>

      {/* Top Quick Actions Navigation Bar */}
      <div className={styles.topQuickActionsBar}>
        <span className="font-bold text-xs uppercase text-muted" style={{ letterSpacing: '0.04em', marginRight: '0.375rem' }}>Quick Actions:</span>
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href} className={styles.topQuickActionChip}>
            <div className="dashboard-icon-box" style={{ width: '22px', height: '22px', borderRadius: '6px', background: `${link.color}15`, flexShrink: 0 }}>
              <link.Icon size={12} color={link.color} strokeWidth={2.2} />
            </div>
            <span className="font-semibold text-xs" style={{ color: '#334155' }}>{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Dashboard API Error Notice Banner */}
      {!loading && dashError && !data && (
        <div className={styles.dataReadinessBanner} role="alert" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
          <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
          <span>
            <strong>Dashboard Notice:</strong> {dashError}
          </span>
        </div>
      )}

      {/* Data Coverage Notice Banner */}
      {!loading && dataCoverage?.noticeMessage && (
        <div className={styles.dataReadinessBanner} role="alert">
          <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0 }} />
          <span>
            <strong>Attendance Data Coverage:</strong> {dataCoverage.noticeMessage}
          </span>
        </div>
      )}

      {/* Today's Birthdays Spotlight Banner (Rendered ONLY when birthdays exist) */}
      {birthdays.length > 0 && (
        <div className={styles.birthdaySpotlightBanner}>
          {/* Subtle Floating Confetti Image Layers */}
          <img
            src="/images/birthday/birthday-confetti.png"
            alt=""
            className={styles.spotlightConfettiLeft}
            aria-hidden="true"
          />
          <img
            src="/images/birthday/birthday-confetti.png"
            alt=""
            className={styles.spotlightConfettiRight}
            aria-hidden="true"
          />

          {/* Left Cake & Title Group */}
          <div className={styles.spotlightLeftGroup}>
            {/* Standalone Cake Image Artwork */}
            <div className={styles.cakeWrapper}>
              <div className={styles.cakeGlow} aria-hidden="true" />
              <img
                src="/images/birthday/birthday-cake.png"
                alt="Birthday Cake"
                className={styles.spotlightCakeImage}
              />
            </div>

            {/* Vertical Separator 1 */}
            <div className={styles.verticalDivider} aria-hidden="true" />

            {/* Title & Info Block */}
            <div className={styles.spotlightInfo}>
              <div className={styles.spotlightTag}>
                <PartyPopper size={14} color="#7c3aed" strokeWidth={2.2} />
                <span>TODAY&apos;S BIRTHDAYS</span>
              </div>
              <h4 className={styles.spotlightNames}>
                {birthdays.map(b => b.name).join(', ')}
              </h4>
              <p className={styles.spotlightSubtext}>
                {birthdays.length === 1 ? '1 teammate celebrating today' : `${birthdays.length} teammates celebrating today`}
                <PartyPopper size={14} color="#a855f7" strokeWidth={2} style={{ display: 'inline', marginLeft: '6px' }} />
              </p>
            </div>
          </div>

          {/* Right Group: Employee Mini Profiles & Celebrate Button */}
          <div className={styles.spotlightRightGroup}>
            <div className={styles.spotlightProfiles}>
              {birthdays.slice(0, 2).map((emp, idx) => (
                <div key={emp._id || emp.id || emp.name} className={styles.miniProfileWrapper}>
                  {idx > 0 && <div className={styles.miniProfileDivider} aria-hidden="true" />}
                  <div className={styles.miniProfileItem}>
                    <div
                      className={styles.miniProfileAvatarCircle}
                      style={{ background: AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length] }}
                    >
                      {getInitials(emp.name)}
                    </div>
                    <div className={styles.miniProfileText}>
                      <span className={styles.miniProfileName}>{emp.name}</span>
                      <span className={styles.miniProfileDesignation}>{emp.designation || emp.role || 'Team Member'}</span>
                    </div>
                  </div>
                </div>
              ))}
              {birthdays.length > 2 && (
                <div className={styles.moreProfilesBadge}>
                  +{birthdays.length - 2} more
                </div>
              )}
            </div>

            <button
              onClick={() => setShowBirthday(true)}
              className={styles.spotlightCelebrateBtn}
              type="button"
            >
              <Gift size={18} color="#ffffff" strokeWidth={2.2} />
              <span>Celebrate! &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* Current HR Status Stat cards (Today) */}
      <div className={styles.statCardsGrid}>
        {statCards.map(card => (
          <button key={card.label} type="button" onClick={() => navigateTo(card.href)}
            aria-label={`Open ${card.label}`}
            className={styles.statCard}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${card.color}25`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: card.bg, borderRadius: '16px 16px 0 0' }} />
            <div className={styles.statCardHeader}>
              <p className="dash-stat-label">{card.label}</p>
              <div className="d-flex align-center justify-center" style={{ width: '38px', height: '38px', borderRadius: '12px', background: card.bg, boxShadow: `0 4px 12px ${card.color}40` }}>
                <card.Icon size={18} color="#fff" strokeWidth={2.5} />
              </div>
            </div>
            <p className={styles.statVal}>{card.value}</p>
            {card.subtext ? (
              <p className="text-xs text-muted" style={{ marginTop: '2px', fontWeight: 500 }}>{card.subtext}</p>
            ) : (
              <div className="progress-track" style={{ marginTop: '6px' }}>
                <div className="progress-fill" style={{ width: loading ? '0%' : '75%', background: card.bg }} />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Primary Operational Row: Pending Leave Requests (Left 60%) | Needs Attention + Upcoming Holidays (Right Stack 40%) */}
      <div className={styles.operationalGrid}>
        {/* LEFT COLUMN: Pending Leave Requests */}
        <div className="dashboard-card d-flex-col" style={recentPendingLeaves.length > 0 ? { height: '100%' } : {}}>
          <div className="dashboard-card-header">
            <div>
              <h3 className="dashboard-card-title">Pending Leave Requests</h3>
              <p className="dashboard-card-subtitle">Requires your approval</p>
            </div>
            <Link href="/admin/leaves?status=Pending" className="dashboard-action-link"
              style={{ padding: '0.375rem 0.875rem', background: '#eff6ff', borderRadius: '8px' }}>
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="text-muted text-md" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : recentPendingLeaves.length === 0 ? (
            <div className="dash-empty-center" style={{ padding: '1.25rem 1rem' }}>
              <div className="dash-empty-icon" style={{ background: '#f0fdf4' }}>
                <CheckCircle2 size={22} color="#22c55e" strokeWidth={1.5} />
              </div>
              <p className="font-semibold text-heading" style={{ fontSize: '0.875rem' }}>All caught up!</p>
              <p className="text-muted text-sm" style={{ marginTop: '2px' }}>No pending leave requests</p>
            </div>
          ) : (
            <div className={styles.pendingLeavesList} style={{ flex: 1 }}>
              {recentPendingLeaves.slice(0, 6).map(leave => (
                <Link key={leave._id} href="/admin/leaves?status=Pending" className="dashboard-list-row dash-leave-row">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarImage src={leave.employeeId?.profilePhotoUrl} alt={leave.employeeId?.name || ''} />
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold text-xs">
                      {getInitials(leave.employeeId?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="dashboard-list-title">{leave.employeeId?.name || 'Unknown'}</p>
                    <p className="dashboard-list-subtitle">
                      {leave.leaveType} · {new Date(leave.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {leave.totalDays > 1 ? ` – ${new Date(leave.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                      {' · '}{leave.totalDays ? `${leave.totalDays}d` : `${leave.totalHours ? parseFloat(Number(leave.totalHours).toFixed(2)) : 0}h`}
                    </p>
                  </div>
                  <span className="dashboard-list-badge badge badge--pending">Pending</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN STACK: Needs Attention + Upcoming Holidays */}
        <div className={styles.rightColumnStack}>
          {/* Needs Attention */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <div className="row-center gap-2">
                <div className="dashboard-icon-box" style={{ background: '#fef2f2' }}>
                  <AlertCircle size={18} color="#ef4444" strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="dashboard-card-title">Needs Attention</h3>
                  <p className="dashboard-card-subtitle">
                    {needsAttention.periodLabel
                      ? `${totalNeedsAttentionCount > 0 ? `${totalNeedsAttentionCount} attendance issue${totalNeedsAttentionCount === 1 ? '' : 's'} · ` : ''}${needsAttention.periodLabel}`
                      : 'Operational items requiring HR action'}
                  </p>
                </div>
              </div>
            </div>
            {hasNoIssues ? (
              <div className="dash-empty-center" style={{ padding: '1.25rem 1rem' }}>
                <div className="dash-empty-icon" style={{ background: '#f0fdf4' }}>
                  <CheckCircle2 size={22} color="#22c55e" strokeWidth={1.5} />
                </div>
                <p className="font-semibold text-heading" style={{ fontSize: '0.875rem' }}>✓ No attendance issues</p>
                <p className="text-muted text-sm" style={{ marginTop: '2px', textAlign: 'center' }}>
                  {emptyStateMessage}
                </p>
              </div>
            ) : (
              <div className="dashboard-card-body" style={{ gap: '0.45rem', padding: '0.625rem 1rem 0.875rem' }}>
                {visibleNeedsAttentionCategories.map(cat => (
                  <Link
                    key={cat.key}
                    href={cat.href}
                    aria-label={`View ${cat.count} ${cat.label.toLowerCase()} for ${periodText}`}
                    className={styles.attentionRow}
                  >
                    <div className="row-center gap-2">
                      <span className={styles.attentionBadge} style={cat.badgeStyle}>
                        {cat.count}
                      </span>
                      <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>
                        {cat.label}
                      </span>
                    </div>
                    <ChevronRight size={16} color="#94a3b8" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Holidays (Right Column Bottom) */}
          <div className="dashboard-card d-flex-col" style={{ flex: 1 }}>
            <div className="dashboard-card-header">
              <div className="row-center gap-2">
                <div className="dashboard-icon-box" style={{ background: '#fffbeb' }}>
                  <CalendarDays size={16} color="#f59e0b" strokeWidth={2} />
                </div>
                <h3 className="dashboard-card-title">Upcoming Holidays</h3>
              </div>
              <Link href="/admin/calendar" className="dashboard-action-link">View calendar →</Link>
            </div>
            {upcomingHolidays.length === 0 ? (
              <div className="dash-empty-center" style={{ padding: '1rem', flex: 1 }}>
                <div className="dash-empty-icon" style={{ background: '#fffbeb' }}>
                  <CalendarDays size={22} color="#f59e0b" strokeWidth={1.5} />
                </div>
                <p className="text-muted text-sm">No upcoming holidays</p>
              </div>
            ) : (
              <div className="dashboard-card-body" style={{ gap: '0.45rem', padding: '0.5rem 1rem 0.75rem', flex: 1 }}>
                {upcomingHolidays.slice(0, 4).map((h, i) => {
                  const daysLeft = getHolidayDaysLeft(h.date);
                  return (
                    <div key={`${h.date.toISOString()}-${h.name}-${i}`} className="dashboard-list-row dash-holiday-row" style={{ padding: '0.45rem 0.75rem' }}>
                      <div className="dash-holiday-date">
                        <span className="font-bold uppercase" style={{ fontSize: '0.58rem', color: '#854d0e', lineHeight: 1 }}>{MONTHS[h.date.getMonth()]}</span>
                        <span className="font-extrabold" style={{ fontSize: '1rem', color: '#854d0e', lineHeight: 1 }}>{h.date.getDate()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="dashboard-list-title text-truncate" style={{ fontSize: '0.82rem' }}>{h.name}</p>
                        <p className="dashboard-list-subtitle" style={{ fontSize: '0.7rem', color: daysLeft <= 3 ? '#ef4444' : '#94a3b8' }}>
                          {daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="row-center gap-2">
              <div className="dashboard-icon-box" style={{ background: '#fdf4ff' }}>
                <Megaphone size={16} color="#a855f7" strokeWidth={2} />
              </div>
              <h3 className="dashboard-card-title">Latest Announcements</h3>
            </div>
            <Link href="/admin/announcements" className="dashboard-action-link">View all →</Link>
          </div>
          <div className={styles.announcementsGrid}>
            {announcements.map(ann => {
              const pColors = { high: '#fef2f2', medium: '#fffbeb', low: '#f0fdf4' };
              const pBorder = { high: '#fecaca',  medium: '#fde68a', low: '#bbf7d0' };
              const pText   = { high: '#dc2626',  medium: '#d97706', low: '#16a34a' };
              return (
                <Link key={ann._id} href="/admin/announcements"
                  className="dashboard-list-row dashboard-list-row--announcement"
                  style={{ '--dashboard-list-row-bg': pColors[ann.priority], '--dashboard-list-row-border': `1px solid ${pBorder[ann.priority]}` }}>
                  <div className="row-center gap-2" style={{ marginBottom: '4px' }}>
                    <span className="dashboard-list-badge font-bold uppercase" style={{ fontSize: '0.65rem', color: pText[ann.priority] }}>{ann.priority}</span>
                    <span className="dashboard-list-subtitle" style={{ fontSize: '0.65rem', margin: 0 }}>{new Date(ann.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="dashboard-list-title" style={{ marginBottom: '3px' }}>{ann.title}</p>
                  <p className="dashboard-list-subtitle overflow-hidden" style={{ fontSize: '0.72rem', color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ann.content}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
