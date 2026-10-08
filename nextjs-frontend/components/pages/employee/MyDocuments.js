'use client';
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getMyDocuments, uploadMyDocument, uploadMyDocumentsMultiple, deleteDocument } from '@/api/documentApi';
import styles from './MyDocuments.module.css';

const CATEGORIES = ['Identity', 'Education', 'Experience', 'Contract', 'Medical', 'Tax', 'Other'];

const STATUS_STYLE = {
  Pending:  { bg: '#fef9c3', color: '#854d0e', label: 'Pending Review' },
  Verified: { bg: '#dcfce7', color: '#166534', label: 'Verified ✓' },
  Rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
};

const FILE_ICONS = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️', 'image/png': '🖼️',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
};
const getIcon = (mime) => FILE_ICONS[mime] || '📁';

const CAT_COLORS = {
  Identity: '#6366f1', Education: '#0ea5e9', Experience: '#f59e0b',
  Contract: '#22c55e', Medical: '#ef4444', Tax: '#8b5cf6', Other: '#64748b',
};

export default function MyDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const fileRef = useRef();

  const fetchDocs = () => {
    getMyDocuments()
      .then(res => setDocs(res.data.data || []))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleFilesSelected = (e) => {
    const selected = Array.from(e.target.files);
    const newFiles = selected.map(f => ({
      file: f,
      title: f.name.replace(/\.[^/.]+$/, ''),
      category: 'Other',
    }));
    setFiles(prev => [...prev, ...newFiles]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const updateFileField = (idx, field, value) => {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (files.length === 0) return toast.error('Please select at least one file');
    if (files.some(f => !f.title.trim())) return toast.error('All files need a title');
    setUploading(true);
    try {
      if (files.length === 1) {
        const fd = new FormData();
        fd.append('file', files[0].file);
        fd.append('title', files[0].title);
        fd.append('category', files[0].category);
        await uploadMyDocument(fd);
      } else {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f.file));
        fd.append('titles', JSON.stringify(files.map(f => f.title)));
        fd.append('categories', JSON.stringify(files.map(f => f.category)));
        await uploadMyDocumentsMultiple(fd);
      }
      toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded successfully`);
      setShowUpload(false);
      setFiles([]);
      fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document?')) return;
    try { await deleteDocument(id); toast.success('Deleted'); fetchDocs(); }
    catch (err) { toast.error(err.response?.data?.message || 'Cannot delete'); }
  };

  const categories = ['All', ...CATEGORIES.filter(c => docs.some(d => d.category === c))];
  const filtered = activeCategory === 'All' ? docs : docs.filter(d => d.category === activeCategory);

  return (
    <div className="admin-page-stack">
      {/* Header */}
      <div className="admin-header">
        <div>
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#1e293b' }}>My Documents</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '4px' }}>{docs.length} document{docs.length !== 1 ? 's' : ''} uploaded</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowUpload(true)}>
          + Upload Documents
        </button>
      </div>

      {/* Info banner */}
      <div className={styles.infoBanner}>
        <span style={{ fontSize: '1rem' }}>ℹ️</span>
        <p className={styles.infoBannerText}>Documents uploaded by you will be reviewed and verified by HR. You can track the status here.</p>
      </div>

      {/* Status summary */}
      <div className={styles.statsGrid}>
        {[
          { label: 'Verified', count: docs.filter(d => d.status === 'Verified').length, ...STATUS_STYLE.Verified },
          { label: 'Pending', count: docs.filter(d => d.status === 'Pending').length, ...STATUS_STYLE.Pending },
          { label: 'Rejected', count: docs.filter(d => d.status === 'Rejected').length, ...STATUS_STYLE.Rejected },
        ].map(s => (
          <div key={s.label} className={styles.statCard} style={{ background: s.bg, border: `1px solid ${s.color}30` }}>
            <p className={styles.statVal} style={{ color: s.color }}>{s.count}</p>
            <p className={styles.statLabel}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className={styles.categoryList}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)} className={styles.catPill}
            style={{ fontWeight: activeCategory === cat ? 700 : 400, background: activeCategory === cat ? (CAT_COLORS[cat] || '#6366f1') : '#f1f5f9', color: activeCategory === cat ? '#fff' : '#64748b' }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Document list */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ borderRadius: '16px', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</p>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No documents yet. Upload your first document.</p>
        </div>
      ) : (
        <div className={styles.docListShell}>
          {filtered.map(doc => {
            const st = STATUS_STYLE[doc.status];
            const catColor = CAT_COLORS[doc.category] || '#64748b';
            return (
              <div key={doc._id} className={styles.docCard}>
                <div className={styles.iconBox} style={{ background: `${catColor}15` }}>
                  {getIcon(doc.mimeType)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '3px' }}>
                    <p className={styles.docTitle}>{doc.title}</p>
                    <span className={styles.catBadge} style={{ background: `${catColor}15`, color: catColor }}>{doc.category}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <p className={styles.metaText}>{doc.fileName}</p>
                    {doc.fileSize && <p className={styles.metaText}>· {doc.fileSize}</p>}
                    <p className={styles.metaText}>· {new Date(doc.createdAt).toLocaleDateString()}</p>
                  </div>
                  {doc.status === 'Rejected' && doc.rejectionReason && (
                    <p className={styles.rejectionText}>Reason: {doc.rejectionReason}</p>
                  )}
                </div>
                <span className={styles.statusBadge} style={{ background: st.bg, color: st.color }}>{st.label}</span>
                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" className={styles.btnActionView}>
                    View
                  </a>
                  {doc.status !== 'Verified' && (
                    <button onClick={() => handleDelete(doc._id)} className={styles.btnActionDelete}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal - supports multiple files */}
      {showUpload && (
        <div className="modal-backdrop">
          <div className="admin-modal-panel" style={{ maxWidth: '560px', maxHeight: '85vh', overflow: 'auto' }}>
            <h3 style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>Upload Documents</h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '1rem' }}>Select one or more files. Each will be sent for HR verification.</p>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* File picker */}
              <div className={styles.dropzone} onClick={() => fileRef.current?.click()}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📎</p>
                <p style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Click to select files</p>
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>PDF, Word, Excel, Images — max 20MB each, up to 10 files</p>
                <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx" onChange={handleFilesSelected} style={{ display: 'none' }} />
              </div>

              {/* File list with title/category per file */}
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', maxHeight: '300px', overflow: 'auto' }}>
                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 30px', gap: '0.5rem', padding: '0 0.75rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>File</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Title</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Category</span>
                    <span></span>
                  </div>
                  {files.map((f, idx) => (
                    <div key={idx} className={styles.fileItemRow}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 30px', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
                          <span style={{ fontSize: '1rem' }}>{getIcon(f.file.type)}</span>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</p>
                            <p style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{(f.file.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                        <input className="form-input" value={f.title} onChange={e => updateFileField(idx, 'title', e.target.value)} placeholder="Document title" style={{ fontSize: '0.75rem', padding: '0.375rem 0.625rem' }} />
                        <select className="form-select" value={f.category} onChange={e => updateFileField(idx, 'category', e.target.value)} style={{ fontSize: '0.75rem', padding: '0.375rem 0.625rem', background: '#fff' }}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button type="button" onClick={() => removeFile(idx)} className={styles.btnRemoveFile}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>{files.length} file{files.length > 1 ? 's' : ''} selected</p>
              )}

              <div className="admin-modal-footer" style={{ marginTop: '0.5rem' }}>
                <button className="btn btn--secondary" type="button" onClick={() => { setShowUpload(false); setFiles([]); }}>Cancel</button>
                <button className="btn btn--primary" type="submit" disabled={uploading || files.length === 0} style={{ opacity: (uploading || files.length === 0) ? 0.7 : 1 }}>
                  {uploading ? 'Uploading...' : `Upload ${files.length || ''} Document${files.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
