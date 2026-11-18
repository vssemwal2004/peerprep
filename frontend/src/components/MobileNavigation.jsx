import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, Moon, Sun, X } from 'lucide-react';

const rowBase = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60';
const rowTone = (active) => (active
  ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
  : 'font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.05]');

function Avatar({ avatarUrl, initials, accent, size = 'h-9 w-9' }) {
  return avatarUrl
    ? <img src={avatarUrl} alt="" className={`${size} shrink-0 rounded-xl object-cover`} />
    : <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl text-xs font-bold ${accent === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>{initials}</span>;
}

/**
 * Phones and tablets: a top bar with the menu button and a slide-in drawer holding the same
 * navigation as the desktop sidebar (groups expand in place) plus the account actions.
 */
export default function MobileNavigation({
  navItems, isRouteActive, homePath, logo, roleLabel, displayName, displayEmail, avatarUrl, initials, accent,
  accountLinks = [], theme, toggleTheme, onLogout,
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

  // Close on navigation; open the group of the current page so it is visible.
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return undefined;
    const active = navItems.filter((item) => item.type === 'group' && item.items.some((child) => isRouteActive(child))).map((item) => item.key);
    setExpanded((current) => new Set([...current, ...active]));
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (key) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const renderLink = (item, depth = 0) => {
    const Icon = item.icon;
    const active = isRouteActive(item);
    return (
      <NavLink key={`${item.label}-${item.to}`} to={item.to} aria-current={active ? 'page' : undefined}
        className={`${rowBase} ${rowTone(active)} ${depth ? 'min-h-10 text-[13.5px]' : ''}`}>
        {Icon ? <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`} aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white" title={item.badgeLabel}>
            <span aria-hidden="true">{item.badge > 99 ? '99+' : item.badge}</span>
            <span className="sr-only">{item.badgeLabel}</span>
          </span>
        )}
      </NavLink>
    );
  };
  const hasBadge = navItems.some((item) => item.badge > 0);

  // A child with its own children (a folder, or a link with sub-pages) expands in place.
  const renderChild = (child, parentKey) => {
    if (!child.children?.length) return renderLink(child, 1);
    const key = `${parentKey}:${child.label}`;
    const isOpen = expanded.has(key);
    const Icon = child.icon;
    const active = isRouteActive(child);
    return (
      <div key={key}>
        <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className={`${rowBase} ${rowTone(active)} min-h-10 text-[13.5px]`}>
          {Icon ? <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`} aria-hidden="true" /> : null}
          <span className="min-w-0 flex-1 truncate">{child.label}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {isOpen && <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2 dark:border-white/10">{child.children.map((entry) => renderLink(entry, 2))}</div>}
      </div>
    );
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[70] flex h-14 items-center gap-2 border-b border-sky-100 bg-white/95 px-2 backdrop-blur-xl dark:border-sky-950 dark:bg-slate-950/95">
        <button type="button" onClick={() => setOpen(true)} aria-label={hasBadge ? 'Open menu (new requests waiting)' : 'Open menu'} aria-expanded={open} aria-controls="mobile-navigation"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-200 dark:hover:bg-white/10">
          <Menu className="h-5 w-5" aria-hidden="true" />
          {hasBadge && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950" aria-hidden="true" />}
        </button>
        <Link to={homePath} className="flex min-w-0 flex-1 items-center" aria-label="PeerPrep home">
          <img src={logo} alt="PeerPrep" className="h-8 w-auto max-w-[150px] object-contain" />
        </Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open account and menu" className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
          <Avatar avatarUrl={avatarUrl} initials={initials} accent={accent} />
        </button>
      </header>

      {/* Backdrop + drawer. Kept mounted for the slide animation; inert while closed. */}
      <div className={`fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav id="mobile-navigation" aria-label={`${roleLabel} navigation`} inert={!open}
        className={`fixed inset-y-0 left-0 z-[90] flex w-[86vw] max-w-[320px] flex-col bg-white transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-slate-950 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full shadow-none'}`}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-3 dark:border-white/10">
          <img src={logo} alt="PeerPrep" className="h-8 w-auto max-w-[150px] object-contain" />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/10">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 py-3">
          {navItems.map((item) => {
            if (item.type === 'link') return renderLink(item);
            const isOpen = expanded.has(item.key);
            const GroupIcon = item.icon;
            const active = item.items.some((child) => isRouteActive(child));
            return (
              <div key={item.key}>
                <button type="button" onClick={() => toggle(item.key)} aria-expanded={isOpen} className={`${rowBase} ${rowTone(active && !isOpen)}`}>
                  {GroupIcon ? <GroupIcon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`} aria-hidden="true" /> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {isOpen && <div className="mb-1 ml-5 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2 dark:border-white/10">{item.items.map((child) => renderChild(child, item.key))}</div>}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-slate-100 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar avatarUrl={avatarUrl} initials={initials} accent={accent} size="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{displayName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{displayEmail || roleLabel}</p>
            </div>
          </div>
          {accountLinks.map(({ label, to, Icon }) => (
            <Link key={label} to={to} className={`${rowBase} ${rowTone(location.pathname === to)} min-h-10 text-[13.5px]`}>
              <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{label}
            </Link>
          ))}
          <button type="button" onClick={toggleTheme} role="switch" aria-checked={theme === 'dark'} className={`${rowBase} ${rowTone(false)} min-h-10 text-[13.5px]`}>
            {theme === 'dark' ? <Moon className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" /> : <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />}
            <span className="flex-1">Dark theme</span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${theme === 'dark' ? 'bg-sky-500' : 'bg-slate-200 dark:bg-gray-700'}`} aria-hidden="true">
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
            </span>
          </button>
          <button type="button" onClick={onLogout} className={`${rowBase} min-h-10 text-[13.5px] font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30`}>
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />Sign out
          </button>
        </div>
      </nav>
    </>
  );
}
