import React from 'react';
import { ArrowRight } from 'lucide-react';
import { isProgressNotification, notificationKind } from './notificationKinds';

// "+40 XP" in a challenge message becomes a small reward pill; the text itself stays unchanged.
const xpOf = (message) => String(message || '').match(/\+(\d+)\s*XP/)?.[1] || null;

function NotificationItem({ notification, onView, timeLabel }) {
  const isUnread = !notification.isRead;
  const kind = notificationKind(notification);
  const Icon = kind.icon;
  const progress = isProgressNotification(notification);
  const xp = progress ? xpOf(notification.message) : null;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border px-4 py-3 transition-[transform,box-shadow,border-color] hover:-translate-y-px hover:shadow-sm ${
        isUnread
          ? progress ? 'border-slate-200 bg-gradient-to-r from-sky-50/80 via-white to-white dark:border-slate-700 dark:from-sky-500/[0.06] dark:via-slate-900/60 dark:to-slate-900/60'
            : 'border-slate-200 bg-sky-50/50 dark:border-slate-700 dark:bg-slate-800/60'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50'
      }`}
    >
      {isUnread && <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${kind.rail}`} aria-hidden="true" />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kind.tile}`} aria-hidden="true">
            <Icon className="h-[18px] w-[18px]" strokeWidth={progress ? 2.1 : 1.9} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${kind.chip}`}>{kind.label}</span>
              {xp && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">+{xp} XP</span>}
              {isUnread && <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-sky-600 dark:text-sky-400"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />New</span>}
            </div>
            <div className={`mt-1 text-sm font-semibold leading-snug ${isUnread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
              {notification.title}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
              {notification.message}
            </div>
            <div className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{timeLabel}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onView(notification)}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${progress && notification.actionUrl
            ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'
            : 'border border-slate-200 text-slate-700 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-200 dark:hover:text-sky-400'}`}
        >
          {notification.actionUrl ? kind.cta : 'Read'}
          {notification.actionUrl && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default NotificationItem;
