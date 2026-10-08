'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import styles from './Breadcrumb.module.css';

/*
 * Breadcrumb
 * Migrated: 5/5 inline styles → CSS classes
 * Remaining inline: none
 * Note: hover color change kept as onMouseEnter/Leave (no CSS class can do dynamic color swap without :hover on <a>)
 */

const LABELS = {
  admin: 'Admin', employee: 'Employee',
  dashboard: 'Dashboard', employees: 'Users', attendance: 'Attendance',
  leaves: 'Leave Requests', 'leave-performance': 'Leave Analytics',
  'leave-allocation': 'Allocation', 'leave-types': 'Leave Types',
  performance: 'Performance', hiring: 'Hiring', training: 'Training',
  cv: 'CVs', payslips: 'Payslips', documents: 'Documents',
  expenses: 'Expenses', announcements: 'Announcements', reports: 'Reports',
  'office-tasks': 'Office Tasks', calendar: 'Calendar', holidays: 'Holidays',
  cafe: 'Cafe & Lunch', lunch: 'Cafe Orders', team: 'The Team',
  'fun-team': 'Fun Team', policy: 'Policy', forms: 'Download Forms',
  roles: 'Roles', settings: 'Settings', profile: 'My Profile',
};

export default function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, idx) => {
    const path  = '/' + segments.slice(0, idx + 1).join('/');
    const label = LABELS[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
    const isLast = idx === segments.length - 1;
    return { path, label, isLast };
  });

  return (
    <nav className={styles.breadcrumb}>
      <Link
        href={`/${segments[0]}/dashboard`}
        className={styles.home}
      >
        <Home size={13} />
      </Link>

      {crumbs.slice(1).map((crumb) => (
        <span key={crumb.path} className={styles.crumb}>
          <ChevronRight size={12} color="#cbd5e1" />
          {crumb.isLast ? (
            <span className="text-base font-semibold text-body-clr">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.path}
              className={styles.link}
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
