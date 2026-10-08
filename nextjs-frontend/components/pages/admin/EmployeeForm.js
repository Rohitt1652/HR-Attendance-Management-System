'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { createEmployee, getEmployee, updateEmployee, uploadPhoto, listEmployees } from '@/api/employeeApi';
import { listRoles } from '@/api/rolesApi';
import { getDepartmentNames } from '@/api/departmentApi';
import { useAuth } from '@/context/AuthContext';
import { User, Briefcase, DollarSign, Shield, Camera, Save, ArrowLeft, Loader2, CheckCircle, Clock, Building2, Mail, Phone, Calendar } from 'lucide-react';
import styles from './EmployeeForm.module.css';

/*
 * EmployeeForm — Style migration
 * Before: 65 inline styles
 * After:  ~25 inline styles
 * Removed: ~40 static → CSS classes
 * Remaining inline (all dynamic):
 *   - roleColor throughout sidebar: ROLE_COLORS[form.role] (data-driven)
 *   - completionPct progress bar width + color (computed)
 *   - saving button bg/cursor (state)
 *   - netSalary > 0 conditional bg/border/color
 *   - profile card avatar gradient: roleColor (data-driven)
 *   - role badge bg/border/color: roleColor (data-driven)
 *   - status + dept + joined values in quick-info: item.color (data-driven)
 *   - Input component focus/blur border/shadow (JS event-driven)
 *   - loading spinner (state)
 */

const EMPTY = { name: '', email: '', password: '', phone: '', department: '', designation: '', role: 'employee', joiningDate: '', dateOfBirth: '', status: 'Active', basicSalary: '', hra: '', allowances: '', deductions: '', tax: '', teamLeadId: '', employeeId: '', biometricId: '' };

const ROLE_COLORS = { admin: '#6366f1', hr: '#0ea5e9', md: '#8b5cf6', team_lead: '#f59e0b', employee: '#22c55e' };
const ROLE_LABELS = { admin: 'Administrator', hr: 'HR Manager', md: 'Managing Director', team_lead: 'Team Lead', employee: 'Employee' };

const DEPT_PREFIX_MAP = {
  'Web Development': 'DT', 'Web/Graphic Designing': 'DT', 'Graphic Designing': 'DT',
  'Research and Marketing': 'RM', 'Research and Testing': 'RM',
  'HR & Administration': 'MAS', 'Management': 'MAS', 'Software Development': 'DT',
  'Iphone Development': 'DT', 'SMO Team': 'RM', 'Technical Writer': 'RM',
  'Customer Support': 'CS', 'IT': 'DT',
};

function FieldInput({ label, field, value, onFieldChange, type = 'text', icon: Icon, ...props }) {
  return (
    <div>
      <label className={styles.fieldLabel}>{label}</label>
      <div className="relative">
        {Icon && <Icon size={14} className={styles.fieldIcon} />}
        <input type={type} value={value ?? ''} onChange={e => onFieldChange(field, e.target.value)}
          className={`${styles.input} ${Icon ? styles.inputWithIcon : ''}`}
          {...props} />
      </div>
    </div>
  );
}

