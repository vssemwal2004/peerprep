import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, ChevronDown, LogOut, User } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';
import { useAuth } from '../context/AuthContext';

export function AdminNavbar() {
  const location = useLocation();
  const { user } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const adminName = user?.name || localStorage.getItem('adminName') || 'Admin';
  const adminEmail = user?.email || localStorage.getItem('adminEmail') || '';
  const adminAvatarUrl = user?.avatarUrl || localStorage.getItem('adminAvatarUrl') || '';

  useEffect(() => {
    if (user?.name) localStorage.setItem('adminName', user.name);
    if (user?.email) localStorage.setItem('adminEmail', user.email);
    if (user && Object.prototype.hasOwnProperty.call(user, 'avatarUrl')) {
      localStorage.setItem('adminAvatarUrl', user.avatarUrl || '');
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
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminName');
    localStorage.removeItem('adminEmail');
    localStorage.removeItem('adminAvatarUrl');
    window.location.href = '/';
  };

  const initials = adminName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-20 items-center justify-between px-4 lg:px-6">
        <Link to="/admin" className="flex items-center">
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
              {adminAvatarUrl ? (
                <img src={adminAvatarUrl} alt="Admin" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-600 dark:bg-gray-800 dark:text-sky-400">
                  {initials || 'AD'}
                </span>
              )}
              <span className="hidden text-xs font-semibold text-slate-600 dark:text-gray-300 sm:inline">{adminName}</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <div className="border-b border-slate-100 pb-3 dark:border-gray-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{adminName}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">{adminEmail}</p>
                </div>
                <div className="mt-3 space-y-1">
                  <Link
                    to="/admin/activity"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Activity className="h-4 w-4" />
                    Active Log
                  </Link>
                  <Link
                    to="/admin/change-password"
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

