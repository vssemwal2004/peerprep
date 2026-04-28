import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminNavbar } from '../components/AdminNavbar';
import GlobalSidebar from '../components/GlobalSidebar';

export default function AdminLayout({ children }) {
  const location = useLocation();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const sidebarWidth = isSidebarExpanded ? '14rem' : '4rem';
  const isCompilerPreview = location.pathname.includes('/admin/compiler') && location.pathname.includes('/preview');
  const navbarHeight = isCompilerPreview ? '0rem' : '5rem';

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-gray-900${isCompilerPreview ? ' overflow-x-hidden' : ''}`}
      style={{ '--admin-sidebar-width': sidebarWidth, '--app-navbar-height': navbarHeight }}
    >
      {!isCompilerPreview && <AdminNavbar />}
      <GlobalSidebar
        isExpanded={isSidebarExpanded}
        onExpand={() => setIsSidebarExpanded(true)}
        onCollapse={() => setIsSidebarExpanded(false)}
      />
      <div className="transition-[padding] duration-300" style={{ paddingLeft: 'var(--admin-sidebar-width)' }}>
        {children}
      </div>
    </div>
  );
}
