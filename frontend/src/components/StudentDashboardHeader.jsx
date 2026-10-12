import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Bot,
  ChevronDown,
  ClipboardList,
  Code2,
  ChevronsRight,
  Grid2X2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Moon,
  Search,
  Sparkles,
  Sun,
  User,
  UserCog,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import DailyChallengeDrawer from '../student/engagement/DailyChallengeDrawer';

const modules = [
  { label: 'Dashboard', hint: 'Your placement overview', to: '/student/dashboard', icon: LayoutDashboard },
  { label: 'QuickPrep', hint: 'Daily challenge and curated QuickPreps', to: '/student/quickprep', icon: Sparkles },
  { label: 'Analysis', hint: 'Progress and skill insights', to: '/student/analysis', icon: BarChart3 },
  { label: 'Rankings', hint: 'Your university and global rank', to: '/student/rankings', icon: BarChart3 },
  { label: 'Interviews', hint: 'Peer interview sessions', to: '/student/interview', icon: User },
  { label: 'AI Interviews', hint: 'Practice with AI', to: '/student/ai-interviews', icon: Bot },
  { label: 'Assessments', hint: 'Available tests', to: '/student/assessments', icon: ClipboardList },
  { label: 'Learning', hint: 'Subjects and learning paths', to: '/student/learning', icon: BookOpen },
  { label: 'Coding Problems', hint: 'Practice problem solving', to: '/problems', icon: Code2 },
  { label: 'Resume Builder', hint: 'Build your placement resume', to: '/student/resume', icon: UserCog },
];

/** PeerPrep's daily-challenge mark: a ticket for the day (as on the dashboard's Today card) with a gold star. */
function DailyTicketIcon() {
  return <svg viewBox="0 0 24 24" className="relative h-[19px] w-[19px] shrink-0 drop-shadow-[0_1px_0_rgba(3,105,161,0.5)]" fill="none" aria-hidden="true">
    <path d="M4.5 5h15A2.5 2.5 0 0 1 22 7.5v2.1a2.4 2.4 0 0 0 0 4.8v2.1a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5v-2.1a2.4 2.4 0 0 0 0-4.8V7.5A2.5 2.5 0 0 1 4.5 5Z"
      fill="white" fillOpacity=".22" stroke="white" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M16 7.6v8.8" stroke="white" strokeOpacity=".75" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.2 2.1" />
    <path d="M9 7.9l1.15 2.7 2.75 1.4-2.75 1.4L9 16.1l-1.15-2.7L5.1 12l2.75-1.4Z" fill="#fde047" stroke="#f59e0b" strokeWidth=".6" strokeLinejoin="round"
      className="origin-[9px_12px] transition-transform duration-300 group-hover:rotate-[20deg] group-hover:scale-110 motion-reduce:transition-none" />
  </svg>;
}

function InitialAvatar({ name, avatarUrl, className = '' }) {
  const initials = String(name || 'Student')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (avatarUrl) return <img src={avatarUrl} alt="" className={`object-cover ${className}`} />;
  return <span className={`flex items-center justify-center bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-zinc-800 dark:text-zinc-200 ${className}`}>{initials}</span>;
}

