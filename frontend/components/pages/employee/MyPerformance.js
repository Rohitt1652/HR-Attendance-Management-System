'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getMyReviews } from '@/api/performanceApi';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import styles from './MyPerformance.module.css';

const GRADE_COLORS = { 'A+': '#22c55e', A: '#16a34a', 'B+': '#6366f1', B: '#4f46e5', C: '#f59e0b', D: '#fb923c', F: '#ef4444' };
const RATING_LABELS = { punctuality: 'Punctuality', productivity: 'Productivity', teamwork: 'Teamwork', communication: 'Communication', initiative: 'Initiative', quality: 'Quality' };

function ReviewCard({ review, onSelect, isSelected }) {
  const color = GRADE_COLORS[review.grade] || '#6366f1';
  return (
    <div className={`card card--sm ${styles.reviewCard} ${isSelected ? styles.selectedReview : ''}`} onClick={() => onSelect(review)} style={{ '--grade-color': color }}>
      <div className={styles.reviewHeader}>
        <div>
          <p className={styles.reviewPeriod}>{review.period}</p>
          <p className={styles.reviewer}>by {review.reviewedBy?.name}</p>
        </div>
        {review.grade && (
          <span className={styles.gradeBadge}>{review.grade}</span>
        )}
      </div>
      {review.overallScore && (
        <div>
          <div className={styles.scoreHeader}>
            <span className={styles.scoreLabel}>Overall Score</span>
            <span className={styles.scoreValue}>{review.overallScore}/5</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ '--progress': `${(review.overallScore / 5) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyPerformance() {
  const [reviews, setReviews] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyReviews()
      .then(res => {
        const data = res.data.data || [];
        setReviews(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const radarData = selected ? Object.entries(RATING_LABELS).map(([key, label]) => ({
    subject: label.split(' ')[0],
    score: selected.ratings?.[key] || 0,
    fullMark: 5,
  })) : [];

  const trendData = [...reviews].reverse().map(r => ({
    period: r.period,
    score: r.overallScore || 0,
  }));

  if (loading) return <div className={`text-muted ${styles.loading}`}>Loading...</div>;

  return (
    <div className={`admin-page-stack ${styles.page}`}>
      <div>
        <h2 className={styles.title}>My Performance</h2>
        <p className={styles.subtitle}>{reviews.length} review{reviews.length !== 1 ? 's' : ''} available</p>
      </div>

      {reviews.length === 0 ? (
        <div className={`card card--lg ${styles.empty}`}>
          <p className={styles.emptyIcon}>📊</p>
          <p className="text-muted">No performance reviews yet</p>
        </div>
      ) : (
        <div className={styles.layout}>
          {/* Review list */}
          <div className={styles.reviewList}>
            {reviews.map(r => (
              <ReviewCard key={r._id} review={r} onSelect={setSelected} isSelected={selected?._id === r._id} />
            ))}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className={styles.detail}>
              {/* Header */}
              <div className={styles.detailHeader} style={{ '--grade-color': GRADE_COLORS[selected.grade] || '#6366f1' }}>
                <div className={styles.detailHeaderContent}>
                  <div>
                    <h3 className={styles.detailTitle}>{selected.period}</h3>
                    <p className={styles.detailReviewer}>Reviewed by {selected.reviewedBy?.name}</p>
                  </div>
                  <div className={styles.gradeSummary}>
                    <p className={styles.largeGrade}>{selected.grade || '—'}</p>
                    <p className={styles.overall}>{selected.overallScore}/5 overall</p>
                  </div>
                </div>
              </div>

              {/* Radar chart + individual scores */}
              <div className={styles.twoColumn}>
                <div className={`card ${styles.panel}`}>
                  <h4 className={styles.panelTitle}>Performance Radar</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 5]} tick={false} />
                      <Radar name="Score" dataKey="score" stroke={GRADE_COLORS[selected.grade] || '#6366f1'} fill={GRADE_COLORS[selected.grade] || '#6366f1'} fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className={`card ${styles.panel}`}>
                  <h4 className={styles.panelTitle}>Individual Scores</h4>
                  {Object.entries(RATING_LABELS).map(([key, label]) => {
                    const val = selected.ratings?.[key] || 0;
                    return (
                      <div key={key} className={styles.rating}>
                        <div className={styles.ratingHeader}>
                          <span className={styles.ratingLabel}>{label}</span>
                          <span className={styles.ratingValue}>{val}/5</span>
                        </div>
                        <div className={`${styles.progressTrack} ${styles.ratingTrack}`}>
                          <div className={styles.progressFill} style={{ '--progress': `${(val / 5) * 100}%`, '--grade-color': val >= 4 ? '#22c55e' : val >= 3 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trend chart */}
              {trendData.length > 1 && (
                <div className={`card ${styles.panel}`}>
                  <h4 className={styles.panelTitle}>Performance Trend</h4>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Feedback sections */}
              <div className={styles.feedbackGrid}>
                {[
                  ['💪 Strengths', selected.strengths, '#f0fdf4', '#bbf7d0', '#166534'],
                  ['📈 Areas to Improve', selected.improvements, '#fef2f2', '#fecaca', '#991b1b'],
                  ['🎯 Goals', selected.goals, '#eff6ff', '#bfdbfe', '#1d4ed8'],
                  ["💬 Manager's Comments", selected.managerComments, '#faf5ff', '#e9d5ff', '#6b21a8'],
                ].map(([title, content, bg, border, color]) => content ? (
                  <div key={title} className={styles.feedbackCard} style={{ '--feedback-bg': bg, '--feedback-border': border, '--feedback-color': color }}>
                    <p className={styles.feedbackTitle}>{title}</p>
                    <p className={styles.feedbackContent}>{content}</p>
                  </div>
                ) : null)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
