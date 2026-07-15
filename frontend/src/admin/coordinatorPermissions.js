import {
  Activity,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  FileCode2,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageSquare,
  Settings,
  ShieldCheck,
  TerminalSquare,
  UserCog,
  Users,
} from 'lucide-react';

export const coordinatorPermissionCategories = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Dashboard',
    description: 'Coordinator landing page and platform overview.',
    icon: LayoutDashboard,
    permissions: [
      {
        key: 'coordinator.dashboard.overview',
        name: 'Coordinator Overview',
        description: 'Allows the coordinator to open their main dashboard.',
        accessType: 'View',
        usage: 'Used for first-page visibility after login.',
        routes: ['/coordinator/overview', '/coordinator'],
      },
    ],
  },
  {
    id: 'interviews',
    label: 'Interview Management',
    shortLabel: 'Interview',
    description: 'Create interviews, review scheduled events, and open event details.',
    icon: CalendarClock,
    permissions: [
      {
        key: 'coordinator.interviews.create',
        name: 'Create Interview',
        description: 'Create interview events using the existing admin event management workflow.',
        accessType: 'Create',
        usage: 'Shows Create Interview and enables /coordinator/event/create.',
        routes: ['/coordinator/event/create'],
      },
      {
        key: 'coordinator.interviews.view',
        name: 'Scheduled Interviews',
        description: 'View coordinator interview events and event detail screens.',
        accessType: 'View',
        usage: 'Shows Scheduled Interviews and event detail screens.',
        routes: ['/coordinator', '/coordinator/interviews', '/coordinator/event/:id'],
      },
    ],
  },
  {
    id: 'students',
    label: 'Student Management',
    shortLabel: 'Students',
    description: 'Student directory and profile visibility for coordinator support.',
    icon: Users,
    permissions: [
      {
        key: 'coordinator.students.view',
        name: 'My Students',
        description: 'View assigned students and basic student directory data.',
        accessType: 'View',
        usage: 'Shows My Students in the coordinator sidebar.',
        routes: ['/coordinator/students'],
      },
      {
        key: 'coordinator.students.profile',
        name: 'Student Profiles',
        description: 'Open detailed student profile pages from coordinator views.',
        accessType: 'View',
        usage: 'Allows student drill-down pages under coordinator scope.',
        routes: ['/coordinator/students/:studentId'],
      },
      {
        key: 'coordinator.students.promote',
        name: 'Promote Students',
        description: 'Review semester rosters and promote selected or all assigned students to the next semester.',
        accessType: 'Manage',
        usage: 'Shows Promote Students under coordinator settings.',
        routes: ['/coordinator/settings/promote-students'],
      },
    ],
  },
  {
    id: 'assessments',
    label: 'Assessment Management',
    shortLabel: 'Assessment',
    description: 'Assessment dashboard, builder, edit, preview, reports, and exports.',
    icon: ClipboardList,
    permissions: [
      {
        key: 'coordinator.assessment.view',
        name: 'Assessment Overview',
        description: 'View assessment dashboard and existing tests.',
        accessType: 'View',
        usage: 'Shows Assessment Overview.',
        routes: ['/coordinator/assessment'],
      },
      {
        key: 'coordinator.assessment.create',
        name: 'Create Assessment',
        description: 'Create new assessments using the existing admin assessment builder.',
        accessType: 'Create',
        usage: 'Shows Add Assessment and related assessment creation flows.',
        routes: ['/coordinator/assessment/create', '/coordinator/assessment/select-problem'],
      },
      {
        key: 'coordinator.assessment.edit',
        name: 'Edit and Preview Assessment',
        description: 'Edit and preview coordinator-accessible assessments.',
        accessType: 'Manage',
        usage: 'Allows assessment edit and preview screens.',
        routes: ['/coordinator/assessment/:id/edit', '/coordinator/assessment/preview/:id'],
      },
      {
        key: 'coordinator.assessment.reports',
        name: 'Assessment Reports',
        description: 'View assessment submissions, score reports, exports, and integrity details.',
        accessType: 'Report',
        usage: 'Shows Reports inside Assessment navigation.',
        routes: ['/coordinator/assessment/reports'],
      },
    ],
  },
  {
    id: 'compiler',
    label: 'Compiler Workspace',
    shortLabel: 'Compiler',
    description: 'Coding problem catalog, authoring, problem management, and analytics.',
    icon: TerminalSquare,
    permissions: [
      {
        key: 'coordinator.compiler.view',
        name: 'Compiler Overview',
        description: 'View the shared compiler workspace overview.',
        accessType: 'View',
        usage: 'Shows Compiler Overview.',
        routes: ['/coordinator/compiler'],
      },
      {
        key: 'coordinator.compiler.create',
        name: 'Create Coding Problems',
        description: 'Author new coding problems using the admin compiler tools.',
        accessType: 'Create',
        usage: 'Shows Create Problem in Compiler navigation.',
        routes: ['/coordinator/compiler/create'],
      },
      {
        key: 'coordinator.compiler.manage',
        name: 'Problem Management',
        description: 'Manage coding problems, previews, status, visibility, and test runs.',
        accessType: 'Manage',
        usage: 'Shows Problem Management and edit/preview routes.',
        routes: ['/coordinator/compiler/problems', '/coordinator/compiler/:id/edit', '/coordinator/compiler/:id/preview'],
      },
      {
        key: 'coordinator.compiler.analytics',
        name: 'Compiler Analytics',
        description: 'View coding submission analytics and performance signals.',
        accessType: 'Analytics',
        usage: 'Shows Analytics inside Compiler navigation.',
        routes: ['/coordinator/compiler/analytics'],
      },
    ],
  },
  {
    id: 'learning',
    label: 'Learning and Courses',
    shortLabel: 'Learning',
    description: 'Learning modules, semesters, subjects, topics, and registered course visibility.',
    icon: BookOpen,
    permissions: [
      {
        key: 'coordinator.learning.manage',
        name: 'Learning Modules',
        description: 'Manage semesters, subjects, chapters, and topics.',
        accessType: 'Manage',
        usage: 'Shows Learning Modules in the coordinator sidebar.',
        routes: ['/coordinator/subjects'],
      },
      {
        key: 'coordinator.courses.view',
        name: 'Registered Courses',
        description: 'View registered course and database information.',
        accessType: 'View',
        usage: 'Shows Registered Courses in the coordinator sidebar.',
        routes: ['/coordinator/database'],
      },
    ],
  },
  {
    id: 'library',
    label: 'Question Library',
    shortLabel: 'Library',
    description: 'Reusable assessment and coding question bank access.',
    icon: Library,
    permissions: [
      {
        key: 'coordinator.library.view',
        name: 'View Question Library',
        description: 'Browse reusable assessment and coding questions.',
        accessType: 'View',
        usage: 'Shows View Library in Library navigation.',
        routes: ['/coordinator/library'],
      },
      {
        key: 'coordinator.library.create',
        name: 'Add Library Questions',
        description: 'Create new reusable questions in the shared library.',
        accessType: 'Create',
        usage: 'Shows Add Question in Library navigation.',
        routes: ['/coordinator/library/add-question'],
      },
    ],
  },
  {
    id: 'communication',
    label: 'Communication and Feedback',
    shortLabel: 'Comms',
    description: 'Announcements, feedback review, and coordinator communication workflows.',
    icon: Megaphone,
    permissions: [
      {
        key: 'coordinator.announcements.create',
        name: 'Add Announcement',
        description: 'Create announcements using the shared announcement editor.',
        accessType: 'Create',
        usage: 'Shows Add Announcement in coordinator navigation.',
        routes: ['/coordinator/announcements/add'],
      },
      {
        key: 'coordinator.announcements.manage',
        name: 'Manage Announcements',
        description: 'Review, edit, and manage existing announcements.',
        accessType: 'Manage',
        usage: 'Shows Manage Announcements in coordinator navigation.',
        routes: ['/coordinator/announcements/manage'],
      },
      {
        key: 'coordinator.feedback.view',
        name: 'Feedback',
        description: 'View coordinator-scoped feedback and exports.',
        accessType: 'View',
        usage: 'Shows Feedback in the coordinator sidebar.',
        routes: ['/coordinator/feedback'],
      },
    ],
  },
  {
    id: 'company',
    label: 'Company Insights',
    shortLabel: 'Company',
    description: 'Company benchmarks, hiring targets, and readiness insight controls.',
    icon: Building2,
    permissions: [
      {
        key: 'coordinator.company.view',
        name: 'View Benchmarks',
        description: 'View company benchmarks and readiness targets.',
        accessType: 'View',
        usage: 'Shows View Benchmarks in Company Insights.',
        routes: ['/coordinator/company-insights'],
      },
      {
        key: 'coordinator.company.create',
        name: 'Add Company Benchmarks',
        description: 'Create or upload company readiness benchmark data.',
        accessType: 'Create',
        usage: 'Shows Add Benchmark in Company Insights.',
        routes: ['/coordinator/company-insights/add'],
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings and Access',
    shortLabel: 'Settings',
    description: 'Profile, password, activity history, and access visibility.',
    icon: Settings,
    permissions: [
      {
        key: 'coordinator.profile.manage',
        name: 'Profile and Password',
        description: 'Manage coordinator profile and password routes.',
        accessType: 'Manage',
        usage: 'Keeps account self-service available.',
        routes: ['/coordinator/profile', '/coordinator/change-password'],
      },
      {
        key: 'coordinator.activity.view',
        name: 'Activity History',
        description: 'View coordinator activity records.',
        accessType: 'View',
        usage: 'Shows coordinator activity and audit history.',
        routes: ['/coordinator/activity'],
      },
      {
        key: 'coordinator.access.self-view',
        name: 'Access Visibility',
        description: 'Allows a coordinator to understand their assigned access scope.',
        accessType: 'View',
        usage: 'Reserved for self-service access visibility.',
        routes: [],
      },
    ],
  },
];

export const coordinatorPermissions = coordinatorPermissionCategories.flatMap((category) =>
  category.permissions.map((permission) => ({ ...permission, categoryId: category.id, categoryLabel: category.label }))
);

export const defaultCoordinatorPermissions = coordinatorPermissions.map((permission) => permission.key);

export function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return defaultCoordinatorPermissions;
  const known = new Set(defaultCoordinatorPermissions);
  return [...new Set(permissions.filter((permission) => known.has(permission)))];
}

export function hasPermission(user, permission) {
  if (!permission) return true;
  if (!user || user.role !== 'coordinator') return true;
  return normalizePermissions(user.permissions).includes(permission);
}

export function countPermissions(permissions) {
  return normalizePermissions(permissions).length;
}

export const coordinatorNavPermissionIcons = {
  overview: LayoutDashboard,
  createInterview: CalendarPlus,
  scheduledInterview: CalendarClock,
  students: Users,
  learning: BookOpen,
  courses: Building2,
  feedback: MessageSquare,
  assessment: ClipboardList,
  library: Library,
  announcement: Megaphone,
  compiler: FileCode2,
  company: Building2,
  activity: Activity,
  access: ShieldCheck,
  settings: UserCog,
};
