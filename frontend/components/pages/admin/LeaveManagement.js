'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getAllLeaves, approveLeave, rejectLeave, deleteLeave, editLeave, getLeaveTypes } from '@/api/leaveApi';
import { listEmployees } from '@/api/employeeApi';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import TimePicker from '@/components/TimePicker';
import { useAuth } from '@/context/AuthContext';
import styles from './LeaveManagement.module.css';

const STATUS_STYLE = {
  Pending:  { background: '#fef9c3', color: '#854d0e' },
  Approved: { background: '#dcfce7', color: '#166534' },
  Rejected: { background: '#fee2e2', color: '#991b1b' },
};

function durationLabel(leave) {
  if (leave.durationType === 'hourly') return `${leave.startTime}–${leave.endTime} (${leave.totalHours?.toFixed(1)}h)`;
  if (leave.durationType === 'half_day') return `Half · ${leave.halfDayPeriod === 'morning' ? 'AM' : 'PM'}`;
  return `${leave.totalDays ?? '?'} day(s)`;
}

export default function LeaveManagement() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || '';
  const initialStartDate = searchParams.get('startDate') || '';
  const initialEndDate = searchParams.get('endDate') || '';
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: initialStatus, leaveType: '', employeeId: '', leaveMode: '', startDate: initialStartDate, endDate: initialEndDate });
  const [empSearch, setEmpSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [empStatusFilter, setEmpStatusFilter] = useState('Active'); // Active | Inactive | All
  const [showEmpDrop, setShowEmpDrop] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [leaveTypesList, setLeaveTypesList] = useState([]);
  const [saving, setSaving] = useState(false);

  // Load ALL employees for the filter dropdown (paginate through all pages)
  useEffect(() => {
    const loadAll = async () => {
      try {
        const first = await listEmployees({ limit: 200, page: 1, status: empStatusFilter === 'All' ? undefined : empStatusFilter });
        const { data, pagination: pg } = first.data;
        if (pg && pg.pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: pg.pages - 1 }, (_, i) => listEmployees({ limit: 200, page: i + 2, status: empStatusFilter === 'All' ? undefined : empStatusFilter }))
          );
          setEmployees([...data, ...rest.flatMap(r => r.data.data)]);
        } else {
          setEmployees(data || []);
        }
      } catch { /* silent */ }
    };
    loadAll();
  }, [empStatusFilter]);

  const fetchLeaves = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50 };
      if (filters.status) params.status = filters.status;
      if (filters.leaveType) params.leaveType = filters.leaveType;
      if (filters.employeeId) params.employeeId = filters.employeeId;
      if (filters.leaveMode) params.leaveMode = filters.leaveMode;
      if (filters.month) params.month = filters.month;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      // Filter by employee status (Active/Inactive)
      if (empStatusFilter && empStatusFilter !== 'All') params.empStatus = empStatusFilter;
      const res = await getAllLeaves(params);
      setLeaves(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load leaves'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLeaves(page); }, [page]);
  useEffect(() => { setPage(1); fetchLeaves(1); }, [empStatusFilter]);
  useEffect(() => { getLeaveTypes().then(r => setLeaveTypesList(r.data.data || [])).catch(() => {}); }, []);

  const openEditModal = (leave) => {
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
    setSaving(true);
    try {
      await editLeave(editModal._id, editForm);
      toast.success('Leave updated');
      setEditModal(null);
      fetchLeaves(page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally { setSaving(false); }
  };

  const handleDeleteLeave = async (id) => {
    if (!confirm('Delete this leave?')) return;
    try {
      await deleteLeave(id);
      toast.success('Leave deleted');
      fetchLeaves(page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleAction = async () => {
    try {
      if (actionModal.action === 'approve') {
        await approveLeave(actionModal.id);
        toast.success('Leave approved');
      } else if (actionModal.action === 'reject') {
        await rejectLeave(actionModal.id, rejectReason);
        toast.success('Leave rejected');
      } else if (actionModal.action === 'delete') {
        await deleteLeave(actionModal.id);
        toast.success('Leave deleted');
      }
      fetchLeaves(page);
    } catch (err) { toast.error(err.response?.data?.message || 'Action failed'); }
    setActionModal(null);
    setRejectReason('');
  };

  const filteredEmps = employees
    .filter(e => {
      if (!empSearch) return true;
      return e.name?.toLowerCase().includes(empSearch.toLowerCase()) ||
             e.employeeId?.toLowerCase().includes(empSearch.toLowerCase());
    })
    .slice(0, 20);

  const columns = [
    { key: 'employee', label: 'Employee', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.68rem', flexShrink: 0, overflow: 'hidden' }}>
          {r.employeeId?.profilePhotoUrl ? <img src={r.employeeId.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : r.employeeId?.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.8rem', color: '#111827', margin: 0 }}>{r.employeeId?.name || '-'}</p>
          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{r.employeeId?.department || ''}</p>
        </div>
      </div>
    )},
    { key: 'leaveType', label: 'Type', render: (r) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={{ fontSize: '0.68rem', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', color: '#64748b', fontFamily: 'monospace' }}>{r.leaveTypeCode}</span>
        <span style={{ fontSize: '0.78rem' }}>{r.leaveType}</span>
      </span>
    )},
    { key: 'startDate', label: 'Leave Date', render: (r) => {
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
    { key: 'appliedAt', label: 'Applied On', render: (r) => r.appliedAt ? <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(r.appliedAt).toLocaleDateString()}</span> : '—' },
    { key: 'duration', label: 'Duration', render: (r) => <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{durationLabel(r)}</span> },
    { key: 'reason', label: 'Reason', render: (r) => (
      <div style={{ maxWidth: '180px' }}>
        <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>
        {r.currentProject && (
          <span style={{ fontSize: '0.68rem', color: '#6366f1', fontWeight: 600, display: 'block', marginTop: '2px' }}>
            📁 {r.currentProject}
          </span>
        )}
        {r.proofUrl && (
          <a href={`/api/leaves/${r._id}/proof`} target="_blank" rel="noreferrer"
            style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 600, display: 'block', marginTop: '2px' }}>
            📎 View donation slip
          </a>
        )}
      </div>
    )},
    { key: 'leaveMode', label: 'Planned?', render: (r) => (
      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600,
        background: r.leaveMode === 'Unplanned' ? '#fef3c7' : '#eff6ff',
        color: r.leaveMode === 'Unplanned' ? '#92400e' : '#1d4ed8' }}>
        {r.leaveMode || 'Planned'}
      </span>
    )},
    { key: 'status', label: 'Status', render: (r) => (
      r.status === 'Pending' ? (
        <select
          defaultValue="Pending"
          onChange={e => {
            const val = e.target.value;
            if (val === 'Approved') setActionModal({ id: r._id, action: 'approve' });
            else if (val === 'Rejected') setActionModal({ id: r._id, action: 'reject' });
          }}
          style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, border: '1.5px solid #f59e0b', background: '#fffbeb', color: '#92400e', cursor: 'pointer', outline: 'none' }}>
          <option value="Pending">Pending</option>
          <option value="Approved">Approve ✓</option>
          <option value="Rejected">Reject ✗</option>
        </select>
      ) : (
        <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, ...STATUS_STYLE[r.status] }}>{r.status}</span>
      )
    )},
    { key: 'approvedBy', label: 'Actioned By', render: (r) =>
      r.approvedBy?.name
        ? <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 600 }}>👤 {r.approvedBy.name}</span>
        : <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>—</span>
    },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={() => openEditModal(r)}
          title="Edit leave"
          style={{ padding: '4px 8px', background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
          Edit
        </button>
        <button
          onClick={() => handleDeleteLeave(r._id)}
          title="Delete leave"
          style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
          Delete
        </button>
      </div>
    )},
  ];

  return (
    <>
    <div className="admin-page-stack">
      <div className="admin-header">
        <div>
          <h2 className={styles.pageHeaderTitle}>
            Leave Requests
          </h2>
          <p className={styles.pageHeaderSubtitle}>{pagination?.total || leaves.length} total requests</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className={styles.statsGrid}>
        {[
          { label: 'Pending', value: leaves.filter(l => l.status === 'Pending').length, icon: '⏳', color: '#f59e0b' },
          { label: 'Approved', value: leaves.filter(l => l.status === 'Approved').length, icon: '✓', color: '#22c55e' },
          { label: 'Rejected', value: leaves.filter(l => l.status === 'Rejected').length, icon: '✗', color: '#ef4444' },
          { label: 'This Month', value: leaves.length, icon: '📋', color: '#6366f1' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>{s.label}</span>
              <span style={{ fontSize: '1rem' }}>{s.icon}</span>
            </div>
            <p className={styles.statValue}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Hierarchy info banner */}
      {user?.role === 'team_lead' && (
        <div className={styles.bannerTeamLead}>
          👥 You can see and approve leaves of <strong>your team members only</strong>. Your own leaves require HR or MD approval.
        </div>
      )}
      {user?.role === 'hr' && (
        <div className={styles.bannerHr}>
          🧑‍💼 You can approve leaves for <strong>employees and team leads</strong>.
        </div>
      )}

      {/* Filters */}
      <div className={styles.filterCard}>
        {/* Employee Status filter */}
        <div>
          <label className="form-label">
            Emp. Status
            {employees.length > 0 && (
              <span style={{ marginLeft: 4, color: empStatusFilter === 'Active' ? '#22c55e' : empStatusFilter === 'Inactive' ? '#ef4444' : '#6366f1', fontWeight: 700 }}>
                ({employees.filter(e => empStatusFilter === 'All' || e.status === empStatusFilter).length})
              </span>
            )}
          </label>
          <select className="form-select" value={empStatusFilter} onChange={e => { setEmpStatusFilter(e.target.value); setSelectedEmp(null); setEmpSearch(''); setFilters(f => ({ ...f, employeeId: '' })); }}>
            <option value="Active">🟢 Active</option>
            <option value="Inactive">🔴 Inactive</option>
            <option value="All">All</option>
          </select>
        </div>

        {/* Employee search */}
        <div className={styles.empSearchContainer}>
          <label className="form-label">Employee</label>
          <input
            value={selectedEmp ? selectedEmp.name : empSearch}
            onChange={e => { setEmpSearch(e.target.value); setSelectedEmp(null); setFilters(f => ({ ...f, employeeId: '' })); setShowEmpDrop(true); }}
            onFocus={() => setShowEmpDrop(true)}
            placeholder="Search employee..."
            className="form-input"
          />
          {selectedEmp && (
            <button onClick={() => { setSelectedEmp(null); setEmpSearch(''); setFilters(f => ({ ...f, employeeId: '' })); }}
              className={styles.clearSearchBtn}>×</button>
          )}
          {showEmpDrop && !selectedEmp && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowEmpDrop(false)} />
              <div className={styles.dropdownList}>
                {filteredEmps.length === 0 ? (
                  <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {empStatusFilter === 'Inactive' ? 'No inactive employees found' : 'No employees found'}
                  </div>
                ) : filteredEmps.map(e => (
                  <div key={e._id} onClick={() => { setSelectedEmp(e); setFilters(f => ({ ...f, employeeId: e._id })); setShowEmpDrop(false); setEmpSearch(''); }}
                    className={styles.dropdownItem}>
                    {/* Avatar */}
                    <div className={styles.avatarBox}>
                      {e.profilePhotoUrl ? <img src={e.profilePhotoUrl} alt={e.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : e.name?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b' }}>{e.name}</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.status === 'Active' ? '#22c55e' : '#ef4444', display: 'inline-block', flexShrink: 0 }} title={e.status} />
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{e.employeeId} · {e.department || 'No dept'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <label className="form-label">Status</label>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="form-select">
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="form-label">Month</label>
          <select value={filters.month || ''} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
            className="form-select">
            <option value="">All</option>
            <option value="1">January</option>
            <option value="2">February</option>
            <option value="3">March</option>
            <option value="4">April</option>
            <option value="5">May</option>
            <option value="6">June</option>
            <option value="7">July</option>
            <option value="8">August</option>
            <option value="9">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>
        </div>
        <button className="btn btn--primary" onClick={() => { setPage(1); fetchLeaves(1); }}>
          Filter
        </button>
        {(filters.status || filters.employeeId || filters.month || filters.leaveMode || filters.startDate || filters.endDate) && (
          <button className="btn btn--secondary" onClick={() => { setFilters({ status: '', leaveType: '', employeeId: '', leaveMode: '', month: '', startDate: '', endDate: '' }); setSelectedEmp(null); setEmpSearch(''); setPage(1); setTimeout(() => fetchLeaves(1), 0); }}>
            Clear
          </button>
        )}
      </div>

      {/* Action modal */}
      {actionModal && (
        <div className="modal-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="admin-modal-panel" style={{ maxWidth: '400px' }}>
            <h3 style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.75rem' }}>
              {actionModal.action === 'approve' ? '✅ Approve Leave' : actionModal.action === 'delete' ? '🗑 Delete Leave' : '❌ Reject Leave'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
              {actionModal.action === 'approve'
                ? 'Are you sure you want to approve this leave request?'
                : actionModal.action === 'delete'
                ? `Permanently delete ${actionModal.label}? This cannot be undone.`
                : 'Please provide a reason for rejection (optional).'}
            </p>
            {actionModal.action === 'reject' && (
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                className="form-textarea" style={{ resize: 'none', marginBottom: '1rem' }} />
            )}
            <div className="admin-modal-footer">
              <button className="btn btn--secondary" onClick={() => { setActionModal(null); setRejectReason(''); }}>
                Cancel
              </button>
              <button onClick={handleAction}
                style={{ padding: '0.5rem 1.25rem', background: actionModal.action === 'approve' ? '#22c55e' : actionModal.action === 'delete' ? '#dc2626' : '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                {actionModal.action === 'approve' ? 'Approve' : actionModal.action === 'delete' ? 'Delete' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal modal--md" onClick={e => e.stopPropagation()}>
            <h3 className="modal__title">Edit Leave — {editModal.employeeId?.name || 'Employee'}</h3>
            <div className="d-flex-col" style={{ gap: '0.875rem' }}>
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select className="form-select" value={editForm.leaveType} onChange={e => setEditForm(f => ({ ...f, leaveType: e.target.value }))}>
                  {leaveTypesList.map(lt => <option key={lt.code} value={lt.code}>{lt.name}</option>)}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-input" value={editForm.startDate} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                {editForm.durationType === 'full_day' && (
                  <div className="form-group">
                    <label className="form-label">End Date</label>
                    <input type="date" className="form-input" value={editForm.endDate} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                )}
              </div>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
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
    <div className={styles.tableShell}>
        {loading ? <LoadingSpinner /> : <DataTable columns={columns} data={leaves} hideSearch />}
        {pagination && pagination.pages > 1 && (
          <div className={styles.paginationRow}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={styles.pageBtn}>← Prev</button>
            <span className={styles.pageText}>Page {page} of {pagination.pages} · {pagination.total} records</span>
            <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className={styles.pageBtn}>Next →</button>
          </div>
        )}
      </div>
      </>
  );
}
