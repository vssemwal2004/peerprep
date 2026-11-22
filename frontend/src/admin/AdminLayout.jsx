import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import GlobalSidebar from '../components/GlobalSidebar';
import ShellCorners from '../components/ShellCorners';
import { useOverlaySidebar } from '../components/useOverlaySidebar';

export default function AdminLayout({ children }) {
  const location = useLocation();
  const mainRef = useRef(null);
  const sidebar = useOverlaySidebar('adminSidebarPinned');
  const isCompilerPreview = location.pathname.includes('/admin/compiler') && location.pathname.includes('/preview');

  // The layout stays mounted between pages, so start each page at the top.
  useLayoutEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [location.pathname]);

  return (
    <div
      data-app-shell
      className={`h-screen overflow-hidden bg-slate-50 dark:bg-gray-900${isCompilerPreview ? ' overflow-x-hidden' : ''}`}
      style={{ '--admin-sidebar-width': sidebar.reservedWidth, '--app-navbar-height': '0rem' }}
    >
      <GlobalSidebar
        isExpanded={sidebar.isExpanded}
        isPinned={sidebar.isPinned}
        onTogglePin={sidebar.togglePin}
        onExpand={sidebar.onExpand}
        onCollapse={sidebar.onCollapse}
      />
      <ShellCorners />
      {/* Hover never changes this padding (the sidebar floats over the page); only pinning does. */}
      <main ref={mainRef} data-app-scroll-container className="h-screen min-h-0 overflow-y-auto overscroll-contain" style={{ paddingLeft: 'var(--admin-sidebar-width)' }}>
        {children}
      </main>
    </div>
  );
}
