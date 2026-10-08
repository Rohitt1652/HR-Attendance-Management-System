'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Search,
  RotateCcw,
  CalendarCheck,
  CheckCircle2,
  TriangleAlert,
  HelpCircle,
  ClockAlert,
  GitCompareArrows,
  BarChart3,
  House,
  FileText,
  Eye,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  X,
  ArrowLeftRight,
  CalendarClock,
  Clock3,
  Hourglass,
  SlidersHorizontal,
  CircleArrowRight,
  MoreHorizontal,
} from 'lucide-react';
import { getAttendanceReconciliation, assignWfh } from '@/services/attendanceApi';
import { listEmployees } from '@/services/employeeApi';
import api from '@/services/axios';
import {
  getPresetDateRange,
  calculateReconciliationRate,
  shouldShowHighUnaccountedWarning,
  formatCsvFilename,
  buildAttendanceUrl,
  getRecommendedActionGuidance,
  resolveInitialPreset,
  getPresetAriaPressed,
} from '@/utils/reconciliationHelpers';
import styles from './AttendanceReconciliation.module.css';

const ISSUE_TYPES = [
  { key: 'action_required', label: 'Action Required' },
  { key: 'not_marked', label: 'Unaccounted' },
  { key: 'incomplete_punch', label: 'Incomplete Punch' },
  { key: 'conflict', label: 'Attendance / Leave Conflict' },
  { key: 'portal_biometric_mismatch', label: 'Portal / Biometric Mismatch' },
  { key: 'pending_leave', label: 'Leave Approval Pending' },
  { key: 'partial_leave_missing_attendance', label: 'Half-day Leave Needs Attendance' },
  { key: 'short_leave_missing_attendance', label: 'Short Leave Needs Attendance' },
  { key: 'all', label: 'All Evaluated Dates' },
  { key: 'matched_present', label: 'Matched – Present' },
  { key: 'matched_wfh', label: 'Matched – WFH' },
  { key: 'matched_leave', label: 'Matched – On Leave' },
  { key: 'matched_absent', label: 'Matched – Persisted Absent' },
];

const QUICK_PRESETS = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

function getBadgeIcon(type) {
  switch (type) {
    case 'not_marked': return <HelpCircle size={13} style={{ flexShrink: 0 }} />;
    case 'conflict': return <GitCompareArrows size={13} style={{ flexShrink: 0 }} />;
    case 'incomplete_punch': return <ClockAlert size={13} style={{ flexShrink: 0 }} />;
    case 'pending_leave': return <Hourglass size={13} style={{ flexShrink: 0 }} />;
    case 'portal_biometric_mismatch': return <ArrowLeftRight size={13} style={{ flexShrink: 0 }} />;
    case 'partial_leave_missing_attendance': return <CalendarClock size={13} style={{ flexShrink: 0 }} />;
    case 'short_leave_missing_attendance': return <Clock3 size={13} style={{ flexShrink: 0 }} />;
    default: return <CheckCircle2 size={13} style={{ flexShrink: 0 }} />;
  }
}

