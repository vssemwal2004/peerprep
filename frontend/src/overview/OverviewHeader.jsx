import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, Plus, RefreshCw, Search } from 'lucide-react';
import { Glass } from './ui';
import PageGuideButton from '../guide/platform/PageGuideButton';
import { relativeTime } from './overviewModel';

const TONES = {
  sky: 'text-sky-700 dark:text-sky-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-700 dark:text-amber-300',
  rose: 'text-rose-700 dark:text-rose-300',
  slate: 'text-slate-900 dark:text-white',
};
const ICON_TONES = {
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300',
};
const button = 'inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60';

/** Student search that opens the student list filtered by the term. "/" focuses it. */
function StudentSearch({ to, placeholder }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [term, setTerm] = useState('');
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || /input|textarea|select/i.test(event.target.tagName) || event.target.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form
      role="search"
      onSubmit={(event) => { event.preventDefault(); if (term.trim()) navigate(`${to}?search=${encodeURIComponent(term.trim())}`); }}
      className="relative w-full sm:w-64"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        ref={inputRef}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-xl border border-slate-200 bg-white/80 pl-8 pr-8 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[10px] font-semibold text-slate-400 dark:border-white/10">/</kbd>
    </form>
  );
}

/** "Create" menu: the things this role may start, each a real page. */
function CreateMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu"
        className={`${button} bg-sky-600 text-white shadow-sm shadow-sky-600/20 hover:bg-sky-700`}>
        <Plus className="h-4 w-4" aria-hidden="true" />Create<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)] dark:border-white/10 dark:bg-slate-900">
          {items.map(({ label, hint, to, Icon }) => (
            <Link key={label} to={to} role="menuitem" onClick={() => setOpen(false)}
              className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-white/[0.06]">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                {hint ? <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{hint}</span> : null}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, hint, Icon, tone = 'slate', to, href }) {
  const body = (
    <>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ICON_TONES[tone] || ICON_TONES.slate}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block text-base font-semibold leading-tight tabular-nums ${TONES[tone] || TONES.slate}`}>{value}</span>
        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{label}{hint ? <span className="text-slate-400"> · {hint}</span> : null}</span>
      </span>
      {to || href ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-sky-600 dark:text-slate-600" aria-hidden="true" /> : null}
    </>
  );
  const cell = 'group flex items-center gap-3 px-5 py-3 transition';
  if (to) return <Link to={to} className={`${cell} hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03]`}>{body}</Link>;
  if (href) return <a href={href} className={`${cell} hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03]`}>{body}</a>;
  return <div className={cell}>{body}</div>;
}

/**
 * The overview's header, shared by the Master Admin, university admin and coordinator overviews.
 * Each role passes only what it may open: status figures, a "Create" menu, a student search and
 * shortcuts. Every entry is a real page (or a section of this page).
 */
export default function OverviewHeader({
  badge, BadgeIcon, title, subtitle, chips = [], updatedAt, loading = false, onRefresh,
  search = null, createItems = [], stats = [], shortcuts = [], period = null, showGuide = true,
}) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    // No overflow-hidden: the Create menu must be able to drop below the header.
    <Glass as="header" className="relative z-20 mb-4">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm shadow-sky-600/20">
              {BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5" aria-hidden="true" /> : null}{badge}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{today}</span>
          </div>
          <h1 data-guide="ov-title" className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}{showGuide && <PageGuideButton />}</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}{updatedAt ? <span className="text-slate-400"> · Updated {relativeTime(updatedAt)}</span> : loading ? <span className="text-slate-400"> · Loading…</span> : null}
          </p>
          {chips.length ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => <span key={chip.label} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${chip.className || 'bg-slate-900/[0.04] text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10'}`}>{chip.label}</span>)}
            </div>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
          {search ? <div data-guide="ov-search" className="min-w-0"><StudentSearch to={search.to} placeholder={search.placeholder} /></div> : null}
          <div className="flex items-center gap-2">
            {period ? <div data-guide="ov-period">{period}</div> : null}
            <div data-guide="ov-create"><CreateMenu items={createItems} /></div>
            {onRefresh ? (
              <button type="button" onClick={onRefresh} aria-label="Refresh overview" title="Refresh"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {stats.length ? (
        <div data-guide="ov-stats" className={`grid divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/5 dark:border-white/5 sm:divide-y-0 sm:divide-x ${stats.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {stats.map((stat) => <StatCell key={stat.label} {...stat} />)}
        </div>
      ) : null}

      {shortcuts.length ? (
        <nav data-guide="ov-shortcuts" aria-label="Shortcuts" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 [scrollbar-width:none] dark:border-white/5 [&::-webkit-scrollbar]:hidden">
          {shortcuts.map(({ label, to, href, Icon }) => {
            const inner = <>{Icon ? <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> : null}{label}</>;
            const cls = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-900/[0.05] hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white';
            // Keyed by destination: a section anchor and a page link can share a label ("Universities").
            return to ? <Link key={`to:${to}`} to={to} className={cls}>{inner}</Link> : <a key={`href:${href}`} href={href} className={cls}>{inner}</a>;
          })}
        </nav>
      ) : null}
    </Glass>
  );
}
