'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getAllCVs } from '@/api/cvApi';

const LEVEL_COLORS = { Beginner: '#94a3b8', Intermediate: '#3b82f6', Advanced: '#8b5cf6', Expert: '#22c55e' };

export default function AdminCVPage() {
  const [cvs, setCvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getAllCVs()
      .then(r => setCvs(r.data.data || []))
      .catch(() => toast.error('Failed to load CVs'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = cvs.filter(cv => {
    const name = cv.userId?.name?.toLowerCase() || '';
    const dept = cv.userId?.department?.toLowerCase() || '';
    const q = search.toLowerCase();
    return name.includes(q) || dept.includes(q);
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Employee CVs</h1>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>View and download employee CVs and profiles</p>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {/* List */}
        <div style={{ width: '320px', flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or department..."
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box', marginBottom: '0.75rem' }} />
          {loading ? <p className="text-muted">Loading...</p> : filtered.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>No CVs found</p>
          ) : filtered.map(cv => (
            <div key={cv._id} onClick={() => setSelected(cv)}
              style={{ padding: '0.875rem 1rem', background: selected?._id === cv._id ? '#eff6ff' : '#fff', border: `1px solid ${selected?._id === cv._id ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '10px', marginBottom: '0.5rem', cursor: 'pointer', transition: 'all 0.1s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>
                  {cv.userId?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.85rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cv.userId?.name || 'Unknown'}</p>
                  <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0 }}>{cv.userId?.designation || cv.userId?.department || '—'}</p>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                  {cv.fileUrl && <span style={{ fontSize: '0.65rem', padding: '1px 6px', background: '#dcfce7', color: '#166534', borderRadius: '10px', fontWeight: 600 }}>File</span>}
                  {cv.fullName && <span style={{ fontSize: '0.65rem', padding: '1px 6px', background: '#dbeafe', color: '#1d4ed8', borderRadius: '10px', fontWeight: 600 }}>Built</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📝</div>
              <p className="font-semibold">Select an employee to view their CV</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <h2 style={{ fontWeight: 800, color: '#1e293b', margin: '0 0 0.25rem' }}>{selected.fullName || selected.userId?.name}</h2>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>{selected.userId?.designation} · {selected.userId?.department}</p>
                  {selected.email && <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>✉ {selected.email}</p>}
                  {selected.phone && <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>📞 {selected.phone}</p>}
                  {selected.linkedIn && <a href={selected.linkedIn} target="_blank" rel="noreferrer" style={{ fontSize: '0.82rem', color: '#6366f1' }}>🔗 LinkedIn</a>}
                </div>
                {selected.fileUrl && (
                  <a href={selected.fileUrl} target="_blank" rel="noreferrer"
                    style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                    ⬇ Download CV
                  </a>
                )}
              </div>

              {selected.summary && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Summary</p>
                  <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.7, margin: 0 }}>{selected.summary}</p>
                </div>
              )}

              {selected.experience?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Experience</p>
                  {selected.experience.map((exp, i) => (
                    <div key={i} style={{ paddingLeft: '1rem', borderLeft: '2px solid #e2e8f0', marginBottom: '0.875rem' }}>
                      <p style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem', margin: '0 0 2px' }}>{exp.title} — {exp.company}</p>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 4px' }}>{exp.startDate} – {exp.current ? 'Present' : exp.endDate}{exp.location ? ` · ${exp.location}` : ''}</p>
                      {exp.description && <p style={{ fontSize: '0.82rem', color: '#475569', margin: 0 }}>{exp.description}</p>}
                    </div>
                  ))}
                </div>
              )}

              {selected.education?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Education</p>
                  {selected.education.map((edu, i) => (
                    <div key={i} style={{ paddingLeft: '1rem', borderLeft: '2px solid #e2e8f0', marginBottom: '0.75rem' }}>
                      <p style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem', margin: '0 0 2px' }}>{edu.degree} in {edu.field}</p>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>{edu.institution} · {edu.startYear} – {edu.endYear}{edu.grade ? ` · ${edu.grade}` : ''}</p>
                    </div>
                  ))}
                </div>
              )}

              {selected.skills?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Skills</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {selected.skills.map((s, i) => (
                      <span key={i} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: `${LEVEL_COLORS[s.level]}20`, color: LEVEL_COLORS[s.level] }}>
                        {s.name} · {s.level}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selected.certifications?.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Certifications</p>
                  {selected.certifications.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                      <span style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.issuer} {c.year && `· ${c.year}`}</span>
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: '#6366f1' }}>View</a>}
                    </div>
                  ))}
                </div>
              )}

              {!selected.fullName && !selected.fileUrl && !selected.experience?.length && (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0', fontStyle: 'italic' }}>This employee hasn&apos;t filled in their CV yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
