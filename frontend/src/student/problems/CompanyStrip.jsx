import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { BriefcaseBusiness, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';
import CompanyLogo from '../prepMock/CompanyLogo';
import { brandTile, card, fieldBase, focusRing, logoFor } from './problemsUi';
import GuideInfo from '../../guide/platform/GuideInfo';

function CompanyChip({ company, count, logo, selected, onSelect }) {
  return <button type="button" aria-pressed={selected} onClick={() => onSelect(company)}
    className={`group inline-flex shrink-0 items-center gap-2 rounded-full border py-[3px] pl-[3px] pr-3 text-[13px] font-medium transition-[background-color,border-color,box-shadow] ${focusRing} ${selected
      ? 'border-violet-600 bg-violet-600 text-white shadow-[0_8px_18px_-12px_rgba(109,40,217,0.9)]'
      : 'border-[#e9eaee] bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/60 hover:text-violet-800 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-violet-400/30 dark:hover:bg-violet-500/10 dark:hover:text-violet-100'}`}>
    <CompanyLogo name={company} logo={logo} size="chip" className={selected ? 'border-white/40' : ''} />
    {company}
    <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-violet-100 group-hover:text-violet-700 dark:bg-white/[0.07] dark:text-zinc-400 dark:group-hover:bg-violet-500/15 dark:group-hover:text-violet-200'}`}>{count}</span>
  </button>;
}

/** Companies that asked these questions, from interview reports and problem tags, with their logos. */
export default function CompanyStrip({ companies, logos, loading, selected, onSelect }) {
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

  return <section aria-labelledby="companies-title" ref={panelRef} data-guide="pc-companies" className={`relative px-3 py-2.5 ${card}`}>
    <div className="flex items-center gap-3">
      <h2 id="companies-title" className="flex shrink-0 items-center gap-2 text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">
        <span className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${brandTile}`} aria-hidden="true"><BriefcaseBusiness className="h-4 w-4" /></span>
        <span className="hidden sm:inline">Companies</span>
        <GuideInfo step="pc-companies" />
      </h2>
      <span className="hidden h-6 w-px shrink-0 bg-[#eef0f3] dark:bg-white/[0.08] sm:block" aria-hidden="true" />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 pr-8 [mask-image:linear-gradient(90deg,black_calc(100%-48px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {loading && !companies.length && Array.from({ length: 7 }, (_, index) => <span key={index} className="h-8 w-28 shrink-0 animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.06]" />)}
          {!loading && !companies.length && <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Company filters appear once published problems carry company tags or interview reports.</p>}
          {visible.map(({ company, count }) => <CompanyChip key={company} company={company} count={count} logo={logoFor(logos, company)} selected={selected === company} onSelect={onSelect} />)}
        </div>
      </div>
      {companies.length > 0 && <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="companies-panel"
        className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border px-3 text-[12.5px] font-semibold transition-colors ${open ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-200' : 'border-[#e6e7eb] text-slate-700 hover:bg-[#f6f7f9] dark:border-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/[0.05]'} ${focusRing}`}>
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
      <div className="mt-3 flex max-h-72 flex-wrap gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {matches.map(({ company, count }) => <CompanyChip key={company} company={company} count={count} logo={logoFor(logos, company)} selected={selected === company} onSelect={(name) => { onSelect(name); setOpen(false); }} />)}
        {!matches.length && <p className="py-4 text-[12.5px] text-slate-500 dark:text-zinc-400">No company matches “{query}”.</p>}
      </div>
    </div>}
  </section>;
}
