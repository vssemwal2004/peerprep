import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Layers3, LoaderCircle, Search, Shapes, Shuffle, SlidersHorizontal, Star, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { buildTagsParam, PROBLEM_SORT_OPTIONS } from './problemUtils';
import QuestionPracticeDialog from './QuestionPracticeDialog';
import AnviHero from './problems/AnviHero';
import CompanyStrip from './problems/CompanyStrip';
import LibrarySidebar from './problems/LibrarySidebar';
import TopicsPanel from './problems/TopicsPanel';
import PracticeCalendar from './problems/PracticeCalendar';
import ProblemRow, { ProblemRowsSkeleton } from './problems/ProblemRow';
import { CreateListModal, SaveToListsModal } from './problems/ProblemListModals';
import { DIFFICULTY, fieldBase, focusRing, PAGE_SIZE_OPTIONS, problemStatus } from './problems/problemsUi';
import PracticePager from './problems/PracticePager';

const PAGE_SIZE_KEY = 'peerprep:prepcoding-page-size';
const SEARCH_DEBOUNCE_MS = 250;
const NO_ORDER = 2147483647;
const QUESTION_SORT_OPTIONS = [...PROBLEM_SORT_OPTIONS.filter((option) => !option.value.startsWith('acceptance')),
  { value: 'latest-asked', label: 'Recently Asked', sortBy: 'latestInterviewDate', sortOrder: 'desc' }];
const FAVORITES_KEY = 'peerprep:problem-favorites';
const DIFFICULTY_OPTIONS = ['', 'Easy', 'Medium', 'Hard'];

function readFavorites() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function readPageSize() {
  try {
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZE_OPTIONS.includes(stored) ? stored : PAGE_SIZE_OPTIONS[0];
  } catch { return PAGE_SIZE_OPTIONS[0]; }
}

