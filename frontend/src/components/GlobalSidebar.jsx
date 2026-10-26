import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarPlus,
  CalendarClock,
  CalendarDays,
  Bot,
  History,
  UserPlus,
  Users,
  GraduationCap,
  BookOpen,
  MessageSquare,
  MessageSquareText,
  ClipboardList,
  Library,
  BarChart3,
  ChevronsLeft,
  Zap,
  CirclePlus,
  ChevronDown,
  ChevronRight,
  Settings,
  Mail,
  Megaphone,
  Building2,
  UserCog,
  ShieldCheck,
  ListChecks,
  FileSpreadsheet,
  Database,
  Activity,
  ChevronUp,
  Lock,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  User,
  X,
  BadgeCheck,
  Wallet,
  Send,
  ReceiptText,
  Tag,
  SlidersHorizontal,
  Coins,
  Trophy,
  Inbox,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canManageInterviewCompanies, isControlDeployment, isUniversityDeployment, PREP_COIN_PRICING_PATH, SUGGESTED_COMPANIES_PATH } from '../platform/universityPermissions';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import { useTheme } from '../context/ThemeContext';
import { hasPermission } from '../admin/coordinatorPermissions';
import { getInterviewNavigation, getInterviewSection } from './interviews/interviewNavigation';
import { getSidebarWidth, STUDENT_SIDEBAR_PANEL_WIDTH, STUDENT_SIDEBAR_RAIL_WIDTH } from './sidebarLayout';
import { firstStudentFeaturePath, hasStudentFeature } from '../student/studentFeatureAccess';

