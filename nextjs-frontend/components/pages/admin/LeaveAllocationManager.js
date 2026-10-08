'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getAllocations, updateAllocation, getLeaveTypes } from '@/api/leaveApi';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

const ROLES = ['employee', 'team_lead', 'hr', 'admin', 'md'];
const ROLE_LABELS = { employee: 'Employee', team_lead: 'Team Lead', hr: 'HR', admin: 'Admin', md: 'MD' };
const ROLE_COLORS = { employee: '#22c55e', team_lead: '#f59e0b', hr: '#0ea5e9', admin: '#6366f1', md: '#8b5cf6' };
const EXCLUDE_FROM_TOTAL = ['MPL', 'LOP', 'SHRT', 'SHORT'];
const activeLeaveTypesOnly = (types = []) => types.filter(type => type.isActive !== false);

const inp = { padding: '0.4rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' };

function AllocationRow({ role, lt, alloc, onSave }) {
  const fixedPeriod = lt.birthdayOnly ? 'birthday' : null;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    daysAllowed: alloc?.daysAllowed ?? lt.maxDaysPerYear ?? 0,
    h1Days: alloc?.h1Days ?? '',
    carryForward: alloc?.carryForward !== false,
    period: lt.birthdayOnly ? 'birthday' : (alloc?.period || 'biannual'),
    isEarned: !!(alloc?.isEarned && lt.isFreeHand),
    notApplicable: !!alloc?.notApplicable,
  });
  const [saving, setSaving] = useState(false);
  const [copyingAll, setCopyingAll] = useState(false);
  const effectivePeriod = fixedPeriod || form.period;

  useEffect(() => {
    setForm({
      daysAllowed: alloc?.daysAllowed ?? lt.maxDaysPerYear ?? 0,
      h1Days: alloc?.h1Days ?? '',
      carryForward: alloc?.carryForward !== false,
      period: lt.birthdayOnly ? 'birthday' : (alloc?.period || 'biannual'),
      isEarned: !!(alloc?.isEarned && lt.isFreeHand),
      notApplicable: !!alloc?.notApplicable,
    });
  }, [alloc, lt.isFreeHand, lt.maxDaysPerYear]);

  const daysAllowed = Number(form.daysAllowed) || 0;
  const h1Auto = form.h1Days === '' ? Number((daysAllowed / 2).toFixed(1)) : Number(form.h1Days);
  const h2Base = Number((daysAllowed - h1Auto).toFixed(1));
  const color = ROLE_COLORS[role] || '#6366f1';
  const isHourlyOnly = lt.allowHourly && !lt.allowFullDay && !lt.allowHalfDay;
  const countLabel = lt.birthdayOnly ? 'birthday short leave' : 'short leave';

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAllocation({
        role,
        leaveTypeCode: lt.code,
        daysAllowed: (form.isEarned || form.notApplicable) ? 0 : daysAllowed,
        h1Days: form.h1Days === '' ? null : Number(form.h1Days),
        carryForward: form.carryForward,
        period: effectivePeriod,
        isEarned: form.isEarned,
        notApplicable: form.notApplicable,
      });
      toast.success('Saved');
      await onSave();
      setOpen(false);
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const handleCopyToAllRoles = async () => {
    if (!confirm('Copy these settings to ALL roles (Employee, Team Lead, HR, Admin, MD)?')) return;
    setCopyingAll(true);
    try {
      await Promise.all(ROLES.map(r => updateAllocation({
        role: r,
        leaveTypeCode: lt.code,
        daysAllowed: (form.isEarned || form.notApplicable) ? 0 : daysAllowed,
        h1Days: form.h1Days === '' ? null : Number(form.h1Days),
        carryForward: form.carryForward,
        period: effectivePeriod,
        isEarned: form.isEarned,
        notApplicable: form.notApplicable,
      })));
      toast.success('Copied to all roles');
      await onSave();
      setOpen(false);
    } catch { toast.error('Copy failed'); }
    finally { setCopyingAll(false); }
  };

  return (
    <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', overflow: 'hidden', marginBottom: '0.5rem' }}>
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: open ? '#f8fafc' : '#fff', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lt.color || '#6366f1', flexShrink: 0 }} />
        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>{lt.name}</span>
        <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>{lt.code}</span>
        {effectivePeriod === 'biannual' ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>H1: <strong>{h1Auto}d</strong></span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>H2: <strong>{h2Base}d{form.carryForward ? '+CF' : ''}</strong></span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{form.notApplicable ? 'Not applicable' : `Total: ${form.daysAllowed}d`}</span>
          </div>
        ) : effectivePeriod === 'monthly' ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{form.notApplicable ? 'Not applicable' : `Monthly: ${form.daysAllowed}x/month${lt.code === 'SHRT' ? ' · 2h each' : ''}`}</span>
        ) : effectivePeriod === 'birthday' ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{form.notApplicable ? 'Not applicable' : `Birthday: ${form.daysAllowed}x/year · 2h each`}</span>
        ) : isHourlyOnly ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{form.notApplicable ? 'Not applicable' : `${form.daysAllowed}x · 2h each`}</span>
        ) : (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{form.notApplicable ? 'Not applicable' : `Annual: ${form.daysAllowed}d`}</span>
        )}
        {open ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
      </div>

      {/* Edit panel */}
      {open && (
        <div style={{ padding: '1rem', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
          {/* Not applicable toggle */}
          {(
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.75rem', background: form.notApplicable ? '#fef2f2' : '#fff', border: '1px solid ' + (form.notApplicable ? '#fecaca' : '#e2e8f0'), borderRadius: '10px', marginBottom: '0.875rem', cursor: 'pointer' }}
              onClick={() => setForm(f => {
                const nextNotApplicable = !f.notApplicable;
                return {
                  ...f,
                  notApplicable: nextNotApplicable,
                  daysAllowed: nextNotApplicable ? 0 : (lt.maxDaysPerYear || 5),
                };
              })}>
              <input type="checkbox" checked={form.notApplicable} onChange={() => {}} style={{ accentColor: '#ef4444', width: '16px', height: '16px' }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.82rem', color: '#991b1b', margin: 0 }}>Not Applicable for {ROLE_LABELS[role]}</p>
                <p style={{ fontSize: '0.72rem', color: '#7f1d1d', margin: '2px 0 0' }}>
                  Set to 0 days — this role cannot apply for this leave type.
                </p>
              </div>
            </div>
          )}

          {(
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.875rem', marginBottom: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  {effectivePeriod === 'monthly' ? 'Times per Month' : effectivePeriod === 'birthday' ? 'Times per Birthday Year' : isHourlyOnly ? 'Times Allowed' : 'Total Days / Year'}
                </label>
                <input type="number" min="0" step="0.5" value={form.daysAllowed} onChange={e => setForm(f => ({ ...f, daysAllowed: e.target.value }))} style={inp} />
                {effectivePeriod === 'monthly' && lt.code === 'SHRT' && (
                  <p style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: '3px' }}>Each application = 2 hours max. Resets every month.</p>
                )}
                {effectivePeriod === 'monthly' && lt.code !== 'SHRT' && (
                  <p style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px' }}>Resets every month.</p>
                )}
                {effectivePeriod === 'birthday' && (
                  <p style={{ fontSize: '0.68rem', color: '#ec4899', marginTop: '3px' }}>Only available on employee birthday. Each {countLabel} = 2 hours max.</p>
                )}
                {isHourlyOnly && effectivePeriod !== 'monthly' && effectivePeriod !== 'birthday' && (
                  <p style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: '3px' }}>Each {countLabel} = 2 hours max.</p>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Period</label>
                <select value={effectivePeriod} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} disabled={!!fixedPeriod} style={{ ...inp, background: fixedPeriod ? '#f1f5f9' : inp.background }}>
                  <option value="biannual">Bi-Annual (H1 + H2)</option>
                  <option value="annual">Annual (full year)</option>
                  <option value="monthly">Monthly (resets each month)</option>
                  <option value="birthday">Birthday only</option>
                </select>
              </div>
              {effectivePeriod === 'biannual' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                    H1 Days <span style={{ color: '#94a3b8', fontWeight: 400 }}>(blank = auto {h1Auto}d)</span>
                  </label>
                  <input type="number" min="0" max={form.daysAllowed} step="0.5" value={form.h1Days} onChange={e => setForm(f => ({ ...f, h1Days: e.target.value }))} placeholder={'Auto (' + h1Auto + ')'} style={inp} />
                </div>
              )}
              {effectivePeriod === 'biannual' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.25rem' }}>
                  <input type="checkbox" id={'cf-' + role + '-' + lt.code} checked={form.carryForward} onChange={e => setForm(f => ({ ...f, carryForward: e.target.checked }))} />
                  <label htmlFor={'cf-' + role + '-' + lt.code} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                    Carry Forward H1 unused days to H2
                  </label>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={handleCopyToAllRoles} disabled={copyingAll} style={{ padding: '0.4rem 0.875rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.75rem', cursor: copyingAll ? 'not-allowed' : 'pointer', color: '#166534', fontWeight: 600 }}>
              {copyingAll ? 'Copying...' : '📋 Copy to all roles'}
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setOpen(false)} style={{ padding: '0.4rem 0.875rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.78rem', cursor: 'pointer', color: '#64748b' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '0.4rem 1rem', background: color, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeaveAllocationManager() {
  const [allocations, setAllocations] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState('employee');

  const fetchData = async () => {
    try {
      const [allocRes, typeRes] = await Promise.all([getAllocations(), getLeaveTypes()]);
      setAllocations(allocRes.data.data);
      setLeaveTypes(activeLeaveTypesOnly(typeRes.data.data));
    } catch { toast.error('Failed to load allocations'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const getAlloc = (role, code) => allocations.find(a => a.role === role && a.leaveTypeCode === code);

  const totalForRole = (role) => allocations
    .filter(a => (
      a.role === role
      && leaveTypes.some(lt => lt.code === a.leaveTypeCode)
      && a.period !== 'monthly'
      && a.period !== 'birthday'
      && !EXCLUDE_FROM_TOTAL.includes(a.leaveTypeCode)
      && !a.isEarned
    ))
    .reduce((s, a) => s + (a.daysAllowed || 0), 0);

  if (loading) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#0f172a', margin: 0 }}>Leave Allocation</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '4px' }}>
          Configure leave quotas per role with bi-annual split and carry-forward rules
        </p>
      </div>

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <Info size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '1px' }} />
        <div style={{ fontSize: '0.78rem', color: '#1d4ed8', lineHeight: 1.6 }}>
          <strong>Bi-Annual System:</strong> The year is split into H1 (Jan–Jun) and H2 (Jul–Dec).
          Each half has its own quota. If <strong>Carry Forward</strong> is enabled, unused H1 days are added to H2.
          Set H1 days manually or leave blank for auto 50/50 split.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {ROLES.map(role => (
          <button key={role} onClick={() => setActiveRole(role)}
            style={{ padding: '0.5rem 1rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: activeRole === role ? 700 : 500, fontSize: '0.82rem',
              background: activeRole === role ? ROLE_COLORS[role] : '#f1f5f9',
              color: activeRole === role ? '#fff' : '#64748b',
              boxShadow: activeRole === role ? '0 2px 8px ' + ROLE_COLORS[role] + '40' : 'none',
              transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {ROLE_LABELS[role]}
            <span style={{ marginLeft: '0.375rem', fontSize: '0.7rem', opacity: 0.8 }}>({totalForRole(role)}d)</span>
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: '14px', padding: '1.25rem', border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', margin: 0 }}>
            <span style={{ color: ROLE_COLORS[activeRole] }}>{ROLE_LABELS[activeRole]}</span> — Leave Allocations
          </h3>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{leaveTypes.length} leave types</span>
        </div>
        {leaveTypes.map(lt => (
          <AllocationRow
            key={`${activeRole}-${lt.code}`}
            role={activeRole}
            lt={lt}
            alloc={getAlloc(activeRole, lt.code)}
            onSave={fetchData}
          />
        ))}
      </div>
    </div>
  );
}
