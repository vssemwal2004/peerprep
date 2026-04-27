import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MoreVertical, Search, Trash2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { formatDate, formatPercent } from './compilerUtils';
import { DifficultyBadge, EmptyState, LoadingPanel, ProblemStatusBadge, SectionCard } from './CompilerUi';

export default function ProblemManagement() {
  const navigate = useNavigate();
  const toast = useToast();
  const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');
  const [visibility, setVisibility] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState({ problems: [], pagination: { page: 1, pages: 1, total: 0 } });
  const deferredSearch = useDeferredValue(searchQuery);
  const menuRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);

  const closeMenu = () => setOpenMenu(null);

  useEffect(() => {
    if (!openMenu) return undefined;

    const handlePointerDown = (event) => {
      const button = event.target.closest(`[data-actions-menu-button="${openMenu.id}"]`);
      if (button) return;
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      closeMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    const handleScrollOrResize = () => {
      closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openMenu]);

  useEffect(() => {
    let isMounted = true;
    const loadProblems = async () => {
      try {
        setLoading(true);
        const result = await api.listCompilerProblems({
          search: deferredSearch,
          difficulty,
          status,
          visibility,
          sortBy,
          sortOrder,
          page,
          limit: 8,
        });
        if (isMounted) setResponse(result);
      } catch (error) {
        toast.error(error.message || 'Failed to load problems.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadProblems();
    return () => {
      isMounted = false;
    };
  }, [deferredSearch, difficulty, page, sortBy, sortOrder, status, visibility, toast]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, difficulty, sortBy, sortOrder, status, visibility]);

  const handleDelete = async (problemId) => {
    const confirmed = window.confirm('Delete this problem and its related submissions?');
    if (!confirmed) return;
    try {
      await api.deleteCompilerProblem(problemId);
      toast.success('Problem deleted successfully.');
      const refreshed = await api.listCompilerProblems({ search: deferredSearch, difficulty, status, visibility, sortBy, sortOrder, page, limit: 8 });
      setResponse(refreshed);
    } catch (error) {
      toast.error(error.message || 'Failed to delete problem.');
    }
  };

  const handleToggleStatus = async (problem) => {
    const normalized = String(problem.status || '').toLowerCase();
    const nextStatus = normalized === 'published' || normalized === 'active' ? 'draft' : 'published';
    try {
      await api.updateCompilerProblemStatus(problem._id, nextStatus);
      toast.success(`Problem moved to ${nextStatus}.`);
      const refreshed = await api.listCompilerProblems({ search: deferredSearch, difficulty, status, visibility, sortBy, sortOrder, page, limit: 8 });
      setResponse(refreshed);
    } catch (error) {
      toast.error(error.message || 'Failed to update problem status.');
    }
  };

  if (loading) {
    return <LoadingPanel label="Loading problems..." />;
  }

  const problems = response.problems || [];
  const pagination = response.pagination || { page: 1, pages: 1, total: 0 };

  const openMenuFor = (problemId, event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenMenu((previous) => {
      if (previous?.id === problemId) return null;
      return {
        id: problemId,
        top: rect.bottom + 8,
        left: rect.right,
      };
    });
  };

  const menuItemClassName = 'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors';

  return (
    <SectionCard
      title="Problem Management"
      subtitle="Professional management table for authored problems, publishing controls, and preview access."
      action={(
        <button type="button" onClick={() => navigate(`${rolePrefix}/compiler/create`)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500">
          Create Problem
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    >
      <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,1fr))]">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search problems" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
        </label>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"><option value="">All difficulties</option><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option></select>
        <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"><option value="">All visibility</option><option value="public">Public</option><option value="assessment">Assessment-only</option><option value="private">Private</option></select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"><option value="updatedAt">Recently updated</option><option value="createdAt">Recently created</option><option value="title">Title</option><option value="totalSubmissions">Submissions</option><option value="acceptanceRate">Acceptance rate</option></select>
        <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"><option value="desc">Descending</option><option value="asc">Ascending</option></select>
      </div>

      {problems.length === 0 ? (
        <EmptyState title="No problems match the current filters" description="Try adjusting the search query or filters to surface authored problems." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
              <thead className="bg-slate-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Difficulty</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Acceptance Rate</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Total Submissions</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Created At</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Visibility</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {problems.map((problem) => (
                  <tr key={problem._id} className="hover:bg-slate-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-gray-100">{problem.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{problem.supportedLanguages.join(', ')}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4"><DifficultyBadge difficulty={problem.difficulty} /></td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatPercent(problem.acceptanceRate)}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{problem.totalSubmissions}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatDate(problem.createdAt)}</td>
                    <td className="px-4 py-4"><ProblemStatusBadge status={problem.status} /></td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${problem.visibility === 'assessment' ? 'border border-purple-300 text-purple-700 bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:bg-purple-900/20' : problem.visibility === 'private' ? 'border border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-900/20' : 'border border-slate-200 text-slate-600 bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:bg-gray-800'}`}>
                        {problem.visibility === 'assessment' ? 'Assessment' : problem.visibility === 'private' ? 'Private' : 'Public'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          data-actions-menu-button={problem._id}
                          onClick={(event) => openMenuFor(problem._id, event)}
                          aria-haspopup="menu"
                          aria-expanded={openMenu?.id === problem._id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                          title="Actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {openMenu?.id === problem._id ? (
                          <div className="fixed z-50" style={{ top: openMenu.top, left: openMenu.left }}>
                            <div
                              ref={menuRef}
                              role="menu"
                              className="w-52 -translate-x-full rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_46px_rgba(15,23,42,0.16)] dark:border-gray-700 dark:bg-gray-900"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu();
                                  navigate(`${rolePrefix}/compiler/${problem._id}/edit`);
                                }}
                                className={`${menuItemClassName} text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800`}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu();
                                  navigate(`${rolePrefix}/compiler/${problem._id}/preview`);
                                }}
                                className={`${menuItemClassName} text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800`}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu();
                                  handleToggleStatus(problem);
                                }}
                                className={`${menuItemClassName} text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800`}
                              >
                                {(String(problem.status || '').toLowerCase() === 'published' || String(problem.status || '').toLowerCase() === 'active') ? 'Unpublish' : 'Publish'}
                              </button>
                              <div className="my-2 h-px bg-slate-200 dark:bg-gray-700" />
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu();
                                  handleDelete(problem._id);
                                }}
                                className={`${menuItemClassName} text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20`}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </span>
                              </button>
                            </div>
                          </div>
                        ) : null}
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
        <p>{pagination.total || 0} problems total</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((previous) => Math.max(previous - 1, 1))} disabled={pagination.page <= 1} className="rounded-xl border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700">Previous</button>
          <span>Page {pagination.page} of {pagination.pages}</span>
          <button type="button" onClick={() => setPage((previous) => Math.min(previous + 1, pagination.pages))} disabled={pagination.page >= pagination.pages} className="rounded-xl border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700">Next</button>
        </div>
      </div>
    </SectionCard>
  );
}











