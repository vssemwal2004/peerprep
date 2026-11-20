import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LayoutGrid, List, Search, X } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import CompanyTile from './CompanyTile';
import { PanelTitle, TowerGlyph } from './prepMockGlyphs';
import {
  ALPHABET, AZ_INDEX_MIN, DIRECTORY_CHUNK, FILTERS, SORTS, filterCompanies, filterCounts, groupByLetter,
  letterOf, lettersPresent, sortCompanies,
} from './prepMockModel';
import { card, focusRing } from '../dashboard/ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const VIEW_KEY = 'peerprep:prep-mock:view';
const letterId = (letter) => `pmock-letter-${letter === '#' ? 'num' : letter}`;

function readView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function saveView(view) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* private mode or blocked storage: the choice just is not remembered */
  }
}

const segment = (active) => `rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition ${focusRing} ${active
  ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white'
  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`;

function CompanyList({ companies, query, view }) {
  if (view === 'list') {
    return (
      <ul className={`divide-y divide-[#eef0f3] overflow-hidden dark:divide-white/[0.06] ${card}`}>
        {companies.map((company) => <CompanyTile key={company.key} company={company} query={query} view="list" />)}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(212px,1fr))] sm:gap-2.5">
      {companies.map((company) => <CompanyTile key={company.key} company={company} query={query} view="grid" />)}
    </ul>
  );
}

/**
 * Every company with mocks for the student, built for hundreds: search (company or role, matches
 * marked), status filters, sort, grid or list (remembered), an A–Z index and "Show more" in chunks.
 */
