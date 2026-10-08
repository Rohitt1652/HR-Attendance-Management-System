'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { getSettings } from '@/api/settingsApi';
import {
  LayoutDashboard, Users, Clock, CalendarCheck, BarChart3,
  FolderOpen, Megaphone, Wallet, TrendingUp, Shield, Settings,
  Calendar, Coffee, UsersRound, Trophy, BookOpen,
  Download, Briefcase, GraduationCap, FileUser, LogOut,
  ChevronDown, ClipboardCheck, UserCircle, BookMarked,
  Tag, ClipboardList, Receipt, Building2,
} from 'lucide-react';
import styles from './Sidebar.module.css';
import { ENABLE_CAFE_FEATURE } from '@/utils/featureFlags';


/*
 * Sidebar.js — static styles use CSS classes from globals.css (.sidebar__*)
 * Designer: edit --sidebar-* tokens in globals.css :root to restyle the sidebar.
 *
 * Remaining inline styles (DO NOT touch — all dynamic):
 *   - <aside> width:       switches between --sidebar-width-full/mini via `mini` state
 *   - group toggle color:  driven by group.color + hasActive boolean
 *   - ChevronDown color:   driven by group.color + hasActive boolean
 *   - nav link bg/border:  driven by group.color + isActive boolean
 *   - nav icon bg:         driven by group.color + isActive boolean
 *   - Icon color/weight:   driven by group.color + isActive boolean
 *   - items maxHeight:     '0px' or '1000px' driven by isCollapsed state
 *   - logo img filter:     brightness(0) invert(1) — keeps logo white
 */

const MANAGER_ROLES = ['admin', 'hr', 'md', 'team_lead'];

const getAdminGroups = () => [
  { label: 'Overview', color: '#6366f1', items: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]},
  { label: 'People', color: '#0ea5e9', items: [
    { to: '/admin/employees',   label: 'Users',       icon: Users,      perm: 'employees:view' },
    { to: '/admin/departments', label: 'Departments', icon: Building2,  perm: 'departments:view' },
    { to: '/admin/attendance',  label: 'Attendance',  icon: Clock,      perm: 'attendance:view_all' },
    { to: '/admin/performance',label: 'Performance', icon: TrendingUp, perm: 'performance:view_all' },
  ]},
  { label: 'Leave', color: '#f59e0b', items: [
    { to: '/admin/my-leaves',          label: 'My Leaves',       icon: CalendarCheck, perm: 'leaves:apply' },
    { to: '/admin/leaves',             label: 'Leave Requests',  icon: CalendarCheck, perm: 'leaves:view_all' },
    { to: '/admin/leave-summary',      label: 'Leave Summary',   icon: ClipboardList, perm: 'leave_summary:view' },
    { to: '/admin/monthly-attendance', label: 'Monthly Record',  icon: Calendar,      perm: 'monthly_record:view' },
    { to: '/admin/leave-performance',  label: 'Leave Analytics', icon: BarChart3,     perm: 'reports:view' },
    { to: '/admin/leave-allocation',   label: 'Allocation',      icon: ClipboardList, perm: 'settings:view' },
    { to: '/admin/leave-types',        label: 'Leave Types',     icon: Tag,           perm: 'settings:edit' },
  ]},
  { label: 'HR Tools', color: '#8b5cf6', items: [
    { to: '/admin/hiring',    label: 'Hiring',       icon: Briefcase,     perm: 'hiring:manage' },
    { to: '/admin/training',  label: 'Training',     icon: GraduationCap, perm: 'training:manage' },
    { to: '/admin/cv',        label: 'Employee CVs', icon: FileUser,      perm: 'cv:view' },
    { to: '/admin/payslips',  label: 'Payslips',     icon: Wallet,        perm: 'payslips:manage' },
    { to: '/admin/documents', label: 'Documents',    icon: FolderOpen,    perm: 'documents:manage' },
    { to: '/admin/expenses',  label: 'Expenses',     icon: Receipt,       perm: 'expenses:manage' },
  ]},
  { label: 'Communication', color: '#ec4899', items: [
    { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, perm: 'announcements:view' },
    { to: '/admin/reports',       label: 'Reports',       icon: BarChart3, perm: 'reports:view' },
  ]},
  { label: 'Workspace', color: '#22c55e', items: [
    { to: '/admin/office-tasks', label: 'Office Tasks',   icon: ClipboardCheck, perm: 'tasks:view' },
    { to: '/admin/calendar',     label: 'Calendar',       icon: Calendar,       perm: 'calendar:view' },
    { to: '/admin/cafe',         label: 'Cafe & Lunch',   icon: Coffee,         perm: 'cafe:view' },
    { to: '/admin/lunch',        label: 'Cafe Orders',    icon: BookMarked,     perm: 'cafe:manage' },
    { to: '/admin/team',         label: 'The Team',       icon: UsersRound,     perm: 'team:view' },
    { to: '/admin/fun-team',     label: 'Fun Team',       icon: Trophy,         perm: 'funteam:view' },
    { to: '/admin/policy',       label: 'Policy',         icon: BookOpen,       perm: 'policy:view' },
    { to: '/admin/forms',        label: 'Download Forms', icon: Download,       perm: 'forms:view' },
  ]},
  { label: 'Admin', color: '#ef4444', items: [
    { to: '/admin/roles',    label: 'Roles & Permissions', icon: Shield,   perm: 'roles:view' },
    { to: '/admin/settings', label: 'Settings',            icon: Settings, perm: 'settings:view' },
  ]},
];

