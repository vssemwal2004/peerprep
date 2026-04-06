import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, Circle, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { DifficultyBadge, EmptyState, LoadingPanel, SectionCard } from '../admin/compiler/CompilerUi';
import { formatPercent } from '../admin/compiler/compilerUtils';
import {
  buildTagsParam,
  PROBLEM_SORT_OPTIONS,
  resolveProblemSort,
  studentStatusBadgeClass,
} from './problemUtils';

function StudentStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${studentStatusBadgeClass(status)}`}>
      {status === 'Solved' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {status}
    </span>
  );
}

export default function ProblemsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const tagMenuRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [sortValue, setSortValue] = useState(PROBLEM_SORT_OPTIONS[0].value);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [response, setResponse] = useState({
    problems: [],
    pagination: { page: 1, pages: 1, total: 0 },
    filters: { availableTags: [] },
  });
  const deferredSearch = useDeferredValue(searchQuery);
  const resolvedSort = useMemo(() => resolveProblemSort(sortValue), [sortValue]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tagMenuOpen && tagMenuRef.current && !tagMenuRef.current.contains(event.target)) {
        setTagMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tagMenuOpen]);

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
          limit: 10,
        });

        if (isMounted) {
          setResponse(result);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(error.message || 'Failed to load problems.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProblems();
    return () => {
      isMounted = false;
    };
  }, [deferredSearch, difficulty, page, resolvedSort.sortBy, resolvedSort.sortOrder, selectedTags, toast]);

  const problems = response.problems || [];
  const pagination = response.pagination || { page: 1, pages: 1, total: 0 };
  const availableTags = response.filters?.availableTags || [];

  const toggleTag = (tag) => {
    setSelectedTags((previous) => (
      previous.includes(tag)
        ? previous.filter((item) => item !== tag)
        : [...previous, tag]
    ));
  };

  const clearTagFilters = () => {
    setSelectedTags([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 pb-8 pt-20">
        <div className="mx-auto max-w-7xl">
          <LoadingPanel label="Loading problem set..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-8 pt-20">
      <div className="mx-auto max-w-7xl space-y-6">
        <SectionCard
          title="Problems"
          subtitle="Browse coding challenges, filter by difficulty and topic, and jump straight into the student compiler workspace."
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_200px_220px_220px]">
            <label className="relative block">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by title or tag"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
            </label>

            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
            >
              <option value="">All difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>

            <div ref={tagMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setTagMenuOpen((previous) => !previous)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  {selectedTags.length > 0 ? `${selectedTags.length} tags selected` : 'Filter tags'}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${tagMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {tagMenuOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {availableTags.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-gray-400">No tags available yet.</p>
                    ) : (
                      availableTags.map((tag) => {
                        const checked = selectedTags.includes(tag);
                        return (
                          <label key={tag} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${checked ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTag(tag)}
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span>{tag}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {selectedTags.length > 0 && (
                    <button
                      type="button"
                      onClick={clearTagFilters}
                      className="mt-3 text-xs font-semibold text-sky-600 transition-colors hover:text-sky-500 dark:text-sky-400"
                    >
                      Clear tag filters
                    </button>
                  )}
                </div>
              )}
            </div>

            <select
              value={sortValue}
              onChange={(event) => setSortValue(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
            >
              {PROBLEM_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {selectedTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard subtitle="Active problems are listed below. Click any row to open the full coding workspace.">
          {problems.length === 0 ? (
            <EmptyState
              title="No problems match the current filters"
              description="Try changing your search term, difficulty, or tag filters."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
                  <thead className="bg-slate-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Title</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Acceptance</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Difficulty</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Tags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {problems.map((problem) => (
                      <tr
                        key={problem._id}
                        onClick={() => navigate(`/problems/${problem._id}`)}
                        className="cursor-pointer transition-colors duration-300 hover:bg-slate-50 dark:hover:bg-gray-800/60"
                      >
                        <td className="px-4 py-4">
                          <StudentStatusBadge status={problem.studentStatus || 'Unsolved'} />
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-gray-100">{problem.title}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                              {(problem.supportedLanguages || []).map((language) => language.charAt(0).toUpperCase() + language.slice(1)).join(', ')}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-700 dark:text-gray-200">
                          {formatPercent(problem.acceptanceRate)}
                        </td>
                        <td className="px-4 py-4">
                          <DifficultyBadge difficulty={problem.difficulty} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {(problem.tags || []).slice(0, 4).map((tag) => (
                              <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-gray-400">
            <p>{pagination.total || 0} active problems</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((previous) => Math.max(previous - 1, 1))}
                disabled={pagination.page <= 1}
                className="rounded-xl border border-slate-200 px-3 py-2 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.pages}</span>
              <button
                type="button"
                onClick={() => setPage((previous) => Math.min(previous + 1, pagination.pages))}
                disabled={pagination.page >= pagination.pages}
                className="rounded-xl border border-slate-200 px-3 py-2 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
