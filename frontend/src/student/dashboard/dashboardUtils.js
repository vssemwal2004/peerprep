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

