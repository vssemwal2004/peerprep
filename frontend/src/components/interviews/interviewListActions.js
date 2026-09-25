import { interviewStatus } from './interviewSetup.js';

export function interviewActionIds(event, user, hasPermission) {
  const owns = user?.role === 'admin' || (user?.role === 'coordinator' && event.coordinatorId === user.coordinatorId);
  const can = (key) => owns && hasPermission(user, `coordinator.interviews.${key}`);
  const state = interviewStatus(event);
  return [
    'open', ...(can('edit') ? ['edit'] : []), 'export', 'copy',
    ...(can('participants') && !['draft', 'cancelled', 'archived', 'completed'].includes(state) ? ['invitations'] : []),
    ...(can('manage') && state === 'draft' ? ['published'] : []),
    ...(can('manage') && !['completed', 'cancelled', 'archived', 'draft'].includes(state) ? ['completed'] : []),
    ...(can('manage') && !['completed', 'cancelled', 'archived'].includes(state) ? ['cancelled'] : []),
    ...(can('delete') ? ['delete'] : []),
  ];
}
