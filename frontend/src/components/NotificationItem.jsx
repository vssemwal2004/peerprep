import React from 'react';

function NotificationItem({ notification, onView, timeLabel }) {
  const isUnread = !notification.isRead;

  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-colors ${
        isUnread
          ? 'border-sky-500/30 bg-sky-50/80 dark:bg-slate-800/70'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`text-sm font-semibold ${isUnread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
              {notification.title}
            </div>
            {isUnread && (
              <span className="text-[10px] uppercase tracking-wide text-sky-600 dark:text-sky-400">Unread</span>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
            {notification.message}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {timeLabel}
          </div>
        </div>
        <button
          onClick={() => onView(notification)}
          className="shrink-0 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
        >
          View
        </button>
      </div>
    </div>
  );
}

export default NotificationItem;
