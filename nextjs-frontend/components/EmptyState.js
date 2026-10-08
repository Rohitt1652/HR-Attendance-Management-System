'use client';
import { FolderOpen, FileText, Users, Calendar, Coffee, ClipboardCheck } from 'lucide-react';
import styles from './EmptyState.module.css';

/*
 * EmptyState
 * Migrated: 5/5 inline styles → CSS classes
 * Remaining inline: none
 */

const ICONS = {
  documents: FolderOpen,
  leaves:    FileText,
  employees: Users,
  calendar:  Calendar,
  cafe:      Coffee,
  tasks:     ClipboardCheck,
  default:   FolderOpen,
};

export default function EmptyState({ icon = 'default', title = 'No data found', message, actionLabel, onAction }) {
  const Icon = ICONS[icon] || ICONS.default;

  return (
    <div className={styles.emptyState}>
      <div className={styles.icon}>
        <Icon size={28} color="#94a3b8" strokeWidth={1.5} />
      </div>

      <h3 className="font-bold text-xl text-body-clr">{title}</h3>

      {message && (
        <p className={styles.message}>{message}</p>
      )}

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={styles.action}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
