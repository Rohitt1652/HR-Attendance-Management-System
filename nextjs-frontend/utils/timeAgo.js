/**
 * Returns a human-friendly relative time string.
 * e.g., "Just now", "5 min ago", "2 hours ago", "Yesterday", "3 days ago"
 */
export function timeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) > 1 ? 's' : ''} ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString();
}

/**
 * Format date as "Mon, 12 May 2025"
 */
export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Format date as "12 May"
 */
export function formatShortDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
