'use client';
import { AlertTriangle, Trash2, CheckCircle, X } from 'lucide-react';
import styles from './ConfirmDialog.module.css';

const VARIANTS = {
  danger: { icon: Trash2, color: '#ef4444', bg: '#fef2f2', btnBg: '#ef4444' },
  warning: { icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb', btnBg: '#f59e0b' },
  success: { icon: CheckCircle, color: '#22c55e', bg: '#f0fdf4', btnBg: '#22c55e' },
};

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', variant = 'danger', details }) {
  if (!open) return null;

  const v = VARIANTS[variant] || VARIANTS.danger;
  const Icon = v.icon;

  return (
    <div className={styles.container} style={{ '--variant-color': v.color, '--variant-bg': v.bg, '--variant-button': v.btnBg }}>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Dialog */}
      <div className={styles.dialog}>
        {/* Close button */}
        <button onClick={onClose} className={styles.closeButton}>
          <X size={18} color="#94a3b8" />
        </button>

        {/* Icon */}
        <div className={styles.icon}>
          <Icon size={22} color={v.color} />
        </div>

        {/* Content */}
        <h3 className={styles.title}>{title}</h3>
        <p className={`${styles.message} ${details ? styles.messageWithDetails : ''}`}>{message}</p>

        {/* Optional details */}
        {details && (
          <div className={styles.details}>
            {details}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className={styles.confirmButton}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
