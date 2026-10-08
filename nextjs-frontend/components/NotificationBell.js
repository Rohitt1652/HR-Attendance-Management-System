'use client';
import { useState, useEffect, useRef } from 'react';
import { getMyNotifications, markAllRead, markOneRead, deleteNotification } from '@/api/notificationApi';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle, XCircle, FileText, Megaphone, X } from 'lucide-react';
import styles from './NotificationBell.module.css';

const TYPE_ICON = (type) => {
  const props = { size: 14, strokeWidth: 2 };
  switch(type) {
    case 'leave_approved': return <CheckCircle {...props} color="#22c55e" />;
    case 'leave_rejected': return <XCircle {...props} color="#ef4444" />;
    case 'leave_applied': return <FileText {...props} color="#f59e0b" />;
    case 'announcement': return <Megaphone {...props} color="#a855f7" />;
    case 'payment': return <CheckCircle {...props} color="#0ea5e9" />;
    default: return <Bell {...props} color="#64748b" />;
  }
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef();

  const fetchNotifications = async () => {
    try {
      const res = await getMyNotifications();
      setNotifications(res.data.data || []);
      setUnread(res.data.unreadCount || 0);
    } catch {}
  };

  useEffect(() => {
    const initialFetch = window.setTimeout(fetchNotifications, 0);
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMarkAllRead = async () => {
    await markAllRead();
    setUnread(0);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleClick = async (n) => {
    if (!n.isRead) {
      await markOneRead(n._id);
      setNotifications(prev => prev.map(x => x._id === n._id ? { ...x, isRead: true } : x));
      setUnread(prev => Math.max(0, prev - 1));
    }
    if (n.link) { setOpen(false); router.push(n.link); }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n._id !== id));
  };

  return (
    <div ref={ref} className={styles.wrapper}>
      <button onClick={() => setOpen(o => !o)}
        className={styles.bellButton}>
        <Bell size={18} color="#64748b" strokeWidth={2} />
        {unread > 0 && (
          <span className={styles.unreadCount}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.panel}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.title}>Notifications</span>
              {unread > 0 && <span className={styles.newBadge}>{unread} new</span>}
            </div>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className={styles.markReadButton}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <Bell size={22} color="#cbd5e1" strokeWidth={1.5} />
                </div>
                <p className={styles.emptyText}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n._id} onClick={() => handleClick(n)}
                  className={`${styles.notification} ${!n.isRead ? styles.unread : ''} ${n.link ? styles.clickable : ''}`}>
                  <div className={styles.typeIcon}>
                    {TYPE_ICON(n.type)}
                  </div>
                  <div className={styles.content}>
                    <p className={`${styles.notificationTitle} ${!n.isRead ? styles.unreadTitle : ''}`}>{n.title}</p>
                    <p className={styles.message}>{n.message}</p>
                    <p className={styles.timestamp}>{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  <button onClick={(e) => handleDelete(e, n._id)} className={styles.deleteButton}>
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
