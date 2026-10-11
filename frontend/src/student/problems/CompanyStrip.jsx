import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';
import { card, companyInitial, companyTone, fieldBase, focusRing } from './problemsUi';

function CompanyChip({ company, count, selected, onSelect }) {
  return <button type="button" aria-pressed={selected} onClick={() => onSelect(company)}
    className={`group inline-flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium transition-colors ${focusRing} ${selected
      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
      : 'bg-[#f3f4f6] text-slate-700 hover:bg-[#e9ebef] dark:bg-white/[0.05] dark:text-zinc-200 dark:hover:bg-white/[0.09]'}`}>
    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${selected ? 'bg-white/15 text-white dark:bg-slate-900/10 dark:text-slate-900' : companyTone(company)}`} aria-hidden="true">{companyInitial(company)}</span>
    {company}
    <span className={`text-[11.5px] tabular-nums ${selected ? 'text-white/70 dark:text-slate-900/60' : 'text-slate-400 dark:text-zinc-500'}`}>{count}</span>
  </button>;
}

/** Companies that asked these questions, from interview reports and problem tags. */
export default function CompanyStrip({ companies, loading, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const panelRef = useRef(null);
  const matches = companies.filter(({ company }) => company.toLowerCase().includes(deferredQuery.trim().toLowerCase()));
  // The active company stays visible in the strip even when it is not among the most frequent.
  const pinned = companies.find(({ company }) => company === selected);
  const visible = pinned && !companies.slice(0, 14).includes(pinned) ? [pinned, ...companies.slice(0, 13)] : companies.slice(0, 14);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!panelRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  return <section aria-labelledby="companies-title" ref={panelRef} className={`relative px-4 py-3 ${card}`}>
    <div className="flex items-center gap-3">
      <h2 id="companies-title" className="flex shrink-0 items-center gap-2 text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300" aria-hidden="true"><Building2 className="h-4 w-4" /></span>
        <span className="hidden sm:inline">Companies</span>
      </h2>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 pr-8 [mask-image:linear-gradient(90deg,black_calc(100%-48px),transparent)] [scrollbar-width:none]">
          {loading && !companies.length && Array.from({ length: 7 }, (_, index) => <span key={index} className="h-8 w-28 shrink-0 animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.06]" />)}
          {!loading && !companies.length && <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Company filters appear once published problems carry company tags or interview reports.</p>}
          {visible.map(({ company, count }) => <CompanyChip key={company} company={company} count={count} selected={selected === company} onSelect={onSelect} />)}
        </div>
      </div>
      {companies.length > 0 && <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="companies-panel"
        className={`inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#e4e7ec] px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-[#f6f7f9] dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.05] ${focusRing}`}>
        All {companies.length}<ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>}
    </div>

    {open && <div id="companies-panel" className={`absolute inset-x-0 top-full z-30 mt-2 p-4 shadow-[0_24px_48px_-24px_rgba(16,24,40,0.35)] ${card}`}>
      <div className="flex items-center gap-2">
        <label className="relative block flex-1">
          <span className="sr-only">Search companies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies" className={`w-full pl-9 pr-9 ${fieldBase}`} />
          {loading && <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
        </label>
        {selected && <button type="button" onClick={() => onSelect(selected)} className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-medium text-slate-600 hover:bg-[#f3f4f6] dark:text-zinc-300 dark:hover:bg-white/[0.06] ${focusRing}`}><X className="h-3.5 w-3.5" aria-hidden="true" />Clear</button>}
      </div>
      <div className="mt-3 flex max-h-72 flex-wrap gap-2 overflow-y-auto">
        {matches.map(({ company, count }) => <CompanyChip key={company} company={company} count={count} selected={selected === company} onSelect={(name) => { onSelect(name); setOpen(false); }} />)}
        {!matches.length && <p className="py-4 text-[12.5px] text-slate-500 dark:text-zinc-400">No company matches “{query}”.</p>}
      </div>
    </div>}
  </section>;
}
