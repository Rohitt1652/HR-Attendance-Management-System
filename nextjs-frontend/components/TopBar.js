'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';
import { Menu, Sun, Moon, LogOut, User, ChevronDown } from 'lucide-react';
import styles from './TopBar.module.css';

const PAGE_TITLES = {
  '/admin/dashboard': 'Dashboard', '/admin/employees': 'Users',
  '/admin/attendance': 'Attendance', '/admin/leaves': 'Leave Requests',
  '/admin/my-leaves': 'My Leaves',
  '/admin/leave-performance': 'Leave Analytics',
  '/admin/leave-summary': 'Leave Summary',
  '/admin/monthly-attendance': 'Monthly Attendance',
  '/admin/leave-allocation': 'Leave Allocation', '/admin/leave-types': 'Leave Types',
  '/admin/reports': 'Reports', '/admin/roles': 'Roles & Permissions',
  '/admin/documents': 'Documents', '/admin/announcements': 'Announcements',
  '/admin/payslips': 'Payslips', '/admin/performance': 'Performance',
  '/admin/hiring': 'Hiring & Recruitment', '/admin/training': 'Training Management',
  '/admin/cv': 'Employee CVs', '/admin/settings': 'Settings',
  '/admin/profile': 'My Profile',
  '/admin/calendar': 'Calendar', '/admin/holidays': 'Calendar',
  '/admin/cafe': 'Cafe Menu', '/admin/team': 'The Team',
  '/admin/fun-team': 'Fun Team', '/admin/policy': 'Policy',
  '/admin/forms': 'Download Forms',
  '/admin/lunch': 'Cafe Orders',
  '/employee/dashboard': 'Dashboard', '/employee/attendance': 'My Attendance',
  '/employee/leaves': 'My Leaves', '/employee/profile': 'My Profile',
  '/employee/documents': 'My Documents', '/employee/announcements': 'Announcements',
  '/employee/payslips': 'My Payslips', '/employee/performance': 'My Performance',
  '/employee/training': 'Training Programs', '/employee/cv': 'My CV',
  '/employee/calendar': 'Calendar', '/employee/holidays': 'Calendar',
  '/employee/cafe': 'Cafe Menu', '/employee/team': 'The Team',
  '/employee/fun-team': 'Fun Team', '/employee/policy': 'Policy',
  '/employee/forms': 'Download Forms',
  '/employee/lunch': 'Book My Lunch',
};

const ROLE_COLORS = { admin: '#6366f1', hr: '#0ea5e9', md: '#8b5cf6', team_lead: '#f59e0b', employee: '#22c55e' };

export default function TopBar({ onMenuClick, sidebarOpen }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme') === 'dark';
    const initialization = window.setTimeout(() => setDark(saved), 0);
    if (saved) {
      document.documentElement.classList.add('dark');
      document.body.style.background = '#0f172a';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.background = '#f8fafc';
    }
    return () => window.clearTimeout(initialization);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      document.body.style.background = '#0f172a';
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.background = '#f8fafc';
      localStorage.setItem('theme', 'light');
    }
  };

  const title = PAGE_TITLES[pathname] || 'Portal';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const handleLogout = () => { logout(); router.push('/login'); };
  const roleColor = ROLE_COLORS[user?.role] || '#6366f1';

  return (
    <header className={styles.topBar}>
      <button onClick={onMenuClick} className={`${styles.menuButton} ${sidebarOpen ? styles.menuButtonOpen : ''}`}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
        <Menu size={20} />
      </button>

      <div className={styles.spacer} />

      <GlobalSearch />

      <NotificationBell />

      <div className={styles.profile}>
        <button onClick={() => setShowMenu(m => !m)} className={styles.profileButton}>
          <div className={styles.avatar} style={{ '--role-color': roleColor }}>
            {user?.profilePhotoUrl
              ? <img src={user.profilePhotoUrl} alt={user.name} className={styles.avatarImage} />
              : user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className={`topbar-user-info ${styles.userInfo}`}>
            <p className={styles.userName}>{user?.name}</p>
            <p className={styles.userRole} style={{ '--role-color': roleColor }}>{user?.role}</p>
          </div>
          <ChevronDown size={14} color="#94a3b8" className={`${styles.chevron} ${showMenu ? styles.chevronOpen : ''}`} />
        </button>

        {showMenu && (
          <>
            <div className={styles.dismissLayer} onClick={() => setShowMenu(false)} />
            <div className={styles.dropdown}>
              <div className={styles.dropdownHeader} style={{ '--role-color': roleColor }}>
                <div className={styles.dropdownIdentity}>
                  <div className={`${styles.avatar} ${styles.dropdownAvatar}`} style={{ '--role-color': roleColor }}>
                    {user?.profilePhotoUrl
                      ? <img src={user.profilePhotoUrl} alt={user.name} className={styles.avatarImage} />
                      : user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className={styles.dropdownName}>{user?.name}</p>
                    <p className={styles.dropdownEmail}>{user?.email?.includes('@noemail.local') ? user?.employeeId : user?.email}</p>
                  </div>
                </div>
              </div>
              <div className={styles.dropdownActions}>
                <button onClick={() => { setShowMenu(false); router.push(user?.role === 'employee' ? '/employee/profile' : '/admin/profile'); }}
                  className={styles.dropdownButton}>
                  <User size={15} color="#64748b" /> My Profile
                </button>
                <button onClick={handleLogout}
                  className={`${styles.dropdownButton} ${styles.logoutButton}`}>
                  <LogOut size={15} color="#ef4444" /> Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
