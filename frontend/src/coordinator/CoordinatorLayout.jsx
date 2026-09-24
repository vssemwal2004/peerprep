import { useState } from 'react';
import GlobalSidebar from '../components/GlobalSidebar';

export default function CoordinatorLayout({ children }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const sidebarWidth = isSidebarExpanded ? '17rem' : '4rem';

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-gray-900"
      style={{ '--admin-sidebar-width': sidebarWidth, '--app-navbar-height': '0rem' }}
    >
      <GlobalSidebar
        role="coordinator"
        isExpanded={isSidebarExpanded}
        onExpand={() => setIsSidebarExpanded(true)}
        onCollapse={() => setIsSidebarExpanded(false)}
      />
      <main className="min-h-screen transition-[padding] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ paddingLeft: 'var(--admin-sidebar-width)' }}>
        {children}
      </main>
    </div>
  );
}
