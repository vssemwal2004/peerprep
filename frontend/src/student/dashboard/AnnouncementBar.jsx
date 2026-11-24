import { ArrowRight, X } from 'lucide-react';
import { formatRelativeTime, isImportantAnnouncement } from './dashboardUtils';
import { focusRing } from './ui';
import { categoryOf, labelOf, themeOf } from '../../components/announcements/announcementMeta';

/**
 * Slim bar across the top of the dashboard for the highest-priority announcement, in its own
 * colour and name (Notice, Exam, Placement ...).
 */
export default function AnnouncementBar({ announcement, total, now, onView, onDismiss }) {
  const important = isImportantAnnouncement(announcement);
  const theme = themeOf(announcement);
  const { Icon } = categoryOf(announcement);
  const more = total - 1;
  return <div role="region" aria-label={`Latest ${labelOf(announcement).toLowerCase()}`}
    className={`flex items-center gap-3 rounded-2xl border py-2.5 pl-2.5 pr-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${theme.border} ${theme.tint}`}>
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white ${theme.solid}`} aria-hidden="true">
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
    <p className="min-w-0 flex-1 truncate text-[13.5px] text-slate-600 dark:text-zinc-300">
      <span className={`mr-2 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset ${important ? 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-400/20' : theme.soft}`}>{important ? `Important · ${labelOf(announcement)}` : labelOf(announcement)}</span>
      <span className="font-semibold text-slate-900 dark:text-zinc-50">{announcement.title}</span>
      {announcement.message && <span className="hidden sm:inline"> · {String(announcement.message).replace(/\s+/g, ' ')}</span>}
    </p>
    <time dateTime={announcement.createdAt} className="hidden shrink-0 text-[12px] text-slate-400 md:block dark:text-zinc-500">{formatRelativeTime(announcement.createdAt, now)}</time>
    <button type="button" onClick={onView} className={`group inline-flex shrink-0 items-center gap-1 rounded-[10px] bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-inset ring-slate-200/80 hover:bg-slate-50 dark:bg-white/[0.08] dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-white/[0.12] ${focusRing}`}>
      {more > 0 ? `View all ${total}` : 'View'}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
    <button type="button" onClick={onDismiss} aria-label="Dismiss announcement" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-slate-400 hover:bg-black/[0.04] hover:text-slate-700 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200 ${focusRing}`}>
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  </div>;
}
