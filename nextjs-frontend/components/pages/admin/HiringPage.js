'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getJobs, createJob, updateJob, deleteJob, getCandidates, createCandidate, updateCandidate, deleteCandidate, getInterviews, scheduleInterview, updateInterview, uploadCandidateResume } from '@/api/hiringApi';
import { generateJobDescription } from '@/api/aiApi';
import { Briefcase, Users, CalendarDays, CheckCircle2, MapPin, Clock, Building2, Upload, FileText, Trash2, Pencil, Plus, Link2, Sparkles, Loader2 } from 'lucide-react';
import styles from './HiringPage.module.css';
const STAGES = ['Applied', 'Screening', 'Interview', 'Technical', 'HR Round', 'Offer', 'Hired', 'Rejected'];
const STAGE_COLORS = { Applied: '#6366f1', Screening: '#f59e0b', Interview: '#0ea5e9', Technical: '#8b5cf6', 'HR Round': '#ec4899', Offer: '#22c55e', Hired: '#16a34a', Rejected: '#ef4444' };

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <div className={`bg-white rounded-2xl overflow-hidden ${styles.modal}`}>
        <div className={`row-between ${styles.modalHeader}`}>
          <h3 className={`font-bold text-heading ${styles.flushHeading}`}>{title}</h3>
          <button onClick={onClose} className={`btn-ghost-base cursor-pointer text-secondary ${styles.modalClose}`}>✕</button>
        </div>
        {children}
      </div>
    </div>);

}

