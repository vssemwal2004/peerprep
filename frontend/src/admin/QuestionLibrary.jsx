import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckSquare, Edit3, Eye, EyeOff, Globe2, Library, Lock, MoreVertical, Search, Tag, Trash2, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { queueQuestionSelection } from './assessment/assessmentProblemSelectionStore';
import { getLanguageLabel, getProblemSupportedLanguages } from './compiler/compilerUtils';

const TYPE_LABELS = {
  all: 'All Questions',
  coding: 'Coding Questions',
  mcq: 'MCQs',
  short: 'Short Questions',
  one_line: 'One-word Questions',
};

const SOURCE_LABELS = {
  assessment: 'Assessment',
  compiler: 'Compiler',
  manual: 'Manual',
};

function labelForType(type = '') {
  return TYPE_LABELS[type] || `${String(type || 'other').replace(/_/g, ' ')} Questions`;
}

function renderQuestionPreview(question = {}) {
  const data = question.questionData || {};

  if (question.questionType === 'mcq') {
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Options</div>
        <div className="grid gap-2">
          {(data.options || []).map((option, index) => (
            <div
              key={`${question._id}-option-${index}`}
              className={`rounded-xl border px-3 py-2 text-sm ${
                Number(data.correctOptionIndex) === index
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {option || '-'}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (question.questionType === 'coding') {
    const coding = data.problemDataSnapshot || data.coding || {};
    const supportedLanguages = getProblemSupportedLanguages(coding);
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Difficulty</div>
          <div className="mt-1 font-semibold text-slate-800 dark:text-white">{coding.difficulty || question.difficulty || '-'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Allowed Languages</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {supportedLanguages.length ? supportedLanguages.map((languageId) => (
              <span key={languageId} className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">
                {getLanguageLabel(languageId)}
              </span>
            )) : <span className="font-semibold text-amber-600 dark:text-amber-300">Not configured</span>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 md:col-span-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Statement</div>
          <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{coding.statement || coding.description || data.questionText || '-'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Expected Answer</div>
        <div className="mt-1 font-semibold text-slate-800 dark:text-white">{data.expectedAnswer || '-'}</div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Keywords</div>
        <div className="mt-1">{(data.keywords || []).join(', ') || '-'}</div>
      </div>
    </div>
  );
}

export default function QuestionLibrary() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectionMode = params.get('mode') === 'select';
  const assessmentKey = params.get('assessment') || 'new';
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const returnTo = params.get('return') || `${rolePrefix}/assessment/create`;
  const initialType = params.get('type') || 'all';
  const lockType = params.get('lockType') || '';

  const [filters, setFilters] = useState({
    type: lockType || initialType,
    search: '',
    tag: '',
    difficulty: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [availableDifficulties, setAvailableDifficulties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedMeta, setSelectedMeta] = useState({});
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tagsModal, setTagsModal] = useState({ open: false, questionText: '', tags: [] });
  const [actionMenuId, setActionMenuId] = useState('');
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [editModal, setEditModal] = useState({ open: false, question: null, saving: false });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirm', tone: 'default', onConfirm: null });
  const [reloadKey, setReloadKey] = useState(0);
  const rowSelectionActive = selectionMode || bulkSelecting;

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
      setPage(1);
    }, 160);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!lockType) return;
    setFilters((prev) => ({ ...prev, type: lockType }));
  }, [lockType]);

  useEffect(() => {
    let mounted = true;
    const loadQuestions = async () => {
      setLoading(true);
      try {
        const data = await api.listLibraryQuestions({
          type: filters.type === 'all' ? '' : filters.type,
          search: filters.search,
          tag: filters.tag,
          difficulty: filters.difficulty,
          page,
          limit: 20,
          skipCache: reloadKey > 0,
        });
        if (!mounted) return;
        setQuestions(data.questions || []);
        setCategories(data.filters?.categories || []);
        setAvailableTags(data.filters?.tags || []);
        setAvailableDifficulties(data.filters?.difficulties || []);
        setPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
      } catch (error) {
        if (!mounted) return;
        toast.error(error.message || 'Failed to load library.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadQuestions();
    return () => { mounted = false; };
  }, [filters, page, reloadKey, toast]);

  const categoryTabs = useMemo(() => {
    const coreTypes = ['mcq', 'one_line', 'short', 'coding'];
    const counts = new Map();
    (categories || []).forEach((entry) => {
      if (!entry?.type) return;
      counts.set(entry.type, Number(entry.count) || 0);
    });
    const allCount = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

    const coreTabs = coreTypes.map((type) => ({ type, count: counts.get(type) || 0 }));
    const extras = (categories || []).filter((entry) => entry?.type && !coreTypes.includes(entry.type));

    const allTabs = [{ type: 'all', count: allCount || total }, ...coreTabs, ...extras];
    return lockType ? allTabs.filter((entry) => entry.type === lockType) : allTabs;
  }, [categories, total, lockType]);

  const selectionSummary = useMemo(() => {
    return Object.values(selectedMeta).reduce((acc, item) => {
      const type = item.questionType || 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }, [selectedMeta]);

  const toggleSelection = (question) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(question._id)) next.delete(question._id);
      else next.add(question._id);
      return next;
    });
    setSelectedMeta((prev) => {
      const next = { ...prev };
      if (next[question._id]) delete next[question._id];
      else next[question._id] = question;
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedMeta({});
  };

  const toggleBulkSelecting = () => {
    setBulkMenuOpen(false);
    setBulkSelecting((current) => {
      if (current) clearSelection();
      return !current;
    });
  };

  const toggleSelectVisibleQuestions = () => {
    const allVisibleSelected = questions.length > 0 && questions.every((question) => selectedIds.has(question._id));
    if (allVisibleSelected) {
      clearSelection();
      return;
    }

    setSelectedIds(new Set(questions.map((question) => question._id)));
    setSelectedMeta(questions.reduce((acc, question) => {
      acc[question._id] = question;
      return acc;
    }, {}));
  };

  const openQuestion = async (questionId) => {
    setDetailLoading(true);
    try {
      const data = await api.getLibraryQuestion(questionId);
      setActiveQuestion(data.question || null);
    } catch (error) {
      toast.error(error.message || 'Failed to load question details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddSelected = async () => {
    if (!selectedIds.size) {
      toast.error('Select at least one question from the library.');
      return;
    }
    try {
      const data = await api.resolveLibraryQuestions(Array.from(selectedIds));
      queueQuestionSelection(assessmentKey, { questions: data.questions || [], lockType });
      toast.success('Selected library questions added to the assessment draft.');
      navigate(returnTo);
    } catch (error) {
      toast.error(error.message || 'Failed to add selected questions.');
    }
  };

  const openTagsModal = (questionText, tags = []) => {
    setTagsModal({ open: true, questionText, tags });
  };

  const refreshLibrary = () => {
    setReloadKey((value) => value + 1);
  };

  const startEditQuestion = (question) => {
    setActionMenuId('');

    if (question?.questionType === 'coding') {
      const problemId = question.sourceProblemId;
      if (problemId) {
        navigate(`${rolePrefix}/compiler/${problemId}/edit`, {
          state: { returnTo: `${rolePrefix}/library?type=coding` },
        });
        return;
      }

      toast.error('This coding question is from an assessment and has no linked compiler problem to edit.');
      return;
    }

    setEditModal({ open: true, question: { ...question }, saving: false });
  };

  const saveEditedQuestion = async (event) => {
    event.preventDefault();
    if (!editModal.question?._id || editModal.saving) return;

    const form = new FormData(event.currentTarget);
    const questionText = String(form.get('questionText') || '').trim();
    if (!questionText) {
      toast.error('Question text is required.');
      return;
    }

    setEditModal((prev) => ({ ...prev, saving: true }));
    try {
      await api.updateLibraryQuestion(editModal.question._id, {
        questionText,
        tags: String(form.get('tags') || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        difficulty: String(form.get('difficulty') || '').trim(),
        status: String(form.get('status') || 'published').trim(),
        visibility: String(form.get('visibility') || 'public').trim(),
      });
      toast.success('Question updated.');
      setEditModal({ open: false, question: null, saving: false });
      refreshLibrary();
    } catch (error) {
      toast.error(error.message || 'Failed to update question.');
      setEditModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const openConfirmDialog = ({ title, message, confirmLabel = 'Confirm', tone = 'default', onConfirm }) => {
    setConfirmDialog({ open: true, title, message, confirmLabel, tone, onConfirm });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({ open: false, title: '', message: '', confirmLabel: 'Confirm', tone: 'default', onConfirm: null });
  };

  const runConfirmedAction = async () => {
    const action = confirmDialog.onConfirm;
    closeConfirmDialog();
    if (typeof action === 'function') {
      await action();
    }
  };

  const toggleVisibility = async (question) => {
    setActionMenuId('');
    const nextVisibility = question.visibility === 'private' ? 'public' : 'private';
    openConfirmDialog({
      title: nextVisibility === 'public' ? 'Make Question Public?' : 'Make Question Private?',
      message: nextVisibility === 'public'
        ? 'This question will be visible wherever public library questions are available.'
        : 'This question will be private and hidden from shared public library use.',
      confirmLabel: nextVisibility === 'public' ? 'Make Public' : 'Make Private',
      onConfirm: async () => {
        try {
          await api.updateLibraryQuestion(question._id, { visibility: nextVisibility });
          toast.success(`Question is now ${nextVisibility}.`);
          refreshLibrary();
        } catch (error) {
          toast.error(error.message || 'Failed to update visibility.');
        }
      },
    });
  };

  const toggleHiddenStatus = async (question) => {
    setActionMenuId('');
    const nextStatus = question.status === 'hidden' ? 'published' : 'hidden';
    openConfirmDialog({
      title: nextStatus === 'hidden' ? 'Hide Question?' : 'Unhide Question?',
      message: nextStatus === 'hidden'
        ? 'This question will stay in the library, but it will be marked hidden for normal use.'
        : 'This question will become published again and available for normal use.',
      confirmLabel: nextStatus === 'hidden' ? 'Hide Question' : 'Unhide',
      onConfirm: async () => {
        try {
          await api.updateLibraryQuestion(question._id, { status: nextStatus });
          toast.success(nextStatus === 'hidden' ? 'Question hidden.' : 'Question published.');
          refreshLibrary();
        } catch (error) {
          toast.error(error.message || 'Failed to update question status.');
        }
      },
    });
  };

  const deleteQuestion = async (question) => {
    setActionMenuId('');
    openConfirmDialog({
      title: 'Delete Question?',
      message: `Delete "${question.questionText || 'this question'}" from the library? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteLibraryQuestion(question._id);
          toast.success('Question deleted.');
          setQuestions((prev) => prev.filter((item) => item._id !== question._id));
          refreshLibrary();
        } catch (error) {
          toast.error(error.message || 'Failed to delete question.');
        }
      },
    });
  };

  const requireSelectedQuestions = () => {
    if (!selectedIds.size) {
      toast.error('Select at least one question first.');
      return false;
    }
    return true;
  };

  const bulkUpdateQuestions = ({ title, message, confirmLabel, body, successMessage }) => {
    setBulkMenuOpen(false);
    if (!requireSelectedQuestions()) return;

    const ids = Array.from(selectedIds);
    openConfirmDialog({
      title,
      message,
      confirmLabel,
      onConfirm: async () => {
        try {
          await Promise.all(ids.map((id) => api.updateLibraryQuestion(id, body)));
          toast.success(successMessage);
          clearSelection();
          refreshLibrary();
        } catch (error) {
          toast.error(error.message || 'Failed to update selected questions.');
        }
      },
    });
  };

  const bulkDeleteQuestions = () => {
    setBulkMenuOpen(false);
    if (!requireSelectedQuestions()) return;

    const ids = Array.from(selectedIds);
    openConfirmDialog({
      title: 'Delete Selected Questions?',
      message: `Delete ${ids.length} selected question${ids.length === 1 ? '' : 's'} from the library? This cannot be undone.`,
      confirmLabel: 'Delete Selected',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await Promise.all(ids.map((id) => api.deleteLibraryQuestion(id)));
          toast.success('Selected questions deleted.');
          clearSelection();
          setQuestions((prev) => prev.filter((item) => !ids.includes(item._id)));
          refreshLibrary();
        } catch (error) {
          toast.error(error.message || 'Failed to delete selected questions.');
        }
      },
    });
  };

  const openImportQuestions = () => {
    setBulkMenuOpen(false);
    navigate(`${rolePrefix}/library/add-question`);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {selectionMode && (
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                {selectionMode ? 'Add Questions from Library' : 'Question Library'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Fast search and live syncing for assessment, compiler, MCQ, and written questions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectionMode ? (
              <button
                type="button"
                onClick={handleAddSelected}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
              >
                <CheckSquare className="h-4 w-4" />
                Add Selected ({selectedIds.size})
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleBulkSelecting}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                    bulkSelecting
                      ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <CheckSquare className="h-4 w-4" />
                  {bulkSelecting ? `Selected (${selectedIds.size})` : 'Select'}
                </button>
                <div className="relative">
                  <button
                    data-platform-menu-trigger
                    aria-expanded={bulkMenuOpen}
                    type="button"
                    onClick={() => setBulkMenuOpen((open) => !open)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label="Library bulk actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {bulkMenuOpen && (
                    <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-xs font-semibold text-slate-600 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                      <button type="button" onClick={openImportQuestions} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                        <Library className="h-3.5 w-3.5" /> Import / Add Questions
                      </button>
                      <button type="button" onClick={toggleBulkSelecting} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                        <CheckSquare className="h-3.5 w-3.5" /> {bulkSelecting ? 'Exit Selection' : 'Select Questions'}
                      </button>
                      <button type="button" onClick={toggleSelectVisibleQuestions} disabled={!bulkSelecting || !questions.length} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800">
                        <CheckSquare className="h-3.5 w-3.5" /> Select Visible Page
                      </button>
                      <button
                        type="button"
                        onClick={() => bulkUpdateQuestions({
                          title: 'Hide Selected Questions?',
                          message: `Hide ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} from normal use?`,
                          confirmLabel: 'Hide Selected',
                          body: { status: 'hidden' },
                          successMessage: 'Selected questions hidden.',
                        })}
                        disabled={!selectedIds.size}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
                      >
                        <EyeOff className="h-3.5 w-3.5" /> Hide Selected
                      </button>
                      <button
                        type="button"
                        onClick={() => bulkUpdateQuestions({
                          title: 'Make Selected Public?',
                          message: `Make ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} public?`,
                          confirmLabel: 'Make Public',
                          body: { visibility: 'public' },
                          successMessage: 'Selected questions are public.',
                        })}
                        disabled={!selectedIds.size}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
                      >
                        <Globe2 className="h-3.5 w-3.5" /> Make Public
                      </button>
                      <button
                        type="button"
                        onClick={() => bulkUpdateQuestions({
                          title: 'Make Selected Private?',
                          message: `Make ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} private?`,
                          confirmLabel: 'Make Private',
                          body: { visibility: 'private' },
                          successMessage: 'Selected questions are private.',
                        })}
                        disabled={!selectedIds.size}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
                      >
                        <Lock className="h-3.5 w-3.5" /> Make Private
                      </button>
                      <button type="button" onClick={bulkDeleteQuestions} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20">
                        <Trash2 className="h-3.5 w-3.5" /> Delete Selected
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {selectionMode && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <div className="font-semibold text-slate-800 dark:text-white">
              {lockType ? `${labelForType(lockType)} selection only.` : 'Mixed selection is enabled.'}
            </div>
            <div className="mt-1">
              {lockType ? `Only ${labelForType(lockType).toLowerCase()} are available in this flow. Other question types are hidden to keep section mapping clean.` : (Object.keys(selectionSummary).length
                ? Object.entries(selectionSummary).map(([type, count]) => `${count} ${labelForType(type)}`).join(' • ')
                : 'Choose questions across any category. They will be grouped by type automatically when added to the assessment.')}
            </div>
          </div>
        )}

        {!selectionMode && bulkSelecting && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/15 dark:text-sky-300">
            <div className="font-semibold">
              {selectedIds.size ? `${selectedIds.size} question${selectedIds.size === 1 ? '' : 's'} selected` : 'Select questions to run bulk actions.'}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleSelectVisibleQuestions} className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">
                {questions.length > 0 && questions.every((question) => selectedIds.has(question._id)) ? 'Clear Page' : 'Select Page'}
              </button>
              <button type="button" onClick={clearSelection} disabled={!selectedIds.size} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {categoryTabs.map((category) => {
            const active = filters.type === category.type || (!filters.type && category.type === 'all');
            return (
              <button
                key={category.type}
                type="button"
                onClick={() => {
                  setFilters((prev) => ({ ...prev, type: category.type }));
                  setPage(1);
                }}
                disabled={Boolean(lockType && category.type !== lockType)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {labelForType(category.type)} ({category.count || 0})
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_220px_220px]">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Search</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by question text, tag, answer, or topic"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Filter by Tag</label>
            <select
              value={filters.tag}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, tag: event.target.value }));
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="">All Tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Difficulty</label>
            <select
              value={filters.difficulty}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, difficulty: event.target.value }));
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="">All Levels</option>
              {availableDifficulties.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className={`grid gap-3 border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:border-gray-700 ${rowSelectionActive ? 'grid-cols-[42px_1.7fr_0.9fr_1.2fr_1fr_0.8fr]' : 'grid-cols-[1.9fr_0.8fr_1.15fr_1fr_0.75fr_80px]'}`}>
            {rowSelectionActive ? <div /> : null}
            <div>Question</div>
            <div>Type</div>
            <div>Question Tags / Topics</div>
            <div>Source</div>
            <div>Updated</div>
            {!rowSelectionActive ? <div className="text-right">Actions</div> : null}
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-gray-400">Loading library questions...</div>
          ) : questions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-gray-400">No questions matched the current filters.</div>
          ) : (
            questions.map((question) => (
              <div
                key={question._id}
                onClick={() => (bulkSelecting ? toggleSelection(question) : openQuestion(question._id))}
                className={`grid w-full cursor-pointer gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-600 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/60 ${rowSelectionActive ? 'grid-cols-[42px_1.7fr_0.9fr_1.2fr_1fr_0.8fr]' : 'grid-cols-[1.9fr_0.8fr_1.15fr_1fr_0.75fr_80px]'} ${selectedIds.has(question._id) ? 'bg-sky-50/60 dark:bg-sky-900/10' : ''}`}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    if (bulkSelecting) toggleSelection(question);
                    else openQuestion(question._id);
                  }
                }}
              >
                {rowSelectionActive && (
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(question._id)}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleSelection(question);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600"
                    />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-slate-800 dark:text-gray-100">{question.questionText || 'Untitled Question'}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-gray-400">
                    <span>{question.sectionName || 'General'}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {SOURCE_LABELS[question.sourceType] || 'Library'}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${
                      question.visibility === 'private'
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                    }`}>
                      {question.visibility === 'private' ? 'Private' : 'Public'}
                    </span>
                    {question.status === 'hidden' && (
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        Hidden
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-gray-200">{labelForType(question.questionType).replace(' Questions', '')}</div>
                <div className="flex flex-wrap items-start gap-1.5">
                  {(question.tags || []).length ? (
                    <>
                      {(question.tags || []).slice(0, 4).map((tag) => (
                        <span key={`${question._id}-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {tag}
                        </span>
                      ))}
                      {(question.tags || []).length > 4 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openTagsModal(question.questionText || 'Question', (question.tags || []).slice(4));
                          }}
                          className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
                        >
                          + More
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-gray-400">-</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-gray-400">{question.sourceTitle || question.sourceAssessmentTitle || '-'}</div>
                <div className="text-xs text-slate-500 dark:text-gray-400">{question.updatedAt ? new Date(question.updatedAt).toLocaleDateString() : '-'}</div>
                {!rowSelectionActive && (
                  <div className="relative flex justify-end">
                    <button
                      data-platform-menu-trigger
                      aria-expanded={actionMenuId === question._id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActionMenuId((current) => current === question._id ? '' : question._id);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-label="Question actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {actionMenuId === question._id && (
                      <div data-platform-action-menu
                        className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-xs font-semibold text-slate-600 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button type="button" onClick={() => openQuestion(question._id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                        <button type="button" onClick={() => startEditQuestion(question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button type="button" onClick={() => toggleVisibility(question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                          {question.visibility === 'private' ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                          {question.visibility === 'private' ? 'Make Public' : 'Make Private'}
                        </button>
                        <button type="button" onClick={() => toggleHiddenStatus(question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                          <EyeOff className="h-3.5 w-3.5" />
                          {question.status === 'hidden' ? 'Unhide' : 'Hide'}
                        </button>
                        <button type="button" onClick={() => deleteQuestion(question)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            Previous
          </button>
          <div>Page {page} of {pages}</div>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, pages))}
            disabled={page >= pages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            Next
          </button>
        </div>
      </div>

      <AnimatePresence>
        {(activeQuestion || detailLoading) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm"
              onClick={() => setActiveQuestion(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
            >
              <div
                className="w-full max-w-[860px] rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {activeQuestion ? labelForType(activeQuestion.questionType) : 'Loading'}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {activeQuestion?.questionText || 'Loading question details...'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveQuestion(null)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {detailLoading || !activeQuestion ? (
                  <div className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">Loading question details...</div>
                ) : (
                  <div className="mt-5 max-h-[75vh] space-y-4 overflow-y-auto pr-1">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Category</div>
                      <div className="mt-1 font-semibold text-slate-800 dark:text-white">{labelForType(activeQuestion.questionType)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Source</div>
                      <div className="mt-1 font-semibold text-slate-800 dark:text-white">{activeQuestion.sourceTitle || activeQuestion.sourceAssessmentTitle || '-'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Source Type</div>
                      <div className="mt-1 font-semibold text-slate-800 dark:text-white">{SOURCE_LABELS[activeQuestion.sourceType] || 'Library'}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Updated</div>
                    <div className="mt-1 font-semibold text-slate-800 dark:text-white">
                      {activeQuestion.updatedAt ? new Date(activeQuestion.updatedAt).toLocaleString() : '-'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Question Text</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-200">
                      {activeQuestion.questionText || '-'}
                    </div>
                  </div>

                  {!!activeQuestion.tags?.length && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        <Tag className="h-3.5 w-3.5" />
                        Tags
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeQuestion.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {renderQuestionPreview(activeQuestion)}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmDialog.open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-sm"
              onClick={closeConfirmDialog}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="fixed inset-0 z-[71] flex items-center justify-center px-4"
            >
              <div
                className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Confirm Action</div>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{confirmDialog.title}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={closeConfirmDialog}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-gray-300">{confirmDialog.message}</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeConfirmDialog}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={runConfirmedAction}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold text-white ${
                      confirmDialog.tone === 'danger'
                        ? 'bg-red-600 hover:bg-red-500'
                        : 'bg-sky-600 hover:bg-sky-500'
                    }`}
                  >
                    {confirmDialog.confirmLabel}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editModal.open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-sm"
              onClick={() => setEditModal({ open: false, question: null, saving: false })}
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed inset-0 z-[61] flex items-center justify-center px-4"
            >
              <form
                onSubmit={saveEditedQuestion}
                className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Edit Question</div>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {editModal.question?.questionText || 'Library question'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditModal({ open: false, question: null, saving: false })}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">
                    Question Text
                    <textarea
                      name="questionText"
                      defaultValue={editModal.question?.questionText || ''}
                      rows={4}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">
                      Tags
                      <input
                        name="tags"
                        defaultValue={(editModal.question?.tags || []).join(', ')}
                        placeholder="comma, separated, tags"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">
                      Difficulty
                      <input
                        name="difficulty"
                        defaultValue={editModal.question?.difficulty || ''}
                        placeholder="Easy / Medium / Hard"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">
                      Visibility
                      <select
                        name="visibility"
                        defaultValue={editModal.question?.visibility || 'public'}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">
                      Status
                      <select
                        name="status"
                        defaultValue={editModal.question?.status || 'published'}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="hidden">Hidden</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditModal({ open: false, question: null, saving: false })}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editModal.saving}
                    className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {editModal.saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {tagsModal.open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-sm"
              onClick={() => setTagsModal({ open: false, questionText: '', tags: [] })}
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed inset-0 z-[61] flex items-center justify-center px-4"
            >
              <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Question Tags</div>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{tagsModal.questionText || 'Question Tags'}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTagsModal({ open: false, questionText: '', tags: [] })}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {tagsModal.tags.map((tag) => (
                    <span key={`modal-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

