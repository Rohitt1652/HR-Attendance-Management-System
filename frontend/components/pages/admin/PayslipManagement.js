'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listPayslips, upsertPayslip, publishPayslip, deletePayslip, bulkGeneratePayslips, downloadPayslipPdf } from '@/api/payslipApi';
import { listEmployees } from '@/api/employeeApi';
import styles from './PayslipManagement.module.css';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const inp = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' };

function PayslipForm({ employees, onSave, onCancel }) {
  const now = new Date();
  const [form, setForm] = useState({
    employeeId: '', month: now.getMonth() + 1, year: now.getFullYear(),
    basicSalary: '', hra: '', allowances: '', deductions: '', tax: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const net = (Number(form.basicSalary) || 0) + (Number(form.hra) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0) - (Number(form.tax) || 0);

  const handleSave = async () => {
    if (!form.employeeId) return toast.error('Select an employee');
    setSaving(true);
    try {
      await upsertPayslip({ ...form, basicSalary: Number(form.basicSalary), hra: Number(form.hra), allowances: Number(form.allowances), deductions: Number(form.deductions), tax: Number(form.tax) });
      toast.success('Payslip saved');
      onSave();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop">
      <div className="admin-modal-panel" style={{ maxWidth: '520px' }}>
        <h3 className="modal__title" style={{ marginBottom: '1.25rem' }}>Generate Payslip</h3>
        <div className="d-flex-col" style={{ gap: '0.875rem' }}>
          <div>
            <label className="form-label" style={{ marginBottom: '4px' }}>Employee *</label>
            <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} style={inp}>
              <option value="">— Select Employee —</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
            </select>
          </div>
          <div className="admin-form-grid-2">
            <div>
              <label className="form-label" style={{ marginBottom: '4px' }}>Month</label>
              <select value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) }))} style={inp}>
                {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: '4px' }}>Year</label>
              <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} style={inp} />
            </div>
          </div>
          <div className="admin-form-grid-2">
            {[['Basic Salary', 'basicSalary'], ['HRA', 'hra'], ['Allowances', 'allowances'], ['Deductions', 'deductions'], ['Tax (TDS)', 'tax']].map(([label, key]) => (
              <div key={key}>
                <label className="form-label" style={{ marginBottom: '4px' }}>{label} (₹)</label>
                <input type="number" min="0" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp} placeholder="0" />
              </div>
            ))}
          </div>
          <div className={styles.netSalaryBox}>
            <span className={styles.netSalaryLabel}>Net Salary</span>
            <span className={styles.netSalaryValue}>₹{net.toLocaleString()}</span>
          </div>
          <div>
            <label className="form-label" style={{ marginBottom: '4px' }}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, resize: 'none' }} />
          </div>
        </div>
        <div className="admin-modal-footer">
          <button onClick={onCancel} className="btn btn--secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn btn--primary" style={{ cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Payslip'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PayslipManagement() {
  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewPayslip, setViewPayslip] = useState(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [filters, setFilters] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: '' });

  const fetchPayslips = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;
      if (filters.status) params.status = filters.status;
      const res = await listPayslips(params);
      setPayslips(res.data.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchPayslips();
    listEmployees({ status: 'Active' }).then(res => setEmployees(res.data.data || [])).catch(() => {});
  }, []);

  const handlePublish = async (id) => {
    try { await publishPayslip(id); toast.success('Payslip published'); fetchPayslips(); }
    catch { toast.error('Failed to publish'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this payslip?')) return;
    try { await deletePayslip(id); toast.success('Deleted'); fetchPayslips(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleBulkGenerate = async () => {
    if (!filters.month || !filters.year) return toast.error('Select month and year first');
    if (!confirm(`Generate payslips for ALL active employees for ${MONTHS[filters.month]} ${filters.year}? Existing payslips will be skipped.`)) return;
    setBulkGenerating(true);
    try {
      const res = await bulkGeneratePayslips({ month: parseInt(filters.month), year: parseInt(filters.year) });
      const { created, skipped, errors } = res.data.data;
      toast.success(`✅ Created: ${created} · Skipped: ${skipped}${errors.length ? ` · Errors: ${errors.length}` : ''}`);
      fetchPayslips();
    } catch (err) { toast.error(err.response?.data?.message || 'Bulk generate failed'); }
    finally { setBulkGenerating(false); }
  };

  const handlePublishAll = async () => {
    const drafts = payslips.filter(p => p.status === 'Draft');
    if (!drafts.length) return toast.error('No draft payslips to publish');
    if (!confirm(`Publish all ${drafts.length} draft payslips? Employees will be able to see them.`)) return;
    try {
      await Promise.all(drafts.map(p => publishPayslip(p._id)));
      toast.success(`Published ${drafts.length} payslips`);
      fetchPayslips();
    } catch { toast.error('Some payslips failed to publish'); }
  };

  const selInp = { padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' };

  return (
    <div className="admin-page-stack">
      <div className="admin-header">
        <div>
          <h2 className="section-title">Payslip Management</h2>
          <p className="section-subtitle" style={{ marginTop: '4px' }}>{payslips.length} payslips</p>
        </div>
        <div className="admin-actions">
          <button onClick={handleBulkGenerate} disabled={bulkGenerating}
            className={bulkGenerating ? styles.btnBulkGenerateDisabled : styles.btnBulkGenerate}>
            ⚡ {bulkGenerating ? 'Generating...' : 'Bulk Generate'}
          </button>
          {payslips.some(p => p.status === 'Draft') && (
            <button onClick={handlePublishAll} className={styles.btnPublishAll}>
              📤 Publish All Drafts
            </button>
          )}
          <button onClick={() => setShowForm(true)} className={styles.btnSinglePayslip}>
            + Single Payslip
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div>
          <label className="admin-filter-label">Month</label>
          <select value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))} style={selInp}>
            <option value="">All</option>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="admin-filter-label">Year</label>
          <input type="number" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} style={{ ...selInp, width: '90px' }} />
        </div>
        <div>
          <label className="admin-filter-label">Status</label>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={selInp}>
            <option value="">All</option>
            <option value="Draft">Draft</option>
            <option value="Published">Published</option>
          </select>
        </div>
        <button onClick={fetchPayslips} className={styles.btnFilter}>Filter</button>
      </div>

      {/* Table */}
      <div className="admin-table-shell">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : payslips.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💰</p>
            <p>No payslips found</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Employee', 'Period', 'Net Salary', 'Present Days', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payslips.map((p, i) => (
                <tr key={p._id} className="admin-table-row" style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td className="admin-table-cell">
                    <p style={{ fontWeight: 600, color: '#1e293b' }}>{p.employeeId?.name}</p>
                    <p style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{p.employeeId?.department}</p>
                  </td>
                  <td className="admin-table-cell text-body-clr">{MONTHS[p.month]} {p.year}</td>
                  <td className="admin-table-cell font-bold text-primary-clr">₹{p.netSalary.toLocaleString()}</td>
                  <td className="admin-table-cell text-body-clr">{p.presentDays} / {p.workingDays}</td>
                  <td className="admin-table-cell">
                    <span className={p.status === 'Published' ? styles.statusPublished : styles.statusDraft}>
                      {p.status}
                    </span>
                  </td>
                  <td className="admin-table-cell">
                    <div className="admin-row-actions">
                      <button onClick={() => setViewPayslip(p)} className={styles.btnActionView}>👁 View</button>
                      <button onClick={async () => {
                        try {
                          const res = await downloadPayslipPdf(p._id);
                          const url = window.URL.createObjectURL(new Blob([res.data]));
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `payslip_${p.employeeId?.employeeId || ''}_${p.month}_${p.year}.pdf`;
                          a.click();
                          window.URL.revokeObjectURL(url);
                        } catch { toast.error('Failed to download PDF'); }
                      }} className={styles.btnActionPdf}>📄 PDF</button>
                      {p.status === 'Draft' && (
                        <button onClick={() => handlePublish(p._id)} className={styles.btnActionPublish}>Publish</button>
                      )}
                      <button onClick={() => handleDelete(p._id)} className={styles.btnActionDelete}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <PayslipForm employees={employees} onSave={() => { setShowForm(false); fetchPayslips(); }} onCancel={() => setShowForm(false)} />}

      {/* View Payslip Modal */}
      {viewPayslip && (
        <div className="modal-backdrop">
          <div className="admin-modal-panel" style={{ maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div className="row-between" style={{ marginBottom: '1.25rem' }}>
              <h3 className="modal__title" style={{ margin: 0 }}>Payslip Details</h3>
              <button onClick={() => setViewPayslip(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#64748b', fontSize: '1rem' }}>✕</button>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
              <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', margin: '0 0 4px' }}>{viewPayslip.employeeId?.name}</p>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>{viewPayslip.employeeId?.employeeId} · {viewPayslip.employeeId?.department} · {viewPayslip.employeeId?.designation}</p>
            </div>

            <div className="d-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '0.75rem' }}>
                <p style={{ fontSize: '15px', color: '#16a34a', fontWeight: 600, margin: 0 }}>GROSS SALARY</p>
                <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#166534', margin: '4px 0 0' }}>₹{((viewPayslip.basicSalary || 0) + (viewPayslip.hra || 0) + (viewPayslip.allowances || 0)).toLocaleString()}</p>
              </div>
              <div style={{ background: '#eef2ff', borderRadius: 10, padding: '0.75rem' }}>
                <p style={{ fontSize: '15px', color: '#6366f1', fontWeight: 600, margin: 0 }}>NET SALARY</p>
                <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4338ca', margin: '4px 0 0' }}>₹{(viewPayslip.netSalary || 0).toLocaleString()}</p>
              </div>
            </div>

            <table className="admin-table">
              <tbody>
                {[
                  ['Basic Salary', viewPayslip.basicSalary],
                  ['HRA', viewPayslip.hra],
                  ['Allowances', viewPayslip.allowances],
                  ['Deductions', viewPayslip.deductions],
                  ['Tax (TDS)', viewPayslip.tax],
                ].map(([label, val]) => (
                  <tr key={label} className="admin-table-row">
                    <td style={{ padding: '0.5rem 0', color: '#64748b' }}>{label}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>₹{(val || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="d-grid" style={{ marginTop: '1rem', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
              <div style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '0.5rem' }}>
                <p style={{ color: '#94a3b8', margin: 0 }}>Working Days</p>
                <p style={{ fontWeight: 700, color: '#1e293b', margin: '2px 0 0' }}>{viewPayslip.workingDays || 0}</p>
              </div>
              <div style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '0.5rem' }}>
                <p style={{ color: '#94a3b8', margin: 0 }}>Present</p>
                <p style={{ fontWeight: 700, color: '#22c55e', margin: '2px 0 0' }}>{viewPayslip.presentDays || 0}</p>
              </div>
              <div style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '0.5rem' }}>
                <p style={{ color: '#94a3b8', margin: 0 }}>Leave</p>
                <p style={{ fontWeight: 700, color: '#f59e0b', margin: '2px 0 0' }}>{viewPayslip.leaveDays || 0}</p>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button onClick={() => setViewPayslip(null)} className="btn btn--secondary">Close</button>
              <button onClick={async () => {
                try {
                  const res = await downloadPayslipPdf(viewPayslip._id);
                  const url = window.URL.createObjectURL(new Blob([res.data]));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `payslip_${viewPayslip.employeeId?.employeeId || ''}_${viewPayslip.month}_${viewPayslip.year}.pdf`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                } catch { toast.error('Failed to download PDF'); }
              }}
                style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                📄 Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
