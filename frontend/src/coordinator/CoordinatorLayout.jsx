import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, ChevronDown, LogOut, User } from 'lucide-react';
import DarkModeToggle from '../components/DarkModeToggle';
import { useAuth } from '../context/AuthContext';
import GlobalSidebar from '../components/GlobalSidebar';

export function CoordinatorTopNavbar() {
  const location = useLocation();
  const { user } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const coordinatorName = user?.name || localStorage.getItem('coordinatorName') || 'Coordinator';
  const coordinatorEmail = user?.email || localStorage.getItem('coordinatorEmail') || '';
  const coordinatorAvatarUrl = user?.avatarUrl || localStorage.getItem('coordinatorAvatarUrl') || '';

  useEffect(() => {
    if (user?.name) localStorage.setItem('coordinatorName', user.name);
    if (user?.email) localStorage.setItem('coordinatorEmail', user.email);
    if (user && Object.prototype.hasOwnProperty.call(user, 'avatarUrl')) {
      localStorage.setItem('coordinatorAvatarUrl', user.avatarUrl || '');
    }
  }, [user]);

  useEffect(() => {
    setIsProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isProfileOpen && !event.target.closest('.profile-container')) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileOpen]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('coordinatorName');
    localStorage.removeItem('coordinatorEmail');
    localStorage.removeItem('coordinatorAvatarUrl');
    window.location.href = '/';
  };

  const initials = coordinatorName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-20 items-center justify-between px-4 lg:px-6">
        <Link to="/coordinator/overview" className="flex items-center">
          <img src="/images/logo.png" alt="Platform Logo" className="h-[76px] w-auto object-contain" />
        </Link>

        <div className="flex items-center gap-4">
          <DarkModeToggle />

          <div className="relative profile-container">
            <button
              type="button"
              onClick={() => setIsProfileOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {coordinatorAvatarUrl ? (
                <img src={coordinatorAvatarUrl} alt="Coordinator" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-600 dark:bg-gray-800 dark:text-emerald-400">
                  {initials || 'CO'}
                </span>
              )}
              <span className="hidden text-xs font-semibold text-slate-600 dark:text-gray-300 sm:inline">{coordinatorName}</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <div className="border-b border-slate-100 pb-3 dark:border-gray-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{coordinatorName}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">{coordinatorEmail}</p>
                </div>
                <div className="mt-3 space-y-1">
                  <Link
                    to="/coordinator/activity"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Activity className="h-4 w-4" />
                    Active Log
                  </Link>
                  <Link
                    to="/coordinator/change-password"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <User className="h-4 w-4" />
                    Change Password
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function CoordinatorLayout({ children }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const sidebarWidth = isSidebarExpanded ? '14rem' : '4rem';

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-gray-900"
      style={{ '--admin-sidebar-width': sidebarWidth, '--app-navbar-height': '5rem' }}
    >
      <CoordinatorTopNavbar />
      <GlobalSidebar
        role="coordinator"
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
