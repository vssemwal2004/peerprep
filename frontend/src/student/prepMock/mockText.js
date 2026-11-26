import { formatDateTime } from '../assessment-dashboard/assessmentDashboardUtils';
import { isAlwaysOpen, resultOf } from './prepMockModel';

/** "Nov 30", with the year only when it is not this year. */
export function shortDay(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * When the mock can be taken, or when it was submitted / closed. Every Prep Mock is open by default,
 * so an open mock with no closing date says nothing ('').
 */
export function availabilityText(mock, state, alwaysOpen = isAlwaysOpen(mock)) {
  if (state === 'completed') return mock.submittedAt ? `Submitted ${formatDateTime(mock.submittedAt)}` : 'Submitted';
  if (state === 'upcoming') return `Opens ${formatDateTime(mock.startTime)}`;
  if (state === 'closed') return alwaysOpen ? 'No longer available' : `Closed ${formatDateTime(mock.manuallyCompletedAt || mock.endTime)}`;
  return alwaysOpen ? '' : `Open till ${formatDateTime(mock.endTime)}`;
}

/** The short status under a mock in the list: only what is not simply "open" ('' when it is). */
export function mockStatusLine(mock, state, report) {
  if (state === 'completed') {
    const result = resultOf(report);
    return result ? `Done · ${result.label}` : 'Done · result pending';
  }
  if (state === 'in_progress') return 'In progress';
  if (state === 'upcoming') return `Opens ${shortDay(mock.startTime)}`;
  if (state === 'closed') return 'Closed';
  return isAlwaysOpen(mock) ? '' : `Till ${shortDay(mock.endTime)}`;
}

/** "Assigned by your college · until <date>" (short: "College · till Nov 30"). `assignment` from collegeAssignmentOf(). */
export function collegeText(assignment, { short = false } = {}) {
  if (!assignment) return '';
  const head = short ? 'College' : 'Assigned by your college';
  const end = assignment.endTime;
  const start = assignment.startTime && new Date(assignment.startTime).getTime() > Date.now() ? assignment.startTime : null;
  if (end) return `${head} · ${short ? `till ${shortDay(end)}` : `until ${formatDateTime(end)}`}`;
  if (start) return `${head} · from ${short ? shortDay(start) : formatDateTime(start)}`;
  return head;
}
