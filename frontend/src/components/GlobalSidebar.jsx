import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
  MinusCircle,
  ReceiptText,
  Tag,
  SlidersHorizontal,
  Coins,
  Trophy,
  Inbox,
  Handshake,
  Briefcase,
  Target,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isLimitedUniversityAdmin, isUniversitySpoc } from '../platform/adminAccess';
import { canManageInterviewCompanies, isControlDeployment, isUniversityDeployment, PREP_COIN_PRICING_PATH, QUICKPREP_ANALYSIS_PATH, SUGGESTED_COMPANIES_PATH } from '../platform/universityPermissions';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import { useTheme } from '../context/ThemeContext';
import { hasPermission } from '../admin/coordinatorPermissions';
import { getInterviewNavigation, getInterviewSection } from './interviews/interviewNavigation';
import { getSidebarWidth, STUDENT_SIDEBAR_PANEL_WIDTH, STUDENT_SIDEBAR_RAIL_WIDTH } from './sidebarLayout';
import { firstStudentFeaturePath, hasStudentFeature } from '../student/studentFeatureAccess';
import MobileNavigation from './MobileNavigation';
import SidebarGuidesButton from '../guide/platform/SidebarGuidesButton';
import { usePlatformGuide } from '../guide/platform/context';
import useIsMobileNav from './useIsMobileNav';
import { canUsePeers, compactCount, PEER_TERMS, usePeerSummary } from '../student/peers/peerNetwork';

const PrepMatesModal = lazy(() => import('../student/peers/PrepMatesModal'));

