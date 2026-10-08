'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getAllAttendance, previewAttendanceUpload, confirmAttendanceImport, assignWfh, deleteAttendance } from '@/api/attendanceApi';
import { listEmployees } from '@/api/employeeApi';
import { detectAnomalies } from '@/api/aiApi';
import { useAuth } from '@/context/AuthContext';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Sparkles, Loader2, AlertTriangle, TrendingDown, X, House, Trash2, ClipboardList } from 'lucide-react';
import { parseAttendanceQueryParams, formatPrettyDate } from '@/utils/reconciliationHelpers';
import styles from './AttendanceManagement.module.css';
import wfhStyles from './UrgentWfh.module.css';

const STATUS_COLORS = { Present: '#22c55e', 'Full Day': '#16a34a', 'Half Day': '#f59e0b', Absent: '#ef4444', Holiday: '#facc15', Weekend: '#94a3b8', 'On Leave': '#8b5cf6' };
const TIME_STATUS_COLORS = { 'On Track': '#16a34a', WFH: '#0284c7', Late: '#f97316', 'Missing Punch': '#d97706', 'Short Time': '#dc2626', Leave: '#8b5cf6', 'Worked on Holiday': '#ca8a04', 'Weekly Off': '#64748b' };

const ISSUE_CONFIG = {
  on_track: { label: 'On Track', color: '#16a34a', tooltip: 'Complete punches, on time, and no short hours. Overtime may still apply.' },
  'On Track': { label: 'On Track', color: '#16a34a', tooltip: 'Complete punches, on time, and no short hours. Overtime may still apply.' },
  overtime: { label: 'Overtime', color: '#2563eb', tooltip: 'Overtime hours recorded for this working day.' },
  Overtime: { label: 'Overtime', color: '#2563eb', tooltip: 'Overtime hours recorded for this working day.' },
  late: { label: 'Late', color: '#f97316', tooltip: 'Check-in was after the office late threshold.' },
  Late: { label: 'Late', color: '#f97316', tooltip: 'Check-in was after the office late threshold.' },
  short_hours: { label: 'Short Hours', color: '#dc2626', tooltip: 'Worked hours were less than required working hours.' },
  'Short Hours': { label: 'Short Hours', color: '#dc2626', tooltip: 'Worked hours were less than required working hours.' },
  'Short Time': { label: 'Short Hours', color: '#dc2626', tooltip: 'Worked hours were less than required working hours.' },
  missing_punch: { label: 'Missing Punch', color: '#d97706', tooltip: 'Missing check-in or check-out punch.' },
  'Missing Punch': { label: 'Missing Punch', color: '#d97706', tooltip: 'Missing check-in or check-out punch.' },
  worked_non_working_day: { label: 'Worked on Non-Working Day', color: '#ca8a04', tooltip: 'Attendance punches recorded on a holiday or weekly off.' },
  'Worked on Non-Working Day': { label: 'Worked on Non-Working Day', color: '#ca8a04', tooltip: 'Attendance punches recorded on a holiday or weekly off.' },
  'Worked on Holiday': { label: 'Worked on Non-Working Day', color: '#ca8a04', tooltip: 'Attendance punches recorded on a holiday or weekly off.' },
  conflict: { label: 'Conflict', color: '#ef4444', tooltip: 'Attendance punch overlaps with an approved leave or WFH record.' },
  Conflict: { label: 'Conflict', color: '#ef4444', tooltip: 'Attendance punch overlaps with an approved leave or WFH record.' },
  partial_leave_missing_attendance: { label: 'Partial Leave Exception', color: '#b45309', tooltip: 'Approved half-day leave missing complementary attendance record.' },
  'Partial Leave Exception': { label: 'Partial Leave Exception', color: '#b45309', tooltip: 'Approved half-day leave missing complementary attendance record.' },
  not_marked: { label: 'Unaccounted', color: '#6b7280', tooltip: 'No attendance marked on an eligible working day.' },
  'Not Marked': { label: 'Unaccounted', color: '#6b7280', tooltip: 'No attendance marked on an eligible working day.' },
  wfh: { label: 'WFH', color: '#0284c7', tooltip: 'Work From Home' },
  WFH: { label: 'WFH', color: '#0284c7', tooltip: 'Work From Home' },
  leave: { label: 'Leave', color: '#8b5cf6', tooltip: 'On Leave' },
  Leave: { label: 'Leave', color: '#8b5cf6', tooltip: 'On Leave' },
};
const formatAttendanceTime = (value) => value
  ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  : '-';

