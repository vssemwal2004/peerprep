import { useState } from 'react';
import GlobalSidebar from '../components/GlobalSidebar';
import { getSidebarWidth } from '../components/sidebarLayout';

export default function CoordinatorLayout({ children }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const sidebarWidth = getSidebarWidth(isSidebarExpanded);

  return (
    <div
      className="h-screen overflow-hidden bg-slate-50 dark:bg-gray-900"
      style={{ '--admin-sidebar-width': sidebarWidth, '--app-navbar-height': '0rem' }}
    >
      <GlobalSidebar
        role="coordinator"
        isExpanded={isSidebarExpanded}
        onExpand={() => setIsSidebarExpanded(true)}
        onCollapse={() => setIsSidebarExpanded(false)}
      />
      <main data-app-scroll-container className="h-screen min-h-0 overflow-y-auto overscroll-contain transition-[padding] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ paddingLeft: 'var(--admin-sidebar-width)' }}>
        {children}
      </main>
    </div>
  );
}
