import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Search, X } from 'lucide-react';
import CompanyLogo from '../../prepMock/CompanyLogo';

/**
 * A company mock's Company: picked from the companies students see on Prep Coding (same names and
 * question counts), searchable, most-asked first. companies: [{ company, count, logo? }].
 */
export default function CompanyPicker({ id, value, companies = [], loading = false, error = '', onChange }) {
  const listId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const matches = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    return needle ? companies.filter(({ company }) => company.toLowerCase().includes(needle)) : companies;
  }, [companies, deferred]);
  const selected = companies.find(({ company }) => company.toLowerCase() === String(value || '').toLowerCase());

  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (company) => { onChange(company); setOpen(false); setQuery(''); };

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button id={id} type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } }}
        className={`flex h-11 w-full items-center gap-2.5 rounded-lg border bg-white px-2.5 text-left text-sm outline-none transition focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-100 dark:bg-gray-900 dark:focus-visible:ring-sky-950 ${open ? 'border-sky-400' : 'border-slate-200 hover:border-slate-300 dark:border-gray-700 dark:hover:border-gray-600'}`}>
        {value
          ? <CompanyLogo name={value} logo={selected?.logo} size="md" />
          : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-white/[0.06]" aria-hidden="true"><Building2 className="h-4 w-4" /></span>}
        <span className={`min-w-0 flex-1 truncate ${value ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-gray-400'}`}>{value || 'Select company'}</span>
        {selected && <span className="shrink-0 text-xs tabular-nums text-slate-400">{selected.count.toLocaleString()} questions</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_24px_48px_-24px_rgba(16,24,40,0.35)] dark:border-gray-700 dark:bg-gray-900">
          <label className="relative block">
            <span className="sr-only">Search companies</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${companies.length.toLocaleString()} companies`}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); document.getElementById(id)?.focus(); }
                if (event.key === 'Enter') { event.preventDefault(); if (matches[0]) choose(matches[0].company); }
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-sky-950" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <p className="mt-2 text-[11.5px] text-slate-500 dark:text-gray-400">The same companies students see on Prep Coding, with the number of practice questions tagged for each.</p>
          <ul id={listId} role="listbox" aria-label="Companies" className="mt-2 flex max-h-72 flex-wrap content-start gap-2 overflow-y-auto overscroll-contain pr-1">
            {loading && !companies.length && Array.from({ length: 12 }, (_, index) => <li key={index} className="h-8 w-28 animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.06]" />)}
            {matches.map(({ company, count, logo }) => {
              const active = company.toLowerCase() === String(value || '').toLowerCase();
              return (
                <li key={company} role="option" aria-selected={active}>
                  <button type="button" onClick={() => choose(company)}
                    className={`inline-flex h-8 items-center gap-2 rounded-full border pl-1 pr-3 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active
                      ? 'border-sky-500 bg-sky-50 font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-200'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300 hover:bg-sky-50/60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-white/[0.05]'}`}>
                    <CompanyLogo name={company} logo={logo} size="sm" round />{company}<span className="tabular-nums text-slate-400">{count.toLocaleString()}</span>
                    {active && <Check className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
            {!loading && !matches.length && <li className="w-full py-6 text-center text-sm text-slate-500">{error || (companies.length ? `No company matches “${query}”.` : 'No companies yet: they appear once practice questions carry company tags.')}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
