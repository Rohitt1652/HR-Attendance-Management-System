'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Keyboard, X } from 'lucide-react';
import styles from './KeyboardShortcuts.module.css';

const MANAGER_ROLES = ['admin', 'hr', 'md', 'team_lead'];

export default function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes(user?.role);
  const base = isManager ? '/admin' : '/employee';

  useEffect(() => {
    const handler = (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.target.isContentEditable) return;

      // Ctrl+K is handled by GlobalSearch
      // Shift+? shows help
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        setShowHelp(s => !s);
        return;
      }

      // Alt+shortcuts for navigation
      if (e.altKey) {
        switch (e.key) {
          case 'd': e.preventDefault(); router.push(`${base}/dashboard`); break;
          case 'a': e.preventDefault(); router.push(`${base}/attendance`); break;
          case 'l': e.preventDefault(); router.push(`${base}/leaves`); break;
          case 'e': e.preventDefault(); if (isManager) router.push('/admin/employees'); break;
          case 'n': e.preventDefault(); router.push(`${base}/announcements`); break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, base, isManager]);

  const shortcuts = [
    { keys: 'Ctrl + K', desc: 'Open search' },
    { keys: 'Shift + ?', desc: 'Show shortcuts' },
    { keys: 'Alt + D', desc: 'Go to Dashboard' },
    { keys: 'Alt + A', desc: 'Go to Attendance' },
    { keys: 'Alt + L', desc: 'Go to Leaves' },
    ...(isManager ? [{ keys: 'Alt + E', desc: 'Go to Employees' }] : []),
    { keys: 'Alt + N', desc: 'Go to Announcements' },
    { keys: 'Escape', desc: 'Close modals/search' },
  ];

  if (!showHelp) return null;

  return (
    <div className={styles.container}>
      <div className={styles.backdrop} onClick={() => setShowHelp(false)} />
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={styles.heading}>
            <Keyboard size={18} color="#6366f1" />
            <h3 className={styles.title}>Keyboard Shortcuts</h3>
          </div>
          <button onClick={() => setShowHelp(false)} className={styles.closeButton}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>
        <div className={styles.list}>
          {shortcuts.map(s => (
            <div key={s.keys} className={styles.row}>
              <span className={styles.description}>{s.desc}</span>
              <kbd className={styles.key}>{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
