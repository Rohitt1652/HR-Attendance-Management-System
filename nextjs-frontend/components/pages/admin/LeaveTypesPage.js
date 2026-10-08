'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType } from '@/api/leaveApi';
import styles from './LeaveTypesPage.module.css';

const EMPTY = { name: '', code: '', color: '#6366f1', allowFullDay: true, allowHourly: false, allowHalfDay: true, maxDaysPerYear: '', requiresApproval: true, isFreeHand: false, visibleToRoles: [] };

const ALL_ROLES = [
  { value: 'employee',  label: 'Employee' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'hr',        label: 'HR' },
  { value: 'admin',     label: 'Admin' },
  { value: 'md',        label: 'MD' },
];

const PRESET_COLORS = ['#6366f1','#ef4444','#22c55e','#f59e0b','#0ea5e9','#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b'];

function TypeForm({ type, onSave, onCancel }) {
  const [form, setForm] = useState(type
    ? { ...type, allowFullDay: type.allowFullDay !== false, maxDaysPerYear: type.maxDaysPerYear ?? '', visibleToRoles: type.visibleToRoles || [], isFreeHand: type.isFreeHand || false }
    : EMPTY);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.code.trim()) return toast.error('Code is required');
    if (!form.allowFullDay && !form.allowHalfDay && !form.allowHourly) return toast.error('Select at least one duration option');
    setSaving(true);
    try {
      const payload = { ...form, maxDaysPerYear: form.maxDaysPerYear === '' ? null : Number(form.maxDaysPerYear) };
      if (type) await updateLeaveType(type._id, payload);
      else await createLeaveType(payload);
      toast.success(type ? 'Leave type updated' : 'Leave type created');
      onSave();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop">
      <div className="admin-modal-panel" style={{ maxWidth: '500px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${form.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', border: `2px solid ${form.color}40` }}>
            <span style={{ fontWeight: 800, color: form.color, fontSize: '0.75rem' }}>{form.code || 'XX'}</span>
          </div>
          <h3 style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>{type ? 'Edit Leave Type' : 'New Leave Type'}</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Name + Code */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.875rem' }}>
            <div>
              <label className="form-label">Leave Type Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sick Leave" />
            </div>
            <div>
              <label className="form-label">Code *</label>
              <input className="form-input font-bold" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().slice(0, 5) }))} placeholder="SL" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }} />
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="form-label">Color</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, border: form.color === c ? '3px solid #1e293b' : '2px solid transparent', cursor: 'pointer', flexShrink: 0, transition: 'transform 0.1s', transform: form.color === c ? 'scale(1.2)' : 'scale(1)' }} />
              ))}
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                style={{ width: '28px', height: '28px', border: 'none', borderRadius: '50%', cursor: 'pointer', padding: 0 }} title="Custom color" />
            </div>
          </div>

          {/* Duration options */}
          <div>
            <label className="form-label" style={{ marginBottom: '0.625rem' }}>Duration Options</label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {[
                { key: 'allowFullDay', label: 'Full Day', desc: 'Allow full day leave' },
                { key: 'allowHalfDay', label: 'Half Day', desc: 'Allow morning/afternoon leave' },
                { key: 'allowHourly', label: 'Hourly', desc: 'Allow time-based leave (e.g. 2 hours)' },
                { key: 'requiresApproval', label: 'Requires Approval', desc: 'Manager must approve' },
              ].map(({ key, label, desc }) => {
                const isChecked = !!form[key];
                return (
                  <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.625rem 0.875rem', borderRadius: '10px', border: `1.5px solid ${isChecked ? form.color : '#e2e8f0'}`, background: isChecked ? `${form.color}08` : '#fff', cursor: 'pointer', flex: '1', minWidth: '140px' }}>
                    <input type="checkbox" checked={isChecked} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                      style={{ accentColor: form.color, marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, color: isChecked ? form.color : '#374151' }}>
                        {label}
                      </p>
                      <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '1px' }}>{desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Note about duration modes */}
          {form.allowHourly && !form.allowHalfDay && (
            <div style={{ padding: '0.625rem 0.875rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.75rem', color: '#1d4ed8' }}>
              Employees will only see the duration options enabled here.
            </div>
          )}

          {/* Role Visibility */}
          <div>
            <label className="form-label">
              Visible To Roles
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '6px' }}>— leave all unchecked to show to everyone</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
              {ALL_ROLES.map(r => {
                const checked = form.visibleToRoles.includes(r.value);
                return (
                  <label key={r.value}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', borderRadius: '20px', border: `1.5px solid ${checked ? form.color : '#e2e8f0'}`, background: checked ? `${form.color}10` : '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: checked ? 700 : 500, color: checked ? form.color : '#374151', transition: 'all 0.12s', userSelect: 'none' }}>
                    <input type="checkbox" checked={checked}
                      onChange={e => setForm(f => ({
                        ...f,
                        visibleToRoles: e.target.checked
                          ? [...f.visibleToRoles, r.value]
                          : f.visibleToRoles.filter(v => v !== r.value),
                      }))}
                      style={{ accentColor: form.color }} />
                    {r.label}
                  </label>
                );
              })}
            </div>
            {form.visibleToRoles.length === 0 && (
              <p style={{ fontSize: '0.68rem', color: '#22c55e', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ✅ Visible to all roles
              </p>
            )}
            {form.visibleToRoles.length > 0 && (
              <p style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                👁 Only visible to: {form.visibleToRoles.map(v => ALL_ROLES.find(r => r.value === v)?.label).join(', ')}
              </p>
            )}
          </div>

          {/* Free Hand (No Quota) */}
          <div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.625rem 0.875rem', borderRadius: '10px', border: `1.5px solid ${form.isFreeHand ? '#14b8a6' : '#e2e8f0'}`, background: form.isFreeHand ? '#f0fdfa' : '#fff', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isFreeHand} onChange={e => setForm(f => ({ ...f, isFreeHand: e.target.checked }))}
                style={{ accentColor: '#14b8a6', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: form.isFreeHand ? '#0d9488' : '#374151' }}>
                  Free Hand (No Quota)
                </p>
                <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '1px' }}>
                  No balance limit. Admin approves each request manually. Shows as &ldquo;∞&rdquo; in dropdown. Use for Compensatory Off, Loss of Pay, etc.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="admin-modal-footer" style={{ marginTop: '1.5rem' }}>
          <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="btn font-bold text-white" style={{ background: form.color, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : type ? 'Update' : 'Create Leave Type'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LeaveTypesPage() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editType, setEditType] = useState(null);

  const fetchTypes = () => {
    getLeaveTypes()
      .then(res => setTypes(res.data.data || []))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTypes(); }, []);

  const handleDisable = async (id) => {
    if (!confirm('Disable this leave type? Employees will no longer be able to apply for it.')) return;
    try { await deleteLeaveType(id); toast.success('Leave type disabled'); fetchTypes(); }
    catch { toast.error('Failed to disable'); }
  };

  const handleEnable = async (id) => {
    try { await updateLeaveType(id, { isActive: true }); toast.success('Leave type enabled'); fetchTypes(); }
    catch { toast.error('Failed to enable'); }
  };

  if (loading) return <div className={styles.loadingState}>Loading...</div>;

  return (
    <div className={`admin-page-stack ${styles.pageContainer}`}>
      {/* Header */}
      <div className="row-between">
        <div>
          <h2 className={styles.pageHeaderTitle}>Leave Types</h2>
          <p className={styles.pageHeaderSubtitle}>{types.filter(t => t.isActive !== false).length} active, {types.filter(t => t.isActive === false).length} disabled</p>
        </div>
        <button className="btn btn--primary" onClick={() => { setEditType(null); setShowForm(true); }}>
          + New Leave Type
        </button>
      </div>

      {/* Cards grid */}
      <div className={styles.cardsGrid}>
        {types.map(lt => (
          <div key={lt._id} className={`card card--sm ${styles.typeCard}`} style={{ border: `1px solid ${lt.isActive === false ? '#fecaca' : '#f0f0f0'}`, opacity: lt.isActive === false ? 0.6 : 1 }}>
            {/* Top row: code + name + actions */}
            <div className={styles.cardHeaderRow}>
              <div className={styles.codeBox} style={{ background: `${lt.color}12` }}>
                <span className={styles.codeText} style={{ color: lt.color }}>{lt.code}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className={styles.typeName} style={{ color: lt.isActive === false ? '#94a3b8' : '#111827' }}>{lt.name}</p>
                <p className={styles.typeSubtitle}>
                  {lt.isActive === false ? '⛔ Disabled' : lt.maxPerMonth ? `${lt.maxPerMonth}×/month` : ''}
                </p>
              </div>
              <div className={styles.iconBtnGroup}>
                <button onClick={() => { setEditType(lt); setShowForm(true); }} title="Edit" className={styles.btnIconEdit}>✏️</button>
                {lt.isActive === false ? (
                  <button onClick={() => handleEnable(lt._id)} title="Enable" className={styles.btnIconEnable}>✅</button>
                ) : (
                  <button onClick={() => handleDisable(lt._id)} title="Disable" className={styles.btnIconDisable}>🗑</button>
                )}
              </div>
            </div>

            {/* Features row — compact inline */}
            <div className={styles.featuresRow}>
              {lt.isFreeHand && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: '#f0fdfa', color: '#0d9488', fontWeight: 600 }}>Free Hand</span>}
              {lt.birthdayOnly && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: '#fdf2f8', color: '#db2777', fontWeight: 600 }}>Birthday Only</span>}
              {lt.allowFullDay !== false && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: '#f3f4f6', color: '#6b7280', fontWeight: 600 }}>Full Day</span>}
              {lt.allowHalfDay && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>Half Day</span>}
              {lt.allowHourly && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>Hourly</span>}
              {lt.requiresApproval && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: '#f3e8ff', color: '#7c3aed', fontWeight: 600 }}>Approval</span>}
              {lt.maxPerMonth && <span style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px', background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>{lt.maxPerMonth}×/mo</span>}
            </div>
            {/* Role visibility */}
            {lt.visibleToRoles?.length > 0 ? (
              <div style={{ marginTop: '0.375rem', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', color: '#f59e0b' }}>👁</span>
                {lt.visibleToRoles.map(r => (
                  <span key={r} style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '3px', background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                    {ALL_ROLES.find(x => x.value === r)?.label || r}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.6rem', color: '#9ca3af', margin: '4px 0 0' }}>All roles</p>
            )}
          </div>
        ))}

        {/* Add new card */}
        <button onClick={() => { setEditType(null); setShowForm(true); }} className={styles.btnAddCard}>
          <span style={{ fontSize: '1.5rem' }}>+</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Add Leave Type</span>
        </button>
      </div>

      {showForm && (
        <TypeForm
          type={editType}
          onSave={() => { setShowForm(false); setEditType(null); fetchTypes(); }}
          onCancel={() => { setShowForm(false); setEditType(null); }}
        />
      )}
    </div>
  );
}
