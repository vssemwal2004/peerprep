import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isProgressNotification } from './notificationKinds';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import socketService from '../utils/socket';
import { useAuth } from '../context/AuthContext';
import NotificationSidebar from './NotificationSidebar';

const SEEN_ANNOUNCEMENTS_KEY = 'studentSeenAnnouncementIds';

function loadSeenAnnouncementIds() {
  try {
    const raw = localStorage.getItem(SEEN_ANNOUNCEMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveSeenAnnouncementIds(ids) {
  try {
    const unique = Array.from(new Set((ids || []).filter(Boolean)));
    // Keep it bounded so localStorage doesn't grow forever.
    const bounded = unique.slice(-200);
    localStorage.setItem(SEEN_ANNOUNCEMENTS_KEY, JSON.stringify(bounded));
  } catch {
    // ignore
  }
}

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function NotificationBell({ buttonClassName = '' }) {
  const { user, authChecked, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const [announcementNotifications, setAnnouncementNotifications] = useState([]);
  const canLoadNotifications = authChecked && isAuthenticated && Boolean(user?._id);

  const mergedSortedNotifications = useMemo(() => {
    return [...announcementNotifications, ...notifications].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }, [announcementNotifications, notifications]);

  const unreadCount = useMemo(() => {
    const announcementUnread = announcementNotifications.reduce(
      (sum, n) => sum + (n && !n.isRead ? 1 : 0),
      0
    );
    return (serverUnreadCount || 0) + announcementUnread;
  }, [serverUnreadCount, announcementNotifications]);

  const markAnnouncementsSeen = (announcementIds) => {
    const ids = announcementIds || announcementNotifications.map((n) => n.announcementId);
    if (!ids?.length) return;
    const seen = new Set(loadSeenAnnouncementIds());
    ids.forEach((id) => seen.add(id));
    saveSeenAnnouncementIds(Array.from(seen));
    const idsSet = new Set(ids);
    setAnnouncementNotifications((prev) =>
      prev.map((n) => (idsSet.has(n.announcementId) ? { ...n, isRead: true } : n))
    );
  };

  const fetchAnnouncementsForSidebar = async () => {
    if (!canLoadNotifications) return;
    try {
      const res = await api.listStudentAnnouncements();
      const list = Array.isArray(res?.announcements) ? res.announcements : [];
      const seen = new Set(loadSeenAnnouncementIds());
      const mapped = list.map((a) => ({
        _id: `announcement:${a._id}`,
        announcementId: a._id,
        source: 'announcement',
        title: a.title,
        message: a.message,
        createdAt: a.createdAt || a.updatedAt || new Date().toISOString(),
        isRead: seen.has(a._id),
        // No actionUrl by default; "View" will just mark it seen.
      }));
      setAnnouncementNotifications(mapped);
    } catch {
      setAnnouncementNotifications([]);
    }
  };

  useEffect(() => {
    if (!canLoadNotifications) {
      setNotifications([]);
      setServerUnreadCount(0);
      return undefined;
    }
    let mounted = true;
    api.getNotifications()
      .then((data) => {
        if (!mounted) return;
        setNotifications(data.notifications || []);
        setServerUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [canLoadNotifications]);

  useEffect(() => {
    if (!isOpen || !canLoadNotifications) return;
    api.getNotifications().then((data) => {
      setNotifications(data.notifications || []);
      setServerUnreadCount(data.unreadCount || 0);
    }).catch(() => {});
  }, [canLoadNotifications, isOpen]);

  useEffect(() => {
    if (!canLoadNotifications) {
      setAnnouncementNotifications([]);
      return;
    }
    fetchAnnouncementsForSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoadNotifications]);

  useEffect(() => {
    if (!user?._id) return;
    socketService.connect();
    socketService.emit('register', user._id);
  }, [user?._id]);

  // The same notification can arrive from both the socket push and a refetch; count it once.
  const knownIds = useRef(new Set());
  useEffect(() => {
    knownIds.current = new Set(notifications.map((n) => String(n._id)));
  }, [notifications]);

  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    if (!ringing) return undefined;
    const timer = setTimeout(() => setRinging(false), 1200);
    return () => clearTimeout(timer);
  }, [ringing]);

  useEffect(() => {
    const handleNewNotification = (notif) => {
      const id = String(notif?._id || '');
      if (!id || knownIds.current.has(id)) return;
      knownIds.current.add(id);
      setNotifications((prev) => [notif, ...prev]);
      setServerUnreadCount((prev) => prev + 1);
      setRinging(true);
    };
    socketService.on('new_notification', handleNewNotification);
    return () => {
      socketService.off('new_notification', handleNewNotification);
    };
  }, []);

  const latestUnread = mergedSortedNotifications.find((n) => !n.isRead);
  const progressPending = isProgressNotification(latestUnread);

  useEffect(() => {
    const handleAnnouncementUpdate = () => {
      fetchAnnouncementsForSidebar();
    };
    socketService.on('announcement_update', handleAnnouncementUpdate);
    return () => {
      socketService.off('announcement_update', handleAnnouncementUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // When the user opens the sidebar, treat announcements as seen.
    const ids = announcementNotifications.map((n) => n.announcementId);
    if (ids.length) markAnnouncementsSeen(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleToggle = () => setIsOpen((prev) => !prev);

  const handleView = async (notification) => {
    if (notification?.source === 'announcement') {
      if (notification.announcementId) {
        markAnnouncementsSeen([notification.announcementId]);
      }
      setIsOpen(false);
      return;
    }
    if (!notification.isRead) {
      try {
        await api.markNotificationRead(notification._id);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n))
        );
        setServerUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Ignore read-status failures; the next fetch will resync state.
      }
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setServerUnreadCount(0);
    } catch {
      // Ignore bulk read failures; announcements are still marked locally below.
    }

    // Also mark announcements as seen.
    markAnnouncementsSeen();
  };

  const handleClearAll = async () => {
    try {
      await api.clearAllNotifications();
      setNotifications([]);
      setServerUnreadCount(0);
    } catch {
      // Ignore clear failures; a later fetch will restore any server-side items.
    }

    // Don't remove announcements (they're global), but consider them seen.
    markAnnouncementsSeen();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/50 ${buttonClassName}`}
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-controls="notification-panel"
      >
        <Bell className={`h-4 w-4 ${ringing ? 'bell-ring' : ''}`} />
        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-900 ${progressPending ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-red-500'}`}
            title={progressPending ? 'New progress update' : undefined}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationSidebar
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        notifications={mergedSortedNotifications}
        unreadCount={unreadCount}
        onMarkAllRead={handleMarkAllRead}
        onClearAll={handleClearAll}
        onView={handleView}
        formatTime={formatRelativeTime}
      />
    </>
  );
}

export default NotificationBell;
