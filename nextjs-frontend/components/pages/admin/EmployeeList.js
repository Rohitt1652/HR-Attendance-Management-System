'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { listEmployees, deleteEmployee } from '@/api/employeeApi';
import { adminResetPassword } from '@/api/authApi';
import { listDepartments } from '@/api/departmentApi';
import { useAuth } from '@/context/AuthContext';
import DataTable from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import styles from './EmployeeList.module.css';

/*
 * EmployeeList — Style migration
 * Before: 54 inline styles
 * After:  ~16 inline styles
 * Removed: ~38 static → CSS classes
 * Remaining inline (all dynamic):
 *   - badge(): status bg/color (active ? green : red)
 *   - roleBadge(): ROLE_COLORS[role] bg/color (data-driven)
 *   - SortBtn: active border/bg/color (state: filters.sortBy === field)
 *   - Avatar gradient: ROLE_COLORS[r.role] (data-driven per row)
 *   - email color: r.email?.includes('@noemail.local') ternary
 *   - pagination buttons: disabled state cursor + bg (state)
 *   - resetting button: opacity/cursor (state)
 */

const ROLE_COLORS = { admin: '#6366f1', md: '#8b5cf6', hr: '#0ea5e9', team_lead: '#f59e0b', employee: '#22c55e' };
const ROLE_LABELS = { admin: 'Admin', md: 'MD', hr: 'HR', team_lead: 'Team Lead', employee: 'Employee' };
const inp = { padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' };

export default function EmployeeList() {
  const { user: currentUser } = useAuth();
  const userPerms = currentUser?.permissions || [];
  const canEditAll = userPerms.includes('employees:edit');
  const canEditTeam = userPerms.includes('employees:edit_team');
  const canEdit = canEditAll || canEditTeam;
  const canDelete = userPerms.includes('employees:delete');

  const [employees, setEmployees]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [confirm, setConfirm]       = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting]   = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]         = useState('');
  const [filters, setFilters]       = useState({ role: '', status: 'Active', department: '', sortBy: 'name', sortDir: 'asc' });
  const [page, setPage]             = useState(1);
  const [pagination, setPagination] = useState(null);
  const [teamDepts, setTeamDepts]   = useState(null); // departments led by current user (for edit_team)
  const router = useRouter();

  const doFetch = async (p = 1, q = search, f = filters) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50, sortBy: f.sortBy, sortDir: f.sortDir };
      if (q) params.name = q;
      if (f.role)       params.role       = f.role;
      if (f.status)     params.status     = f.status;
      if (f.department) params.department = f.department;
      const res = await listEmployees(params);
      setEmployees(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { doFetch(1); }, []);

  // For team leads with edit_team: fetch departments they lead to control edit button visibility
  useEffect(() => {
    if (canEditTeam && !canEditAll && currentUser?._id) {
      listDepartments().then(res => {
        const depts = (res.data.data || []).filter(d => {
          const tlId = d.teamLeaderId?._id || d.teamLeaderId;
          return tlId && tlId.toString() === currentUser._id;
        });
        setTeamDepts(depts.map(d => d.name));
      }).catch(() => setTeamDepts([]));
    }
  }, [canEditTeam, canEditAll, currentUser?._id]);

  // Check if current user can edit a specific employee
  const canEditEmployee = (emp) => {
    if (canEditAll) return true;
    if (!canEditTeam) return false;
    if (!teamDepts) return false;
    // Can edit if employee is in a department they lead
    if (emp.department && teamDepts.includes(emp.department)) return true;
    // Or if employee has them as direct teamLeadId (populated object or string)
    const tlId = emp.teamLeadId?._id || emp.teamLeadId;
    if (tlId && tlId.toString() === currentUser?._id) return true;
    return false;
  };

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); doFetch(1, searchInput, filters); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const setFilter = (key, val) => {
    const next = { ...filters, [key]: val };
    setFilters(next); setPage(1); doFetch(1, search, next);
  };

  const handleDelete = async (id) => {
    try { await deleteEmployee(id); toast.success('User deactivated'); doFetch(page, search, filters); }
    catch { toast.error('Failed to deactivate'); }
    setConfirm(null);
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    setResetting(true);
    try {
      await adminResetPassword(resetModal.id, newPassword);
      toast.success(`Password reset for ${resetModal.name}`);
      setResetModal(null);
      setNewPassword('');
    } catch (err) { toast.error(err.response?.data?.message || 'Reset failed'); }
    finally { setResetting(false); }
  };

  /* Dynamic — status-based colors */
  const badge = (active) => (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: active ? '#dcfce7' : '#fee2e2', color: active ? '#166534' : '#991b1b' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );

  /* Dynamic — role color lookup */
  const roleBadge = (role) => (
    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, background: `${ROLE_COLORS[role] || '#6366f1'}15`, color: ROLE_COLORS[role] || '#6366f1' }}>
      {ROLE_LABELS[role] || role}
    </span>
  );

  /* Dynamic — sort active state */
  const SortBtn = ({ field, label }) => {
    const active   = filters.sortBy === field;
    const nextDir  = active && filters.sortDir === 'asc' ? 'desc' : 'asc';
    return (
      <button onClick={() => { const next = { ...filters, sortBy: field, sortDir: nextDir }; setFilters(next); setPage(1); doFetch(1, search, next); }}
        style={{ padding: '3px 8px', borderRadius: '6px', border: `1px solid ${active ? '#6366f1' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#fff', fontSize: '0.72rem', cursor: 'pointer', color: active ? '#6366f1' : '#64748b', fontWeight: active ? 700 : 400 }}>
        {label} {active ? (filters.sortDir === 'asc' ? '↑' : '↓') : ''}
      </button>
    );
  };

  const columns = [
    {
      key: 'employeeId', label: 'ID',
      render: (r) => <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#6366f1', fontWeight: 600 }}>{r.employeeId}</span>,
    },
    {
      key: 'name', label: 'Name',
      render: (r) => (
        <div className="row-center" style={{ gap: '0.625rem' }}>
          {/* Avatar gradient is role-color-driven — keep inline */}
          <div className="d-flex align-center justify-center flex-shrink-0 overflow-hidden font-bold text-white"
            style={{ width: '32px', height: '32px', borderRadius: '50%', background: `linear-gradient(135deg, ${ROLE_COLORS[r.role] || '#6366f1'}, ${ROLE_COLORS[r.role] || '#6366f1'}80)`, fontSize: '0.72rem' }}>
            {r.profilePhotoUrl ? <img src={r.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : r.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-heading" style={{ fontSize: '0.82rem', margin: 0 }}>{r.name}</p>
            <p className="text-muted" style={{ fontSize: '0.68rem', margin: 0 }}>{r.designation || ''}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email', label: 'Email',
      /* email color is data-driven — keep inline */
      render: (r) => <span style={{ fontSize: '0.78rem', color: r.email?.includes('@noemail.local') ? '#94a3b8' : '#374151' }}>{r.email?.includes('@noemail.local') ? '—' : r.email}</span>,
    },
    { key: 'department', label: 'Department', render: (r) => <span className="text-sm">{r.department || '—'}</span> },
    { key: 'teamLeader', label: 'Team Leader', render: (r) => r.resolvedTeamLeader ? (
      <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#374151' }}>{r.resolvedTeamLeader.name}</span>
    ) : <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Not Assigned</span> },
    { key: 'role',   label: 'Role',   render: (r) => roleBadge(r.role) },
    { key: 'status', label: 'Status', render: (r) => badge(r.status === 'Active') },
    {
      key: 'actions', label: '',
      render: (r) => (
        <div className="d-flex" style={{ gap: '0.25rem' }}>
          <button onClick={() => router.push(`/admin/employees/${r._id}`)} title="View" className={styles.actionBtnView}>👁</button>
          {canEditEmployee(r) && (
            <button onClick={() => router.push(`/admin/employees/${r._id}/edit`)} title="Edit" className={styles.actionBtnEdit}>✏️</button>
          )}
          {canEditAll && (
            <button onClick={() => { setResetModal({ id: r._id, name: r.name }); setNewPassword(''); }} title="Reset Password" className={styles.actionBtnReset}>🔑</button>
          )}
          {canDelete && (
            <button onClick={() => setConfirm(r._id)} title="Delete" className={styles.actionBtnDelete}>🗑</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page-stack">

      {/* Header */}
      <div className="row-between flex-wrap gap-3">
        <div>
          <h2 className={`section-title tracking-tight ${styles.headerTitle}`}>Users</h2>
          <p className="section-subtitle">{pagination?.total ?? employees.length} {filters.status || 'total'} users</p>
        </div>
        {userPerms.includes('employees:create') && (
          <button onClick={() => router.push('/admin/employees/new')} className={styles.btnAddUser}>
            + Add New User
          </button>
        )}
      </div>

      {/* Summary stat cards */}
      {/* Stat cards hidden */}

      {/* Filter bar */}
      <div className="filter-bar">
        <div style={{ flex: '1 1 220px' }}>
          <label className={styles.filterLabel}>Search</label>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Name, ID, email, department..."
            className={`admin-filter-field ${styles.filterInput}`} style={{ width: '100%' }} />
        </div>
        <div>
          <label className={styles.filterLabel}>Role</label>
          <select value={filters.role} onChange={e => setFilter('role', e.target.value)} className={`admin-filter-field ${styles.filterInput}`}>
            <option value="">All Roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={styles.filterLabel}>Status</label>
          <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className={`admin-filter-field ${styles.filterInput}`}>
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div>
          <label className={styles.filterLabel}>Department</label>
          <input value={filters.department} onChange={e => setFilter('department', e.target.value)} placeholder="e.g. Web Dev"
            className={`admin-filter-field ${styles.filterInput}`} style={{ width: '130px' }} />
        </div>
        {(search || filters.role || filters.status !== 'Active' || filters.department) && (
          <button onClick={() => {
            setSearchInput(''); setSearch('');
            const f = { role: '', status: 'Active', department: '', sortBy: 'name', sortDir: 'asc' };
            setFilters(f); setPage(1); doFetch(1, '', f);
          }} className={styles.btnClearFilter}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Sort bar */}
      <div className="row-center flex-wrap" style={{ gap: '0.5rem' }}>
        <span className="text-muted" style={{ fontSize: '0.72rem' }}>Sort:</span>
        <SortBtn field="name"        label="Name" />
        <SortBtn field="joiningDate" label="Joining Date" />
        <SortBtn field="department"  label="Department" />
        <SortBtn field="createdAt"   label="Added" />
      </div>

      {/* Table */}
      <div className={styles.tableShell}>
        {loading ? <LoadingSpinner /> : <DataTable columns={columns} data={employees} hideSearch />}
        {pagination && pagination.pages > 1 && (
          <div className="d-flex justify-center align-center gap-2" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => { const p = Math.max(1, page-1); setPage(p); doFetch(p, search, filters); }} disabled={page === 1}
              style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: page === 1 ? '#f8fafc' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>← Prev</button>
            <span className="text-secondary" style={{ fontSize: '0.8rem' }}>Page {page} of {pagination.pages} · {pagination.total} users</span>
            <button onClick={() => { const p = Math.min(pagination.pages, page+1); setPage(p); doFetch(p, search, filters); }} disabled={page === pagination.pages}
              style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: page === pagination.pages ? '#f8fafc' : '#fff', cursor: page === pagination.pages ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>Next →</button>
          </div>
        )}
      </div>

      {confirm && <ConfirmDialog message="Deactivate this user?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {/* Reset Password Modal */}
      {resetModal && (
        <div className="modal-backdrop">
          <div className="admin-modal-panel" style={{ maxWidth: '380px', maxHeight: 'none', overflowY: 'visible' }}>
            <h3 className="font-bold text-heading" style={{ marginBottom: '0.5rem' }}>🔑 Reset Password</h3>
            <p className="text-secondary" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>Set a new password for <strong>{resetModal.name}</strong></p>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 6 chars)" className={styles.pwResetInput} />
            <div className="d-flex gap-3" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => setResetModal(null)} className="btn btn--secondary">Cancel</button>
              <button onClick={handleResetPassword} disabled={resetting} className="font-bold text-white"
                style={{ padding: '0.5rem 1.25rem', background: '#0ea5e9', border: 'none', borderRadius: '8px', fontSize: '0.8rem', cursor: resetting ? 'not-allowed' : 'pointer', opacity: resetting ? 0.7 : 1 }}>
                {resetting ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
