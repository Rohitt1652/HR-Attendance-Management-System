'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listPolicies, createPolicy, updatePolicy, deletePolicy, acceptPolicy } from '@/api/policyApi';
import { policyHasFile, isPdfPolicy, policyFileUrl } from '@/utils/policyFile';
import { useAuth } from '@/context/AuthContext';
import PolicyAcceptanceReportModal from '@/components/PolicyAcceptanceReportModal';
import { ChevronDown, ChevronUp, ClipboardList, Paperclip, ExternalLink, Download, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import styles from './PolicyPage.module.css';

const ADMIN_ROLES = ['admin', 'hr', 'md'];

function getDownloadFilename(policy) {
  const fromUrl = policy.fileUrl?.split('/').pop()?.split('?')[0];
  if (fromUrl && fromUrl.includes('.')) return fromUrl;
  const safeTitle = policy.title.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 80);
  return `${safeTitle}.pdf`;
}

function PolicyForm({ policy, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: policy?.title || '',
    category: policy?.category || 'General',
    content: policy?.content || '',
    requiresAcceptance: policy?.requiresAcceptance !== false,
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title) return toast.error('Title required');
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, typeof v === 'boolean' ? String(v) : v));
      if (file) fd.append('file', file);
      if (policy) await updatePolicy(policy._id, fd);
      else await createPolicy(fd);
      toast.success(policy ? 'Policy updated' : 'Policy created');
      onSave();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>{policy ? 'Edit Policy' : 'New Policy'}</h3>
        <div className={styles.formStack}>
          <div className={styles.formGrid}>
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
            <label className={styles.label}>Content</label>
            <textarea rows={5} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} className={`${styles.input} ${styles.textarea}`} />
          </div>
          <div>
            <label className={styles.label}>Attachment (optional)</label>
            <input type="file" onChange={e => setFile(e.target.files[0])} className={styles.fileInput} />
          </div>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.requiresAcceptance}
              onChange={(e) => setForm((f) => ({ ...f, requiresAcceptance: e.target.checked }))}
            />
            <span>Require employee acceptance on dashboard</span>
          </label>
        </div>
        <div className={styles.formActions}>
          <button onClick={onCancel} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className={styles.saveButton}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PolicyPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const canManagePolicies = isAdmin || user?.permissions?.includes('settings:edit');
  const canViewAcceptanceReport = isAdmin
    || user?.permissions?.includes('settings:edit')
    || user?.permissions?.includes('leaves:view_all');
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [editPolicy, setEditPolicy] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const fetchPolicies = () => {
    listPolicies().then(res => setPolicies(res.data.data || [])).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };

  useEffect(() => { fetchPolicies(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await deletePolicy(id);
      toast.success('Deleted');
      fetchPolicies();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleAcceptPolicy = async (policy) => {
    try {
      await acceptPolicy(policy._id);
      toast.success('Policy accepted');
      fetchPolicies();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept policy');
    }
  };

  const handleOpenPolicyFile = (policy) => {
    if (!policyHasFile(policy)) {
      toast.error('No file attached. Ask HR to upload a policy document.');
      return;
    }
    window.open(policyFileUrl(policy), '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPolicyFile = async (policy) => {
    if (!policyHasFile(policy)) {
      toast.error('No file attached. Ask HR to upload a policy document.');
      return;
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(policyFileUrl(policy), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getDownloadFilename(policy);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const categories = [...new Set(policies.map(p => p.category))].sort();

  if (loading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.page}>
      <div className="row-between">
        <div>
          <h2 className={styles.title}>Policy</h2>
          <p className={styles.subtitle}>Company policies and guidelines</p>
        </div>
        <div className={styles.headerActions}>
          {canViewAcceptanceReport && (
            <button type="button" onClick={() => setShowReport(true)} className={styles.reportButton}>
              <Users size={15} /> Acceptance report
            </button>
          )}
          {canManagePolicies && (
            <button onClick={() => { setEditPolicy(null); setShowForm(true); }} className={styles.addButton}>
              + Upload Policy
            </button>
          )}
        </div>
      </div>

      {policies.length === 0 ? (
        <div className={styles.emptyState}>
          No policies yet.
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat}>
            <p className={styles.categoryTitle}>{cat}</p>
            <div className={styles.policyList}>
              {policies.filter(p => p.category === cat).map(policy => (
                <div key={policy._id} className={styles.policyCard}>
                  <div className={styles.policyHeader} onClick={() => setExpanded(expanded === policy._id ? null : policy._id)}>
                    <div className={styles.policyIcon}>
                      <ClipboardList size={18} color="#6366f1" />
                    </div>
                    <div className={styles.policyMain}>
                      <p className={styles.policyTitle}>
                        {policy.title}
                        {policyHasFile(policy) && (
                          <span className={styles.fileBadge}>
                            <Paperclip size={12} /> File
                          </span>
                        )}
                        {policy.requiresAcceptance && policy.pendingAcceptance && (
                          <span className={styles.statusPending}>
                            <AlertTriangle size={11} /> Action required
                          </span>
                        )}
                        {policy.requiresAcceptance && policy.accepted && (
                          <span className={styles.statusAccepted}>
                            <CheckCircle2 size={11} /> Accepted
                          </span>
                        )}
                      </p>
                      <p className={styles.policyDate}>
                        {new Date(policy.createdAt).toLocaleDateString()}
                        {policy.acceptedAt && (
                          <span className={styles.acceptedAt}>
                            · Accepted {new Date(policy.acceptedAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    {canManagePolicies && (
                      <div className={styles.adminActions} onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditPolicy(policy); setShowForm(true); }} className={`${styles.smallButton} ${styles.editButton}`}>Edit</button>
                        <button onClick={() => handleDelete(policy._id)} className={`${styles.smallButton} ${styles.deleteButton}`}>Delete</button>
                      </div>
                    )}
                    <div className={styles.headerFileActions} onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenPolicyFile(policy)}
                        className={styles.openButton}
                      >
                        <ExternalLink size={14} /> Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPolicyFile(policy)}
                        className={styles.downloadButton}
                      >
                        <Download size={14} /> Download
                      </button>
                    </div>
                    <span className={styles.expandIcon}>
                      {expanded === policy._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                  {expanded === policy._id && (
                    <div className={styles.policyContent}>
                      {policy.content && <p className={styles.policyText}>{policy.content}</p>}
                      {!policyHasFile(policy) && policy.fileUrl && (
                        <p className={styles.noFileHint}>Policy file is missing on the server. Ask HR to re-upload the document.</p>
                      )}
                      {!policyHasFile(policy) && !policy.fileUrl && (
                        <p className={styles.noFileHint}>No file attached to this policy yet.</p>
                      )}
                      {policyHasFile(policy) && isPdfPolicy(policy) && (
                        <iframe
                          title={`${policy.title} attachment`}
                          src={policyFileUrl(policy)}
                          className={styles.pdfFrame}
                        />
                      )}
                      {policy.pendingAcceptance && (
                        <button
                          type="button"
                          className={styles.acceptButton}
                          onClick={() => handleAcceptPolicy(policy)}
                        >
                          <CheckCircle2 size={14} /> I accept this policy
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showForm && <PolicyForm policy={editPolicy} onSave={() => { setShowForm(false); fetchPolicies(); }} onCancel={() => setShowForm(false)} />}
      {showReport && <PolicyAcceptanceReportModal onClose={() => setShowReport(false)} />}
    </div>
  );
}
