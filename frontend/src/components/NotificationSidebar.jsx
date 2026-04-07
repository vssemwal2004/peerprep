import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-900/40"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-white">Notifications</div>
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

              <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-5 py-3">
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

              {/* Announcement highlight (auto-fades every 5s) */}
              {announcementItems.length > 0 && (
                <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
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

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {listItems.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      No notifications yet
                    </div>
                  </div>
                ) : (
                  listItems.map((notif) => (
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
}

export default NotificationSidebar;
