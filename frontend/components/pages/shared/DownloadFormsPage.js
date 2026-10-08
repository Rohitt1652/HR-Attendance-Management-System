'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listForms, createForm, updateForm, deleteForm, trackDownload } from '@/api/downloadFormApi';
import { useAuth } from '@/context/AuthContext';
import styles from './DownloadFormsPage.module.css';

const ADMIN_ROLES = ['admin', 'hr', 'md'];

const FILE_ICONS = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', default: '📁' };
const getIcon = (url) => { const ext = url?.split('.').pop()?.toLowerCase(); return FILE_ICONS[ext] || FILE_ICONS.default; };

function FormModal({ form: existing, onSave, onCancel }) {
  const [form, setForm] = useState({ title: existing?.title || '', description: existing?.description || '', category: existing?.category || 'General' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title) return toast.error('Title required');
    if (!existing && !file) return toast.error('File required');
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      if (existing) await updateForm(existing._id, fd);
      else await createForm(fd);
      toast.success(existing ? 'Form updated' : 'Form uploaded');
      onSave();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>{existing ? 'Edit Form' : 'Upload Form'}</h3>
        <div className={styles.formFields}>
          <div className={styles.twoColumn}>
            <div>
              <label className={styles.label}>Title</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>Category</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. HR, Finance" className={styles.input} />
            </div>
          </div>
          <div>
            <label className={styles.label}>Description</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${styles.input} ${styles.textarea}`} />
          </div>
          <div>
            <label className={styles.label}>File {existing ? '(leave blank to keep current)' : '*'}</label>
            <input type="file" onChange={e => setFile(e.target.files[0])} className={styles.fileInput} />
          </div>
        </div>
        <div className={styles.modalActions}>
          <button onClick={onCancel} className={styles.secondaryButton}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className={styles.primaryButton}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DownloadFormsPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [search, setSearch] = useState('');

  const fetchForms = () => {
    listForms().then(res => setForms(res.data.data || [])).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchForms(); }, []);

  const handleDownload = async (form) => {
    try {
      await trackDownload(form._id);
      window.open(form.fileUrl, '_blank');
    } catch { window.open(form.fileUrl, '_blank'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this form?')) return;
    try { await deleteForm(id); toast.success('Deleted'); fetchForms(); }
    catch { toast.error('Failed to delete'); }
  };

  const categories = [...new Set(forms.map(f => f.category))].sort();
  const filtered = forms.filter(f => !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.category.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Download Forms</h2>
          <p className={styles.subtitle}>{forms.length} forms available</p>
        </div>
        <div className={styles.headerActions}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search forms..."
            className={styles.searchInput} />
          {isAdmin && (
            <button onClick={() => { setEditForm(null); setShowModal(true); }}
              className={styles.uploadButton}>
              + Upload Form
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          No forms found.
        </div>
      ) : (
        categories.filter(cat => filtered.some(f => f.category === cat)).map(cat => (
          <div key={cat}>
            <p className={styles.category}>{cat}</p>
            <div className={styles.grid}>
              {filtered.filter(f => f.category === cat).map(form => (
                <div key={form._id} className={styles.card}>
                  <div className={styles.cardContent}>
                    <div className={styles.fileIcon}>
                      {getIcon(form.fileUrl)}
                    </div>
                    <div className={styles.cardText}>
                      <p className={styles.formTitle}>{form.title}</p>
                      {form.description && <p className={styles.description}>{form.description}</p>}
                      <div className={styles.metadata}>
                        {form.fileSize && <span>{form.fileSize}</span>}
                        {form.downloadCount > 0 && <span>· {form.downloadCount} downloads</span>}
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <button onClick={() => handleDownload(form)}
                      className={styles.downloadButton}>
                      📥 Download
                    </button>
                    {isAdmin && (
                      <>
                        <button onClick={() => { setEditForm(form); setShowModal(true); }}
                          className={styles.editButton}>✏️</button>
                        <button onClick={() => handleDelete(form._id)}
                          className={styles.deleteButton}>🗑️</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showModal && <FormModal form={editForm} onSave={() => { setShowModal(false); fetchForms(); }} onCancel={() => setShowModal(false)} />}
    </div>
  );
}
