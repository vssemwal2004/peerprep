export const COORDINATOR_PERMISSION_CATEGORIES = [
  {
    id: 'dashboard',
    label: 'Dashboard Access',
    permissions: [
      'coordinator.dashboard.overview',
    ],
  },
  {
    id: 'booking',
    label: 'Booking Management',
    permissions: [
      'coordinator.interviews.create',
      'coordinator.interviews.view',
      'coordinator.interviews.edit',
      'coordinator.interviews.manage',
      'coordinator.interviews.participants',
      'coordinator.interviews.delete',
    ],
  },
  {
    id: 'users',
    label: 'User Management',
    permissions: [
      'coordinator.students.view',
      'coordinator.students.profile',
      'coordinator.students.promote',
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    permissions: [
      'coordinator.assessment.reports',
      'coordinator.compiler.analytics',
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    permissions: [
      'coordinator.announcements.create',
      'coordinator.announcements.manage',
    ],
  },
  {
    id: 'support',
    label: 'Support System',
    permissions: [
      'coordinator.feedback.view',
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    permissions: [
      'coordinator.profile.manage',
      'coordinator.activity.view',
    ],
  },
  {
    id: 'content',
    label: 'Content Management',
    permissions: [
      'coordinator.learning.manage',
      'coordinator.courses.view',
      'coordinator.library.view',
      'coordinator.library.create',
      'coordinator.compiler.view',
      'coordinator.compiler.create',
      'coordinator.compiler.manage',
      'coordinator.company.view',
      'coordinator.company.create',
    ],
  },
  {
    id: 'assessments',
    label: 'Assessment Management',
    permissions: [
      'coordinator.assessment.view',
      'coordinator.assessment.create',
      'coordinator.assessment.edit',
    ],
  },
  {
    id: 'coordinator-management',
    label: 'Coordinator Management',
    permissions: [
      'coordinator.access.self-view',
    ],
  },
];

export const DEFAULT_COORDINATOR_PERMISSIONS = COORDINATOR_PERMISSION_CATEGORIES
  .flatMap((category) => category.permissions);

export function normalizeCoordinatorPermissions(permissions) {
  // Fail closed. Coordinator access must always be granted explicitly by an admin.
  if (!Array.isArray(permissions)) return [];
  const allowed = new Set(DEFAULT_COORDINATOR_PERMISSIONS);
  return [...new Set(permissions.filter((permission) => allowed.has(permission)))];
}

export function hasCoordinatorPermission(user, permission) {
  if (!user || user.role !== 'coordinator') return false;
  return normalizeCoordinatorPermissions(user.coordinatorPermissions).includes(permission);
}
