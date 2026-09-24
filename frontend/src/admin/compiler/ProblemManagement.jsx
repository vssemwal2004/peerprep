import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Eye, MoreVertical, Search, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { formatDate, formatPercent } from './compilerUtils';
import { DifficultyBadge, EmptyState, LoadingPanel, SectionCard } from './CompilerUi';

let previewModulePromise;
function preloadProblemPreview() {
  previewModulePromise ||= import('./AdminTestCompiler');
  return previewModulePromise;
}

function preloadProblemEditor() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return;
  void import('./MonacoCodeEditor');
}

function getProblemState(problem = {}) {
  const status = String(problem.status || '').toLowerCase();
  if (status === 'draft') return { label: 'Draft', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300' };
  if (problem.visibility === 'private' || problem.visibility === 'assessment') return { label: 'Private', className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300' };
  return { label: 'Public', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' };
}

function getProblemStatement(problem = {}) {
  return problem.statement
    || problem.description
    || problem.problemStatement
    || problem.problemData?.statement
    || problem.problemDataSnapshot?.statement
    || problem.questionText
    || problem.title
    || 'No statement available.';
}

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
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, problem: null, nextVisibility: null });
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, problem: null, deleting: false });
  const [statementDialog, setStatementDialog] = useState({ isOpen: false, problem: null });

  const closeMenu = () => setOpenMenu(null);
  const closeConfirmDialog = () => setConfirmDialog({ isOpen: false, problem: null, nextVisibility: null });

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
    setDeleteDialog((previous) => ({ ...previous, deleting: true }));
    try {
      await api.deleteCompilerProblem(problemId);
      toast.success('Problem deleted successfully.');
      const refreshed = await api.listCompilerProblems({ search: deferredSearch, difficulty, status, visibility, sortBy, sortOrder, page, limit: 8 });
      setResponse(refreshed);
    } catch (error) {
      toast.error(error.message || 'Failed to delete problem.');
    } finally {
      setDeleteDialog({ isOpen: false, problem: null, deleting: false });
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

  const handleToggleVisibilityClick = (problem) => {
    const currentVisibility = problem.visibility || 'public';
    const nextVisibility = currentVisibility === 'public' ? 'assessment' : 'public';
    setConfirmDialog({ isOpen: true, problem, nextVisibility });
  };

  const confirmToggleVisibility = async () => {
    const { problem, nextVisibility } = confirmDialog;
    if (!problem) return;
    
    try {
      await api.updateCompilerProblemVisibility(problem._id, nextVisibility);
      toast.success(`Visibility changed to ${nextVisibility === 'public' ? 'Public' : 'Private'}.`);
      const refreshed = await api.listCompilerProblems({ search: deferredSearch, difficulty, status, visibility, sortBy, sortOrder, page, limit: 8 });
      setResponse(refreshed);
    } catch (error) {
      toast.error(error.message || 'Failed to update problem visibility.');
    } finally {
      closeConfirmDialog();
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
  const openProblemPreview = (problem) => {
    void preloadProblemPreview();
    preloadProblemEditor();
    navigate(
      `${rolePrefix}/library/coding/${problem._id}/preview`,
      { state: { returnTo: `${window.location.pathname}${window.location.search}` } },
    );
  };

  return (
    <SectionCard
      title="Problem Management"
      subtitle="Professional management table for authored problems, publishing controls, and preview access."
      action={(
        <button type="button" onClick={() => navigate(`${rolePrefix}/library/coding/create`)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500">
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
                  <th className="w-36 px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Question Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Difficulty</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Acceptance Rate</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Total Submissions</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Created At</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">State</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {problems.map((problem) => (
                  <tr
                    key={problem._id}
                    role="link"
                    tabIndex={0}
                    onPointerEnter={() => { void preloadProblemPreview(); }}
                    onFocus={() => { void preloadProblemPreview(); }}
                    onClick={() => openProblemPreview(problem)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openProblemPreview(problem);
                      }
                    }}
                    className="cursor-pointer hover:bg-sky-50/70 focus:bg-sky-50/70 focus:outline-none dark:hover:bg-gray-800/60 dark:focus:bg-gray-800/60"
                  >
                    <td className="px-4 py-4">
                      <div className="min-w-[280px] max-w-md">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="min-w-0 max-w-[calc(100%-4rem)] truncate font-semibold text-slate-800 dark:text-gray-100">{problem.title}</p>
                          <button type="button" onClick={(event) => { event.stopPropagation(); setStatementDialog({ isOpen: true, problem }); }} className="inline-flex h-[22px] shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 text-[11px] font-semibold leading-none text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">+ More</button>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{problem.supportedLanguages.join(', ')}</p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-700 dark:text-gray-200">Coding problem</td>
                    <td className="px-4 py-4"><DifficultyBadge difficulty={problem.difficulty} /></td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatPercent(problem.acceptanceRate)}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{problem.totalSubmissions}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{formatDate(problem.createdAt)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getProblemState(problem).className}`}>{getProblemState(problem).label}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); openProblemPreview(problem); }}
                          aria-label={`Preview ${problem.title}`}
                          title="Preview problem"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
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
                                  navigate(`${rolePrefix}/library/coding/${problem._id}/edit`);
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
                                  handleToggleStatus(problem);
                                }}
                                className={`${menuItemClassName} text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800`}
                              >
                                {(String(problem.status || '').toLowerCase() === 'published' || String(problem.status || '').toLowerCase() === 'active') ? 'Unpublish' : 'Publish'}
                              </button>
                              {problem.status === 'published' && <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu();
                                  handleToggleVisibilityClick(problem);
                                }}
                                className={`${menuItemClassName} text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800`}
                              >
                                {problem.visibility === 'public' ? 'Make private' : 'Make public'}
                              </button>}
                              <div className="my-2 h-px bg-slate-200 dark:bg-gray-700" />
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  closeMenu();
                                  setDeleteDialog({ isOpen: true, problem, deleting: false });
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

      {statementDialog.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setStatementDialog({ isOpen: false, problem: null })}>
          <section className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900" role="dialog" aria-modal="true" aria-label="Full coding problem statement" onClick={(event) => event.stopPropagation()}>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-gray-800">
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">Coding problem · Full statement</p><h3 className="mt-1 text-base font-bold text-slate-950 dark:text-white">{statementDialog.problem?.title}</h3></div>
              <button type="button" onClick={() => setStatementDialog({ isOpen: false, problem: null })} className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Close full statement"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-gray-200">{getProblemStatement(statementDialog.problem)}</p></div>
          </section>
        </div>
      )}

      {/* Confirmation Dialog for Visibility Toggle */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
              Change Visibility?
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">
              Are you sure you want to make this question <strong>{confirmDialog.nextVisibility === 'public' ? 'Public' : 'Private'}</strong>?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeConfirmDialog}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                No
              </button>
              <button
                type="button"
                onClick={confirmToggleVisibility}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDialog.isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-problem-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300"><AlertTriangle className="h-5 w-5" /></div>
            <h3 id="delete-problem-title" className="mt-4 text-lg font-bold text-slate-950 dark:text-white">Delete coding problem?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">
              <strong>{deleteDialog.problem?.title || 'This problem'}</strong> and its related submissions will be permanently removed. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={deleteDialog.deleting} onClick={() => setDeleteDialog({ isOpen: false, problem: null, deleting: false })} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
              <button type="button" disabled={deleteDialog.deleting} onClick={() => handleDelete(deleteDialog.problem?._id)} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"><Trash2 className="h-4 w-4" />{deleteDialog.deleting ? 'Deleting...' : 'Delete permanently'}</button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}