export default function AttendanceManagement() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialParamsParsed = useMemo(() => parseAttendanceQueryParams(searchParams), [searchParams]);

  const canImportAttendance = (user?.permissions || []).includes('attendance:import');
  const canAssignWfh = (user?.permissions || []).includes('attendance:manage_wfh');
  const canDeleteAttendance = (user?.permissions || []).includes('attendance:delete') || user?.role === 'admin';
  const isTeamLead = user?.role === 'team_lead';

  const today = new Date().toISOString().slice(0, 10);
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStart = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 1).toISOString().slice(0, 10);
  const lastMonthEnd = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reconciliation context state
  const [recContext, setRecContext] = useState(() => {
    if (initialParamsParsed.fromReconciliation) {
      return {
        isFromRec: true,
        empId: initialParamsParsed.employeeId,
        startDate: initialParamsParsed.startDate || thisMonthStart,
        endDate: initialParamsParsed.endDate || today,
        empName: '',
        prettyDate: formatPrettyDate(initialParamsParsed.startDate || today),
      };
    }
    return { isFromRec: false };
  });

  const [filters, setFilters] = useState(() => ({
    startDate: initialParamsParsed.startDate || thisMonthStart,
    endDate: initialParamsParsed.endDate || today,
    status: initialParamsParsed.status || '',
    workMode: initialParamsParsed.workMode || '',
    issue: initialParamsParsed.issue || '',
    dayType: initialParamsParsed.dayType || '',
    sortBy: 'date',
    sortDir: 'desc',
  }));

  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [showEmpDrop, setShowEmpDrop] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [anomalies, setAnomalies] = useState([]);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showWfh, setShowWfh] = useState(false);
  const [wfhForm, setWfhForm] = useState({ employeeId: '', startDate: today, endDate: today, reason: '' });
  const [savingWfh, setSavingWfh] = useState(false);

  const handleDetectAnomalies = async () => {
    setAnomalyLoading(true);
    try {
      const d = new Date(filters.startDate || today);
      const res = await detectAnomalies({ month: d.getMonth() + 1, year: d.getFullYear() });
      setAnomalies(res.data.data || []);
      setShowAnomalies(true);
      if (res.data.data?.length === 0) toast('No anomalies detected this month 👍', { icon: '✅' });
    } catch { toast.error('Anomaly detection failed'); }
    finally { setAnomalyLoading(false); }
  };

  const doFetch = async (p = 1, f = filters, emp = selectedEmp, dept = deptFilter) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50, sortBy: f.sortBy, sortDir: f.sortDir, activeOnly: true };
      if (f.startDate) params.startDate = f.startDate;
      if (f.endDate) params.endDate = f.endDate;
      if (f.status) params.status = f.status;
      if (f.workMode) params.workMode = f.workMode;
      if (f.issue) params.issue = f.issue;
      if (f.dayType) params.dayType = f.dayType;
      if (emp) params.employeeId = emp._id;
      if (!emp && empSearch.trim()) params.employeeName = empSearch.trim();
      if (dept && !isTeamLead) params.department = dept;
      const res = await getAllAttendance(params);
      setRecords(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  };

  // Load all active employees and apply deep-link query filter if present
  useEffect(() => {
    let isMounted = true;
    const loadAll = async () => {
      try {
        const r1 = await listEmployees({ limit: 200, page: 1, status: 'Active' });
        const { data, pagination: pg } = r1.data;
        let allEmps = data || [];
        if (pg?.pages > 1) {
          const rest = await Promise.all(Array.from({ length: pg.pages - 1 }, (_, i) => listEmployees({ limit: 200, page: i + 2, status: 'Active' })));
          allEmps = [...allEmps, ...rest.flatMap(r => r.data.data)];
        }
        if (!isMounted) return;
        setEmployees(allEmps);
        const depts = [...new Set(allEmps.map(e => e.department).filter(Boolean))].sort();
        setDepartments(depts);

        if (initialParamsParsed.fromReconciliation && initialParamsParsed.employeeId) {
          const matchedEmp = allEmps.find(e => String(e._id) === String(initialParamsParsed.employeeId) || String(e.employeeId) === String(initialParamsParsed.employeeId));
          if (matchedEmp) {
            setSelectedEmp(matchedEmp);
            setRecContext(prev => ({ ...prev, empName: matchedEmp.name }));
            const f = {
              startDate: initialParamsParsed.startDate || thisMonthStart,
              endDate: initialParamsParsed.endDate || today,
              status: '', workMode: '', issue: '', dayType: '', sortBy: 'date', sortDir: 'desc',
            };
            setFilters(f);
            doFetch(1, f, matchedEmp, '');
          } else {
            toast.error('Selected employee from Reconciliation not found. Showing date range attendance.');
            const f = {
              startDate: initialParamsParsed.startDate || thisMonthStart,
              endDate: initialParamsParsed.endDate || today,
              status: '', workMode: '', issue: '', dayType: '', sortBy: 'date', sortDir: 'desc',
            };
            setFilters(f);
            doFetch(1, f, null, '');
          }
        } else {
          doFetch(1);
        }
      } catch {
        if (isMounted) doFetch(1);
      }
    };
    loadAll();
    return () => { isMounted = false; };
  }, []);

  const setF = (key, val) => {
    const next = { ...filters, [key]: val };
    setFilters(next);
    setPage(1);
    doFetch(1, next, selectedEmp, deptFilter);
  };

  const handleBackToRec = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/admin/attendance/reconciliation');
    }
  };

  const handleClearRecContext = () => {
    setRecContext({ isFromRec: false });
    setSelectedEmp(null);
    setEmpSearch('');
    setDeptFilter('');
    const defaultFilters = { startDate: thisMonthStart, endDate: today, status: '', workMode: '', issue: '', dayType: '', sortBy: 'date', sortDir: 'desc' };
    setFilters(defaultFilters);
    setPage(1);
    router.replace('/admin/attendance');
    doFetch(1, defaultFilters, null, '');
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext)) return toast.error('Invalid file type. Upload CSV, XLSX, XLS, or PDF.');
    setUploading(true);
    setUploadResult(null);
    setImportPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await previewAttendanceUpload(fd);
      setImportPreview(res.data.data);
      toast.success('Preview generated');
    } catch (err) {
      const msg = err.response?.data?.message || 'Parsing failed';
      if (msg.toLowerCase().includes('unsupported') || msg.toLowerCase().includes('invalid')) toast.error(msg || 'Invalid file type');
      else if (msg.toLowerCase().includes('no valid')) toast.error('No valid attendance records found');
      else toast.error(msg);
    } finally { setUploading(false); }
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows?.length) return;
    setImporting(true);
    try {
      const importableRows = importPreview.rows.filter(r => r.canImport);
      const res = await confirmAttendanceImport(importableRows);
      setUploadResult(res.data.data);
      setImportPreview(null);
      toast.success(`Successfully imported ${res.data.data.saved || 0} records`);
      doFetch(page);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to confirm import'); }
    finally { setImporting(false); }
  };

  const handleAssignWfh = async (e) => {
    e.preventDefault();
    if (!wfhForm.employeeId || !wfhForm.reason.trim()) return toast.error('Please fill required fields');
    setSavingWfh(true);
    try {
      const res = await assignWfh(wfhForm);
      toast.success(res.data.message || 'WFH assigned');
      setShowWfh(false);
      setWfhForm({ employeeId: '', startDate: today, endDate: today, reason: '' });
      doFetch(page);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to assign WFH'); }
    finally { setSavingWfh(false); }
  };

  const handleDeleteAttendance = async (id) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    try {
      await deleteAttendance(id);
      toast.success('Attendance record deleted');
      doFetch(page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete attendance record');
    }
  };

  const filteredEmps = employees.filter(e => {
    const q = empSearch.toLowerCase().trim();
    if (!q) return true;
    return (e.name || '').toLowerCase().includes(q) || (e.employeeId || '').toLowerCase().includes(q);
  });

  const fmtHours = (val) => val != null && !Number.isNaN(Number(val)) ? `${Number(val).toFixed(1)}h` : '-';

  const renderIssueBadges = (r) => {
    const flags = r.issueFlags || (r.issue ? [r.issue] : []);
    if (!flags.length) return <span className="text-muted">-</span>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {flags.map((flag, idx) => {
          const cfg = ISSUE_CONFIG[flag] || {
            label: typeof flag === 'string' ? flag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : String(flag),
            color: '#64748b',
            tooltip: flag,
          };
          return (
            <span key={idx} className={styles.timeStatus} style={{ '--status-color': cfg.color }} title={cfg.tooltip}>
              {cfg.label}
            </span>
          );
        })}
      </div>
    );
  };

  const leaveBadge = (info) => {
    if (!info?.hasLeave) return null;
    const isHourly = info.durationType === 'hourly';
    const isHalf = info.durationType === 'half_day';
    const rawHours = Number(info.totalHours || info.durationHours || info.hours);
    const hoursStr = !Number.isNaN(rawHours) && rawHours > 0 ? `${rawHours.toFixed(1)}h` : '';
    let label = `Leave (${info.leaveType || 'Leave'})`;
    if (isHourly) {
      label = hoursStr ? `Leave (${info.leaveType || 'Leave'} · ${hoursStr})` : `Leave (${info.leaveType || 'Leave'} · Short Leave)`;
    } else if (isHalf) {
      label = `Leave (${info.leaveType || 'Leave'} · Half Day)`;
    }
    return <span className={styles.leaveTag} title={info.reason || info.tooltip || ''}>{label}</span>;
  };

  const columns = [
    { key: 'date', label: 'Date', render: (r) => <span className="font-semibold">{r.date}</span> },
    { key: 'employee', label: 'Employee', render: (r) => r.employeeId ? (
      <div className={styles.empCell}>
        <span className={styles.empName}>{r.employeeId.name}</span>
        <span className={styles.empId}>{r.employeeId.employeeId}</span>
      </div>
    ) : <span className="text-muted">Unknown</span> },
    { key: 'status', label: 'Status', render: (r) => (
      <div>
        <span className={styles.statusBadge} style={{ '--status-color': STATUS_COLORS[r.status] || '#64748b' }}>
          {r.status}
        </span>
        {r.workMode === 'wfh' && <span className={styles.wfhTag} title={r.wfhReason || 'WFH'}>WFH</span>}
      </div>
    )},
    { key: 'checkIn', label: 'Check In', render: (r) => r.checkIn ? <span className={styles.timeCell}>{formatAttendanceTime(r.checkIn)}</span> : <span className="text-muted">-</span> },
    { key: 'checkOut', label: 'Check Out', render: (r) => r.checkOut ? <span className={styles.timeCell}>{formatAttendanceTime(r.checkOut)}</span> : <span className="text-muted">-</span> },
    { key: 'workedHours', label: 'Worked Hours', render: (r) => <span className={styles.hoursCell}>{fmtHours(r.workedHours)}</span> },
    { key: 'requiredHours', label: 'Required Hours', render: (r) => <span className={`${styles.hoursCell} ${styles.requiredHours}`}>{fmtHours(r.requiredHours)}</span> },
    { key: 'timeStatus', label: 'Issues / Time Status', render: (r) => (
      <div>
        {renderIssueBadges(r)}
        {r.leaveInfo?.hasLeave && <div style={{ marginTop: '4px' }}>{leaveBadge(r.leaveInfo)}</div>}
      </div>
    ) },
    { key: 'dayType', label: 'Day Type', render: (r) => <span className={styles.dayType} title={r.workMode === 'wfh' ? r.wfhReason : undefined}>{r.dayType || '-'}</span> },
    { key: 'action', label: 'Action', render: (r) => canDeleteAttendance ? (
      <button type="button" onClick={() => handleDeleteAttendance(r._id)} className="btn btn--danger" style={{ minWidth: '84px' }}>
        <Trash2 size={14} style={{ marginRight: '6px' }} /> Delete
      </button>
    ) : null },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.pageTitle}>Attendance Records</h1>
          {pagination && (
            <p className={styles.pageSubtitle}>
              {pagination.total} records · {isTeamLead ? `Team scope: ${departments.join(', ') || 'Your Managed Team'}` : 'Active employees only'}
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <div className={styles.presetGroup}>
            {[
              ['Today', today, today],
              ['This Week', new Date(new Date().setDate(new Date().getDate() - new Date().getDay())).toISOString().slice(0,10), today],
              ['This Month', `${today.slice(0,7)}-01`, today],
              ['Last Month', lastMonthStart, lastMonthEnd],
            ].map(([label, from, to]) => {
              const isActive = filters.startDate === from && filters.endDate === to;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    const next = { ...filters, startDate: from, endDate: to };
                    setFilters(next);
                    setPage(1);
                    doFetch(1, next, selectedEmp, deptFilter);
                  }}
                  className={`${styles.rangeButton} ${isActive ? styles.activeRange : ''}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className={styles.actionButtonGroup}>
            <Link href="/admin/attendance/reconciliation" className={styles.btnSecondary}>
              <ClipboardList size={14} /> Missing Records
            </Link>
            {canAssignWfh && (
              <button type="button" onClick={() => setShowWfh(true)} className={styles.btnWfh}>
                <House size={14} /> Add on WFH
              </button>
            )}
            <button type="button" onClick={handleDetectAnomalies} disabled={anomalyLoading} className={styles.anomalyButton}>
              {anomalyLoading ? <><Loader2 size={13} className={styles.spinner} /> Analyzing…</> : <><Sparkles size={13} /> AI Anomalies</>}
            </button>
            {canImportAttendance && (
              <label className={`${styles.uploadButton} ${uploading ? styles.uploading : ''}`}>
                <span>{uploading ? 'Uploading...' : 'Upload Biometric'}</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={handleBulkUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Reconciliation Context Banner */}
      {recContext.isFromRec && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.25rem',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '0.6rem',
          color: '#0369a1',
          fontSize: '0.875rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>ℹ️</span>
            <span>
              <strong>
                Showing attendance for {recContext.empName || 'Employee'} on {recContext.prettyDate} — opened from Reconciliation.
              </strong>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleBackToRec}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: '#ffffff',
                border: '1px solid #7dd3fc',
                borderRadius: '0.375rem',
                color: '#0284c7',
                cursor: 'pointer',
              }}
            >
              ← Back to Reconciliation
            </button>
            <button
              type="button"
              onClick={handleClearRecContext}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: '#0284c7',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Clear Context
            </button>
          </div>
        </div>
      )}

      {/* AI Anomaly Panel */}
      {showAnomalies && anomalies.length > 0 && (
        <div className={styles.anomalyPanel}>
          <div className={styles.anomalyHeader}>
            <div className={styles.anomalyHeading}>
              <AlertTriangle size={16} color="#d97706" />
              <h3 className={styles.anomalyTitle}>AI Detected {anomalies.length} Attendance Anomalies</h3>
            </div>
            <button onClick={() => setShowAnomalies(false)} className={styles.iconButton}><X size={16} /></button>
          </div>
          <div className={styles.anomalyGrid}>
            {anomalies.map((a, i) => (
              <div key={i} className={`${styles.anomalyCard} ${styles[a.severity] || ''}`}>
                <div className={styles.anomalyCardHeader}>
                  <TrendingDown size={13} color={a.severity === 'high' ? '#dc2626' : a.severity === 'medium' ? '#d97706' : '#64748b'} />
                  <p className={styles.anomalyEmployee}>{a.employeeName}</p>
                  <span className={styles.severityBadge}>{a.severity}</span>
                </div>
                <p className={styles.anomalyIssue}>{a.issue}</p>
                <p className={styles.recommendation}>💡 {a.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload result banner */}
      {uploadResult && (
        <div className={styles.importResult}>
          <span className={styles.importResultTitle}>Import Complete</span>
          <span className={styles.importResultItem}>Saved: <strong>{uploadResult.saved || 0}</strong></span>
          <span className={styles.importResultItem}>Updated: <strong>{uploadResult.updated || 0}</strong></span>
          <span className={styles.importResultItem}>Duplicates skipped: <strong>{uploadResult.skippedDuplicate || 0}</strong></span>
          <span className={styles.importResultItem}>Skipped conflicts: <strong>{uploadResult.skippedConflictCount || 0}</strong></span>
          <span className={styles.importResultItem}>Invalid skipped: <strong>{uploadResult.skippedInvalid || 0}</strong></span>
          <button onClick={() => setUploadResult(null)} className={`${styles.iconButton} ${styles.dismissResult}`}>x</button>
        </div>
      )}

      {/* Import preview */}
      {importPreview && (
        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <div className={styles.previewHeaderTitleGroup}>
              <h3 className={styles.previewTitle}>Biometric Import Preview</h3>
              <p className={styles.previewSubtitle}>
                Parser: <strong>{importPreview.parserUsed === 'monthly-biometric-report' ? 'Monthly biometric report' : importPreview.parserUsed === 'grok-mapping' ? 'Grok AI mapping' : importPreview.parserUsed === 'grok' ? 'Grok AI' : 'Normal file parser'}</strong>. Review rows before saving attendance.
              </p>
            </div>
          </div>

          <div className={styles.summaryContainer}>
            <div className={styles.summaryGrid}>
              <div className={`${styles.statChip} ${styles.statNeutral}`}>
                <span className={styles.statLabel}>Total Rows</span>
                <span className={styles.statValue}>{importPreview.summary?.totalRows || 0}</span>
              </div>
              <div className={`${styles.statChip} ${(importPreview.summary?.importable || 0) > 0 ? styles.statSuccess : styles.statQuiet}`}>
                <span className={styles.statLabel}>Ready to Import</span>
                <span className={styles.statValue}>{importPreview.summary?.importable || 0}</span>
              </div>
              <div className={`${styles.statChip} ${(importPreview.summary?.skippedConflicts || 0) > 0 ? styles.statWarning : styles.statQuiet}`}>
                <span className={styles.statLabel}>Conflicts</span>
                <span className={styles.statValue}>{importPreview.summary?.skippedConflicts || 0}</span>
              </div>
              <div className={`${styles.statChip} ${(importPreview.summary?.unmatched || 0) > 0 ? styles.statDanger : styles.statQuiet}`}>
                <span className={styles.statLabel}>Unmatched</span>
                <span className={styles.statValue}>{importPreview.summary?.unmatched || 0}</span>
              </div>
              <div className={`${styles.statChip} ${(importPreview.summary?.invalid || 0) > 0 ? styles.statDanger : styles.statQuiet}`}>
                <span className={styles.statLabel}>Invalid</span>
                <span className={styles.statValue}>{importPreview.summary?.invalid || 0}</span>
              </div>
              <div className={`${styles.statChip} ${(importPreview.summary?.duplicates || 0) > 0 ? styles.statWarning : styles.statQuiet}`}>
                <span className={styles.statLabel}>Duplicates</span>
                <span className={styles.statValue}>{importPreview.summary?.duplicates || 0}</span>
              </div>
            </div>

            <div className={styles.matchingSection}>
              <span className={styles.matchingTitle}>Matched by:</span>
              <div className={styles.matchingChips}>
                <span className={styles.matchChip}>Employee Code <strong>{importPreview.summary?.matchedByEmployeeCode || 0}</strong></span>
                <span className={styles.matchChip}>Name <strong>{importPreview.summary?.matchedByName || 0}</strong></span>
                <span className={styles.matchChip}>Biometric ID <strong>{importPreview.summary?.matchedByBiometricId || 0}</strong></span>
              </div>
            </div>
          </div>

          <div className={styles.previewTableWrap}>
            <table className={styles.previewTable}>
              <thead className={styles.previewTableHead}>
                <tr>
                  {['Row', 'Matched Employee', 'Biometric ID', 'Input', 'Date', 'Check In', 'Check Out', 'Punches', 'Hours', 'Status', 'Result'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importPreview.rows?.map(r => {
                  const issue = r.conflictReason || r.invalidReason || (r.duplicate ? 'Duplicate' : (!r.matchedEmployee ? 'Unmatched employee' : 'Ready'));
                  const tone = r.canImport ? '#16a34a' : (r.isSkippedConflict ? '#ea580c' : (r.duplicate ? '#d97706' : '#dc2626'));
                  return (
                    <tr key={r.rowId} className={r.canImport ? styles.validRow : styles.invalidRow}>
                      <td className={styles.mutedCell}>{r.rowNumber}</td>
                      <td>
                        {r.matchedEmployee ? (
                          <div className={styles.empInfoCell}>
                            <strong className={styles.empName}>{r.matchedEmployee.name}</strong>
                            <span className={styles.matchMethod}>{r.matchedEmployee.employeeId || r.matchMethod}</span>
                          </div>
                        ) : (
                          <span className={styles.noMatch}>No match</span>
                        )}
                      </td>
                      <td className={styles.biometricCell}>{r.biometricId || r.matchedEmployee?.biometricId || '-'}</td>
                      <td className={styles.inputCell}>
                        <span className={styles.inputName}>{r.employeeName || '-'}</span>
                        {r.employeeCode && <span className={styles.inputCode}> ({r.employeeCode})</span>}
                      </td>
                      <td className={styles.nowrapCell}>{r.date || '-'}</td>
                      <td className={styles.nowrapCell}>{r.checkIn || '-'}</td>
                      <td className={styles.nowrapCell}>{r.checkOut || '-'}</td>
                      <td className={styles.punchesCell}>{r.punches?.length ? r.punches.join(', ') : '-'}</td>
                      <td className={styles.hoursCell}>{r.totalHours ?? '-'}</td>
                      <td className={styles.nowrapCell}>
                        <span className={styles.statusText}>{r.status || '-'}</span>
                      </td>
                      <td>
                        <span className={styles.issueBadge} style={{ '--issue-color': tone }}>
                          {issue}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.previewActions}>
            <button type="button" onClick={() => setImportPreview(null)} disabled={importing} className={`${styles.previewButton} ${styles.previewCancel}`}>
              Cancel
            </button>
            <button type="button" onClick={handleConfirmImport} disabled={importing || !importPreview.summary?.importable} className={`${styles.previewButton} ${styles.previewConfirm}`}>
              {importing ? 'Importing...' : `Confirm Import (${importPreview.summary?.importable || 0})`}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className={styles.filterBar}>
        {/* Employee */}
        <div className={styles.employeeFilter}>
          <label className="form-label">Employee</label>
          <input value={selectedEmp ? selectedEmp.name : empSearch}
            onChange={e => { setEmpSearch(e.target.value); setSelectedEmp(null); setShowEmpDrop(true); }}
            onFocus={() => setShowEmpDrop(true)}
            placeholder="Search employee..."
            className="form-input" />
          {selectedEmp && <button onClick={() => { setSelectedEmp(null); setEmpSearch(''); setPage(1); doFetch(1, filters, null); }} className={styles.clearEmployee}>×</button>}
          {showEmpDrop && !selectedEmp && (
            <>
              <div className={styles.dropdownBackdrop} onClick={() => setShowEmpDrop(false)} />
              <div className={styles.employeeDropdown}>
                {filteredEmps.map(e => (
                  <div key={e._id} onClick={() => { setSelectedEmp(e); setShowEmpDrop(false); setEmpSearch(''); setPage(1); doFetch(1, filters, e); }}
                    className={styles.employeeOption}>
                    <span className="font-semibold">{e.name}</span>
                    <span className={styles.employeeOptionId}>{e.employeeId}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        {!isTeamLead && (
          <div>
            <label className="form-label">Department</label>
            <select className="form-select" value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); doFetch(1, filters, selectedEmp, e.target.value); }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">From</label>
          <input className="form-input" type="date" value={filters.startDate} onChange={e => setF('startDate', e.target.value)} />
        </div>
        <div>
          <label className="form-label">To</label>
          <input className="form-input" type="date" value={filters.endDate} onChange={e => setF('endDate', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-select" value={filters.status} onChange={e => setF('status', e.target.value)}>
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="half_day">Half Day</option>
            <option value="absent">Absent</option>
            <option value="on_leave">On Leave</option>
          </select>
        </div>
        <div>
          <label className="form-label">Work Mode</label>
          <select className="form-select" value={filters.workMode} onChange={e => setF('workMode', e.target.value)}>
            <option value="">All Modes</option>
            <option value="office">Office</option>
            <option value="wfh">WFH</option>
          </select>
        </div>
        <div>
          <label className="form-label">Issue</label>
          <select className="form-select" value={filters.issue} onChange={e => setF('issue', e.target.value)}>
            <option value="">All Issues</option>
            <option value="on_track">On Track</option>
            <option value="late">Late</option>
            <option value="short_hours">Short Hours</option>
            <option value="missing_punch">Missing Punch</option>
            <option value="overtime">Overtime</option>
            <option value="worked_non_working_day">Worked on Non-Working Day</option>
            <option value="not_marked">Unaccounted</option>
            <option value="conflict">Conflict</option>
            <option value="partial_leave_missing_attendance">Partial Leave Exceptions</option>
          </select>
        </div>
        <div>
          <label className="form-label">Day Type</label>
          <select className="form-select" value={filters.dayType} onChange={e => setF('dayType', e.target.value)}>
            <option value="">All Days</option>
            <option value="working_day">Working Day</option>
            <option value="weekly_off">Weekly Off</option>
            <option value="holiday">Holiday</option>
          </select>
        </div>
        <div>
          <label className="form-label">Sort</label>
          <select className="form-select" value={`${filters.sortBy}_${filters.sortDir}`} onChange={e => { const [sb, sd] = e.target.value.split('_'); const next = { ...filters, sortBy: sb, sortDir: sd }; setFilters(next); setPage(1); doFetch(1, next, selectedEmp); }}>
            <option value="date_desc">Date desc</option>
            <option value="date_asc">Date asc</option>
            <option value="workedHours_desc">Worked Hours desc</option>
            <option value="workedHours_asc">Worked Hours asc</option>
            <option value="shortHours_desc">Short Hours desc</option>
            <option value="shortHours_asc">Short Hours asc</option>
            <option value="overtimeHours_desc">Extra Hours desc</option>
            <option value="overtimeHours_asc">Extra Hours asc</option>
            <option value="lateCheckIn_desc">Late Check-in desc</option>
            <option value="lateCheckIn_asc">Late Check-in asc</option>
          </select>
        </div>
        {(filters.startDate !== thisMonthStart || filters.endDate !== today || filters.status || filters.workMode || filters.issue || filters.dayType || selectedEmp || deptFilter || empSearch) && (
          <button className="btn btn--danger" onClick={() => { const f = { startDate: thisMonthStart, endDate: today, status: '', workMode: '', issue: '', dayType: '', sortBy: 'date', sortDir: 'desc' }; setFilters(f); setSelectedEmp(null); setEmpSearch(''); setDeptFilter(''); setPage(1); doFetch(1, f, null, ''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Empty State for Reconciliation Deep-Link */}
      {recContext.isFromRec && !loading && records.length === 0 ? (
        <div style={{
          padding: '2.5rem',
          textAlign: 'center',
          color: '#64748b',
          background: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          margin: '1rem 0',
        }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
            No attendance record was found for {recContext.empName || 'the selected employee'} on {recContext.prettyDate}.
          </p>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            This supports the reconciliation exception, but Leave and WFH records should still be reviewed separately.
          </p>
        </div>
      ) : (
        <div className={styles.tableShell}>
          {loading ? <LoadingSpinner /> : <DataTable columns={columns} data={records} hideSearch />}
          {pagination && pagination.pages > 1 && (
            <div className={styles.pagination}>
              <button onClick={() => { const p = Math.max(1, page-1); setPage(p); doFetch(p, filters, selectedEmp); }} disabled={page === 1}
                className={styles.pageButton}>← Prev</button>
              <span className={styles.pageInfo}>Page {page} of {pagination.pages} · {pagination.total} records</span>
              <button onClick={() => { const p = Math.min(pagination.pages, page+1); setPage(p); doFetch(p, filters, selectedEmp); }} disabled={page === pagination.pages}
                className={styles.pageButton}>Next →</button>
            </div>
          )}
        </div>
      )}

      {showWfh && (
        <div className={wfhStyles.modalBackdrop} onMouseDown={() => !savingWfh && setShowWfh(false)}>
          <div className={wfhStyles.modalCard} onMouseDown={e => e.stopPropagation()}>
            <div className={wfhStyles.modalHeader}>
              <h3 className={wfhStyles.modalTitle}>Assign Work From Home (WFH)</h3>
              <button type="button" onClick={() => !savingWfh && setShowWfh(false)} className={wfhStyles.modalClose}>×</button>
            </div>
            <form onSubmit={handleAssignWfh}>
              <div className={wfhStyles.modalBody}>
                <div className="form-group">
                  <label className="form-label">Select Employee *</label>
                  <select className="form-select" value={wfhForm.employeeId} onChange={e => setWfhForm({ ...wfhForm, employeeId: e.target.value })} required>
                    <option value="">Choose employee...</option>
                    {employees.map(e => (
                      <option key={e._id} value={e._id}>{e.name} ({e.employeeId || 'No ID'})</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">From Date *</label>
                    <input type="date" className="form-input" value={wfhForm.startDate} onChange={e => setWfhForm({ ...wfhForm, startDate: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">To Date *</label>
                    <input type="date" className="form-input" value={wfhForm.endDate} onChange={e => setWfhForm({ ...wfhForm, endDate: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Reason *</label>
                  <textarea className="form-input" rows={3} value={wfhForm.reason} onChange={e => setWfhForm({ ...wfhForm, reason: e.target.value })} placeholder="Reason for WFH assignment..." required maxLength={500} />
                </div>
              </div>
              <div className={wfhStyles.modalFooter}>
                <button type="button" onClick={() => setShowWfh(false)} disabled={savingWfh} className="btn btn--secondary">Cancel</button>
                <button type="submit" disabled={savingWfh} className={wfhStyles.wfhButton}>
                  {savingWfh ? 'Saving...' : 'Assign WFH'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
