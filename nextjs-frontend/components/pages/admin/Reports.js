'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FileText, Users, Calendar, TrendingUp, Download, Filter, RefreshCw, BarChart2, Clock, AlertTriangle, Info, CheckCircle2, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  getLeaveReport, getDailyReport, getMonthlyReport, getEmployeeReport, getDepartmentReport, exportReport
} from '@/api/reportApi';
import { listEmployees } from '@/api/employeeApi';
import {
  formatReportDate, formatReportTime, formatDurationDisplay, getMonthDateRange, getTodayDateString,
  generateExportFilename, generateScopeBannerText, generateReportInsight
} from '@/utils/reportHelpers';
import Link from 'next/link';
import styles from './Reports.module.css';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getActionRequiredTooltip(emp) {
  const total = emp.actionRequiredDays || 0;
  if (total === 0) return '0 Action Required Days: All expected dates completed';

  const parts = [];
  if (emp.unaccountedDays > 0) parts.push(`${emp.unaccountedDays} Unaccounted`);
  if (emp.statusCounts) {
    if (emp.statusCounts.incomplete_punch > 0) parts.push(`${emp.statusCounts.incomplete_punch} Incomplete Punch`);
    if (emp.statusCounts.conflict > 0) parts.push(`${emp.statusCounts.conflict} Conflict`);
    if (emp.statusCounts.portal_biometric_mismatch > 0) parts.push(`${emp.statusCounts.portal_biometric_mismatch} Mismatch`);
    if (emp.statusCounts.pending_leave > 0) parts.push(`${emp.statusCounts.pending_leave} Pending Leave`);
    if (emp.statusCounts.partial_leave_missing_attendance > 0) parts.push(`${emp.statusCounts.partial_leave_missing_attendance} Half-Leave Missing Punch`);
    if (emp.statusCounts.short_leave_missing_attendance > 0) parts.push(`${emp.statusCounts.short_leave_missing_attendance} Short-Leave Missing Punch`);
  }

  return `${total} Action Required Days:\n• ` + (parts.length > 0 ? parts.join('\n• ') : `${total} classified issues`);
}

