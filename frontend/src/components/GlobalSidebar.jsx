import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarPlus,
  CalendarClock,
  CalendarDays,
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
  ChevronDown,
  Settings,
  Mail,
  Megaphone,
  Building2,
  UserCog,
  ShieldCheck,
  ListChecks,
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { hasPermission } from '../admin/coordinatorPermissions';

const buildNavItems = (role = 'admin') => {
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
          { label: 'Create Interview', to: '/coordinator/event/create', icon: CalendarPlus, permissionKey: 'coordinator.interviews.create' },
          { label: 'Scheduled Interviews', to: '/coordinator', icon: CalendarClock, permissionKey: 'coordinator.interviews.view' },
        ],
      },
      { type: 'link', label: 'My Students', to: '/coordinator/students', icon: Users, permissionKey: 'coordinator.students.view' },
      { type: 'link', label: 'Bulk Student Lists', to: '/coordinator/students/bulk-lists', icon: ListChecks, permissionKey: 'coordinator.students.bulk-lists' },
      { type: 'link', label: 'Learning Modules', to: '/coordinator/subjects', icon: BookOpen, permissionKey: 'coordinator.learning.manage' },
      { type: 'link', label: 'Registered Courses', to: '/coordinator/database', icon: Building2, permissionKey: 'coordinator.courses.view' },
      { type: 'link', label: 'Feedback', to: '/coordinator/feedback', icon: MessageSquare, permissionKey: 'coordinator.feedback.view' },
      {
        type: 'group',
        key: 'assessment',
        label: 'Assessments',
        icon: ClipboardList,
        items: [
          { label: 'All Assessments', to: '/coordinator/assessment', icon: ClipboardList, permissionKey: 'coordinator.assessment.view' },
          { label: 'Create Assessment', to: '/coordinator/assessment/create', icon: CalendarPlus, permissionKey: 'coordinator.assessment.create' },
          { label: 'Reports', to: '/coordinator/assessment/reports', icon: ClipboardList, permissionKey: 'coordinator.assessment.reports' },
        ],
      },
      {
        type: 'group',
        key: 'library',
        label: 'Library',
        icon: Library,
        items: [
          { label: 'View Library', to: '/coordinator/library', icon: Library, permissionKey: 'coordinator.library.view', match: (loc) => loc.pathname === '/coordinator/library' },
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
          { label: 'Promote Students', to: '/coordinator/settings/promote-students', icon: GraduationCap, permissionKey: 'coordinator.students.promote' },
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
    {
      type: 'group',
      key: 'interviews',
      label: 'Interviews',
      icon: CalendarDays,
      items: [
        { label: 'Create Interview', to: '/admin/event', icon: CalendarPlus },
        { label: 'Scheduled Interviews', to: '/admin/interviews/scheduled', icon: CalendarClock },
        { label: 'Past Interview Details', to: '/admin/interviews/past', icon: History },
        { label: 'Feedback', to: '/admin/feedback', icon: MessageSquare },
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
        { label: 'View Bulk Lists', to: '/admin/students/bulk-lists', icon: ListChecks },
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
        { label: 'Coding Analytics', to: '/admin/library/coding/analytics', icon: BarChart3 },
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
      items: [
        { label: 'Master Data', to: '/admin/settings/master-data', icon: Database },
        { label: 'Email Templates', to: '/admin/settings/email-templates', icon: Mail },
        { label: 'Email Queue', to: '/admin/email-queue', icon: Mail },
        { label: 'Promote Students', to: '/admin/settings/promote-students', icon: GraduationCap },
      ],
    },
  ];
};

export default function GlobalSidebar({ role = 'admin', isExpanded = false, onExpand = () => {}, onCollapse = () => {} }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const profileRef = useRef(null);
  const profileMenuRef = useRef(null);
  const profileOpenRef = useRef(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isCoordinator = role === 'coordinator';
  const storagePrefix = isCoordinator ? 'coordinator' : 'admin';
  const displayName = user?.name || localStorage.getItem(`${storagePrefix}Name`) || (isCoordinator ? 'Coordinator' : 'Admin');
  const displayEmail = user?.email || localStorage.getItem(`${storagePrefix}Email`) || '';
  const avatarUrl = user?.avatarUrl || localStorage.getItem(`${storagePrefix}AvatarUrl`) || '';
  const homePath = isCoordinator ? '/coordinator/overview' : '/admin/overview';
  const accent = isCoordinator ? 'emerald' : 'sky';
  const navItems = useMemo(() => {
    const items = buildNavItems(role);
    if (role !== 'coordinator') return items;
    return items
      .map((item) => {
        if (item.type === 'group') {
          const children = item.items.filter((child) => hasPermission(user, child.permissionKey));
          return children.length ? { ...item, items: children } : null;
        }
        return hasPermission(user, item.permissionKey) ? item : null;
      })
      .filter(Boolean);
  }, [role, user]);
  const [openGroup, setOpenGroup] = useState(null);

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

  useEffect(() => {
    updateProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const clickedProfile = profileRef.current?.contains(event.target) || eventPath.includes(profileRef.current);
      const clickedMenu = profileMenuRef.current?.contains(event.target) || eventPath.includes(profileMenuRef.current);
      if (profileOpenRef.current && !clickedProfile && !clickedMenu) {
        updateProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!isExpanded) {
      setOpenGroup(null);
    }
  }, [isExpanded]);

  const isRouteActive = (item) => {
    if (item.match) return item.match(location);
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  };

  const isGroupActive = (group) => group.items.some((child) => isRouteActive(child));

  const handleGroupToggle = (key) => {
    if (!isExpanded) onExpand();
    setOpenGroup((prev) => (prev === key ? null : key));
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      updateProfileOpen(false);
      ['token', 'isAdmin', 'adminName', 'adminEmail', 'adminAvatarUrl', 'coordinatorName', 'coordinatorEmail', 'coordinatorAvatarUrl']
        .forEach((key) => localStorage.removeItem(key));
      window.location.assign('/');
    }
  };

  return (
    <aside
      onMouseEnter={onExpand}
      onMouseLeave={() => {
        if (!profileOpenRef.current) onCollapse();
      }}
      className="fixed left-0 top-0 z-40 h-screen overflow-visible border-r border-sky-100 bg-sky-50/90 shadow-[4px_0_28px_rgba(14,165,233,0.08)] backdrop-blur-xl transition-[width] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-sky-950 dark:bg-slate-950/95 dark:shadow-black/20"
      style={{ width: 'var(--admin-sidebar-width)' }}
    >
      <button
        type="button"
        onClick={isExpanded ? onCollapse : onExpand}
        className="absolute -right-3 top-[68px] z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-sky-300 hover:text-sky-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-sky-700 dark:hover:text-sky-400"
        aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isExpanded ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
      </button>
      <div className="flex h-full min-h-0 flex-col">
        <Link
          to={homePath}
          title="PeerPrep home"
          className="mx-2 flex h-[76px] shrink-0 items-center overflow-hidden border-b border-sky-100 dark:border-sky-950"
        >
          <div className="relative h-14 w-full shrink-0 overflow-hidden">
            <img
              src="/images/logo.png"
              alt="PeerPrep"
              className={`absolute top-1/2 h-auto w-[187px] max-w-none -translate-y-1/2 transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? '-left-1' : '-left-5'}`}
            />
          </div>
        </Link>

        <nav className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-1.5 py-3 [scrollbar-width:thin]" aria-label={`${isCoordinator ? 'Coordinator' : 'Admin'} navigation`}>
        {navItems.map((item) => {
          if (item.type === 'link') {
            const Icon = item.icon;
            const active = isRouteActive(item);
            return (
              <NavLink
                key={item.label}
                to={item.to}
                title={item.label}
                className={`relative flex min-h-11 items-center rounded-xl py-1.5 text-[13px] font-semibold transition-colors ${
                  active
                    ? 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-900/30 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <span className={`absolute left-[10px] flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className={`ml-[52px] whitespace-nowrap leading-tight ${isExpanded ? 'visible' : 'pointer-events-none invisible'}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          }

          const GroupIcon = item.icon;
          const isOpen = openGroup === item.key;
          const groupActive = isGroupActive(item);

          return (
            <div key={item.key} className="space-y-0.5">
              <button
                type="button"
                onClick={() => handleGroupToggle(item.key)}
                title={item.label}
                className={`relative flex min-h-11 w-full items-center rounded-xl py-1.5 text-[13px] font-semibold transition-colors ${
                  groupActive
                    ? 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-900/30 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <span className={`absolute left-[10px] flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  groupActive
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  <GroupIcon className="h-[18px] w-[18px]" />
                </span>
                <span className={`ml-[52px] flex-1 whitespace-nowrap text-left leading-tight ${isExpanded ? 'visible' : 'pointer-events-none invisible'}`}>
                  {item.label}
                </span>
                {isExpanded && (
                  <ChevronDown className={`absolute right-3 h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              <div
                className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
                  isOpen && isExpanded ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-0.5 pl-12 pr-2 pb-1">
                  {item.items.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = isRouteActive(child);
                    return (
                      <NavLink
                        key={child.label}
                        to={child.to}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors ${
                          childActive
                            ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                        }`}
                      >
                        <ChildIcon className="h-3.5 w-3.5" />
                        <span className="truncate">{child.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
        </nav>

        <div ref={profileRef} className="relative shrink-0 border-t border-sky-100 py-2 dark:border-sky-950">
          {isProfileOpen && (
            <div
              ref={profileMenuRef}
              className="pointer-events-auto fixed bottom-3 z-[200] w-[18rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.18)] transition-[left] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/50"
              style={{ left: 'calc(var(--admin-sidebar-width) + 0.75rem)' }}
            >
              <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-4 dark:border-gray-800 dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-11 w-11 rounded-xl object-cover ring-2 ring-white dark:ring-gray-700" />
                  ) : (
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${accent === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                      {initials || (isCoordinator ? 'CO' : 'AD')}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{displayName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-gray-400">{displayEmail || (isCoordinator ? 'Coordinator account' : 'Administrator account')}</p>
                  </div>
                </div>
              </div>

              <div className="p-2">
                {isCoordinator && (
                  <Link to="/coordinator/profile" onClick={() => updateProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                    <User className="h-4 w-4 text-slate-400" />
                    My profile
                  </Link>
                )}
                <Link to={isCoordinator ? '/coordinator/activity' : '/admin/activity'} onClick={() => updateProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <Activity className="h-4 w-4 text-slate-400" />
                  Activity log
                </Link>
                <Link to={isCoordinator ? '/coordinator/change-password' : '/admin/change-password'} onClick={() => updateProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <Lock className="h-4 w-4 text-slate-400" />
                  Change password
                </Link>

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
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (!isExpanded) onExpand();
              updateProfileOpen((open) => !open);
            }}
            className={`relative flex h-14 w-full items-center overflow-hidden rounded-xl text-left transition ${isProfileOpen ? 'bg-white/80 dark:bg-gray-800' : 'hover:bg-white/70 dark:hover:bg-gray-800/80'}`}
            aria-expanded={isProfileOpen}
            aria-label="Open account menu"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="absolute left-3 h-10 w-10 rounded-xl object-cover" />
            ) : (
              <span className={`absolute left-3 flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold ${accent === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                {initials || (isCoordinator ? 'CO' : 'AD')}
              </span>
            )}
            <span className={`ml-16 min-w-0 flex-1 ${isExpanded ? 'visible' : 'pointer-events-none invisible'}`}>
              <span className="block truncate text-sm font-bold text-slate-800 dark:text-gray-100">{displayName}</span>
              <span className="block text-[11px] font-medium text-slate-500 dark:text-gray-400">{isCoordinator ? 'Coordinator' : 'Administrator'}</span>
            </span>
            {isExpanded && <ChevronUp className={`absolute right-3 h-4 w-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