function AttendanceReconciliationContent() {
  const searchParams = useSearchParams();

  // Table wrapper DOM ref for predictable horizontal scroll positioning
  const tableWrapperRef = useRef(null);

  const resetTableScroll = useCallback(() => {
    if (tableWrapperRef.current) {
      tableWrapperRef.current.scrollLeft = 0;
    }
  }, []);

  // Parse deep-link query parameters
  const urlEmp = searchParams.get('employeeId') || searchParams.get('employeeCode') || 'all';
  const urlDept = searchParams.get('department') || 'all';
  const urlStart = searchParams.get('startDate') || '';
  const urlEnd = searchParams.get('endDate') || '';
  const urlIssue = searchParams.get('issueType') || 'action_required';
  const urlPreset = searchParams.get('preset') || '';

  const defaultDates = useMemo(() => getPresetDateRange('this_month'), []);

  // Filter states: Draft (UI inputs) vs Applied (active query parameters)
  const [draftFilters, setDraftFilters] = useState({
    startDate: urlStart || defaultDates.startDate,
    endDate: urlEnd || defaultDates.endDate,
    department: urlDept,
    employeeId: urlEmp,
    issueType: urlIssue,
  });

  const [appliedFilters, setAppliedFilters] = useState({
    startDate: urlStart || defaultDates.startDate,
    endDate: urlEnd || defaultDates.endDate,
    department: urlDept,
    employeeId: urlEmp,
    issueType: urlIssue,
  });

  // Explicit Quick Preset selected-state (stable values: 'yesterday', 'this_week', 'this_month', 'last_month', null)
  const [activePreset, setActivePreset] = useState(() => resolveInitialPreset(urlPreset, urlStart, urlEnd));

  // Client-side issue breakdown pill filter (does NOT alter overall summary cards)
  const [tableIssueFilter, setTableIssueFilter] = useState(urlIssue);

  // Pagination & data states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Options for filter dropdowns
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Expanded row drill-down set
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Kebab / More Options menu dropdown state
  const [activeMenuRowKey, setActiveMenuRowKey] = useState(null);

  useEffect(() => {
    if (!activeMenuRowKey) return;
    const handleClickOutside = () => setActiveMenuRowKey(null);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveMenuRowKey(null);
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuRowKey]);

  // WFH Modal state
  const [wfhModalOpen, setWfhModalOpen] = useState(false);
  const [wfhTarget, setWfhTarget] = useState(null);
  const [wfhReason, setWfhReason] = useState('Work From Home approved');
  const [wfhSubmitting, setWfhSubmitting] = useState(false);

  // Load dropdown options for active non-admin employees and departments
  useEffect(() => {
    let isMounted = true;
    async function fetchOptions() {
      try {
        const r1 = await listEmployees({ limit: 200, page: 1, status: 'Active' });
        const { data: empData, pagination: pg } = r1.data;
        let allEmps = empData || [];
        if (pg?.pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: pg.pages - 1 }, (_, i) => listEmployees({ limit: 200, page: i + 2, status: 'Active' }))
          );
          allEmps = [...allEmps, ...rest.flatMap(r => r.data.data)];
        }
        if (!isMounted) return;

        const excludedRoles = ['admin', 'administrator', 'superadmin'];
        const eligibleEmps = allEmps.filter(e => !excludedRoles.includes((e.role || '').toLowerCase()));
        eligibleEmps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        setEmployees(eligibleEmps);

        const depts = [...new Set(eligibleEmps.map(e => e.department).filter(Boolean))].sort();
        setDepartments(depts);
      } catch (err) {
        console.warn('Could not load employee/department options:', err);
      }
    }
    fetchOptions();
    return () => { isMounted = false; };
  }, []);

  // Primary API Data Fetcher using appliedFilters
  const loadData = useCallback(async (customFilters) => {
    const filtersToUse = customFilters || appliedFilters;
    setLoading(true);
    setError(null);
    try {
      const params = {
        issueType: filtersToUse.issueType,
        department: filtersToUse.department,
        employeeId: filtersToUse.employeeId,
        page,
        limit,
      };
      if (filtersToUse.startDate) params.startDate = filtersToUse.startDate;
      if (filtersToUse.endDate) params.endDate = filtersToUse.endDate;

      const res = await getAttendanceReconciliation(params);
      const resData = res.data?.data;
      setData(resData);
      resetTableScroll();
    } catch (err) {
      console.error('Failed to load reconciliation data:', err);
      const userMessage = err.response?.data?.message || err.message || 'Failed to load reconciliation report';
      setError(userMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, limit, resetTableScroll]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Generate Report click (with duplicate request protection & scroll reset)
  const handleGenerateReport = () => {
    if (loading) return;
    setAppliedFilters(draftFilters);
    setTableIssueFilter(draftFilters.issueType);
    setPage(1);
    resetTableScroll();
  };

  // Handle Clear click (restores default range, filters & resets scroll)
  const handleClearFilters = () => {
    if (loading) return;
    const freshDefaults = getPresetDateRange('this_month');
    const cleared = {
      startDate: freshDefaults.startDate,
      endDate: freshDefaults.endDate,
      department: 'all',
      employeeId: 'all',
      issueType: 'action_required',
    };
    setDraftFilters(cleared);
    setAppliedFilters(cleared);
    setActivePreset('this_month');
    setTableIssueFilter('action_required');
    setPage(1);
    resetTableScroll();
  };

  // Quick Date Preset Handler using Asia/Kolkata boundary logic
  const handleQuickPreset = (presetKey) => {
    if (loading) return;
    const { startDate, endDate } = getPresetDateRange(presetKey);
    setActivePreset(presetKey);
    const updated = {
      ...draftFilters,
      startDate,
      endDate,
    };
    setDraftFilters(updated);
    setAppliedFilters(updated);
    setPage(1);
    resetTableScroll();
  };

  // CSV Export (applied filters only, complete result independent of UI pagination)
  const handleExportCsv = async () => {
    try {
      const params = {
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
        department: appliedFilters.department,
        employeeId: appliedFilters.employeeId,
        issueType: appliedFilters.issueType,
        exportCsv: 'true',
      };
      const res = await getAttendanceReconciliation(params);
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = formatCsvFilename(appliedFilters.startDate, appliedFilters.endDate);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to export CSV: ' + (err.response?.data?.message || err.message || 'Error generating export'));
    }
  };

  // Row Expand/Collapse Handler (Does NOT reset scroll position)
  const toggleRowExpand = (rowKey) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  // Open WFH Modal
  const handleOpenWfh = (row) => {
    setWfhTarget(row);
    setWfhReason('Work From Home assigned via Reconciliation');
    setWfhModalOpen(true);
  };

  // Submit WFH
  const handleAssignWfhSubmit = async (e) => {
    e.preventDefault();
    if (!wfhTarget || wfhSubmitting) return;
    setWfhSubmitting(true);
    try {
      await assignWfh({
        employeeId: wfhTarget.employee._id,
        date: wfhTarget.date,
        reason: wfhReason,
      });
      setWfhModalOpen(false);
      setWfhTarget(null);
      loadData();
    } catch (err) {
      alert('Failed to assign WFH: ' + (err.response?.data?.message || err.message));
    } finally {
      setWfhSubmitting(false);
    }
  };

  const summary = data?.summary || {};
  const dateRange = data?.dateRange || {};
  const pagination = data?.pagination || {};
  const rows = data?.rows || [];

  // Derived Summary Rate & High-Unaccounted warning
  const reconciliationRateDisplay = useMemo(() => {
    return calculateReconciliationRate(summary.matchedCount, summary.employeeDatesChecked);
  }, [summary.matchedCount, summary.employeeDatesChecked]);

  const isHighUnaccounted = useMemo(() => {
    return shouldShowHighUnaccountedWarning(summary.not_marked, summary.employeeDatesChecked);
  }, [summary.not_marked, summary.employeeDatesChecked]);

  // Find selected employee object for scope line
  const selectedEmpObj = useMemo(() => {
    if (!appliedFilters.employeeId || appliedFilters.employeeId === 'all') return null;
    return employees.find(e => e._id === appliedFilters.employeeId || e.employeeId === appliedFilters.employeeId);
  }, [employees, appliedFilters.employeeId]);

  // Format scope line
  const scopeLineText = useMemo(() => {
    const formatDatePretty = (dStr) => {
      if (!dStr) return '';
      const [y, m, d] = dStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const sFormatted = formatDatePretty(appliedFilters.startDate);
    const eFormatted = formatDatePretty(appliedFilters.endDate);
    const dateRangeStr = sFormatted && eFormatted ? `${sFormatted} – ${eFormatted}` : 'Selected Period';

    const empName = selectedEmpObj?.name || (appliedFilters.employeeId !== 'all' ? appliedFilters.employeeId : null);
    const empCode = selectedEmpObj?.employeeId ? ` (${selectedEmpObj.employeeId})` : '';

    if (empName) {
      return `Showing action-required records for ${empName}${empCode}, ${dateRangeStr}`;
    } else if (appliedFilters.department && appliedFilters.department !== 'all') {
      return `Showing action-required records for ${appliedFilters.department} department, ${dateRangeStr}`;
    } else {
      return `Showing reconciliation for ${dateRangeStr}`;
    }
  }, [appliedFilters, selectedEmpObj]);

  // Server-filtered rows with fallback for client display
  const filteredTableRows = useMemo(() => {
    if (!rows.length) return [];
    if (tableIssueFilter === 'all' || tableIssueFilter === appliedFilters.issueType) return rows;
    if (tableIssueFilter === 'action_required') return rows.filter(r => r.isActionRequired);
    return rows.filter(r => r.issueType === tableIssueFilter);
  }, [rows, tableIssueFilter, appliedFilters.issueType]);

  // Handle breakdown pill click (updates server query filter, resets page to 1 & resets table scroll without mutating overall summary cards)
  const handlePillClick = (issueKey) => {
    if (loading) return;
    setTableIssueFilter(issueKey);
    setDraftFilters(prev => ({ ...prev, issueType: issueKey }));
    setAppliedFilters(prev => ({ ...prev, issueType: issueKey }));
    setPage(1);
    resetTableScroll();
  };

  const getBadgeStyle = (type) => {
    switch (type) {
      case 'not_marked': return styles.badgeNotMarked;
      case 'conflict': return styles.badgeConflict;
      case 'incomplete_punch': return styles.badgeIncomplete;
      case 'pending_leave': return styles.badgePending;
      case 'portal_biometric_mismatch': return styles.badgeMismatch;
      case 'partial_leave_missing_attendance':
      case 'short_leave_missing_attendance': return styles.badgePartial;
      default: return styles.badgeMatched;
    }
  };

  return (
    <div className={styles.container}>
      {/* 1. Page Title and Short Explanation */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Missing Attendance Reconciliation</h1>
          </div>
          <p className={styles.subtitle}>
            Compare biometric punches with portal attendance, Leave and WFH records to identify dates requiring HR review.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/admin/attendance" className={styles.btnSecondary}>
            <ArrowLeft size={16} /> Back to Attendance
          </Link>
          <button
            onClick={handleExportCsv}
            disabled={!rows.length || loading}
            aria-label="Export Reconciliation Exceptions CSV"
            className={styles.btnPrimary}
          >
            <Download size={16} /> Export Exceptions CSV
          </button>
        </div>
      </div>

      {/* 2. Selected/Effective Report Period Scope Banner */}
      <div className={styles.scopeBanner}>
        <span className={styles.scopeBadge}>
          <SlidersHorizontal size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
          Scope
        </span>
        <span>{scopeLineText}</span>
      </div>

      {/* 3. High Unaccounted Warning Banner */}
      {isHighUnaccounted && !loading && (
        <div className={styles.warningBanner} style={{ borderColor: '#f97316', background: '#fff7ed', color: '#9a3412' }}>
          <TriangleAlert size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>High Unaccounted Ratio Warning:</strong> A high number of unaccounted dates was detected ({summary.not_marked} of {summary.employeeDatesChecked} checked dates). Please confirm that biometric attendance has been uploaded for the selected period before taking action.
          </span>
        </div>
      )}

      {/* Safety Warning Banner for Today */}
      {dateRange.isTodayIncluded && (
        <div className={styles.warningBanner}>
          <Info size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>Today is included in the date range.</strong> Today may contain incomplete attendance because the working day has not ended.
          </span>
        </div>
      )}

      {/* API Error Banner with Retry */}
      {error && (
        <div className={styles.errorBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TriangleAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData()}
            aria-label="Retry loading reconciliation report"
            className={styles.btnSecondary}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* 4. Filters and Quick Date Presets */}
      <div className={styles.filterCard}>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label htmlFor="rec-start-date" className={styles.filterLabel}>Start Date</label>
            <input
              id="rec-start-date"
              type="date"
              value={draftFilters.startDate}
              onChange={(e) => {
                setDraftFilters(prev => ({ ...prev, startDate: e.target.value }));
                setActivePreset(null);
              }}
              className={styles.inputControl}
            />
          </div>

          <div className={styles.filterGroup}>
            <label htmlFor="rec-end-date" className={styles.filterLabel}>End Date</label>
            <input
              id="rec-end-date"
              type="date"
              value={draftFilters.endDate}
              onChange={(e) => {
                setDraftFilters(prev => ({ ...prev, endDate: e.target.value }));
                setActivePreset(null);
              }}
              className={styles.inputControl}
            />
          </div>

          <div className={styles.filterGroup} style={{ flex: 'none' }}>
            <span className={styles.filterLabel}>Quick Presets</span>
            <div className={styles.quickDateBtns}>
              {QUICK_PRESETS.map((p) => {
                const isSelected = activePreset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handleQuickPreset(p.key)}
                    aria-pressed={getPresetAriaPressed(activePreset, p.key)}
                    className={`${styles.quickBtn} ${isSelected ? styles.quickBtnActive : ''}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label htmlFor="rec-department" className={styles.filterLabel}>Department</label>
            <select
              id="rec-department"
              value={draftFilters.department}
              onChange={(e) => setDraftFilters(prev => ({ ...prev, department: e.target.value }))}
              className={styles.selectControl}
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label htmlFor="rec-employee" className={styles.filterLabel}>Employee</label>
            <select
              id="rec-employee"
              value={draftFilters.employeeId}
              onChange={(e) => setDraftFilters(prev => ({ ...prev, employeeId: e.target.value }))}
              className={styles.selectControl}
            >
              <option value="all">All Employees</option>
              {employees.map(emp => (
                <option key={emp._id} value={emp._id}>
                  {emp.name} ({emp.employeeId || 'No ID'})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup} style={{ minWidth: 200 }}>
            <label htmlFor="rec-issue-type" className={styles.filterLabel}>Issue Type</label>
            <select
              id="rec-issue-type"
              value={draftFilters.issueType}
              onChange={(e) => setDraftFilters(prev => ({ ...prev, issueType: e.target.value }))}
              className={styles.selectControl}
            >
              {ISSUE_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterButtons}>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={loading}
              aria-label="Generate Reconciliation Report"
              className={styles.btnPrimary}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className={styles.spinnerIcon} /> Loading...
                </>
              ) : (
                <>
                  <Search size={16} /> Generate Report
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={loading}
              aria-label="Clear all filters"
              className={styles.btnSecondary}
            >
              <RotateCcw size={16} /> Clear
            </button>
          </div>
        </div>
      </div>

      {/* 5. Summary Cards (7 Cards with Subtle Icon Containers) */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Employee-Dates Checked</span>
            <div className={`${styles.statIcon} ${styles.iconBlue}`}>
              <CalendarCheck size={18} />
            </div>
          </div>
          <div className={styles.statValue}>{loading ? '...' : (summary.employeeDatesChecked ?? 0)}</div>
          <div className={styles.statSubtext}>Eligible employee-dates</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Reconciled</span>
            <div className={`${styles.statIcon} ${styles.iconGreen}`}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className={styles.statValue}>{loading ? '...' : (summary.matchedCount ?? 0)}</div>
          <div className={styles.statSubtext}>Matched non-actionable</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Action Required</span>
            <div className={`${styles.statIcon} ${styles.iconRed}`}>
              <TriangleAlert size={18} />
            </div>
          </div>
          <div className={styles.statValue}>{loading ? '...' : (summary.actionRequiredCount ?? 0)}</div>
          <div className={styles.statSubtext}>Unresolved exception days</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Unaccounted</span>
            <div className={`${styles.statIcon} ${styles.iconNeutral}`}>
              <HelpCircle size={18} />
            </div>
          </div>
          <div className={styles.statValue}>{loading ? '...' : (summary.not_marked ?? 0)}</div>
          <div className={styles.statSubtext}>No punch, Leave or WFH</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Incomplete Punches</span>
            <div className={`${styles.statIcon} ${styles.iconYellow}`}>
              <ClockAlert size={18} />
            </div>
          </div>
          <div className={styles.statValue}>{loading ? '...' : (summary.incomplete_punch ?? 0)}</div>
          <div className={styles.statSubtext}>Missing check-in or out</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Conflicts</span>
            <div className={`${styles.statIcon} ${styles.iconOrange}`}>
              <GitCompareArrows size={18} />
            </div>
          </div>
          <div className={styles.statValue}>{loading ? '...' : (summary.conflict ?? 0)}</div>
          <div className={styles.statSubtext}>Punch on Leave/WFH</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statTitle}>Reconciliation Rate</span>
            <div className={`${styles.statIcon} ${styles.iconPurple}`}>
              <BarChart3 size={18} />
            </div>
          </div>
          <div className={styles.statValue}>
            {loading ? '...' : (typeof reconciliationRateDisplay === 'number' ? `${reconciliationRateDisplay}%` : reconciliationRateDisplay)}
          </div>
          <div className={styles.progressBarTrack}>
            <div
              className={styles.progressBarFill}
              style={{ width: typeof reconciliationRateDisplay === 'number' ? `${reconciliationRateDisplay}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* 6. Issue Breakdown Clickable Filter Pills */}
      <div className={styles.breakdownCard}>
        <div className={styles.breakdownTitle}>Issue-Type Breakdown (Click to filter table)</div>
        <div className={styles.breakdownPills}>
          <button
            type="button"
            onClick={() => handlePillClick('action_required')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'action_required' ? styles.pillActive : ''}`}
          >
            Action Required <span className={styles.pillCount}>{summary.actionRequiredCount ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('not_marked')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'not_marked' ? styles.pillActive : ''}`}
          >
            Unaccounted <span className={styles.pillCount}>{summary.not_marked ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('incomplete_punch')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'incomplete_punch' ? styles.pillActive : ''}`}
          >
            Incomplete Punch <span className={styles.pillCount}>{summary.incomplete_punch ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('conflict')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'conflict' ? styles.pillActive : ''}`}
          >
            Attendance / Leave Conflict <span className={styles.pillCount}>{summary.conflict ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('portal_biometric_mismatch')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'portal_biometric_mismatch' ? styles.pillActive : ''}`}
          >
            Portal / Biometric Mismatch <span className={styles.pillCount}>{summary.portal_biometric_mismatch ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('pending_leave')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'pending_leave' ? styles.pillActive : ''}`}
          >
            Leave Approval Pending <span className={styles.pillCount}>{summary.pending_leave ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('partial_leave_missing_attendance')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'partial_leave_missing_attendance' ? styles.pillActive : ''}`}
          >
            Half-day Leave Needs Attendance <span className={styles.pillCount}>{summary.partial_leave_missing_attendance ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('short_leave_missing_attendance')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'short_leave_missing_attendance' ? styles.pillActive : ''}`}
          >
            Short Leave Needs Attendance <span className={styles.pillCount}>{summary.short_leave_missing_attendance ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePillClick('all')}
            className={`${styles.breakdownPill} ${tableIssueFilter === 'all' ? styles.pillActive : ''}`}
          >
            All Evaluated Dates <span className={styles.pillCount}>{summary.employeeDatesChecked ?? 0}</span>
          </button>
        </div>
      </div>

      {/* 7. Action-Required Exception Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeaderBar}>
          <div className={styles.tableTitle}>
            Reconciliation Exception Log ({filteredTableRows.length} rows showing)
          </div>
        </div>

        <div className={styles.tableWrapper} ref={tableWrapperRef} tabIndex={0} aria-label="Reconciliation Exception Log Table">
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colDate}>Date</th>
                <th className={styles.colEmployee}>Employee</th>
                <th className={styles.colEmpId}>Employee ID</th>
                <th className={styles.colDepartment}>Department</th>
                <th className={styles.colPunch}>Biometric Punch</th>
                <th className={styles.colPortal}>Portal Attendance</th>
                <th className={styles.colLeave}>Leave / WFH</th>
                <th className={styles.colIssue}>Issue</th>
                <th className={styles.colExplanation}>Explanation</th>
                <th className={styles.colRecommendedAction}>Recommended Action</th>
                <th className={styles.colViewAction}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Loader2 size={20} className={styles.spinnerIcon} />
                      <span>Checking biometric and portal records…</span>
                    </div>
                  </td>
                </tr>
              ) : (summary.employeeDatesChecked === 0 && (!rows || rows.length === 0)) ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No eligible employee working dates exist in the selected period.
                  </td>
                </tr>
              ) : (summary.actionRequiredCount === 0 && tableIssueFilter === 'action_required' && rows.length > 0) ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#166534', backgroundColor: '#f0fdf4' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={20} style={{ color: '#16a34a' }} />
                      <span>All evaluated employee-dates are reconciled for the selected period.</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTableRows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No reconciliation records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTableRows.map((row, idx) => {
                  const rowKey = `${row.employee._id}:${row.date}:${idx}`;
                  const isExpanded = expandedRows.has(rowKey);
                  const isMenuOpen = activeMenuRowKey === rowKey;

                  // Verified Attendance URL targeting row employee and exception date
                  const attendanceViewUrl = buildAttendanceUrl(row.employee._id, row.date);

                  return (
                    <React.Fragment key={rowKey}>
                      <tr className={`${isExpanded ? styles.rowExpanded : ''} ${isMenuOpen ? styles.rowActiveMenu : ''}`}>
                        <td className={styles.colDate} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {row.date}
                        </td>
                        <td className={styles.colEmployee}>
                          <span className={styles.empName}>{row.employee.name}</span>
                        </td>
                        <td className={styles.colEmpId}>
                          <span className={styles.codeBadge}>{row.employee.employeeId || 'N/A'}</span>
                        </td>
                        <td className={styles.colDepartment}>
                          <span style={{ fontSize: '0.825rem', color: '#475569' }}>{row.employee.department || 'General'}</span>
                        </td>
                        <td className={styles.colPunch} style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 500, color: row.biometricPunchText === 'No punch' ? '#94a3b8' : '#0f172a' }}>
                            {row.biometricPunchText || 'No punch'}
                          </span>
                        </td>
                        <td className={styles.colPortal} style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.825rem', color: '#334155' }}>
                            {row.portalStatusText || 'No record'}
                          </span>
                        </td>
                        <td className={styles.colLeave} style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.825rem', color: '#334155' }}>
                            {row.leaveWfhText || 'None'}
                          </span>
                        </td>
                        <td className={styles.colIssue}>
                          <span className={`${styles.badge} ${getBadgeStyle(row.issueType)}`}>
                            {getBadgeIcon(row.issueType)}
                            <span>{row.issueTitle}</span>
                          </span>
                        </td>
                        <td className={styles.colExplanation}>
                          <div className={styles.explanationText}>
                            {row.explanation || row.description}
                          </div>
                        </td>
                        <td className={styles.colRecommendedAction}>
                          <div className={styles.recCell}>
                            <CircleArrowRight size={15} className={styles.recIcon} />
                            <span className={styles.recText}>
                              {getRecommendedActionGuidance(row.issueType)}
                            </span>
                          </div>
                        </td>
                        <td className={styles.colViewAction}>
                          <div className={styles.actionGroup}>
                            {/* Primary Contextual Action Button */}
                            {row.issueType === 'pending_leave' ? (
                              <Link
                                href="/admin/leaves?status=Pending"
                                className={`${styles.actionBtn} ${styles.actionPrimary}`}
                              >
                                <FileText size={13} /> Review Leave
                              </Link>
                            ) : row.issueType === 'conflict' ? (
                              <Link
                                href={`/admin/leaves?startDate=${row.date}&endDate=${row.date}`}
                                className={`${styles.actionBtn} ${styles.actionPrimary}`}
                              >
                                <FileText size={13} /> View Leave
                              </Link>
                            ) : (
                              <Link
                                href={attendanceViewUrl}
                                className={`${styles.actionBtn} ${styles.actionPrimary}`}
                              >
                                <Eye size={13} /> View Attendance
                              </Link>
                            )}

                            {/* Overflow Kebab Menu */}
                            <div className={styles.kebabWrapper}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuRowKey(activeMenuRowKey === rowKey ? null : rowKey);
                                }}
                                className={styles.kebabBtn}
                                aria-label="More actions menu"
                                aria-expanded={activeMenuRowKey === rowKey}
                              >
                                <MoreHorizontal size={15} />
                              </button>

                              {activeMenuRowKey === rowKey && (
                                <div className={styles.menuDropdown} onClick={(e) => e.stopPropagation()}>
                                  {(row.issueType === 'pending_leave' || row.issueType === 'conflict') && (
                                    <Link
                                      href={attendanceViewUrl}
                                      className={styles.menuItem}
                                      onClick={() => setActiveMenuRowKey(null)}
                                    >
                                      <Eye size={14} /> View Attendance
                                    </Link>
                                  )}

                                  {row.issueType === 'not_marked' && (
                                    <button
                                      type="button"
                                      className={styles.menuItem}
                                      onClick={() => {
                                        setActiveMenuRowKey(null);
                                        handleOpenWfh(row);
                                      }}
                                    >
                                      <House size={14} /> Add WFH
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className={styles.menuItem}
                                    onClick={() => {
                                      setActiveMenuRowKey(null);
                                      toggleRowExpand(rowKey);
                                    }}
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp size={14} /> Hide Details
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown size={14} /> View Details
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Row Drill-Down Panel */}
                      {isExpanded && (
                        <tr className={styles.detailRow}>
                          <td colSpan={11} className={styles.detailCell}>
                            <div className={styles.detailPanel}>
                              <div className={styles.detailTitle}>
                                <span>Reconciliation Detail — {row.employee.name} ({row.date})</span>
                                <span className={`${styles.badge} ${getBadgeStyle(row.issueType)}`}>
                                  {getBadgeIcon(row.issueType)}
                                  <span>{row.issueTitle}</span>
                                </span>
                              </div>
                              <div className={styles.detailGrid}>
                                <div className={styles.detailItem}>
                                  <span className={styles.detailLabel}>Employee</span>
                                  <span className={styles.detailValue}>{row.employee.name} ({row.employee.employeeId || 'N/A'})</span>
                                </div>
                                <div className={styles.detailItem}>
                                  <span className={styles.detailLabel}>Department / Designation</span>
                                  <span className={styles.detailValue}>
                                    {row.employee.department || 'General'} — {row.employee.designation || 'Team Member'}
                                  </span>
                                </div>
                                <div className={styles.detailItem}>
                                  <span className={styles.detailLabel}>Leave / WFH Status</span>
                                  <span className={styles.detailValue}>{row.leaveWfhText || 'None'}</span>
                                </div>

                                <div className={styles.detailItem}>
                                  <span className={styles.detailLabel}>Biometric Punch</span>
                                  <span className={styles.detailValue}>
                                    Check In: {row.biometricCheckIn || 'None'} | Check Out: {row.biometricCheckOut || 'None'}
                                  </span>
                                </div>
                                <div className={styles.detailItem} style={{ gridColumn: 'span 2' }}>
                                  <span className={styles.detailLabel}>Portal Record Source</span>
                                  <span className={styles.detailValue}>
                                    {row.attendanceRecord
                                      ? `Status: ${row.attendanceRecord.status} (Source: ${row.attendanceRecord.source})`
                                      : 'No persisted portal attendance'}
                                  </span>
                                </div>

                                <div className={styles.detailItem} style={{ gridColumn: '1 / -1' }}>
                                  <span className={styles.detailLabel}>Explanation</span>
                                  <span className={styles.detailValue} style={{ color: '#0f172a', fontWeight: 600 }}>
                                    {row.explanation || row.description}
                                  </span>
                                </div>

                                <div className={styles.detailItem} style={{ gridColumn: '1 / -1' }}>
                                  <span className={styles.detailLabel}>Recommended Action</span>
                                  <span className={styles.detailValue} style={{ color: '#4f46e5', fontWeight: 600 }}>
                                    {getRecommendedActionGuidance(row.issueType)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className={styles.paginationBar}>
          <div className={styles.pageInfo}>
            Page {pagination.page || 1} of {pagination.totalPages || 1} ({pagination.totalRows || 0} total records)
          </div>
          <div className={styles.pageControls}>
            <label htmlFor="rec-rows-per-page" style={{ fontSize: '0.8rem', color: '#64748b' }}>Rows per page:</label>
            <select
              id="rec-rows-per-page"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); resetTableScroll(); }}
              className={styles.selectControl}
              style={{ padding: '0.3rem 0.5rem', width: 'auto' }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button
              disabled={page <= 1 || loading}
              onClick={() => { setPage(p => p - 1); resetTableScroll(); }}
              aria-label="Previous Page"
              className={styles.pageBtn}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <button
              disabled={page >= (pagination.totalPages || 1) || loading}
              onClick={() => { setPage(p => p + 1); resetTableScroll(); }}
              aria-label="Next Page"
              className={styles.pageBtn}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Add WFH Modal */}
      {wfhModalOpen && wfhTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Assign Work From Home (WFH)</h3>
              <button onClick={() => setWfhModalOpen(false)} aria-label="Close WFH Modal" className={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAssignWfhSubmit}>
              <div className={styles.modalBody}>
                <div>
                  <label htmlFor="wfh-target-emp" className={styles.filterLabel}>Employee</label>
                  <input
                    id="wfh-target-emp"
                    type="text"
                    disabled
                    value={`${wfhTarget.employee.name} (${wfhTarget.employee.employeeId || ''})`}
                    className={styles.inputControl}
                  />
                </div>
                <div>
                  <label htmlFor="wfh-target-date" className={styles.filterLabel}>Target Date</label>
                  <input
                    id="wfh-target-date"
                    type="text"
                    disabled
                    value={wfhTarget.date}
                    className={styles.inputControl}
                  />
                </div>
                <div>
                  <label htmlFor="wfh-target-reason" className={styles.filterLabel}>Reason / Remarks</label>
                  <input
                    id="wfh-target-reason"
                    type="text"
                    required
                    value={wfhReason}
                    onChange={(e) => setWfhReason(e.target.value)}
                    className={styles.inputControl}
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setWfhModalOpen(false)}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={wfhSubmitting}
                  className={styles.btnPrimary}
                >
                  {wfhSubmitting ? 'Assigning...' : 'Confirm WFH'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AttendanceReconciliation() {
  return (
    <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center' }}>Loading Reconciliation...</div>}>
      <AttendanceReconciliationContent />
    </Suspense>
  );
}