const buildNavItems = (role = 'admin', accessScope = 'full') => {
  if (role === 'student') {
    if (accessScope === 'assessment_only') {
      return [{
        type: 'group',
        key: 'assessments',
        label: 'Assessments',
        icon: ClipboardList,
        items: [
          { label: 'Available Tests', to: '/student/assessments', icon: ClipboardList },
          { label: 'Reports', to: '/student/assessment-reports', icon: BarChart3 },
          { label: 'History', to: '/student/assessment-history', icon: History },
        ],
      }];
    }
    return [
      { type: 'link', label: 'Dashboard', to: '/student/dashboard', icon: LayoutDashboard, featureKey: 'dashboard' },
      { type: 'link', label: 'QuickPrep', to: '/student/quickprep', icon: Zap, featureKey: 'quickprep' },
      { type: 'link', label: 'Analysis', to: '/student/analysis', icon: BarChart3, featureKey: 'analysis' },
      { type: 'link', label: 'Rankings', to: '/student/rankings', icon: BarChart3, featureKey: 'rankings' },
      { type: 'link', label: 'Interviews', to: '/student/interview', icon: CalendarDays, featureKey: 'interviews' },
      { type: 'link', label: 'AI Interviews', to: '/student/ai-interviews', icon: Bot, featureKey: 'ai_interviews' },
      {
        type: 'group',
        key: 'assessments',
        label: 'Assessments',
        icon: ClipboardList,
        featureKey: 'assessments',
        items: [
          { label: 'Available Tests', to: '/student/assessments', icon: ClipboardList },
          { label: 'Reports', to: '/student/assessment-reports', icon: BarChart3 },
          { label: 'History', to: '/student/assessment-history', icon: History },
        ],
      },
      { type: 'link', label: 'Learning', to: '/student/learning', icon: BookOpen, featureKey: 'learning' },
      { type: 'link', label: 'PrepCoding', to: '/problems', icon: ListChecks, featureKey: 'prep_coding' },
      { type: 'link', label: 'Resume Builder', to: '/student/resume', icon: UserCog, featureKey: 'resume' },
      { type: 'link', label: 'Prep Coins', to: '/student/wallet', icon: Wallet, featureKey: 'prep_coins' },
    ];
  }
  if (role === 'coordinator') {
    return [
      {
        type: 'link',
        label: 'Overview',
        to: '/coordinator/overview',
        icon: LayoutDashboard,
        permissionKey: 'coordinator.dashboard.overview',
        match: (loc) => loc.pathname === '/coordinator/overview' || loc.pathname === '/coordinator',
      },
      {
        type: 'group',
        key: 'interviews',
        label: 'Interviews',
        icon: CalendarDays,
        items: [
          {
            label: 'One-to-One Interviews',
            to: '/coordinator/interviews/one-to-one',
            icon: Users,
            permissionKey: 'coordinator.interviews.view',
            match: (loc) => loc.pathname.startsWith('/coordinator/interviews')
              || loc.pathname.startsWith('/coordinator/event')
              || loc.pathname === '/coordinator/feedback',
            children: getInterviewNavigation('/coordinator').map((item) => ({
              ...item,
              icon: { all: CalendarDays, active: Activity, scheduled: CalendarClock, past: History, feedback: MessageSquare, create: CalendarPlus }[item.id],
              match: (loc) => getInterviewSection(loc.pathname, loc.search) === item.id,
            })),
          },
          { label: 'AI Interviews', to: '/coordinator/ai-interviews', icon: Bot, permissionKey: 'coordinator.interviews.view' },
        ],
      },
      {
        type: 'group',
        key: 'student-management',
        label: 'Students',
        icon: GraduationCap,
        items: [
          { label: 'Student List', to: '/coordinator/students', icon: Users, permissionKey: 'coordinator.students.view' },
          { label: 'Bulk Student Lists', to: '/coordinator/students/bulk-lists', icon: ListChecks, permissionKey: 'coordinator.students.bulk-lists' },
          { label: 'Add Student', to: '/coordinator/onboarding', icon: UserPlus, permissionKey: 'coordinator.students.create' },
        ],
      },
      { type: 'link', label: 'Learning Modules', to: '/coordinator/subjects', icon: BookOpen, permissionKey: 'coordinator.learning.manage' },
      { type: 'link', label: 'Registered Courses', to: '/coordinator/database', icon: Building2, permissionKey: 'coordinator.courses.view' },
      {
        type: 'group',
        key: 'assessment',
        label: 'Assessments',
        icon: ClipboardList,
        items: [
          { label: 'All Assessments', to: '/coordinator/assessment', icon: ClipboardList, permissionKey: 'coordinator.assessment.view' },
          { label: 'Create Assessment', to: '/coordinator/assessment/create', icon: CalendarPlus, permissionKey: 'coordinator.assessment.create' },
          { label: 'Reports', to: '/coordinator/assessment/reports', icon: ClipboardList, permissionKey: 'coordinator.assessment.reports' },
          { label: 'Feedback', to: '/coordinator/assessment-feedback', icon: MessageSquareText, permissionKey: 'coordinator.assessment.feedback' },
        ],
      },
      {
        type: 'group',
        key: 'library',
        label: 'Library',
        icon: Library,
        items: [
          { label: 'View Library', to: '/coordinator/library', icon: Library, permissionKey: 'coordinator.library.view', match: (loc) => loc.pathname === '/coordinator/library' },
          { label: 'Add Question', to: '/coordinator/library/add-question', icon: UserPlus, permissionKey: 'coordinator.library.create' },
          { label: 'Create Coding Problem', to: '/coordinator/library/coding/create', icon: CalendarPlus, permissionKey: 'coordinator.compiler.create' },
          { label: 'Manage Coding Problems', to: '/coordinator/library/coding/problems', icon: ListChecks, permissionKey: 'coordinator.compiler.manage' },
          { label: 'Coding Analytics', to: '/coordinator/library/coding/analytics', icon: BarChart3, permissionKey: 'coordinator.compiler.analytics' },
        ],
      },
      {
        type: 'group',
        key: 'announcements',
        label: 'Announcements',
        icon: Megaphone,
        items: [
          { label: 'Add Announcement', to: '/coordinator/announcements/add', icon: Megaphone, permissionKey: 'coordinator.announcements.create' },
          { label: 'Manage Announcements', to: '/coordinator/announcements/manage', icon: Megaphone, permissionKey: 'coordinator.announcements.manage' },
        ],
      },
      {
        type: 'group',
        key: 'company-insights',
        label: 'Company Insights',
        icon: Building2,
        items: [
          { label: 'Add Benchmark', to: '/coordinator/company-insights/add', icon: Building2, permissionKey: 'coordinator.company.create' },
          { label: 'View Benchmarks', to: '/coordinator/company-insights', icon: Building2, permissionKey: 'coordinator.company.view' },
        ],
      },
      {
        type: 'group',
        key: 'settings',
        label: 'Settings',
        icon: Settings,
        items: [
          {
            label: 'Students & Data', icon: GraduationCap, folder: true,
            children: [
              { label: 'Promote Students', to: '/coordinator/settings/promote-students', icon: GraduationCap, permissionKey: 'coordinator.students.promote' },
              { label: 'Master Data', to: '/coordinator/settings/master-data', icon: Database, permissionKey: 'coordinator.master-data.manage' },
            ],
          },
          {
            label: 'Communication', icon: Mail, folder: true,
            children: [
              { label: 'Email Templates', to: '/coordinator/settings/email-templates', icon: Mail, permissionKey: 'coordinator.email-templates.manage' },
              { label: 'Email Queue', to: '/coordinator/email-queue', icon: Inbox, permissionKey: 'coordinator.email-queue.manage' },
            ],
          },
          {
            label: 'My Account', icon: User, folder: true,
            children: [
              { label: 'Profile', to: '/coordinator/profile', icon: User, permissionKey: 'coordinator.profile.manage' },
              { label: 'Change Password', to: '/coordinator/change-password', icon: Lock, permissionKey: 'coordinator.profile.manage' },
              { label: 'My Activity', to: '/coordinator/activity', icon: Activity, permissionKey: 'coordinator.activity.view' },
            ],
          },
        ],
      },
    ];
  }

  return [
    {
      type: 'link',
      label: 'Overview',
      to: '/admin/overview',
      icon: LayoutDashboard,
      match: (loc) => loc.pathname === '/admin' || loc.pathname.startsWith('/admin/overview') || loc.pathname.startsWith('/admin/dashboard'),
    },
    ...(isControlDeployment
      ? [
        {
          type: 'group',
          key: 'universities',
          label: 'Universities',
          icon: Building2,
          items: [
            { label: 'Overview', description: 'See platform-wide university activity and key totals.', to: '/admin/universities', icon: LayoutDashboard, match: (loc) => loc.pathname === '/admin/universities' },
            // A single university's page belongs to the list it was opened from.
            { label: 'All Universities', description: 'Browse and manage every connected institution.', to: '/admin/universities/all', icon: Building2, match: (loc) => loc.pathname === '/admin/universities/all' || (/^\/admin\/universities\/[^/]+\/?$/.test(loc.pathname) && !UNIVERSITY_SECTIONS.has(loc.pathname.split('/')[3])) },
            { label: 'Add University', description: 'Create and configure a new university workspace.', to: '/admin/universities/new', icon: CirclePlus },
            { label: 'Shared Assessments', description: 'Publish assessments for multiple universities.', to: '/admin/universities/assessments', icon: ClipboardList },
            { label: 'New-University Defaults', description: 'Set the modules and preferences used at creation.', to: '/admin/universities/defaults', icon: SlidersHorizontal },
            { label: 'Activity Log', description: 'Review recent platform administration changes.', to: '/admin/universities/activity', icon: History },
          ],
        },
        {
          type: 'group',
          key: 'prep-coins',
          label: 'Prep Coins',
          icon: Coins,
          items: [
            { label: 'Overview', description: 'Live balances, coin flow and spending.', to: '/admin/prep-coins', icon: LayoutDashboard, match: (loc) => loc.pathname === '/admin/prep-coins' || loc.pathname === '/admin/wallet' },
            { label: 'Issue Coins', description: 'Add coins to a university or a PeerPrep account.', to: '/admin/prep-coins/issue', icon: Send },
            { label: 'Wallets', description: 'University wallets and PeerPrep account balances.', to: '/admin/prep-coins/wallets', icon: Wallet },
            { label: 'Ledger', description: 'Every coin movement, filterable.', to: '/admin/prep-coins/ledger', icon: ReceiptText },
            { label: 'Pricing', description: 'What paid features cost students.', to: PREP_COIN_PRICING_PATH, icon: Tag },
          ],
        },
      ]
      : []),
    { type: 'link', label: 'Prep Analysis', to: '/admin/analysis', icon: BarChart3 },
    {
      type: 'group',
      key: 'interviews',
      label: 'Interviews',
      icon: CalendarDays,
      items: [
        {
          label: 'One-to-One Interviews',
          to: '/admin/interviews/one-to-one',
          icon: Users,
          match: (loc) => loc.pathname.startsWith('/admin/interviews')
            || loc.pathname.startsWith('/admin/event')
            || loc.pathname === '/admin/feedback',
          children: getInterviewNavigation('/admin').map((item) => ({
            ...item,
            icon: { all: CalendarDays, active: Activity, scheduled: CalendarClock, past: History, feedback: MessageSquare, create: CalendarPlus }[item.id],
            match: (loc) => getInterviewSection(loc.pathname, loc.search) === item.id,
          })),
        },
        {
          label: 'AI Interviews',
          to: '/admin/ai-interviews',
          icon: Bot,
          children: [
            { label: 'All AI Interviews', to: '/admin/ai-interviews', icon: ClipboardList, match: (loc) => loc.pathname === '/admin/ai-interviews' },
            { label: 'Create AI Interview', to: '/admin/ai-interviews/new', icon: CalendarPlus },
            { label: 'Schedules', to: '/admin/ai-interviews/schedules', icon: CalendarClock },
            { label: 'Avatars', to: '/admin/ai-interviews/avatars', icon: UserCog },
            { label: 'Reports', to: '/admin/ai-interviews/reports', icon: BarChart3 },
          ],
        },
      ],
    },
    {
      type: 'group',
      key: 'coordinator-management',
      label: 'Coordinator',
      icon: UserCog,
      items: [
        { label: 'Add Coordinators', to: '/admin/coordinators', icon: GraduationCap },
        { label: 'Coordinator List', to: '/admin/coordinator-directory', icon: Users },
        { label: 'Coordinator Overview', to: '/admin/coordinator-overview', icon: LayoutDashboard },
        { label: 'Coordinator Access', to: '/admin/coordinator-access', icon: ShieldCheck },
      ],
    },
    {
      type: 'group',
      key: 'student-management',
      label: 'Student',
      icon: GraduationCap,
      items: [
        { label: 'Student List', to: '/admin/students', icon: Users, match: (currentLocation) => currentLocation.pathname === '/admin/students' },
        { label: 'Add Student', to: '/admin/onboarding', icon: UserPlus },
      ],
    },
    { type: 'link', label: 'Learning Modules', to: '/admin/learning', icon: BookOpen },
    {
      type: 'group',
      key: 'assessment',
      label: 'Assessments',
      icon: ClipboardList,
      items: [
        { label: 'All Assessments', to: '/admin/assessment', icon: ClipboardList },
        { label: 'Create Assessment', to: '/admin/assessment/create', icon: CalendarPlus },
        { label: 'Reports', to: '/admin/assessment/reports', icon: ClipboardList },
        { label: 'Feedback', to: '/admin/assessment-feedback', icon: MessageSquareText },
      ],
    },
    {
      type: 'group',
      key: 'library',
      label: 'Library',
      icon: Library,
      items: [
        { label: 'View Library', to: '/admin/library', icon: Library, match: (loc) => loc.pathname === '/admin/library' },
      ],
    },
    {
      type: 'group',
      key: 'quickprep',
      label: 'QuickPrep',
      icon: Zap,
      items: [
        { label: 'All QuickPreps', to: '/admin/quickprep', icon: ListChecks, match: (loc) => /^\/admin\/quickprep(\/(?!new$|insights$)[^/]+(\/(edit|questions\/add))?)?\/?$/.test(loc.pathname) },
        { label: 'Create QuickPrep', to: '/admin/quickprep/new', icon: CirclePlus },
        // Student progress lives in each university, so the central platform has no QuickPrep insights.
        ...(isControlDeployment ? [] : [{ label: 'Insights', to: '/admin/quickprep/insights', icon: BarChart3 }]),
      ],
    },
    {
      type: 'group',
      key: 'announcements',
      label: 'Announcements',
      icon: Megaphone,
      items: [
        { label: 'Add Announcement', to: '/admin/announcements/add', icon: Megaphone },
        { label: 'Manage Announcements', to: '/admin/announcements/manage', icon: Megaphone },
      ],
    },
    {
      type: 'group',
      key: 'company-insights',
      label: 'Company Insights',
      icon: Building2,
      items: [
        { label: 'Add Benchmark', to: '/admin/company-insights/add', icon: Building2 },
        { label: 'View Benchmarks', to: '/admin/company-insights', icon: Building2 },
      ],
    },
    {
      type: 'group',
      key: 'settings',
      label: 'Settings',
      icon: Settings,
      // Folders keep related settings together; Master-Admin-only settings exist only on the central platform.
      items: [
        {
          label: 'Scoring & Rewards',
          icon: Trophy,
          folder: true,
          children: [
            ...(isControlDeployment ? [
              { label: 'Prep Score Adjustment', to: '/admin/settings/prep-score-adjustment', icon: SlidersHorizontal },
            ] : []),
            { label: 'Challenges & Badges', to: '/admin/settings/student-progression', icon: Activity },
          ],
        },
        {
          label: 'Students',
          icon: GraduationCap,
          folder: true,
          children: [
            { label: 'Student Access', to: '/admin/settings/student-access', icon: ShieldCheck },
            { label: 'Bulk Uploads', to: '/admin/settings/bulk-uploads', icon: FileSpreadsheet },
            { label: 'Promote Students', to: '/admin/settings/promote-students', icon: GraduationCap },
          ],
        },
        {
          label: 'Communication',
          icon: Mail,
          folder: true,
          children: [
            { label: 'Email Templates', to: '/admin/settings/email-templates', icon: Mail },
            { label: 'Email Queue', to: '/admin/email-queue', icon: Inbox },
          ],
        },
        {
          label: 'Reference Data',
          icon: Database,
          folder: true,
          children: [
            { label: 'Master Data', to: '/admin/settings/master-data', icon: Database },
            ...(canManageInterviewCompanies ? [{ label: 'Suggested Companies', to: SUGGESTED_COMPANIES_PATH, icon: BadgeCheck }] : []),
          ],
        },
      ],
    },
  ];
};

