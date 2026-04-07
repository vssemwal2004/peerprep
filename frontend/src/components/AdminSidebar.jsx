import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, ClipboardList, GraduationCap, MessageSquare, Users, UserPlus, LayoutDashboard, Code2, BookOpen, Megaphone, ChevronDown } from 'lucide-react';

export default function AdminSidebar() {
  const location = useLocation();
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);

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

        <div className="mt-1">
          <button
            onClick={() => setAnnouncementsOpen((prev) => !prev)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 ${
              isActive('/admin/announcements')
                ? 'bg-sky-50 text-sky-600 dark:bg-gray-800 dark:text-sky-400'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <Megaphone className="h-4.5 w-4.5 shrink-0" />
            <span className="flex-1 whitespace-nowrap opacity-0 transition-all duration-200 group-hover:opacity-100">
              Announcements
            </span>
            <ChevronDown className={`h-4 w-4 opacity-0 transition-all duration-200 group-hover:opacity-100 ${announcementsOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`mt-1 flex flex-col gap-1 pl-8 ${announcementsOpen ? 'block' : 'hidden'} group-hover:block`}>
            <NavLink
              to="/admin/announcements/add"
              className={({ isActive: linkActive }) => (
                `rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 ${
                  linkActive
                    ? 'bg-sky-50 text-sky-600 dark:bg-gray-800 dark:text-sky-400'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800'
                }`
              )}
            >
              Add Announcement
            </NavLink>
            <NavLink
              to="/admin/announcements/manage"
              className={({ isActive: linkActive }) => (
                `rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 ${
                  linkActive
                    ? 'bg-sky-50 text-sky-600 dark:bg-gray-800 dark:text-sky-400'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800'
                }`
              )}
            >
              Manage Announcements
            </NavLink>
          </div>
        </div>
      </div>
    </aside>
  );
}
