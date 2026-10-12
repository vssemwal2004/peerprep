import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, MoreVertical, Search, X } from 'lucide-react';
import { DIFFICULTY_TONES } from '../../student/quests/questTheme';

// Shared building blocks for the admin QuickPrep pages, so list, builder, library and insights look alike.

export const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-[#242424]';
export const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/15';
export const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/25 transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';


export function Page({ children }) {
  return <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100 sm:px-6 sm:py-6"><div className="mx-auto max-w-7xl space-y-5">{children}</div></div>;
}

export function Breadcrumbs({ items }) {
  return <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12.5px] text-slate-500 dark:text-zinc-400">
    {items.map((item, index) => <span key={item.label} className="inline-flex items-center gap-1">
      {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-zinc-600" aria-hidden="true" />}
      {item.to ? <Link to={item.to} className="rounded font-medium hover:text-sky-700 dark:hover:text-sky-300">{item.label}</Link> : <span className="font-semibold text-slate-700 dark:text-zinc-200" aria-current="page">{item.label}</span>}
    </span>)}
  </nav>;
}

export function PageHeader({ icon: Icon, title, description, crumbs, actions }) {
  return <header className="space-y-3">
    {crumbs && <Breadcrumbs items={crumbs} />}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25"><Icon className="h-6 w-6" aria-hidden="true" /></span>}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-zinc-50">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-zinc-400">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </header>;
}

const TONES = {
  sky: 'from-sky-500 to-blue-600 shadow-sky-500/25', emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/25', amber: 'from-amber-400 to-orange-500 shadow-amber-500/25',
  violet: 'from-violet-500 to-indigo-600 shadow-violet-500/25', rose: 'from-rose-500 to-pink-600 shadow-rose-500/25', slate: 'from-slate-500 to-slate-700 shadow-slate-500/25',
};
export function StatCard({ icon: Icon, label, value, hint, tone = 'sky' }) {
  return <div className={`${card} group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-md`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">{label}</p>
        <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-slate-950 dark:text-zinc-50">{value}</p>
        {hint && <p className="mt-1.5 truncate text-[11.5px] text-slate-400 dark:text-zinc-500">{hint}</p>}
      </div>
      {Icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${TONES[tone] || TONES.sky}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>}
    </div>
  </div>;
}

const STATUS = {
  published: ['Published', 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20', 'bg-emerald-500'],
  draft: ['Draft', 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20', 'bg-amber-500'],
  archived: ['Archived', 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700', 'bg-slate-400'],
};
export function StatusPill({ status }) {
  const [label, tone, dot] = STATUS[status] || STATUS.draft;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${tone}`}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />{label}</span>;
}

export function DifficultyPill({ difficulty }) {
  if (!difficulty) return <span className="text-xs text-slate-400">—</span>;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${DIFFICULTY_TONES[difficulty]?.pill || ''}`}>{difficulty}</span>;
}

/** Stacked Easy/Medium/Hard bar with the counts beside it. */
export function MixBar({ difficulty = {}, compact = false }) {
  const total = (difficulty.Easy || 0) + (difficulty.Medium || 0) + (difficulty.Hard || 0);
  return <div className={compact ? 'w-28' : 'w-full'}>
    <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" aria-hidden="true">
      {total > 0 && ['Easy', 'Medium', 'Hard'].map((level) => difficulty[level] ? <span key={level} className={DIFFICULTY_TONES[level].bar} style={{ width: `${(difficulty[level] / total) * 100}%` }} /> : null)}
    </div>
    <p className="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">
      <span className={DIFFICULTY_TONES.Easy.text}>{difficulty.Easy || 0}E</span> · <span className={DIFFICULTY_TONES.Medium.text}>{difficulty.Medium || 0}M</span> · <span className={DIFFICULTY_TONES.Hard.text}>{difficulty.Hard || 0}H</span>
    </p>
  </div>;
}

export function ProgressBar({ value = 0, tone = 'bg-sky-500', label }) {
  const width = Math.max(0, Math.min(100, value));
  return <div className="flex items-center gap-2">
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${width}%` }} />
    </div>
    <span className="w-9 text-right text-[11.5px] font-semibold tabular-nums text-slate-600 dark:text-zinc-300">{width}%</span>
  </div>;
}

export function Chips({ values = [], max = 2, empty = '—', icon: Icon }) {
  if (!values.length) return <span className="text-xs text-slate-400 dark:text-zinc-500">{empty}</span>;
  return <div className="flex flex-wrap gap-1">
    {values.slice(0, max).map((value) => <span key={value} className="inline-flex max-w-[9rem] items-center gap-1 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{Icon && <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}<span className="truncate">{value}</span></span>)}
    {values.length > max && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400" title={values.slice(max).join(', ')}>+{values.length - max}</span>}
  </div>;
}

export function Notice({ tone = 'success', children, onClose }) {
  const tones = { success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200', error: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200', info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200', warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${tones[tone]}`}>
    <div className="min-w-0 flex-1">{children}</div>
    {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded p-0.5 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>}
  </div>;
}

/** Closes a popover on outside pointer or Escape. */
function useDismiss(open, setOpen, refs) {
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!refs.some((ref) => ref.current?.contains(event.target))) setOpen(false); };
    const key = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open, setOpen, refs]);
}

