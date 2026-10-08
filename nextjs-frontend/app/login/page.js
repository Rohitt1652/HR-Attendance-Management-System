'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { login as loginApi } from '@/api/authApi';
import { Eye, EyeOff } from 'lucide-react';

const MANAGER_ROLES = ['admin', 'hr', 'md', 'team_lead'];

// Validate: accept valid email OR employee ID pattern like DT-123, MAS-288, RM-01, CS-5
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isValidEmpId = (v) => /^[A-Za-z]+-\d+$/.test(v.trim());

export default function LoginPage() {
  const { login, token, user } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [branding, setBranding] = useState({ companyLogo: '', companyName: 'WorkforceOS', companyTagline: 'Smart HR & Attendance Portal' });

  useEffect(() => {
    if (!token || !user) return;
    router.replace(MANAGER_ROLES.includes(user.role) ? '/admin/dashboard' : '/employee/dashboard');
  }, [token, user, router]);

  useEffect(() => {
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(data => {
        const d = data?.data;
        if (d) setBranding({
          companyLogo: d.companyLogo || '',
          companyName: d.companyName || 'WorkforceOS',
          companyTagline: d.companyTagline || 'Smart HR & Attendance Portal',
        });
      })
      .catch(() => {});
  }, []);

  const validate = () => {
    const errs = { email: '', password: '' };
    const v = form.email.trim();
    if (!v) {
      errs.email = 'Email or Employee ID is required';
    } else if (!isValidEmail(v) && !isValidEmpId(v)) {
      errs.email = 'Enter a valid email or Employee ID (e.g. MAS-288)';
    }
    if (!form.password) {
      errs.password = 'Password is required';
    } else if (form.password.length < 4) {
      errs.password = 'Password must be at least 4 characters';
    }
    setErrors(errs);
    return !errs.email && !errs.password;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const isEmployeeId = !form.email.includes('@');
      const payload = {
        password: form.password,
        ...(isEmployeeId ? { employeeId: form.email.trim().toUpperCase() } : { email: form.email.trim() }),
      };
      const res = await loginApi(payload);
      const { token, user } = res.data.data;
      login(token, user);
      toast.success(`Welcome back, ${user.name?.split(' ')[0]}!`);
      router.push(MANAGER_ROLES.includes(user.role) ? '/admin/dashboard' : '/employee/dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid credentials';
      // Show inline error under the identifier field for auth failures
      setErrors(prev => ({ ...prev, email: msg }));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (hasError) => ({
    width: '100%',
    height: '44px',
    paddingLeft: '40px',
    paddingRight: '12px',
    border: `1.5px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
    borderRadius: '12px',
    fontSize: '0.875rem',
    outline: 'none',
    color: '#0f172a',
    background: hasError ? '#fff5f5' : '#f8fafc',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  });

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0f9ff 100%)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Decorative blobs */}
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,35,126,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-10%', left: '-5%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(198,40,40,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {branding.companyLogo ? (
            <img
            src="/login-logo.png"
            alt={branding.companyName}
            style={{
              maxHeight: '72px',
              maxWidth: '220px',
              objectFit: 'contain',
              margin: '0 auto 0.75rem',
              display: 'block'
            }}
          />
          ) : (
            <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #1a237e, #6b2fa0, #c62828)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', boxShadow: '0 8px 24px rgba(107,47,160,0.35)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
          )}
          <p style={{ color: '#c62828', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '4px' }}>{branding.companyTagline}</p>
        </div>

        {/* Card */}
        <div style={{ background: '#ffffff', borderRadius: '24px', padding: '2.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 60px -10px rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.08)' }}>
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Sign in to your account</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
            {/* Email / Employee ID field */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Email or Employee ID
              </label>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: errors.email ? '#ef4444' : '#94a3b8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <input
                  type="text"
                  value={form.email}
                  onChange={(e) => { setForm({ ...form, email: e.target.value }); if (errors.email) setErrors(prev => ({ ...prev, email: '' })); }}
                  placeholder="email@company.com or MAS-288"
                  style={inputStyle(!!errors.email)}
                  onFocus={e => { if (!errors.email) { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; e.target.style.background = '#fff'; } }}
                  onBlur={e => { if (!errors.email) { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; } }}
                />
              </div>
              {errors.email && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: errors.password ? '#ef4444' : '#94a3b8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); if (errors.password) setErrors(prev => ({ ...prev, password: '' })); }}
                  placeholder="••••••••"
                  style={{ ...inputStyle(!!errors.password), paddingRight: '44px' }}
                  onFocus={e => { if (!errors.password) { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; e.target.style.background = '#fff'; } }}
                  onBlur={e => { if (!errors.password) { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; } }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: '4px' }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {errors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{ height: '46px', background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.25rem', boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,0.35)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
            >
              {loading ? (
                <>
                  <svg style={{ animation: 'spin 1s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          © 2026 WorkforceOS. All Rights Reserved.
        </p>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
