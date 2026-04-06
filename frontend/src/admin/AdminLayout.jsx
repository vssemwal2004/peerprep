import { useState } from 'react';
import { AdminNavbar } from '../components/AdminNavbar';
import GlobalSidebar from '../components/GlobalSidebar';

export default function AdminLayout({ children }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const sidebarWidth = isSidebarExpanded ? '14rem' : '4rem';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900" style={{ '--admin-sidebar-width': sidebarWidth }}>
      <AdminNavbar />
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
