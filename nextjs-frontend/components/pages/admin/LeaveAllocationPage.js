'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getAllocations, updateAllocation, getLeaveTypes } from '@/api/leaveApi';
import styles from './LeaveAllocationPage.module.css';

const ROLES = ['employee', 'team_lead', 'hr', 'admin', 'md'];
const activeLeaveTypesOnly = (types = []) => types.filter(type => type.isActive !== false);
const ROLE_META = {
  employee:  { label: 'Employee',          icon: '👤', color: '#22c55e' },
  team_lead: { label: 'Team Lead',          icon: '👥', color: '#f59e0b' },
  hr:        { label: 'HR Manager',         icon: '🧑‍💼', color: '#0ea5e9' },
  admin:     { label: 'Administrator',      icon: '🛡️', color: '#6366f1' },
  md:        { label: 'Managing Director',  icon: '👔', color: '#8b5cf6' },
};

export default function LeaveAllocationPage() {
  const [allocations, setAllocations] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState('employee');
  const [editing, setEditing] = useState({}); // { [code]: daysAllowed }
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchData = async () => {
    try {
      const [allocRes, typeRes] = await Promise.all([getAllocations(), getLeaveTypes()]);
      setAllocations(allocRes.data.data || []);
      setLeaveTypes(activeLeaveTypesOnly(typeRes.data.data || []));
    } catch { toast.error('Failed to load allocations'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // Load current allocations for active role into editing state
  useEffect(() => {
    const roleAllocs = {};
    leaveTypes.forEach(lt => {
      const a = allocations.find(a => a.role === activeRole && a.leaveTypeCode === lt.code);
      roleAllocs[lt.code] = a?.daysAllowed ?? 0;
    });
    setEditing(roleAllocs);
    setHasChanges(false);
  }, [activeRole, allocations, leaveTypes]);

  const handleChange = (code, val) => {
    setEditing(e => ({ ...e, [code]: parseFloat(val) || 0 }));
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(
        leaveTypes.map(lt =>
          updateAllocation({ role: activeRole, leaveTypeCode: lt.code, daysAllowed: editing[lt.code] || 0 })
        )
      );
      toast.success(`Allocations saved for ${ROLE_META[activeRole].label}`);
      setHasChanges(false);
      fetchData();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    const roleAllocs = {};
    leaveTypes.forEach(lt => {
      const a = allocations.find(a => a.role === activeRole && a.leaveTypeCode === lt.code);
      roleAllocs[lt.code] = a?.daysAllowed ?? 0;
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(
        leaveTypes.map(lt =>
          updateAllocation({ role: activeRole, leaveTypeCode: lt.code, daysAllowed: editing[lt.code] || 0 })
        )
      );
      toast.success(`Allocations saved for ${ROLE_META[activeRole].label}`);
      setHasChanges(false);
      fetchData();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    const roleAllocs = {};
    leaveTypes.forEach(lt => {
      const a = allocations.find(a => a.role === activeRole && a.leaveTypeCode === lt.code);
      roleAllocs[lt.code] = a?.daysAllowed ?? 0;
    });
    setEditing(roleAllocs);
    setHasChanges(false);
  };

  const totalDays = Object.values(editing).reduce((s, v) => s + (v || 0), 0);
  const role = ROLE_META[activeRole];

  if (loading) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading...</div>;

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.title}>Leave Allocation</h2>
          <p className={styles.subtitle}>Configure annual leave days per role and leave type</p>
        </div>
        {hasChanges && (
          <div className={styles.headerActions}>
            <button onClick={handleReset} className={styles.btnReset}>
              Reset
            </button>
            <button onClick={handleSaveAll} disabled={saving} className={styles.btnSave}
              style={{ background: role.color, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : `Save ${role.label} Allocations`}
            </button>
          </div>
        )}
      </div>

      {/* Role selector */}
      <div className={styles.rolesGrid}>
        {ROLES.map(r => {
          const rm = ROLE_META[r];
          const isActive = activeRole === r;
          const totalForRole = leaveTypes.reduce((s, lt) => {
            const a = allocations.find(a => a.role === r && a.leaveTypeCode === lt.code);
            return s + (a?.daysAllowed || 0);
          }, 0);
          return (
            <button key={r} onClick={() => setActiveRole(r)}
              className={styles.roleCard}
              style={{
                border: `2px solid ${isActive ? rm.color : '#e2e8f0'}`,
                background: isActive ? `${rm.color}10` : '#fff',
                boxShadow: isActive ? `0 4px 12px ${rm.color}25` : 'none',
              }}>
              <div className={styles.roleIcon}>{rm.icon}</div>
              <p className={styles.roleLabel} style={{ color: isActive ? rm.color : '#374151' }}>{rm.label}</p>
              <p className={styles.roleTotalSub}>{totalForRole}d/yr total</p>
            </button>
          );
        })}
      </div>

      {/* Allocation editor for active role */}
      <div className={styles.editorCard}>
        {/* Role header */}
        <div className={styles.editorHeader} style={{ background: `${role.color}08`, borderBottom: `1px solid ${role.color}20` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className={styles.editorRoleIconBox} style={{ background: `${role.color}20` }}>
              {role.icon}
            </div>
            <div>
              <h3 className={styles.editorRoleTitle}>{role.label}</h3>
              <p className={styles.editorRoleSub}>Annual leave allocation — {totalDays} total days</p>
            </div>
          </div>
          {hasChanges && (
            <span className={styles.unsavedBadge}>
              Unsaved changes
            </span>
          )}
        </div>

        {/* Leave type rows */}
        <div className={styles.leaveRowsStack}>
          {leaveTypes.map(lt => {
            const val = editing[lt.code] ?? 0;
            const maxDisplay = 60;
            const pct = Math.min(100, (val / maxDisplay) * 100);
            return (
              <div key={lt.code} className={styles.leaveRow}>
                {/* Leave type info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <div className={styles.leaveIconBox} style={{ background: `${lt.color}15` }}>
                    <span className={styles.leaveDot} style={{ background: lt.color }} />
                  </div>
                  <div>
                    <p className={styles.leaveName}>{lt.name}</p>
                    <div className={styles.badgeStack}>
                      <span className={styles.codeBadge} style={{ background: `${lt.color}15`, color: lt.color }}>{lt.code}</span>
                      {lt.allowHourly && <span className={styles.tagHourly}>Hourly</span>}
                      {lt.allowHalfDay && <span className={styles.tagHalfDay}>Half-day</span>}
                    </div>
                  </div>
                </div>

                {/* Visual bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>0</span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{maxDisplay}d</span>
                  </div>
                  <div className={styles.barTrack}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = (e.clientX - rect.left) / rect.width;
                      handleChange(lt.code, Math.round(pct * maxDisplay));
                    }}>
                    <div className={styles.barFill} style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${lt.color}80, ${lt.color})` }} />
                  </div>
                  <p className={styles.barHint}>Click bar to set quickly</p>
                </div>

                {/* Number input */}
                <div className={styles.inputGroup}>
                  <button onClick={() => handleChange(lt.code, Math.max(0, val - 1))} className={styles.stepBtn}>−</button>
                  <input type="number" min="0" max="365" step="0.5" value={val}
                    onChange={e => handleChange(lt.code, e.target.value)}
                    className={styles.numInput}
                    style={{ border: `1.5px solid ${hasChanges ? lt.color : '#e2e8f0'}`, color: lt.color }} />
                  <button onClick={() => handleChange(lt.code, val + 1)} className={styles.stepBtn}>+</button>
                  <span className={styles.unitText}>days/yr</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={styles.editorFooter}>
          <p className={styles.footerTotalText}>
            Total: <strong style={{ color: role.color }}>{totalDays} days/year</strong> for {role.label}
          </p>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            {hasChanges && (
              <>
                <button onClick={handleReset} className={styles.btnReset} style={{ background: '#fff' }}>
                  Discard
                </button>
                <button onClick={handleSaveAll} disabled={saving} className={styles.btnSave}
                  style={{ background: role.color, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : '✓ Save Changes'}
                </button>
              </>
            )}
            {!hasChanges && <span style={{ fontSize: '0.78rem', color: '#22c55e', fontWeight: 600 }}>✓ All saved</span>}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className={styles.comparisonCard}>
        <div className={styles.comparisonHeader}>
          <h3 className={styles.comparisonTitle}>All Roles Comparison</h3>
          <p className={styles.comparisonSubtitle}>Overview of allocations across all roles</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th className={styles.th} style={{ textAlign: 'left', color: '#64748b' }}>Leave Type</th>
                {ROLES.map(r => (
                  <th key={r} className={styles.th} style={{ color: ROLE_META[r].color }}>
                    {ROLE_META[r].icon} {ROLE_META[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((lt, i) => (
                <tr key={lt._id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                  <td className={styles.td} style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: lt.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{lt.code}</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{lt.name}</span>
                    </div>
                  </td>
                  {ROLES.map(r => {
                    const a = allocations.find(a => a.role === r && a.leaveTypeCode === lt.code);
                    const val = a?.daysAllowed;
                    const isActive = r === activeRole;
                    return (
                      <td key={r} className={styles.td}>
                        <span className={styles.valPill} style={{
                          background: val ? `${lt.color}15` : '#f1f5f9',
                          color: val ? lt.color : '#94a3b8',
                          border: isActive ? `1.5px solid ${lt.color}` : 'none',
                        }}>
                          {val ? `${val}d` : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