/**
 * Row actions behind a 3-dot button. The menu is portalled and positioned against the trigger so a
 * scrolling table never clips it; it opens upward when there is no room below.
 */
export function RowMenu({ name, actions }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const refs = useMemo(() => [trigger, menu], []);
  const menuId = useId();
  useDismiss(open, setOpen, refs);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = trigger.current.getBoundingClientRect();
      const height = menu.current?.offsetHeight || 280;
      const below = window.innerHeight - rect.bottom;
      const top = below < height + 12 && rect.top > height + 12 ? rect.top - height - 6 : rect.bottom + 6;
      setPosition({ top, left: Math.max(8, Math.min(window.innerWidth - 232, rect.right - 224)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => { if (open && position) menu.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true }); }, [open, position]);
  const visible = actions.filter(Boolean);
  const onKeyDown = (event) => {
    const items = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
    if (event.key === 'Tab') setOpen(false);
  };
  return <>
    <button ref={trigger} type="button" aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${open ? 'bg-slate-100 text-slate-800 dark:bg-zinc-800' : ''}`}>
      <MoreVertical className="h-4 w-4" aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={menuId} role="menu" aria-label={`${name} actions`} onKeyDown={onKeyDown} style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      className="fixed z-[1000] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-900/10 dark:border-zinc-700 dark:bg-zinc-900">
      {visible.map((action, index) => action === 'divider' ? <div key={`divider-${index}`} className="my-1 border-t border-slate-100 dark:border-zinc-800" role="separator" />
        : <button key={action.id} type="button" role="menuitem" disabled={action.disabled} title={action.title}
          onClick={(event) => { event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); action.run(); }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium outline-none transition hover:bg-slate-50 focus:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800 ${action.danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-zinc-200'}`}>
          <action.icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />{action.label}
        </button>)}
    </div>, document.body)}
  </>;
}

/**
 * Searchable multi-select over values that exist in the library. Nothing selected means "All".
 * @param {{ label: string, icon: Function, options: {name:string,count?:number}[], value: string[], onChange: (next: string[]) => void, allLabel: string }} props
 */
