import { formatDateTime } from '../assessment-dashboard/assessmentDashboardUtils';

/** When the mock can be taken, or when it was submitted / closed. */
export function availabilityText(mock, state, alwaysOpen) {
  if (state === 'completed') return mock.submittedAt ? `Submitted ${formatDateTime(mock.submittedAt)}` : 'Submitted';
  if (alwaysOpen) return state === 'closed' ? 'No longer available' : 'Always open · start any time';
  if (state === 'upcoming') return `Opens ${formatDateTime(mock.startTime)}`;
  if (state === 'closed') return `Closed ${formatDateTime(mock.manuallyCompletedAt || mock.endTime)}`;
  return `Open till ${formatDateTime(mock.endTime)}`;
}