export default function StudentDashboardHeader({ sidebarPinned = false, onToggleSidebar = () => {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { allowsPath } = useUniversityPolicy();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [challengeRoute, setChallengeRoute] = useState(null);
  const challengeId = useId();
  const challengeRef = useRef(null);
  const mobileSearchRef = useRef(null);
  const searchRef = useRef(null);
  const appsRef = useRef(null);
  const profileRef = useRef(null);
  const canShowChallenges = user?.role === 'student' && user?.accessScope !== 'assessment_only' && allowsPath('/student/quickprep', 'student');
  const challengesOpen = canShowChallenges && challengeRoute === location.key;
  const closeChallenges = useCallback(() => setChallengeRoute(null), []);

  const displayName = user?.name || 'Student';
  const displayEmail = user?.email || '';
  const avatarUrl = user?.avatarUrl || '';
  const visibleModules = useMemo(() => modules.filter((item) => allowsPath(item.to, 'student')), [allowsPath]);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return visibleModules.slice(0, 5);
    return visibleModules.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(normalized));
  }, [query, visibleModules]);

  useEffect(() => {
    if (searchOpen && window.matchMedia('(max-width: 639px)').matches) mobileSearchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    setChallengeRoute(null);
  }, [location.key, canShowChallenges]);

  useEffect(() => {
    const closeMenus = (event) => {
      if (!searchRef.current?.contains(event.target)) setSearchOpen(false);
      if (!appsRef.current?.contains(event.target)) setAppsOpen(false);
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (searchRef.current?.contains(document.activeElement) && window.matchMedia('(max-width: 639px)').matches) searchRef.current.querySelector('button[aria-label="Open module search"]')?.focus();
      setSearchOpen(false);
      setAppsOpen(false);
      setProfileOpen(false);
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const goTo = (path) => {
    setQuery('');
    setSearchOpen(false);
    setAppsOpen(false);
    setProfileOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      window.location.assign('/');
    }
  };

  return (
    <header aria-label="Student header" className="sticky top-0 z-[60] border-b border-slate-200 bg-white px-3 dark:border-zinc-800 dark:bg-[#202020] sm:px-5">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-2 sm:gap-3">
        {!sidebarPinned && <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-400 dark:hover:bg-sky-950/50 dark:hover:text-sky-300"
          aria-label="Expand and pin navigation"
          title="Expand navigation"
        >
          <ChevronsRight className="h-[18px] w-[18px]" />
        </button>}

        <div ref={searchRef} className="ml-0 min-w-0 flex-1 sm:relative sm:ml-2">
          <button type="button" aria-label="Open module search" aria-expanded={searchOpen} onClick={() => { setSearchOpen(open => !open); setAppsOpen(false); setProfileOpen(false); }} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-sky-950/50 sm:hidden"><Search size={18} /></button>
          <label className="relative mx-auto hidden w-full max-w-xl sm:block">
            <span className="sr-only">Search student modules</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
              placeholder="Search modules"
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-10 pr-9 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100/70 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-sky-700 dark:focus:ring-sky-950"
            />
            {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
          </label>

          {searchOpen && (
            <div className="absolute left-3 right-3 top-[calc(100%+0.65rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2">
              <label className="block p-3 pb-0 sm:hidden"><span className="sr-only">Search student modules</span><input ref={mobileSearchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search modules" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-sky-950" /></label>
              <div className="border-b border-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800">Student modules</div>
              <div className="max-h-80 overflow-y-auto p-1.5">
                {results.length ? results.map(({ label, hint, to, icon: Icon }) => (
                  <button key={to} type="button" onClick={() => goTo(to)} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-sky-50 dark:hover:bg-sky-950/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100 group-hover:bg-sky-600 group-hover:text-white dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800 dark:text-white">{label}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{hint}</span></span>
                  </button>
                )) : <div className="px-4 py-8 text-center text-sm text-slate-500">No module matches “{query}”.</div>}
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {canShowChallenges && <button ref={challengeRef} type="button" aria-label="Open daily challenges" title="Daily challenges" aria-haspopup="dialog" aria-expanded={challengesOpen} aria-controls={challengeId} onClick={() => { setChallengeRoute(challengesOpen ? null : location.key); setSearchOpen(false); setAppsOpen(false); setProfileOpen(false); }} className={`group relative mb-[3px] flex h-9 w-9 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-sky-400 to-sky-600 text-white transition-[transform,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 dark:from-sky-500 dark:to-sky-700 xl:w-auto xl:pl-2.5 xl:pr-3.5 ${challengesOpen
            ? 'translate-y-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_2px_6px_rgba(3,105,161,0.45),0_0_0_#0369a1]'
            : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#0369a1,0_8px_16px_-6px_rgba(2,132,199,0.6)] hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_0_#0369a1,0_12px_20px_-8px_rgba(2,132,199,0.65)] active:translate-y-[3px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_0_#0369a1,0_2px_6px_-2px_rgba(2,132,199,0.5)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_#075985,0_8px_16px_-6px_rgba(0,0,0,0.6)]'}`}>
            <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[520%] motion-reduce:hidden" aria-hidden="true" />
            <DailyTicketIcon />
            <span className="relative hidden text-[12.5px] font-semibold tracking-[-0.005em] [text-shadow:0_1px_0_rgba(3,105,161,0.45)] xl:inline">Daily challenges</span>
          </button>}
          <div ref={appsRef} className="hidden sm:relative sm:block">
            <button type="button" onClick={() => { setAppsOpen((open) => !open); setProfileOpen(false); }} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" aria-label="Open module launcher" aria-expanded={appsOpen}><Grid2X2 className="h-4 w-4" /></button>
            {appsOpen && <div className="absolute left-3 right-3 top-[calc(100%+0.65rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900 sm:left-auto sm:right-0 sm:w-[19rem]">
              <div className="mb-2 px-1 text-xs font-bold text-slate-800 dark:text-white">Quick access</div>
              <div className="grid grid-cols-3 gap-1.5">{visibleModules.slice(0, 6).map(({ label, to, icon: Icon }) => <button key={to} type="button" onClick={() => goTo(to)} className="flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-xl px-1.5 text-center text-[11px] font-semibold leading-tight text-slate-600 transition hover:bg-sky-50 hover:text-sky-800 dark:text-slate-300 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Icon className="h-4 w-4" /></span>{label}</button>)}</div>
            </div>}
          </div>

          <button type="button" onClick={toggleTheme} className="hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:flex" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Change theme">{theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button>

          <NotificationBell buttonClassName="shrink-0" />

          <span className="mx-0.5 hidden h-6 w-px bg-slate-200 dark:bg-slate-800 sm:block" aria-hidden="true" />
          <div ref={profileRef} className="relative">
            <button type="button" onClick={() => { setProfileOpen((open) => !open); setAppsOpen(false); }} className="flex h-10 items-center gap-2 rounded-xl border border-transparent p-1 pr-1 transition hover:border-sky-100 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:border-sky-900 dark:hover:bg-sky-950/40 sm:pr-2" aria-label="Open profile menu" aria-expanded={profileOpen}>
              <InitialAvatar name={displayName} avatarUrl={avatarUrl} className="h-8 w-8 rounded-xl ring-1 ring-sky-100 dark:ring-sky-900" />
              <span className="hidden max-w-28 text-left lg:block"><span className="block truncate text-xs font-bold text-slate-800 dark:text-white">{displayName}</span><span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">Student</span></span>
              <ChevronDown className={`hidden h-3.5 w-3.5 text-slate-400 transition-transform lg:block ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
            {profileOpen && <div className="absolute right-0 top-[calc(100%+0.65rem)] w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-3 border-b border-slate-100 p-3 dark:border-slate-800">
                <InitialAvatar name={displayName} avatarUrl={avatarUrl} className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900 dark:text-white">{displayName}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400">{displayEmail || 'Student account'}</div></div>
              </div>
              <div className="p-1.5">
                <button type="button" onClick={() => goTo('/student/profile')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-800 dark:text-slate-200 dark:hover:bg-sky-950/40"><User className="h-4 w-4" />My profile</button>
                <button type="button" onClick={() => goTo('/student/change-password')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-800 dark:text-slate-200 dark:hover:bg-sky-950/40"><LockKeyhole className="h-4 w-4" aria-hidden="true" />Change password</button>
                <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-800 dark:text-slate-200 dark:hover:bg-sky-950/40 sm:hidden">{theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}Change theme</button>
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-800 dark:text-slate-200 dark:hover:bg-sky-950/40"><LogOut className="h-4 w-4" />Sign out</button>
              </div>
            </div>}
          </div>
        </div>
      </div>
      {challengesOpen && <DailyChallengeDrawer id={challengeId} onClose={closeChallenges} returnFocusRef={challengeRef} />}
    </header>
  );
}
