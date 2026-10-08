'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getMyLeaves, getMyBalance, deleteLeave, editLeave, getLeaveTypes, getLeaveProofUrl } from '@/api/leaveApi';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import TimePicker from '@/components/TimePicker';
import { getBalanceViewValues } from '@/utils/leaveBalance';
import styles from './MyLeaves.module.css';

/*
 * MyLeaves — Style migration
 * Before: 46   After: ~18   Removed: ~28 static → CSS classes
 * Remaining inline (all dynamic):
 *   - STATUS_STYLE[r.status] bg/color (data-driven)
 *   - leaveMode badge bg/color: Unplanned ? amber : blue (ternary)
 *   - balanceView toggle bg/color/shadow (state ternary)
 *   - year filter button bg/color (state ternary)
 *   - balance bar width/color: pct computed, exceeded color (data-driven)
 *   - balance remaining color: exceeded ? red : green (data-driven)
 *   - balance sub text: period label (data-driven)
 *   - b.color dot (data-driven)
 *   - pagination button disabled state (state-driven)
 */

const STATUS_STYLE = {
  Pending:  { background: '#fef9c3', color: '#854d0e' },
  Approved: { background: '#dcfce7', color: '#166534' },
  Rejected: { background: '#fee2e2', color: '#991b1b' },
};

function durationLabel(leave, config) {
  const unit = leave.unit || config?.unit;
  const allowHourly = leave.allowHourly ?? config?.allowHourly;
  const { from, to } = getTimeRange(leave);
  const hasTimeRange = !!from && !!to;
  const configuredHourly = leave.durationType === 'hourly' || unit === 'count' || unit === 'hours' || (allowHourly && hasTimeRange);
  if (configuredHourly) {
    const durationMinutes = leave.durationMinutes ?? (leave.durationHours ? Math.round(leave.durationHours * 60) : null) ?? (leave.totalHours ? Math.round(leave.totalHours * 60) : null) ?? computeDurationMinutes(from, to);
    if (durationMinutes && durationMinutes > 0) return formatDurationMinutes(durationMinutes);
    // Short Leave without time data — show "2 hours" (standard SL duration)
    const code = (leave.leaveTypeCode || '').toUpperCase();
    if (code === 'SL' || code.startsWith('SHORT') || code === 'SHRT') {
      return '2 hours';
    }
    if (leave.durationType === 'full_day' || !leave.durationType) {
      const days = leave.totalDays ?? 1;
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
    return 'Time not available';
  }
  if (leave.durationType === 'hourly')   return `${leave.startTime} – ${leave.endTime} (${leave.totalHours?.toFixed(1)}h)`;
  if (leave.durationType === 'half_day') return `Half Day · ${leave.halfDayPeriod === 'morning' ? 'Morning' : 'Afternoon'}`;
  const days = leave.totalDays ?? '?';
  return `${days} day${days !== 1 ? 's' : ''}`;
}

function getTimeRange(leave) {
  return {
    from: leave.startTime || leave.fromTime || leave.from_time || null,
    to: leave.endTime || leave.toTime || leave.to_time || null,
  };
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function computeDurationMinutes(startTime, endTime) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null) return null;
  const minutes = endMinutes - startMinutes;
  return minutes > 0 ? minutes : null;
}

function formatDurationMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (!hours) return `${remainder}m`;
  return `${hours}h ${remainder}m`;
}

function formatAmount(value) {
  return Number.isInteger(value) ? `${value}` : `${parseFloat(Number(value || 0).toFixed(1))}`;
}

function formatBalanceAmount(value, balance) {
  if (balance?.unit === 'hours') return `${formatAmount(value)}h`;
  if (balance?.unit === 'count') return formatAmount(value);
  return `${formatAmount(value)}d`;
}

function formatBalanceRemaining(value, balance) {
  if (balance?.unit === 'count') return `${formatAmount(value)} left`;
  return formatBalanceAmount(value, balance);
}

