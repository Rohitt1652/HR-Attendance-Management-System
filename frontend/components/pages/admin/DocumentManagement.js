'use client';
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getAllDocuments, uploadForEmployee, uploadForEmployeeMultiple, verifyDocument, rejectDocument, deleteDocument } from '@/api/documentApi';
import { listEmployees } from '@/api/employeeApi';
import { listDepartments } from '@/api/departmentApi';
import { useAuth } from '@/context/AuthContext';
import styles from './DocumentManagement.module.css';

/*
 * DocumentManagement — Style migration
 * Before: 85 inline styles
 * After:  ~48 inline styles
 * Removed: ~37 static styles → CSS classes
 * Remaining inline (all dynamic):
 *   - STATUS_STYLE[doc.status].bg/color (data-driven per row)
 *   - catColor = CAT_COLORS[doc.category] (data-driven)
 *   - i % 2 row stripe
 *   - uploading state cursor/opacity on submit button
 *   - form.color on Save Team button (team form)
 *   - File upload disabled state
 */

const CATEGORIES = ['Identity', 'Education', 'Experience', 'Contract', 'Medical', 'Tax', 'Other'];
const STATUS_STYLE = {
  Pending:  { bg: '#fef9c3', color: '#854d0e' },
  Verified: { bg: '#dcfce7', color: '#166534' },
  Rejected: { bg: '#fee2e2', color: '#991b1b' },
};
const CAT_COLORS = {
  Identity: '#6366f1', Education: '#0ea5e9', Experience: '#f59e0b',
  Contract: '#22c55e', Medical: '#ef4444', Tax: '#8b5cf6', Other: '#64748b',
};
const FILE_ICONS = {
  'application/pdf': '📄', 'image/jpeg': '🖼️', 'image/png': '🖼️',
  'application/msword': '📝', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
};
const getIcon = (mime) => FILE_ICONS[mime] || '📁';

