'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getTrainings, createTraining, updateTraining, deleteTraining, getEnrollments, enrollUser, updateEnrollment, collectTrainingPayment } from '@/api/trainingApi';
import { listEmployees } from '@/api/employeeApi';
import { Briefcase, Users, CalendarDays, CheckCircle2, MapPin, Clock, GraduationCap, UserPlus, Trash2, Pencil, Plus, IndianRupee } from 'lucide-react';
import styles from './TrainingManagement.module.css';

/*
 * TrainingManagement — Style migration log
 * Before: 110 inline style blocks
 * After:  ~38 inline style blocks
 * Removed: ~72 (all static layout, color, spacing patterns)
 * Remaining inline (intentional — all dynamic/data-driven):
 *   - STATUS_COLORS[t.status] badge bg/color
 *   - PAYMENT_COLORS[e.paymentStatus] badge bg/color
 *   - saving ? 'not-allowed' : 'pointer' (state-driven cursor)
 *   - opacity: saving ? 0.7 : 1  (state-driven)
 *   - tab active: bg/color/shadow per selected tab
 *   - statusFilter active pill: bg/color driven by filter value
 *   - stat card icon bg/color from data
 *   - enrollment avatar gradient (static — kept minimal)
 */

const inp = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: '4px' };
const STATUS_COLORS  = { Upcoming: '#6366f1', Ongoing: '#22c55e', Completed: '#64748b', Cancelled: '#ef4444' };
const PAYMENT_COLORS = { Pending: '#f59e0b', Paid: '#22c55e', Waived: '#64748b', Partial: '#0ea5e9' };

