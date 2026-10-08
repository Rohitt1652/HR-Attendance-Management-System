'use client';
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getMyCV, updateMyCV, uploadCVFile } from '@/api/cvApi';

const inp = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: '4px' };
const card = { background: '#fff', borderRadius: '12px', padding: '1.25rem', border: '1px solid #e2e8f0', marginBottom: '1rem' };

export default function MyCVPage() {
  const [cv, setCv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState('upload');
  const fileRef = useRef();

  const fetchCV = async () => {
    try { const r = await getMyCV(); setCv(r.data.data); }
    catch { toast.error('Failed to load CV'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCV(); }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) return toast.error('Only PDF, DOC, DOCX allowed');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('cv', file);
      const r = await uploadCVFile(fd);
      setCv(r.data.data);
      toast.success('CV uploaded successfully');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); fileRef.current.value = ''; }
  };

  const handleSave = async () => {
    setSaving(true);
    try { const r = await updateMyCV(cv); setCv(r.data.data); toast.success('CV saved'); }
    catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const addItem = (field, template) => setCv(c => ({ ...c, [field]: [...(c[field] || []), template] }));
  const removeItem = (field, i) => setCv(c => ({ ...c, [field]: c[field].filter((_, idx) => idx !== i) }));
  const updateItem = (field, i, key, val) => setCv(c => ({ ...c, [field]: c[field].map((item, idx) => idx === i ? { ...item, [key]: val } : item) }));

  const tabBtn = (t) => ({ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: tab === t ? '#6366f1' : '#f1f5f9', color: tab === t ? '#fff' : '#374151' });

  if (loading) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>My CV</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Upload your CV file or build one here</p>
        </div>
        {tab === 'builder' && (
          <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.25rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save CV'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button onClick={() => setTab('upload')} style={tabBtn('upload')}>Upload CV File</button>
        <button onClick={() => setTab('builder')} style={tabBtn('builder')}>CV Builder</button>
      </div>

      {tab === 'upload' && (
        <div style={card}>
          <h3 style={{ fontWeight: 700, color: '#1e293b', marginBottom: '1rem', marginTop: 0 }}>Upload Your CV</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem' }}>Upload a PDF, DOC, or DOCX file (max 10MB). This will be visible to HR and admins.</p>

          <div style={{ border: '2px dashed #e2e8f0', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', background: '#f8fafc', cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 0.25rem' }}>Click to upload or drag and drop</p>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>PDF, DOC, DOCX up to 10MB</p>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} style={{ display: 'none' }} />
          </div>

          {uploading && <p style={{ textAlign: 'center', color: '#6366f1', marginTop: '1rem', fontWeight: 600 }}>Uploading...</p>}

          {cv?.fileUrl && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📎</span>
                <div>
                  <p style={{ fontWeight: 600, color: '#166534', margin: 0, fontSize: '0.85rem' }}>{cv.fileName || 'CV File'}</p>
                  <p style={{ fontSize: '0.72rem', color: '#4ade80', margin: 0 }}>Uploaded successfully</p>
                </div>
              </div>
              <a href={cv.fileUrl} target="_blank" rel="noreferrer"
                style={{ padding: '6px 14px', background: '#22c55e', color: '#fff', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>
                View
              </a>
            </div>
          )}
        </div>
      )}

      {tab === 'builder' && cv && (
        <div>
          {/* Personal Info */}
          <div style={card}>
            <h3 style={{ fontWeight: 700, color: '#1e293b', marginBottom: '1rem', marginTop: 0 }}>Personal Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div><label style={lbl}>Full Name</label><input value={cv.fullName || ''} onChange={e => setCv(c => ({ ...c, fullName: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Email</label><input value={cv.email || ''} onChange={e => setCv(c => ({ ...c, email: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Phone</label><input value={cv.phone || ''} onChange={e => setCv(c => ({ ...c, phone: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Address</label><input value={cv.address || ''} onChange={e => setCv(c => ({ ...c, address: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>LinkedIn</label><input value={cv.linkedIn || ''} onChange={e => setCv(c => ({ ...c, linkedIn: e.target.value }))} placeholder="https://linkedin.com/in/..." style={inp} /></div>
              <div><label style={lbl}>Website / Portfolio</label><input value={cv.website || ''} onChange={e => setCv(c => ({ ...c, website: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Professional Summary</label><textarea value={cv.summary || ''} onChange={e => setCv(c => ({ ...c, summary: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} /></div>
            </div>
          </div>

          {/* Experience */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>Work Experience</h3>
              <button onClick={() => addItem('experience', { company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' })}
                style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
            </div>
            {(cv.experience || []).map((exp, i) => (
              <div key={i} style={{ padding: '1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div><label style={lbl}>Job Title</label><input value={exp.title} onChange={e => updateItem('experience', i, 'title', e.target.value)} style={inp} /></div>
                  <div><label style={lbl}>Company</label><input value={exp.company} onChange={e => updateItem('experience', i, 'company', e.target.value)} style={inp} /></div>
                  <div><label style={lbl}>Location</label><input value={exp.location} onChange={e => updateItem('experience', i, 'location', e.target.value)} style={inp} /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.25rem' }}>
                    <input type="checkbox" checked={exp.current} onChange={e => updateItem('experience', i, 'current', e.target.checked)} />
                    <label style={{ fontSize: '0.82rem', color: '#374151' }}>Currently working here</label>
                  </div>
                  <div><label style={lbl}>Start Date</label><input type="month" value={exp.startDate} onChange={e => updateItem('experience', i, 'startDate', e.target.value)} style={inp} /></div>
                  {!exp.current && <div><label style={lbl}>End Date</label><input type="month" value={exp.endDate} onChange={e => updateItem('experience', i, 'endDate', e.target.value)} style={inp} /></div>}
                  <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Description</label><textarea value={exp.description} onChange={e => updateItem('experience', i, 'description', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
                </div>
                <button onClick={() => removeItem('experience', i)} style={{ marginTop: '0.5rem', padding: '3px 10px', background: '#fee2e2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', color: '#991b1b' }}>Remove</button>
              </div>
            ))}
          </div>

          {/* Education */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>Education</h3>
              <button onClick={() => addItem('education', { institution: '', degree: '', field: '', startYear: '', endYear: '', grade: '' })}
                style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
            </div>
            {(cv.education || []).map((edu, i) => (
              <div key={i} style={{ padding: '1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Institution</label><input value={edu.institution} onChange={e => updateItem('education', i, 'institution', e.target.value)} style={inp} /></div>
                  <div><label style={lbl}>Degree</label><input value={edu.degree} onChange={e => updateItem('education', i, 'degree', e.target.value)} style={inp} /></div>
                  <div><label style={lbl}>Field of Study</label><input value={edu.field} onChange={e => updateItem('education', i, 'field', e.target.value)} style={inp} /></div>
                  <div><label style={lbl}>Start Year</label><input value={edu.startYear} onChange={e => updateItem('education', i, 'startYear', e.target.value)} placeholder="2018" style={inp} /></div>
                  <div><label style={lbl}>End Year</label><input value={edu.endYear} onChange={e => updateItem('education', i, 'endYear', e.target.value)} placeholder="2022" style={inp} /></div>
                  <div><label style={lbl}>Grade / GPA</label><input value={edu.grade} onChange={e => updateItem('education', i, 'grade', e.target.value)} style={inp} /></div>
                </div>
                <button onClick={() => removeItem('education', i)} style={{ marginTop: '0.5rem', padding: '3px 10px', background: '#fee2e2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', color: '#991b1b' }}>Remove</button>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>Skills</h3>
              <button onClick={() => addItem('skills', { name: '', level: 'Intermediate' })}
                style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {(cv.skills || []).map((skill, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <input value={skill.name} onChange={e => updateItem('skills', i, 'name', e.target.value)} placeholder="Skill name" style={{ ...inp, flex: 1, padding: '0.375rem 0.5rem' }} />
                  <select value={skill.level} onChange={e => updateItem('skills', i, 'level', e.target.value)} style={{ ...inp, width: 'auto', padding: '0.375rem 0.5rem' }}>
                    {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(l => <option key={l}>{l}</option>)}
                  </select>
                  <button onClick={() => removeItem('skills', i)} style={{ padding: '3px 7px', background: '#fee2e2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', color: '#991b1b', flexShrink: 0 }}>x</button>
                </div>
              ))}
            </div>
          </div>

          {/* Certifications */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>Certifications</h3>
              <button onClick={() => addItem('certifications', { name: '', issuer: '', year: '', url: '' })}
                style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
            </div>
            {(cv.certifications || []).map((cert, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end', marginBottom: '0.5rem' }}>
                <div><label style={lbl}>Name</label><input value={cert.name} onChange={e => updateItem('certifications', i, 'name', e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Issuer</label><input value={cert.issuer} onChange={e => updateItem('certifications', i, 'issuer', e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Year</label><input value={cert.year} onChange={e => updateItem('certifications', i, 'year', e.target.value)} style={inp} /></div>
                <div><label style={lbl}>URL</label><input value={cert.url} onChange={e => updateItem('certifications', i, 'url', e.target.value)} style={inp} /></div>
                <button onClick={() => removeItem('certifications', i)} style={{ padding: '6px 10px', background: '#fee2e2', border: 'none', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', color: '#991b1b' }}>x</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '2rem' }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.625rem 2rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save CV'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
