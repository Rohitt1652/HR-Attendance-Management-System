'use client';
'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getMyAttendance } from '@/api/attendanceApi';
import DataTable from '@/components/DataTable';
import AttendanceCalendar from '@/components/AttendanceCalendar';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AlertCircle, Info, Clock } from 'lucide-react';
import styles from './MyAttendance.module.css';

/*
 * MyAttendance — Style migration log
 * Before: 25 inline style blocks
 * After:  5 inline style blocks (all dynamic/data-driven)
 */

const STATUS_COLORS = {
  Present:  '#22c55e',
  'Full Day': '#16a34a',
  'Half Day': '#f59e0b',
  Absent:   '#ef4444',
  Holiday:  '#6366f1',
  Weekend:  '#94a3b8',
  'On Leave': '#8b5cf6',
  'Short Leave': '#8b5cf6',
  'Needs Review': '#d97706',
};

const TIME_STATUS_COLORS = {
  'On Track': '#16a34a',
  Late: '#f97316',
  'Missing Punch': '#d97706',
  'Short Time': '#dc2626',
  Leave: '#8b5cf6',
  'Worked on Holiday': '#ca8a04',
  'Weekly Off': '#64748b',
  'Partial Leave Exception': '#b45309',
  'Short Leave Exception': '#b45309',
};

const toLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatAttendanceTime = (value) => value
  ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
  : '—';

const visibleShortHours = (value) => {
  const rounded = Number(Number(value || 0).toFixed(1));
  return rounded > 0 ? rounded : 0;
};

const SUPPORTED_ISSUES = ['late', 'short_hours', 'missing_punch', 'overtime', 'partial_leave_missing_attendance', 'short_leave_missing_attendance'];
const SUPPORTED_STATUSES = ['Present', 'Full Day', 'Absent', 'Holiday', 'Weekend'];

const isValidDateStr = (str) => {
  if (!str || typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
};

const getInitialFiltersFromUrl = (defaultStart, defaultEnd) => {
  const defaults = { status: '', issue: '', isLate: '', startDate: defaultStart, endDate: defaultEnd, sortDir: 'desc' };
  if (typeof window === 'undefined') return defaults;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const rawIssue = searchParams.get('issue');
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');
    const rawStatus = searchParams.get('status');
    const rawSortDir = searchParams.get('sortDir');

    let issue = '';
    if (rawIssue && SUPPORTED_ISSUES.includes(rawIssue)) {
      issue = rawIssue;
    }

    let startDate = defaultStart;
    let endDate = defaultEnd;

    const validStart = isValidDateStr(rawStartDate);
    const validEnd = isValidDateStr(rawEndDate);

    if (validStart && validEnd && rawStartDate <= rawEndDate) {
      startDate = rawStartDate;
      endDate = rawEndDate;
    } else if (validStart && !validEnd) {
      startDate = rawStartDate;
      endDate = rawStartDate > defaultEnd ? rawStartDate : defaultEnd;
    } else if (!validStart && validEnd) {
      endDate = rawEndDate;
      startDate = defaultStart <= rawEndDate ? defaultStart : rawEndDate;
    }

    let status = '';
    if (rawStatus && SUPPORTED_STATUSES.includes(rawStatus)) {
      status = rawStatus;
    }

    let sortDir = 'desc';
    if (rawSortDir === 'asc' || rawSortDir === 'desc') {
      sortDir = rawSortDir;
    }

    return {
      ...defaults,
      status,
      issue,
      startDate,
      endDate,
      sortDir,
    };
  } catch {
    return defaults;
  }
};

