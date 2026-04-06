import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, ClipboardList, GraduationCap, MessageSquare, Users, UserPlus, LayoutDashboard, Code2, BookOpen } from 'lucide-react';

export default function AdminSidebar() {
  const location = useLocation();

  const items = useMemo(() => ([
    { label: 'Overview', to: '/admin', Icon: LayoutDashboard },
    { label: 'Create Interview', to: '/admin/event', Icon: CalendarDays },
    { label: 'Scheduled Interviews', to: '/admin/interviews/scheduled', Icon: BookOpen },
    { label: 'Past Interview Details', to: '/admin/interviews/past', Icon: BookOpen },
    { label: 'Add Users', to: '/admin/onboarding', Icon: UserPlus },
    { label: 'Users', to: '/admin/students', Icon: Users },
    { label: 'Learning Modules', to: '/admin/learning', Icon: GraduationCap },
    { label: 'Feedback', to: '/admin/feedback', Icon: MessageSquare },
    { label: 'Assessment', to: '/admin/assessment', Icon: ClipboardList },
    { label: 'Compiler', to: '/admin/compiler', Icon: Code2 },
  ]), []);

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="group fixed left-3 top-16 z-40 hidden h-[calc(100vh-4rem)] w-16 flex-col rounded-2xl border border-slate-200 bg-white/95 px-2 py-4 transition-all duration-300 ease-in-out hover:w-56 dark:border-gray-700 dark:bg-gray-900/95 md:flex">
      <div className="flex flex-1 flex-col gap-1">
        {items.map(({ label, to, Icon }) => (
          <NavLink
            key={label}
            to={to}
            className={({ isActive: linkActive }) => {
              const active = isActive(to);
              return `flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                active
                  ? 'bg-sky-50 text-sky-600 dark:bg-gray-800 dark:text-sky-400'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-300 dark:hover:bg-gray-800'
              }`;
            }}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span className="whitespace-nowrap opacity-0 transition-all duration-200 group-hover:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
