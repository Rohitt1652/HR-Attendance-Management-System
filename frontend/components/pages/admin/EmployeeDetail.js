'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getEmployee, uploadPhoto } from '@/api/employeeApi';
import LoadingSpinner from '@/components/LoadingSpinner';
import styles from './EmployeeDetail.module.css';

/*
 * EmployeeDetail — Style migration log
 * Before: 19 inline style blocks
 * After:  3 inline style blocks (all dynamic/state-driven)
 *
 * Remaining inline (intentional):
 *   1. Avatar circle size (width/height 90px — fixed, no class for this exact size)
 *   2. Avatar initial font size (2rem — data-driven fallback)
 *   3. Upload button position (absolute bottom:0 right:0 — layout-critical pixel position)
 */

export default function EmployeeDetail() {
  const { id } = useParams();
  const router  = useRouter();
  const [employee, setEmployee]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef();

  useEffect(() => {
    getEmployee(id)
      .then(e => { setEmployee(e.data.data); })
      .catch(() => toast.error('Failed to load employee'))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error('Image must be under 3MB');
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await uploadPhoto(id, fd);
      setEmployee(prev => ({ ...prev, profilePhotoUrl: res.data.data.profilePhotoUrl }));
      toast.success('Photo updated');
    } catch { toast.error('Failed to upload photo'); }
    finally { setUploadingPhoto(false); }
  };

  if (loading) return <LoadingSpinner />;
  if (!employee) return <p className="text-muted">Employee not found</p>;

  // Use relative /uploads paths so Next.js rewrite forwards the auth cookie.
  const photoUrl = employee.profilePhotoUrl || null;

  return (
    <div className={styles.page}>

      {/* Header row */}
      <div className="row-center gap-3">
        <button
          onClick={() => router.push('/admin/employees')}
          className={styles.backButton}
        >
          ← Back
        </button>
        <h2 className={styles.title}>
          {employee.name}
        </h2>
      </div>

      {/* Profile card */}
      <div className={styles.profileCard}>

        {/* Avatar + upload */}
        <div className={styles.photoColumn}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatar}>
              {photoUrl
                ? <img src={photoUrl} alt={employee.name} className={styles.avatarImage} />
                : <span className={styles.avatarInitial}>{employee.name?.[0]?.toUpperCase()}</span>
              }
            </div>
            <button
              onClick={() => photoRef.current.click()}
              disabled={uploadingPhoto}
              title="Upload photo"
              className={styles.uploadButton}
            >
              {uploadingPhoto ? '⏳' : '📷'}
            </button>
          </div>
          <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoUpload} className={styles.hiddenInput} />
          <span className={styles.photoHint}>Click 📷 to<br/>change photo</span>
        </div>

        {/* Details grid */}
        <div className={styles.detailsGrid}>
          {[
            ['Employee ID',  employee.employeeId],
            ['Biometric ID', employee.biometricId],
            ['Email',        employee.email],
            ['Phone',        employee.phone],
            ['Department',   employee.department],
            ['Designation',  employee.designation],
            ['Status',       employee.status],
            ['Role',         employee.role],
            ['Joining Date', employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString() : '-'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-sm text-muted mb-1">{label}</p>
              <p className={styles.detailValue}>{val || '-'}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
