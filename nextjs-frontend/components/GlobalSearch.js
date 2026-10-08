'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Search, X, ArrowRight, Clock, Users, CalendarCheck, FolderOpen, Megaphone, Wallet, TrendingUp, Coffee, Calendar, BookOpen, Settings, LayoutDashboard, Briefcase, GraduationCap, FileUser, Receipt, ClipboardCheck, Shield, Download, Trophy, UsersRound, Tag, ClipboardList, BarChart3 } from 'lucide-react';
import styles from './GlobalSearch.module.css';
import { ENABLE_CAFE_FEATURE } from '@/utils/featureFlags';

const ICON_MAP = {
  LayoutDashboard, Users, Clock, CalendarCheck, FolderOpen, Megaphone, Wallet,
  TrendingUp, Coffee, Calendar, BookOpen, Settings, Briefcase, GraduationCap,
  FileUser, Receipt, ClipboardCheck, Shield, Download, Trophy, UsersRound,
  Tag, ClipboardList, BarChart3,
};

const MANAGER_ROLES = ['admin', 'hr', 'md', 'team_lead'];

const ALL_PAGES = [
  // Admin pages
  { path: '/admin/dashboard', label: 'Dashboard', keywords: 'home overview stats', icon: 'LayoutDashboard', role: 'admin' },
  { path: '/admin/employees', label: 'Users / Employees', keywords: 'staff people team members list', icon: 'Users', role: 'admin' },
  { path: '/admin/attendance', label: 'Attendance Management', keywords: 'check in out punch time clock', icon: 'Clock', role: 'admin' },
  { path: '/admin/leaves', label: 'Leave Requests', keywords: 'approve reject pending sick casual', icon: 'CalendarCheck', role: 'admin' },
  { path: '/admin/leave-performance', label: 'Leave Analytics', keywords: 'report chart graph analysis', icon: 'BarChart3', role: 'admin' },
  { path: '/admin/leave-allocation', label: 'Leave Allocation', keywords: 'assign balance quota', icon: 'ClipboardList', role: 'admin' },
  { path: '/admin/leave-types', label: 'Leave Types', keywords: 'sick casual earned privilege', icon: 'Tag', role: 'admin' },
  { path: '/admin/performance', label: 'Performance Reviews', keywords: 'appraisal rating feedback kpi', icon: 'TrendingUp', role: 'admin' },
  { path: '/admin/hiring', label: 'Hiring & Recruitment', keywords: 'job posting candidate interview', icon: 'Briefcase', role: 'admin' },
  { path: '/admin/training', label: 'Training Management', keywords: 'course program learning skill', icon: 'GraduationCap', role: 'admin' },
  { path: '/admin/cv', label: 'Employee CVs', keywords: 'resume profile bio', icon: 'FileUser', role: 'admin' },
  { path: '/admin/payslips', label: 'Payslips', keywords: 'salary pay slip wage', icon: 'Wallet', role: 'admin' },
  { path: '/admin/documents', label: 'Documents', keywords: 'upload file pdf verify', icon: 'FolderOpen', role: 'admin' },
  { path: '/admin/expenses', label: 'Expenses', keywords: 'reimbursement claim bill receipt', icon: 'Receipt', role: 'admin' },
  { path: '/admin/announcements', label: 'Announcements', keywords: 'notice news broadcast message', icon: 'Megaphone', role: 'admin' },
  { path: '/admin/reports', label: 'Reports', keywords: 'export download analytics data', icon: 'BarChart3', role: 'admin' },
  { path: '/admin/office-tasks', label: 'Office Tasks', keywords: 'todo assign work task', icon: 'ClipboardCheck', role: 'admin' },
  { path: '/admin/calendar', label: 'Calendar & Holidays', keywords: 'calendar public holiday off day event meeting reminder', icon: 'Calendar', role: 'admin' },
  { path: '/admin/cafe', label: 'Cafe Menu', keywords: 'food lunch snack beverage canteen', icon: 'Coffee', role: 'admin' },
  { path: '/admin/lunch', label: 'Book Lunch', keywords: 'order meal food booking', icon: 'Coffee', role: 'admin' },
  { path: '/admin/team', label: 'The Team', keywords: 'members directory org chart', icon: 'UsersRound', role: 'admin' },
  { path: '/admin/fun-team', label: 'Fun Team', keywords: 'activity event celebration', icon: 'Trophy', role: 'admin' },
  { path: '/admin/policy', label: 'Company Policy', keywords: 'rules guidelines handbook', icon: 'BookOpen', role: 'admin' },
  { path: '/admin/forms', label: 'Download Forms', keywords: 'template format application', icon: 'Download', role: 'admin' },
  { path: '/admin/roles', label: 'Roles & Permissions', keywords: 'access control rbac', icon: 'Shield', role: 'admin' },
  { path: '/admin/settings', label: 'Settings', keywords: 'config company branding logo', icon: 'Settings', role: 'admin' },
  // Employee pages
  { path: '/employee/dashboard', label: 'Dashboard', keywords: 'home overview my stats', icon: 'LayoutDashboard', role: 'employee' },
  { path: '/employee/attendance', label: 'My Attendance', keywords: 'check in out punch time', icon: 'Clock', role: 'employee' },
  { path: '/employee/leaves', label: 'My Leaves', keywords: 'apply leave balance history', icon: 'CalendarCheck', role: 'employee' },
  { path: '/employee/performance', label: 'My Performance', keywords: 'review rating feedback', icon: 'TrendingUp', role: 'employee' },
  { path: '/employee/expenses', label: 'My Expenses', keywords: 'claim reimbursement bill', icon: 'Receipt', role: 'employee' },
  { path: '/employee/training', label: 'Training Programs', keywords: 'course learning skill', icon: 'GraduationCap', role: 'employee' },
  { path: '/employee/cv', label: 'My CV', keywords: 'resume profile bio', icon: 'FileUser', role: 'employee' },
  { path: '/employee/payslips', label: 'My Payslips', keywords: 'salary pay slip', icon: 'Wallet', role: 'employee' },
  { path: '/employee/documents', label: 'My Documents', keywords: 'upload file pdf', icon: 'FolderOpen', role: 'employee' },
  { path: '/employee/announcements', label: 'Announcements', keywords: 'notice news', icon: 'Megaphone', role: 'employee' },
  { path: '/employee/calendar', label: 'Calendar & Holidays', keywords: 'calendar public holiday off event meeting reminder', icon: 'Calendar', role: 'employee' },
  { path: '/employee/cafe', label: 'Cafe Menu', keywords: 'food lunch snack', icon: 'Coffee', role: 'employee' },
  { path: '/employee/lunch', label: 'Book Lunch', keywords: 'order meal food', icon: 'Coffee', role: 'employee' },
  { path: '/employee/team', label: 'The Team', keywords: 'members directory', icon: 'UsersRound', role: 'employee' },
  { path: '/employee/fun-team', label: 'Fun Team', keywords: 'activity event', icon: 'Trophy', role: 'employee' },
  { path: '/employee/policy', label: 'Policy', keywords: 'rules guidelines', icon: 'BookOpen', role: 'employee' },
  { path: '/employee/forms', label: 'Download Forms', keywords: 'template format', icon: 'Download', role: 'employee' },
  { path: '/employee/profile', label: 'My Profile', keywords: 'account info personal', icon: 'Users', role: 'employee' },
];

