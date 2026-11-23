import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness, ChevronDown, LayoutDashboard, Search, X } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import CompanyLogo from './CompanyLogo';
import { CompletionRing, Highlight, LiveDot } from './prepMockUi';
import {
  ALPHABET, AZ_INDEX_MIN, DIRECTORY_CHUNK, FILTERS, SORTS, filterCounts, groupByLetter, highlightParts,
  letterOf, lettersPresent, railEntries, sortCompanies, summarize,
} from './prepMockModel';
import { focusRing } from '../dashboard/ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const companyCount = (count) => `${count} ${count === 1 ? 'company' : 'companies'}`;
const letterId = (letter) => `pmock-rail-letter-${letter === '#' ? 'num' : letter}`;
const roleLink = (company, role) => `${company.path}?role=${encodeURIComponent(role.name)}`;
const rowFocus = `${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`;

function describe(company) {
  const { counts, roles } = company;
  return `${company.name}: ${plural(roles.length, 'role')}, ${plural(counts.total, 'mock')}${counts.open ? `, ${counts.open} open now` : ''}, ${counts.completed} of ${counts.total} completed`;
}

// Short chip labels so the four filters fit one row of the 300px bar.
const FILTER_LABELS = { all: 'All', open: 'Open', upcoming: 'Upcoming', completed: 'Done' };

/** Open / upcoming chips under a company's name (only the ones that apply). */
function CompanyChips({ counts }) {
  if (!counts.open && !counts.upcoming) return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1">
      {counts.open > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><LiveDot />{counts.open} open</span>}
      {counts.upcoming > 0 && <span className="rounded-md bg-sky-50 px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{counts.upcoming} upcoming</span>}
    </span>
  );
}