function StatCard({ icon: Icon, label, value, subtext, color, bg }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIconBox} style={{ background: bg }}>
        <Icon size={20} color={color} strokeWidth={2.2} />
      </div>
      <div>
        <div className={styles.statValue} style={{ color }}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {subtext && <div className={styles.statSubtext}>{subtext}</div>}
      </div>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('leave');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [empComparison, setEmpComparison] = useState([]);

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Initial Filter Defaults Generator
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthRange = getMonthDateRange(currentYear, currentMonth);

  const getDefaultFiltersForTab = (targetTab) => {
    switch (targetTab) {
      case 'daily':
        return { date: getTodayDateString() };
      case 'monthly':
        return { year: currentYear, month: currentMonth };
      case 'employee':
        return { empId: '', startDate: currentMonthRange.start, endDate: getTodayDateString(), employeeName: '' };
      case 'department':
        return { dept: '', startDate: currentMonthRange.start, endDate: getTodayDateString() };
      case 'leave':
      default:
        return {
          startDate: currentMonthRange.start,
          endDate: getTodayDateString(),
          status: '',
          empId: '',
          dept: '',
          leaveType: '',
          leaveMode: '',
        };
    }
  };

  // Draft filters (UI controls) vs Applied filters (active report query)
  const [draftFilters, setDraftFilters] = useState(() => getDefaultFiltersForTab('leave'));
  const [appliedFilters, setAppliedFilters] = useState(() => getDefaultFiltersForTab('leave'));

  // Load employee list for dropdowns
  useEffect(() => {
    listEmployees({ limit: 200, status: 'Active' })
      .then(r => setEmployees(r.data.data || []))
      .catch(() => {});
  }, []);

  // Handle Tab Switch
  const handleTabChange = (newTab) => {
    setTab(newTab);
    const defaults = getDefaultFiltersForTab(newTab);
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPage(1);
  };

  // Fetch report based on appliedFilters
  const fetchReportData = async (targetFilters = appliedFilters) => {
    setLoading(true);
    setRecords([]);
    setSummary(null);
    setEmpComparison([]);

    try {
      if (tab === 'leave') {
        const res = await getLeaveReport(targetFilters);
        setRecords(res.data.data || []);
        setSummary(res.data.summary || null);
      } else if (tab === 'daily') {
        const res = await getDailyReport(targetFilters.date);
        setRecords(res.data.data || []);
        setSummary(res.data.summary || null);
      } else if (tab === 'monthly') {
        const res = await getMonthlyReport(targetFilters.year, targetFilters.month);
        setRecords(res.data.data || []);
        setSummary(res.data.summary || null);
      } else if (tab === 'employee' && targetFilters.empId) {
        const res = await getEmployeeReport(targetFilters.empId, {
          startDate: targetFilters.startDate,
          endDate: targetFilters.endDate,
        });
        const d = res.data.data || {};
        setRecords([...(d.attendance || []), ...(d.leaves || [])]);
        setSummary(res.data.summary || null);
      } else if (tab === 'department' && targetFilters.dept) {
        const res = await getDepartmentReport({
          department: targetFilters.dept,
          startDate: targetFilters.startDate,
          endDate: targetFilters.endDate,
        });
        const d = res.data.data || {};
        setRecords(d.attendance || []);
        setEmpComparison(d.empComparison || []);
        setSummary(res.data.summary || null);
      }
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on initial load or tab change
  useEffect(() => {
    if (tab === 'employee' && !appliedFilters.empId) return;
    if (tab === 'department' && !appliedFilters.dept) return;
    fetchReportData(appliedFilters);
  }, [tab, appliedFilters]);

  // Generate Report Action
  const handleGenerateReport = () => {
    if (tab === 'employee' && !draftFilters.empId) {
      return toast.error('Please select an employee');
    }
    if (tab === 'department' && !draftFilters.dept) {
      return toast.error('Please select a department');
    }

    // Attach extra metadata if needed
    const updatedDraft = { ...draftFilters };
    if (tab === 'employee' && draftFilters.empId) {
      const selectedEmp = employees.find(e => String(e._id) === String(draftFilters.empId));
      if (selectedEmp) updatedDraft.employeeName = selectedEmp.name;
    }

    setAppliedFilters(updatedDraft);
    setPage(1);
  };

  // Clear Action
  const handleClearFilters = () => {
    const defaults = getDefaultFiltersForTab(tab);
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPage(1);
  };

  // Contextual CSV Export Action (unpaginated dataset)
  const handleExportCSV = async () => {
    if (!records.length && !empComparison.length) {
      return toast.error('No report data to export');
    }

    try {
      const filename = generateExportFilename(tab, appliedFilters);
      const params = { ...appliedFilters, format: 'csv', type: tab };
      const res = await exportReport(params);

      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV report exported');
    } catch {
      toast.error('Failed to export CSV report');
    }
  };

  // Table Pagination Computation
  const activeDataset = tab === 'department' && empComparison.length > 0 ? empComparison : records;
  const totalRecordsCount = activeDataset.length;
  const totalPages = Math.ceil(totalRecordsCount / pageSize) || 1;
  const paginatedData = activeDataset.slice((page - 1) * pageSize, page * pageSize);

  const scopeBanner = generateScopeBannerText(tab, appliedFilters);
  const insightText = generateReportInsight(tab, summary, activeDataset);

  // Tab definitions
  const tabsList = [
    { key: 'leave', label: 'Leave Report', icon: FileText },
    { key: 'daily', label: 'Daily Attendance', icon: Calendar },
    { key: 'monthly', label: 'Monthly Attendance', icon: BarChart2 },
    { key: 'employee', label: 'Employee Report', icon: Users },
    { key: 'department', label: 'Department Report', icon: TrendingUp },
  ];

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.headerContainer}>
        <div>
          <h1 className={styles.headerTitle}>Reports</h1>
          <p className={styles.headerSubtitle}>Generate, analyze, and export attendance & leave records</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        {tabsList.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`${styles.tabBtn} ${tab === key ? styles.tabBtnActive : styles.tabBtnInactive}`}
          >
            <Icon size={15} strokeWidth={2} /> {label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className={styles.filterCard}>
        <div className={styles.filterRow}>
          {tab === 'leave' && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>From</label>
                <input
                  type="date"
                  value={draftFilters.startDate || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, startDate: e.target.value })}
                  className={styles.fieldInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>To</label>
                <input
                  type="date"
                  value={draftFilters.endDate || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, endDate: e.target.value })}
                  className={styles.fieldInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Status</label>
                <select
                  value={draftFilters.status || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, status: e.target.value })}
                  className={styles.fieldInput}
                >
                  <option value="">All Statuses</option>
                  <option value="Approved">Approved</option>
                  <option value="Pending">Pending</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Employee</label>
                <select
                  value={draftFilters.empId || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, empId: e.target.value })}
                  className={styles.fieldInput}
                  style={{ minWidth: '170px' }}
                >
                  <option value="">All Employees</option>
                  {employees.map(e => (
                    <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Department</label>
                <select
                  value={draftFilters.dept || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, dept: e.target.value })}
                  className={styles.fieldInput}
                >
                  <option value="">All Departments</option>
                  {[...new Set(employees.map(e => e.department).filter(Boolean))].sort().map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Mode</label>
                <select
                  value={draftFilters.leaveMode || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, leaveMode: e.target.value })}
                  className={styles.fieldInput}
                >
                  <option value="">All Modes</option>
                  <option value="Planned">Planned</option>
                  <option value="Unplanned">Unplanned</option>
                </select>
              </div>
            </>
          )}

          {tab === 'daily' && (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Date</label>
              <input
                type="date"
                value={draftFilters.date || ''}
                onChange={e => setDraftFilters({ ...draftFilters, date: e.target.value })}
                className={styles.fieldInput}
              />
            </div>
          )}

          {tab === 'monthly' && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Year</label>
                <input
                  type="number"
                  value={draftFilters.year || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, year: e.target.value })}
                  className={styles.fieldInput}
                  style={{ width: '90px' }}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Month</label>
                <select
                  value={draftFilters.month || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, month: e.target.value })}
                  className={styles.fieldInput}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {tab === 'employee' && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Employee *</label>
                <select
                  value={draftFilters.empId || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, empId: e.target.value })}
                  className={styles.fieldInput}
                  style={{ minWidth: '190px' }}
                >
                  <option value="">Select Employee</option>
                  {employees.map(e => (
                    <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>From</label>
                <input
                  type="date"
                  value={draftFilters.startDate || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, startDate: e.target.value })}
                  className={styles.fieldInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>To</label>
                <input
                  type="date"
                  value={draftFilters.endDate || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, endDate: e.target.value })}
                  className={styles.fieldInput}
                />
              </div>
            </>
          )}

          {tab === 'department' && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Department *</label>
                <select
                  value={draftFilters.dept || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, dept: e.target.value })}
                  className={styles.fieldInput}
                  style={{ minWidth: '180px' }}
                >
                  <option value="">Select Department</option>
                  {[...new Set(employees.map(e => e.department).filter(Boolean))].sort().map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>From</label>
                <input
                  type="date"
                  value={draftFilters.startDate || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, startDate: e.target.value })}
                  className={styles.fieldInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>To</label>
                <input
                  type="date"
                  value={draftFilters.endDate || ''}
                  onChange={e => setDraftFilters({ ...draftFilters, endDate: e.target.value })}
                  className={styles.fieldInput}
                />
              </div>
            </>
          )}

          <button onClick={handleGenerateReport} className={styles.btnGenerate}>
            <Filter size={14} /> Generate Report
          </button>

          <button onClick={handleClearFilters} className={styles.btnClear}>
            <RefreshCw size={13} /> Clear
          </button>
        </div>
      </div>

      {/* Scope Banner */}
      <div className={styles.scopeBanner}>
        <Info size={16} /> {scopeBanner}
      </div>

      {/* Insight Callout (if available) */}
      {insightText && (
        <div className={styles.insightBanner}>
          <CheckCircle2 size={16} /> Key Insight: {insightText}
        </div>
      )}

      {/* KPI Stats Summary Section */}
      {summary && (
        <div className={styles.statsGrid}>
          {tab === 'leave' && (
            <>
              <StatCard icon={FileText} label="Applications" value={summary.totalApplications} subtext="Total requests matching filters" color="#6366f1" bg="#eff6ff" />
              <StatCard icon={CheckCircle2} label="Approved" value={summary.approvedCount} subtext={`Approval rate: ${summary.approvalRate !== 'N/A' ? `${summary.approvalRate}%` : 'N/A'}`} color="#22c55e" bg="#f0fdf4" />
              <StatCard icon={Clock} label="Pending" value={summary.pendingCount} subtext="Awaiting review" color="#f59e0b" bg="#fffbeb" />
              <StatCard icon={Calendar} label="Leave Duration" value={`${summary.totalApprovedDays}d`} subtext={summary.totalApprovedHours > 0 ? `+ ${summary.totalApprovedHours}h short leave` : 'Day-based approved duration'} color="#0ea5e9" bg="#f0f9ff" />
              <StatCard icon={AlertTriangle} label="Unplanned" value={summary.unplannedCount} subtext={`Unplanned rate: ${summary.unplannedRate !== 'N/A' ? `${summary.unplannedRate}%` : 'N/A'}`} color="#ef4444" bg="#fef2f2" />
            </>
          )}

          {tab === 'daily' && (
            <>
              <StatCard icon={Users} label="Expected Employees" value={summary.expectedEmployees} subtext="Active eligible headcount" color="#6366f1" bg="#eff6ff" />
              <StatCard icon={CheckCircle2} label="Present" value={summary.present} subtext={`Includes ${summary.wfh} WFH employees`} color="#22c55e" bg="#f0fdf4" />
              <StatCard icon={Clock} label="Half Day" value={summary.halfDay} subtext="Weighted at 0.5 day" color="#f59e0b" bg="#fffbeb" />
              <StatCard icon={AlertTriangle} label="Absent Employees" value={summary.absent} subtext={summary.isNonWorkingDay ? 'Not a working day' : 'Direct absent count'} color="#ef4444" bg="#fef2f2" />
              <StatCard icon={Calendar} label="On Leave" value={summary.onLeave} subtext="Approved full-day leave" color="#8b5cf6" bg="#f5f3ff" />
              <StatCard icon={TrendingUp} label="Attendance Rate" value={summary.attendanceRate !== 'N/A' ? `${summary.attendanceRate}%` : 'N/A'} subtext="Weighted presence rate" color="#0ea5e9" bg="#f0f9ff" />
            </>
          )}

          {tab === 'monthly' && (
            <>
              <StatCard icon={Calendar} label="Working Days" value={summary.evaluatedWorkingDays} subtext="Evaluated working days" color="#6366f1" bg="#eff6ff" />
              <StatCard icon={Users} label="Expected Emp-Days" value={summary.expectedEmployeeDays} subtext="Total eligible employee-days" color="#0ea5e9" bg="#f0f9ff" />
              <StatCard icon={CheckCircle2} label="Present Emp-Days" value={summary.presentDays} subtext={`Includes ${summary.wfhDays} WFH days`} color="#22c55e" bg="#f0fdf4" />
              <StatCard icon={Clock} label="Half Days" value={summary.halfDays} subtext="0.5 weighted presence" color="#f59e0b" bg="#fffbeb" />
              <StatCard icon={AlertTriangle} label="Absent Emp-Days" value={summary.absentDays} subtext="Direct absent days" color="#ef4444" bg="#fef2f2" />
              <StatCard icon={TrendingUp} label="Avg Attendance Rate" value={summary.avgAttendanceRate !== 'N/A' ? `${summary.avgAttendanceRate}%` : 'N/A'} subtext="Weighted presence rate" color="#22c55e" bg="#f0fdf4" />
            </>
          )}

          {tab === 'employee' && (
            <>
              <StatCard icon={Calendar} label="Working Days" value={summary.workingDays} subtext="Evaluated working days" color="#6366f1" bg="#eff6ff" />
              <StatCard icon={CheckCircle2} label="Present Days" value={summary.presentDays} subtext={`Includes ${summary.wfhDays} WFH days`} color="#22c55e" bg="#f0fdf4" />
              <StatCard icon={Clock} label="Half Days" value={summary.halfDays} subtext="Half-day attendance" color="#f59e0b" bg="#fffbeb" />
              <StatCard icon={AlertTriangle} label="Absent Days" value={summary.absentDays} subtext="Direct absent days" color="#ef4444" bg="#fef2f2" />
              <StatCard icon={TrendingUp} label="Attendance Rate" value={summary.attendanceRate !== 'N/A' ? `${summary.attendanceRate}%` : 'N/A'} subtext="Weighted presence rate" color="#0ea5e9" bg="#f0f9ff" />
            </>
          )}

          {tab === 'department' && (
            <>
              <StatCard icon={Users} label="Active Employees" value={summary.activeEmployees} subtext={`In ${summary.departmentName}`} color="#6366f1" bg="#eff6ff" />
              <StatCard icon={Calendar} label="Working Days" value={summary.workingDays} subtext="Evaluated working days" color="#0ea5e9" bg="#f0f9ff" />
              <StatCard icon={CheckCircle2} label="Full Present Emp-Days" value={summary.totalFullPresent ?? summary.presentDays ?? 0} subtext={`Includes ${summary.totalWfh ?? summary.wfhDays ?? 0} WFH days`} color="#22c55e" bg="#f0fdf4" />
              <StatCard icon={Clock} label="Half Days" value={summary.totalHalfAttendance ?? summary.halfDays ?? 0} subtext="0.5 weighted presence" color="#f59e0b" bg="#fffbeb" />
              <StatCard icon={AlertTriangle} label="Unaccounted Days" value={summary.totalUnaccounted ?? summary.absentDays ?? 0} subtext="Action required days" color="#ef4444" bg="#fef2f2" />
              <StatCard icon={TrendingUp} label="Avg Attendance Rate" value={(summary.avgWeightedAttendanceRate ?? summary.avgAttendanceRate) !== 'N/A' && (summary.avgWeightedAttendanceRate ?? summary.avgAttendanceRate) !== undefined ? `${summary.avgWeightedAttendanceRate ?? summary.avgAttendanceRate}%` : 'N/A'} subtext="Team weighted attendance rate" color="#22c55e" bg="#f0fdf4" />
            </>
          )}
        </div>
      )}

      {/* Leave Breakdown Bars (Leave Tab Only) */}
      {tab === 'leave' && summary && summary.totalApplications > 0 && (
        <div className={styles.breakdownCard}>
          <div className={styles.breakdownHeader}>Leave Application & Mode Breakdown</div>
          <div className={styles.breakdownGrid}>
            <div className={styles.breakdownItem}>
              <div className={styles.breakdownLabel}>
                <span>Status Share</span>
                <span>Approved: {summary.approvedCount} | Pending: {summary.pendingCount} | Rejected: {summary.rejectedCount}</span>
              </div>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${(summary.approvedCount / summary.totalApplications) * 100}%`, background: '#22c55e' }} />
                <div className={styles.barFill} style={{ width: `${(summary.pendingCount / summary.totalApplications) * 100}%`, background: '#f59e0b' }} />
                <div className={styles.barFill} style={{ width: `${(summary.rejectedCount / summary.totalApplications) * 100}%`, background: '#ef4444' }} />
              </div>
            </div>
            <div className={styles.breakdownItem}>
              <div className={styles.breakdownLabel}>
                <span>Planned vs Unplanned</span>
                <span>Planned: {summary.modeBreakdown.planned} | Unplanned: {summary.modeBreakdown.unplanned}</span>
              </div>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${(summary.modeBreakdown.planned / summary.totalApplications) * 100}%`, background: '#0ea5e9' }} />
                <div className={styles.barFill} style={{ width: `${(summary.modeBreakdown.unplanned / summary.totalApplications) * 100}%`, background: '#f59e0b' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table Shell */}
      <div className={styles.tableShell}>
        {/* Table Toolbar */}
        <div className={styles.tableToolbar}>
          <span className={styles.recordCountText}>
            Showing {totalRecordsCount === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRecordsCount)} of {totalRecordsCount} records
          </span>
          <button
            onClick={handleExportCSV}
            disabled={totalRecordsCount === 0}
            className={styles.btnExport}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>

        {loading ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
            <p>Generating report...</p>
          </div>
        ) : totalRecordsCount === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconBox}>
              <FileText size={28} color="#94a3b8" />
            </div>
            <p style={{ fontWeight: 700, color: '#475569' }}>No report data found</p>
            <p style={{ fontSize: '0.82rem', marginTop: '4px' }}>Select report filters and click Generate Report</p>
          </div>
        ) : tab === 'department' && empComparison.length > 0 ? (
          /* Department Employee Comparison Table */
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.tableHeaderRow}>
                  <th className={styles.tableHeaderCell}>Employee</th>
                  <th className={styles.tableHeaderCell}>Emp ID</th>
                  <th className={styles.tableHeaderCell} title="Eligible working dates considering joining date, holidays, and weekly offs">Expected</th>
                  <th className={styles.tableHeaderCell} title="Full-day attendance (Office or WFH)">Full Present</th>
                  <th className={styles.tableHeaderCell} title="Worked half-day attendance">Half Att.</th>
                  <th className={styles.tableHeaderCell} title="Work from home days (subset of Full Present)">WFH</th>
                  <th className={styles.tableHeaderCell} title="Approved leave days">Leave</th>
                  <th className={styles.tableHeaderCell} title="Action Required Days = Expected Days - Completed Dates (Click to open Reconciliation)">Action Required</th>
                  <th className={styles.tableHeaderCell} title="Unexplained missing working dates (not_marked)">Unaccounted</th>
                  <th className={styles.tableHeaderCell} title="Late punched days">Late</th>
                  <th className={styles.tableHeaderCell} title="Punched Days / Expected Days">Punching Rate</th>
                  <th className={styles.tableHeaderCell} title="(Full Present + Half Att. * 0.5) / Expected Days">Weighted Att. Rate</th>
                  <th className={styles.tableHeaderCell} title="Completed Employee-Dates / Expected Days">Record Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((emp, i) => (
                  <tr key={emp.empId || i} className={styles.tableBodyRow}>
                    <td className={styles.tableBodyCell} style={{ fontWeight: 700 }}>{emp.employee}</td>
                    <td className={styles.tableBodyCell}>{emp.empId}</td>
                    <td className={styles.tableBodyCell}>{emp.expectedDays ?? emp.workingDays ?? '-'}</td>
                    <td className={styles.tableBodyCell}>{emp.fullPresentDays ?? emp.presentDays ?? 0}</td>
                    <td className={styles.tableBodyCell}>{emp.halfAttendanceDays ?? emp.halfDays ?? 0}</td>
                    <td className={styles.tableBodyCell}>{emp.wfhDays ?? 0}</td>
                    <td className={styles.tableBodyCell}>{emp.approvedLeaveDays ?? emp.leaveDays ?? 0}</td>
                    <td className={styles.tableBodyCell}>
                      {emp.actionRequiredDays > 0 ? (
                        <Link
                          href={`/admin/attendance/reconciliation?employeeId=${emp.empId || ''}&department=${encodeURIComponent(appliedFilters.dept || '')}&startDate=${appliedFilters.startDate}&endDate=${appliedFilters.endDate}&issueType=action_required`}
                          className={`${styles.badge} ${styles.badgeUnplanned}`}
                          style={{ cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}
                          title={getActionRequiredTooltip(emp)}
                        >
                          {emp.actionRequiredDays} Days
                        </Link>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeApproved}`} title="Complete: All expected dates completed">
                          Complete
                        </span>
                      )}
                    </td>
                    <td className={styles.tableBodyCell}>
                      {emp.unaccountedDays > 0 ? (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>
                          {emp.unaccountedDays} Days
                        </span>
                      ) : (
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>0</span>
                      )}
                    </td>
                    <td className={styles.tableBodyCell}>{emp.lateDays ?? emp.lateCount ?? 0}</td>
                    <td className={styles.tableBodyCell} style={{ fontWeight: 600, color: '#3b82f6' }}>
                      {emp.punchingRate !== undefined && emp.punchingRate !== 'N/A' ? `${emp.punchingRate}%` : 'N/A'}
                    </td>
                    <td className={styles.tableBodyCell} style={{ fontWeight: 700, color: '#0ea5e9' }}>
                      {emp.weightedAttendanceRate !== undefined && emp.weightedAttendanceRate !== 'N/A'
                        ? `${emp.weightedAttendanceRate}%`
                        : emp.attendanceRate !== 'N/A' ? `${emp.attendanceRate}%` : 'N/A'}
                    </td>
                    <td className={styles.tableBodyCell} style={{ fontWeight: 700, color: emp.recordCompletionRate === 100 ? '#16a34a' : '#eab308' }}>
                      {emp.recordCompletionRate !== undefined && emp.recordCompletionRate !== 'N/A' ? `${emp.recordCompletionRate}%` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Standard Attendance / Leave Table */
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.tableHeaderRow}>
                  {tab === 'leave' ? (
                    <>
                      <th className={styles.tableHeaderCell}>Employee</th>
                      <th className={styles.tableHeaderCell}>Emp ID</th>
                      <th className={styles.tableHeaderCell}>Department</th>
                      <th className={styles.tableHeaderCell}>Leave Type</th>
                      <th className={styles.tableHeaderCell}>From</th>
                      <th className={styles.tableHeaderCell}>To</th>
                      <th className={styles.tableHeaderCell}>Duration</th>
                      <th className={styles.tableHeaderCell}>Mode</th>
                      <th className={styles.tableHeaderCell}>Status</th>
                      <th className={styles.tableHeaderCell}>Project</th>
                      <th className={styles.tableHeaderCell}>Applied On</th>
                    </>
                  ) : (
                    <>
                      <th className={styles.tableHeaderCell}>Employee</th>
                      <th className={styles.tableHeaderCell}>Emp ID</th>
                      <th className={styles.tableHeaderCell}>Department</th>
                      <th className={styles.tableHeaderCell}>Date</th>
                      <th className={styles.tableHeaderCell}>Status</th>
                      <th className={styles.tableHeaderCell}>Work Mode</th>
                      <th className={styles.tableHeaderCell}>Check In</th>
                      <th className={styles.tableHeaderCell}>Check Out</th>
                      <th className={styles.tableHeaderCell}>Hours</th>
                      <th className={styles.tableHeaderCell}>Late</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((r, i) => (
                  <tr key={r._id || i} className={styles.tableBodyRow}>
                    {tab === 'leave' ? (
                      <>
                        <td className={styles.tableBodyCell} style={{ fontWeight: 700 }}>{r.employeeId?.name || '-'}</td>
                        <td className={styles.tableBodyCell}>{r.employeeId?.employeeId || '-'}</td>
                        <td className={styles.tableBodyCell}>{r.employeeId?.department || '-'}</td>
                        <td className={styles.tableBodyCell}>{r.leaveType || '-'}</td>
                        <td className={styles.tableBodyCell}>{formatReportDate(r.startDate)}</td>
                        <td className={styles.tableBodyCell}>{formatReportDate(r.endDate)}</td>
                        <td className={styles.tableBodyCell}>{formatDurationDisplay(r.totalDays, r.totalHours, r.durationType)}</td>
                        <td className={styles.tableBodyCell}>
                          <span className={`${styles.badge} ${r.leaveMode === 'Unplanned' ? styles.badgeUnplanned : styles.badgePlanned}`}>
                            {r.leaveMode || 'Planned'}
                          </span>
                        </td>
                        <td className={styles.tableBodyCell}>
                          <span className={`${styles.badge} ${r.status === 'Approved' ? styles.badgeApproved : r.status === 'Pending' ? styles.badgePending : styles.badgeRejected}`}>
                            {r.status || '-'}
                          </span>
                        </td>
                        <td className={styles.tableBodyCell}>{r.currentProject || '—'}</td>
                        <td className={styles.tableBodyCell}>{formatReportDate(r.appliedAt)}</td>
                      </>
                    ) : (
                      <>
                        <td className={styles.tableBodyCell} style={{ fontWeight: 700 }}>{r.employeeId?.name || '-'}</td>
                        <td className={styles.tableBodyCell}>{r.employeeId?.employeeId || '-'}</td>
                        <td className={styles.tableBodyCell}>{r.employeeId?.department || '-'}</td>
                        <td className={styles.tableBodyCell}>{formatReportDate(r.date)}</td>
                        <td className={styles.tableBodyCell}>
                          <span className={`${styles.badge} ${r.status === 'Present' ? styles.badgePresent : r.status === 'Half Day' ? styles.badgeHalfDay : r.status === 'Absent' ? styles.badgeAbsent : styles.badgePending}`}>
                            {r.status || '-'}
                          </span>
                        </td>
                        <td className={styles.tableBodyCell}>
                          <span className={`${styles.badge} ${r.workMode === 'wfh' ? styles.badgeUnplanned : styles.badgePlanned}`}>
                            {r.workMode === 'wfh' ? 'WFH' : 'Office'}
                          </span>
                        </td>
                        <td className={styles.tableBodyCell}>{formatReportTime(r.checkIn)}</td>
                        <td className={styles.tableBodyCell}>{formatReportTime(r.checkOut)}</td>
                        <td className={styles.tableBodyCell}>{r.workingHours ? parseFloat(r.workingHours.toFixed(1)) : '-'}</td>
                        <td className={styles.tableBodyCell}>
                          {r.isLate ? <span className={`${styles.badge} ${styles.badgeLate}`}>Late</span> : 'No'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalRecordsCount > pageSize && (
          <div className={styles.paginationFooter}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className={styles.paginationBtn}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={styles.paginationBtn}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
