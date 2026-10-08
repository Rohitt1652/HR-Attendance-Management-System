'use client';
import MyLeaves from '@/components/pages/employee/MyLeaves';
import LeaveApplication from '@/components/pages/employee/LeaveApplication';
import { useState } from 'react';
import styles from './page.module.css';

export default function AdminMyLeavesPage() {
  const [tab, setTab] = useState('my-leaves');

  return (
    <div className={styles.page}>
      {/* Tabs */}
      <div className={styles.tabs}>
        {[
          { key: 'my-leaves', label: 'My Leaves' },
          { key: 'apply', label: 'Apply Leave' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${styles.tab} ${tab === t.key ? styles.activeTab : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'my-leaves' && <MyLeaves />}
      {tab === 'apply' && <LeaveApplication />}
    </div>
  );
}
