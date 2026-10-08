'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listReviews, upsertReview, publishReview, deleteReview, getTeamSummary, getReviewableEmployees } from '@/api/performanceApi';
import { generateReview } from '@/api/aiApi';
import { useAuth } from '@/context/AuthContext';
import { Sparkles, Loader2 } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import styles from './PerformanceManagement.module.css';

/*
 * PerformanceManagement — Style migration log
 * Before: 107 inline style blocks
 * After:  ~39 inline style blocks
 * Removed: ~68 (static layout, spacing, color patterns)
 * Remaining inline (intentional — all dynamic/data-driven):
 *   - GRADE_COLORS[r.grade] badge bg/color
 *   - r.overallScore progress bar width & color (score-driven)
 *   - saving ? 'not-allowed' : 'pointer' and opacity (state)
 *   - aiGenerating ? ... (state)
 *   - star color: s <= value ? '#f59e0b' : '#e2e8f0' (value-driven)
 *   - i % 2 === 0 table row stripe
 *   - i === 0 top performer highlight bg/border
 *   - grade badge bg/color from GRADE_COLORS lookup
 */

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const RATING_LABELS = { punctuality: 'Punctuality', productivity: 'Productivity', teamwork: 'Teamwork', communication: 'Communication', initiative: 'Initiative', quality: 'Work Quality' };
const GRADE_COLORS  = { 'A+': '#22c55e', A: '#86efac', 'B+': '#6366f1', B: '#a5b4fc', C: '#f59e0b', D: '#fb923c', F: '#ef4444' };
const inp = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' };

/* ── Star rating sub-component ────────────────────────────────── */
function StarRating({ value, onChange, label }) {
  return (
    <div className="d-flex-col" style={{ gap: '4px' }}>
      <label className="text-sm font-semibold text-body-clr">{label}</label>
      <div className="d-flex" style={{ gap: '4px' }}>
        {[1,2,3,4,5].map(star => (
          <button key={star} type="button" onClick={() => onChange(star)}
            className="btn-ghost-base cursor-pointer"
            style={{ fontSize: '1.25rem', color: star <= (value || 0) ? '#f59e0b' : '#e2e8f0', padding: 0, lineHeight: 1 }}>
            ★
          </button>
        ))}
        {value && <span className="text-sm text-secondary" style={{ alignSelf: 'center', marginLeft: '4px' }}>{value}/5</span>}
      </div>
    </div>
  );
}

