import React from 'react';
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

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {notifications.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      No notifications yet
                    </div>
                  </div>
                ) : (
                  notifications.map((notif) => (
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