/** The search chip names a question-number search as such; other searches show the typed text. */
function searchLabel(value) {
  const source = value.match(/^(?:lc|leetcode)\s*(?::\s*)?#?\s*(\d+)$/i);
  if (source) return source[1];
  const serial = value.match(/^(?:(?:pp|peerprep)\s*(?::\s*)?)?#?(\d+)$/i);
  return serial ? serial[1] : `“${value}”`;
}

function FilterChip({ label, onRemove }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 py-1 pl-2.5 pr-1 text-[12px] font-medium text-sky-800 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/15">
    {label}
    <button type="button" onClick={onRemove} aria-label={`Remove filter: ${label}`} className={`rounded-full p-0.5 hover:bg-sky-100 dark:hover:bg-sky-500/20 ${focusRing}`}><X className="h-3 w-3" /></button>
  </span>;
}

const SELECTION_TONES = {
  topic: { icon: Shapes, tile: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', wash: 'from-violet-50/80', label: 'Topic', noun: 'in this topic' },
  company: { icon: Building2, tile: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', wash: 'from-orange-50/80', label: 'Company', noun: 'tagged with this company' },
  list: { icon: Layers3, tile: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', wash: 'from-sky-50/80', label: 'Your list', noun: 'in this list' },
  favorites: { icon: Star, tile: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', wash: 'from-amber-50/80', label: 'Favorites', noun: 'saved as favorites' },
};

/** What the list is focused on, with the real size of that topic, company or list. */
function SelectionHeader({ kind, title, description, catalogCount, shownCount, filtered, loading, onClear }) {
  const tone = SELECTION_TONES[kind];
  const Icon = tone.icon;
  return <section aria-labelledby="selection-title" className={`mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-[#e9eaee] bg-gradient-to-r ${tone.wash} via-white to-white px-5 py-4 dark:border-white/[0.07] dark:from-white/[0.04] dark:via-[#232325] dark:to-[#232325]`}>
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.tile}`} aria-hidden="true"><Icon className="h-6 w-6" /></span>
    <div className="min-w-0 flex-1">
      <p className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{tone.label}</p>
      <h2 id="selection-title" className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-slate-950 dark:text-zinc-50" title={title}>{title}</h2>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">
        <strong className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{catalogCount == null ? '—' : Number(catalogCount).toLocaleString()}</strong> {catalogCount === 1 ? 'question' : 'questions'} {tone.noun}
        {filtered && !loading && <> · <strong className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{Number(shownCount).toLocaleString()}</strong> match your other filters</>}
        {description ? <> · {description}</> : null}
      </p>
    </div>
    <button type="button" onClick={onClear} className={`inline-flex items-center gap-1 rounded-xl border border-[#e4e7ec] bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-[#f6f7f9] dark:border-white/10 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/[0.05] ${focusRing}`}>
      <X className="h-3.5 w-3.5" aria-hidden="true" />{kind === 'topic' ? 'Clear topic' : kind === 'company' ? 'Clear company' : 'Back to all questions'}
    </button>
  </section>;
}

export default function ProblemsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const navigationTimerRef = useRef(null);
  const listTopRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [refreshQuestions, setRefreshQuestions] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [sortValue, setSortValue] = useState(PROBLEM_SORT_OPTIONS[0].value);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState(readPageSize);
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState(readFavorites);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [createListOpen, setCreateListOpen] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [listPickerProblem, setListPickerProblem] = useState(null);
  const [busyListId, setBusyListId] = useState('');
  const [openingProblemId, setOpeningProblemId] = useState('');
  const [companyCounts, setCompanyCounts] = useState([]);
  const [response, setResponse] = useState({ problems: [], pagination: { page: 1, pages: 1, total: 0 }, filters: { availableTags: [], tagCounts: [] } });
  const resolvedSort = useMemo(() => QUESTION_SORT_OPTIONS.find((option) => option.value === sortValue) || QUESTION_SORT_OPTIONS[0], [sortValue]);
  const selectedList = useMemo(() => lists.find((list) => list._id === selectedListId), [lists, selectedListId]);
  const filteredIds = showFavorites ? favorites : (selectedList ? selectedList.problemIds : null);
  // Any change to what is listed, or to the page size, starts again at page 1 without a request for the old page.
  const filterKey = JSON.stringify([debouncedSearch, difficulty, resolvedSort.value, selectedTags, selectedCompany, showFavorites, selectedListId, pageSize]);
  // Leaving a filter combination forgets its page, so returning to it also starts at page 1 (adjusted during render).
  if (pageState.key !== filterKey) setPageState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;

  useEffect(() => () => window.clearTimeout(navigationTimerRef.current), []);
  useEffect(() => { try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* favorites last for this visit */ } }, [favorites]);
  useEffect(() => { try { window.localStorage.setItem(PAGE_SIZE_KEY, String(pageSize)); } catch { /* the default size is used next time */ } }, [pageSize]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => { let mounted = true; api.listProblemLists().then((result) => { if (mounted) setLists(result.lists || []); }).catch((error) => { if (mounted) toast.error(error.message || 'Could not load your lists.'); }); return () => { mounted = false; }; }, [toast]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const result = await api.listPracticeQuestions({ search: debouncedSearch, difficulty, tags: buildTagsParam(selectedTags), companies: selectedCompany, ...(filteredIds ? { ids: filteredIds.join(',') || '__none__' } : {}), sortBy: resolvedSort.sortBy, sortOrder: resolvedSort.sortOrder, page, limit: pageSize });
        if (!mounted) return;
        const lastPage = result.pagination?.pages || 1;
        // A page past the end (the list shrank) moves to the new last page instead of showing nothing.
        if (!(result.questions || []).length && page > lastPage) { setPageState((previous) => ({ ...previous, page: lastPage })); return; }
        setResponse(result); setCompanyCounts(result.filters?.companyCounts || []); setCompaniesLoading(false);
      } catch (error) { if (mounted) toast.error(error.message || 'Failed to load questions.'); }
      finally { if (mounted) { setLoading(false); setCompaniesLoading(false); } }
    };
    load();
    return () => { mounted = false; };
  }, [debouncedSearch, difficulty, filteredIds, page, pageSize, refreshQuestions, resolvedSort.sortBy, resolvedSort.sortOrder, selectedTags, selectedCompany, toast]);

  const problems = (response.questions || []).map((question) => ({ ...question, title: question.questionText, listId: question.source === 'university' && question.questionType === 'coding' && question.sourceProblemId ? question.sourceProblemId : question._id }));
  const pagination = response.pagination || { page: 1, pages: 1, total: 0 };
  const topicCounts = response.filters?.tagCounts?.length ? response.filters.tagCounts : (response.filters?.availableTags || []).map((tag) => ({ tag, count: null }));
  const totalProblems = response.filters?.totalProblems ?? pagination.total ?? 0;
  // Before the first response the counts are unknown, not zero.
  const initialLoad = loading && !response.questions && response.filters?.totalProblems == null;
  const selectedTopic = selectedTags[0] || '';
  const solvedOnPage = problems.filter((problem) => problemStatus(problem) === 'solved').length;
  const view = showFavorites ? { kind: 'favorites' } : selectedListId ? { kind: 'list', id: selectedListId } : { kind: 'all' };

  const selectTopic = (tag) => setSelectedTags(tag ? [tag] : []);
  const selectCompany = (company) => {
    const next = selectedCompany === company ? '' : company;
    setSelectedCompany(next);
    setSortValue(next ? 'latest-asked' : 'sequence-asc');
  };
  const selectView = (next) => { setShowFavorites(next.kind === 'favorites'); setSelectedListId(next.kind === 'list' ? next.id : ''); };
  const clearSearch = () => { setSearchQuery(''); setDebouncedSearch(''); };
  const goToPage = (next) => {
    // The pager shows the previous response's pages while a new filter loads; ignore clicks until it lands.
    if (loading) return;
    setPageState({ key: filterKey, page: next });
    listTopRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  const clearFilters = () => { clearSearch(); setDifficulty(''); setSelectedTags([]); setSelectedCompany(''); setSortValue('sequence-asc'); selectView({ kind: 'all' }); };
  const toggleFavorite = (problemId) => setFavorites((previous) => previous.includes(String(problemId)) ? previous.filter((id) => id !== String(problemId)) : [...previous, String(problemId)]);
  const openProblem = (problem) => {
    if (openingProblemId) return;
    if (problem.questionType !== 'coding' || !problem.sourceProblemId) { setActiveQuestion(problem); return; }
    setOpeningProblemId(problem._id);
    const destination = problem.source === 'shared' ? problem._id : problem.sourceProblemId;
    navigationTimerRef.current = window.setTimeout(() => navigate(`/problems/${destination}`), 120);
  };
  const createList = async (payload) => { try { setCreatingList(true); const result = await api.createProblemList(payload); setLists((previous) => [result.list, ...previous]); selectView({ kind: 'list', id: result.list._id }); setCreateListOpen(false); toast.success('List created.'); } catch (error) { toast.error(error.message || 'Could not create the list.'); } finally { setCreatingList(false); } };
  const deleteList = async (list) => { if (!window.confirm(`Delete “${list.title}”?`)) return; try { setBusyListId(list._id); await api.deleteProblemList(list._id); setLists((previous) => previous.filter((item) => item._id !== list._id)); if (selectedListId === list._id) setSelectedListId(''); toast.success('List deleted.'); } catch (error) { toast.error(error.message || 'Could not delete the list.'); } finally { setBusyListId(''); } };
  const setMembership = async (list, included) => { if (!listPickerProblem) return; try { setBusyListId(list._id); const result = await api.setProblemListMembership(list._id, listPickerProblem.listId, included); setLists((previous) => previous.map((item) => item._id === result.list._id ? result.list : item)); toast.success(included ? `Saved to ${list.title}.` : `Removed from ${list.title}.`); } catch (error) { toast.error(error.message || 'Could not update the list.'); } finally { setBusyListId(''); } };

  const activeFilters = [
    showFavorites && { key: 'favorites', label: 'Favorites', clear: () => selectView({ kind: 'all' }) },
    selectedList && { key: 'list', label: `List: ${selectedList.title}`, clear: () => selectView({ kind: 'all' }) },
    selectedTopic && { key: 'topic', label: `Topic: ${selectedTopic}`, clear: () => selectTopic('') },
    selectedCompany && { key: 'company', label: `Company: ${selectedCompany}`, clear: () => selectCompany(selectedCompany) },
    difficulty && { key: 'difficulty', label: difficulty, clear: () => setDifficulty('') },
    debouncedSearch && { key: 'search', label: searchLabel(debouncedSearch), clear: clearSearch },
  ].filter(Boolean);
  // The header follows the most specific focus: a topic, then a company, then a saved list.
  const topicCount = topicCounts.find(({ tag }) => tag === selectedTopic)?.count;
  const companyCount = companyCounts.find(({ company }) => company === selectedCompany)?.count;
  const selection = selectedTopic ? { kind: 'topic', title: selectedTopic, catalogCount: topicCount, clear: () => selectTopic('') }
    : selectedCompany ? { kind: 'company', title: selectedCompany, catalogCount: companyCount, clear: () => selectCompany(selectedCompany) }
      : selectedList ? { kind: 'list', title: selectedList.title, description: selectedList.description, catalogCount: selectedList.problemCount ?? selectedList.problemIds?.length, clear: () => selectView({ kind: 'all' }) }
        : showFavorites ? { kind: 'favorites', title: 'Favorites', catalogCount: favorites.length, clear: () => selectView({ kind: 'all' }) } : null;
  const narrowed = selection && activeFilters.length > 1;

  return <div className="min-h-screen bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
    <main className="mx-auto w-full max-w-[1600px] space-y-3.5 px-3 pb-12 pt-4 sm:px-5 lg:px-8">
      <AnviHero />

      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-zinc-50">PrepCoding</h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">
            {initialLoad
              ? <span className="inline-block h-3 w-52 animate-pulse rounded bg-slate-200/80 align-middle dark:bg-white/[0.08]" aria-label="Loading counts" />
              : <>{Number(totalProblems).toLocaleString()} questions · {topicCounts.length.toLocaleString()} topics · {companyCounts.length.toLocaleString()} companies</>}
          </p>
        </div>
        <button type="button" disabled={!problems.length} onClick={() => openProblem(problems[Math.floor(Math.random() * problems.length)])}
          className={`group inline-flex items-center gap-2 rounded-xl border border-[#e4e7ec] bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-sky-200 hover:text-sky-700 disabled:opacity-40 dark:border-white/10 dark:bg-[#232325] dark:text-zinc-200 dark:hover:text-sky-300 ${focusRing}`}>
          <Shuffle className="h-4 w-4 transition-transform group-hover:rotate-12" aria-hidden="true" />Surprise me
        </button>
      </header>

      <CompanyStrip companies={companyCounts} loading={companiesLoading} selected={selectedCompany} onSelect={selectCompany} />

      <div className="grid gap-5 xl:grid-cols-[232px_minmax(0,1fr)_312px] xl:gap-6">
        <aside aria-label="Library" className="order-2 xl:order-1">
          <div className="xl:sticky xl:top-5">
            <LibrarySidebar view={view} totalProblems={totalProblems} favoritesCount={favorites.length} lists={lists} busyListId={busyListId}
              onView={selectView} onCreateList={() => setCreateListOpen(true)} onDeleteList={deleteList} />
          </div>
        </aside>

        <section ref={listTopRef} aria-labelledby="question-list-title" className="order-1 min-w-0 scroll-mt-4 xl:order-2">
          <h2 id="question-list-title" className="sr-only">Questions</h2>
          {selection && <SelectionHeader kind={selection.kind} title={selection.title} description={selection.description} catalogCount={selection.catalogCount}
            shownCount={pagination.total || 0} filtered={narrowed} loading={loading} onClear={selection.clear} />}
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-[220px] flex-1">
              <span className="sr-only">Search questions</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={100}
                placeholder="Search title, company, #topic or question no." title="Use 12 or #12 for a question number, or #two-pointers for a topic"
                className={`w-full pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden ${fieldBase}`} />
              {searchQuery && <button type="button" onClick={clearSearch} aria-label="Clear search" className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700 ${focusRing}`}><X className="h-4 w-4" /></button>}
            </label>
            <div role="radiogroup" aria-label="Difficulty" className="flex h-10 items-center rounded-xl border border-[#e4e7ec] bg-white p-1 dark:border-white/10 dark:bg-[#1f1f21]">
              {DIFFICULTY_OPTIONS.map((value) => {
                const active = difficulty === value;
                return <button key={value || 'all'} type="button" role="radio" aria-checked={active} onClick={() => setDifficulty(value)}
                  className={`inline-flex h-full items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors ${focusRing} ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-[#f3f4f6] dark:text-zinc-300 dark:hover:bg-white/[0.06]'}`}>
                  {value && <span className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY[value].dot}`} aria-hidden="true" />}{value || 'All'}
                </button>;
              })}
            </div>
            <label className="relative">
              <span className="sr-only">Sort questions</span>
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <select value={sortValue} onChange={(event) => setSortValue(event.target.value)} className={`pl-9 pr-8 ${fieldBase}`}>
                {QUESTION_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 flex min-h-[28px] flex-wrap items-center gap-2 text-[12.5px] text-slate-500 dark:text-zinc-400">
            <span><strong className="font-semibold tabular-nums text-slate-800 dark:text-zinc-100">{Number(pagination.total || 0).toLocaleString()}</strong> {pagination.total === 1 ? 'question' : 'questions'}</span>
            {activeFilters.map((filter) => <FilterChip key={filter.key} label={filter.label} onRemove={filter.clear} />)}
            {activeFilters.length > 1 && <button type="button" onClick={clearFilters} className={`rounded font-medium text-slate-600 underline-offset-2 hover:underline dark:text-zinc-300 ${focusRing}`}>Clear all</button>}
            {loading && problems.length > 0 && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-sky-500" aria-label="Updating" />}
          </div>

          <div className="mt-3">
            {loading && !problems.length ? <ProblemRowsSkeleton />
              : !problems.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-[#232325]">
                <Search className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
                <h3 className="mt-3 text-[14px] font-semibold">No matching questions</h3>
                <p className="mt-1 text-[12.5px] text-slate-500 dark:text-zinc-400">Try another topic, company, difficulty or list.</p>
                {activeFilters.length > 0 && <button type="button" onClick={clearFilters} className={`mt-4 rounded-xl bg-slate-900 px-4 py-2 text-[12.5px] font-medium text-white dark:bg-white dark:text-slate-900 ${focusRing}`}>Clear filters</button>}
              </div>
                : <>
                  {/* The current page stays in place, dimmed, until the next one arrives. */}
                  <ul aria-busy={loading} className={`space-y-2 transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`}>
                    {problems.map((problem, index) => <ProblemRow key={problem._id} problem={problem}
                      number={Number(problem.displayOrder) > 0 && Number(problem.displayOrder) < NO_ORDER ? Number(problem.displayOrder) : (((pagination.page || 1) - 1) * (pagination.limit || pageSize)) + index + 1}
                      saved={favorites.includes(String(problem.listId)) || lists.some((list) => list.problemIds.includes(String(problem.listId)))}
                      opening={openingProblemId === problem._id} onOpen={openProblem} onSave={setListPickerProblem} onCompany={selectCompany} />)}
                  </ul>
                  <PracticePager busy={loading} page={pagination.page || 1} pages={pagination.pages || 1} total={pagination.total || 0} limit={pagination.limit || pageSize} pageSize={pageSize}
                    shown={problems.length} solvedOnPage={solvedOnPage} onPage={goToPage} onPageSize={setPageSize} />
                </>}
          </div>
        </section>

        <aside aria-label="Practice calendar and topics" className="order-3 space-y-4">
          <PracticeCalendar />
          <TopicsPanel topics={topicCounts} selected={selectedTopic} onSelect={selectTopic} totalProblems={totalProblems} />
        </aside>
      </div>

      {activeQuestion && <QuestionPracticeDialog question={activeQuestion} onClose={() => setActiveQuestion(null)} onAnswered={() => setRefreshQuestions((value) => value + 1)} />}
      {createListOpen && <CreateListModal busy={creatingList} onClose={() => setCreateListOpen(false)} onCreate={createList} />}
      {listPickerProblem && <SaveToListsModal problem={listPickerProblem} favorites={favorites} lists={lists} busyListId={busyListId} onClose={() => setListPickerProblem(null)} onFavorite={() => toggleFavorite(listPickerProblem.listId)} onMembership={setMembership} onNewList={() => { setListPickerProblem(null); setCreateListOpen(true); }} />}
      {openingProblemId && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/25 backdrop-blur-[1px]"><div className="flex items-center gap-3 rounded-xl bg-slate-900 px-5 py-4 text-[13.5px] text-white shadow-xl"><LoaderCircle className="h-5 w-5 animate-spin text-sky-400" />Opening coding workspace</div></div>}
    </main>
  </div>;
}
