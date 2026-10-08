'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listDepartments, createDepartment, updateDepartment, updateDepartmentStatus } from '@/api/departmentApi';
import { listEmployees } from '@/api/employeeApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';

export default function DepartmentsPage() {
  const { user } = useAuth();
  const permissions = user?.permissions || [];
  const canView = permissions.includes('departments:view');
  const canCreate = permissions.includes('departments:create');
  const canEdit = permissions.includes('departments:edit');
  const canManageStatus = permissions.includes('departments:delete') || permissions.includes('departments:manage-status');
  const hasActions = canEdit || canManageStatus;
  const [departments, setDepartments] = useState([]);
  const [teamLeads, setTeamLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', dept }
  const [form, setForm] = useState({ name: '', description: '', teamLeaderId: '', status: 'active' });
  const [saving, setSaving] = useState(false);

  const fetchData = () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    listDepartments().then(r => setDepartments(r.data.data || [])).catch((err) => {
      if (err.response?.status === 403) toast.error('You do not have permission to view departments');
      else toast.error('Failed to load');
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
    if (canCreate || canEdit) {
      listEmployees({ role: 'team_lead', status: 'Active', limit: 100 }).then(r => setTeamLeads(r.data.data || [])).catch(() => {});
    }
  }, [user, canView, canCreate, canEdit]);

  const openCreate = () => {
    setForm({ name: '', description: '', teamLeaderId: '', status: 'active' });
    setModal({ mode: 'create' });
  };

  const openEdit = (dept) => {
    setForm({ name: dept.name, description: dept.description || '', teamLeaderId: dept.teamLeaderId?._id || dept.teamLeaderId || '', status: dept.status });
    setModal({ mode: 'edit', dept });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Department name is required');
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await createDepartment({ ...form, teamLeaderId: form.teamLeaderId || null });
        toast.success('Department created');
      } else {
        await updateDepartment(modal.dept._id, {
          name: form.name,
          description: form.description,
          teamLeaderId: form.teamLeaderId || null,
        });
        toast.success('Department updated');
      }
      setModal(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (dept) => {
    const nextStatus = dept.status === 'active' ? 'inactive' : 'active';
    const label = nextStatus === 'active' ? 'Activate' : 'Deactivate';
    if (!confirm(`${label} "${dept.name}"? Employees will keep their department.`)) return;
    try {
      await updateDepartmentStatus(dept._id, nextStatus);
      toast.success(nextStatus === 'active' ? 'Department activated' : 'Department deactivated');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  if (loading) return <LoadingSpinner />;

  if (!canView) {
    return (
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem' }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', margin: 0 }}>Departments</h2>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>You do not have permission to view departments.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#111827', margin: 0 }}>Departments</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '3px' }}>{departments.length} departments</p>
        </div>
        {canCreate && (
          <button onClick={openCreate}
            style={{ padding: '0.6rem 1.25rem', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
            + New Department
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Department</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Team Leader</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Employees</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
              {hasActions && <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {departments.map(dept => (
              <tr key={dept._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <p style={{ fontWeight: 600, color: '#111827', margin: 0 }}>{dept.name}</p>
                  {dept.description && <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '2px 0 0' }}>{dept.description}</p>}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {dept.teamLeader ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                        {dept.teamLeader.profilePhotoUrl ? <img src={dept.teamLeader.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : dept.teamLeader.name?.[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#374151' }}>{dept.teamLeader.name}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Not assigned</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{dept.employeeCount || 0}</span>
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, background: dept.status === 'active' ? '#dcfce7' : '#fee2e2', color: dept.status === 'active' ? '#166534' : '#991b1b' }}>
                    {dept.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {hasActions && (
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                      {canEdit && (
                        <button onClick={() => openEdit(dept)}
                          style={{ padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                      )}
                      {canManageStatus && (
                        <button onClick={() => handleStatusChange(dept)}
                          style={{ padding: '4px 10px', background: dept.status === 'active' ? '#fef2f2' : '#ecfdf5', color: dept.status === 'active' ? '#dc2626' : '#047857', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                          {dept.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }} onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', margin: '0 0 1.25rem' }}>
              {modal.mode === 'create' ? 'New Department' : 'Edit Department'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>Department Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="Optional description" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>Team Leader</label>
                <select value={form.teamLeaderId} onChange={e => setForm(f => ({ ...f, teamLeaderId: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="">No Team Leader</option>
                  {teamLeads.map(tl => <option key={tl._id} value={tl._id}>{tl.name} — {tl.department || 'N/A'}</option>)}
                </select>
              </div>
              {modal.mode === 'create' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setModal(null)} style={{ padding: '0.5rem 1rem', background: '#f3f4f6', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : modal.mode === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
