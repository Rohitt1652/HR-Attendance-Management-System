'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getTrainings, getMyEnrollments, enrollUser } from '@/api/trainingApi';
import styles from './MyTraining.module.css';

const STATUS_COLORS = { Upcoming: '#6366f1', Ongoing: '#22c55e', Completed: '#64748b', Cancelled: '#ef4444' };
const ENROLL_STATUS_COLORS = { Enrolled: '#6366f1', Attended: '#22c55e', Absent: '#ef4444', Cancelled: '#64748b' };
const PAYMENT_COLORS = { Pending: '#f59e0b', Paid: '#22c55e', Waived: '#64748b', Partial: '#0ea5e9' };

export default function MyTraining() {
  const [tab, setTab] = useState('available');
  const [trainings, setTrainings] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [t, e] = await Promise.all([getTrainings(), getMyEnrollments()]);
      setTrainings(t.data.data);
      setEnrollments(e.data.data);
    } catch { toast.error('Failed to load trainings'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const enrolledIds = new Set(enrollments.map(e => e.trainingId?._id || e.trainingId));

  const handleEnroll = async (trainingId) => {
    setEnrolling(trainingId);
    try {
      await enrollUser({ trainingId });
      toast.success('Enrolled successfully');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Enrollment failed');
    } finally { setEnrolling(null); }
  };

  const available = trainings.filter(t => t.status !== 'Cancelled' && t.status !== 'Completed');

  const stats = [
    { label: 'Enrolled', value: enrollments.length, color: '#6366f1' },
    { label: 'Attended', value: enrollments.filter(e => e.status === 'Attended').length, color: '#22c55e' },
    { label: 'Pending Payment', value: enrollments.filter(e => e.paymentStatus === 'Pending').length, color: '#f59e0b' },
    { label: 'Available', value: available.length, color: '#0ea5e9' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Training Programs</h1>
        <p className={styles.subtitle}>Browse and enroll in available training programs</p>
      </div>

      <div className={styles.stats}>
        {stats.map(s => (
          <div key={s.label} className={styles.stat} style={{ '--accent': s.color }}>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.tabs}>
        {['available', 'my-enrollments'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`${styles.tab} ${tab === t ? styles.activeTab : ''}`}>
            {t === 'available' ? 'Available Trainings' : 'My Enrollments'}
          </button>
        ))}
      </div>

      {tab === 'available' && (
        <div>
          {loading ? <p className="text-secondary">Loading...</p> : available.length === 0 ? (
            <div className={styles.empty}>No trainings available</div>
          ) : available.map(t => (
            <div key={t._id} className={styles.card}>
              <div className={styles.cardLayout}>
                <div className={styles.cardContent}>
                  <div className={styles.trainingTitle}>{t.title}</div>
                  <div className={styles.meta}>
                    {t.category && `${t.category} · `}
                    {t.trainer && `Trainer: ${t.trainer} · `}
                    {t.venue && `📍 ${t.venue}`}
                  </div>
                  <div className={styles.meta}>
                    📅 {new Date(t.startDate).toLocaleDateString()} – {new Date(t.endDate).toLocaleDateString()}
                    {t.maxParticipants && ` · Max ${t.maxParticipants} participants`}
                  </div>
                  {t.description && <div className={styles.description}>{t.description}</div>}
                </div>
                <div className={styles.cardActions}>
                  <span className={styles.badge} style={{ '--badge-color': STATUS_COLORS[t.status] }}>{t.status}</span>
                  {t.isPaid && <span className={styles.fee}>₹{t.fee?.toLocaleString()}</span>}
                  {enrolledIds.has(t._id) ? (
                    <span className={styles.enrolled}>✓ Enrolled</span>
                  ) : (
                    <button onClick={() => handleEnroll(t._id)} disabled={enrolling === t._id} className={styles.enrollButton}>
                      {enrolling === t._id ? 'Enrolling...' : 'Enroll'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'my-enrollments' && (
        <div>
          {loading ? <p className="text-secondary">Loading...</p> : enrollments.length === 0 ? (
            <div className={styles.empty}>You haven&apos;t enrolled in any training yet</div>
          ) : enrollments.map(e => (
            <div key={e._id} className={styles.card}>
              <div className={styles.cardLayout}>
                <div>
                  <div className={styles.enrollmentTitle}>{e.trainingId?.title}</div>
                  <div className={styles.meta}>
                    {e.trainingId?.category && `${e.trainingId.category} · `}
                    {e.trainingId?.trainer && `Trainer: ${e.trainingId.trainer}`}
                  </div>
                  {e.trainingId?.startDate && (
                    <div className={styles.meta}>
                      📅 {new Date(e.trainingId.startDate).toLocaleDateString()} – {new Date(e.trainingId.endDate).toLocaleDateString()}
                    </div>
                  )}
                  {e.trainingId?.isPaid && (
                    <div className={styles.paymentMeta}>
                      <span className="text-secondary">Fee: ₹{e.amountDue?.toLocaleString()} · Paid: ₹{(e.amountPaid || 0).toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className={styles.enrollmentBadges}>
                  <span className={styles.badge} style={{ '--badge-color': ENROLL_STATUS_COLORS[e.status] || '#6366f1' }}>{e.status || 'Enrolled'}</span>
                  {e.trainingId?.isPaid && (
                    <span className={styles.badge} style={{ '--badge-color': PAYMENT_COLORS[e.paymentStatus] }}>{e.paymentStatus}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