// Fixed pages under /admin/universities; any other segment is one university's own page.
const UNIVERSITY_SECTIONS = new Set(['all', 'new', 'assessments', 'defaults', 'activity']);

function applyPlatformPermissions(items, allowsPath, role) {
  return items.map((item) => {
    if (item.items) {
      const children = applyPlatformPermissions(item.items, allowsPath, role);
      return children.length ? { ...item, items: children } : null;
    }
    if (item.children) {
      const children = applyPlatformPermissions(item.children, allowsPath, role);
      return children.length ? { ...item, children, to: children[0].to } : null;
    }
    return allowsPath(item.to, role) ? item : null;
  }).filter(Boolean);
}

export default function GlobalSidebar({ role = 'admin', isExpanded = false, isPinned = false, onTogglePin = () => {}, onExpand = () => {}, onCollapse = () => {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { allowsPath } = useUniversityPolicy();
  const { theme, toggleTheme } = useTheme();
  const profileOpenRef = useRef(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isCoordinator = role === 'coordinator';
  const isStudent = role === 'student';
  const storagePrefix = isCoordinator ? 'coordinator' : isStudent ? 'student' : 'admin';
  const isAssessmentCandidate = isStudent && user?.accessScope === 'assessment_only';
  const roleLabel = isCoordinator ? 'Coordinator' : isAssessmentCandidate ? 'Assessment Candidate' : isStudent ? 'Student' : 'Administrator';
  const displayName = user?.name || localStorage.getItem(`${storagePrefix}Name`) || roleLabel;
  const displayEmail = user?.email || localStorage.getItem(`${storagePrefix}Email`) || '';
  const avatarUrl = user?.avatarUrl || localStorage.getItem(`${storagePrefix}AvatarUrl`) || '';
  const homePath = isCoordinator ? '/coordinator/overview' : isAssessmentCandidate ? '/student/assessments' : isStudent ? firstStudentFeaturePath(user) : '/admin/overview';
  const accountMenuId = `${storagePrefix}-account-menu`;
  const accent = isCoordinator ? 'emerald' : 'sky';
  const navItems = useMemo(() => {
    const items = buildNavItems(role, user?.accessScope);
    if (role === 'student') return items.filter((item) => !item.featureKey || hasStudentFeature(user, item.featureKey));
    if (role !== 'student' && (isUniversityDeployment || role !== 'admin')) items.unshift({ type: 'link', label: 'Prep Coin management', to: `/${role}/wallet`, icon: Wallet });
    if (role !== 'coordinator') return applyPlatformPermissions(items, allowsPath, role);
    return applyPlatformPermissions(items
      .map((item) => {
        if (item.type === 'group') {
          const children = item.items
            .map((child) => {
              if (!child.children) return hasPermission(user, child.permissionKey) ? child : null;
              const nested = child.children.filter((entry) => hasPermission(user, entry.permissionKey));
              return nested.length ? { ...child, children: nested, to: nested[0].to } : null;
            })
            .filter(Boolean);
          return children.length ? { ...item, items: children } : null;
        }
        return hasPermission(user, item.permissionKey) ? item : null;
      })
      .filter(Boolean), allowsPath, role);
  }, [role, user, allowsPath]);
  const [openGroup, setOpenGroup] = useState(null);
  const [openNestedGroup, setOpenNestedGroup] = useState(null);
  const [groupPanelTop, setGroupPanelTop] = useState(88);
  const groupButtonRefs = useRef(new Map());
  const groupPanelRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const resolvedSidebarWidth = isStudent
    ? (isExpanded ? STUDENT_SIDEBAR_PANEL_WIDTH : STUDENT_SIDEBAR_RAIL_WIDTH)
    : getSidebarWidth(isExpanded);

  const handleSidebarEnter = () => {
    window.clearTimeout(hoverTimerRef.current);
    if (!isStudent || isPinned) { onExpand(); return; }
    hoverTimerRef.current = window.setTimeout(onExpand, 90);
  };

  const handleSidebarLeave = () => {
    window.clearTimeout(hoverTimerRef.current);
    if (profileOpenRef.current || openGroup || (isStudent && isPinned)) return;
    hoverTimerRef.current = window.setTimeout(onCollapse, isStudent ? 160 : 0);
  };

  useEffect(() => () => window.clearTimeout(hoverTimerRef.current), []);

  const updateProfileOpen = (nextValue) => {
    const resolvedValue = typeof nextValue === 'function' ? nextValue(profileOpenRef.current) : nextValue;
    profileOpenRef.current = resolvedValue;
    setIsProfileOpen(resolvedValue);
  };

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    if (user?.name) localStorage.setItem(`${storagePrefix}Name`, user.name);
    if (user?.email) localStorage.setItem(`${storagePrefix}Email`, user.email);
    if (user && Object.prototype.hasOwnProperty.call(user, 'avatarUrl')) {
      localStorage.setItem(`${storagePrefix}AvatarUrl`, user.avatarUrl || '');
    }
  }, [storagePrefix, user]);

  const isRouteActive = (item) => {
    if (item.match) return item.match(location);
    if (item.children) return item.children.some((child) => isRouteActive(child));
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  };

  const navigationKey = `${location.pathname}${location.search}`;
  useEffect(() => {
    setOpenGroup(null);
    setOpenNestedGroup(null);
  }, [navigationKey]);

  useEffect(() => {
    if (!openGroup) return undefined;
    const closeOnOutsideClick = (event) => {
      if (profileOpenRef.current) return;
      if (groupPanelRef.current?.contains(event.target)) return;
      if (groupButtonRefs.current.get(openGroup)?.contains(event.target)) return;
      if (event.target.closest('aside')) return;
      setOpenGroup(null);
      setOpenNestedGroup(null);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || profileOpenRef.current) return;
      setOpenGroup(null);
      setOpenNestedGroup(null);
      groupButtonRefs.current.get(openGroup)?.focus();
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openGroup]);

  const isGroupActive = (group) => group.items.some((child) => isRouteActive(child));

  const handleGroupToggle = (item, button) => {
    if (!isExpanded) onExpand();
    if (openGroup === item.key) {
      setOpenGroup(null);
      setOpenNestedGroup(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const estimatedHeight = Math.min(620, 104 + item.items.length * 68);
    setGroupPanelTop(Math.max(12, Math.min(rect.top - 10, window.innerHeight - estimatedHeight - 12)));
    setOpenNestedGroup(null);
    setOpenGroup(item.key);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      updateProfileOpen(false);
      ['token', 'isAdmin', 'isStudent', 'adminName', 'adminEmail', 'adminAvatarUrl', 'coordinatorName', 'coordinatorEmail', 'coordinatorAvatarUrl', 'studentName', 'studentEmail', 'studentAvatarUrl']
        .forEach((key) => localStorage.removeItem(key));
      window.location.assign('/');
    }
  };

  return (
    <aside
      onMouseEnter={handleSidebarEnter}
      onMouseLeave={handleSidebarLeave}
      className={`fixed left-0 top-0 z-[70] h-screen overflow-visible border-r transition-[width,box-shadow,background-color] ease-[cubic-bezier(0.22,1,0.36,1)] ${isStudent ? `border-sky-100 bg-[#f8fbff] duration-300 dark:border-sky-950 dark:bg-slate-950 ${isExpanded ? 'shadow-[10px_0_32px_rgba(14,165,233,0.09)] dark:shadow-black/30' : 'shadow-[3px_0_18px_rgba(14,165,233,0.05)]'}` : 'border-sky-100 bg-sky-50/90 shadow-[4px_0_28px_rgba(14,165,233,0.08)] backdrop-blur-2xl duration-[800ms] dark:border-sky-950 dark:bg-slate-950/95 dark:shadow-black/20'}`}
      style={{ width: resolvedSidebarWidth }}
    >
      {!isStudent && <button
        type="button"
        onClick={isExpanded ? onCollapse : onExpand}
        className="absolute -right-3 top-[68px] z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-sky-700 dark:hover:text-sky-400"
        aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isExpanded ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
      </button>}
      <div className="flex h-full min-h-0 flex-col">
        <div className={`relative mx-2 shrink-0 border-b border-sky-100 bg-[#f8fbff] dark:border-sky-950 dark:bg-slate-950 ${isStudent ? 'h-[68px]' : 'h-[76px]'}`}>
          <Link
            to={homePath}
            title="PeerPrep home"
            className={`flex h-full items-center overflow-hidden ${isStudent ? (isExpanded ? 'justify-start px-2 pr-10' : 'justify-center') : ''}`}
          >
            <div className="relative h-14 w-full shrink-0 overflow-hidden">
            {isStudent ? <>
              <img src="/images/peerprep-mark.png" alt="PeerPrep" className={`absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 object-contain transition-[opacity,transform] duration-200 ease-out ${isExpanded ? 'scale-90 opacity-0' : 'scale-100 opacity-100'}`} />
              <img src="/images/peerprep-wordmark.png" alt="PeerPrep" className={`absolute left-1 top-1/2 h-auto w-[158px] -translate-y-1/2 object-contain transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} />
            </> : <img src="/images/logo.png" alt="PeerPrep" className={`absolute top-1/2 h-auto w-[187px] max-w-none -translate-y-1/2 transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? '-left-1' : '-left-5'}`} />}
            </div>
          </Link>
          {isStudent && isExpanded && (
            <button
              type="button"
              onClick={onTogglePin}
              className="absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-900 dark:hover:text-sky-300"
              aria-label={isPinned ? 'Collapse navigation' : 'Keep navigation open'}
              title={isPinned ? 'Collapse navigation' : 'Keep navigation open'}
            >
              <ChevronsLeft className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        <nav className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isStudent ? 'space-y-1 px-2 py-3' : 'space-y-1 px-1.5 py-3'}`} aria-label={`${roleLabel} navigation`}>
        {navItems.map((item) => {
          if (item.type === 'link') {
            const Icon = item.icon;
            const active = isRouteActive(item);
            return (
              <NavLink
                key={item.label}
                to={item.to}
                title={item.label}
                className={`group relative flex min-h-10 items-center rounded-xl py-1 text-[13px] transition-[background-color,color,box-shadow,transform] duration-200 ${active ? 'font-semibold' : 'font-medium'} ${
                  active
                    ? isStudent ? 'bg-sky-50/90 text-sky-800 shadow-[0_3px_12px_rgba(14,165,233,0.08)] ring-1 ring-sky-200 dark:bg-sky-950/70 dark:text-sky-200 dark:ring-sky-900' : 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-900/30 dark:text-sky-300'
                    : isStudent ? 'text-slate-700 hover:bg-white/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[.06] dark:hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <span className={`absolute left-[10px] flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-200 ${
                  active
                    ? isStudent ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-100 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300'
                    : isStudent ? 'bg-transparent text-slate-700 group-hover:text-sky-700 dark:text-slate-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className={`ml-12 min-w-0 whitespace-nowrap pr-2 text-left leading-tight transition-[opacity,transform] duration-200 ${isExpanded ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-1 opacity-0'}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          }

          const GroupIcon = item.icon;
          const isOpen = openGroup === item.key;
          const groupActive = isGroupActive(item);
          const groupPanelId = `${storagePrefix}-nav-${item.key}`;

          return (
            <div key={item.key}>
              <button
                ref={(node) => {
                  if (node) groupButtonRefs.current.set(item.key, node);
                  else groupButtonRefs.current.delete(item.key);
                }}
                type="button"
                onClick={(event) => handleGroupToggle(item, event.currentTarget)}
                title={item.label}
                aria-expanded={isOpen}
                aria-controls={groupPanelId}
                data-platform-disclosure="navigation"
                className={`relative flex min-h-10 w-full items-center rounded-xl py-1 text-[13px] transition-[background-color,color,box-shadow] duration-200 ${groupActive ? 'font-semibold' : 'font-medium'} ${
                  groupActive
                    ? isStudent ? 'bg-sky-50/90 text-sky-800 shadow-[0_3px_12px_rgba(14,165,233,0.08)] ring-1 ring-sky-200 dark:bg-sky-950/70 dark:text-sky-200 dark:ring-sky-900' : 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-900/30 dark:text-sky-300'
                    : isStudent ? 'text-slate-700 hover:bg-white/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[.06] dark:hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <span className={`absolute left-[10px] flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  groupActive
                    ? isStudent ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-100 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300'
                    : isStudent ? 'bg-transparent text-slate-700 dark:text-slate-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  <GroupIcon className="h-[18px] w-[18px]" />
                </span>
                <span className={`ml-12 min-w-0 flex-1 whitespace-nowrap pr-8 text-left leading-tight transition-[opacity,transform] duration-200 ${isExpanded ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-1 opacity-0'}`}>
                  {item.label}
                </span>
                {isExpanded && (
                  <ChevronRight className={`absolute right-3 h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'translate-x-0.5 text-sky-600' : ''}`} />
                )}
              </button>

              {isOpen && createPortal(
                <section
                  ref={groupPanelRef}
                  id={groupPanelId}
                  role="dialog"
                  aria-label={`${item.label} navigation`}
                  className="fixed z-[9998] flex w-[21rem] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,0.22)] ring-1 ring-white/80 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 dark:ring-slate-800"
                  style={{
                    left: `calc(${resolvedSidebarWidth} + 0.75rem)`,
                    top: `${groupPanelTop}px`,
                    maxWidth: `calc(100vw - ${resolvedSidebarWidth} - 1.5rem)`,
                    maxHeight: `calc(100vh - ${groupPanelTop + 12}px)`,
                  }}
                >
                  <header className="relative shrink-0 overflow-hidden border-b border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-4 py-4 dark:border-sky-950 dark:from-slate-800 dark:via-slate-900 dark:to-sky-950/60">
                    <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-sky-200/35 blur-2xl dark:bg-sky-600/10" />
                    <div className="relative flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-[0_8px_20px_rgba(2,132,199,0.24)]">
                        <GroupIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">Sub navigation</p>
                        <h2 className="mt-0.5 truncate text-base font-bold text-slate-900 dark:text-white">{item.label}</h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Choose one of {item.items.length} available sections.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setOpenGroup(null); setOpenNestedGroup(null); }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 hover:shadow-sm dark:hover:bg-slate-800 dark:hover:text-white"
                        aria-label={`Close ${item.label} navigation`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2.5 [scrollbar-width:thin]">
                  {item.items.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = isRouteActive(child);
                    if (child.children?.length) {
                      const nestedKey = `${item.key}:${child.label}`;
                      const nestedOpen = openNestedGroup === nestedKey;
                      const nestedPanelId = `${groupPanelId}-${child.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                      return (
                        <div key={child.label} className="overflow-hidden rounded-xl border border-transparent transition-colors hover:border-slate-100 dark:hover:border-slate-700">
                          {child.folder ? (
                            <button
                              type="button"
                              aria-label={child.label}
                              aria-expanded={nestedOpen}
                              aria-controls={nestedPanelId}
                              data-platform-disclosure="navigation"
                              onClick={() => setOpenNestedGroup(nestedOpen ? null : nestedKey)}
                              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors ${childActive ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                            >
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${childActive ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}><ChildIcon className="h-4 w-4" /></span>
                              <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-tight">{child.label}</span><span className="mt-1 block text-[11px] font-normal leading-snug text-slate-500 dark:text-slate-400">{child.description || `Explore ${child.label.toLowerCase()} options.`}</span></span>
                              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${nestedOpen ? 'rotate-180' : ''}`} />
                            </button>
                          ) : (
                            <div className={`flex items-center rounded-xl transition-colors ${childActive ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                              <NavLink
                                to={child.to}
                                aria-label={child.label}
                                data-submenu-trigger="true"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setOpenNestedGroup(nestedOpen ? null : nestedKey);
                                }}
                                className="flex min-w-0 flex-1 items-center gap-3 p-3"
                              >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${childActive ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}><ChildIcon className="h-4 w-4" /></span>
                                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-tight">{child.label}</span><span className="mt-1 block text-[11px] font-normal leading-snug text-slate-500 dark:text-slate-400">{child.description || `Open ${child.label.toLowerCase()} and related tools.`}</span></span>
                              </NavLink>
                              <button
                                type="button"
                                aria-label={`${nestedOpen ? 'Collapse' : 'Expand'} ${child.label}`}
                                aria-expanded={nestedOpen}
                                aria-controls={nestedPanelId}
                                data-platform-disclosure="navigation"
                                onClick={() => setOpenNestedGroup(nestedOpen ? null : nestedKey)}
                                className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-sky-700 hover:shadow-sm dark:hover:bg-slate-700 dark:hover:text-sky-300"
                              >
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${nestedOpen ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          )}
                          <div id={nestedPanelId} inert={!nestedOpen} className={`overflow-hidden transition-[max-height,opacity] duration-200 ${nestedOpen ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="mb-2 ml-[3.75rem] mr-2 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-700">
                              {child.children.map((nestedChild) => {
                                const NestedIcon = nestedChild.icon;
                                const nestedActive = isRouteActive(nestedChild);
                                return (
                                  <Link key={nestedChild.label} to={nestedChild.to} aria-label={nestedChild.label} aria-current={nestedActive ? 'page' : undefined} className={`flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition ${nestedActive ? 'bg-white text-sky-700 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:text-sky-300 dark:ring-slate-700' : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}>
                                    <NestedIcon className="h-3 w-3 shrink-0" />
                                    <span className="min-w-0 leading-tight">{nestedChild.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <NavLink
                        key={child.label}
                        to={child.to}
                        aria-label={child.label}
                        className={`group/flyout flex items-center gap-3 rounded-xl border p-3 transition-all ${
                          childActive
                            ? 'border-sky-200 bg-sky-50 text-sky-800 shadow-sm dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200'
                            : 'border-transparent text-slate-700 hover:border-slate-100 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${childActive ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 group-hover/flyout:bg-white group-hover/flyout:text-sky-700 dark:bg-slate-700 dark:text-slate-300 dark:group-hover/flyout:bg-slate-700'}`}><ChildIcon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-tight">{child.label}</span><span className="mt-1 block text-[11px] font-normal leading-snug text-slate-500 dark:text-slate-400">{child.description || `Open ${child.label.toLowerCase()} and related tools.`}</span></span>
                        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform group-hover/flyout:translate-x-0.5 ${childActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-300 dark:text-slate-600'}`} />
                      </NavLink>
                    );
                  })}
                  </div>
                  <footer className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[10px] font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-500">
                    Press Esc or click outside to close
                  </footer>
                </section>,
                document.body,
              )}
            </div>
          );
        })}
        </nav>

        <div className={`relative shrink-0 border-t border-sky-100 dark:border-sky-950 ${isStudent ? 'p-2' : 'py-2'}`}>
          {isProfileOpen && createPortal(
            <div
              id={accountMenuId}
              className={`pointer-events-auto fixed bottom-3 z-[9999] w-[18rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.18)] transition-[left] ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/50 ${isStudent ? 'duration-300' : 'duration-[800ms]'}`}
              style={{ left: `calc(${resolvedSidebarWidth} + 0.75rem)` }}
              role="dialog"
              aria-label="Account menu"
            >
              <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-4 dark:border-gray-800 dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-11 w-11 rounded-xl object-cover ring-2 ring-white dark:ring-gray-700" />
                  ) : (
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${accent === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                      {initials || (isCoordinator ? 'CO' : isStudent ? 'ST' : 'AD')}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{displayName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-gray-400">{displayEmail || `${roleLabel} account`}</p>
                  </div>
                  <button type="button" onClick={() => updateProfileOpen(false)} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-700 dark:hover:text-gray-100" aria-label="Close account menu">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-2">
                {(isCoordinator || (isStudent && !isAssessmentCandidate)) && (
                  <button type="button" onClick={() => navigate(isStudent ? '/student/profile' : '/coordinator/profile')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                    <User className="h-4 w-4 text-slate-400" />
                    My profile
                  </button>
                )}
                {!isStudent && <button type="button" onClick={() => navigate(isCoordinator ? '/coordinator/activity' : '/admin/activity')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <Activity className="h-4 w-4 text-slate-400" />
                  Activity log
                </button>}
                <button type="button" onClick={() => navigate(isCoordinator ? '/coordinator/change-password' : isStudent ? '/student/change-password' : '/admin/change-password')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <Lock className="h-4 w-4 text-slate-400" />
                  Change password
                </button>

                <div className="my-2 border-t border-slate-100 dark:border-gray-800" />
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    updateProfileOpen(true);
                  }}
                  className="relative z-10 flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-200 dark:hover:bg-gray-800"
                  role="switch"
                  aria-checked={theme === 'dark'}
                >
                  {theme === 'dark' ? <Moon className="h-4 w-4 text-sky-400" /> : <Sun className="h-4 w-4 text-amber-500" />}
                  <span className="flex-1">Dark theme</span>
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${theme === 'dark' ? 'bg-sky-500' : 'bg-slate-200 dark:bg-gray-700'}`} aria-hidden="true">
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </span>
                </button>
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>,
            document.body,
          )}

          <button
            type="button"
            onClick={() => {
              if (!isExpanded) onExpand();
              updateProfileOpen((open) => !open);
            }}
            className={`relative flex h-12 w-full items-center overflow-hidden rounded-xl text-left transition ${isProfileOpen ? 'bg-sky-50 shadow-sm ring-1 ring-sky-200 dark:bg-sky-950/60 dark:ring-sky-900' : 'hover:bg-sky-50/80 dark:hover:bg-sky-950/40'}`}
            aria-expanded={isProfileOpen}
            aria-controls={accountMenuId}
            aria-label="Open account menu"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="absolute left-2 h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span className={`absolute left-2 flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${accent === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                {initials || (isCoordinator ? 'CO' : isStudent ? 'ST' : 'AD')}
              </span>
            )}
            <span className={`ml-14 min-w-0 flex-1 whitespace-nowrap pr-8 transition-[opacity,transform] duration-200 ${isExpanded ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-1 opacity-0'}`}>
              <span className="block truncate text-sm font-bold text-slate-800 dark:text-gray-100">{displayName}</span>
              <span className="block text-[11px] font-medium text-slate-500 dark:text-gray-400">{roleLabel}</span>
            </span>
            {isExpanded && <ChevronUp className={`absolute right-3 h-4 w-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