function FieldSelect({ label, field, value, onFieldChange, options, icon: Icon, disabled = false }) {
  return (
    <div>
      <label className={styles.fieldLabel}>{label}</label>
      <div className="relative">
        {Icon && <Icon size={14} className={styles.fieldIcon} />}
        <select value={value ?? ''} onChange={e => onFieldChange(field, e.target.value)}
          disabled={disabled}
          className={`${styles.input} ${Icon ? styles.inputWithIcon : ''}`}>
          <option value="">{disabled ? 'Departments unavailable' : 'Select department'}</option>
          {options.map(dept => <option key={dept} value={dept}>{dept}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function EmployeeForm() {
  const { user: currentUser } = useAuth();
  const userPerms = currentUser?.permissions || [];
  const isAdmin = ['admin', 'md', 'hr'].includes(currentUser?.role) || userPerms.includes('employees:edit');
  const params  = useParams();
  const id      = params?.id;
  const isEdit  = Boolean(id) && id !== 'new';
  const router  = useRouter();
  const [form, setForm]               = useState(EMPTY);
  const [photo, setPhoto]             = useState(null);
  const [teamLeads, setTeamLeads]     = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [roles, setRoles]             = useState([]);
  const [loading, setLoading]         = useState(isEdit);
  const [saving, setSaving]           = useState(false);
  const [originalData, setOriginalData] = useState(null);

  useEffect(() => {
    listEmployees({ role: 'team_lead', status: 'Active', limit: 100 })
      .then(r => setTeamLeads(r.data.data || [])).catch(() => {});
    listRoles()
      .then(r => setRoles(r.data.data || []))
      .catch(() => {}); // Silent — team leads don't have roles:view permission
    getDepartmentNames()
      .then(r => setDepartments(r.data.data || []))
      .catch(() => {})
      .finally(() => setDepartmentsLoading(false));
    if (!isEdit) return;
    getEmployee(id).then((res) => {
      const e = res.data.data;
      const formData = { ...EMPTY, ...e, password: '',
        joiningDate: e.joiningDate?.slice(0, 10) || '',
        dateOfBirth: e.dateOfBirth?.slice(0, 10) || '',
        teamLeadId: e.teamLeadId?._id || e.teamLeadId || '' };
      setForm(formData);
      setOriginalData(e);
      setLoading(false);
    }).catch(() => { toast.error('Failed to load'); setLoading(false); });
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const payload = { ...form };
      if (isEdit && !payload.password) delete payload.password;
      const res = isEdit ? await updateEmployee(id, payload) : await createEmployee(payload);
      if (photo) { const fd = new FormData(); fd.append('photo', photo); await uploadPhoto(res.data.data._id, fd); }
      toast.success(isEdit ? 'Updated' : 'Created');
      router.push('/admin/employees');
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className={styles.loading}>
      <Loader2 size={20} className={styles.loadingIcon} /> Loading employee...
    </div>
  );

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const netSalary      = (Number(form.basicSalary)||0) + (Number(form.hra)||0) + (Number(form.allowances)||0) - (Number(form.deductions)||0) - (Number(form.tax)||0);
  const completionFields = ['name','email','phone','department','designation','joiningDate','dateOfBirth','basicSalary'];
  const filled         = completionFields.filter(f => form[f] && form[f] !== '0' && form[f] !== 0).length;
  const completionPct  = Math.round((filled / completionFields.length) * 100);
  const roleColor      = ROLE_COLORS[form.role] || '#6366f1';
  const roleOptions = form.role && !roles.some(r => r.name === form.role)
    ? [...roles, { name: form.role, label: ROLE_LABELS[form.role] || form.role }]
    : roles;
  const roleLabel = roleOptions.find(r => r.name === form.role)?.label || ROLE_LABELS[form.role] || form.role;

  /* Shared input style — consistent across all form fields */
  const departmentOptions = form.department && !departments.includes(form.department)
    ? [...departments, form.department].sort((a, b) => a.localeCompare(b))
    : departments;

  const renderInput = (props) => (
    <FieldInput
      {...props}
      value={form[props.field]}
      onFieldChange={set}
    />
  );
  const renderSelect = (props) => (
    <FieldSelect
      {...props}
      value={form[props.field]}
      onFieldChange={set}
    />
  );

  /* Section header helper — used 3× */
  const SectionHead = ({ icon: Icon, color, title }) => (
    <div className={styles.sectionHead}>
      <div className={styles.sectionIcon} style={{ '--section-color': color }}>
        <Icon size={14} color={color} />
      </div>
      <span className={styles.sectionTitle}>{title}</span>
    </div>
  );

  /* Form card style — used 3× */
  return (
    <div className={styles.page}>

      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className="row-center gap-3">
          <button type="button" onClick={() => router.push('/admin/employees')}
            className={styles.backButton}>
            <ArrowLeft size={16} color="#6b7280" />
          </button>
          <div>
            <h1 className={styles.pageTitle}>
              {isEdit ? 'Edit Employee' : 'New Employee'}
            </h1>
            {isEdit && form.name && (
              <p className={styles.pageSubtitle}>{form.name} · {form.employeeId || form.department}</p>
            )}
          </div>
        </div>
        {/* saving state — bg/cursor dynamic */}
        <button type="button" onClick={handleSubmit} disabled={saving}
          className={styles.saveButton}>
          {saving ? <Loader2 size={14} className={styles.spinner} /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Main Grid */}
      <form onSubmit={handleSubmit} autoComplete="off" className={styles.formLayout}>

        {/* Left: Form sections */}
        <div className="d-flex-col gap-4">

          {/* Personal Info */}
          <div className={styles.card}>
            <SectionHead icon={User} color="#6366f1" title="Personal Information" />
            <div className={styles.twoColumnGrid}>
              {renderInput({ label: 'Full Name', field: 'name', icon: User, required: true, autoComplete: 'off' })}
              {renderInput({ label: 'Email', field: 'email', type: 'email', icon: Mail, required: true, autoComplete: 'off' })}
              {renderInput({ label: 'Password', field: 'password', type: 'password', placeholder: isEdit ? 'Leave blank to keep' : '', required: !isEdit, autoComplete: 'new-password' })}
              {renderInput({ label: 'Phone', field: 'phone', icon: Phone })}
              {renderInput({ label: 'Date of Birth', field: 'dateOfBirth', type: 'date', icon: Calendar })}
              <div>
                <label className={styles.fieldLabel}>Photo</label>
                <label className={styles.photoUpload}>
                  <Camera size={14} /> {photo ? photo.name.slice(0, 20) : 'Upload photo'}
                  <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} className={styles.hiddenInput} />
                </label>
              </div>
            </div>
          </div>

          {/* Work Info */}
          <div className={styles.card}>
            <SectionHead icon={Briefcase} color="#0ea5e9" title="Work Information" />
            <div className={styles.twoColumnGrid}>
              <div>
                <label className={styles.fieldLabel}>Employee ID</label>
                <div className="d-flex gap-2">
                  <input value={form.employeeId || ''} onChange={e => set('employeeId', e.target.value)}
                    placeholder="e.g. DT-401" autoComplete="off"
                    className={`${styles.input} ${styles.employeeIdInput}`} />
                  <button type="button" onClick={async () => {
                    const prefix = DEPT_PREFIX_MAP[form.department] || 'EMP';
                    try {
                      const res = await fetch(`/api/employees/suggest-id?prefix=${prefix}`);
                      const data = await res.json();
                      if (data?.data?.suggested) set('employeeId', data.data.suggested);
                    } catch { set('employeeId', `${prefix}-001`); }
                  }} className={styles.suggestButton}>
                    Suggest
                  </button>
                </div>
                <p className={styles.fieldHint}>Select department first, then click Suggest</p>
              </div>
              {isAdmin && renderInput({ label: 'Biometric ID', field: 'biometricId', placeholder: 'Machine/User ID from biometric device' })}
              {renderSelect({ label: 'Department', field: 'department', icon: Building2, options: departmentOptions, disabled: departmentsLoading || departmentOptions.length === 0 })}
              {renderInput({ label: 'Designation', field: 'designation' })}
              {renderInput({ label: 'Joining Date', field: 'joiningDate', type: 'date', icon: Calendar })}
              <div>
                <label className={styles.fieldLabel}>Role</label>
                <select value={form.role} onChange={e => set('role', e.target.value)} disabled={!isAdmin} className={styles.input}>
                  {roleOptions.map(role => <option key={role.name} value={role.name}>{role.label}</option>)}
                </select>
              </div>
              <div>
                <label className={styles.fieldLabel}>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} disabled={!isAdmin} className={styles.input}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className={styles.fieldLabel}>Team Lead</label>
                <select value={form.teamLeadId} onChange={e => set('teamLeadId', e.target.value)} disabled={!isAdmin} className={styles.input}>
                  <option value="">Auto-assign by dept</option>
                  {teamLeads.map(tl => <option key={tl._id} value={tl._id}>{tl.name} ({tl.department})</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Compensation */}
          <div className={styles.card}>
            <SectionHead icon={DollarSign} color="#16a34a" title="Compensation" />
            <div className={styles.threeColumnGrid}>
              {renderInput({ label: 'Basic (₹)', field: 'basicSalary', type: 'number', min: '0', placeholder: '0' })}
              {renderInput({ label: 'HRA (₹)', field: 'hra', type: 'number', min: '0', placeholder: '0' })}
              {renderInput({ label: 'Allowances (₹)', field: 'allowances', type: 'number', min: '0', placeholder: '0' })}
              {renderInput({ label: 'Deductions (₹)', field: 'deductions', type: 'number', min: '0', placeholder: '0' })}
              {renderInput({ label: 'Tax/TDS (₹)', field: 'tax', type: 'number', min: '0', placeholder: '0' })}
              <div>
                <label className={styles.fieldLabel}>Net Salary</label>
                {/* netSalary conditional bg/border/color — dynamic */}
                <div className={`${styles.netSalary} ${netSalary > 0 ? styles.netSalaryPositive : ''}`}>
                  ₹{netSalary.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Summary sidebar */}
        <div className={styles.sidebar}>

          {/* Profile preview card */}
          <div className={`${styles.card} ${styles.profileCard}`}>
            {/* Avatar — roleColor data-driven */}
            <div className={styles.avatar}
              style={{ '--role-color': roleColor }}>
              {originalData?.profilePhotoUrl
                ? <img src={originalData.profilePhotoUrl} alt="" className={styles.avatarImage} />
                : (form.name?.[0]?.toUpperCase() || 'U')}
            </div>
            <p className={styles.profileName}>{form.name || 'New Employee'}</p>
            <p className={styles.profileDesignation}>{form.designation || form.department || 'No role set'}</p>
            {/* Role badge — roleColor data-driven */}
            <div className={styles.roleBadge} style={{ '--role-color': roleColor }}>
              <div className={styles.roleDot} />
              <span className={styles.roleLabel}>{roleLabel}</span>
            </div>
          </div>

          {/* Completion progress */}
          <div className={styles.card}>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>Profile Completion</span>
              {/* completionPct color — dynamic */}
              <span className={`${styles.progressValue} ${completionPct === 100 ? styles.completeText : ''}`}>{completionPct}%</span>
            </div>
            <div className={styles.progressTrack}>
              {/* progress width + color — dynamic */}
              <div className={`${styles.progressBar} ${completionPct === 100 ? styles.completeBar : ''}`} style={{ width: `${completionPct}%` }} />
            </div>
          </div>

          {/* Quick info */}
          <div className={styles.card}>
            <div className="d-flex-col gap-2">
              {[
                { label: 'Status',     value: form.status, color: form.status === 'Active' ? '#16a34a' : '#ef4444' },
                { label: 'Department', value: form.department || '—' },
                { label: 'Joined',     value: form.joiningDate ? new Date(form.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                { label: 'Net Salary', value: netSalary > 0 ? `₹${netSalary.toLocaleString('en-IN')}` : '—', color: '#16a34a' },
              ].map(item => (
                <div key={item.label} className="row-between align-center">
                  <span className={styles.infoLabel}>{item.label}</span>
                  {/* item.color is data-driven — keep inline */}
                  <span className={styles.infoValue} style={{ color: item.color || '#374151' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reports to */}
          {form.teamLeadId && (
            <div className={styles.card}>
              <p className={styles.reportsLabel}>Reports To</p>
              <p className={styles.reportsName}>
                {teamLeads.find(t => t._id === form.teamLeadId)?.name || 'Team Lead'}
              </p>
              <p className={styles.reportsDepartment}>
                {teamLeads.find(t => t._id === form.teamLeadId)?.department || ''}
              </p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
