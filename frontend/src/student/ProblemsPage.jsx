import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Circle, Code2, LoaderCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { formatPercent } from '../admin/compiler/compilerUtils';
import { buildTagsParam, PROBLEM_SORT_OPTIONS, resolveProblemSort } from './problemUtils';

const difficultyStyles = {
  Easy: 'text-emerald-600 dark:text-emerald-400',
  Medium: 'text-amber-600 dark:text-amber-400',
  Hard: 'text-rose-600 dark:text-rose-400',
};

function ProblemsSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" aria-label="Loading problems">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-gray-800"><div className="h-4 w-44 animate-pulse rounded bg-slate-200 dark:bg-gray-700" /></div>
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="grid grid-cols-[28px_minmax(0,1fr)_80px] items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 dark:border-gray-800 md:grid-cols-[36px_minmax(0,1fr)_110px_90px]">
          <div className="h-4 w-4 animate-pulse rounded-full bg-slate-200 dark:bg-gray-700" />
          <div><div className="h-4 w-2/5 animate-pulse rounded bg-slate-200 dark:bg-gray-700" /><div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-slate-100 dark:bg-gray-800" /></div>
          <div className="h-4 w-14 animate-pulse rounded bg-slate-100 dark:bg-gray-800" />
          <div className="hidden h-4 w-12 animate-pulse rounded bg-slate-100 dark:bg-gray-800 md:block" />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  if (String(status).toLowerCase() === 'solved') {
    return (
      <span className="inline-flex min-w-[78px] items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
        Solved
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-[86px] items-center justify-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-300">
      <Circle className="h-3 w-3" aria-hidden="true" />
      Unsolved
    </span>
  );
}

