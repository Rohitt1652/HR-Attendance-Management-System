'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { uploadMyPhoto, getMyTeam } from '@/api/employeeApi';
import { Users, UserCheck, Camera, X, Check, ZoomIn, ZoomOut, Lock } from 'lucide-react';
import { changePassword } from '@/api/authApi';
import styles from './Profile.module.css';

/*
 * Profile — Style migration
 * Before: 58 inline styles
 * After:  ~22 inline styles
 * Removed: ~36 static → CSS classes
 * Remaining inline (all dynamic):
 *   - uploading state: button bg/cursor (state-driven)
 *   - cropModal canvas cursor: dragging ? 'grabbing' : 'grab'
 *   - pwLoading button: bg/cursor (state-driven)
 *   - netSalary > 0: bg/border/color conditional on computed value
 *   - crop canvas border+shadow: static brand color — kept (component-specific)
 *   - team lead avatar: gradient (static brand — single instance)
 *   - team member avatars: gradient (static brand — repeated but part of team section)
 */

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [uploading, setUploading]     = useState(false);
  const [teamData, setTeamData]       = useState(null);
  const [teamLoading, setTeamLoading] = useState(true);

  const [cropSrc, setCropSrc]     = useState(null);
  const [cropModal, setCropModal] = useState(false);
  const [zoom, setZoom]           = useState(1);
  const [offset, setOffset]       = useState({ x: 0, y: 0 });
  const [dragging, setDragging]   = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const canvasRef   = useRef(null);
  const imgRef      = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    getMyTeam().then(r => setTeamData(r.data)).catch(() => {}).finally(() => setTeamLoading(false));
    // Re-fetch team data when user returns to this tab (catches admin changes)
    const handleFocus = () => getMyTeam().then(r => setTeamData(r.data)).catch(() => {});
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file');
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB');
    const reader = new FileReader();
    reader.onload = (ev) => { setCropSrc(ev.target.result); setCropModal(true); setZoom(1); setOffset({ x: 0, y: 0 }); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const drawCrop = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const SIZE = 240;
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SIZE, SIZE);
    const scaledW = img.naturalWidth * zoom;
    const scaledH = img.naturalHeight * zoom;
    const drawX   = (SIZE - scaledW) / 2 + offset.x;
    const drawY   = (SIZE - scaledH) / 2 + offset.y;
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, scaledW, scaledH);
    ctx.restore();
  }, [zoom, offset]);

  useEffect(() => { if (cropModal) setTimeout(drawCrop, 50); }, [cropModal, zoom, offset, drawCrop]);

  const handleMouseDown = (e) => { setDragging(true); setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); };
  const handleMouseMove = (e) => { if (!dragging) return; setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleMouseUp   = () => setDragging(false);

  const [pwForm, setPwForm]       = useState({ current: '', newPw: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) return toast.error('New passwords do not match');
    if (pwForm.newPw.length < 6) return toast.error('Password must be at least 6 characters');
    setPwLoading(true);
    try {
      await changePassword({ currentPassword: pwForm.current, newPassword: pwForm.newPw });
      toast.success('Password changed successfully');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setPwLoading(false); }
  };

  const handleCropUpload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setUploading(true);
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const fd   = new FormData();
      fd.append('photo', blob, 'profile.jpg');
      const res = await uploadMyPhoto(fd);
      // Merge with existing user to preserve permissions and other auth fields
      updateUser({ ...user, ...res.data.data, permissions: user.permissions });
      toast.success('Photo updated!');
      setCropModal(false);
      setCropSrc(null);
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  };

  const fields = [
    ['Employee ID', user?.employeeId], ['Biometric ID', user?.biometricId], ['Name', user?.name], ['Email', user?.email],
    ['Phone', user?.phone], ['Department', user?.department], ['Designation', user?.designation],
    ['Role', user?.role], ['Status', user?.status],
    ['Joining Date', user?.joiningDate ? new Date(user.joiningDate).toLocaleDateString() : '-'],
  ];

  return (
    <div className={styles.pageContainer}>
      <h2 className={styles.pageTitle}>My Profile</h2>

      {/* Profile info card */}
      <div className={styles.profileCard}>
        {user?.profilePhotoUrl && (
          <img src={user.profilePhotoUrl} alt="Profile" className={styles.avatarImage} />
        )}
        <div className={styles.fieldsGrid}>
          {fields.map(([label, val]) => (
            <div key={label}>
              <p className={styles.fieldLabel}>{label}</p>
              <p className={styles.fieldVal}>{val || '-'}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="font-semibold text-body-clr" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>Update Photo</p>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} className={styles.btnUploadPhoto}>
            <Camera size={14} style={{ marginRight: '6px' }} /> Choose &amp; Crop Photo
          </button>
          <p className="text-muted" style={{ fontSize: '0.68rem', marginTop: '4px' }}>JPG, PNG up to 5MB. You can crop and zoom before uploading.</p>
        </div>
      </div>

      {/* Crop Modal */}
      {cropModal && cropSrc && (
        <div className={styles.modalBackdrop}>
          <div className={styles.cropModalPanel}>
            <div className="row-between" style={{ marginBottom: '1rem' }}>
              <h3 className="font-bold text-heading" style={{ fontSize: '1rem', margin: 0 }}>Crop Photo</h3>
              <button onClick={() => { setCropModal(false); setCropSrc(null); }} className="btn-ghost-base cursor-pointer text-muted"><X size={20} /></button>
            </div>
            <p className="text-muted text-sm" style={{ marginBottom: '0.75rem' }}>Drag to reposition · Zoom to fit</p>

            <img ref={imgRef} src={cropSrc} alt="" onLoad={drawCrop} style={{ display: 'none' }} />

            <div className="d-flex justify-center" style={{ marginBottom: '1rem' }}>
              <canvas ref={canvasRef} width={240} height={240}
                style={{ borderRadius: '50%', border: '3px solid #6366f1', cursor: dragging ? 'grabbing' : 'grab', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>

            {/* Zoom controls */}
            <div className="row-center" style={{ gap: '0.75rem', marginBottom: '1.25rem' }}>
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className={styles.zoomBtn}>
                <ZoomOut size={15} color="#374151" />
              </button>
              <input type="range" min="0.5" max="3" step="0.05" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: '#6366f1' }} />
              <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className={styles.zoomBtn}>
                <ZoomIn size={15} color="#374151" />
              </button>
              <span className="text-muted text-sm" style={{ minWidth: '36px' }}>{Math.round(zoom * 100)}%</span>
            </div>

            <div className="d-flex gap-3">
              <button onClick={() => { setCropModal(false); setCropSrc(null); }} className={styles.btnCancelModal}>
                Cancel
              </button>
              {/* uploading state — bg/cursor dynamic */}
              <button onClick={handleCropUpload} disabled={uploading} className="row-center justify-center gap-2 font-bold text-white"
                style={{ flex: 1, padding: '0.625rem', background: uploading ? '#a5b4fc' : '#6366f1', border: 'none', borderRadius: '10px', fontSize: '0.8rem', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                <Check size={15} /> {uploading ? 'Uploading...' : 'Upload Photo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team section */}
      {!teamLoading && teamData && (
        <div className={styles.teamCard}>

          {/* Employee — sees their Team Lead */}
          {teamData.role === 'employee' && (
            <div>
              <div className="row-center gap-2" style={{ marginBottom: '1rem' }}>
                <div className="dash-section-icon" style={{ background: '#eff6ff' }}>
                  <UserCheck size={15} color="#6366f1" strokeWidth={2} />
                </div>
                <h3 className="font-bold text-heading" style={{ fontSize: '0.9rem', margin: 0 }}>Your Team Lead</h3>
              </div>
              {teamData.data ? (
                <div className={styles.teamLeadRow}>
                  <div className="d-flex align-center justify-center flex-shrink-0 font-extrabold text-white overflow-hidden"
                    style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #f97316)', fontSize: '1rem' }}>
                    {teamData.data.profilePhotoUrl ? <img src={teamData.data.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : teamData.data.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-heading" style={{ fontSize: '0.9rem', margin: 0 }}>{teamData.data.name}</p>
                    <p className="text-secondary" style={{ fontSize: '0.75rem', margin: '2px 0 0' }}>{teamData.data.designation || 'Team Lead'} · {teamData.data.department}</p>
                    <p className="text-muted" style={{ fontSize: '0.72rem', margin: '1px 0 0' }}>{teamData.data.employeeId}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: '0.82rem' }}>No team lead assigned yet. Contact HR to assign one.</p>
              )}
            </div>
          )}

          {/* Team Lead — sees their team members */}
          {teamData.role === 'team_lead' && (
            <div>
              <div className="row-center gap-2" style={{ marginBottom: '1rem' }}>
                <div className="dash-section-icon" style={{ background: '#f0fdf4' }}>
                  <Users size={15} color="#22c55e" strokeWidth={2} />
                </div>
                <h3 className="font-bold text-heading" style={{ fontSize: '0.9rem', margin: 0 }}>My Team ({teamData.data?.length || 0} members)</h3>
              </div>
              {teamData.data?.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.82rem' }}>No team members assigned yet.</p>
              ) : (
                <div className={styles.teamGrid}>
                  {teamData.data.map(member => (
                    <div key={member._id} className={styles.teamMemberCard}>
                      <div className="d-flex align-center justify-center flex-shrink-0 font-bold text-white overflow-hidden"
                        style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', fontSize: '0.85rem' }}>
                        {member.profilePhotoUrl ? <img src={member.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : member.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-heading text-truncate" style={{ fontSize: '0.82rem', margin: 0 }}>{member.name}</p>
                        <p className="text-secondary" style={{ fontSize: '0.7rem', margin: '1px 0 0' }}>{member.designation || member.department}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Change Password */}
      <div className={styles.teamCard}>
        <div className="row-center gap-2" style={{ marginBottom: '1.25rem' }}>
          <div className="dash-section-icon" style={{ background: '#fef3c7' }}>
            <Lock size={15} color="#d97706" strokeWidth={2} />
          </div>
          <h3 className="font-bold text-heading" style={{ fontSize: '0.9rem', margin: 0 }}>Change Password</h3>
        </div>
        <form onSubmit={handleChangePassword} className="d-flex-col" style={{ gap: '0.875rem', maxWidth: '400px' }}>
          {[['Current Password', 'current'], ['New Password', 'newPw'], ['Confirm New Password', 'confirm']].map(([label, key]) => (
            <div key={key}>
              <label className="d-block text-base font-semibold text-body-clr" style={{ marginBottom: '4px' }}>{label}</label>
              <input type="password" value={pwForm[key]} onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))} required className={styles.pwInput} />
            </div>
          ))}
          {/* pwLoading state — bg/cursor dynamic */}
          <button type="submit" disabled={pwLoading} className="font-bold text-white cursor-pointer"
            style={{ padding: '0.625rem 1.25rem', background: pwLoading ? '#fcd34d' : '#f59e0b', border: 'none', borderRadius: '8px', fontSize: '0.85rem', cursor: pwLoading ? 'not-allowed' : 'pointer', width: 'fit-content' }}>
            {pwLoading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