export default function DocumentManagement() {
  const { user: currentUser } = useAuth();
  const userPerms = currentUser?.permissions || [];
  const hasFullEdit = userPerms.includes('employees:edit');

  const [docs, setDocs]           = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState({ status: '', category: '', employeeId: '' });
  const [showUpload, setShowUpload]   = useState(false);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm]   = useState({ employeeId: '' });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status)     params.status     = filters.status;
      if (filters.category)   params.category   = filters.category;
      if (filters.employeeId) params.employeeId = filters.employeeId;
      const res = await getAllDocuments(params);
      setDocs(res.data.data || []);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchDocs();
    // Load employees, then filter for team leads
    listEmployees({ status: 'Active' }).then(async (res) => {
      let emps = res.data.data || [];
      // Team leads only see their team members in the dropdown
      const perms = currentUser?.permissions || [];
      const fullEdit = perms.includes('employees:edit');
      if (!fullEdit && !['admin', 'md', 'hr'].includes(currentUser?.role) && currentUser?._id) {
        try {
          const deptRes = await listDepartments();
          const depts = (deptRes.data.data || []).filter(d => {
            const tlId = d.teamLeaderId?._id || d.teamLeaderId;
            return tlId && tlId.toString() === currentUser._id;
          });
          const teamDeptNames = depts.map(d => d.name);
          emps = emps.filter(e => teamDeptNames.includes(e.department) || e._id === currentUser._id);
        } catch {}
      }
      setEmployees(emps);
    }).catch(() => {});
  }, [currentUser?._id]);

  const handleVerify = async (id) => {
    try { await verifyDocument(id); toast.success('Document verified'); fetchDocs(); }
    catch { toast.error('Failed to verify'); }
  };

  const handleReject = async () => {
    try { await rejectDocument(rejectModal, rejectReason); toast.success('Document rejected'); setRejectModal(null); setRejectReason(''); fetchDocs(); }
    catch { toast.error('Failed to reject'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document?')) return;
    try { await deleteDocument(id); toast.success('Deleted'); fetchDocs(); }
    catch { toast.error('Cannot delete'); }
  };

  const handleFilesSelected = (e) => {
    const selected = Array.from(e.target.files);
    const newFiles = selected.map(f => ({ file: f, title: f.name.replace(/\.[^/.]+$/, ''), category: 'Other' }));
    setFiles(prev => [...prev, ...newFiles]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile       = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const updateFileField  = (idx, field, value) => setFiles(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!form.employeeId) return toast.error('Please select an employee');
    if (files.length === 0) return toast.error('Please select at least one file');
    if (files.some(f => !f.title.trim())) return toast.error('All files need a title');
    setUploading(true);
    try {
      if (files.length === 1) {
        const fd = new FormData();
        fd.append('file', files[0].file);
        fd.append('title', files[0].title);
        fd.append('category', files[0].category);
        await uploadForEmployee(form.employeeId, fd);
      } else {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f.file));
        fd.append('titles', JSON.stringify(files.map(f => f.title)));
        fd.append('categories', JSON.stringify(files.map(f => f.category)));
        await uploadForEmployeeMultiple(form.employeeId, fd);
      }
      toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
      setShowUpload(false);
      setForm({ employeeId: '' });
      setFiles([]);
      fetchDocs();
    } catch (err) { toast.error(err.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const inp    = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' };
  const selInp = { padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' };

  return (
    <div className={styles.pageContainer}>

      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Employee Documents</h2>
          <p className={styles.pageSubtitle}>{docs.length} total documents</p>
        </div>
        <button onClick={() => setShowUpload(true)} className={styles.btnUpload}>
          + Upload for Employee
        </button>
      </div>

      {/* Status stat cards — bg/color data-driven */}
      <div className={styles.statsGrid}>
        {[
          { label: 'Pending Review', count: docs.filter(d => d.status === 'Pending').length,  ...STATUS_STYLE.Pending  },
          { label: 'Verified',       count: docs.filter(d => d.status === 'Verified').length, ...STATUS_STYLE.Verified },
          { label: 'Rejected',       count: docs.filter(d => d.status === 'Rejected').length, ...STATUS_STYLE.Rejected },
        ].map(s => (
          <div key={s.label} className={styles.statCard} style={{ background: s.bg, border: `1px solid ${s.color}30` }}>
            <p className={styles.statVal} style={{ color: s.color }}>{s.count}</p>
            <p className={styles.statLabel}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Employee</label>
          <select value={filters.employeeId} onChange={e => setFilters(f => ({ ...f, employeeId: e.target.value }))} className={styles.filterSelect}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Status</label>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className={styles.filterSelect}>
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Category</label>
          <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} className={styles.filterSelect}>
            <option value="">All</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={fetchDocs} className={styles.btnFilter}>
          Filter
        </button>
      </div>

      {/* Document list */}
      <div className={styles.tableCard}>
        {loading ? (
          <div className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : docs.length === 0 ? (
          <div className="text-muted" style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</p>
            <p>No documents found</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {['Document', 'Employee', 'Category', 'Uploaded', 'Status', 'Actions'].map(h => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => {
                const st       = STATUS_STYLE[doc.status];
                const catColor = CAT_COLORS[doc.category] || '#64748b';
                return (
                  <tr key={doc._id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td className={styles.td}>
                      <div className="row-center" style={{ gap: '0.625rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>{getIcon(doc.mimeType)}</span>
                        <div>
                          <p className={styles.docTitle}>{doc.title}</p>
                          <p className={styles.docMeta}>{doc.fileName} {doc.fileSize ? `· ${doc.fileSize}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <p className={styles.docTitle}>{doc.employeeId?.name || '-'}</p>
                      <p className={styles.docMeta}>{doc.employeeId?.department || ''}</p>
                    </td>
                    <td className={styles.td}>
                      {/* catColor is data-driven */}
                      <span className={styles.categoryBadge} style={{ background: `${catColor}15`, color: catColor }}>{doc.category}</span>
                    </td>
                    <td className={styles.td}>
                      <span style={{ fontSize: '0.8rem', color: '#1e293b' }}>{new Date(doc.createdAt).toLocaleDateString()}</span>
                      <p className={styles.docMeta}>by {doc.uploadedBy?.name || 'Employee'}</p>
                    </td>
                    <td className={styles.td}>
                      {/* status bg/color data-driven */}
                      <span className={styles.statusBadge} style={{ background: st.bg, color: st.color }}>{doc.status}</span>
                      {doc.status === 'Rejected' && doc.rejectionReason && (
                        <p style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '2px', maxWidth: '120px' }}>{doc.rejectionReason}</p>
                      )}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.actionsGroup}>
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className={styles.btnActionView}>View</a>
                        {doc.status !== 'Verified' && (
                          <button onClick={() => handleVerify(doc._id)} className={styles.btnActionVerify}>Verify</button>
                        )}
                        {doc.status !== 'Rejected' && (
                          <button onClick={() => setRejectModal(doc._id)} className={styles.btnActionReject}>Reject</button>
                        )}
                        <button onClick={() => handleDelete(doc._id)} className={styles.btnActionDelete}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="modal-backdrop">
          <div className="admin-modal-panel" style={{ maxWidth: '580px', maxHeight: '85vh' }}>
            <h3 className="font-bold text-heading" style={{ marginBottom: '0.5rem' }}>Upload Documents for Employee</h3>
            <p className="text-secondary" style={{ fontSize: '0.78rem', marginBottom: '1rem' }}>Select an employee and upload one or more documents at once.</p>
            <form onSubmit={handleUpload} className="d-flex-col gap-4">

              {/* Employee selector */}
              <div>
                <label className="d-block text-base font-semibold text-body-clr" style={{ marginBottom: '4px' }}>Employee *</label>
                <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} style={inp} required>
                  <option value="">— Select Employee —</option>
                  {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
                </select>
              </div>

              {/* File picker */}
              <div className={styles.dropzone} onClick={() => fileRef.current?.click()}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📎</p>
                <p className="text-secondary font-semibold" style={{ fontSize: '0.82rem' }}>Click to select files</p>
                <p className="text-muted" style={{ fontSize: '0.7rem', marginTop: '4px' }}>PDF, Word, Excel, Images — max 20MB each, up to 10 files</p>
                <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx" onChange={handleFilesSelected} style={{ display: 'none' }} />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="d-flex-col" style={{ gap: '0.625rem', maxHeight: '280px', overflow: 'auto' }}>
                  {/* Column headers */}
                  <div className="d-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 30px', gap: '0.5rem', padding: '0 0.75rem' }}>
                    {['File', 'Title', 'Category', ''].map(h => (
                      <span key={h} className="text-secondary font-bold uppercase" style={{ fontSize: '0.7rem' }}>{h}</span>
                    ))}
                  </div>
                  {files.map((f, idx) => (
                    <div key={idx} className={styles.fileItemRow}>
                      <div className="d-grid align-center" style={{ gridTemplateColumns: '1fr 1fr 1fr 30px', gap: '0.5rem' }}>
                        <div className="row-center min-w-0" style={{ gap: '0.375rem' }}>
                          <span style={{ fontSize: '1rem' }}>{getIcon(f.file.type)}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-heading text-truncate" style={{ fontSize: '0.75rem' }}>{f.file.name}</p>
                            <p className="text-muted" style={{ fontSize: '0.65rem' }}>{(f.file.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                        <input value={f.title} onChange={e => updateFileField(idx, 'title', e.target.value)} placeholder="Document title" style={{ ...inp, fontSize: '0.75rem', padding: '0.375rem 0.625rem' }} />
                        <select value={f.category} onChange={e => updateFileField(idx, 'category', e.target.value)} style={{ ...inp, fontSize: '0.75rem', padding: '0.375rem 0.625rem', background: '#fff' }}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button type="button" onClick={() => removeFile(idx)} className={styles.btnRemoveFile}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <p className="text-secondary" style={{ fontSize: '0.75rem', textAlign: 'center' }}>{files.length} file{files.length > 1 ? 's' : ''} selected</p>
              )}

              <div className="d-flex gap-3" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => { setShowUpload(false); setFiles([]); setForm({ employeeId: '' }); }}
                  className="btn btn--secondary">Cancel</button>
                <button type="submit" disabled={uploading || files.length === 0} className={styles.btnUpload}
                  style={{ cursor: (uploading || files.length === 0) ? 'not-allowed' : 'pointer', opacity: (uploading || files.length === 0) ? 0.7 : 1 }}>
                  {uploading ? 'Uploading...' : `Upload ${files.length || ''} Document${files.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="modal-backdrop">
          <div className="admin-modal-panel" style={{ maxWidth: '400px', maxHeight: 'none', overflowY: 'visible' }}>
            <h3 className="font-bold text-heading" style={{ marginBottom: '0.75rem' }}>Reject Document</h3>
            <p className="text-secondary" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>Provide a reason for rejection (optional).</p>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..."
              className={styles.rejectTextarea} />
            <div className="d-flex gap-3" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="btn btn--secondary">Cancel</button>
              <button onClick={handleReject} className="cursor-pointer font-bold text-white"
                style={{ padding: '0.5rem 1.25rem', background: '#ef4444', border: 'none', borderRadius: '8px', fontSize: '0.8rem' }}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
