'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listRoles, createRole, updateRole, deleteRole, syncPermissions } from '@/api/rolesApi';
import ConfirmDialog from '@/components/ConfirmDialog';
import { PERMISSION_GROUPS, PERM_LABELS, ALL_SYSTEM_PERMISSIONS } from '@/utils/sidebarPermissions';
import styles from './RolesPermissions.module.css';

const ROLE_COLORS = { admin: '#6366f1', md: '#8b5cf6', hr: '#0ea5e9', team_lead: '#f59e0b', employee: '#22c55e' };

export default function RolesPermissions() {
  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [newRole, setNewRole] = useState({ name: '', label: '' });
  const [showNew, setShowNew] = useState(false);

  const fetchRoles = async () => {
    try { const res = await listRoles(); setRoles(res.data.data); if (!selected && res.data.data.length > 0) setSelected(res.data.data[0]); }
    catch { toast.error('Failed to load roles'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRoles(); }, []);

  const handleToggle = (perm) => {
    if (!selected) return;
    const has = selected.permissions.includes(perm);
    setSelected({ ...selected, permissions: has ? selected.permissions.filter(p => p !== perm) : [...selected.permissions, perm] });
  };

  const handleToggleGroup = (group) => {
    if (!selected) return;
    const perms = PERMISSION_GROUPS[group];
    const allOn = perms.every(p => selected.permissions.includes(p));
    const current = selected.permissions.filter(p => !perms.includes(p));
    setSelected({ ...selected, permissions: allOn ? current : [...current, ...perms] });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateRole(selected._id, { permissions: selected.permissions });
      toast.success('Permissions saved');
      setRoles(prev => prev.map(r => r._id === selected._id ? res.data.data : r));
      setSelected(res.data.data);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!newRole.name || !newRole.label) return toast.error('Name and label required');
    try {
      const res = await createRole(newRole);
      toast.success('Role created');
      setRoles(prev => [...prev, res.data.data]);
      setSelected(res.data.data);
      setNewRole({ name: '', label: '' }); setShowNew(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create'); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteRole(id); toast.success('Role deleted');
      const updated = roles.filter(r => r._id !== id);
      setRoles(updated); setSelected(updated[0] || null);
    } catch (err) { toast.error(err.response?.data?.message || 'Cannot delete'); }
    setConfirm(null);
  };

  const handleSync = async () => {
    try {
      const allPerms = Object.keys(ALL_SYSTEM_PERMISSIONS);
      const res = await syncPermissions(allPerms);
      if (res.data.added?.length > 0) {
        toast.success(`Synced ${res.data.added.length} new permission(s): ${res.data.added.join(', ')}`);
        fetchRoles(); // Refresh to show updated admin permissions
      } else {
        toast.success('All permissions already synced ✓');
      }
    } catch (err) { toast.error(err.response?.data?.message || 'Sync failed'); }
  };

  if (loading) return <div className={styles.loading}>Loading roles...</div>;
  const color = ROLE_COLORS[selected?.name] || '#6366f1';

  return (
    <div className={styles.page} style={{ '--role-color': color }}>
      {confirm && <ConfirmDialog message="Delete this role?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}
      <div className={styles.roleSidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Roles</h2>
          <button onClick={() => setShowNew(true)} className={styles.addRoleButton}>+</button>
        </div>
        {showNew && (
          <div className={styles.newRoleForm}>
            <input placeholder="name" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} className={styles.newRoleInput} />
            <input placeholder="Label" value={newRole.label} onChange={(e) => setNewRole({ ...newRole, label: e.target.value })} className={`${styles.newRoleInput} ${styles.lastInput}`} />
            <div className={styles.newRoleActions}>
              <button onClick={handleCreate} className={`${styles.newRoleAction} ${styles.createButton}`}>Create</button>
              <button onClick={() => setShowNew(false)} className={`${styles.newRoleAction} ${styles.cancelButton}`}>Cancel</button>
            </div>
          </div>
        )}
        {roles.map((role) => {
          const rc = ROLE_COLORS[role.name] || '#6366f1';
          const isActive = selected?._id === role._id;
          return (
            <div key={role._id} onClick={() => setSelected(role)}
              className={`${styles.roleItem} ${isActive ? styles.activeRole : ''}`}
              style={{ '--item-color': rc }}>
              <div className={styles.roleIdentity}>
                <div className={styles.roleDot} />
                <div>
                  <p className={`${styles.roleLabel} ${isActive ? styles.activeRoleLabel : ''}`}>{role.label}</p>
                  <p className={styles.permissionCount}>{role.permissions.length} perms</p>
                </div>
              </div>
              {!role.isSystem && <button onClick={(e) => { e.stopPropagation(); setConfirm(role._id); }} className={styles.deleteRoleButton}>✕</button>}
            </div>
          );
        })}
      </div>
      {selected && (
        <div className={styles.permissionPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.selectedRole}>
              <div className={styles.selectedRoleIcon}>🛡️</div>
              <div>
                <h3 className={styles.panelTitle}>{selected.label}</h3>
                <p className={styles.panelSubtitle}>{selected.isSystem ? '🔒 System role' : '✏️ Custom role'} · {selected.permissions.length} permissions active</p>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button onClick={handleSync} className={styles.syncButton}>
                🔄 Sync Permissions
              </button>
              <button onClick={handleSave} disabled={saving} className={styles.saveButton}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
          <div className={styles.permissionBody}>
            {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => {
              const allOn = perms.every(p => selected.permissions.includes(p));
              const someOn = perms.some(p => selected.permissions.includes(p));
              return (
                <div key={group} className={styles.permissionGroup}>
                  <div className={styles.groupHeader}>
                    <button onClick={() => handleToggleGroup(group)}
                      className={`${styles.groupToggle} ${allOn ? styles.groupAllOn : someOn ? styles.groupSomeOn : ''}`}>
                      {allOn && <span className={styles.checkmark}>✓</span>}
                      {someOn && !allOn && <span className={styles.partialMark}>−</span>}
                    </button>
                    <span className={styles.groupTitle}>{group}</span>
                    <div className={styles.divider} />
                  </div>
                  <div className={styles.permissions}>
                    {perms.map((perm) => {
                      const on = selected.permissions.includes(perm);
                      return (
                        <button key={perm} onClick={() => handleToggle(perm)}
                          className={`${styles.permissionButton} ${on ? styles.permissionOn : ''}`}>
                          <span className={styles.permissionIndicator}>{on ? '●' : '○'}</span>
                          {PERM_LABELS[perm] || perm}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