export default function CompanyDirectory({ companies }) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('open');
  const [view, setView] = useState(readView);
  const [limit, setLimit] = useState(DIRECTORY_CHUNK);
  const [jumpTo, setJumpTo] = useState(null);

  const chipCounts = useMemo(() => filterCounts(companies), [companies]);
  const filtered = useMemo(() => filterCompanies(companies, { query, filter }), [companies, query, filter]);
  const sorted = useMemo(() => sortCompanies(filtered, sort), [filtered, sort]);
  const shown = sorted.slice(0, limit);
  const present = useMemo(() => lettersPresent(filtered), [filtered]);
  const showIndex = companies.length >= AZ_INDEX_MIN;

  // After a letter jump has rendered (A–Z sort, enough rows shown), bring its heading into view.
  useEffect(() => {
    if (!jumpTo) return;
    const heading = document.getElementById(letterId(jumpTo.letter));
    if (heading) {
      heading.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      heading.focus({ preventScroll: true });
    }
    setJumpTo(null);
  }, [jumpTo, reduceMotion]);

  const reset = (apply) => { apply(); setLimit(DIRECTORY_CHUNK); };
  const jump = (letter) => {
    const index = sortCompanies(filtered, 'az').findIndex((company) => letterOf(company) === letter);
    if (index < 0) return;
    setSort('az');
    setLimit((current) => Math.max(current, index + DIRECTORY_CHUNK));
    setJumpTo({ letter });
  };
  const chooseView = (next) => { setView(next); saveView(next); };
  const left = sorted.length - shown.length;

  return (
    <section aria-labelledby="pmock-directory-title" className="min-w-0">
      <PanelTitle id="pmock-directory-title" glyph={TowerGlyph} tone="violet" title="All companies"
        subtitle={`${companies.length} ${companies.length === 1 ? 'company has' : 'companies have'} mocks for you`}
        info={<GuideInfo step="pmock-companies" />} />

      <div className="mt-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1" data-guide="pmock-search">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => reset(() => setQuery(event.target.value))}
            placeholder="Search a company or role" aria-label="Search a company or role"
            className="h-10 w-full rounded-xl border border-[#e6e7eb] bg-white pl-10 pr-9 text-[13.5px] text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-[#242424] dark:text-white [&::-webkit-search-cancel-button]:hidden" />
          {query && (
            <button type="button" onClick={() => reset(() => setQuery(''))} aria-label="Clear search"
              className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200 ${focusRing}`}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="flex min-w-0 items-center gap-2" data-guide="pmock-sort">
          <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-xl bg-slate-100 p-0.5 lg:flex-none dark:bg-white/[0.06]" role="radiogroup" aria-label="Sort companies">
            {SORTS.map((item) => (
              <button key={item.key} type="button" role="radio" aria-checked={sort === item.key} onClick={() => reset(() => setSort(item.key))}
                className={`shrink-0 ${segment(sort === item.key)}`}>{item.label}</button>
            ))}
          </div>
          <div className="flex shrink-0 gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => chooseView('grid')} className={`${segment(view === 'grid')} !px-2`}><LayoutGrid className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => chooseView('list')} className={`${segment(view === 'list')} !px-2`}><List className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter companies" data-guide="pmock-filters">
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <button key={option.key} type="button" aria-pressed={active} onClick={() => reset(() => setFilter(option.key))}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${focusRing} ${active
                ? 'border-slate-900 bg-slate-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-[#e6e7eb] bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/[0.08] dark:bg-[#242424] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white'}`}>
              {option.key === 'open' && <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-emerald-500'}`} aria-hidden="true" />}
              {option.label}
              <span className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${active ? 'bg-white/20 dark:bg-black/10' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}>{chipCounts[option.key]}</span>
            </button>
          );
        })}
      </div>

      {showIndex && (
        <nav aria-label="Jump to letter" data-guide="pmock-az"
          className="z-20 -mx-1 mt-3 flex gap-0.5 overflow-x-auto rounded-xl border border-[#e9eaee] bg-white/90 p-1 backdrop-blur lg:sticky lg:top-[73px] lg:mx-0 lg:flex-wrap lg:justify-between dark:border-white/[0.07] dark:bg-[#242424]/90">
          {ALPHABET.map((letter) => {
            const enabled = present.has(letter);
            return (
              <button key={letter} type="button" disabled={!enabled} onClick={() => jump(letter)}
                aria-label={letter === '#' ? 'Companies starting with a number or symbol' : `Companies starting with ${letter}`}
                className={`flex h-7 min-w-[26px] shrink-0 items-center justify-center rounded-md text-[11.5px] font-semibold tabular-nums transition-colors ${focusRing} ${enabled
                  ? 'text-slate-700 hover:bg-violet-50 hover:text-violet-700 dark:text-zinc-200 dark:hover:bg-violet-500/15 dark:hover:text-violet-200'
                  : 'cursor-default text-slate-300 dark:text-zinc-600'}`}>
                {letter}
              </button>
            );
          })}
        </nav>
      )}

      <p className="mt-4 mb-2.5 text-[12px] text-slate-500 dark:text-zinc-400" aria-live="polite">
        {sorted.length === companies.length ? `${companies.length} companies` : `${sorted.length} of ${companies.length} companies`}
        {left > 0 ? ` · showing ${shown.length}` : ''}
      </p>

      <div data-guide="pmock-companies">
        {!sorted.length ? (
          <div role="status" className={`px-6 py-10 text-center ${card}`}>
            <p className="text-[14px] font-semibold text-slate-800 dark:text-zinc-100">No companies match</p>
            <p className="mt-1 text-[12.5px] text-slate-500 dark:text-zinc-400">{query ? `Nothing for “${query.trim()}”. Try a shorter name or another role.` : 'Try another filter.'}</p>
            <button type="button" onClick={() => reset(() => { setQuery(''); setFilter('all'); })}
              className={`mt-4 inline-flex h-9 items-center rounded-xl border border-[#e6e7eb] px-3.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/[0.04] ${focusRing}`}>Show all companies</button>
          </div>
        ) : sort === 'az' ? (
          <div className="space-y-5">
            {groupByLetter(shown).map((group) => (
              <section key={group.letter} aria-labelledby={letterId(group.letter)}>
                <h3 id={letterId(group.letter)} tabIndex={-1} className="mb-2 flex scroll-mt-[132px] items-center gap-3 outline-none">
                  <span className="flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-violet-50 px-1.5 text-[13px] font-bold text-violet-700 ring-1 ring-inset ring-violet-100 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/15">{group.letter}</span>
                  <span className="h-px flex-1 bg-[#e6e7eb] dark:bg-white/[0.08]" aria-hidden="true" />
                  <span className="text-[11.5px] text-slate-400 dark:text-zinc-500">{group.companies.length}</span>
                </h3>
                <CompanyList companies={group.companies} query={query} view={view} />
              </section>
            ))}
          </div>
        ) : <CompanyList companies={shown} query={query} view={view} />}
      </div>

      {left > 0 && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => setLimit((current) => current + DIRECTORY_CHUNK)}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border border-[#e6e7eb] bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-900 dark:border-white/[0.08] dark:bg-[#242424] dark:text-zinc-200 dark:hover:border-white/20 ${focusRing}`}>
            Show {Math.min(DIRECTORY_CHUNK, left)} more<span className="font-medium text-slate-400 dark:text-zinc-500">· {left} left</span><ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