export default function ProblemsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const topicRailRef = useRef(null);
  const navigationTimerRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [sortValue, setSortValue] = useState(PROBLEM_SORT_OPTIONS[0].value);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openingProblemId, setOpeningProblemId] = useState('');
  const [response, setResponse] = useState({
    problems: [],
    pagination: { page: 1, pages: 1, total: 0 },
    filters: { availableTags: [], tagCounts: [] },
  });
  const deferredSearch = useDeferredValue(searchQuery);
  const resolvedSort = useMemo(() => resolveProblemSort(sortValue), [sortValue]);

  useEffect(() => () => window.clearTimeout(navigationTimerRef.current), []);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, difficulty, resolvedSort.sortBy, resolvedSort.sortOrder, selectedTags]);

  useEffect(() => {
    let isMounted = true;
    const loadProblems = async () => {
      try {
        setLoading(true);
        const result = await api.listStudentProblems({
          search: deferredSearch,
          difficulty,
          tags: buildTagsParam(selectedTags),
          sortBy: resolvedSort.sortBy,
          sortOrder: resolvedSort.sortOrder,
          page,
          limit: 15,
        });
        if (isMounted) setResponse(result);
      } catch (error) {
        if (isMounted) toast.error(error.message || 'Failed to load problems.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadProblems();
    return () => { isMounted = false; };
  }, [deferredSearch, difficulty, page, resolvedSort.sortBy, resolvedSort.sortOrder, selectedTags, toast]);

  const problems = response.problems || [];
  const pagination = response.pagination || { page: 1, pages: 1, total: 0 };
  const topicCounts = useMemo(() => {
    if (response.filters?.tagCounts?.length) return response.filters.tagCounts;
    return (response.filters?.availableTags || []).map((tag) => ({ tag, count: null }));
  }, [response.filters]);
  const totalProblems = response.filters?.totalProblems ?? pagination.total ?? 0;
  const isInitialLoading = loading && problems.length === 0;
  const hasFilters = Boolean(searchQuery || difficulty || selectedTags.length);

  const selectTopic = (tag) => setSelectedTags((previous) => (previous[0] === tag ? [] : [tag]));
  const clearFilters = () => { setSearchQuery(''); setDifficulty(''); setSelectedTags([]); };
  const scrollTopics = (direction) => topicRailRef.current?.scrollBy({ left: direction * 420, behavior: 'smooth' });
  const openProblem = (problem) => {
    if (openingProblemId) return;
    setOpeningProblemId(problem._id);
    navigationTimerRef.current = window.setTimeout(() => navigate(`/problems/${problem._id}`), 180);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 px-3 pb-10 pt-4 font-['Manrope'] dark:bg-gray-950 sm:px-5">
      <main className="mx-auto w-full max-w-[1380px]">
        <header data-page-header className="border-b border-slate-200 bg-slate-50/95 pb-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm"><Code2 className="h-5 w-5" /></span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">Coding problems</h1>
                <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-gray-800 dark:text-gray-300">{totalProblems}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">Choose a topic and start solving.</p>
            </div>
          </div>
        </header>

        <section className="relative border-b border-slate-200 py-4 dark:border-gray-800" aria-label="Problem topics">
          <button type="button" onClick={() => scrollTopics(-1)} aria-label="Scroll topics left" className="absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><ChevronLeft className="h-4 w-4" /></button>
          <div ref={topicRailRef} className="flex gap-2 overflow-x-auto px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button type="button" onClick={() => setSelectedTags([])} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${selectedTags.length === 0 ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:text-sky-300'}`}>All topics <span className="ml-1.5 opacity-65">{totalProblems}</span></button>
            {topicCounts.map(({ tag, count }) => {
              const active = selectedTags.includes(tag);
              return <button key={tag} type="button" onClick={() => selectTopic(tag)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${active ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-300'}`}>{tag}{count !== null ? <span className="ml-1.5 text-slate-400 dark:text-gray-500">{count}</span> : null}</button>;
            })}
          </div>
          <button type="button" onClick={() => scrollTopics(1)} aria-label="Scroll topics right" className="absolute right-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><ChevronRight className="h-4 w-4" /></button>
        </section>

        <section className="py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
              <label className="relative block w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search problems" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-sky-900/30" />
                {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-gray-200"><X className="h-4 w-4" /></button>}
              </label>
              <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
                {['', 'Easy', 'Medium', 'Hard'].map((value) => <button key={value || 'all'} type="button" onClick={() => setDifficulty(value)} className={`h-8 rounded-lg px-3 text-xs font-semibold transition ${difficulty === value ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-sky-50 hover:text-sky-700 dark:text-gray-400 dark:hover:bg-sky-950/30 dark:hover:text-sky-300'}`}>{value || 'All'}</button>)}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              {hasFilters && <button type="button" onClick={clearFilters} className="h-9 px-2 text-xs font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400">Clear filters</button>}
              <div className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select value={sortValue} onChange={(event) => setSortValue(event.target.value)} aria-label="Sort problems" className="h-10 max-w-[220px] appearance-none rounded-xl border border-slate-200 bg-white py-0 pl-9 pr-8 text-xs font-semibold text-slate-600 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{PROBLEM_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              </div>
            </div>
          </div>
        </section>

        {isInitialLoading ? <ProblemsSkeleton /> : (
          <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900" aria-busy={loading}>
            {loading && <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-sky-100 dark:bg-sky-950"><div className="h-full w-1/3 animate-pulse bg-sky-500" /></div>}
            {problems.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-gray-800"><Search className="h-5 w-5" /></div>
                <h2 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">No matching problems</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Change the topic, difficulty, or search term.</p>
                {hasFilters && <button type="button" onClick={clearFilters} className="mt-4 text-xs font-semibold text-sky-600 dark:text-sky-400">Reset all filters</button>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table data-no-serial className="w-full min-w-[820px] table-fixed text-left">
                  <thead className="border-b border-slate-200 bg-sky-50/70 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:border-gray-800 dark:bg-sky-950/20 dark:text-gray-400">
                    <tr><th className="w-16 px-4 py-3">S.No.</th><th className="w-32 px-3 py-3">Status</th><th className="px-3 py-3">Problem</th><th className="w-32 px-3 py-3">Acceptance</th><th className="w-28 px-3 py-3">Difficulty</th><th className="w-48 px-3 py-3">Languages</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {problems.map((problem, index) => {
                      const opening = openingProblemId === problem._id;
                      return (
                        <tr key={problem._id} onClick={() => openProblem(problem)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openProblem(problem); } }} tabIndex={openingProblemId ? -1 : 0} aria-disabled={Boolean(openingProblemId)} className={`cursor-pointer outline-none transition focus-visible:bg-sky-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 dark:focus-visible:bg-sky-950/30 ${opening ? 'bg-sky-50 dark:bg-sky-950/30' : index % 2 ? 'bg-slate-50/45 hover:bg-sky-50/70 dark:bg-gray-950/20 dark:hover:bg-sky-950/20' : 'hover:bg-sky-50/70 dark:hover:bg-sky-950/20'}`}>
                          <td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-500 dark:text-gray-400">{((pagination.page - 1) * 15) + index + 1}</td>
                          <td className="px-3 py-3"><StatusBadge status={problem.studentStatus || 'Unsolved'} /></td>
                          <td className="px-3 py-3">
                            <div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{problem.title}</span>{opening && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-sky-600" />}</div>
                            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">{(problem.tags || []).slice(0, 4).map((tag) => <span key={tag} className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-gray-800 dark:text-gray-400">{tag}</span>)}{(problem.tags || []).length === 0 && <span className="text-[10px] text-slate-400">General</span>}</div>
                          </td>
                          <td className="px-3 py-3 text-xs font-medium tabular-nums text-slate-500 dark:text-gray-400">{formatPercent(problem.acceptanceRate)}</td>
                          <td className={`px-3 py-3 text-xs font-semibold ${difficultyStyles[problem.difficulty] || 'text-slate-500'}`}>{problem.difficulty || '—'}</td>
                          <td className="truncate px-3 py-3 text-xs text-slate-500 dark:text-gray-400">{(problem.supportedLanguages || []).map((language) => language.charAt(0).toUpperCase() + language.slice(1)).join(', ') || 'Not specified'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-400">
              <span>{pagination.total || 0} problem{pagination.total === 1 ? '' : 's'} · Page {pagination.page} of {pagination.pages}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPage((previous) => Math.max(previous - 1, 1))} disabled={loading || pagination.page <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:hover:text-white" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                <span className="min-w-16 text-center font-semibold text-slate-700 dark:text-gray-200">{pagination.page} / {pagination.pages}</span>
                <button type="button" onClick={() => setPage((previous) => Math.min(previous + 1, pagination.pages))} disabled={loading || pagination.page >= pagination.pages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:hover:text-white" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </footer>
          </section>
        )}

        {openingProblemId && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]" role="status" aria-live="assertive">
            <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-slate-950 px-5 py-4 text-white shadow-2xl dark:bg-gray-900"><LoaderCircle className="h-5 w-5 animate-spin text-sky-400" /><div><p className="text-sm font-bold">Opening coding workspace</p><p className="mt-0.5 text-xs text-slate-300">Loading problem and your saved code…</p></div></div>
          </div>
        )}
      </main>
    </div>
  );
}