export function MultiSelect({ label, icon: Icon, options = [], value = [], onChange, allLabel, placeholder = 'Search…', loading = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef(null);
  const refs = useMemo(() => [root], []);
  const listId = useId();
  useDismiss(open, setOpen, refs);
  const selected = new Set(value);
  const term = query.trim().toLowerCase();
  // Values saved earlier but no longer in the library stay visible so they can be removed.
  const all = [...options, ...value.filter((name) => !options.some((option) => option.name === name)).map((name) => ({ name, count: 0, missing: true }))];
  const shown = (term ? all.filter((option) => option.name.toLowerCase().includes(term)) : all).slice(0, 200);
  const toggle = (name) => onChange(selected.has(name) ? value.filter((entry) => entry !== name) : [...value, name]);
  const summary = !value.length ? allLabel : value.length <= 2 ? value.join(', ') : `${value.slice(0, 2).join(', ')} +${value.length - 2}`;
  return <div ref={root} className="relative">
    {!compact && <span className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{label}</span>}
    <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={compact ? `${label}: ${summary}` : undefined} onClick={() => setOpen((current) => !current)}
      className={`${inputClass} flex items-center gap-2 text-left ${compact ? 'py-2' : ''} ${open ? 'border-sky-400 ring-4 ring-sky-100 dark:border-sky-500 dark:ring-sky-500/15' : ''}`}>
      {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
      {compact && <span className="shrink-0 text-slate-500 dark:text-zinc-400">{label}:</span>}
      <span className={`min-w-0 flex-1 truncate ${value.length ? 'font-medium text-slate-800 dark:text-zinc-100' : 'text-slate-500 dark:text-zinc-400'}`}>{summary}</span>
      {value.length > 0 && <span className="rounded-full bg-sky-100 px-1.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{value.length}</span>}
      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-50 mt-1.5 min-w-[16rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="border-b border-slate-100 p-2 dark:border-zinc-800">
        <label className="relative block">
          <span className="sr-only">Search {label}</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="w-full rounded-lg bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:bg-zinc-800 dark:ring-sky-500/30" />
        </label>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-slate-500 dark:text-zinc-400">{value.length ? `${value.length} selected` : `${options.length} available`}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => onChange([...new Set([...value, ...shown.filter((option) => !option.missing).map((option) => option.name)])])} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">Select {term ? 'shown' : 'all'}</button>
            <button type="button" onClick={() => onChange([])} disabled={!value.length} className="font-semibold text-slate-500 hover:underline disabled:opacity-40 dark:text-zinc-400">Clear</button>
          </span>
        </div>
      </div>
      <ul id={listId} role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-64 overflow-y-auto py-1">
        {!term && <li role="option" aria-selected={!value.length}>
          <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-zinc-800">
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${!value.length ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-zinc-600'}`}>{!value.length && <Check className="h-3 w-3" />}</span>
            <span className="flex-1 font-semibold">{allLabel}</span>
          </button>
        </li>}
        {loading && <li className="px-3 py-3 text-sm text-slate-500">Loading…</li>}
        {!loading && !shown.length && <li className="px-3 py-3 text-sm text-slate-500">No match for “{query}”.</li>}
        {shown.map((option) => {
          const checked = selected.has(option.name);
          return <li key={option.name} role="option" aria-selected={checked}>
            <button type="button" onClick={() => toggle(option.name)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-zinc-800">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-zinc-600'}`}>{checked && <Check className="h-3 w-3" />}</span>
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {option.missing ? <span className="text-[11px] text-amber-600">not in library</span> : option.count !== undefined && <span className="text-[11px] tabular-nums text-slate-400">{option.count}</span>}
            </button>
          </li>;
        })}
      </ul>
    </div>}
  </div>;
}

/** Single choice with an icon and a one-line hint for each option. */
export function SelectMenu({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const refs = useMemo(() => [root], []);
  const listId = useId();
  useDismiss(open, setOpen, refs);
  const current = options.find((option) => option.value === value) || options[0];
  const CurrentIcon = current.icon;
  return <div ref={root} className="relative">
    <span className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{label}</span>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((state) => !state)}
      className={`${inputClass} flex items-center gap-2.5 text-left ${open ? 'border-sky-400 ring-4 ring-sky-100 dark:border-sky-500 dark:ring-sky-500/15' : ''}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><CurrentIcon className="h-4 w-4" aria-hidden="true" /></span>
      <span className="flex-1 font-medium">{current.label}</span>
      <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <ul id={listId} role="listbox" aria-label={label} className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10 dark:border-zinc-700 dark:bg-zinc-900">
      {options.map((option) => {
        const OptionIcon = option.icon;
        const active = option.value === current.value;
        return <li key={option.value} role="option" aria-selected={active}>
          <button type="button" onClick={() => { onChange(option.value); setOpen(false); }} className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-zinc-800 ${active ? 'bg-sky-50/70 dark:bg-sky-500/10' : ''}`}>
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-300'}`}><OptionIcon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800 dark:text-zinc-100">{option.label}</span>{option.hint && <span className="block text-[12px] text-slate-500 dark:text-zinc-400">{option.hint}</span>}</span>
            {active && <Check className="mt-1 h-4 w-4 text-sky-600" aria-hidden="true" />}
          </button>
        </li>;
      })}
    </ul>}
  </div>;
}

export function SearchBox({ value, onChange, placeholder, label = 'Search' }) {
  return <label className="relative block min-w-[14rem] flex-1">
    <span className="sr-only">{label}</span>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} py-2 pl-9`} />
  </label>;
}

export function Segmented({ options, value, onChange, label }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-zinc-800">
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${value === option.value ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100'}`}>
      {option.label}{option.count !== undefined && <span className="ml-1.5 text-[11px] font-medium tabular-nums opacity-70">{option.count}</span>}
    </button>)}
  </div>;
}
