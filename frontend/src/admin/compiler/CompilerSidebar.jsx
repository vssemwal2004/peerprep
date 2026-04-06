import { Link } from 'react-router-dom';

export default function CompilerSidebar({
  items,
  activeSection,
  isExpanded,
  onExpand,
  onCollapse,
}) {
  return (
    <aside
      onMouseEnter={onExpand}
      onMouseLeave={onCollapse}
      className={`activity-sidebar fixed top-20 z-30 hidden h-[calc(100vh-5rem)] overflow-hidden border-r border-slate-200 bg-white/95 shadow-sm backdrop-blur transition-all duration-300 md:block dark:border-gray-700 dark:bg-gray-900/95 ${isExpanded ? 'w-[272px]' : 'w-20'}`}
      style={{ left: 'var(--admin-sidebar-width, 4rem)' }}
    >
      <div className="h-full overflow-y-auto px-3 py-4">
        <div className="mb-5 px-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-gray-500">
            Compiler
          </p>
          {isExpanded && (
            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
              Admin-only judge workspace
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          {items.map((item) => {
            const isActive = activeSection === item.key;
            return (
              <Link
                key={item.key}
                to={item.to}
                title={item.label}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-900/20 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                  isActive
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-400 dark:group-hover:bg-gray-700'
                }`}>
                  <item.Icon className="h-4 w-4" />
                </div>
                {isExpanded && (
                  <div className="min-w-0">
                    <p className="truncate">{item.label}</p>
                    <p className="truncate text-xs font-normal text-slate-400 dark:text-gray-500">{item.caption}</p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}