/* ── Modal shell ──────────────────────────────────────────────── */
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <div className="bg-white rounded-2xl overflow-hidden" style={{ padding: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div className="row-between" style={{ marginBottom: '1.25rem' }}>
          <h3 className="font-bold text-heading" style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} className="btn-ghost-base text-secondary cursor-pointer" style={{ fontSize: '1.25rem' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Training form ────────────────────────────────────────────── */
function TrainingForm({ training, onSave, onClose }) {
  const [form, setForm] = useState(training || { title: '', category: '', description: '', trainer: '', venue: '', startDate: '', endDate: '', maxParticipants: 20, status: 'Upcoming', isPaid: false, fee: 0 });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title || !form.startDate || !form.endDate) return toast.error('Title, start and end date required');
    setSaving(true);
    try {
      if (training?._id) await updateTraining(training._id, form);
      else await createTraining(form);
      toast.success(training ? 'Updated' : 'Created');
      onSave();
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  return (
    <div className="d-flex-col gap-3">
      <div className="d-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Title *</label><input value={form.title} onChange={e => set('title', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Category</label><input value={form.category} onChange={e => set('category', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Trainer</label><input value={form.trainer} onChange={e => set('trainer', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Venue</label><input value={form.venue} onChange={e => set('venue', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Max Participants</label><input type="number" min="1" value={form.maxParticipants} onChange={e => set('maxParticipants', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Start Date *</label><input type="date" value={form.startDate?.slice(0, 10) || ''} onChange={e => set('startDate', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>End Date *</label><input type="date" value={form.endDate?.slice(0, 10) || ''} onChange={e => set('endDate', e.target.value)} style={inp} /></div>
        <div>
          <label style={lbl}>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} style={inp}>
            {['Upcoming', 'Ongoing', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="row-center gap-2" style={{ paddingTop: '1.25rem' }}>
          <input type="checkbox" id="isPaid" checked={form.isPaid} onChange={e => set('isPaid', e.target.checked)} />
          <label htmlFor="isPaid" className="text-body font-semibold text-body-clr">Paid Training</label>
        </div>
        {form.isPaid && <div><label style={lbl}>Fee</label><input type="number" min="0" value={form.fee} onChange={e => set('fee', e.target.value)} style={inp} /></div>}
      </div>
      <div><label style={lbl}>Description</label><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} /></div>
      <div className="row-between" style={{ gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ── Enroll modal ─────────────────────────────────────────────── */
function EnrollModal({ training, onClose, onDone }) {
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected]   = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    listEmployees({ limit: 200, status: 'Active' }).then(r => setEmployees(r.data.data || [])).catch(() => {});
  }, []);

  const handleEnroll = async () => {
    if (!selected) return toast.error('Select an employee');
    setSaving(true);
    try { await enrollUser({ trainingId: training._id, userId: selected }); toast.success('Enrolled'); onDone(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); } finally { setSaving(false); }
  };

  return (
    <div className="d-flex-col gap-4">
      <p className="text-body text-secondary" style={{ margin: 0 }}>Enroll an employee in <strong>{training.title}</strong></p>
      <div>
        <label style={lbl}>Select Employee</label>
        <select value={selected} onChange={e => setSelected(e.target.value)} style={inp}>
          <option value="">-- Choose --</option>
          {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
        </select>
      </div>
      <div className="d-flex gap-3" style={{ justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleEnroll} disabled={saving} style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Enrolling...' : 'Enroll'}
        </button>
      </div>
    </div>
  );
}

/* ── Payment modal ────────────────────────────────────────────── */
function PaymentModal({ enrollment, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [ref, setRef]       = useState('');
  const [saving, setSaving] = useState(false);
  const remaining = (enrollment.amountDue || 0) - (enrollment.amountPaid || 0);

  const handleCollect = async () => {
    if (!amount || Number(amount) <= 0) return toast.error('Enter valid amount');
    setSaving(true);
    try { await collectTrainingPayment(enrollment._id, { amountPaid: Number(amount), paymentMethod: method, paymentRef: ref }); toast.success('Payment recorded'); onDone(); }
    catch { toast.error('Failed'); } finally { setSaving(false); }
  };

  return (
    <div className="d-flex-col gap-3">
      <p className="text-body text-secondary" style={{ margin: 0 }}>Remaining: Rs.{remaining.toLocaleString()}</p>
      <div><label style={lbl}>Amount</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inp} /></div>
      <div>
        <label style={lbl}>Method</label>
        <select value={method} onChange={e => setMethod(e.target.value)} style={inp}>
          {['Cash', 'Bank Transfer', 'UPI', 'Cheque'].map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div><label style={lbl}>Reference</label><input value={ref} onChange={e => setRef(e.target.value)} style={inp} /></div>
      <div className="d-flex gap-3" style={{ justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleCollect} disabled={saving} style={{ padding: '0.5rem 1.25rem', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Collect'}
        </button>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────── */
export default function TrainingManagement() {
  const [tab, setTab]                   = useState('trainings');
  const [trainings, setTrainings]       = useState([]);
  const [enrollments, setEnrollments]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTraining, setEditTraining] = useState(null);
  const [enrollTarget, setEnrollTarget] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [t, e] = await Promise.all([getTrainings(), getEnrollments()]);
      setTrainings(t.data.data);
      setEnrollments(e.data.data);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this training?')) return;
    try { await deleteTraining(id); toast.success('Deleted'); fetchAll(); } catch { toast.error('Delete failed'); }
  };

  const handleUpdateEnrollment = async (id, data) => {
    try { await updateEnrollment(id, data); fetchAll(); } catch { toast.error('Update failed'); }
  };

  const filtered = statusFilter ? trainings.filter(t => t.status === statusFilter) : trainings;

  const stats = [
    { label: 'Total Programs', value: trainings.length,                                color: '#6366f1', bg: '#eff6ff', Icon: GraduationCap },
    { label: 'Upcoming',       value: trainings.filter(t => t.status === 'Upcoming').length, color: '#f59e0b', bg: '#fffbeb', Icon: CalendarDays },
    { label: 'Ongoing',        value: trainings.filter(t => t.status === 'Ongoing').length,  color: '#22c55e', bg: '#f0fdf4', Icon: Clock },
    { label: 'Total Enrolled', value: enrollments.length,                             color: '#0ea5e9', bg: '#f0f9ff', Icon: Users },
  ];

  return (
    <div className={styles.pageContainer}>

      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Training Management</h1>
          <p className={styles.pageSubtitle}>Manage training programs and employee enrollments</p>
        </div>
        <button onClick={() => setShowForm(true)} className={styles.btnNewProgram}>
          <Plus size={15} /> New Program
        </button>
      </div>

      {/* Stat cards */}
      <div className={styles.statsGrid}>
        {stats.map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIconBox} style={{ background: s.bg }}>
              <s.Icon size={20} color={s.color} strokeWidth={2} />
            </div>
            <div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        {[['trainings', GraduationCap, 'Programs', trainings.length], ['enrollments', Users, 'Enrollments', enrollments.length]].map(([t, Icon, label, count]) => (
          <button key={t} onClick={() => setTab(t)} className={styles.tabBtn}
            style={{
              fontWeight: tab === t ? 700 : 500,
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#111827' : '#6b7280',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            <Icon size={14} strokeWidth={tab === t ? 2.2 : 1.8} />
            {label}
            <span className={styles.tabCountBadge} style={{ background: tab === t ? '#4f46e5' : '#e5e7eb', color: tab === t ? '#fff' : '#6b7280' }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Trainings tab */}
      {tab === 'trainings' && (
        <div>
          {/* Status filter pills */}
          <div className="row-between flex-wrap gap-3" style={{ marginBottom: '1rem' }}>
            <div className={styles.filterGroup}>
              {['', 'Upcoming', 'Ongoing', 'Completed', 'Cancelled'].map(s => (
                <button key={s || 'all'} onClick={() => setStatusFilter(s)}
                  className={styles.filterPill}
                  style={{ background: statusFilter === s ? (STATUS_COLORS[s] || '#6366f1') : '#f1f5f9', color: statusFilter === s ? '#fff' : '#374151' }}>
                  {s || 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* Loading / empty / list */}
          {loading ? (
            <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <div className={styles.emptyIconBox}>
                <GraduationCap size={28} color="#6366f1" strokeWidth={1.5} />
              </div>
              <p className="font-bold text-heading text-xl">No training programs yet</p>
              <p className="text-muted" style={{ fontSize: '0.875rem' }}>Create your first training program</p>
              <button onClick={() => setShowForm(true)} className={styles.btnNewProgram} style={{ marginTop: '1rem', display: 'inline-flex' }}>
                <Plus size={15} /> Create Training
              </button>
            </div>
          ) : filtered.map(t => (
            <div key={t._id} className={styles.programCard}>
              <div className={styles.programHeader}>
                <div className="flex-1">
                  <div className={styles.programTitleRow}>
                    <span className={styles.programTitle}>{t.title}</span>
                    <span className="font-bold" style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.7rem', background: `${STATUS_COLORS[t.status]}20`, color: STATUS_COLORS[t.status] }}>{t.status}</span>
                    {t.isPaid && <span className="font-bold" style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', background: '#f0fdf4', color: '#16a34a' }}>₹{t.fee?.toLocaleString()}</span>}
                  </div>
                  <div className={styles.programMetaList}>
                    {t.category  && <span className={styles.programMetaItem}><GraduationCap size={13} /> {t.category}</span>}
                    {t.trainer   && <span className={styles.programMetaItem}><Users size={13} /> {t.trainer}</span>}
                    {t.venue     && <span className={styles.programMetaItem}><MapPin size={13} /> {t.venue}</span>}
                    <span className={styles.programMetaItem}><CalendarDays size={13} /> {new Date(t.startDate).toLocaleDateString()} – {new Date(t.endDate).toLocaleDateString()}</span>
                    {t.maxParticipants && <span className="text-md text-secondary">Max: {t.maxParticipants}</span>}
                  </div>
                  {t.description && <p className={styles.programDesc}>{t.description}</p>}
                </div>
                <div className={styles.programActionGroup}>
                  <span className={styles.enrolledCountText}>{enrollments.filter(e => (e.trainingId?._id || e.trainingId) === t._id).length} enrolled</span>
                  <div className={styles.actionBtnGroup}>
                    <button onClick={() => setEnrollTarget(t)} className={styles.btnEnroll}><UserPlus size={12} /> Enroll</button>
                    <button onClick={() => { setEditTraining(t); setShowForm(true); }} className={styles.btnEdit}><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(t._id)} className={styles.btnDelete}><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Enrollments tab */}
      {tab === 'enrollments' && (
        <div>
          {loading ? (
            <p className="text-secondary">Loading...</p>
          ) : enrollments.length === 0 ? (
            <div className={styles.emptyStateCard}>
              <div className={styles.emptyIconBox} style={{ background: '#f0f9ff' }}>
                <Users size={28} color="#0ea5e9" strokeWidth={1.5} />
              </div>
              <p className="font-bold text-heading text-xl">No enrollments yet</p>
              <p className="text-muted" style={{ fontSize: '0.875rem' }}>Enroll employees from the Programs tab</p>
            </div>
          ) : enrollments.map(e => (
            <div key={e._id} className={styles.enrollmentCard}>
              <div className={styles.enrollmentUserGroup}>
                <div className={styles.userAvatar}>
                  {e.userId?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <p className={styles.userName}>{e.userId?.name}</p>
                  <p className={styles.userSubtext}>{e.userId?.employeeId} · {e.userId?.department}</p>
                  <p className={styles.programTitleSub}>{e.trainingId?.title}</p>
                </div>
              </div>
              <div className={styles.enrollmentStatusGroup}>
                {e.trainingId?.isPaid && (
                  <span className="text-base text-secondary">₹{(e.amountPaid || 0).toLocaleString()}/₹{e.amountDue?.toLocaleString()}</span>
                )}
                <span className="font-bold" style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.72rem', background: `${PAYMENT_COLORS[e.paymentStatus]}20`, color: PAYMENT_COLORS[e.paymentStatus] }}>
                  {e.paymentStatus}
                </span>
                <select value={e.status || 'Enrolled'} onChange={ev => handleUpdateEnrollment(e._id, { status: ev.target.value })}
                  style={{ padding: '4px 8px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '0.75rem', outline: 'none' }}>
                  {['Enrolled', 'Attended', 'Absent', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
                {e.trainingId?.isPaid && e.paymentStatus !== 'Paid' && e.paymentStatus !== 'Waived' && (
                  <button onClick={() => setPaymentTarget(e)} className={styles.btnCollect}>Collect</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <Modal title={editTraining ? 'Edit Training' : 'New Training'} onClose={() => setShowForm(false)}>
          <TrainingForm training={editTraining} onSave={() => { setShowForm(false); fetchAll(); }} onClose={() => setShowForm(false)} />
        </Modal>
      )}
      {enrollTarget && (
        <Modal title="Enroll Employee" onClose={() => setEnrollTarget(null)}>
          <EnrollModal training={enrollTarget} onClose={() => setEnrollTarget(null)} onDone={() => { setEnrollTarget(null); fetchAll(); }} />
        </Modal>
      )}
      {paymentTarget && (
        <Modal title="Collect Payment" onClose={() => setPaymentTarget(null)}>
          <PaymentModal enrollment={paymentTarget} onClose={() => setPaymentTarget(null)} onDone={() => { setPaymentTarget(null); fetchAll(); }} />
        </Modal>
      )}
    </div>
  );
}