/* ── Review form (modal) ──────────────────────────────────────── */
function ReviewForm({ employees, review, onSave, onCancel }) {
  const now = new Date();
  const [form, setForm] = useState({
    employeeId:     review?.employeeId?._id || review?.employeeId || '',
    month:          review?.month   || now.getMonth() + 1,
    year:           review?.year    || now.getFullYear(),
    periodType:     review?.periodType || 'monthly',
    ratings:        review?.ratings || { punctuality: null, productivity: null, teamwork: null, communication: null, initiative: null, quality: null },
    strengths:      review?.strengths      || '',
    improvements:   review?.improvements   || '',
    goals:          review?.goals          || '',
    managerComments: review?.managerComments || '',
  });
  const [saving, setSaving]           = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const handleAiGenerate = async () => {
    if (!form.employeeId) return toast.error('Select an employee first');
    const hasRatings = Object.values(form.ratings).some(v => v !== null);
    if (!hasRatings) return toast.error('Add at least some ratings first');
    setAiGenerating(true);
    try {
      const MONTHS_LIST = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
      const period = `${MONTHS_LIST[form.month]} ${form.year}`;
      const res = await generateReview({ employeeId: form.employeeId, ratings: form.ratings, period });
      const d = res.data.data;
      setForm(f => ({ ...f, strengths: d.strengths || f.strengths, improvements: d.improvements || f.improvements, goals: d.goals || f.goals, managerComments: d.managerComments || f.managerComments }));
      toast.success('AI generated review text — review and edit before saving');
    } catch { toast.error('AI generation failed'); }
    finally { setAiGenerating(false); }
  };

  const setRating = (key, val) => setForm(f => ({ ...f, ratings: { ...f.ratings, [key]: val } }));
  const avg   = Object.values(form.ratings).filter(v => v !== null);
  const score = avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : null;

  const handleSave = async () => {
    if (!form.employeeId) return toast.error('Select an employee');
    setSaving(true);
    try { await upsertReview(form); toast.success('Review saved'); onSave(); }
    catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" style={{ overflowY: 'auto' }}>
      <div className="bg-white rounded-2xl" style={{ padding: '1.5rem', maxWidth: '580px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}>
        <h3 className="font-bold text-heading" style={{ marginBottom: '1.25rem', fontSize: '1rem' }}>
          {review ? 'Edit Performance Review' : 'New Performance Review'}
        </h3>
        <div className="d-flex-col gap-4">

          {/* Employee + period */}
          <div className="d-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="d-block text-base font-semibold text-body-clr" style={{ marginBottom: '4px' }}>Employee *</label>
              <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} style={inp}>
                <option value="">— Select —</option>
                {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
              </select>
            </div>
            <div>
              <label className="d-block text-base font-semibold text-body-clr" style={{ marginBottom: '4px' }}>Period Type</label>
              <select value={form.periodType} onChange={e => setForm(f => ({ ...f, periodType: e.target.value }))} style={inp}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="d-block text-base font-semibold text-body-clr" style={{ marginBottom: '4px' }}>Month</label>
              <select value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) }))} style={inp}>
                {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="d-block text-base font-semibold text-body-clr" style={{ marginBottom: '4px' }}>Year</label>
              <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} style={inp} />
            </div>
          </div>

          {/* Ratings */}
          <div className="rounded-xl" style={{ background: '#f8fafc', padding: '1rem' }}>
            <div className="row-between" style={{ marginBottom: '0.875rem' }}>
              <p className="font-bold text-heading" style={{ fontSize: '0.85rem' }}>Performance Ratings</p>
              {score && (
                <div className="row-center gap-2">
                  <span className="text-base text-secondary">Overall:</span>
                  <span className="font-extrabold" style={{ fontSize: '1rem', color: '#6366f1' }}>{score}/5</span>
                </div>
              )}
            </div>
            <div className="d-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              {Object.entries(RATING_LABELS).map(([key, label]) => (
                <StarRating key={key} label={label} value={form.ratings[key]} onChange={val => setRating(key, val)} />
              ))}
            </div>
          </div>

          {/* AI + comments */}
          <div className="row-between" style={{ marginBottom: 4 }}>
            <p className="font-bold text-body-clr" style={{ fontSize: '0.82rem', margin: 0 }}>Review Comments</p>
            <button type="button" onClick={handleAiGenerate} disabled={aiGenerating} className="row-center cursor-pointer font-bold"
              style={{ gap: 5, padding: '4px 10px', borderRadius: 8, border: '1.5px solid #c7d2fe', background: '#eef2ff', color: '#6366f1', fontSize: '16px', opacity: aiGenerating ? 0.7 : 1, cursor: aiGenerating ? 'not-allowed' : 'pointer' }}>
              {aiGenerating
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                : <><Sparkles size={12} /> AI Generate</>}
            </button>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

          {[['strengths', 'Strengths 💪'], ['improvements', 'Areas for Improvement 📈'], ['goals', 'Goals for Next Period 🎯'], ['managerComments', "Manager's Comments 💬"]].map(([key, label]) => (
            <div key={key}>
              <label className="d-block text-base font-semibold text-body-clr" style={{ marginBottom: '4px' }}>{label}</label>
              <textarea rows={2} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ ...inp, resize: 'vertical' }} placeholder={`Enter ${label.split(' ')[0].toLowerCase()}...`} />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="d-flex gap-3" style={{ justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button onClick={onCancel} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────── */
export default function PerformanceManagement() {
  const { user } = useAuth();
  const canManage = (user?.permissions || []).some(permission =>
    ['performance:manage', 'performance:manage_team'].includes(permission)
  );
  const [reviews, setReviews]       = useState([]);
  const [employees, setEmployees]   = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editReview, setEditReview] = useState(null);
  const [filters, setFilters]       = useState({ year: new Date().getFullYear(), month: '', status: '' });

  const fetchData = async (currentFilters) => {
    const f = currentFilters || filters;
    setLoading(true);
    try {
      const params = {};
      if (f.year)   params.year   = f.year;
      if (f.month)  params.month  = f.month;
      if (f.status) params.status = f.status;
      const [revRes, sumRes] = await Promise.all([listReviews(params), getTeamSummary(params)]);
      setReviews(revRes.data.data || []);
      setSummary(sumRes.data.data);
    } catch (err) {
      console.error('Performance fetch error:', err);
      toast.error('Failed to load performance data');
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData({ year: new Date().getFullYear(), month: '', status: '' });
    if (canManage) {
      getReviewableEmployees().then(res => setEmployees(res.data.data || [])).catch(() => {});
    }
  }, []);

  const handlePublish = async (id) => {
    try { await publishReview(id); toast.success('Review published'); fetchData(filters); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to publish'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this review?')) return;
    try { await deleteReview(id); toast.success('Deleted'); fetchData(filters); }
    catch { toast.error('Failed to delete'); }
  };

  const gradeData = summary
    ? Object.entries(summary.gradeDistribution).filter(([, v]) => v > 0).map(([g, v]) => ({ grade: g, count: v }))
    : [];

  const selInp = { padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' };

  return (
    <div className={styles.pageContainer}>

      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Performance Reports</h2>
          <p className={`text-muted text-md ${styles.pageSubtitle}`}>{reviews.length} reviews</p>
        </div>
        {canManage && <button onClick={() => { setEditReview(null); setShowForm(true); }}
          className={styles.btnNewReview}>
          + New Review
        </button>}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Reviews</p>
            <p className={styles.summaryValuePrimary}>{summary.total}</p>
            <p className={styles.summarySubtext}>{summary.published} published</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Team Avg Score</p>
            <p className={styles.summaryValueSuccess}>
              {summary.avgScore || '—'}<span className="text-muted" style={{ fontSize: '1rem' }}>/5</span>
            </p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Grade Distribution</p>
            {gradeData.length > 0 ? (
              <div className={styles.gradeBadgeGroup}>
                {gradeData.map(({ grade, count }) => (
                  <span key={grade} className={styles.gradeBadge} style={{ background: `${GRADE_COLORS[grade]}20`, color: GRADE_COLORS[grade] }}>
                    {grade}: {count}
                  </span>
                ))}
              </div>
            ) : <p className="text-muted text-md">No data</p>}
          </div>
        </div>
      )}

      {/* Top performers */}
      {summary?.topPerformers?.length > 0 && (
        <div className={styles.topPerformersCard}>
          <h3 className={styles.topPerformersTitle}>🏆 Top Performers</h3>
          <div className={styles.topPerformersList}>
            {summary.topPerformers.map((p, i) => (
              <div key={i} className={styles.performerItem} style={{
                background: i === 0 ? '#fffbeb' : '#f8fafc',
                border: `1px solid ${i === 0 ? '#fde68a' : '#e2e8f0'}`,
              }}>
                <div className={styles.performerAvatar}>
                  {p.photo ? <img src={p.photo} alt={p.name} className={styles.performerAvatarImg} /> : p.name?.[0]}
                </div>
                <div>
                  <p className={styles.performerName}>{p.name}</p>
                  <div className={styles.performerMeta}>
                    <span className="font-bold" style={{ fontSize: '16px', color: GRADE_COLORS[p.grade] }}>{p.grade}</span>
                    <span className="text-secondary" style={{ fontSize: '0.7rem' }}>{p.score}/5</span>
                  </div>
                </div>
                {i === 0 && <span className={styles.performerMedal}>🥇</span>}
                {i === 1 && <span className={styles.performerMedal}>🥈</span>}
                {i === 2 && <span className={styles.performerMedal}>🥉</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={styles.filterBar}>
        <div>
          <label className={styles.filterLabel}>Month</label>
          <select value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))} className={styles.filterSelect}>
            <option value="">All</option>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={styles.filterLabel}>Year</label>
          <input type="number" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} className={styles.filterInputYear} />
        </div>
        <div>
          <label className={styles.filterLabel}>Status</label>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className={styles.filterSelect}>
            <option value="">All</option>
            <option value="Draft">Draft</option>
            <option value="Published">Published</option>
          </select>
        </div>
        <button onClick={() => fetchData(filters)} className={styles.btnFilter}>
          Filter
        </button>
      </div>

      {/* Reviews table */}
      <div className={styles.tableCard}>
        {loading ? (
          <div className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : reviews.length === 0 ? (
          <div className="text-muted" style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</p>
            <p>{canManage ? 'No reviews found. Create the first one!' : 'No reviews found.'}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr className="bg-subtle border-default" style={{ borderBottom: '1px solid #e2e8f0' }}>
                {['Employee','Period','Score','Grade','Punctuality','Productivity','Teamwork','Status', ...(canManage ? ['Actions'] : [])].map(h => (
                  <th key={h} className="tbl-th" style={{ whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.map((r, i) => (
                <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div className="row-center gap-2">
                      <div className="d-flex align-center justify-center flex-shrink-0 font-bold text-white overflow-hidden"
                        style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: '0.75rem' }}>
                        {r.employeeId?.profilePhotoUrl
                          ? <img src={r.employeeId.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : r.employeeId?.name?.[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-heading">{r.employeeId?.name}</p>
                        <p className="text-muted" style={{ fontSize: '0.7rem' }}>{r.employeeId?.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="tbl-td" style={{ whiteSpace: 'nowrap' }}>{r.period}</td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {r.overallScore ? (
                      <div className="row-center" style={{ gap: '0.375rem' }}>
                        <div className="overflow-hidden" style={{ width: '60px', height: '6px', background: '#e2e8f0', borderRadius: '3px' }}>
                          <div style={{ height: '100%', width: `${(r.overallScore / 5) * 100}%`, background: r.overallScore >= 4 ? '#22c55e' : r.overallScore >= 3 ? '#f59e0b' : '#ef4444', borderRadius: '3px' }} />
                        </div>
                        <span className="font-bold text-heading">{r.overallScore}</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {r.grade && (
                      <span className="font-extrabold" style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', background: `${GRADE_COLORS[r.grade]}20`, color: GRADE_COLORS[r.grade] }}>
                        {r.grade}
                      </span>
                    )}
                  </td>
                  {['punctuality', 'productivity', 'teamwork'].map(key => (
                    <td key={key} style={{ padding: '0.875rem 1rem' }}>
                      <div className="d-flex" style={{ gap: '1px' }}>
                        {[1,2,3,4,5].map(s => (
                          <span key={s} style={{ fontSize: '0.75rem', color: s <= (r.ratings?.[key] || 0) ? '#f59e0b' : '#e2e8f0' }}>★</span>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span className="font-bold" style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '16px', background: r.status === 'Published' ? '#dcfce7' : '#f1f5f9', color: r.status === 'Published' ? '#166534' : '#64748b' }}>
                      {r.status}
                    </span>
                  </td>
                  {canManage && <td style={{ padding: '0.875rem 1rem' }}>
                    <div className="d-flex" style={{ gap: '0.375rem' }}>
                      <button onClick={() => { setEditReview(r); setShowForm(true); }}
                        className="cursor-pointer font-semibold"
                        style={{ padding: '3px 8px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '5px', fontSize: '0.7rem' }}>Edit</button>
                      {r.status === 'Draft' && (
                        <button onClick={() => handlePublish(r._id)}
                          className="cursor-pointer font-semibold"
                          style={{ padding: '3px 8px', background: '#dcfce7', color: '#166534', border: 'none', borderRadius: '5px', fontSize: '0.7rem' }}>Publish</button>
                      )}
                      <button onClick={() => handleDelete(r._id)}
                        className="cursor-pointer"
                        style={{ padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '5px', fontSize: '0.7rem' }}>🗑️</button>
                    </div>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManage && showForm && (
        <ReviewForm
          employees={employees}
          review={editReview}
          onSave={() => { setShowForm(false); setEditReview(null); fetchData(filters); }}
          onCancel={() => { setShowForm(false); setEditReview(null); }}
        />
      )}
    </div>
  );
}
