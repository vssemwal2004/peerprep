import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { queueProblemSelection } from './assessmentProblemSelectionStore';
import { ArrowLeft, CheckSquare, Search } from 'lucide-react';

const statusOptions = [
  { label: 'All', value: '' },
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'Draft' },
];

const difficultyOptions = [
  { label: 'All', value: '' },
  { label: 'Easy', value: 'Easy' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Hard', value: 'Hard' },
];

export default function SelectProblemFromLibrary() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const assessmentKey = params.get('assessment') || 'new';
  const sectionIndex = Number(params.get('section') || 0);
  const returnTo = params.get('return') || '/admin/assessment/create';

  const [loading, setLoading] = useState(true);
  const [problems, setProblems] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    difficulty: '',
    status: '',
    tags: '',
  });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadProblems = async () => {
    setLoading(true);
    try {
      const data = await api.listCompilerProblems({
        search: filters.search,
        difficulty: filters.difficulty,
        tags: filters.tags,
        status: filters.status,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
        page,
        limit: 12,
      });
      setProblems(data.problems || []);
      setAvailableTags(data.filters?.availableTags || []);
      setPages(data.pagination?.pages || 1);
    } catch (error) {
      toast.error(error.message || 'Failed to load problems.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProblems();
  }, [filters, page]);

  const toggleSelection = (problemId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) {
        next.delete(problemId);
      } else {
        next.add(problemId);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const selectedProblems = problems.filter((problem) => selectedIds.has(problem._id))
      .filter((problem) => problem.status === 'published' && problem.previewValidated);
    if (selectedProblems.length === 0) {
      toast.error('Select at least one published and validated problem.');
      return;
    }
    queueProblemSelection(assessmentKey, {
      sectionIndex,
      problems: selectedProblems,
    });
    toast.success('Selected problems added to assessment.');
    navigate(returnTo);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Select Coding Problems</h1>
              <p className="text-xs text-slate-500 dark:text-gray-400">Choose published + validated problems from the library.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddSelected}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
          >
            <CheckSquare className="h-4 w-4" />
            Add Selected ({selectedIds.size})
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="text-xs text-slate-500 dark:text-gray-400">Search by title</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Search problems"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Difficulty</label>
            <select
              value={filters.difficulty}
              onChange={(event) => setFilters((prev) => ({ ...prev, difficulty: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {difficultyOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {statusOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-4">
            <label className="text-xs text-slate-500 dark:text-gray-400">Tags</label>
            <select
              value={filters.tags}
              onChange={(event) => setFilters((prev) => ({ ...prev, tags: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="">All Tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="grid grid-cols-[40px_1.6fr_0.8fr_1fr_1fr_1fr_0.7fr_0.9fr] gap-2 border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:border-gray-700">
            <div />
            <div>Title</div>
            <div>Difficulty</div>
            <div>Tags</div>
            <div>Status</div>
            <div>Validation</div>
            <div>Languages</div>
            <div>Updated</div>
          </div>

          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-gray-400">Loading problems...</div>
          ) : problems.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-gray-400">No problems found.</div>
          ) : (
            problems.map((problem) => {
              const isSelectable = problem.status === 'published' && problem.previewValidated;
              return (
                <div key={problem._id} className="grid grid-cols-[40px_1.6fr_0.8fr_1fr_1fr_1fr_0.7fr_0.9fr] gap-2 border-b border-slate-100 px-4 py-3 text-sm text-slate-600 last:border-b-0 dark:border-gray-800 dark:text-gray-300">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(problem._id)}
                      onChange={() => toggleSelection(problem._id)}
                      disabled={!isSelectable}
                      title={isSelectable ? '' : 'Not validated'}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 disabled:opacity-50"
                    />
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-gray-100">{problem.title || 'Untitled'}</div>
                  <div>{problem.difficulty}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400">{(problem.tags || []).join(', ') || '-'}</div>
                  <div>{problem.status === 'published' ? 'Published' : 'Draft'}</div>
                  <div className={problem.previewValidated ? 'text-emerald-600' : 'text-amber-600'}>
                    {problem.previewValidated ? 'Validated' : 'Not validated'}
                  </div>
                  <div>{problem.supportedLanguages?.length || 0}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400">{problem.updatedAt ? new Date(problem.updatedAt).toLocaleDateString() : '-'}</div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            Previous
          </button>
          <div>Page {page} of {pages}</div>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, pages))}
            disabled={page >= pages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

