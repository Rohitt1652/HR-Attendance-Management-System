'use client';
import styles from './LoadingSkeleton.module.css';

// Reusable skeleton loading components
export function SkeletonLine({ width = '100%', height = '14px', style = {}, className = '' }) {
  return (
    <div className={`${styles.line} ${className}`} style={{ '--skeleton-width': width, '--skeleton-height': height, ...style }} />
  );
}

export function SkeletonCircle({ size = '40px', style = {} }) {
  return (
    <div className={styles.circle} style={{ '--skeleton-size': size, ...style }} />
  );
}

export function SkeletonCard({ style = {} }) {
  return (
    <div className={styles.card} style={style}>
      <SkeletonLine width="60%" height="12px" className={styles.marginBottom12} />
      <SkeletonLine width="40%" height="24px" className={styles.marginBottom8} />
      <SkeletonLine width="80%" height="10px" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className={styles.table}>
      {/* Header */}
      <div className={styles.tableHeader} style={{ '--skeleton-columns': cols }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={`${60 + (i % 4) * 8}%`} height="10px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className={styles.tableRow} style={{ '--skeleton-columns': cols }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <SkeletonLine key={ci} width={`${50 + ((ri + ci) % 5) * 9}%`} height="12px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatCards({ count = 4 }) {
  return (
    <div className={styles.statCards} style={{ '--skeleton-columns': count }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div className={styles.list}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.listRow}>
          <SkeletonCircle size="44px" />
          <div className={styles.listContent}>
            <SkeletonLine width="45%" height="14px" className={styles.marginBottom8} />
            <SkeletonLine width="70%" height="10px" />
          </div>
          <SkeletonLine width="60px" height="24px" className={styles.pill} />
        </div>
      ))}
    </div>
  );
}

// Full page loading skeleton
export default function LoadingSkeleton({ type = 'page' }) {
  if (type === 'table') return <SkeletonTable />;
  if (type === 'cards') return <SkeletonStatCards />;
  if (type === 'list') return <SkeletonList />;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className="row-between">
        <div>
          <SkeletonLine width="180px" height="20px" className={styles.marginBottom8} />
          <SkeletonLine width="120px" height="12px" />
        </div>
        <SkeletonLine width="130px" height="36px" className={styles.rounded8} />
      </div>
      {/* Stat cards */}
      <SkeletonStatCards count={3} />
      {/* Table */}
      <SkeletonTable rows={4} cols={4} />
    </div>
  );
}