const getEmployeeGroups = () => [
  { label: 'Overview', color: '#6366f1', items: [
    { to: '/employee/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]},
  { label: 'My Work', color: '#0ea5e9', items: [
    { to: '/employee/attendance',  label: 'My Attendance',  icon: Clock,       perm: 'attendance:view_own' },
    { to: '/employee/leaves',      label: 'My Leaves',      icon: CalendarCheck, perm: 'leaves:view_own' },
    { to: '/employee/performance', label: 'My Performance', icon: TrendingUp,  perm: 'performance:view_own' },
    { to: '/employee/expenses',    label: 'My Expenses',    icon: Receipt,     perm: 'expenses:view_own' },
  ]},
  { label: 'Career', color: '#8b5cf6', items: [
    { to: '/employee/training',  label: 'Training',      icon: GraduationCap, perm: 'training:manage' },
    { to: '/employee/cv',        label: 'My CV',         icon: FileUser },
    { to: '/employee/payslips',  label: 'My Payslips',   icon: Wallet,     perm: 'payslips:view_own' },
    { to: '/employee/documents', label: 'My Documents',  icon: FolderOpen, perm: 'documents:view' },
  ]},
  { label: 'Workspace', color: '#22c55e', items: [
    { to: '/employee/announcements', label: 'Announcements',  icon: Megaphone,  perm: 'announcements:view' },
    { to: '/employee/calendar',      label: 'Calendar',       icon: Calendar,   perm: 'calendar:view' },
    { to: '/employee/cafe',          label: 'Cafe & Lunch',   icon: Coffee,     perm: 'cafe:view' },
    { to: '/employee/lunch',         label: 'My Orders',      icon: BookMarked, perm: 'lunch:order' },
    { to: '/employee/team',          label: 'The Team',       icon: UsersRound, perm: 'team:view' },
    { to: '/employee/fun-team',      label: 'Fun Team',       icon: Trophy,     perm: 'funteam:view' },
    { to: '/employee/policy',        label: 'Policy',         icon: BookOpen,   perm: 'policy:view' },
    { to: '/employee/forms',         label: 'Download Forms', icon: Download,   perm: 'forms:view' },
    { to: '/employee/profile',       label: 'My Profile',     icon: UserCircle },
  ]},
];

export default function Sidebar({ onClose, collapsed }) {
  const { user, logout } = useAuth();
  const pathname    = usePathname();
  const isManager   = MANAGER_ROLES.includes(user?.role);
  const isAdmin     = user?.role === 'admin' || user?.role === 'md';
  const userPerms   = user?.permissions || [];
  const [branding, setBranding]           = useState({ companyName: 'WorkforceOS', companyLogo: '', companyTagline: '' });
  const [sectionState, setSectionState]   = useState({});
  const mini = collapsed || false;
  const [initialized, setInitialized]     = useState(false);

  useEffect(() => {
    getSettings().then(r => {
      const d = r.data.data;
      setBranding({ companyName: d.companyName || 'WorkforceOS', companyLogo: d.companyLogo || '', companyTagline: d.companyTagline || '' });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialized) return;
    const allGroups = isManager ? getAdminGroups() : getEmployeeGroups();
    const initial = {};
    allGroups.forEach((g, i) => {
      const hasActive = g.items.some(item => pathname === item.to || pathname.startsWith(item.to + '/'));
      initial[i] = !hasActive;
    });
    initial[0] = false;
    const initialization = window.setTimeout(() => {
      setSectionState(initial);
      setInitialized(true);
    }, 0);
    return () => window.clearTimeout(initialization);
  }, [initialized, isManager, pathname]);

  useEffect(() => {
    if (!initialized) return;
    const allGroups = isManager ? getAdminGroups() : getEmployeeGroups();
    allGroups.forEach((g, i) => {
      const hasActive = g.items.some(item => pathname === item.to || pathname.startsWith(item.to + '/'));
      if (hasActive) setSectionState(prev => ({ ...prev, [i]: false }));
    });
  }, [pathname, initialized, isManager]);

  const groups = useMemo(() => {
    return (isManager ? getAdminGroups() : getEmployeeGroups())
      .map(g => ({
        ...g,
        items: g.items.filter(item => {
          if (!ENABLE_CAFE_FEATURE && (item.to.includes('/cafe') || item.to.includes('/lunch'))) return false;
          return !item.perm || isAdmin || userPerms.includes(item.perm);
        }),
      }))
      .filter(g => g.items.length > 0);
  }, [isManager, isAdmin, userPerms]);

  const handleNavClick = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 900 && onClose) onClose();
  }, [onClose]);

  const toggleGroup = useCallback((i) => setSectionState(c => ({ ...c, [i]: !c[i] })), []);

  return (
    /* width is state-driven (mini toggle) — must stay inline */
    <aside className={`sidebar ${mini ? styles.mini : styles.full}`}>

      {/* ── Logo ── */}
      <div className={`sidebar__logo-wrap ${mini ? 'sidebar__logo-wrap--mini' : 'sidebar__logo-wrap--full'}`}>
        {mini ? (
          <div className="sidebar__logo-icon">
            <ClipboardCheck size={16} color="#fff" strokeWidth={2.5} />
          </div>
        ) : branding.companyLogo ? (
          <div className={styles.logoImageWrap}>
            <img
              src={branding.companyLogo}
              alt={branding.companyName}
              className={styles.logoImage}
            />
            {/* {branding.companyTagline && <p className="sidebar__tagline">{branding.companyTagline}</p>} */}
          </div>
        ) : (
          <>
            <div className="sidebar__logo-icon">
              <ClipboardCheck size={16} color="#fff" strokeWidth={2.5} />
            </div>
            <div>
              <p className="sidebar__company-name">{branding.companyName}</p>
              {branding.companyTagline && <p className="sidebar__tagline">{branding.companyTagline}</p>}
            </div>
          </>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className={`sidebar__nav ${mini ? 'sidebar__nav--mini' : 'sidebar__nav--full'}`}>
        {groups.map((group, gi) => {
          const isCollapsed = sectionState[gi];
          const hasActive   = group.items.some(item => pathname === item.to || pathname.startsWith(item.to + '/'));

          return (
            <div key={gi} className={`sidebar__group${mini ? ' sidebar__group--mini' : ''}`}>

              {/* Section header — color is data-driven */}
              {!mini && (
                <button
                  onClick={() => toggleGroup(gi)}
                  aria-expanded={!isCollapsed}
                  className={`sidebar__group-btn ${gi > 0 ? styles.spacedGroup : ''}`}
                >
                  <span
                    className="sidebar__group-label"
                    style={{ color: hasActive ? group.color : 'rgba(148,163,184,0.7)' }}
                  >
                    {group.label}
                  </span>
                  <ChevronDown
                    size={12}
                    color={hasActive ? group.color : 'rgba(148,163,184,0.5)'}
                    className={`${styles.chevron} ${isCollapsed ? styles.chevronCollapsed : ''}`}
                  />
                </button>
              )}

              {/* Items — maxHeight driven by collapse state */}
              {(!isCollapsed || mini) && (
                <div
                  className={`sidebar__items-wrap ${isCollapsed && !mini ? styles.itemsCollapsed : styles.itemsExpanded}`}
                >
                  {group.items.map((link) => {
                    const Icon     = link.icon;
                    const isActive = pathname === link.to || pathname.startsWith(link.to + '/');

                    /* Active state: bg, borderLeft, color — all use group.color (data-driven) */
                    const activeLinkStyle = isActive ? {
                      background:  `linear-gradient(135deg, ${group.color}25, ${group.color}10)`,
                      borderLeft:  `var(--sidebar-active-border-width) solid ${group.color}`,
                      color:       '#ffffff',
                      fontWeight:  600,
                    } : {};

                    const activeIconStyle = isActive ? { background: `${group.color}20` } : {};

                    return (
                      <Link
                        key={link.to}
                        href={link.to}
                        title={mini ? link.label : undefined}
                        onClick={handleNavClick}
                        className={`sidebar__nav-link${mini ? ' sidebar__nav-link--mini' : ''}`}
                        style={activeLinkStyle}
                        onMouseEnter={e => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            e.currentTarget.style.color = '#ffffff';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'rgba(226,232,240,0.8)';
                          }
                        }}
                      >
                        <div
                          className={`sidebar__nav-icon${mini ? ' sidebar__nav-icon--mini' : ''}`}
                          style={activeIconStyle}
                        >
                          <Icon
                            size={mini ? 17 : 15}
                            color={isActive ? group.color : 'rgba(148,163,184,0.9)'}
                            strokeWidth={isActive ? 2.2 : 1.8}
                          />
                        </div>
                        {!mini && <span className="sidebar__nav-label">{link.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className={`sidebar__footer ${mini ? 'sidebar__footer--mini' : 'sidebar__footer--full'}`}>
        <button
          onClick={logout}
          title={mini ? 'Sign Out' : undefined}
          className={`sidebar__signout-btn${mini ? ' sidebar__signout-btn--mini' : ''}`}
        >
          <LogOut size={15} />
          {!mini && <span>Sign Out</span>}
        </button>

        {!mini && (
          <p className="sidebar__version">
            Logged in as {user?.role === 'team_lead' ? 'Team Lead' : user?.role === 'hr' ? 'HR' : user?.role === 'md' ? 'MD' : user?.role === 'admin' ? 'Admin' : 'Employee'}
          </p>
        )}
      </div>
    </aside>
  );
}
