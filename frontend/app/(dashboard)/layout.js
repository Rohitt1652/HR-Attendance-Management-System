'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import AiChatbot from '@/components/AiChatbot';
import Breadcrumb from '@/components/Breadcrumb';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import styles from './layout.module.css';

export default function DashboardLayout({ children }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        const saved = localStorage.getItem('sidebarOpen');
        if (saved !== null) setSidebarOpen(saved === 'true');
        else setSidebarOpen(true);
      }
    };
    const initialization = window.setTimeout(() => {
      setMounted(true);
      checkMobile();
    }, 0);
    window.addEventListener('resize', checkMobile);
    return () => {
      window.clearTimeout(initialization);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    if (mounted && (!token || !user)) router.replace('/login');
  }, [token, user, router, mounted]);

  const toggleSidebar = () => {
    setSidebarOpen(o => {
      const next = !o;
      if (!isMobile) localStorage.setItem('sidebarOpen', String(next));
      return next;
    });
  };

  if (!mounted) return null;
  if (!token || !user) return null;

  return (
    <div className={styles.layout}>
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className={styles.mobileBackdrop} />
      )}

      <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed} ${isMobile ? styles.mobileSidebar : ''}`}>
        <Sidebar collapsed={!sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className={styles.content}>
        <TopBar onMenuClick={toggleSidebar} sidebarOpen={sidebarOpen} />
        <main className={`${styles.main} ${isMobile ? styles.mobileMain : ''}`}>
          <Breadcrumb />
          {children}
        </main>
        <AiChatbot />
        <KeyboardShortcuts />
      </div>
    </div>
  );
}
