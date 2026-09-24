export function getInterviewSection(pathname, search = '') {
  const root = pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const path = pathname.replace(/\/$/, '');
  if (path === `${root}/event/create` || path === `${root}/event`) return 'create';
  if (path === `${root}/feedback`) return 'feedback';
  if (path === `${root}/ai-interviews`) return null;
  if (new RegExp(`^${root}/interviews/(?:one-to-one/)?scheduled(?:/|$)`).test(path)) return 'scheduled';
  if (new RegExp(`^${root}/interviews/(?:one-to-one/)?past(?:/|$)`).test(path)) return 'past';
  if (path === `${root}/interviews` || path === `${root}/interviews/one-to-one`
    || new RegExp(`^${root}/(?:event|interviews|interviews/one-to-one)/[a-f\\d]{24}$`, 'i').test(path)) {
    return new URLSearchParams(search).get('status') === 'active' ? 'active' : 'all';
  }
  return null;
}

export function getInterviewNavigation(root) {
  const base = `${root}/interviews/one-to-one`;
  return [
    { id: 'all', label: 'All interviews', title: 'All Interviews', to: base, permissionKey: 'coordinator.interviews.view' },
    { id: 'active', label: 'Active', title: 'Active Interviews', to: `${base}?status=active`, permissionKey: 'coordinator.interviews.view' },
    { id: 'scheduled', label: 'Scheduled', title: 'Scheduled Interviews', to: `${base}/scheduled`, permissionKey: 'coordinator.interviews.view' },
    { id: 'past', label: 'Past interviews', title: 'Past Interviews', to: `${base}/past`, permissionKey: 'coordinator.interviews.view' },
    { id: 'feedback', label: 'Feedback', title: 'Interview Feedback', to: `${root}/feedback`, permissionKey: 'coordinator.feedback.view' },
    { id: 'create', label: 'Create interview', title: 'Create Interview', to: `${root}/event/create`, permissionKey: 'coordinator.interviews.create' },
  ];
}
