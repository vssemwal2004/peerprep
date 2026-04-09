import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, ClipboardList, History, Trophy } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Your Assessments', to: '/student/assessments', icon: ClipboardList },
  { label: 'Assessment Reports', to: '/student/assessment-reports', icon: BarChart3 },
  { label: 'Ranks', to: '/student/ranks', icon: Trophy },
  { label: 'Assessment History', to: '/student/assessment-history', icon: History },
];

export default function AssessmentModuleLayout({ title, children }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);

  const aliasMap = {
    '/student/assessments': '/assessments',
    '/student/assessment-reports': '/assessment-reports',
    '/student/ranks': '/ranks',
    '/student/assessment-history': '/assessment-history',
  };

  const isActive = (path) => {
    const alias = aliasMap[path];
    return (
      location.pathname === path ||
      location.pathname.startsWith(`${path}/`) ||
      (alias ? location.pathname === alias || location.pathname.startsWith(`${alias}/`) : false)
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-16">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1600px]">
        <aside
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          className="sticky top-16 hidden h-[calc(100vh-4rem)] md:block"
        >
          <motion.div
            animate={{ width: expanded ? 240 : 88 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex h-full flex-col border-r border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                  <ClipboardList className="h-5 w-5" strokeWidth={1.9} />
                </div>
                <span className={`whitespace-nowrap text-sm font-semibold text-slate-900 transition-opacity ${expanded ? 'opacity-100' : 'opacity-0'}`}>
                  Assessment
                </span>
              </div>
            </div>

            <nav className="flex-1 space-y-2 px-3 py-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-sky-50 text-sky-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                      active ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Icon className="h-4 w-4" strokeWidth={1.9} />
                    </span>
                    <span className={`whitespace-nowrap transition-all duration-200 ${expanded ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
                      {item.label}
                    </span>
                  </NavLink>
                );
              })}
            </nav>
          </motion.div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          </div>

          <div className="md:hidden border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex gap-2 overflow-x-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`inline-flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
                      active ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>

          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
