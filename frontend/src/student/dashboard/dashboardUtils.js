export function getGreeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function formatRelativeTime(value, now = new Date()) {
  const timestamp = new Date(value || '').getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatSchedule(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return 'Date to be confirmed';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function getWeekActivity(activity = {}, now = new Date()) {
  // Activity APIs bucket records by UTC date; match those buckets on both pages.
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (6 - index)));
    const key = date.toISOString().slice(0, 10);
    const value = Number(activity[key]);
    const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return { key, count, label: date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }), fullLabel: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) };
  });
}

export function getUpcomingItems(assessments = [], events = [], now = new Date()) {
  const timestamp = now.getTime();
  const items = assessments.filter((item) => {
    if (['Completed', 'Violation'].includes(item.status) || item.submittedAt) return false;
    const end = new Date(item.endTime || '').getTime();
    return Number.isFinite(end) && end > timestamp;
  }).map((item) => {
    const startsAt = new Date(item.startTime || '').getTime();
    const available = Number.isFinite(startsAt) && startsAt <= timestamp;
    return { id: `assessment-${item._id}`, type: 'assessment', title: item.title || 'Assessment', href: '/student/assessments', label: available ? 'Available now' : 'Upcoming assessment', timeLabel: available ? 'Closes' : 'Starts', time: available ? item.endTime : item.startTime, available };
  });
  events.filter((item) => item.joined && new Date(item.startDate || '').getTime() > timestamp).forEach((item) => {
    items.push({ id: `interview-${item._id}`, type: 'interview', title: item.name || 'Peer interview', href: '/student/interview', label: 'Joined interview', timeLabel: 'Starts', time: item.startDate, available: false });
  });
  return items.sort((a, b) => Number(b.available) - Number(a.available) || new Date(a.time) - new Date(b.time));
}

export function formatWatchTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export const numeric = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

export const isImportantAnnouncement = (item) => item?.priority === 'high' || item?.type === 'alert';

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const ACRONYMS = new Set(['ai', 'api', 'coa', 'cn', 'cse', 'css', 'cv', 'daa', 'dbms', 'dl', 'ds', 'dsa', 'html', 'iot', 'it', 'js', 'ml', 'nlp', 'oop', 'oops', 'os', 'sql', 'toc', 'ui', 'ux']);

/**
 * Curriculum names sometimes arrive in ALL CAPS ("DESIGN ANALYSIS AND ALGORITHM"). Show those in
 * title case while keeping known acronyms ("OS", "DBMS"). Mixed-case names are left exactly as typed.
 */
export function displayTitle(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text || /[a-z]/.test(text) || !/\s/.test(text)) return text;
  return text.split(' ').map((word, index) => {
    const lower = word.toLowerCase();
    const bare = lower.replace(/[^a-z0-9+#]/g, '');
    if (ACRONYMS.has(bare) || /\d/.test(bare)) return word;
    if (index > 0 && SMALL_WORDS.has(bare)) return lower;
    return lower.replace(/^([^a-z]*)([a-z])/, (_, lead, first) => lead + first.toUpperCase());
  }).join(' ');
}

// Six calm, distinguishable accents. A subject keeps the same one on every visit.
const SUBJECT_THEMES = [
  { key: 'sky', band: 'from-sky-500 to-sky-600', soft: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300', ring: '#0284c7' },
  { key: 'indigo', band: 'from-indigo-500 to-indigo-600', soft: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300', ring: '#4f46e5' },
  { key: 'violet', band: 'from-violet-500 to-violet-600', soft: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', ring: '#7c3aed' },
  { key: 'emerald', band: 'from-emerald-500 to-teal-600', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', ring: '#059669' },
  { key: 'amber', band: 'from-amber-500 to-orange-500', soft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', ring: '#d97706' },
  { key: 'rose', band: 'from-rose-500 to-pink-600', soft: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300', ring: '#e11d48' },
];

export function subjectTheme(seed) {
  let hash = 0;
  for (const char of String(seed || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SUBJECT_THEMES[hash % SUBJECT_THEMES.length];
}

const LANGUAGES = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', java: 'Java', cpp: 'C++', c: 'C', csharp: 'C#', php: 'PHP', go: 'Go', rust: 'Rust', kotlin: 'Kotlin', ruby: 'Ruby', swift: 'Swift', r: 'R', sql: 'SQL' };
export const languageLabel = (value) => LANGUAGES[String(value || '').toLowerCase()] || null;

const VERDICTS = {
  AC: { label: 'Passed last run', tone: 'good' },
  WA: { label: 'Wrong answer', tone: 'bad' },
  TLE: { label: 'Time limit exceeded', tone: 'warn' },
  RE: { label: 'Runtime error', tone: 'bad' },
  CE: { label: 'Compilation error', tone: 'bad' },
  PENDING: { label: 'Awaiting result', tone: 'neutral' },
  RUNNING: { label: 'Running', tone: 'neutral' },
};
export const verdictInfo = (value) => VERDICTS[String(value || '').toUpperCase()] || null;

const PRIORITY = { high: 0, normal: 1, low: 2 };

/** High priority first, then newest. The bar and the rail card share this order. */
export const sortAnnouncements = (items = []) => [...items].sort((a, b) =>
  (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || new Date(b.createdAt) - new Date(a.createdAt));

