// Shared vocabulary for the admin and coordinator overviews: module colours, role-specific links
// and the pending-work catalogue. The server already removes modules the viewer may not see.

export const MODULE_META = {
  coding: { label: 'Coding', color: '#0284c7', soft: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20' },
  assessments: { label: 'Assessments', color: '#d97706', soft: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20' },
  interviews: { label: 'Interviews', color: '#e11d48', soft: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20' },
  learning: { label: 'Learning', color: '#059669', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20' },
  logins: { label: 'Sign-ins', color: '#64748b', soft: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10' },
};

const LINKS = {
  admin: {
    students: '/admin/students',
    onboarding: '/admin/onboarding',
    coding: '/admin/analysis?source=coding',
    problems: '/admin/library/coding/problems',
    assessments: '/admin/assessment',
    assessmentCreate: '/admin/assessment/create',
    reports: '/admin/assessment/reports',
    interviews: '/admin/interviews/scheduled',
    interviewCreate: '/admin/event/create',
    event: (id) => `/admin/event/${id}`,
    aiInterviews: '/admin/ai-interviews',
    learning: '/admin/learning',
    feedback: '/admin/feedback',
    activity: '/admin/activity',
    analysis: '/admin/analysis',
    coordinators: '/admin/coordinator-directory',
    announcements: '/admin/announcements/manage',
  },
  coordinator: {
    students: '/coordinator/students',
    onboarding: '/coordinator/onboarding',
    coding: '/coordinator/library/coding/problems',
    problems: '/coordinator/library/coding/problems',
    assessments: '/coordinator/assessment',
    assessmentCreate: '/coordinator/assessment/create',
    reports: '/coordinator/assessment/reports',
    interviews: '/coordinator/interviews/one-to-one/scheduled',
    interviewCreate: '/coordinator/event/create',
    event: (id) => `/coordinator/event/${id}`,
    aiInterviews: '/coordinator/ai-interviews',
    learning: '/coordinator/subjects',
    feedback: '/coordinator/feedback',
    activity: '/coordinator/activity',
    analysis: null,
    coordinators: null,
    announcements: '/coordinator/announcements/manage',
  },
};

export const linksFor = (role) => LINKS[role === 'admin' ? 'admin' : 'coordinator'];

// Each pending key the server returns becomes one actionable row. Rows with a zero count are hidden.
export const PENDING = [
  { key: 'closingSoon', tone: 'rose', label: (n) => `${n} assessment${n === 1 ? '' : 's'} closing within 24 hours`, link: 'assessments' },
  { key: 'startingSoon', tone: 'amber', label: (n) => `${n} interview event${n === 1 ? '' : 's'} starting within 48 hours`, link: 'interviews' },
  { key: 'pairsPending', tone: 'amber', label: (n) => `${n} interview pair${n === 1 ? '' : 's'} waiting for a time`, link: 'interviews' },
  { key: 'draftAssessments', tone: 'sky', label: (n) => `${n} draft assessment${n === 1 ? '' : 's'} not yet published`, link: 'assessments' },
  { key: 'flaggedAttempts', tone: 'rose', label: (n) => `${n} test attempt${n === 1 ? '' : 's'} flagged for integrity (14 days)`, link: 'reports' },
  { key: 'emailFailed', tone: 'rose', label: (n) => `${n} login email${n === 1 ? '' : 's'} failed to send`, link: 'students' },
  { key: 'notActivated', tone: 'slate', label: (n) => `${n} student${n === 1 ? ' has' : 's have'} not signed in yet`, link: 'students' },
];

export function pendingRows(pending = {}, links) {
  return PENDING
    .filter((item) => Number(pending[item.key]) > 0 && links[item.link])
    .map((item) => ({ key: item.key, tone: item.tone, label: item.label(Number(pending[item.key])), to: links[item.link] }));
}

// Trend series that exist for this viewer, in display order.
export function trendSeries(data) {
  return [
    data.coding && 'coding',
    data.assessments && 'assessments',
    (data.mockInterviews || data.aiInterviews) && 'interviews',
    data.learning && 'learning',
  ].filter(Boolean);
}

export const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

export function dailyTotals(trend = [], keys = []) {
  return trend.map((row) => ({ date: row.date, total: keys.reduce((total, key) => total + (Number(row[key]) || 0), 0) }));
}

// Change between the last 7 days and the 7 days before, as a whole percent (null when no baseline).
export function weekChange(values = []) {
  const recent = values.slice(-7).reduce((a, b) => a + b, 0);
  const before = values.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (!before) return recent ? null : 0;
  return Math.round(((recent - before) / before) * 100);
}

export const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0);
export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

export function shortDay(key) {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function relativeTime(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(time).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function whenLabel(item, now = Date.now()) {
  if (item.live) return 'Live now';
  const time = new Date(item.startsAt).getTime();
  if (!Number.isFinite(time)) return 'Date not set';
  const date = new Date(time);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  const clock = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Today · ${clock}` : `${date.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' })} · ${clock}`;
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
