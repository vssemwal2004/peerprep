import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import NotificationItem from './NotificationItem';

function NotificationSidebar({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  onView,
  formatTime,
}) {
  const announcementItems = useMemo(
    () => (notifications || []).filter((n) => n?.source === 'announcement'),
    [notifications]
  );

  const listItems = useMemo(
    () => (notifications || []),
    [notifications]
  );

  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredItems = useMemo(
    () => activeFilter === 'unread' ? listItems.filter((item) => !item?.isRead) : listItems,
    [activeFilter, listItems],
  );

  useEffect(() => {
    // Reset when opening or when the list changes.
    if (isOpen) setAnnouncementIndex(0);
  }, [isOpen, announcementItems.length]);

  useEffect(() => {
    if (!isOpen) return undefined;
    if (announcementItems.length <= 1) return undefined;

    const id = setInterval(() => {
      setAnnouncementIndex((prev) => (prev + 1) % announcementItems.length);
    }, 5000);

    return () => clearInterval(id);
  }, [isOpen, announcementItems.length]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[10000] bg-slate-950/45 backdrop-blur-[2px]"
          />
          <motion.aside
            id="notification-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-panel-title"
            initial={{ x: '100%', opacity: 0.96 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.96 }}
            transition={{ type: 'spring', stiffness: 360, damping: 38 }}
            className="fixed bottom-0 right-0 top-0 z-[10001] isolate w-full overflow-hidden border-l border-slate-200 bg-white shadow-[-24px_0_70px_rgba(15,23,42,0.28)] md:w-[45vw] lg:w-[36vw] xl:w-[30vw] dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
                <div>
                  <div id="notification-panel-title" className="text-lg font-semibold text-slate-900 dark:text-white">Notifications</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {unreadCount} unread
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-sky-500 hover:border-sky-400 transition-colors"
                >
                  Close
                </button>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
                <button
                  onClick={onMarkAllRead}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-sky-500 transition-colors"
                >
                  Mark all as read
                </button>
                <button
                  onClick={onClearAll}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-500 transition-colors"
                >
                  Clear all notifications
                </button>
              </div>

              <div className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-5 py-2 dark:border-slate-800 dark:bg-slate-950">
                {[['all', `All (${listItems.length})`], ['unread', `Unread (${unreadCount})`]].map(([value, label]) => <button key={value} type="button" onClick={() => setActiveFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeFilter === value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>{label}</button>)}
              </div>

              {/* Announcement highlight (auto-fades every 5s) */}
              {announcementItems.length > 0 && (
                <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Announcement highlight
                  </div>
                  <div className="mt-2">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={announcementItems[announcementIndex]?._id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                        className="rounded-xl border border-sky-500/20 bg-sky-50/70 dark:bg-slate-900/60 px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1">
                              {announcementItems[announcementIndex]?.title}
                            </div>
                            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                              {announcementItems[announcementIndex]?.message}
                            </div>
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              {formatTime(announcementItems[announcementIndex]?.createdAt)}
                            </div>
                          </div>
                          <button
                            onClick={() => onView(announcementItems[announcementIndex])}
                            className="shrink-0 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white px-5 py-4 [scrollbar-gutter:stable] dark:bg-slate-950">
                {filteredItems.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {activeFilter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
                    </div>
                  </div>
                ) : (
                  filteredItems.map((notif) => (
                    <NotificationItem
                      key={notif._id}
                      notification={notif}
                      onView={onView}
                      timeLabel={formatTime(notif.createdAt)}
                    />
                  ))
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document === 'undefined' ? panel : createPortal(panel, document.body);
}

export default NotificationSidebar;
