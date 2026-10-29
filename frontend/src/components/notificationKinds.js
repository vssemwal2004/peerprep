import { Bell, BookOpen, CalendarClock, CheckCircle2, ClipboardList, Crown, Flame, Map as MapIcon, Medal, Megaphone, MessageSquare, Settings2, Target, Users } from 'lucide-react';

// Progress updates: the daily challenge, quests, badges, levels and streaks.
export const PROGRESS_TYPES = new Set(['CHALLENGE', 'QUEST', 'BADGE', 'LEVEL', 'STREAK']);

const gradientTile = 'bg-gradient-to-br text-white';
const KINDS = {
  CHALLENGE: { label: 'Daily challenge', icon: Target, tile: `${gradientTile} from-sky-400 to-sky-600 shadow-[0_6px_14px_-6px_rgba(2,132,199,0.75)]`, chip: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300', rail: 'bg-sky-500', cta: 'Open' },
  QUEST: { label: 'QuickPrep', icon: MapIcon, tile: `${gradientTile} from-indigo-400 to-sky-600 shadow-[0_6px_14px_-6px_rgba(79,70,229,0.7)]`, chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300', rail: 'bg-indigo-500', cta: 'View QuickPrep' },
  BADGE: { label: 'Badge', icon: Medal, tile: `${gradientTile} from-amber-300 to-orange-500 shadow-[0_6px_14px_-6px_rgba(234,88,12,0.7)]`, chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', rail: 'bg-amber-500', cta: 'See badge' },
  LEVEL: { label: 'Level up', icon: Crown, tile: `${gradientTile} from-violet-400 to-indigo-600 shadow-[0_6px_14px_-6px_rgba(99,102,241,0.75)]`, chip: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', rail: 'bg-violet-500', cta: 'See level' },
  STREAK: { label: 'Streak', icon: Flame, tile: `${gradientTile} from-amber-400 to-rose-500 shadow-[0_6px_14px_-6px_rgba(244,63,94,0.6)]`, chip: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300', rail: 'bg-orange-500', cta: 'Open' },
  CODING: { label: 'Coding', icon: CheckCircle2, tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', rail: 'bg-emerald-500', cta: 'Open' },
  LEARNING: { label: 'Learning', icon: BookOpen, tile: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300', chip: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', rail: 'bg-violet-500', cta: 'Open' },
  ASSESSMENT: { label: 'Assessment', icon: ClipboardList, tile: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', rail: 'bg-amber-500', cta: 'Open' },
  INTERVIEW: { label: 'Interview', icon: Users, tile: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300', chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300', rail: 'bg-indigo-500', cta: 'Open' },
  FEEDBACK: { label: 'Feedback', icon: MessageSquare, tile: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300', chip: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300', rail: 'bg-teal-500', cta: 'Open' },
  SYSTEM: { label: 'Account', icon: Settings2, tile: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', rail: 'bg-slate-400', cta: 'Open' },
};
// Scheduled ANVI interviews: assigned, booked, rescheduled, cancelled, reminders, missed, report released.
export const ANVI_NOTIFICATION_TYPES = new Set(['AI_INTERVIEW', 'ANVI', 'ANVI_INTERVIEW']);
export const ANVI_ROUTE = '/student/ai-interviews';
const ANVI_KIND = { label: 'AI interview', icon: CalendarClock, tile: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300', chip: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', rail: 'bg-violet-500', cta: 'Open', route: ANVI_ROUTE };
for (const type of ANVI_NOTIFICATION_TYPES) KINDS[type] = ANVI_KIND;

export const isAnviNotification = (notification) => ANVI_NOTIFICATION_TYPES.has(String(notification?.type || '').toUpperCase());

/** Where a notification opens: its own actionUrl, else its kind's default route (ANVI only), else nowhere. */
export function notificationRoute(notification) {
  if (notification?.actionUrl) return notification.actionUrl;
  return isAnviNotification(notification) ? ANVI_ROUTE : null;
}
const ANNOUNCEMENT = { label: 'Announcement', icon: Megaphone, tile: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300', rail: 'bg-rose-500', cta: 'View' };
const FALLBACK = { label: 'Update', icon: Bell, tile: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300', rail: 'bg-sky-500', cta: 'Open' };

export function notificationKind(notification) {
  if (notification?.source === 'announcement') return ANNOUNCEMENT;
  return KINDS[String(notification?.type || '').toUpperCase()] || FALLBACK;
}

export const isProgressNotification = (notification) => PROGRESS_TYPES.has(String(notification?.type || '').toUpperCase());
