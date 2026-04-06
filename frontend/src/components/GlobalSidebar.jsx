import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  ClipboardList,
  TerminalSquare,
  ChevronDown,
  Settings,
  Mail,
  ShieldCheck,
} from 'lucide-react';

const buildNavItems = () => ([
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
    ],
  },
  {
    type: 'group',
    key: 'add-users',
    label: 'Add Users',
    icon: UserPlus,
    items: [
      { label: 'Add Students', to: '/admin/onboarding', icon: UserPlus },
      { label: 'Add Coordinators', to: '/admin/coordinators', icon: GraduationCap },
    ],
  },
  {
    type: 'group',
    key: 'users',
    label: 'Users',
    icon: Users,
    items: [
      { label: 'Students List', to: '/admin/students', icon: Users },
      { label: 'Coordinators List', to: '/admin/coordinator-directory', icon: Users },
    ],
  },
  {
    type: 'link',
    label: 'Learning Modules',
    to: '/admin/learning',
    icon: BookOpen,
  },
  {
    type: 'link',
    label: 'Feedback',
    to: '/admin/feedback',
    icon: MessageSquare,
  },
  {
    type: 'group',
    key: 'assessment',
    label: 'Assessment',
    icon: ClipboardList,
    items: [
      { label: 'Overview', to: '/admin/assessment', icon: ClipboardList },
      { label: 'Add Assessment', to: '/admin/assessment/create', icon: ClipboardList },
      { label: 'Reports', to: '/admin/assessment/reports', icon: ClipboardList },
      { label: 'Rules', to: '/admin/assessment/rules', icon: ShieldCheck },
    ],
  },
  {
    type: 'link',
    label: 'Compiler',
    to: '/admin/compiler',
    icon: TerminalSquare,
  },
  {
    type: 'group',
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    items: [
      { label: 'Email Templates', to: '/admin/settings/email-templates', icon: Mail },
    ],
  },
]);

export default function GlobalSidebar({ isExpanded = false, onExpand = () => {}, onCollapse = () => {} }) {
  const location = useLocation();
  const navItems = useMemo(() => buildNavItems(), []);
  const [openGroup, setOpenGroup] = useState(null);

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
    setOpenGroup((prev) => (prev === key ? null : key));
  };

  return (
    <aside
      onMouseEnter={onExpand}
      onMouseLeave={onCollapse}
      className="fixed left-0 top-20 z-40 h-[calc(100vh-5rem)] overflow-hidden border-r border-slate-200 bg-white/95 shadow-sm backdrop-blur transition-[width] duration-300 dark:border-gray-700 dark:bg-gray-900/95"
      style={{ width: 'var(--admin-sidebar-width)' }}
    >
      <div className="flex h-full flex-col gap-2 overflow-y-auto px-2 py-3">
        {navItems.map((item) => {
          if (item.type === 'link') {
            const Icon = item.icon;
            const active = isRouteActive(item);
            return (
              <NavLink
                key={item.label}
                to={item.to}
                title={item.label}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-900/30 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={`whitespace-nowrap transition-all duration-300 ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          }

          const GroupIcon = item.icon;
          const isOpen = openGroup === item.key;
          const groupActive = isGroupActive(item);

          return (
            <div key={item.key} className="space-y-1">
              <button
                type="button"
                onClick={() => handleGroupToggle(item.key)}
                title={item.label}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                  groupActive
                    ? 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-900/30 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  groupActive
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  <GroupIcon className="h-4 w-4" />
                </span>
                <span className={`flex-1 whitespace-nowrap text-left transition-all duration-300 ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
                  {item.label}
                </span>
                {isExpanded && (
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ${isOpen && isExpanded ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="space-y-1 pl-11 pr-2 pb-1">
                  {item.items.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = isRouteActive(child);
                    return (
                      <NavLink
                        key={child.label}
                        to={child.to}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-colors ${
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
      </div>
    </aside>
  );
}