function formatBalanceLimit(value, balance) {
  if (balance?.unit === 'count') return `${formatAmount(value)} allowed`;
  return formatBalanceAmount(value, balance);
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowDateString(todayString) {
  const [year, month, day] = todayString.split('-').map(Number);
  const tomorrow = new Date(year, month - 1, day + 1);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
}

function addMonthsToDateString(dateString, months) {
  const [inputYear, inputMonth, inputDay] = dateString.split('-').map(Number);
  const targetMonthIndex = inputMonth - 1 + months;
  const lastTargetDay = new Date(inputYear, targetMonthIndex + 1, 0).getDate();
  const date = new Date(inputYear, targetMonthIndex, Math.min(inputDay, lastTargetDay));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function MyLeaves() {
  const [leaves, setLeaves]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [balance, setBalance]         = useState([]);
  const [balanceView, setBalanceView] = useState('half');
  const [editModal, setEditModal]     = useState(null); // leave being edited
  const [editForm, setEditForm]       = useState({});
  const [leaveTypes, setLeaveTypes]   = useState([]);
  const [saving, setSaving]           = useState(false);
  const currentYear = new Date().getFullYear();
  const searchParams = useSearchParams();
  const queryStatus = searchParams.get('status');
  const queryCategory = searchParams.get('category');
  const initialStatus = ['Pending', 'Approved', 'Rejected'].includes(queryStatus) ? queryStatus : '';
  const initialCategory = queryCategory === 'Allocated' ? 'main' : queryCategory === 'Other' ? 'other' : 'all';
  const [category, setCategory]       = useState(initialCategory); // 'all' | 'main' | 'other'
  const todayDate = getTodayDateString();
  const plannedMinDate = getTomorrowDateString(todayDate);
  const unplannedMinDate = addMonthsToDateString(todayDate, -1);
  const defaultFilters = { status: initialStatus, leaveMode: '', startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` };
  const [filters, setFilters] = useState(defaultFilters);
  const router = useRouter();
  const MAIN_CODES = ['CL', 'PRIV', 'ML'];

  const doFetch = async (f = filters) => {
    setLoading(true);
    try {
      const params = {};
      if (f.status)    params.status    = f.status;
      if (f.leaveMode) params.leaveMode = f.leaveMode;
      if (f.startDate) params.startDate = f.startDate;
      if (f.endDate)   params.endDate   = f.endDate;
      const res = await getMyLeaves(params);
      setLeaves(res.data.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    doFetch(defaultFilters);
    getMyBalance().then(r => setBalance(r.data.data || [])).catch(() => {});
    getLeaveTypes().then(r => setLeaveTypes(r.data.data || [])).catch(() => {});
  }, []);

  const setF = (key, val) => { const next = { ...filters, [key]: val }; setFilters(next); doFetch(next); };
  const getBalanceConfig = (leave) => balance.find(b => b.code === leave.leaveTypeCode || b.name === leave.leaveType);
  const editStartDateMin = editForm.leaveMode === 'Planned' ? plannedMinDate : unplannedMinDate;
  const editStartDateMax = editForm.leaveMode === 'Unplanned' ? todayDate : undefined;
  const editDateError = editForm.startDate && editForm.leaveMode === 'Planned' && editForm.startDate <= todayDate
    ? 'Planned leave can be applied only for future dates.'
    : '';

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this leave?')) return;
    try {
      await deleteLeave(id);
      toast.success('Leave deleted');
      doFetch();
      getMyBalance().then(r => setBalance(r.data.data || [])).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const openEdit = (leave) => {
    setEditForm({
      leaveType: leave.leaveTypeCode || leave.leaveType,
      durationType: leave.durationType || 'full_day',
      startDate: new Date(leave.startDate).toISOString().slice(0, 10),
      endDate: leave.endDate ? new Date(leave.endDate).toISOString().slice(0, 10) : '',
      halfDayPeriod: leave.halfDayPeriod || 'morning',
      startTime: leave.startTime || '',
      endTime: leave.endTime || '',
      reason: leave.reason || '',
      leaveMode: leave.leaveMode || 'Planned',
    });
    setEditModal(leave);
  };

  const handleEditSave = async () => {
    if (editDateError) return toast.error(editDateError);
    setSaving(true);
    try {
      await editLeave(editModal._id, editForm);
      toast.success('Leave updated');
      setEditModal(null);
      doFetch();
      getMyBalance().then(r => setBalance(r.data.data || [])).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally { setSaving(false); }
  };

  const columns = [
    {
      key: 'leaveType', label: 'Type',
      render: (r) => (
        <span className={styles.typeText}>
          {r.leaveType}
        </span>
      ),
    },
    { key: 'startDate', label: 'Date', render: (r) => {
      if (!r?.startDate) return '—';
      const parseLocalDate = (val) => {
        if (!val) return null;
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          return new Date(`${val}T00:00:00`);
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };
      const startD = parseLocalDate(r.startDate);
      if (!startD) return '—';
      const endD = r.endDate ? parseLocalDate(r.endDate) : null;
      const isMultiDay = endD && startD.toDateString() !== endD.toDateString();
      const getDayStr = (d) => d.toLocaleDateString('en-US', { weekday: 'long' });

      if (isMultiDay) {
        return (
          <div>
            <span>{startD.toLocaleDateString()} – {endD.toLocaleDateString()}</span>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', fontWeight: 500 }}>
              ({getDayStr(startD)} – {getDayStr(endD)})
            </div>
          </div>
        );
      }
      return (
        <div>
          <span>{startD.toLocaleDateString()}</span>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', fontWeight: 500 }}>
            ({getDayStr(startD)})
          </div>
        </div>
      );
    } },
    {
      key: 'duration', label: 'Duration',
      render: (r) => <span className="text-sm text-secondary">{durationLabel(r, getBalanceConfig(r))}</span>,
    },
    {
      key: 'reason', label: 'Reason',
      render: (r) => <span className={`text-sm text-secondary text-truncate ${styles.reasonText}`}>{r.reason}</span>,
    },
    {
      key: 'proof', label: 'Proof',
      render: (r) => r.proofUrl ? (
        <a href={getLeaveProofUrl(r._id)} target="_blank" rel="noreferrer" className={styles.proofLink}>
          View slip
        </a>
      ) : <span className="text-sm text-secondary">—</span>,
    },
    {
      key: 'leaveMode', label: 'Planned?',
      /* leaveMode badge — bg/color data-driven */
      render: (r) => (
        <span className={styles.modeBadge} style={{ background: r.leaveMode === 'Unplanned' ? '#fef3c7' : '#eff6ff', color: r.leaveMode === 'Unplanned' ? '#92400e' : '#1d4ed8' }}>
          {r.leaveMode || 'Planned'}
        </span>
      ),
    },
    {
      key: 'status', label: 'Status',
      /* STATUS_STYLE is data-driven */
      render: (r) => (
        <span className={`font-bold ${styles.badge}`} style={STATUS_STYLE[r.status]}>{r.status}</span>
      ),
    },
    {
      key: 'actions', label: 'Actions',
      render: (r) => r.status === 'Pending' ? (
        <div className="d-flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(r); }}
            className={`${styles.rowButton} ${styles.editButton}`}>
            Edit
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(r._id); }}
            className={`${styles.rowButton} ${styles.deleteButton}`}>
            Delete
          </button>
        </div>
      ) : <span className={`text-muted ${styles.emptyAction}`}>—</span>,
    },
  ];

  if (loading) return <LoadingSpinner />;

  // Helper to check if a leave code is a main/allocated leave
  const isMainCode = (code) => {
    const c = (code || '').toUpperCase();
    return MAIN_CODES.includes(c) || c.startsWith('PRIV') || c.startsWith('CASUA') || c === 'ML' || c.startsWith('MEDIC');
  };

  // Filter leaves by category for display
  const filteredLeaves = category === 'all' ? leaves : leaves.filter(l => {
    const main = isMainCode(l.leaveTypeCode);
    return category === 'main' ? main : !main;
  });

  const pending  = filteredLeaves.filter(l => l.status === 'Pending').length;
  const approved = filteredLeaves.filter(l => l.status === 'Approved').length;

  // Stat card values based on category
  const mainBalance = balance.filter(b => ['CL', 'PRIV', 'ML'].includes(b.code));
  const mainBalanceTotals = mainBalance.reduce((totals, item) => {
    const view = getBalanceViewValues(item, balanceView);
    return {
      used: totals.used + view.used,
      remaining: totals.remaining + view.remaining,
    };
  }, { used: 0, remaining: 0 });
  const totalRemaining = parseFloat(mainBalanceTotals.remaining.toFixed(1));
  const totalUsedMain = parseFloat(mainBalanceTotals.used.toFixed(1));
  const balancePeriodLabel = balanceView === 'year' ? 'This Year' : 'This Half';

  // Pending count (applications)
  const pendingCount = leaves.filter(l => l.status === 'Pending').length;
  const approvedCount = filteredLeaves.filter(l => l.status === 'Approved').length;

  return (
    <div className={styles.dashboard}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>My Leaves</h2>
          <p className={styles.subtitle}>Manage leave requests and balances · {filteredLeaves.length} applications</p>
        </div>
        <button onClick={() => router.push('/employee/leaves/apply')}
          className={styles.applyButton}>
          + Apply for Leave
        </button>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        {[
          { label: `Used ${balancePeriodLabel}`, value: totalUsedMain, icon: '📅', bg: '#eff6ff' },
          { label: `Remaining ${balancePeriodLabel}`, value: totalRemaining, icon: '🌿', bg: '#f0fdf4' },
          { label: 'Pending for Approval', value: pendingCount, icon: '⏳', bg: '#fef9c3' },
        ].map(card => (
          <div key={card.label} className={styles.kpiCard}>
            <div className={styles.kpiIcon} style={{ background: card.bg }}>{card.icon}</div>
            <div>
              <p className={styles.kpiValue}>{card.value}</p>
              <p className={styles.kpiLabel}>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select value={filters.status} onChange={e => setF('status', e.target.value)}
            className={styles.control}>
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select value={filters.leaveMode} onChange={e => setF('leaveMode', e.target.value)}
            className={styles.control}>
            <option value="">All</option>
            <option value="Planned">Planned</option>
            <option value="Unplanned">Unplanned</option>
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Category</span>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className={styles.control}>
            <option value="all">All Leaves</option>
            <option value="main">Allocated (CL, PL, ML)</option>
            <option value="other">Other Leaves</option>
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>From</span>
          <input type="date" value={filters.startDate} onChange={e => setF('startDate', e.target.value)}
            className={styles.control} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>To</span>
          <input type="date" value={filters.endDate} onChange={e => setF('endDate', e.target.value)}
            className={styles.control} />
        </div>
        {(filters.status || filters.leaveMode || category !== 'main' || filters.startDate !== `${currentYear}-01-01` || filters.endDate !== `${currentYear}-12-31`) && (
          <button onClick={() => { setFilters(defaultFilters); setCategory('main'); doFetch(defaultFilters); }}
            className={styles.resetButton}>✕ Reset</button>
        )}
        <span className={styles.yearBadge}>{currentYear}</span>
      </div>

      {/* Leave Balance */}
      {balance.length > 0 && filters.startDate === `${currentYear}-01-01` && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Leave Balance</h3>
            <div className={styles.toggle}>
              <button onClick={() => setBalanceView('half')} className={styles.toggleButton} style={{ background: balanceView === 'half' ? '#fff' : 'transparent', color: balanceView === 'half' ? '#4f46e5' : '#9ca3af', boxShadow: balanceView === 'half' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>6 Months</button>
              <button onClick={() => setBalanceView('year')} className={styles.toggleButton} style={{ background: balanceView === 'year' ? '#fff' : 'transparent', color: balanceView === 'year' ? '#4f46e5' : '#9ca3af', boxShadow: balanceView === 'year' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>Yearly</button>
            </div>
          </div>
          <div className={styles.balanceGrid}>
            {balance.filter(b => b.daysAllowed > 0 || b.daysAllowed === null).map(b => {
              const isFH = b.isFreeHand;
              const { used, quota, remaining, periodLabel } = getBalanceViewValues(b, balanceView);
              const displayUsed = isFH ? Number(b.usedPendingDays || b.used || 0) : used;
              const pct       = !isFH && quota > 0 ? Math.min(100, (displayUsed / quota) * 100) : 0;
              const exceeded  = !isFH && remaining < 0;
              return (
                <div key={b.code} className={styles.balanceCard}>
                  <div className={styles.balanceHeader}>
                    <div className={styles.balanceName}>
                      <div className={styles.balanceDot} style={{ background: b.color || '#6366f1' }} />
                      <span className={styles.balanceCode}>{b.code}</span>
                    </div>
                    {isFH
                      ? <span className={styles.noLimit}>No limit</span>
                      : <span className={styles.remaining} style={{ color: exceeded ? '#ef4444' : '#16a34a' }}>{formatBalanceRemaining(remaining, b)}</span>
                    }
                  </div>
                  {!isFH && (
                    <div className={styles.progress}>
                      <div className={styles.progressFill} style={{ width: `${pct}%`, background: exceeded ? '#ef4444' : b.color }} />
                    </div>
                  )}
                  <p className={styles.meta}>
                    {isFH ? `${formatAmount(displayUsed)} used (approval-based)` : `${formatAmount(displayUsed)} used / ${formatBalanceLimit(quota, b)} ${periodLabel}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leave table */}
      <div className={styles.tableShell}>
        <DataTable columns={columns} data={filteredLeaves} searchPlaceholder="Search leaves..." />
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal modal--md" onClick={e => e.stopPropagation()}>
            <h3 className="modal__title">Edit Leave</h3>
            <div className={`d-flex-col ${styles.modalStack}`}>
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select className="form-select" value={editForm.leaveType} onChange={e => setEditForm(f => ({ ...f, leaveType: e.target.value }))}>
                  {leaveTypes.map(lt => <option key={lt.code} value={lt.code}>{lt.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Duration Type</label>
                <select className="form-select" value={editForm.durationType} onChange={e => setEditForm(f => ({ ...f, durationType: e.target.value }))}>
                  <option value="full_day">Full Day</option>
                  <option value="half_day">Half Day</option>
                  <option value="hourly">Hourly</option>
                </select>
              </div>
              <div className={styles.formGrid}>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-input" value={editForm.startDate} min={editStartDateMin} max={editStartDateMax} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate }))} />
                </div>
                {editForm.durationType === 'full_day' && (
                  <div className="form-group">
                    <label className="form-label">End Date</label>
                    <input type="date" className="form-input" value={editForm.endDate} min={editForm.startDate || editStartDateMin} max={editStartDateMax} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                )}
              </div>
              {editDateError && <p className={styles.error}>{editDateError}</p>}
              {editForm.durationType === 'half_day' && (
                <div className="form-group">
                  <label className="form-label">Period</label>
                  <select className="form-select" value={editForm.halfDayPeriod} onChange={e => setEditForm(f => ({ ...f, halfDayPeriod: e.target.value }))}>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                  </select>
                </div>
              )}
              {editForm.durationType === 'hourly' && (
                <div className={styles.formGrid}>
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <TimePicker value={editForm.startTime} onChange={v => setEditForm(f => ({ ...f, startTime: v }))} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <TimePicker value={editForm.endTime} onChange={v => setEditForm(f => ({ ...f, endTime: v }))} className="form-input" />
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Reason</label>
                <textarea className="form-textarea" rows={3} value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Leave Mode</label>
                <select className="form-select" value={editForm.leaveMode} onChange={e => setEditForm(f => ({ ...f, leaveMode: e.target.value }))}>
                  <option value="Planned">Planned</option>
                  <option value="Unplanned">Unplanned</option>
                </select>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--secondary" onClick={() => setEditModal(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleEditSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