function JobForm({ job, onSave, onClose }) {
  const [form, setForm] = useState(job || { title: '', department: '', location: 'On-site', type: 'Full-time', description: '', salaryMin: '', salaryMax: '', openings: 1, status: 'Open', deadline: '' });
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleAiJD = async () => {
    if (!form.title) return toast.error('Enter a job title first');
    setAiGenerating(true);
    try {
      const res = await generateJobDescription({ title: form.title, department: form.department, experience: '', skills: '', type: form.type });
      const d = res.data.data;
      const desc = `${d.summary}\n\nResponsibilities:\n${d.responsibilities.map((r) => `• ${r}`).join('\n')}\n\nRequirements:\n${d.requirements.map((r) => `• ${r}`).join('\n')}${d.niceToHave?.length ? `\n\nNice to Have:\n${d.niceToHave.map((r) => `• ${r}`).join('\n')}` : ''}`;
      set('description', desc);
      toast.success('AI generated job description — review and edit before saving');
    } catch {toast.error('AI generation failed');} finally
    {setAiGenerating(false);}
  };

  const handleSave = async () => {
    if (!form.title || !form.department || !form.description) return toast.error('Title, department and description required');
    setSaving(true);
    try {
      if (job?._id) await updateJob(job._id, form);else
      await createJob(form);
      toast.success(job ? 'Job updated' : 'Job created');
      onSave();
    } catch {toast.error('Save failed');} finally
    {setSaving(false);}
  };

  return (
    <div className={styles.formStack}>
      <div className={styles.formGrid}>
        <div><label className={styles.label}>Job Title *</label><input value={form.title} onChange={(e) => set('title', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Department *</label><input value={form.department} onChange={(e) => set('department', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Location</label><input value={form.location} onChange={(e) => set('location', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)} className={styles.input}>
            {['Full-time', 'Part-time', 'Contract', 'Internship'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className={styles.label}>Min Salary (₹)</label><input type="number" value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Max Salary (₹)</label><input type="number" value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Openings</label><input type="number" min="1" value={form.openings} onChange={(e) => set('openings', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Deadline</label><input type="date" value={form.deadline?.slice(0, 10) || ''} onChange={(e) => set('deadline', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} className={styles.input}>
            {['Draft', 'Open', 'Closed', 'On Hold'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className={styles.descriptionHeader}>
        <label className={styles.label}>Description *</label>
        <button type="button" onClick={handleAiJD} disabled={aiGenerating} className={styles.aiButton}>
          {aiGenerating ? <><Loader2 size={11} className={styles.spinner} /> Generating…</> : <><Sparkles size={11} /> AI Generate</>}
        </button>
      </div>
      <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={`${styles.input} ${styles.textarea}`} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div className={styles.formActions}>
        <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
        <button onClick={handleSave} disabled={saving} className={styles.saveButton}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>);

}

function CandidateForm({ candidate, jobs, onSave, onClose }) {
  const [form, setForm] = useState(candidate || { name: '', email: '', phone: '', jobId: jobs[0]?._id || '', source: 'Other', stage: 'Applied', expectedSalary: '', noticePeriod: '', notes: '' });
  const [cvFile, setCvFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.email || !form.jobId) return toast.error('Name, email and job required');
    setSaving(true);
    try {
      let saved;
      if (candidate?._id) saved = await updateCandidate(candidate._id, form);else
      saved = await createCandidate(form);
      // Upload CV if provided
      if (cvFile) {
        const fd = new FormData();
        fd.append('resume', cvFile);
        const id = saved.data.data._id;
        await uploadCandidateResume(id, fd);
      }
      toast.success(candidate ? 'Candidate updated' : 'Candidate added');
      onSave();
    } catch {toast.error('Save failed');} finally
    {setSaving(false);}
  };

  return (
    <div className={styles.formStack}>
      <div className={styles.formGrid}>
        <div><label className={styles.label}>Name *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Email *</label><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Job Position *</label>
          <select value={form.jobId} onChange={(e) => set('jobId', e.target.value)} className={styles.input}>
            <option value="">-- Select Job --</option>
            {jobs.map((j) => <option key={j._id} value={j._id}>{j.title} — {j.department}</option>)}
          </select>
          {jobs.length === 0 && <p className={styles.emptyJobsWarning}>No open jobs yet — create a job first</p>}
        </div>
        <div><label className={styles.label}>Source</label>
          <select value={form.source} onChange={(e) => set('source', e.target.value)} className={styles.input}>
            {['LinkedIn', 'Indeed', 'Referral', 'Website', 'Walk-in', 'Other'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><label className={styles.label}>Stage</label>
          <select value={form.stage} onChange={(e) => set('stage', e.target.value)} className={styles.input}>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><label className={styles.label}>Expected Salary (₹)</label><input type="number" value={form.expectedSalary ?? ''} onChange={(e) => set('expectedSalary', e.target.value)} className={styles.input} /></div>
        <div><label className={styles.label}>Notice Period</label><input value={form.noticePeriod ?? ''} onChange={(e) => set('noticePeriod', e.target.value)} placeholder="e.g. 30 days" className={styles.input} /></div>
        <div className={styles.fullWidthField}>
          <label className={styles.label}>CV / Resume (PDF, DOC, DOCX)</label>
          <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setCvFile(e.target.files[0])} className={styles.fileInput} />
          {candidate?.resumeUrl && !cvFile &&
          <p className={styles.uploadedFileNote}>
              ✓ CV already uploaded — <a href={candidate.resumeUrl} target="_blank" rel="noreferrer" className={styles.resumeLink}>view</a>. Upload new to replace.
            </p>
          }
          {cvFile && <p className={styles.selectedFileNote}>Selected: {cvFile.name}</p>}
        </div>
      </div>
      <div><label className={styles.label}>Notes</label><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={`${styles.input} ${styles.textarea}`} /></div>
      <div className={styles.formActions}>
        <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
        <button onClick={handleSave} disabled={saving} className={styles.saveButton}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>);

}

export default function HiringPage() {
  const [tab, setTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [editCandidate, setEditCandidate] = useState(null);
  const [stageFilter, setStageFilter] = useState('');
  const [intModal, setIntModal] = useState(null); // candidate to schedule interview for
  const [intForm, setIntForm] = useState({ type: 'Technical', scheduledAt: '', duration: 60, location: '', notes: '' });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [j, c, i] = await Promise.all([getJobs(), getCandidates(), getInterviews()]);
      setJobs(j.data.data);
      setCandidates(c.data.data);
      setInterviews(i.data.data);
    } catch {toast.error('Failed to load data');} finally
    {setLoading(false);}
  };

  useEffect(() => {fetchAll();}, []);

  const handleDeleteJob = async (id) => {
    if (!confirm('Delete this job posting?')) return;
    try {await deleteJob(id);toast.success('Deleted');fetchAll();} catch {toast.error('Delete failed');}
  };

  const handleDeleteCandidate = async (id) => {
    if (!confirm('Delete this candidate?')) return;
    try {await deleteCandidate(id);toast.success('Deleted');fetchAll();} catch {toast.error('Delete failed');}
  };

  const handleResumeUpload = async (candidateId, file) => {
    if (!file) return;
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) return toast.error('Only PDF, DOC, DOCX allowed');
    try {
      const fd = new FormData();
      fd.append('resume', file);
      await uploadCandidateResume(candidateId, fd);
      toast.success('CV uploaded');
      fetchAll();
    } catch {toast.error('Upload failed');}
  };

  const handleScheduleInterview = async () => {
    if (!intForm.scheduledAt) return toast.error('Select date & time');
    try {
      await scheduleInterview({ candidateId: intModal._id, jobId: intModal.jobId?._id || intModal.jobId, ...intForm });
      toast.success('Interview scheduled');
      setIntModal(null);
      setIntForm({ type: 'Technical', scheduledAt: '', duration: 60, location: '', notes: '' });
      fetchAll();
    } catch (err) {toast.error(err.response?.data?.message || 'Failed to schedule');}
  };

  const filteredCandidates = stageFilter ? candidates.filter((c) => c.stage === stageFilter) : candidates;

  const card = { background: '#fff', borderRadius: '12px', padding: '1rem', border: '1px solid #e2e8f0', marginBottom: '0.75rem' };
  const tabBtn = (t) => ({
    padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
    background: tab === t ? '#6366f1' : '#f1f5f9', color: tab === t ? '#fff' : '#374151'
  });

  const statCards = [
  { label: 'Open Positions', value: jobs.filter((j) => j.status === 'Open').length, color: '#22c55e', bg: '#f0fdf4', Icon: Briefcase },
  { label: 'Total Candidates', value: candidates.length, color: '#6366f1', bg: '#eff6ff', Icon: Users },
  { label: 'Interviews Today', value: interviews.filter((i) => new Date(i.scheduledAt).toDateString() === new Date().toDateString()).length, color: '#f59e0b', bg: '#fffbeb', Icon: CalendarDays },
  { label: 'Hired', value: candidates.filter((c) => c.stage === 'Hired').length, color: '#0ea5e9', bg: '#f0f9ff', Icon: CheckCircle2 }];


  return (
    <div className={styles.page}>
      {/* Header */}
      <div className="row-between flex-wrap gap-3">
        <div>
          <h1 className={`section-title tracking-tight ${styles.pageTitle}`}>Hiring &amp; Recruitment</h1>
          <p className="section-subtitle">Manage job postings, candidates and interviews</p>
        </div>
        <button onClick={() => {setEditJob(null);setShowJobForm(true);}} className={`row-center gap-2 cursor-pointer font-bold text-white ${styles.createJobButton}`}>
          
          <Plus size={15} /> Create Job
        </button>
      </div>

      {/* Hero Banner — gradient is brand/design-specific, kept inline */}
      <div className={`rounded-2xl overflow-hidden relative ${styles.hero}`}>



        
        {/* Decorative blobs — absolutely positioned, purely visual */}
        <div className={styles.heroBlobLarge} />
        <div className={styles.heroBlobSmall} />
        <div className={`row-between flex-wrap gap-4 relative ${styles.heroContent}`}>
          <div>
            <p className={`font-semibold uppercase tracking-wider ${styles.heroEyebrow}`}>Recruitment Overview</p>
            <h2 className={`font-extrabold ${styles.heroTitle}`}>{jobs.filter((j) => j.status === 'Open').length} Active Positions</h2>
            <p className={styles.heroSummary}>{candidates.length} candidates in pipeline · {interviews.filter((i) => i.status === 'Scheduled').length} interviews scheduled</p>
          </div>
          <div className="d-flex gap-3">
            {[
            { label: 'Open', value: jobs.filter((j) => j.status === 'Open').length },
            { label: 'Candidates', value: candidates.length },
            { label: 'Today', value: interviews.filter((i) => new Date(i.scheduledAt).toDateString() === new Date().toDateString()).length }].
            map((s) =>
            <div key={s.label} className={`flex-shrink-0 font-semibold text-white ${styles.heroMetric}`}>
                <p className={`font-extrabold text-white ${styles.heroTitle}`}>{s.value}</p>
                <p className={`text-white ${styles.heroMetricLabel}`}>{s.label}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {statCards.map((s) =>
        <div key={s.label}
        onMouseEnter={(e) => {e.currentTarget.style.transform = 'translateY(-2px)';e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';}}
        onMouseLeave={(e) => {e.currentTarget.style.transform = 'none';e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';}} className={styles.statCard}>
            <div className={styles.statIcon} data-tone={s.label}>
              <s.Icon size={20} color={s.color} strokeWidth={2} />
            </div>
            <div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content + Sidebar Grid */}
      <div className={styles.contentGrid}>
        {/* Left: Tabs + Content */}
        <div className={styles.mainColumn}>

      {/* Tabs */}
      <div className={styles.tabs}>
        {[['jobs', Briefcase, 'Jobs', jobs.length], ['candidates', Users, 'Candidates', candidates.length], ['interviews', CalendarDays, 'Interviews', interviews.length]].map(([t, Icon, label, count]) =>
            <button key={t} onClick={() => setTab(t)} className={`${styles.tabButton} ${tab === t ? styles.active : ''}`}>
            <Icon size={14} strokeWidth={tab === t ? 2.2 : 1.8} />
            {label}
            <span className={styles.tabCount}>{count}</span>
          </button>
            )}
      </div>

      {tab === 'jobs' &&
          <div>
          {loading ? <p className={styles.loadingState}>Loading...</p> : jobs.length === 0 ?
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <Briefcase size={28} color="#6366f1" strokeWidth={1.5} />
              </div>
              <p className={styles.emptyStateTitle}>No job postings yet</p>
              <p className={styles.emptyStateText}>Create your first job posting to start hiring</p>
              <button onClick={() => setShowJobForm(true)} className={styles.emptyStateButton}>
                <Plus size={15} /> Create Job
              </button>
            </div> :
            jobs.map((job) =>
            <div key={job._id}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'} className={styles.jobCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardBody}>
                  <div className={styles.jobTitleRow}>
                    <span className={styles.jobTitle}>{job.title}</span>
                    <span className={styles.statusBadge} data-status={job.status}>{job.status}</span>
                  </div>
                  <div className={styles.jobMeta}>
                    <span className={styles.jobMetaItem}><Building2 size={13} /> {job.department}</span>
                    <span className={styles.jobMetaItem}><MapPin size={13} /> {job.location}</span>
                    <span className={styles.jobMetaItem}><Clock size={13} /> {job.type}</span>
                    <span className={styles.jobMetaItem}><Users size={13} /> {job.openings} opening{job.openings !== 1 ? 's' : ''}</span>
                    {(job.salaryMin || job.salaryMax) && <span className={styles.salary}>₹{job.salaryMin?.toLocaleString()} – ₹{job.salaryMax?.toLocaleString()}</span>}
                    {job.deadline && <span className={styles.deadline}><CalendarDays size={13} /> {new Date(job.deadline).toLocaleDateString()}</span>}
                  </div>
                  <p className={styles.jobDescription}>{job.description}</p>
                </div>
                <div className={styles.jobActions}>
                  <span className={styles.candidateCount}>{candidates.filter((c) => c.jobId?._id === job._id || c.jobId === job._id).length} candidates</span>
                  <div className={styles.buttonGroup}>
                    <button onClick={() => {setEditJob(job);setShowJobForm(true);}} className={styles.editJobButton}><Pencil size={12} /> Edit</button>
                    <button onClick={() => handleDeleteJob(job._id)} className={styles.deleteJobButton}><Trash2 size={12} /> Delete</button>
                  </div>
                </div>
              </div>
            </div>
            )}
        </div>
          }

      {tab === 'candidates' &&
          <div>
          <div className={styles.candidateToolbar}>
            <div className={styles.filterGroup}>
              <button onClick={() => setStageFilter('')} className={`${styles.filterButton} ${!stageFilter ? styles.active : ''}`}>All ({candidates.length})</button>
              {STAGES.map((s) => {
                  const cnt = candidates.filter((c) => c.stage === s).length;
                  if (!cnt) return null;
                  return (
                    <button key={s} onClick={() => setStageFilter(s)} className={`${styles.filterButton} ${stageFilter === s ? styles.active : ''}`} data-stage={s}>{s} ({cnt})</button>);

                })}
            </div>
            <button onClick={() => {setEditCandidate(null);setShowCandidateForm(true);}} className={styles.addCandidateButton}>
              <Plus size={16} /> Add Candidate
            </button>
          </div>
          {loading ? <p className={styles.loadingText}>Loading...</p> : filteredCandidates.length === 0 ?
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <Users size={28} color="#6366f1" strokeWidth={1.5} />
              </div>
              <p className={styles.emptyStateTitle}>No candidates yet</p>
              <p className={styles.emptyStateText}>Add candidates to track their progress</p>
            </div> :
            filteredCandidates.map((c) =>
            <div key={c._id} className={styles.candidateCard}>
              <div className={styles.candidateIdentity}>
                <div className={styles.candidateAvatar} data-stage={c.stage}>
                  {c.name?.[0]?.toUpperCase()}
                </div>
                <div className={styles.truncate}>
                  <p className={styles.candidateName}>{c.name}</p>
                  <p className={styles.candidateContact}>{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                  <p className={styles.candidateRole}>{c.jobId?.title} — {c.jobId?.department} · {c.source}</p>
                </div>
              </div>
              <div className={styles.candidateActions}>
                <span className={styles.stageBadge} data-stage={c.stage}>{c.stage}</span>
                {c.resumeUrl ?
                <a href={c.resumeUrl} target="_blank" rel="noreferrer" className={styles.resumeButton}><FileText size={12} /> CV</a> :
                <label className={styles.uploadButton}>
                      <Upload size={12} /> Upload CV
                      <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => handleResumeUpload(c._id, e.target.files[0])} className={styles.hiddenFileInput} />
                    </label>
                }
                <button onClick={() => {setEditCandidate(c);setShowCandidateForm(true);}} className={styles.editCandidateButton}><Pencil size={12} /> Edit</button>
                <button onClick={() => {setIntModal(c);setIntForm({ type: 'Technical', scheduledAt: '', duration: 60, location: '', notes: '' });}} className={styles.interviewButton}><CalendarDays size={12} /> Interview</button>
                <button onClick={() => handleDeleteCandidate(c._id)} className={styles.deleteCandidateButton}><Trash2 size={12} /></button>
              </div>
            </div>
            )}
        </div>
          }

      {tab === 'interviews' &&
          <div>
          {loading ? <p className={styles.loadingText}>Loading...</p> : interviews.length === 0 ?
            <div className={styles.emptyState}>
              <div className={styles.interviewEmptyIcon}>
                <CalendarDays size={28} color="#f59e0b" strokeWidth={1.5} />
              </div>
              <p className={styles.emptyStateTitle}>No interviews scheduled</p>
              <p className={styles.emptyStateText}>Schedule interviews from the Candidates tab</p>
            </div> :
            interviews.map((i) =>
            <div key={i._id} className={styles.interviewCard}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.candidateName}>{i.candidateId?.name} <span className={styles.mutedInline}>— Round {i.round}</span></p>
                  <p className={styles.interviewSubtitle}>{i.jobId?.title} · {i.type}</p>
                  <div className={styles.interviewMeta}>
                    <span className={styles.interviewMetaItem}><CalendarDays size={13} /> {new Date(i.scheduledAt).toLocaleString()}</span>
                    <span className={styles.interviewMetaItem}><Clock size={13} /> {i.duration} min</span>
                    {i.location && <span className={styles.interviewMetaItem}><MapPin size={13} /> {i.location}</span>}
                    {i.meetLink && <a href={i.meetLink} target="_blank" rel="noreferrer" className={styles.meetingLink}><Link2 size={13} /> Join Meeting</a>}
                  </div>
                </div>
                <div className={styles.interviewBadges}>
                  <span className={styles.interviewBadge} data-status={i.status}>{i.status}</span>
                  {i.result && <span className={styles.interviewBadge} data-status={i.result}>{i.result}</span>}
                </div>
              </div>
              {i.feedback && <p className={styles.feedback}>💬 &ldquo;{i.feedback}&rdquo;</p>}
            </div>
            )}
        </div>
          }

        </div>

        {/* Right Sidebar */}
        <div className={styles.sidebar}>
          {/* Hiring Summary */}
          <div className={styles.sidebarCard}>
            <p className={styles.sidebarTitle}>Hiring Summary</p>
            <div className={styles.sidebarList}>
              {[
              { label: 'Open Positions', value: jobs.filter((j) => j.status === 'Open').length, color: '#22c55e' },
              { label: 'Total Applications', value: candidates.length, color: '#6366f1' },
              { label: 'Interviews Scheduled', value: interviews.filter((i) => i.status === 'Scheduled').length, color: '#f59e0b' },
              { label: 'Hired This Year', value: candidates.filter((c) => c.stage === 'Hired').length, color: '#0ea5e9' }].
              map((item) =>
              <div key={item.label} className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>{item.label}</span>
                  <span className={styles.summaryValue} data-label={item.label}>{item.value}</span>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Interviews */}
          <div className={styles.sidebarCard}>
            <p className={styles.sidebarTitle}>Upcoming Interviews</p>
            {interviews.filter((i) => i.status === 'Scheduled' && new Date(i.scheduledAt) >= new Date()).slice(0, 4).length === 0 ?
            <p className={styles.sidebarEmptyText}>No upcoming interviews</p> :

            <div className={styles.sidebarList}>
                {interviews.filter((i) => i.status === 'Scheduled' && new Date(i.scheduledAt) >= new Date()).slice(0, 4).map((i) =>
              <div key={i._id} className={styles.upcomingInterview}>
                    <p className={styles.upcomingName}>{i.candidateId?.name || 'Candidate'}</p>
                    <p className={styles.upcomingTime}>{i.type} · {new Date(i.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at {new Date(i.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
              )}
              </div>
            }
          </div>

          {/* Pipeline Stages */}
          <div className={styles.sidebarCard}>
            <p className={styles.sidebarTitle}>Pipeline</p>
            <div className={styles.pipelineList}>
              {['Applied', 'Screening', 'Interview', 'Offered', 'Hired', 'Rejected'].map((stage) => {
                const count = candidates.filter((c) => c.stage === stage).length;
                if (!count) return null;
                return (
                  <div key={stage} className={styles.pipelineRow}>
                    <span className={styles.pipelineLabel}>{stage}</span>
                    <div className={styles.pipelineTrack}>
                      <progress className={styles.pipelineProgress} value={count} max={Math.max(candidates.length, 1)} />
                    </div>
                    <span className={styles.pipelineCount}>{count}</span>
                  </div>);

              })}
            </div>
          </div>
        </div>
      </div>

      {showJobForm &&
      <Modal title={editJob ? 'Edit Job Posting' : 'New Job Posting'} onClose={() => setShowJobForm(false)}>
          <JobForm job={editJob} onSave={() => {setShowJobForm(false);fetchAll();}} onClose={() => setShowJobForm(false)} />
        </Modal>
      }
      {showCandidateForm &&
      <Modal title={editCandidate ? 'Edit Candidate' : 'Add Candidate'} onClose={() => setShowCandidateForm(false)}>
          <CandidateForm candidate={editCandidate} jobs={jobs} onSave={() => {setShowCandidateForm(false);fetchAll();}} onClose={() => setShowCandidateForm(false)} />
        </Modal>
      }

      {/* Schedule Interview Modal */}
      {intModal &&
      <Modal title={`Schedule Interview — ${intModal.name}`} onClose={() => setIntModal(null)}>
          <div className={`d-flex-col ${styles.interviewForm}`}>
            <div className={`d-grid ${styles.interviewFormGrid}`}>
              <div>
                <label className={`d-block text-base font-semibold text-body-clr ${styles.fieldLabel}`}>Interview Type</label>
                <select value={intForm.type} onChange={(e) => setIntForm((f) => ({ ...f, type: e.target.value }))} className={styles.interviewInput}>
                  <option>Technical</option>
                  <option>HR</option>
                  <option>Managerial</option>
                  <option>Cultural Fit</option>
                  <option>Final</option>
                </select>
              </div>
              <div>
                <label className={`d-block text-base font-semibold text-body-clr ${styles.fieldLabel}`}>Duration (min)</label>
                <input type="number" value={intForm.duration} onChange={(e) => setIntForm((f) => ({ ...f, duration: Number(e.target.value) }))} className={styles.interviewInput} />
              </div>
            </div>
            <div>
              <label className={`d-block text-base font-semibold text-body-clr ${styles.fieldLabel}`}>Date &amp; Time *</label>
              <input type="datetime-local" required value={intForm.scheduledAt} onChange={(e) => setIntForm((f) => ({ ...f, scheduledAt: e.target.value }))} className={styles.interviewInput} />
            </div>
            <div>
              <label className={`d-block text-base font-semibold text-body-clr ${styles.fieldLabel}`}>Location / Link</label>
              <input value={intForm.location} onChange={(e) => setIntForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Conference Room A or Google Meet link" className={styles.interviewInput} />
            </div>
            <div>
              <label className={`d-block text-base font-semibold text-body-clr ${styles.fieldLabel}`}>Notes (optional)</label>
              <textarea rows={2} value={intForm.notes} onChange={(e) => setIntForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any special instructions..." className={styles.interviewTextarea} />
            </div>
            <div className={`d-flex gap-3 ${styles.interviewFormActions}`}>
              <button type="button" onClick={() => setIntModal(null)} className={styles.secondaryButton}>
              
                Cancel
              </button>
              <button type="button" onClick={handleScheduleInterview} className={styles.scheduleButton}>
              
                Schedule Interview
              </button>
            </div>
          </div>
        </Modal>
      }
    </div>);

}