// Quick actions
const QUICK_ACTIONS = [
  { label: 'Apply for Leave', path: '/employee/leaves', keywords: 'apply leave request', icon: 'CalendarCheck', role: 'employee' },
  { label: 'Mark Attendance', path: '/employee/attendance', keywords: 'punch check in', icon: 'Clock', role: 'employee' },
  { label: 'Book Lunch', path: '/employee/lunch', keywords: 'order food', icon: 'Coffee', role: 'all' },
  { label: 'Add Employee', path: '/admin/employees', keywords: 'new hire create user', icon: 'Users', role: 'admin' },
  { label: 'Approve Leaves', path: '/admin/leaves', keywords: 'pending approve reject', icon: 'CalendarCheck', role: 'admin' },
  { label: 'Upload Document', path: '/employee/documents', keywords: 'upload file', icon: 'FolderOpen', role: 'employee' },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef();
  const router = useRouter();
  const { user } = useAuth();

  const isManager = MANAGER_ROLES.includes(user?.role);

  // Filter pages based on user role and feature flags
  const availablePages = useMemo(() => ALL_PAGES.filter(p => {
    if (!ENABLE_CAFE_FEATURE && (p.path.includes('/cafe') || p.path.includes('/lunch'))) return false;
    if (isManager) return p.role === 'admin';
    return p.role === 'employee';
  }), [isManager]);

  const availableActions = useMemo(() => QUICK_ACTIONS.filter(a => {
    if (!ENABLE_CAFE_FEATURE && (a.path.includes('/cafe') || a.path.includes('/lunch'))) return false;
    if (a.role === 'all') return true;
    if (isManager) return a.role === 'admin';
    return a.role === 'employee';
  }), [isManager]);

  const results = useMemo(() => {
    if (!query.trim()) {
      return availableActions.map(a => ({ ...a, type: 'action' }));
    }
    const q = query.toLowerCase();
    const pageResults = availablePages.filter(p =>
      p.label.toLowerCase().includes(q) || p.keywords.includes(q)
    ).map(p => ({ ...p, type: 'page' }));

    const actionResults = availableActions.filter(a =>
      a.label.toLowerCase().includes(q) || a.keywords.includes(q)
    ).map(a => ({ ...a, type: 'action' }));

    return [...actionResults, ...pageResults].slice(0, 8);
  }, [availableActions, availablePages, query]);

  // Keyboard shortcut to open (Ctrl+K)
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = useCallback((item) => {
    router.push(item.path);
    setOpen(false);
    setQuery('');
  }, [router]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      handleSelect(results[selectedIdx]);
    }
  };

  return (
    <>
      {/* Search trigger button */}
      <button onClick={() => setOpen(true)} className={styles.trigger}>
        <Search size={14} color="#94a3b8" />
        <span className={`search-text ${styles.triggerText}`}>Search...</span>
        <kbd className={`search-text ${styles.triggerKey}`}>Ctrl+K</kbd>
      </button>

      {/* Search modal */}
      {open && (
        <div className={styles.modal}
          onClick={() => setOpen(false)}>
          {/* Backdrop */}
          <div className={styles.backdrop} />

          {/* Dialog */}
          <div onClick={e => e.stopPropagation()} className={styles.dialog}>
            {/* Input */}
            <div className={styles.inputRow}>
              <Search size={18} color="#6366f1" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setSelectedIdx(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, actions..."
                className={styles.input}
              />
              {query && (
                <button onClick={() => setQuery('')} className={styles.clearButton}>
                  <X size={16} color="#94a3b8" />
                </button>
              )}
              <kbd onClick={() => setOpen(false)} className={styles.escapeKey}>ESC</kbd>
            </div>

            {/* Results */}
            <div className={styles.results}>
              {!query && (
                <p className={styles.resultsHeading}>Quick Actions</p>
              )}
              {results.length === 0 && query && (
                <div className={styles.empty}>
                  <p className={styles.emptyText}>No results for &ldquo;{query}&rdquo;</p>
                </div>
              )}
              {results.map((item, idx) => {
                const Icon = ICON_MAP[item.icon] || Search;
                const isSelected = idx === selectedIdx;
                return (
                  <button key={item.path + item.label} onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`${styles.result} ${isSelected ? styles.selectedResult : ''}`}>
                    <div className={`${styles.resultIcon} ${item.type === 'action' ? styles.actionIcon : ''}`}>
                      <Icon size={15} color={item.type === 'action' ? '#6366f1' : '#64748b'} />
                    </div>
                    <div className={styles.resultContent}>
                      <p className={styles.resultLabel}>{item.label}</p>
                      {item.type === 'action' && <p className={styles.actionLabel}>Quick Action</p>}
                    </div>
                    {isSelected && <ArrowRight size={14} color="#94a3b8" />}
                  </button>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className={styles.footer}>
              <span className={styles.hint}>↑↓ Navigate</span>
              <span className={styles.hint}>↵ Select</span>
              <span className={styles.hint}>ESC Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
