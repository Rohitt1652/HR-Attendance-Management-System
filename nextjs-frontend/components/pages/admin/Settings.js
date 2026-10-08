'use client';
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getSettings, updateSettings, addHoliday, removeHoliday, getDepartments, addDepartment, updateDepartment, removeDepartment } from '@/api/settingsApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import LeaveTypeManager from './LeaveTypeManager';
import LeaveAllocationManager from './LeaveAllocationManager';
import styles from './Settings.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SATURDAY_RULES = [
  ['all_saturdays_off', 'All Saturdays Off'],
  ['first_second_off', '1st & 2nd Saturday Off'],
  ['second_fourth_off', '2nd & 4th Saturday Off'],
  ['no_saturday_off', 'No Saturday Off'],
  ['custom', 'Custom Saturday Off Configuration'],
];

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionIcon}>{icon}</span>
      <div>
        <p className={styles.sectionTitle}>{title}</p>
        {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
      </div>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const [brand, setBrand] = useState({ companyName: '', companyTagline: '', companyLogo: '', companyFavicon: '', companyEmail: '', companyPhone: '', companyAddress: '', companyWebsite: '' });
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState('');
  const [editDept, setEditDept] = useState(null);
  const logoRef = useRef();
  const faviconRef = useRef();

  useEffect(() => {
    getSettings()
      .then((res) => {
        const d = res.data.data;
        setSettings(d);
        setBrand({
          companyName: d.companyName || '',
          companyTagline: d.companyTagline || '',
          companyLogo: d.companyLogo || '',
          companyFavicon: d.companyFavicon || '',
          companyEmail: d.companyEmail || '',
          companyPhone: d.companyPhone || '',
          companyAddress: d.companyAddress || '',
          companyWebsite: d.companyWebsite || '',
        });
        setDepartments(d.departments || []);
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
    getDepartments().then(r => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Logo must be under 2MB');
    const reader = new FileReader();
    reader.onload = (ev) => setBrand(b => ({ ...b, companyLogo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const handleFaviconUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) return toast.error('Favicon must be under 512KB');
    const reader = new FileReader();
    reader.onload = (ev) => setBrand(b => ({ ...b, companyFavicon: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const handleSaveBrand = async () => {
    setSavingBrand(true);
    try {
      const res = await updateSettings(brand);
      setSettings(res.data.data);
      toast.success('Company settings saved');
    } catch { toast.error('Failed to save'); }
    finally { setSavingBrand(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateSettings({
        officeStartTime: settings.officeStartTime,
        lateThreshold: settings.lateThreshold,
        fullDayRequiredHours: settings.fullDayRequiredHours,
        halfDayRequiredHours: settings.halfDayRequiredHours,
        saturdayRequiredHours: settings.saturdayRequiredHours,
        saturdayOffRule: settings.saturdayOffRule,
        customSaturdayOffs: settings.customSaturdayOffs || [],
        weekendDays: settings.weekendDays,
        inactivityTimeoutMinutes: settings.inactivityTimeoutMinutes,
      });
      setSettings(res.data.data);
      toast.success('Settings saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleAddHoliday = async () => {
    if (!holiday.date || !holiday.name) return;
    try { const res = await addHoliday(holiday); setSettings(res.data.data); setHoliday({ date: '', name: '' }); toast.success('Holiday added'); }
    catch { toast.error('Failed to add holiday'); }
  };

  const handleRemoveHoliday = async (date) => {
    try { const res = await removeHoliday(new Date(date).toISOString().slice(0, 10)); setSettings(res.data.data); toast.success('Holiday removed'); }
    catch { toast.error('Failed to remove holiday'); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-page-stack" style={{ gap: '1.5rem' }}>
      <div className="admin-header">
        <h2 className={styles.headerTitle}>⚙️ Settings</h2>
        <p className={styles.headerSubtitle}>Manage company branding, attendance rules and holidays</p>
      </div>

      <div className={`card card--lg ${styles.cardContainer}`}>
        <SectionHeader icon="" title="Company Branding" subtitle="Logo, name and contact details shown across the portal" />
        <div className={styles.twoColumnGrid}>
          <div>
            <label className="form-label">Company Name *</label>
            <input className="form-input" value={brand.companyName} onChange={e => setBrand(b => ({ ...b, companyName: e.target.value }))} placeholder="e.g. Acme Technologies" />
          </div>
          <div>
            <label className="form-label">Tagline</label>
            <input className="form-input" value={brand.companyTagline} onChange={e => setBrand(b => ({ ...b, companyTagline: e.target.value }))} placeholder="e.g. Building the Future" />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" value={brand.companyEmail} onChange={e => setBrand(b => ({ ...b, companyEmail: e.target.value }))} placeholder="hr@company.com" />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input className="form-input" value={brand.companyPhone} onChange={e => setBrand(b => ({ ...b, companyPhone: e.target.value }))} placeholder="+91 98765 43210" />
          </div>
        </div>
        <div>
          <label className="form-label">Website</label>
          <input className="form-input" value={brand.companyWebsite} onChange={e => setBrand(b => ({ ...b, companyWebsite: e.target.value }))} placeholder="https://company.com" />
        </div>
        <div>
          <label className="form-label">Address</label>
          <textarea value={brand.companyAddress} onChange={e => setBrand(b => ({ ...b, companyAddress: e.target.value }))} placeholder="Office address..." rows={2} className="form-textarea" style={{ resize: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          <input ref={faviconRef} type="file" accept="image/png,image/x-icon,image/svg+xml,image/jpeg" onChange={handleFaviconUpload} style={{ display: 'none' }} />
          <button type="button" onClick={() => logoRef.current.click()} className="btn btn--secondary btn--sm">Upload Logo</button>
          <button type="button" onClick={() => faviconRef.current.click()} className="btn btn--secondary btn--sm">Upload Favicon</button>
          {brand.companyLogo && <button type="button" onClick={() => setBrand(b => ({ ...b, companyLogo: '' }))} className="btn btn--danger btn--sm">Remove Logo</button>}
          {brand.companyFavicon && <button type="button" onClick={() => setBrand(b => ({ ...b, companyFavicon: '' }))} className="btn btn--danger btn--sm">Remove Favicon</button>}
        </div>
        <button onClick={handleSaveBrand} disabled={savingBrand}
          className="btn btn--primary" style={{ alignSelf: 'flex-start', opacity: savingBrand ? 0.7 : 1 }}>
          {savingBrand ? 'Saving...' : 'Save Branding'}
        </button>
      </div>

      {/* Attendance Settings */}
      <div className={`card card--lg ${styles.cardContainer}`}>
        <SectionHeader icon="" title="Attendance Settings" subtitle="Company working rules, weekly offs and attendance calculations" />
        <div className={styles.twoColumnGrid}>
          <div>
            <label className="form-label">Office Start Time</label>
            <input className="form-input" type="time" value={settings.officeStartTime || '09:00'} onChange={(e) => setSettings({ ...settings, officeStartTime: e.target.value })} />
          </div>
          <div>
            <label className="form-label">Late Coming Threshold Time</label>
            <input className="form-input" type="time" value={settings.lateThreshold || '10:00'} onChange={(e) => setSettings({ ...settings, lateThreshold: e.target.value })} />
          </div>
          <div>
            <label className="form-label">Full Day Required Hours</label>
            <input className="form-input" type="number" step="0.25" min="0" value={settings.fullDayRequiredHours ?? 9} onChange={(e) => setSettings({ ...settings, fullDayRequiredHours: parseFloat(e.target.value) })} />
          </div>
          <div>
            <label className="form-label">Half Day Required Hours</label>
            <input className="form-input" type="number" step="0.25" min="0" value={settings.halfDayRequiredHours ?? 4.5} onChange={(e) => setSettings({ ...settings, halfDayRequiredHours: parseFloat(e.target.value) })} />
          </div>
          <div>
            <label className="form-label">Saturday Required Hours</label>
            <input className="form-input" type="number" step="0.25" min="0" value={settings.saturdayRequiredHours ?? 4} onChange={(e) => setSettings({ ...settings, saturdayRequiredHours: parseFloat(e.target.value) })} />
          </div>
          <div>
            <label className="form-label">Inactivity Timeout (minutes)</label>
            <input className="form-input" type="number" value={settings.inactivityTimeoutMinutes || 30} onChange={(e) => setSettings({ ...settings, inactivityTimeoutMinutes: parseInt(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="form-label">Weekly Off Rules</label>
          <select className="form-select" value={settings.saturdayOffRule || 'second_fourth_off'} onChange={(e) => setSettings({ ...settings, saturdayOffRule: e.target.value })}>
            {SATURDAY_RULES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {settings.saturdayOffRule === 'custom' && (
          <div>
            <label className="form-label">Custom Saturday Off Configuration</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => {
                  const current = settings.customSaturdayOffs || [];
                  setSettings({ ...settings, customSaturdayOffs: current.includes(n) ? current.filter(x => x !== n) : [...current, n].sort() });
                }} style={{ padding: '0.375rem 0.75rem', borderRadius: 999, border: `1.5px solid ${(settings.customSaturdayOffs || []).includes(n) ? '#2563eb' : '#e2e8f0'}`, background: (settings.customSaturdayOffs || []).includes(n) ? '#eff6ff' : '#fff', color: (settings.customSaturdayOffs || []).includes(n) ? '#1d4ed8' : '#64748b', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                  {n}{n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} Saturday
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ padding: '0.75rem', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.76rem' }}>
          Sunday is treated as a weekly off. Holidays are read from Calendar holiday events and automatically override working rules.
        </div>
        <button onClick={handleSave} disabled={saving}
          className="btn btn--primary" style={{ alignSelf: 'flex-start', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Attendance Settings'}
        </button>
      </div>

      {/* Email / SMTP Settings */}
      <div className={`card card--lg ${styles.cardContainer}`}>
        <SectionHeader icon="📧" title="Email Notifications (SMTP)" subtitle="Configure SMTP to send leave approval/rejection emails to employees" />
        <div className={styles.twoColumnGrid}>
          <div>
            <label className="form-label">SMTP Host</label>
            <input className="form-input" value={settings.smtpHost || ''} onChange={e => setSettings({ ...settings, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="form-label">SMTP Port</label>
            <input className="form-input" type="number" value={settings.smtpPort || 587} onChange={e => setSettings({ ...settings, smtpPort: parseInt(e.target.value) })} style={{ width: '100px' }} />
          </div>
          <div>
            <label className="form-label">SMTP Username / Email</label>
            <input className="form-input" value={settings.smtpUser || ''} onChange={e => setSettings({ ...settings, smtpUser: e.target.value })} placeholder="noreply@yourcompany.com" />
          </div>
          <div>
            <label className="form-label">SMTP Password / App Password</label>
            <input className="form-input" type="password" value={settings.smtpPass || ''} onChange={e => setSettings({ ...settings, smtpPass: e.target.value })} placeholder="••••••••" />
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '0.75rem', color: '#92400e' }}>
          💡 For Gmail: use an <strong>App Password</strong> (not your regular password). Enable 2FA → Google Account → Security → App Passwords.
          For other providers, use their SMTP settings. Leave blank to disable email notifications.
        </div>
        <button onClick={handleSave} disabled={saving}
          className="btn btn--primary" style={{ marginTop: '1rem', alignSelf: 'flex-start', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : '💾 Save Email Settings'}
        </button>
      </div>

      {/* Holidays */}
      <div className={`card card--lg ${styles.cardContainer}`}>
        <SectionHeader icon="🎉" title="Holiday Calendar" subtitle="Add public and company holidays" />
        <div className={styles.holidayInputGroup}>
          <input className="form-input" type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} style={{ width: 'auto' }} />
          <input className="form-input" type="text" placeholder="Holiday name" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} style={{ flex: 1, minWidth: '160px' }} />
          <button onClick={handleAddHoliday} className={styles.btnAddHoliday}>+ Add</button>
        </div>
        <div className={styles.holidayList}>
          {settings.holidays.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No holidays added yet.</p>}
          {settings.holidays.sort((a, b) => new Date(a.date) - new Date(b.date)).map((h) => (
            <div key={h._id} className={styles.holidayRow}>
              <span>🗓️ {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} — <strong>{h.name}</strong></span>
              <button onClick={() => handleRemoveHoliday(h.date)} className={styles.btnRemoveHoliday}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
