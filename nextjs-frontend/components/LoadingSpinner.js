'use client';
import styles from './LoadingSpinner.module.css';

/*
 * LoadingSpinner
 * Migrated: 2/2 inline styles removed → CSS classes
 * Remaining inline: none
 */
export default function LoadingSpinner() {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
    </div>
  );
}
