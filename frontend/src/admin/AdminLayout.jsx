import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import GlobalSidebar from '../components/GlobalSidebar';
import { getSidebarWidth } from '../components/sidebarLayout';

export default function AdminLayout({ children }) {
  const location = useLocation();
  const mainRef = useRef(null);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const sidebarWidth = getSidebarWidth(isSidebarExpanded);
  const isCompilerPreview = location.pathname.includes('/admin/compiler') && location.pathname.includes('/preview');

  // The layout stays mounted between pages, so start each page at the top.
  useLayoutEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [location.pathname]);

  return (
    <div
      className={`h-screen overflow-hidden bg-slate-50 dark:bg-gray-900${isCompilerPreview ? ' overflow-x-hidden' : ''}`}
      style={{ '--admin-sidebar-width': sidebarWidth, '--app-navbar-height': '0rem' }}
    >
      <GlobalSidebar
        isExpanded={isSidebarExpanded}
        onExpand={() => setIsSidebarExpanded(true)}
        onCollapse={() => setIsSidebarExpanded(false)}
      />
      <main ref={mainRef} data-app-scroll-container className="h-screen min-h-0 overflow-y-auto overscroll-contain transition-[padding] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ paddingLeft: 'var(--admin-sidebar-width)' }}>
        {children}
      </main>
    </div>
  );
}
