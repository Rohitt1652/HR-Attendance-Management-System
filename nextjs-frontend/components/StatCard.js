'use client';
import styles from './StatCard.module.css';

/*
 * StatCard
 * Migrated: 2/4 inline styles → CSS classes
 * Remaining inline: border color, bg color, text color (all data-driven from THEMES)
 */

const THEMES = new Set(['blue', 'green', 'red', 'yellow', 'purple', 'indigo']);

export default function StatCard({ label, value, icon, color = 'blue' }) {
  const theme = THEMES.has(color) ? color : 'blue';
  return (
    <div
      className={`${styles.card} ${styles[theme]}`}
    >
      <div
        className={styles.icon}
      >
        {icon}
      </div>
      <div>
        <p className={styles.label}>{label}</p>
        <p className={styles.value}>{value}</p>
      </div>
    </div>
  );
}