export default function MyAttendance() {
  const today = toLocalDateString(new Date());
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStart = toLocalDateString(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 1));
  const lastMonthEnd = toLocalDateString(new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0));
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', issue: '', isLate: '', startDate: thisMonthStart, endDate: today, sortDir: 'desc' });
  const [attendanceMeta, setAttendanceMeta] = useState(null);

  const doFetch = async (f = filters) => {
    setLoading(true);
    try {
      const params = { sortDir: f.sortDir };
      if (f.status)    params.status    = f.status;
      if (f.issue)     params.issue     = f.issue;
      if (f.isLate)    params.isLate    = f.isLate;
      if (f.startDate) params.startDate = f.startDate;
      if (f.endDate)   params.endDate   = f.endDate;
      const res = await getMyAttendance(params);
      setRecords(res.data.data);
      const meta = res.data.meta || null;
      setAttendanceMeta(meta);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const initFilters = getInitialFiltersFromUrl(thisMonthStart, today);
    setFilters(initFilters);
    doFetch(initFilters);
  }, []);

  const setF = (key, val) => {
    const next = { ...filters, [key]: val };
    if (key === 'issue') next.isLate = '';
    setFilters(next);
    doFetch(next);
  };

  const setRange = (startDate, endDate) => {
    const next = { ...filters, startDate, endDate };
    setFilters(next);
    doFetch(next);
  };

  const monthLabel = filters.startDate && filters.endDate
    ? `${new Date(`${filters.startDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${new Date(`${filters.endDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'All attendance records';
  const calendarDate = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : new Date();
  const attendanceRangeEnd = today;

  const lastAttendanceImportDate = attendanceMeta?.lastAttendanceImportDate || null;
  const isUncovered = Boolean(lastAttendanceImportDate && filters.startDate && filters.startDate > lastAttendanceImportDate);
  const isPartiallyCovered = Boolean(
    lastAttendanceImportDate &&
    filters.startDate &&
    filters.endDate &&
    filters.startDate <= lastAttendanceImportDate &&
    filters.endDate > lastAttendanceImportDate
  );

  const formatReadableCoverageDate = (rawDateStr) => {
    if (!rawDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) return rawDateStr || '';
    const [y, m, d] = rawDateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(dateObj);
  };

  const formattedCoverageDate = formatReadableCoverageDate(lastAttendanceImportDate);
  const attendanceUploadedTill = formattedCoverageDate;
  const selectedMonthName = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long' }) : 'Current month';

  const columns = [
    {
      key: 'date', label: 'Date',
      render: (r) => <span className="font-semibold text-md">{r.date}</span>,
    },
    {
      key: 'checkIn', label: 'Check In',
      render: (r) => formatAttendanceTime(r.checkIn),
    },
    {
      key: 'checkOut', label: 'Check Out',
      render: (r) => formatAttendanceTime(r.checkOut),
    },
    {
      key: 'workingHours', label: 'Hours',
      render: (r) => <span className="font-semibold">{r.workingHours?.toFixed(1) ?? '—'}</span>,
    },
    {
      key: 'timeStatus', label: 'Time Status',
      render: (r) => {
        const shortHours = visibleShortHours(r.shortHours);
        const label = r.timeStatus || (r.hasMissingPunch ? 'Missing Punch' : shortHours > 0 ? 'Short Time' : r.isLate ? 'Late' : 'On Track');
        const c = TIME_STATUS_COLORS[label] || '#64748b';
        return (
          <div className={`d-flex-col ${styles.badgeStack}`}>
            <span className={`text-sm font-semibold ${styles.badge}`} style={{ background: `${c}20`, color: c }}>
              {label}
            </span>
            {label === 'Short Time' && shortHours > 0 && (
              <span className={styles.shortText}>
                Short by {shortHours.toFixed(1)}h
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status', label: 'Status',
      render: (r) => {
        const isShortLeaveMissing = r.issueFlags?.includes('short_leave_missing_attendance') || r.timeStatus === 'Short Leave Exception' || r.primaryStatus === 'short_leave_missing_attendance';
        const isPartialLeaveMissing = r.issueFlags?.includes('partial_leave_missing_attendance') || r.timeStatus === 'Partial Leave Exception' || r.primaryStatus === 'partial_leave_missing_attendance';

        const reqHrsText = r.requiredHours ? `${r.requiredHours}h` : 'Hours';

        const displayStatus = r.timeStatus === 'WFH'
          ? 'Present'
          : r.hasMissingPunch || r.timeStatus === 'Missing Punch'
          ? 'Needs Review'
          : r.leaveInfo?.durationType === 'full_day'
          ? 'On Leave'
          : r.leaveInfo?.durationType === 'half_day' || isPartialLeaveMissing
          ? 'Half Day'
          : isShortLeaveMissing || r.leaveInfo?.durationType === 'hourly' || r.dayType === 'Short Leave'
          ? (r.workingHours > 0 || r.workedHours > 0 ? 'Present' : 'Short Leave')
          : r.status;
        const c = STATUS_COLORS[displayStatus] || '#6366f1';
        return (
          <div className={`d-flex-col ${styles.badgeStack}`}>
            <span className={`text-sm font-semibold ${styles.badge}`} style={{ background: `${c}20`, color: c }}>
              {displayStatus || '-'}
            </span>
            {r.leaveInfo?.hasLeave && r.leaveInfo.durationType !== 'full_day' && (
              <span
                title={isShortLeaveMissing ? `Approved Short Leave — Attendance missing for remaining ${reqHrsText} required working hours` : (isPartialLeaveMissing ? 'Approved half-day leave missing complementary attendance record' : r.leaveInfo.tooltip)}
                className={styles.leavePill}
                style={{
                  background: (isShortLeaveMissing || isPartialLeaveMissing) ? '#fff7ed' : (r.leaveInfo.status === 'pending' ? '#fff7ed' : '#f5f3ff'),
                  color: (isShortLeaveMissing || isPartialLeaveMissing) ? '#b45309' : (r.leaveInfo.status === 'pending' ? '#c2410c' : '#7c3aed'),
                  border: `1px solid ${(isShortLeaveMissing || isPartialLeaveMissing) ? '#fed7aa' : (r.leaveInfo.status === 'pending' ? '#fed7aa' : '#ddd6fe')}`
                }}
              >
                {isShortLeaveMissing
                  ? `Attendance Missing for Remaining ${reqHrsText}`
                  : isPartialLeaveMissing
                  ? 'Half-day Leave — Attendance Missing for Remaining Half'
                  : (r.leaveInfo.label || (r.leaveInfo.status === 'pending' ? 'Leave Applied' : 'Leave Approved'))}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  const coveredRecords = records.filter(r => !lastAttendanceImportDate || r.date <= lastAttendanceImportDate);

  const fullCount = isUncovered
    ? 0
    : coveredRecords.filter(r => ['Present', 'Full Day'].includes(r.status) && !r.hasMissingPunch && r.timeStatus !== 'Missing Punch').length;

  const partialCount = isUncovered
    ? 0
    : coveredRecords.filter(r => r.status === 'Half Day' && !r.hasMissingPunch && r.timeStatus !== 'Missing Punch' && ((r.workingHours || 0) > 0 || (r.workedHours || 0) > 0)).length;

  const totalPresent = fullCount + partialCount;
  const presentValue = isUncovered ? '—' : totalPresent;
  const presentSubtitle = isUncovered
    ? 'Attendance not available'
    : `${fullCount} Full · ${partialCount} Partial${isPartiallyCovered ? ` (through ${formattedCoverageDate})` : ''}`;

  const absent = isUncovered
    ? '—'
    : coveredRecords.filter(r => r.status === 'Absent').length;

  const shortTimeAttendance = isUncovered
    ? '—'
    : coveredRecords.filter(r => !r.hasMissingPunch && r.timeStatus === 'Short Time' && visibleShortHours(r.shortHours) > 0).length;

  const missingPunch = isUncovered
    ? '—'
    : coveredRecords.filter(r => (r.timeStatus === 'Missing Punch' || r.hasMissingPunch)).length;

  const leaveApplied = records.filter(r => r.timeStatus !== 'WFH' && r.leaveInfo?.hasLeave && r.leaveInfo.status === 'approved').length;

  const stats = [
    { label: 'Present', value: presentValue, color: '#22c55e', subtitle: presentSubtitle },
    { label: 'Short Time', value: shortTimeAttendance, color: '#f59e0b', subtitle: isUncovered ? 'Attendance not available' : (isPartiallyCovered ? `Evaluated through ${formattedCoverageDate}` : null) },
    { label: 'Missing Punch', value: missingPunch, color: '#d97706', subtitle: isUncovered ? 'Attendance not available' : (isPartiallyCovered ? `Evaluated through ${formattedCoverageDate}` : null) },
    { label: 'Leave Approved', value: leaveApplied, color: '#8b5cf6', subtitle: 'Independently approved' },
    { label: 'Absent', value: absent, color: '#ef4444', subtitle: isUncovered ? 'Attendance not available' : (isPartiallyCovered ? `Evaluated through ${formattedCoverageDate}` : null) },
  ];

  return (
    <div className={styles.page}>

      <div className={`row-center flex-wrap ${styles.header}`}>
        <div>
          <h2 className="font-extrabold text-3xl text-heading section-title">My Attendance</h2>
          <p className={`text-secondary ${styles.subtitle}`}>Showing: <strong>{monthLabel}</strong></p>
          {attendanceUploadedTill && (
            <p className={`text-secondary ${styles.uploadMeta}`}>Attendance data available through: <strong>{attendanceUploadedTill}</strong></p>
          )}
        </div>
        <div className={`row-center flex-wrap ${styles.rangeActions}`}>
          {[['This Month', thisMonthStart, attendanceRangeEnd], ['Last Month', lastMonthStart, lastMonthEnd]].map(([label, from, to]) => (
            <button key={label} type="button" onClick={() => setRange(from, to)}
              className={styles.rangeButton}
              style={{ background: filters.startDate === from && filters.endDate === to ? '#2563eb' : '#fff', color: filters.startDate === from && filters.endDate === to ? '#fff' : '#475569' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Factual Coverage Banner */}
      {isUncovered ? (
        <div className={styles.coverageBanner}>
          <div className={styles.coverageBannerContent}>
            <AlertCircle size={20} color="#d97706" />
            <div>
              <p className={styles.coverageBannerTitle}>
                Attendance data is available through {formattedCoverageDate || 'latest import date'}.
              </p>
              <p className={styles.coverageBannerSub}>
                {selectedMonthName} biometric attendance has not been uploaded yet.
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.rangeButton}
            style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
            onClick={() => setRange(lastMonthStart, lastMonthEnd)}
          >
            View Last Month
          </button>
        </div>
      ) : isPartiallyCovered ? (
        <div className={styles.coverageBannerInfo}>
          <Info size={16} color="#0284c7" />
          <span>
            Attendance data is evaluated through <strong>{formattedCoverageDate}</strong>. Dates after {formattedCoverageDate} are not covered by biometric upload yet.
          </span>
        </div>
      ) : null}

      {/* Stats row */}
      <div className={styles.statsGrid}>
        {stats.map(s => (
          <div
            key={s.label}
            className={`bg-white rounded-lg border-default ${styles.statCard}`}
            style={{ borderLeft: `4px solid ${s.color}` }}
          >
            <div className={`font-extrabold ${styles.statValue}`} style={{ color: s.color }}>{s.value}</div>
            <div className="text-base text-secondary">{s.label}</div>
            {s.subtitle && <div className={styles.statSubtitle}>{s.subtitle}</div>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`bg-white rounded-xl border-default row-center flex-wrap ${styles.filterBar}`}>
        <div>
          <label className={`text-sm text-muted ${styles.label}`}>Status</label>
          <select value={filters.status} onChange={e => setF('status', e.target.value)} className={styles.input}>
            <option value="">All</option>
            {['Present', 'Full Day', 'Absent', 'Holiday', 'Weekend'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={`text-sm text-muted ${styles.label}`}>From</label>
          <input type="date" value={filters.startDate} onChange={e => setF('startDate', e.target.value)} className={styles.input} />
        </div>
        <div>
          <label className={`text-sm text-muted ${styles.label}`}>To</label>
          <input type="date" value={filters.endDate} max={attendanceRangeEnd} onChange={e => setF('endDate', e.target.value)} className={styles.input} />
        </div>
        <div>
          <label className={`text-sm text-muted ${styles.label}`}>Issue</label>
          <select value={filters.issue || (filters.isLate ? 'late' : '')} onChange={e => setF('issue', e.target.value)} className={styles.input}>
            <option value="">All</option>
            <option value="late">Late</option>
            <option value="short_hours">Short Time</option>
            <option value="missing_punch">Missing Punch</option>
            <option value="partial_leave_missing_attendance">Partial Leave Exceptions</option>
            <option value="short_leave_missing_attendance">Short Leave Exceptions</option>
            <option value="overtime">Overtime</option>
          </select>
        </div>
        <div>
          <label className={`text-sm text-muted ${styles.label}`}>Sort</label>
          <select value={filters.sortDir} onChange={e => setF('sortDir', e.target.value)} className={styles.input}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        {(filters.status || filters.issue || filters.isLate || filters.startDate || filters.endDate) && (
          <button
            onClick={() => { const f = { status: '', issue: '', isLate: '', startDate: thisMonthStart, endDate: attendanceRangeEnd, sortDir: 'desc' }; setFilters(f); doFetch(f); }}
            className={`cursor-pointer text-secondary ${styles.input} ${styles.clearButton}`}
          >
            Clear
          </button>
        )}
      </div>

      {/* Calendar view */}
      <div className={`bg-white rounded-2xl border-default ${styles.panel}`}>
        <h3 className={`font-bold text-heading ${styles.panelTitle}`}>Calendar View - {monthLabel}</h3>
        <AttendanceCalendar records={records} year={calendarDate.getFullYear()} month={calendarDate.getMonth()} lastAttendanceImportDate={lastAttendanceImportDate} />
      </div>

      {/* Table view */}
      <div className={`bg-white rounded-2xl border-default ${styles.panel}`}>
        {loading ? (
          <LoadingSpinner />
        ) : isUncovered && records.length === 0 ? (
          <div className={styles.uncoveredEmptyState}>
            <Clock size={32} color="#94a3b8" />
            <p className={styles.uncoveredEmptyTitle}>
              Attendance data is not available for this period yet.
            </p>
            <p className={styles.uncoveredEmptySub}>
              Latest available attendance: {formattedCoverageDate || 'N/A'}
            </p>
            <button
              type="button"
              className={styles.rangeButton}
              style={{ background: '#2563eb', color: '#fff', marginTop: '0.75rem', border: 'none', cursor: 'pointer' }}
              onClick={() => setRange(lastMonthStart, lastMonthEnd)}
            >
              View Last Month
            </button>
          </div>
        ) : (
          <DataTable columns={columns} data={records} />
        )}
      </div>

    </div>
  );
}
