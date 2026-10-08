'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/api/announcementApi';
import { generateAnnouncement } from '@/api/aiApi';
import { useAuth } from '@/context/AuthContext';
import { Megaphone, Sparkles, Loader2 } from 'lucide-react';
import styles from './AnnouncementsPage.module.css';

const ADMIN_ROLES = ['admin', 'hr', 'md'];
const PRIORITY_STYLE = {
  high:   { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', label: 'High' },
  medium: { bg: '#fffbeb', border: '#fde68a', color: '#d97706', label: 'Medium' },
  low:    { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', label: 'Low' },
};
const ROLES = ['employee', 'team_lead', 'hr', 'admin', 'md'];

function AnnouncementForm({ ann, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: ann?.title || '',
    content: ann?.content || '',
    priority: ann?.priority || 'medium',
    targetRoles: ann?.targetRoles || [],
    expiresAt: ann?.expiresAt ? new Date(ann.expiresAt).toISOString().slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);

  const handleAiWrite = async () => {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    try {
      const res = await generateAnnouncement({ topic: aiTopic, tone: form.priority === 'high' ? 'urgent' : 'professional' });
      const d = res.data.data;
      setForm(f => ({ ...f, title: d.title || f.title, content: d.content || f.content }));
      setShowAiInput(false);
      setAiTopic('');
      toast.success('AI wrote the announcement - review before posting');
    } catch {
      toast.error('AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const toggleRole = (role) => setForm(f => ({
    ...f,
    targetRoles: f.targetRoles.includes(role) ? f.targetRoles.filter(r => r !== role) : [...f.targetRoles, role],
  }));

  const handleSave = async () => {
    if (!form.title || !form.content) return toast.error('Title and content required');
    setSaving(true);
    try {
      const payload = { ...form, expiresAt: form.expiresAt || null };
      const res = ann ? await updateAnnouncement(ann._id, payload) : await createAnnouncement(payload);
      console.info('[AnnouncementsPage] Announcement saved', {
        id: res.data?.data?._id,
        title: res.data?.data?.title,
        expiresAt: res.data?.data?.expiresAt,
        targetRoles: res.data?.data?.targetRoles,
      });
      toast.success(ann ? 'Announcement updated' : 'Announcement posted');
      onSave();
    } catch (err) {
      console.error('[AnnouncementsPage] Failed to save announcement', {
        status: err?.response?.status,
        message: err?.response?.data?.message || err?.message,
        data: err?.response?.data,
      });
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{ann ? 'Edit Announcement' : 'New Announcement'}</h3>
          {!ann && (
            <button type="button" onClick={() => setShowAiInput(v => !v)} className={styles.aiButton}>
              <Sparkles size={12} /> AI Write
            </button>
          )}
        </div>
        {showAiInput && (
          <div className={styles.aiBox}>
            <p className={styles.aiPrompt}>What is this announcement about?</p>
            <div className={styles.aiRow}>
              <input
                value={aiTopic}
                onChange={e => setAiTopic(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAiWrite(); }}
                placeholder='e.g. "Office closed on Friday for maintenance"'
                className={`${styles.input} ${styles.aiInput}`}
              />
              <button
                type="button"
                onClick={handleAiWrite}
                disabled={aiGenerating || !aiTopic.trim()}
                className={styles.aiWriteButton}
                style={{
                  background: aiGenerating || !aiTopic.trim() ? '#e2e8f0' : '#6366f1',
                  color: aiGenerating || !aiTopic.trim() ? '#94a3b8' : '#fff',
                }}>
                {aiGenerating ? <Loader2 size={12} className={styles.spin} /> : 'Write'}
              </button>
            </div>
          </div>
        )}
        <div className={styles.formStack}>
          <div>
            <label className={styles.label}>Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={styles.input} />
          </div>
          <div>
            <label className={styles.label}>Content *</label>
            <textarea rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} className={`${styles.input} ${styles.textarea}`} />
          </div>
          <div className={styles.formGrid}>
            <div>
              <label className={styles.label}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={styles.input}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className={styles.label}>Expires On</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} className={styles.input} />
            </div>
          </div>
          <div>
            <label className={`${styles.label} ${styles.rolesLabel}`}>Target Roles (empty = all)</label>
            <div className={styles.roleList}>
              {ROLES.map(role => {
                const selected = form.targetRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={styles.roleButton}
                    style={{
                      border: `1.5px solid ${selected ? '#6366f1' : '#e2e8f0'}`,
                      background: selected ? '#6366f1' : '#fff',
                      color: selected ? '#fff' : '#64748b',
                    }}>
                    {role}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className={styles.formActions}>
          <button onClick={onCancel} className={styles.cancelButton}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className={styles.submitButton} style={{ cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const canManageAnnouncements = isAdmin || (user?.permissions || []).includes('announcements:create');
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editAnn, setEditAnn] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const fetchAnnouncements = () => {
    getAnnouncements()
      .then(res => {
        const list = res.data.data || [];
        console.info('[AnnouncementsPage] Loaded announcements', {
          count: res.data.count ?? list.length,
          received: list.length,
          meta: res.data.meta,
        });
        if (!list.length) {
          console.warn('[AnnouncementsPage] Announcement list is empty', {
            apiCount: res.data.count,
            meta: res.data.meta,
            raw: res.data,
          });
        }
        setAnnouncements(list);
      })
      .catch((err) => {
        console.error('[AnnouncementsPage] Failed to load announcements', {
          status: err?.response?.status,
          message: err?.response?.data?.message || err?.message,
          data: err?.response?.data,
        });
        toast.error(err.response?.data?.message || 'Failed to load');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await deleteAnnouncement(id);
      toast.success('Deleted');
      fetchAnnouncements();
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.page}>
      <div className="row-between">
        <div>
          <h2 className={styles.title}>Announcements</h2>
          <p className={styles.subtitle}>{announcements.length} active announcements</p>
        </div>
        {canManageAnnouncements && (
          <button onClick={() => { setEditAnn(null); setShowForm(true); }} className={styles.postButton}>
            + Post Announcement
          </button>
        )}
      </div>

      {announcements.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyIcon}><Megaphone size={32} color="#94a3b8" /></p>
          <p className="text-muted">No announcements yet</p>
        </div>
      ) : (
        <div className={styles.announcementList}>
          {announcements.map(ann => {
            const p = PRIORITY_STYLE[ann.priority] || PRIORITY_STYLE.medium;
            const isExpanded = expanded === ann._id;
            return (
              <div key={ann._id} className={styles.announcementCard} style={{ border: `1px solid ${p.border}` }}>
                <div
                  className={styles.announcementHeader}
                  style={{ background: p.bg }}
                  onClick={() => setExpanded(isExpanded ? null : ann._id)}>
                  <div className={styles.announcementMain}>
                    <div className={styles.metaRow}>
                      <span className={styles.priorityBadge} style={{ background: p.color + '20', color: p.color }}>{p.label}</span>
                      {ann.targetRoles?.length > 0 && ann.targetRoles.map(r => (
                        <span key={r} className={styles.targetRole}>{r}</span>
                      ))}
                      {ann.expiresAt && (
                        <span className={styles.expires}>Expires {new Date(ann.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <h3 className={styles.announcementTitle}>{ann.title}</h3>
                    <p className={styles.postedBy}>
                      Posted by {ann.postedBy?.name || 'Admin'} - {new Date(ann.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className={styles.cardActions}>
                    {canManageAnnouncements && (
                      <>
                        <button onClick={e => { e.stopPropagation(); setEditAnn(ann); setShowForm(true); }} className={styles.smallEditButton}>Edit</button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(ann._id); }} className={styles.smallDeleteButton}>Delete</button>
                      </>
                    )}
                    <span className={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className={styles.announcementContent} style={{ borderTop: `1px solid ${p.border}` }}>
                    <p className={styles.announcementText}>{ann.content}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <AnnouncementForm
          ann={editAnn}
          onSave={() => { setShowForm(false); setEditAnn(null); fetchAnnouncements(); }}
          onCancel={() => { setShowForm(false); setEditAnn(null); }}
        />
      )}
    </div>
  );
}