const buildNavItems = (role = 'admin', accessScope = 'full') => {
  if (role === 'student') {
    if (accessScope === 'assessment_only') {
      return [{
        type: 'group',
        key: 'assessments',
        label: 'Prep Assessment',
        icon: ClipboardList,
        items: [
          { label: 'Available Tests', to: '/student/assessments', icon: ClipboardList },
          { label: 'Reports', to: '/student/assessment-reports', icon: BarChart3 },
          { label: 'History', to: '/student/assessment-history', icon: History },
        ],
      }];
    }
    // Order agreed with the university (2026-11): the seven core items first, then the remaining features.
    return [
      { type: 'link', label: 'Dashboard', to: '/student/dashboard', icon: LayoutDashboard, featureKey: 'dashboard' },
      { type: 'link', label: 'Prep Coding', to: '/problems', icon: ListChecks, featureKey: 'prep_coding' },
      { type: 'link', label: 'Quick Prep', to: '/student/quickprep', icon: Zap, featureKey: 'quickprep' },
      {
        type: 'group',
        key: 'assessments',
        label: 'Prep Assessment',
        icon: ClipboardList,
        featureKey: 'assessments',
        items: [
          { label: 'Available Tests', to: '/student/assessments', icon: ClipboardList },
          { label: 'Reports', to: '/student/assessment-reports', icon: BarChart3 },
          { label: 'History', to: '/student/assessment-history', icon: History },
        ],
      },
      { type: 'link', label: 'Prep Mock', to: '/student/prep-mock', icon: Briefcase, featureKey: 'prep_mock' },
      { type: 'link', label: 'Prep Resume', to: '/student/resume', icon: UserCog, featureKey: 'resume' },
      { type: 'link', label: 'Ranking', to: '/student/rankings', icon: Trophy, featureKey: 'rankings' },
      { type: 'link', label: 'Prep Coin', to: '/student/wallet', icon: Wallet, featureKey: 'prep_coins' },
      { type: 'link', label: 'Prep Analysis', to: '/student/analysis', icon: BarChart3, featureKey: 'analysis' },
      { type: 'link', label: 'Interviews', to: '/student/interview', icon: CalendarDays, featureKey: 'interviews' },
      { type: 'link', label: 'AI Interviews', to: '/student/ai-interviews', icon: Bot, featureKey: 'ai_interviews' },
      { type: 'link', label: 'Learning', to: '/student/learning', icon: BookOpen, featureKey: 'learning' },
      { type: 'link', label: 'Prep Mates', to: '/student/peers', icon: Users, featureKey: 'peers' },
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

  const overview = {
    type: 'link',
    label: 'Overview',
    to: '/admin/overview',
    icon: LayoutDashboard,
    match: (loc) => loc.pathname === '/admin' || loc.pathname.startsWith('/admin/overview') || loc.pathname.startsWith('/admin/dashboard'),
  };
  // University and Prep Coins exist only on the central (control) platform.
  const university = {
    type: 'group',
    key: 'universities',
    label: 'University',
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
  };
  const prepCoins = {
    type: 'group',
    key: 'prep-coins',
    label: 'Prep Coins',
    icon: Coins,
    items: [
      { label: 'Overview', description: 'Live balances, coin flow and spending.', to: '/admin/prep-coins', icon: LayoutDashboard, match: (loc) => loc.pathname === '/admin/prep-coins' || loc.pathname === '/admin/wallet' },
      { label: 'Issue Coins', description: 'Add coins to a university or a PeerPrep account.', to: '/admin/prep-coins/issue', icon: Send },
      { label: 'Remove Coins', description: 'Deduct available coins from a university or student wallet.', to: '/admin/prep-coins/remove', icon: MinusCircle },
      { label: 'Wallets', description: 'University wallets and PeerPrep account balances.', to: '/admin/prep-coins/wallets', icon: Wallet },
      { label: 'Ledger', description: 'Every coin movement, filterable.', to: '/admin/prep-coins/ledger', icon: ReceiptText },
      { label: 'Pricing', description: 'What paid features cost students.', to: PREP_COIN_PRICING_PATH, icon: Tag },
    ],
  };
  const prepAnalysis = { type: 'link', label: 'Prep Analysis', to: '/admin/analysis', icon: BarChart3 };
  const prepInterview = {
    type: 'group',
    key: 'interviews',
    label: 'Prep Interview',
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
  };
  const prepMock = {
    type: 'group',
    key: 'prepmock',
    label: 'PrepMock',
    icon: ClipboardList,
    items: [
      { label: 'All Mocks', to: '/admin/prepmock', icon: ClipboardList, match: (loc) => loc.pathname === '/admin/prepmock' },
      { label: 'Create Mock', to: '/admin/prepmock/create', icon: CalendarPlus },
      { label: 'Results', to: '/admin/prepmock/results', icon: Trophy, match: (loc) => loc.pathname.startsWith('/admin/prepmock/results') },
      { label: 'Feedback', to: '/admin/prepmock/feedback', icon: MessageSquare, match: (loc) => loc.pathname.startsWith('/admin/prepmock/feedback') },
      { label: 'Analysis', to: '/admin/analysis?area=prepmock', icon: BarChart3,
        match: (loc) => loc.pathname === '/admin/analysis' && new URLSearchParams(loc.search).get('area') === 'prepmock' },
      { label: 'Mock Library', to: '/admin/prepmock/library', icon: Library, match: (loc) => loc.pathname.startsWith('/admin/prepmock/library') },
      { label: 'Companies & roles', to: '/admin/prepmock/companies', icon: Building2, match: (loc) => loc.pathname.startsWith('/admin/prepmock/companies') },
    ],
  };
  const coordinator = {
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
  };
  const students = {
    type: 'group',
    key: 'student-management',
    label: 'Students',
    icon: GraduationCap,
    items: [
      { label: 'Student List', to: '/admin/students', icon: Users, match: (currentLocation) => currentLocation.pathname === '/admin/students' },
      { label: 'Add Student', to: '/admin/onboarding', icon: UserPlus },
    ],
  };
  const prepLearning = { type: 'link', label: 'Prep Learning', to: '/admin/learning', icon: BookOpen };
  const prepAssessment = {
    type: 'group',
    key: 'assessment',
    label: 'Prep Assessment',
    icon: ClipboardList,
    items: [
      { label: 'All Assessments', to: '/admin/assessment', icon: ClipboardList },
      { label: 'Create Assessment', to: '/admin/assessment/create', icon: CalendarPlus },
      { label: 'Reports', to: '/admin/assessment/reports', icon: ClipboardList },
      { label: 'Feedback', to: '/admin/assessment-feedback', icon: MessageSquareText },
    ],
  };
  const prepLibrary = {
    type: 'group',
    key: 'library',
    label: 'Prep Library',
    icon: Library,
    items: [
      { label: 'View Library', to: '/admin/library', icon: Library, match: (loc) => loc.pathname === '/admin/library' },
    ],
  };
  const quickPrep = {
    type: 'group',
    key: 'quickprep',
    label: 'QuickPrep',
    icon: Zap,
    items: [
      { label: 'All QuickPreps', to: '/admin/quickprep', icon: ListChecks, match: (loc) => /^\/admin\/quickprep(\/(?!new$|insights$)[^/]+(\/(edit|questions\/add))?)?\/?$/.test(loc.pathname) },
      { label: 'Create QuickPrep', to: '/admin/quickprep/new', icon: CirclePlus },
      // Opens Prep Analysis on its Quick Prep tab.
      { label: 'Analysis', to: QUICKPREP_ANALYSIS_PATH, icon: BarChart3,
        match: (loc) => loc.pathname === '/admin/analysis' && new URLSearchParams(loc.search).get('area') === 'quickprep' },
    ],
  };
  const announcements = {
    type: 'group',
    key: 'announcements',
    label: 'Announcements',
    icon: Megaphone,
    items: [
      { label: 'Add Announcement', to: '/admin/announcements/add', icon: Megaphone },
      { label: 'Manage Announcements', to: '/admin/announcements/manage', icon: Megaphone },
    ],
  };
  const companyInsights = {
    type: 'group',
    key: 'company-insights',
    label: 'Company Insights',
    icon: Building2,
    items: [
      { label: 'Add Benchmark', to: '/admin/company-insights/add', icon: Building2 },
      { label: 'View Benchmarks', to: '/admin/company-insights', icon: Building2 },
    ],
  };
  const settings = {
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
            { label: 'Prep Topic Priority', to: '/admin/settings/prep-topic-priority', icon: Target },
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
  };

  // Admin menu order (set by the product owner, 2026-11-09).
  return [
    overview,
    ...(isControlDeployment ? [university] : []),
    prepLibrary,
    prepAssessment,
    prepAnalysis,
    prepInterview,
    prepMock,
    quickPrep,
    coordinator,
    students,
    prepLearning,
    companyInsights,
    announcements,
    ...(isControlDeployment ? [prepCoins] : []),
    settings,
  ];
};

// One look for every role's rail items (student, admin, coordinator).
// Row height comes from --nav-h (set on the nav) so every item fits on one screen without scrolling.
const NAV_ITEM = 'group relative flex h-[var(--nav-h,2.5rem)] items-center rounded-xl text-[13px] transition-[background-color,color,box-shadow] duration-200';
const NAV_ITEM_ACTIVE = 'font-semibold bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/80 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20';
const NAV_ITEM_OPEN = 'font-medium bg-slate-100 text-slate-900 dark:bg-white/[0.06] dark:text-[color:var(--student-dash-fg,#fff)]';
const NAV_ITEM_IDLE = 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white';
const NAV_ICON = 'absolute left-[10px] flex h-[min(2rem,calc(var(--nav-h,2.5rem)-0.25rem))] w-8 items-center justify-center rounded-lg transition-[background-color,color] duration-200';
const NAV_ICON_ACTIVE = 'bg-sky-600 text-white shadow-[0_4px_10px_-4px_rgba(2,132,199,0.7)]';
const NAV_ICON_IDLE = 'text-slate-500 group-hover:text-sky-700 dark:text-zinc-400 dark:group-hover:text-sky-300';
const FOOTER_ROW_HOVER = 'hover:bg-slate-100 dark:hover:bg-white/[0.06]';

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
  const isMobileNav = useIsMobileNav();
  const guide = usePlatformGuide();
  const profileOpenRef = useRef(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isCoordinator = role === 'coordinator';
  const isStudent = role === 'student';
  const dashboardPaletteClass = isStudent && /^\/student\/dashboard\/?$/i.test(location.pathname) ? 'student-dashboard-theme' : '';
  const storagePrefix = isCoordinator ? 'coordinator' : isStudent ? 'student' : 'admin';
  const isAssessmentCandidate = isStudent && user?.accessScope === 'assessment_only';
  const roleLabel = isCoordinator ? 'Coordinator' : isAssessmentCandidate ? 'Assessment Candidate' : isStudent ? 'Student' : 'Administrator';
  const displayName = user?.name || localStorage.getItem(`${storagePrefix}Name`) || roleLabel;
  const displayEmail = user?.email || localStorage.getItem(`${storagePrefix}Email`) || '';
  const avatarUrl = user?.avatarUrl || localStorage.getItem(`${storagePrefix}AvatarUrl`) || '';
  const homePath = isCoordinator ? '/coordinator/overview' : isAssessmentCandidate ? '/student/assessments'
    : isStudent ? firstStudentFeaturePath(user, (path) => allowsPath(path, 'student')) : '/admin/overview';
  const accountMenuId = `${storagePrefix}-account-menu`;
  const accent = isCoordinator ? 'emerald' : 'sky';
  // The Prep Mates count sits under the student's name in the account block (desktop rail only)
  // and opens the Prep Mates popup.
  const peersEnabled = isStudent && canUsePeers(user);
  const showPeerCounts = peersEnabled && !isMobileNav;
  const { summary: peerSummary } = usePeerSummary(peersEnabled);
  const pendingMateRequests = peerSummary?.incomingRequests || 0;
  const [matesOpen, setMatesOpen] = useState(false);
  const navItems = useMemo(() => {
    const items = buildNavItems(role, user?.accessScope);
    if (role === 'student') {
      return items
        .filter((item) => allowsPath(item.to, 'student')
          && (!item.featureKey || (item.featureKey === 'peers' ? canUsePeers(user) : hasStudentFeature(user, item.featureKey))))
        // Waiting Prep Mate requests show as a red count on the Prep Mates link (desktop and phone).
        .map((item) => (item.featureKey === 'peers' && pendingMateRequests > 0
          ? { ...item, badge: pendingMateRequests, badgeLabel: `${pendingMateRequests} Prep Mate ${pendingMateRequests === 1 ? 'request' : 'requests'} waiting` }
          : item));
    }
    if (role !== 'student' && (isUniversityDeployment || role !== 'admin')) items.unshift({ type: 'link', label: 'Prep Coin management', to: `/${role}/wallet`, icon: Wallet });
    if (role !== 'coordinator') {
      const universityItems = isUniversityDeployment ? items.map((item) => {
        if (item.key === 'prepmock') return isUniversitySpoc(user) ? { ...item, items: [
          ...item.items.filter((child) => ['All Mocks', 'Analysis'].includes(child.label)),
          { label: 'Upload Students', to: '/admin/prepmock/upload-students', icon: UserPlus },
        ] } : isLimitedUniversityAdmin(user) ? { ...item, items: item.items.filter((child) => child.label === 'All Mocks') } : null;
        return item;
      }).filter(Boolean) : items;
      const limitedItems = isLimitedUniversityAdmin(user) ? universityItems.map((item) => {
        if (item.key === 'student-management') return { ...item, items: item.items.filter((child) => child.to !== '/admin/onboarding') };
        if (item.key === 'coordinator-management') return { ...item, items: item.items.filter((child) => child.to !== '/admin/coordinators') };
        if (item.key === 'settings') return { ...item, items: item.items.filter((child) => child.label !== 'Students') };
        return item;
      }) : universityItems;
      return applyPlatformPermissions(limitedItems, allowsPath, role);
    }
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
  }, [role, user, allowsPath, pendingMateRequests]);
  const [openGroup, setOpenGroup] = useState(null);
  const [openNestedGroup, setOpenNestedGroup] = useState(null);
  const [groupPanelTop, setGroupPanelTop] = useState(88);
  const groupButtonRefs = useRef(new Map());
  const groupPanelRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const resolvedSidebarWidth = isStudent
    ? (isExpanded ? STUDENT_SIDEBAR_PANEL_WIDTH : STUDENT_SIDEBAR_RAIL_WIDTH)
    : getSidebarWidth(isExpanded);

  // Every role: a short hover intent before opening (passing the cursor over the rail does not flash
  // it open). Hover expands over the page; pinning keeps it open.
  const handleSidebarEnter = () => {
    window.clearTimeout(hoverTimerRef.current);
    if (isPinned) { onExpand(); return; }
    hoverTimerRef.current = window.setTimeout(onExpand, 90);
  };

  // Leaving before the hover intent fires cancels the opening. Closing is handled below.
  const handleSidebarLeave = () => {
    if (!isExpanded) window.clearTimeout(hoverTimerRef.current);
  };

  useEffect(() => () => window.clearTimeout(hoverTimerRef.current), []);

  // Hover-out. The sidebar's own mouseleave is not enough: its menus are portals, and a menu that
  // closes under the cursor (after a click or a page change) fires no leave event, which left the
  // sidebar stuck open. So while it is hover-open we watch where the pointer really is: outside the
  // sidebar and its menus for a moment -> close any open menu and collapse.
  const asideRef = useRef(null);
  const accountMenuRef = useRef(null);
  const leaveTimerRef = useRef(null);
  const lastPointRef = useRef(null);
  const menusOpen = Boolean(openGroup) || isProfileOpen;
  const hoverOpen = isExpanded && !isPinned && !isMobileNav;
  const insideSidebar = (node) => Boolean(node && node.nodeType === 1 && (
    asideRef.current?.contains(node) || groupPanelRef.current?.contains(node) || accountMenuRef.current?.contains(node)
  ));
  const insideRef = useRef(insideSidebar);
  insideRef.current = insideSidebar;
  const collapseRef = useRef(() => {});
  collapseRef.current = () => {
    setOpenGroup(null);
    setOpenNestedGroup(null);
    updateProfileOpen(false);
    onCollapse();
  };

  useEffect(() => {
    if (!hoverOpen) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
      // Forget the old pointer position: it must never close the sidebar the next time it opens.
      lastPointRef.current = null;
      return undefined;
    }
    // A menu gets a longer grace, so the pointer can cross the small gap between rail and menu.
    const grace = menusOpen ? 320 : 180;
    const cancel = () => { window.clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; };
    const schedule = () => {
      if (leaveTimerRef.current) return;
      leaveTimerRef.current = window.setTimeout(() => { leaveTimerRef.current = null; collapseRef.current(); }, grace);
    };
    const onOver = (event) => { if (insideRef.current(event.target)) cancel(); else schedule(); };
    const onOut = (event) => { if (!insideRef.current(event.relatedTarget)) schedule(); };
    const onMove = (event) => { lastPointRef.current = { x: event.clientX, y: event.clientY }; };
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('mousemove', onMove, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('mousemove', onMove, true);
      cancel();
    };
  }, [hoverOpen, menusOpen]);

  // When a menu closes (link clicked, page changed, outside click), re-check the pointer: if it is
  // already outside, collapse now instead of waiting for the next mouse move.
  // Only on a real change (a menu that was open just closed, or the page changed) — never on the
  // sidebar opening, which would re-read a stale pointer position and close it straight away.
  const hoverNavKey = `${location.pathname}${location.search}`;
  const lastCheckRef = useRef({ menusOpen, hoverNavKey });
  useEffect(() => {
    const previous = lastCheckRef.current;
    lastCheckRef.current = { menusOpen, hoverNavKey };
    const menuJustClosed = previous.menusOpen && !menusOpen;
    const pageChanged = previous.hoverNavKey !== hoverNavKey;
    if (!hoverOpen || menusOpen || (!menuJustClosed && !pageChanged)) return;
    const point = lastPointRef.current;
    if (!point || typeof document.elementFromPoint !== 'function') return;
    const under = document.elementFromPoint(point.x, point.y);
    if (under && !insideRef.current(under)) collapseRef.current();
  }, [hoverOpen, menusOpen, hoverNavKey]);

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

  // Phones and tablets: top bar + slide-in menu with the same items (desktop keeps the rail below).
  if (isMobileNav) {
    return (
      <MobileNavigation
        navItems={navItems}
        isRouteActive={isRouteActive}
        homePath={homePath}
        logo={isStudent ? '/images/peerprep-wordmark.png' : '/images/logo.png'}
        roleLabel={roleLabel}
        displayName={displayName}
        displayEmail={displayEmail}
        avatarUrl={avatarUrl}
        initials={initials || (isCoordinator ? 'CO' : isStudent ? 'ST' : 'AD')}
        accent={accent}
        accountLinks={[
          ...((isCoordinator || (isStudent && !isAssessmentCandidate)) ? [{ label: 'My profile', to: isStudent ? '/student/profile' : '/coordinator/profile', Icon: User }] : []),
          ...(!isStudent ? [{ label: 'Activity log', to: isCoordinator ? '/coordinator/activity' : '/admin/activity', Icon: Activity }] : []),
          { label: 'Change password', to: isCoordinator ? '/coordinator/change-password' : isStudent ? '/student/change-password' : '/admin/change-password', Icon: Lock },
        ]}
        theme={theme}
        toggleTheme={toggleTheme}
        onLogout={handleLogout}
        onOpenGuides={guide?.ready && guide.modules.length ? guide.openCenter : null}
      />
    );
  }

  return (
    <aside
      ref={asideRef}
      onMouseEnter={handleSidebarEnter}
      onMouseLeave={handleSidebarLeave}
      // Solid colours and one 300ms width animation on a fixed element: no backdrop blur (Safari
      // repaints the blur on every frame while the width changes) and no page relayout on hover.
      // Same surface as the page header, so header, menu and footer read as one.
      // Only the width animates (no animated blur shadow, which repaints every frame); `contain`
      // keeps each frame's layout inside the sidebar.
      className="fixed left-0 top-0 z-[70] h-screen overflow-visible bg-[var(--shell-frame)] transition-[width] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      style={{ width: resolvedSidebarWidth, contain: 'layout style' }}
    >
      {/* Soft edge while it floats over the page: a gradient that only fades (composited). */}
      <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 right-0 w-8 translate-x-full bg-gradient-to-r from-slate-900/[0.07] to-transparent transition-opacity duration-300 dark:from-black/40 ${isExpanded && !isPinned ? 'opacity-100' : 'opacity-0'}`} />
      <div className="flex h-full min-h-0 flex-col">
        {/* Header: 64px, the same height as the page header beside it; no dividing lines (the
            frame is one surface, see ShellCorners). */}
        <div className="relative flex h-16 shrink-0 items-center px-2">
          <Link to={homePath} title="PeerPrep home" className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            {/* The mark stays put over the rail's icon column; the name appears beside it. The name is
                text (not the wordmark image) so it stays readable in the dark theme. */}
            <img src="/images/peerprep-mark.png" alt="" className="absolute top-1/2 h-9 w-9 -translate-y-1/2 object-contain" style={{ left: `calc((${isStudent ? STUDENT_SIDEBAR_RAIL_WIDTH : getSidebarWidth(false)} - 1rem - 2.25rem) / 2)` }} />
            <span className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[19px] font-bold tracking-[-0.02em] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} style={{ left: `calc((${isStudent ? STUDENT_SIDEBAR_RAIL_WIDTH : getSidebarWidth(false)} - 1rem - 2.25rem) / 2 + 2.75rem)` }}>
              <span className="text-sky-600 dark:text-sky-400">Peer</span><span className="text-slate-800 dark:text-[color:var(--student-dash-fg,#fff)]">Prep</span>
            </span>
            <span className="sr-only">PeerPrep home</span>
          </Link>
          {/* One pin control for every role; shown when the sidebar is open. */}
          <button
            type="button"
            onClick={onTogglePin}
            tabIndex={isExpanded ? 0 : -1}
            className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-sky-300 ${isExpanded ? 'relative opacity-100' : 'pointer-events-none absolute right-2 opacity-0'}`}
            aria-label={isStudent ? (isPinned ? 'Collapse navigation' : 'Keep navigation open') : (isPinned ? 'Unpin sidebar (it opens on hover)' : 'Keep sidebar open')}
            title={isPinned ? 'Unpin: open on hover' : 'Keep open'}
            aria-pressed={isPinned}
          >
            {isPinned ? <PanelLeftClose className="h-[17px] w-[17px]" /> : <PanelLeftOpen className="h-[17px] w-[17px]" />}
          </button>
        </div>

        {/* Rows share the screen height: up to 40px each, down to 30px on short screens, so the whole
            menu fits without scrolling (it can still scroll on very short windows). 12.5rem is the
            header (4rem) + footer + padding. */}
        <nav data-guide="app-nav" className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={`${roleLabel} navigation`}
          style={{ '--nav-count': Math.max(1, navItems.length), '--nav-h': `clamp(1.875rem, calc((100dvh - ${showPeerCounts ? 13.75 : 11.25}rem) / var(--nav-count) - 2px), 2.5rem)` }}>
        {navItems.map((item) => {
          if (item.type === 'link') {
            const Icon = item.icon;
            const active = isRouteActive(item);
            return (
              <NavLink
                key={item.label}
                to={item.to}
                title={item.label}
                className={`${NAV_ITEM} ${active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE}`}
              >
                <span className={`${NAV_ICON} ${active ? NAV_ICON_ACTIVE : NAV_ICON_IDLE}`}>
                  <Icon className="h-[18px] w-[18px]" />
                  {item.badge > 0 && !isExpanded && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[color:var(--shell-frame)]" aria-hidden="true" />
                  )}
                </span>
                <span className={`ml-12 min-w-0 flex-1 whitespace-nowrap pr-2 text-left leading-tight transition-[opacity,transform] duration-200 ${isExpanded ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-1 opacity-0'}`}>
                  {item.label}
                </span>
                {item.badge > 0 && (
                  <span className={`mr-2.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white transition-opacity ${isExpanded ? 'opacity-100' : 'sr-only'}`}
                    title={item.badgeLabel}>
                    <span aria-hidden="true">{item.badge > 99 ? '99+' : item.badge}</span>
                    <span className="sr-only">{item.badgeLabel}</span>
                  </span>
                )}
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
                className={`${NAV_ITEM} w-full ${groupActive ? NAV_ITEM_ACTIVE : isOpen ? NAV_ITEM_OPEN : NAV_ITEM_IDLE}`}
              >
                <span className={`${NAV_ICON} ${groupActive ? NAV_ICON_ACTIVE : NAV_ICON_IDLE}`}>
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
                  className={`${dashboardPaletteClass} fixed z-[9998] flex w-[15rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18),0_2px_6px_rgba(15,23,42,0.05)] dark:border-[color:var(--student-dash-border,#363636)] dark:bg-[color:var(--student-dash-card,#1a1a1a)] dark:shadow-black/40`}
                  style={{
                    left: `calc(${resolvedSidebarWidth} + 0.5rem)`,
                    top: `${groupPanelTop}px`,
                    maxWidth: `calc(100vw - ${resolvedSidebarWidth} - 1rem)`,
                    maxHeight: `calc(100vh - ${groupPanelTop + 12}px)`,
                  }}
                >
                  <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 py-2 pl-3.5 pr-1.5 dark:border-[color:var(--student-dash-border,#242424)]">
                    <h2 className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-[color:var(--student-dash-muted,#94a3b8)]">{item.label}</h2>
                    <button
                      type="button"
                      onClick={() => { setOpenGroup(null); setOpenNestedGroup(null); }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[color:var(--student-dash-hover,#242424)] dark:hover:text-white"
                      aria-label={`Close ${item.label} navigation`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </header>

                  <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5 [scrollbar-width:thin]">
                  {item.items.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = isRouteActive(child);
                    const rowTone = childActive
                      ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950 dark:text-[color:var(--student-dash-fg,#e2e8f0)] dark:hover:bg-[color:var(--student-dash-hover,#242424)] dark:hover:text-white';
                    const iconTone = childActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 group-hover/flyout:text-slate-600 dark:text-slate-500 dark:group-hover/flyout:text-slate-300';
                    if (child.children?.length) {
                      const nestedKey = `${item.key}:${child.label}`;
                      const nestedOpen = openNestedGroup === nestedKey;
                      const nestedPanelId = `${groupPanelId}-${child.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                      return (
                        <div key={child.label}>
                          {child.folder ? (
                            <button
                              type="button"
                              aria-label={child.label}
                              aria-expanded={nestedOpen}
                              aria-controls={nestedPanelId}
                              data-platform-disclosure="navigation"
                              title={child.description || undefined}
                              onClick={() => setOpenNestedGroup(nestedOpen ? null : nestedKey)}
                              className={`group/flyout relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors ${rowTone}`}
                            >
                              <ChildIcon className={`h-4 w-4 shrink-0 ${iconTone}`} strokeWidth={1.8} />
                              <span className="min-w-0 flex-1 truncate">{child.label}</span>
                              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${nestedOpen ? 'rotate-180' : ''}`} />
                            </button>
                          ) : (
                            <div className={`group/flyout relative flex h-9 items-center rounded-lg transition-colors ${rowTone}`}>
                              {childActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-600 dark:bg-sky-400" aria-hidden="true" />}
                              <NavLink
                                to={child.to}
                                aria-label={child.label}
                                title={child.description || undefined}
                                data-submenu-trigger="true"
                                onClick={(event) => {
                                  event.preventDefault();
                                  setOpenNestedGroup(nestedOpen ? null : nestedKey);
                                }}
                                className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2.5 text-[13px] font-medium"
                              >
                                <ChildIcon className={`h-4 w-4 shrink-0 ${iconTone}`} strokeWidth={1.8} />
                                <span className="min-w-0 flex-1 truncate">{child.label}</span>
                              </NavLink>
                              <button
                                type="button"
                                aria-label={`${nestedOpen ? 'Collapse' : 'Expand'} ${child.label}`}
                                aria-expanded={nestedOpen}
                                aria-controls={nestedPanelId}
                                data-platform-disclosure="navigation"
                                onClick={() => setOpenNestedGroup(nestedOpen ? null : nestedKey)}
                                className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-sky-700 dark:hover:bg-[color:var(--student-dash-hover,#363636)] dark:hover:text-sky-300"
                              >
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${nestedOpen ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          )}
                          <div id={nestedPanelId} inert={!nestedOpen} className={`overflow-hidden transition-[max-height,opacity] duration-200 ${nestedOpen ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="mb-1 ml-[1.15rem] mt-0.5 space-y-0.5 border-l border-slate-200 pl-2 dark:border-[color:var(--student-dash-border,#363636)]">
                              {child.children.map((nestedChild) => {
                                const nestedActive = isRouteActive(nestedChild);
                                return (
                                  <Link key={nestedChild.label} to={nestedChild.to} aria-label={nestedChild.label} aria-current={nestedActive ? 'page' : undefined} className={`flex h-8 items-center rounded-md px-2.5 text-[12.5px] transition-colors ${nestedActive ? 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-[color:var(--student-dash-muted,#94a3b8)] dark:hover:bg-[color:var(--student-dash-hover,#242424)] dark:hover:text-white'}`}>
                                    <span className="min-w-0 truncate">{nestedChild.label}</span>
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
                        title={child.description || undefined}
                        className={`group/flyout relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${rowTone}`}
                      >
                        {childActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-600 dark:bg-sky-400" aria-hidden="true" />}
                        <ChildIcon className={`h-4 w-4 shrink-0 ${iconTone}`} strokeWidth={1.8} />
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                      </NavLink>
                    );
                  })}
                  </div>
                </section>,
                document.body,
              )}
            </div>
          );
        })}
        </nav>

        {/* Footer: same padding and row style as the menu; no dividing line. */}
        <div className="relative shrink-0 space-y-1 px-2 pb-2 pt-1">
          {isProfileOpen && createPortal(
            <div
              ref={accountMenuRef}
              id={accountMenuId}
              className={`${dashboardPaletteClass} pointer-events-auto fixed bottom-3 z-[9999] w-[18rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.18)] transition-[left] ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-[color:var(--student-dash-border,#363636)] dark:bg-[color:var(--student-dash-card,#1a1a1a)] dark:shadow-black/50 duration-300`}
              style={{ left: `calc(${resolvedSidebarWidth} + 0.75rem)` }}
              role="dialog"
              aria-label="Account menu"
            >
              <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-4 dark:border-[color:var(--student-dash-border,#242424)] dark:from-[color:var(--student-dash-card,#242424)] dark:to-[color:var(--student-dash-card,#1a1a1a)]">
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-11 w-11 rounded-xl object-cover ring-2 ring-white dark:ring-gray-700" />
                  ) : (
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${accent === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                      {initials || (isCoordinator ? 'CO' : isStudent ? 'ST' : 'AD')}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-[color:var(--student-dash-fg,#fff)]">{displayName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-[color:var(--student-dash-muted,#9ca3af)]">{displayEmail || `${roleLabel} account`}</p>
                  </div>
                  <button type="button" onClick={() => updateProfileOpen(false)} className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[color:var(--student-dash-hover,#363636)] dark:hover:text-gray-100" aria-label="Close account menu">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-2">
                {(isCoordinator || (isStudent && !isAssessmentCandidate)) && (
                  <button type="button" onClick={() => navigate(isStudent ? '/student/profile' : '/coordinator/profile')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-[color:var(--student-dash-fg,#e5e7eb)] dark:hover:bg-[color:var(--student-dash-hover,#242424)]">
                    <User className="h-4 w-4 text-slate-400" />
                    My profile
                  </button>
                )}
                {!isStudent && <button type="button" onClick={() => navigate(isCoordinator ? '/coordinator/activity' : '/admin/activity')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-[color:var(--student-dash-fg,#e5e7eb)] dark:hover:bg-[color:var(--student-dash-hover,#242424)]">
                  <Activity className="h-4 w-4 text-slate-400" />
                  Activity log
                </button>}
                <button type="button" onClick={() => navigate(isCoordinator ? '/coordinator/change-password' : isStudent ? '/student/change-password' : '/admin/change-password')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-[color:var(--student-dash-fg,#e5e7eb)] dark:hover:bg-[color:var(--student-dash-hover,#242424)]">
                  <Lock className="h-4 w-4 text-slate-400" />
                  Change password
                </button>

                <div className="my-2 border-t border-slate-100 dark:border-[color:var(--student-dash-border,#242424)]" />
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    updateProfileOpen(true);
                  }}
                  className="relative z-10 flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-[color:var(--student-dash-fg,#e5e7eb)] dark:hover:bg-[color:var(--student-dash-hover,#242424)]"
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

          <SidebarGuidesButton isExpanded={isExpanded} />
          <button
            type="button"
            data-guide="app-account"
            onClick={() => {
              if (!isExpanded) onExpand();
              updateProfileOpen((open) => !open);
            }}
            className={`relative flex h-11 w-full items-center overflow-hidden rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${isProfileOpen ? 'bg-sky-50 ring-1 ring-inset ring-sky-200/80 dark:bg-sky-500/10 dark:ring-sky-400/20' : FOOTER_ROW_HOVER}`}
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
              <span className="block text-[11px] font-medium text-slate-500 dark:text-[color:var(--student-dash-muted,#9ca3af)]">{roleLabel}</span>
            </span>
            {isExpanded && <ChevronUp className={`absolute right-3 h-4 w-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />}
          </button>
          {showPeerCounts && isExpanded && (
            <button
              type="button"
              onClick={() => setMatesOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-left transition hover:border-sky-300 hover:bg-sky-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-sky-950 dark:bg-sky-950/30 dark:hover:border-sky-800 dark:hover:bg-sky-950/60"
              aria-label={`${peerSummary?.prepMates ?? 0} ${PEER_TERMS.prepMates}${pendingMateRequests ? `, ${pendingMateRequests} ${pendingMateRequests === 1 ? 'request' : 'requests'} waiting` : ''}. Show list`}
            >
              <Handshake className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700 dark:text-[color:var(--student-dash-fg,#e5e7eb)]">
                <span className="tabular-nums text-slate-900 dark:text-[color:var(--student-dash-fg,#fff)]">{peerSummary ? compactCount(peerSummary.prepMates) : '–'}</span> {PEER_TERMS.prepMates}
              </span>
              {pendingMateRequests > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500 py-0.5 pl-1.5 pr-2 text-[10.5px] font-bold text-white shadow-[0_2px_8px_-2px_rgba(244,63,94,0.7)]" title="Prep Mate requests waiting">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80 motion-reduce:hidden" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  {pendingMateRequests} new
                </span>
              )}
            </button>
          )}
          {showPeerCounts && (
            <Suspense fallback={null}>
              <PrepMatesModal open={matesOpen} onClose={() => setMatesOpen(false)} owner={{ id: String(user?._id || ''), name: user?.name }}
                count={peerSummary?.prepMates} requests={pendingMateRequests} isSelf />
            </Suspense>
          )}
        </div>
      </div>
    </aside>
  );
}