function CompanyRow({ entry, query, active, activeRoleKey, open, onToggle }) {
  const { company, roles, matched } = entry;
  const roleShown = active && activeRoleKey;
  return (
    <li className="py-1.5">
      <div className={`flex items-start gap-1 rounded-xl pr-1 transition-colors ${active && !roleShown ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25' : active ? 'bg-[#f6f7f9] dark:bg-white/[0.04]' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.03]'}`}>
        <Link to={company.path} data-guide="pmock-company" aria-label={describe(company)} aria-current={active && !roleShown ? 'page' : undefined}
          className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl py-2 pl-2.5 text-left ${rowFocus}`}>
          <CompanyLogo name={company.name} logo={company.logo} size="tile" />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[13.5px] font-semibold leading-5 ${active ? 'text-violet-900 dark:text-violet-100' : 'text-slate-900 dark:text-zinc-50'}`}>
              <Highlight parts={highlightParts(company.name, query)} />
            </span>
            <span className="block truncate text-[11.5px] text-slate-500 dark:text-zinc-400">
              <b className="font-semibold text-slate-700 dark:text-zinc-200">{company.roles.length}</b> {company.roles.length === 1 ? 'role' : 'roles'} · <b className="font-semibold text-slate-700 dark:text-zinc-200">{company.counts.total}</b> {company.counts.total === 1 ? 'mock' : 'mocks'}
            </span>
            <CompanyChips counts={company.counts} />
          </span>
          <span className="mt-1 flex w-9 shrink-0 flex-col items-center gap-0.5" title={`${company.counts.completed} of ${company.counts.total} done`}>
            <CompletionRing done={company.counts.completed} total={company.counts.total} size={24} />
            <span className="text-[10px] font-semibold tabular-nums text-slate-500 dark:text-zinc-400">{company.counts.completed}/{company.counts.total}</span>
          </span>
        </Link>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} ${company.name} roles`}
          className={`mt-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-white/[0.08] dark:hover:text-zinc-200 ${focusRing}`}>
          <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul aria-label={`${company.name} roles`} className="my-1 ml-[1.85rem] space-y-px border-l border-[#e6e7eb] pl-2 dark:border-white/[0.08]">
          {roles.map((role) => {
            const current = active && activeRoleKey === role.key;
            return (
              <li key={role.key}>
                <Link to={roleLink(company, role)} aria-current={current ? 'page' : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors ${focusRing} ${current ? 'bg-violet-600 font-semibold text-white' : 'text-slate-600 hover:bg-[#f1f2f4] hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}>
                  <BriefcaseBusiness className={`h-3.5 w-3.5 shrink-0 ${current ? '' : 'opacity-50'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{matched ? <Highlight parts={highlightParts(role.name, query)} /> : role.name}</span>
                  {role.counts.open > 0 && <LiveDot className={current ? 'opacity-90' : ''} />}
                  <span className={`shrink-0 tabular-nums ${current ? 'text-white/80' : 'text-slate-400 dark:text-zinc-500'}`} title={`${role.counts.completed} of ${role.counts.total} done`}>{role.counts.completed}/{role.counts.total}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * The left bar of Prep Mock (same structure as the admin's): Overview, then every company with its roles
 * nested under it. Built for hundreds: search (company, role or mock), status filters, sort, an A–Z index
 * and "Show more" in chunks. Desktop: sticky with its own scroll; phones: a plain list in the page.
 */
export default function CompanyRail({ companies, selectedKey = '', selectedRoleKey = '' }) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('open');
  const [limit, setLimit] = useState(DIRECTORY_CHUNK);
  const [expanded, setExpanded] = useState(() => new Set());
  const [jumpTo, setJumpTo] = useState(null);

  const totals = useMemo(() => summarize(companies), [companies]);
  const chipCounts = useMemo(() => filterCounts(companies), [companies]);
  const entries = useMemo(() => railEntries(companies, { query, filter, sort }), [companies, query, filter, sort]);
  const present = useMemo(() => lettersPresent(entries.map((entry) => entry.company)), [entries]);
  const shown = entries.slice(0, limit);
  const left = entries.length - shown.length;
  const showIndex = companies.length >= AZ_INDEX_MIN;

  useEffect(() => {
    if (!jumpTo) return;
    const heading = document.getElementById(letterId(jumpTo.letter));
    if (heading) {
      heading.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      heading.focus({ preventScroll: true });
    }
    setJumpTo(null);
  }, [jumpTo, reduceMotion]);

  // The chosen company is open by default; "-key" remembers that the student closed it by hand.
  const isOpen = (key, matched) => matched || expanded.has(key) || (key === selectedKey && !expanded.has(`-${key}`));
  const toggle = (key) => setExpanded((current) => {
    const next = new Set(current);
    if (isOpen(key, false)) { next.delete(key); next.add(`-${key}`); } else { next.add(key); next.delete(`-${key}`); }
    return next;
  });
  const reset = (apply) => { apply(); setLimit(DIRECTORY_CHUNK); };
  const jump = (letter) => {
    const index = sortCompanies(entries.map((entry) => entry.company), 'az').findIndex((company) => letterOf(company) === letter);
    if (index < 0) return;
    setSort('az');
    setLimit((current) => Math.max(current, index + DIRECTORY_CHUNK));
    setJumpTo({ letter });
  };

  const rows = (list) => list.map((entry) => (
    <CompanyRow key={entry.company.key} entry={entry} query={query} active={entry.company.key === selectedKey} activeRoleKey={selectedRoleKey}
      open={isOpen(entry.company.key, entry.matched)} onToggle={() => toggle(entry.company.key)} />
  ));
  const groups = sort === 'az'
    ? groupByLetter(shown.map((entry) => entry.company)).map((group) => ({ letter: group.letter, entries: shown.filter((entry) => group.companies.includes(entry.company)) }))
    : null;

  return (
    <aside aria-label="Companies" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
      <div className="shrink-0 space-y-2.5 border-b border-[#eef0f3] px-3 pb-3 pt-3.5 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">
            Companies <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums tracking-normal text-slate-700 dark:bg-white/[0.08] dark:text-zinc-200">{companies.length}</span>
            <GuideInfo step="pmock-companies" />
          </h2>
          <label data-guide="pmock-sort" className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500">
            <span className="sr-only sm:not-sr-only">Sort</span>
            <select value={sort} onChange={(event) => reset(() => setSort(event.target.value))} aria-label="Sort companies"
              className={`h-7 max-w-[8.5rem] rounded-md border-0 bg-transparent py-0 pl-1 pr-6 text-[11.5px] font-semibold text-slate-600 dark:bg-transparent dark:text-zinc-300 ${focusRing}`}>
              {SORTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <label className="relative block" data-guide="pmock-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => reset(() => setQuery(event.target.value))} placeholder="Company, role or mock" aria-label="Search a company, role or mock"
            className="h-9 w-full rounded-xl border border-[#e6e7eb] bg-[#f8f9fb] pl-9 pr-8 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white [&::-webkit-search-cancel-button]:hidden" />
          {query && (
            <button type="button" onClick={() => reset(() => setQuery(''))} aria-label="Clear search"
              className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 ${focusRing}`}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="flex gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.05]" role="group" aria-label="Filter companies" data-guide="pmock-filters">
          {FILTERS.map((option) => {
            const active = filter === option.key;
            return (
              <button key={option.key} type="button" aria-pressed={active} onClick={() => reset(() => setFilter(option.key))}
                aria-label={`${option.label}: ${companyCount(chipCounts[option.key])}`}
                className={`inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-[10px] px-1 text-[11.5px] font-semibold transition-colors ${focusRing} ${active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'}`}>
                {option.key === 'open' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />}
                {FILTER_LABELS[option.key] || option.label}
                <span className={`tabular-nums ${active ? 'text-slate-400 dark:text-zinc-400' : 'text-slate-400 dark:text-zinc-500'}`}>{chipCounts[option.key]}</span>
              </button>
            );
          })}
        </div>
        {showIndex && (
          <nav aria-label="Jump to letter" data-guide="pmock-az" className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-px">
            {ALPHABET.map((letter) => {
              const enabled = present.has(letter);
              return (
                <button key={letter} type="button" disabled={!enabled} onClick={() => jump(letter)}
                  aria-label={letter === '#' ? 'Companies starting with a number or symbol' : `Companies starting with ${letter}`}
                  className={`flex h-[22px] items-center justify-center rounded-md text-[10.5px] font-semibold tabular-nums transition-colors ${focusRing} ${enabled
                    ? 'text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:text-zinc-300 dark:hover:bg-violet-500/15 dark:hover:text-violet-200'
                    : 'cursor-default text-slate-300 dark:text-zinc-600'}`}>
                  {letter}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      <div className="min-h-0 flex-1 px-2 py-2 lg:overflow-y-auto lg:overscroll-contain [scrollbar-width:thin]">
        <Link to="/student/prep-mock" aria-current={!selectedKey ? 'page' : undefined}
          className={`mb-1.5 flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${rowFocus} ${!selectedKey ? 'bg-violet-50 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-400/25' : 'hover:bg-[#f6f7f9] dark:hover:bg-white/[0.03]'}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_18px_-10px_rgba(109,40,217,0.9)]"><LayoutDashboard className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">Overview</span>
            <span className="block truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{companyCount(totals.companies)} ·{plural(totals.mocks, 'mock')} · {totals.open} open</span>
          </span>
        </Link>

        <p className="px-2 pb-1 pt-1 text-[11px] text-slate-400 dark:text-zinc-500" aria-live="polite">
          {entries.length === companies.length ? companyCount(companies.length) :`${entries.length} of ${companies.length} companies`}
          {left > 0 ? ` · showing ${shown.length}` : ''}
        </p>

        <div data-guide="pmock-companies">
          {!entries.length ? (
            <div role="status" className="px-3 py-6 text-center">
              <p className="text-[12.5px] font-semibold text-slate-700 dark:text-zinc-200">No companies match</p>
              <p className="mt-1 text-[11.5px] text-slate-500 dark:text-zinc-400">{query ? `Nothing for “${query.trim()}”.` : 'Try another filter.'}</p>
              <button type="button" onClick={() => reset(() => { setQuery(''); setFilter('all'); })}
                className={`mt-3 inline-flex h-8 items-center rounded-lg border border-[#e6e7eb] px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/[0.04] ${focusRing}`}>Show all companies</button>
            </div>
          ) : groups ? groups.map((group) => (
            <section key={group.letter} aria-labelledby={letterId(group.letter)}>
              <h3 id={letterId(group.letter)} tabIndex={-1} className="flex scroll-mt-2 items-center gap-2 px-2 pb-0.5 pt-2 outline-none">
                <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">{group.letter}</span>
                <span className="h-px flex-1 bg-[#eef0f3] dark:bg-white/[0.06]" aria-hidden="true" />
              </h3>
              <ul className="divide-y divide-[#eef0f3] dark:divide-white/[0.06]">{rows(group.entries)}</ul>
            </section>
          )) : (
            <ul className="divide-y divide-[#eef0f3] border-t border-[#eef0f3] dark:divide-white/[0.06] dark:border-white/[0.06]">{rows(shown)}</ul>
          )}
        </div>

        {left > 0 && (
          <button type="button" onClick={() => setLimit((current) => current + DIRECTORY_CHUNK)}
            className={`mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#e6e7eb] text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/[0.04] ${focusRing}`}>
            Show {Math.min(DIRECTORY_CHUNK, left)} more<span className="font-medium text-slate-400 dark:text-zinc-500">· {left} left</span>
          </button>
        )}
      </div>
    </aside>
  );
}
