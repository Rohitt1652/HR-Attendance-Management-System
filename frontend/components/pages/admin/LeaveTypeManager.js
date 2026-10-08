'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType } from '@/api/leaveApi';
import styles from './LeaveTypeManager.module.css';

const EMPTY = { name: '', code: '', color: '#6366f1', allowHourly: false, allowHalfDay: true, maxDaysPerYear: '', requiresApproval: true };

export default function LeaveTypeManager() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchTypes = async () => {
    try { const res = await getLeaveTypes(); setTypes(res.data.data); }
    catch { toast.error('Failed to load leave types'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTypes(); }, []);

  const startEdit = (lt) => {
    setForm({ ...lt, maxDaysPerYear: lt.maxDaysPerYear ?? '' });
    setEditing(lt._id);
  };

  const startNew = () => {
    setForm(EMPTY);
    setEditing('new');
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return toast.error('Name and code are required');
    setSaving(true);
    try {
      const payload = { ...form, maxDaysPerYear: form.maxDaysPerYear === '' ? null : Number(form.maxDaysPerYear) };
      if (editing === 'new') {
        await createLeaveType(payload);
        toast.success('Leave type created');
      } else {
        await updateLeaveType(editing, payload);
        toast.success('Leave type updated');
      }
      setEditing(null);
      fetchTypes();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await deleteLeaveType(id); toast.success('Leave type deactivated'); fetchTypes(); }
    catch { toast.error('Failed to deactivate'); }
  };

  if (loading) return <div className={styles.loading}>Loading leave types...</div>;

  return (
    <div className={styles.manager}>
      <div className="row-between">
        <h3 className={styles.heading}>Leave Types</h3>
        <button onClick={startNew} className={styles.addButton}>+ Add Type</button>
      </div>

      {/* Type list */}
      <div className={styles.typeList}>
        {types.map(lt => (
          <div key={lt._id} className={styles.typeRow}>
            <div className={styles.codeBadge} style={{ background: lt.color }}>{lt.code}</div>
            <div className={styles.typeDetails}>
              <p className={styles.typeName}>{lt.name}</p>
              <div className={styles.badges}>
                {lt.allowHourly && <span className={`${styles.badge} ${styles.hourlyBadge}`}>Hourly ✓</span>}
                {lt.allowHalfDay && <span className={`${styles.badge} ${styles.halfDayBadge}`}>Half-day ✓</span>}
                {lt.maxDaysPerYear && <span className={`${styles.badge} ${styles.limitBadge}`}>Max {lt.maxDaysPerYear}d/yr</span>}
              </div>
            </div>
            <div className={styles.rowActions}>
              <button onClick={() => startEdit(lt)} className={`${styles.smallButton} ${styles.editButton}`}>Edit</button>
              <button onClick={() => handleDelete(lt._id)} className={`${styles.smallButton} ${styles.disableButton}`}>Disable</button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create form */}
      {editing && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>{editing === 'new' ? 'New Leave Type' : 'Edit Leave Type'}</h3>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sick Leave" className={styles.input} />
              </div>
              <div>
                <label className={styles.label}>Code</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SL" maxLength={5} className={styles.input} />
              </div>
              <div>
                <label className={styles.label}>Color</label>
                <div className={styles.colorRow}>
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className={styles.colorInput} />
                  <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className={`${styles.input} ${styles.colorTextInput}`} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Max Days/Year</label>
                <input type="number" value={form.maxDaysPerYear} onChange={e => setForm(f => ({ ...f, maxDaysPerYear: e.target.value }))} placeholder="Unlimited" className={styles.input} />
              </div>
            </div>
            <div className={styles.checkboxGroup}>
              {[['allowHalfDay', 'Allow Half Day'], ['allowHourly', 'Allow Hourly'], ['requiresApproval', 'Requires Approval']].map(([key, label]) => (
                <label key={key} className={styles.checkboxLabel}>
                  <input type="checkbox" checked={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} className={styles.checkbox} />
                  {label}
                </label>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setEditing(null)} className={styles.cancelButton}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className={styles.saveButton}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
