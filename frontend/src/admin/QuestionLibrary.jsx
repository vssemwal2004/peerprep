import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BookOpenText, CheckSquare, ChevronLeft, ChevronRight, Columns3, Edit3, Eye, EyeOff, Filter, Globe2, Library, Lock, MoreVertical, RefreshCw, Search, Tag, Trash2, X } from 'lucide-react';
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
  compiler: 'Coding Library',
  manual: 'Manual',
};

function labelForType(type = '') {
  return TYPE_LABELS[type] || `${String(type || 'other').replace(/_/g, ' ')} Questions`;
}

function isPassageSet(question = {}) {
  const data = question.questionData || {};
  return question.libraryItemKind === 'passage_set'
    || (data.libraryItemKind === 'passage_set' && Array.isArray(data.questions));
}

function getLibraryQuestionCount(question = {}) {
  if (isPassageSet(question) && Array.isArray(question.questionData?.questions)) return question.questionData.questions.length;
  return Number(question.questionCount) || 1;
}

function getLibraryQuestionTitle(question = {}) {
  const data = question.questionData || {};
  if (isPassageSet(question)) {
    return question.passageTitle || data.passage?.title || question.questionText || 'Passage MCQ set';
  }
  return question.questionText || data.questionText || 'Untitled Question';
}

function renderQuestionPreview(question = {}) {
  const data = question.questionData || {};
  const type = question.questionType;
  const points = Number(data.points ?? question.points ?? 0);

  if (type === 'mcq') {
    const passageSet = isPassageSet(question);
    const mcqQuestions = passageSet ? data.questions : [data];
    const passage = data.passage;

    return (
      <div className="space-y-5">
        {passage?.text && (
          <section className="rounded-2xl border border-sky-100 bg-sky-50/70 p-5 dark:border-sky-900/40 dark:bg-sky-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300"><BookOpenText className="h-4 w-4" />{passage.title || 'Read the passage'}</div>
              {passageSet && <span className="rounded-full border border-sky-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-gray-900/60 dark:text-sky-300">{mcqQuestions.length} questions</span>}
            </div>
            {passage.image?.url && <img src={passage.image.url} alt={passage.image.alt || ''} className="mt-3 max-h-56 w-full rounded-xl object-contain" />}
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-gray-200">{passage.text}</p>
          </section>
        )}
        {mcqQuestions.map((mcq, questionIndex) => {
          const childPoints = Number(mcq.points ?? (passageSet ? 0 : points));
          const questionKey = mcq.questionId || `${question._id}-${questionIndex}`;
          return (
            <section key={questionKey} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-600">Question {questionIndex + 1}{passageSet ? ` of ${mcqQuestions.length}` : ''}</p><h3 className="mt-2 text-base font-semibold leading-7 text-slate-950 dark:text-white">{mcq.questionText || (!passageSet && question.questionText) || 'Untitled question'}</h3></div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{childPoints} mark{childPoints === 1 ? '' : 's'}</span>
              </div>
              {mcq.questionImage?.url && <img src={mcq.questionImage.url} alt={mcq.questionImage.alt || ''} className="mt-4 max-h-64 w-full rounded-xl border border-slate-200 object-contain p-2 dark:border-gray-700" />}
              <p className="mt-5 text-xs font-medium text-slate-500 dark:text-gray-400">{mcq.allowMultipleAnswers ? 'Select all answers that apply.' : 'Select one answer.'}</p>
              <div className="mt-3 grid gap-3">
                {(mcq.options || []).map((option, optionIndex) => (
                  <label key={`${questionKey}-option-${optionIndex}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/20">
                    <input type={mcq.allowMultipleAnswers ? 'checkbox' : 'radio'} name={`preview-answer-${questionKey}`} className="mt-1 h-4 w-4 shrink-0 border-slate-300 text-sky-600 focus:ring-sky-500" />
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500 dark:bg-gray-800 dark:text-gray-300">{String.fromCharCode(65 + optionIndex)}</span>
                    <span className="min-w-0 flex-1">{mcq.optionImages?.[optionIndex]?.url && <img src={mcq.optionImages[optionIndex].url} alt={mcq.optionImages[optionIndex].alt || ''} className="mb-2 max-h-40 rounded-lg object-contain" />}<span className="block">{option || (mcq.optionImages?.[optionIndex]?.url ? 'Image option' : 'Empty option')}</span></span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  if (type === 'coding') {
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

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-600">Question 1</p><h3 className="mt-2 text-base font-semibold leading-7 text-slate-950 dark:text-white">{question.questionText || data.questionText || 'Untitled question'}</h3></div><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{points} mark{points === 1 ? '' : 's'}</span></div>{data.questionImage?.url && <img src={data.questionImage.url} alt={data.questionImage.alt || ''} className="mt-4 max-h-64 w-full rounded-xl border border-slate-200 object-contain p-2 dark:border-gray-700" />}<div className="mt-5">{type === 'one_line' ? <input type="text" placeholder="Type your answer" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /> : <textarea rows={7} placeholder="Write your answer" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />}</div></section>;
}

export default function QuestionLibrary({ embedded = false, onCategoryCountsChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectionMode = params.get('mode') === 'select';
  const assessmentKey = params.get('assessment') || 'new';
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const returnTo = params.get('return') || `${rolePrefix}/assessment/create`;
  const initialType = params.get('type') || 'all';
  const initialStatus = params.get('status') || '';
  const lockType = params.get('lockType') || '';

  const [filters, setFilters] = useState({
    type: lockType || initialType,
    search: '',
    tag: '',
    difficulty: '',
    status: initialStatus,
    visibility: '',
    sourceType: '',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statusCounts, setStatusCounts] = useState([]);
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
  const [selectingAll, setSelectingAll] = useState(false);
  const [editModal, setEditModal] = useState({ open: false, question: null, saving: false });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirm', tone: 'default', onConfirm: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = window.localStorage.getItem('peerprep-library-columns');
      return saved ? JSON.parse(saved) : { type: true, difficulty: true, tags: true, source: true, updated: true };
    } catch {
      return { type: true, difficulty: true, tags: true, source: true, updated: true };
    }
  });
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
    if (lockType) return;
    setFilters((prev) => ({ ...prev, type: initialType || 'all' }));
    setPage(1);
  }, [initialType, lockType]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, status: initialStatus }));
    setPage(1);
  }, [initialStatus]);

  useEffect(() => {
    window.localStorage.setItem('peerprep-library-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

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
          status: filters.status,
          visibility: filters.visibility,
          sourceType: filters.sourceType,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
          page,
          limit: 20,
          skipCache: reloadKey > 0,
        });
        if (!mounted) return;
        setQuestions(data.questions || []);
        setCategories(data.filters?.categories || []);
        setStatusCounts(data.filters?.statuses || []);
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

  useEffect(() => {
    if (!onCategoryCountsChange) return;
    onCategoryCountsChange({ categories: categoryTabs, statuses: statusCounts });
  }, [categoryTabs, onCategoryCountsChange, statusCounts]);

  const selectionSummary = useMemo(() => {
    return Object.values(selectedMeta).reduce((acc, item) => {
      const type = item.questionType || 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }, [selectedMeta]);

  const activeFilterCount = [filters.tag, filters.difficulty, filters.status, filters.visibility, filters.sourceType].filter(Boolean).length;
  const columnTemplate = useMemo(() => {
    const columns = [];
    if (rowSelectionActive) columns.push('42px');
    columns.push('minmax(280px, 2fr)');
    if (visibleColumns.type) columns.push('minmax(105px, .7fr)');
    if (visibleColumns.difficulty) columns.push('minmax(90px, .6fr)');
    if (visibleColumns.tags) columns.push('minmax(170px, 1.2fr)');
    if (visibleColumns.source) columns.push('minmax(130px, .9fr)');
    if (visibleColumns.updated) columns.push('minmax(105px, .65fr)');
    if (!rowSelectionActive) columns.push('96px');
    return columns.join(' ');
  }, [rowSelectionActive, visibleColumns]);

  const resetFilters = () => {
    setFilters((prev) => ({ ...prev, tag: '', difficulty: '', status: '', visibility: '', sourceType: '' }));
    setPage(1);
  };

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
      const visibleIds = new Set(questions.map((question) => question._id));
      setSelectedIds((previous) => new Set([...previous].filter((id) => !visibleIds.has(id))));
      setSelectedMeta((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !visibleIds.has(id))));
      return;
    }

    setSelectedIds((previous) => new Set([...previous, ...questions.map((question) => question._id)]));
    setSelectedMeta((previous) => questions.reduce((acc, question) => ({ ...acc, [question._id]: question }), previous));
  };

  const selectAllMatchingQuestions = async () => {
    if (!total || selectingAll) return;
    setSelectingAll(true);
    setBulkMenuOpen(false);
    try {
      const data = await api.listLibraryQuestions({
        type: filters.type === 'all' ? '' : filters.type,
        search: filters.search,
        tag: filters.tag,
        difficulty: filters.difficulty,
        status: filters.status,
        visibility: filters.visibility,
        sourceType: filters.sourceType,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        selectAll: true,
        skipCache: true,
      });
      const matches = data.questions || [];
      const matchingMeta = {};
      matches.forEach((question) => { matchingMeta[question._id] = question; });
      setSelectedIds(new Set(matches.map((question) => question._id)));
      setSelectedMeta(matchingMeta);
      toast.success(`Selected all ${matches.length} matching questions.`);
    } catch (error) {
      toast.error(error.message || 'Failed to select all matching questions.');
    } finally {
      setSelectingAll(false);
    }
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

  const previewQuestion = (question) => {
    setActionMenuId('');
    if (question?.questionType === 'coding') {
      if (!question.sourceProblemId) {
        toast.error('This coding question has no linked problem preview.');
        return;
      }
      navigate(`${rolePrefix}/library/coding/${question.sourceProblemId}/preview`, {
        state: { returnTo: `${rolePrefix}/library?type=coding` },
      });
      return;
    }
    openQuestion(question._id);
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
        navigate(`${rolePrefix}/library/coding/${problemId}/edit`, {
          state: { returnTo: `${location.pathname}${location.search}` },
        });
        return;
      }

      toast.error('This assessment coding question has no linked library problem to edit.');
      return;
    }

    navigate(`${rolePrefix}/library/question/${question._id}/edit?type=${question.questionType}`, {
      state: { returnTo: `${location.pathname}${location.search}` },
    });
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

  const updateQuestionBySource = async (question, body) => {
    if (question?.questionType === 'coding' && question.sourceProblemId) {
      const operations = [];
      if (body.visibility) operations.push(api.updateCompilerProblemVisibility(question.sourceProblemId, body.visibility));
      if (body.status) {
        const codingStatus = body.status === 'hidden' ? 'draft' : body.status;
        operations.push(api.updateCompilerProblemStatus(question.sourceProblemId, codingStatus));
      }
      if (operations.length) return Promise.all(operations);
    }
    return api.updateLibraryQuestion(question._id, body);
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
          await updateQuestionBySource(question, { visibility: nextVisibility });
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
          await updateQuestionBySource(question, { status: nextStatus });
          toast.success(nextStatus === 'hidden' ? 'Question hidden.' : 'Question published.');
          refreshLibrary();
        } catch (error) {
          toast.error(error.message || 'Failed to update question status.');
        }
      },
    });
  };

  const publishDraft = async (question) => {
    setActionMenuId('');
    openConfirmDialog({
      title: 'Publish Question?',
      message: 'Publish this draft so it becomes available for normal library and assessment use?',
      confirmLabel: 'Publish Question',
      onConfirm: async () => {
        try {
          await updateQuestionBySource(question, { status: 'published' });
          toast.success('Question published.');
          refreshLibrary();
        } catch (error) {
          toast.error(error.message || 'Failed to publish question.');
        }
      },
    });
  };

  const deleteQuestion = async (question) => {
    setActionMenuId('');
    if (question?.questionType === 'coding') {
      toast.error('Delete coding problems from Problem management so linked test cases and submissions can be reviewed safely.');
      return;
    }
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

    const selectedQuestions = Object.values(selectedMeta);
    openConfirmDialog({
      title,
      message,
      confirmLabel,
      onConfirm: async () => {
        try {
          await Promise.all(selectedQuestions.map((question) => updateQuestionBySource(question, body)));
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

    const selectedQuestions = Object.values(selectedMeta);
    const codingCount = selectedQuestions.filter((question) => question.questionType === 'coding').length;
    if (codingCount > 0) {
      toast.error('Coding problems must be deleted individually from Problem management so test cases and submissions are reviewed safely.');
      return;
    }
    const ids = selectedQuestions.map((question) => question._id);
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
    <div className={embedded ? 'bg-white dark:bg-gray-900' : 'min-h-screen bg-white pt-20 dark:bg-gray-900'}>
      <div className={embedded ? 'w-full' : 'mx-auto max-w-7xl px-4 py-6'}>
        {!embedded && <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
                Fast search and live syncing for coding, MCQ, and written questions.
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
                      <button type="button" onClick={selectAllMatchingQuestions} disabled={!bulkSelecting || !total || selectingAll} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"><CheckSquare className="h-3.5 w-3.5" />{selectingAll ? 'Selecting all...' : `Select all ${total} matches`}</button>
                      <div className="my-1 border-t border-slate-100 dark:border-gray-800" />
                      <button type="button" onClick={() => bulkUpdateQuestions({ title: 'Publish Selected Questions?', message: `Publish ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'}? Coding problems must already pass their validation checks.`, confirmLabel: 'Publish Selected', body: { status: 'published' }, successMessage: 'Selected questions published.' })} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"><Eye className="h-3.5 w-3.5" /> Publish Selected</button>
                      <button type="button" onClick={() => bulkUpdateQuestions({ title: 'Move Selected to Draft?', message: `Move ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} to draft? They will no longer be available for normal selection.`, confirmLabel: 'Move to Draft', body: { status: 'draft' }, successMessage: 'Selected questions moved to draft.' })} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"><Edit3 className="h-3.5 w-3.5" /> Move to Draft</button>
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
        </div>}

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
              <button type="button" onClick={selectAllMatchingQuestions} disabled={!total || selectingAll} className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
                {selectingAll ? 'Selecting...' : `Select all ${total}`}
              </button>
              <button type="button" onClick={clearSelection} disabled={!selectedIds.size} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                Clear
              </button>
            </div>
          </div>
        )}

        {!embedded && <div className="mt-6 flex flex-wrap gap-2">
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
        </div>}

        {embedded && filters.status === 'draft' && !selectionMode && (
          <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Edit3 className="h-4 w-4" /></span>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Draft questions</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-gray-300">{total} saved draft{total === 1 ? '' : 's'}. Preview, continue editing, publish, or delete them here.</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold tabular-nums text-amber-700 dark:border-amber-800 dark:bg-gray-900 dark:text-amber-300">{total} draft{total === 1 ? '' : 's'}</span>
          </section>
        )}

        <div className={`${embedded ? '' : 'mt-5'} flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-gray-800 xl:flex-row xl:items-center`}>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus-within:ring-sky-900/30">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by question, answer, tag or topic"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {searchInput && <button type="button" onClick={() => setSearchInput('')} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800"><X className="h-3.5 w-3.5" /></button>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {embedded && !selectionMode && (
              <>
                <button type="button" onClick={toggleBulkSelecting} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-sm transition-colors ${bulkSelecting ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}><CheckSquare className="h-3.5 w-3.5" />{bulkSelecting ? `${selectedIds.size} selected` : 'Select'}</button>
                {bulkSelecting && (
                  <div className="relative">
                    <button type="button" aria-label="Bulk actions" aria-expanded={bulkMenuOpen} onClick={() => setBulkMenuOpen((open) => !open)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><MoreVertical className="h-4 w-4" /></button>
                    {bulkMenuOpen && (
                      <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-xs font-semibold text-slate-600 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        <div className="border-b border-slate-100 px-3 py-2.5 dark:border-gray-800"><p className="font-bold text-slate-900 dark:text-white">Bulk actions</p><p className="mt-0.5 text-[10px] font-normal text-slate-400">{selectedIds.size} selected</p></div>
                        <button type="button" onClick={toggleSelectVisibleQuestions} disabled={!questions.length} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><CheckSquare className="h-3.5 w-3.5" />{questions.length && questions.every((question) => selectedIds.has(question._id)) ? 'Clear current page' : 'Select current page'}</button>
                        <button type="button" onClick={selectAllMatchingQuestions} disabled={!total || selectingAll} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><CheckSquare className="h-3.5 w-3.5" />{selectingAll ? 'Selecting all...' : `Select all ${total} matches`}</button>
                        <button type="button" onClick={() => bulkUpdateQuestions({ title: 'Publish Selected Questions?', message: `Publish ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'}? Coding problems must already pass their validation checks.`, confirmLabel: 'Publish Selected', body: { status: 'published' }, successMessage: 'Selected questions published.' })} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><Eye className="h-3.5 w-3.5" />Publish selected</button>
                        <button type="button" onClick={() => bulkUpdateQuestions({ title: 'Move Selected to Draft?', message: `Move ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} to draft?`, confirmLabel: 'Move to Draft', body: { status: 'draft' }, successMessage: 'Selected questions moved to draft.' })} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><Edit3 className="h-3.5 w-3.5" />Move to draft</button>
                        <button type="button" onClick={() => bulkUpdateQuestions({ title: 'Make Selected Public?', message: `Make ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} public?`, confirmLabel: 'Make Public', body: { visibility: 'public' }, successMessage: 'Selected questions are public.' })} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><Globe2 className="h-3.5 w-3.5" />Make public</button>
                        <button type="button" onClick={() => bulkUpdateQuestions({ title: 'Make Selected Private?', message: `Make ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} private?`, confirmLabel: 'Make Private', body: { visibility: 'private' }, successMessage: 'Selected questions are private.' })} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><Lock className="h-3.5 w-3.5" />Make private</button>
                        <button type="button" onClick={() => bulkUpdateQuestions({ title: 'Hide Selected Questions?', message: `Hide ${selectedIds.size} selected question${selectedIds.size === 1 ? '' : 's'} from normal use?`, confirmLabel: 'Hide Selected', body: { status: 'hidden' }, successMessage: 'Selected questions hidden.' })} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><EyeOff className="h-3.5 w-3.5" />Hide selected</button>
                        <div className="my-1 border-t border-slate-100 dark:border-gray-800" />
                        <button type="button" onClick={bulkDeleteQuestions} disabled={!selectedIds.size} className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-900/20"><Trash2 className="h-3.5 w-3.5" />Delete selected</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {embedded && selectionMode && (
              <>
                <button type="button" onClick={() => navigate(returnTo)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
                <button type="button" onClick={selectAllMatchingQuestions} disabled={!total || selectingAll} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300"><CheckSquare className="h-3.5 w-3.5" />{selectingAll ? 'Selecting...' : `Select all ${total}`}</button>
                <button type="button" onClick={handleAddSelected} disabled={!selectedIds.size} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"><CheckSquare className="h-3.5 w-3.5" />Add selected ({selectedIds.size})</button>
              </>
            )}
            <div className="relative">
              <button type="button" onClick={() => { setFilterPanelOpen((open) => !open); setColumnsPanelOpen(false); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-sm transition-colors ${filterPanelOpen || activeFilterCount ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                <Filter className="h-3.5 w-3.5" /> Filters
                {activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
              </button>
              {filterPanelOpen && (
                <div className="absolute right-0 top-12 z-40 w-[min(92vw,390px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-900 dark:text-white">Filter questions</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">Narrow the current question bank.</p></div>{activeFilterCount > 0 && <button type="button" onClick={resetFilters} className="text-xs font-semibold text-sky-600 hover:text-sky-700">Clear all</button>}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">Difficulty<select value={filters.difficulty} onChange={(event) => { setFilters((prev) => ({ ...prev, difficulty: event.target.value })); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-gray-700 dark:bg-gray-800"><option value="">All levels</option>{availableDifficulties.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">Tag or topic<select value={filters.tag} onChange={(event) => { setFilters((prev) => ({ ...prev, tag: event.target.value })); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-gray-700 dark:bg-gray-800"><option value="">All tags</option>{availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">Status<select value={filters.status} onChange={(event) => { setFilters((prev) => ({ ...prev, status: event.target.value })); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-gray-700 dark:bg-gray-800"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">Visibility<select value={filters.visibility} onChange={(event) => { setFilters((prev) => ({ ...prev, visibility: event.target.value })); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-gray-700 dark:bg-gray-800"><option value="">All visibility</option><option value="public">Public</option><option value="private">Private</option></select></label>
                    <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300 sm:col-span-2">Source<select value={filters.sourceType} onChange={(event) => { setFilters((prev) => ({ ...prev, sourceType: event.target.value })); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-gray-700 dark:bg-gray-800"><option value="">All sources</option><option value="manual">Directly created</option><option value="assessment">Assessment</option><option value="compiler">Coding workspace</option></select></label>
                  </div>
                  <button type="button" onClick={() => setFilterPanelOpen(false)} className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-500">Show questions</button>
                </div>
              )}
            </div>

            <div className="relative">
              <button type="button" onClick={() => { setColumnsPanelOpen((open) => !open); setFilterPanelOpen(false); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"><Columns3 className="h-3.5 w-3.5" /> Columns</button>
              {columnsPanelOpen && (
                <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                  <div className="px-1 pb-2"><p className="text-sm font-bold text-slate-900 dark:text-white">Visible columns</p><p className="mt-0.5 text-[11px] text-slate-500">Saved for this browser.</p></div>
                  {Object.entries({ type: 'Question type', difficulty: 'Difficulty', tags: 'Tags / topics', source: 'Source', updated: 'Last updated' }).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"><input type="checkbox" checked={visibleColumns[key]} onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))} className="h-4 w-4 rounded border-slate-300 text-sky-600" />{label}</label>
                  ))}
                  <button type="button" onClick={() => setVisibleColumns({ type: true, difficulty: true, tags: true, source: true, updated: true })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Restore defaults</button>
                </div>
              )}
            </div>

            <select value={`${filters.sortBy}:${filters.sortOrder}`} onChange={(event) => { const [sortBy, sortOrder] = event.target.value.split(':'); setFilters((prev) => ({ ...prev, sortBy, sortOrder })); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <option value="updatedAt:desc">Recently updated</option>
              <option value="createdAt:desc">Recently created</option>
              <option value="questionText:asc">Question A–Z</option>
              <option value="difficulty:asc">Difficulty</option>
            </select>
            <button type="button" onClick={refreshLibrary} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Refresh library"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[['difficulty', filters.difficulty], ['tag', filters.tag], ['status', filters.status], ['visibility', filters.visibility], ['sourceType', filters.sourceType]].filter(([, value]) => value).map(([key, value]) => <button key={key} type="button" onClick={() => { setFilters((prev) => ({ ...prev, [key]: '' })); setPage(1); }} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">{value}<X className="h-3 w-3" /></button>)}
            <button type="button" onClick={resetFilters} className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">Clear filters</button>
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="min-w-[780px]">
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400" style={{ gridTemplateColumns: columnTemplate }}>
            {rowSelectionActive ? <div className="flex items-center justify-center"><input type="checkbox" aria-label="Select all questions on this page" checked={questions.length > 0 && questions.every((question) => selectedIds.has(question._id))} onChange={toggleSelectVisibleQuestions} className="h-4 w-4 rounded border-slate-300 text-sky-600" /></div> : null}
            <div>Question</div>
            {visibleColumns.type && <div>Type</div>}
            {visibleColumns.difficulty && <div>Difficulty</div>}
            {visibleColumns.tags && <div>Tags / Topics</div>}
            {visibleColumns.source && <div>Source</div>}
            {visibleColumns.updated && <div>Updated</div>}
            {!rowSelectionActive ? <div className="text-right">Actions</div> : null}
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-gray-400">Loading library questions...</div>
          ) : questions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{filters.status === 'draft' ? 'No draft questions yet' : 'No questions found'}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{filters.status === 'draft' ? 'Choose Save draft while creating or editing a question and it will appear here.' : 'No questions matched the current filters.'}</p>
            </div>
          ) : (
            questions.map((question) => (
              <div
                key={question._id}
                onClick={() => (rowSelectionActive ? toggleSelection(question) : previewQuestion(question))}
                className={`grid w-full cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left text-sm text-slate-600 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/60 ${selectedIds.has(question._id) ? 'bg-sky-50/60 dark:bg-sky-900/10' : ''}`}
                style={{ gridTemplateColumns: columnTemplate }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    if (rowSelectionActive) toggleSelection(question);
                    else previewQuestion(question);
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
                  <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-800 dark:text-gray-100">
                    {isPassageSet(question) && <BookOpenText className="h-4 w-4 shrink-0 text-sky-600" />}
                    <span>{getLibraryQuestionTitle(question)}</span>
                    {isPassageSet(question) && (
                      <>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">Passage set</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{getLibraryQuestionCount(question)} questions</span>
                      </>
                    )}
                  </div>
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
                    {question.status && question.status !== 'published' && (
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${question.status === 'draft' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300' : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                        {question.status.charAt(0).toUpperCase() + question.status.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
                {visibleColumns.type && <div className="text-xs font-semibold text-slate-700 dark:text-gray-200">{isPassageSet(question) ? 'Passage MCQ' : labelForType(question.questionType).replace(' Questions', '')}</div>}
                {visibleColumns.difficulty && <div><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${String(question.difficulty || '').toLowerCase() === 'hard' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/15 dark:text-rose-300' : String(question.difficulty || '').toLowerCase() === 'medium' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/15 dark:text-amber-300' : String(question.difficulty || '').toLowerCase() === 'easy' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/15 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>{question.difficulty || 'Not set'}</span></div>}
                {visibleColumns.tags && <div className="flex flex-wrap items-start gap-1.5">
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
                </div>}
                {visibleColumns.source && <div className="text-xs text-slate-500 dark:text-gray-400">{question.sourceTitle || question.sourceAssessmentTitle || '-'}</div>}
                {visibleColumns.updated && <div className="text-xs text-slate-500 dark:text-gray-400">{question.updatedAt ? new Date(question.updatedAt).toLocaleDateString() : '-'}</div>}
                {!rowSelectionActive && (
                  <div className="relative flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        previewQuestion(question);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
                      aria-label={`Preview ${question.questionText || 'question'}`}
                      title="Candidate preview"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
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
                        <button type="button" onClick={() => previewQuestion(question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                          <Eye className="h-3.5 w-3.5" /> Preview
                        </button>
                        <button type="button" onClick={() => startEditQuestion(question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                        {question.status === 'draft' && (
                          <button type="button" onClick={() => publishDraft(question)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                            <CheckSquare className="h-3.5 w-3.5" /> Publish
                          </button>
                        )}
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
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:text-gray-400">
          <div>Showing {questions.length ? ((page - 1) * 20) + 1 : 0}-{Math.min(page * 20, total)} of {total} questions</div>
          <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {Array.from({ length: Math.min(5, pages) }, (_, index) => {
            const start = Math.max(1, Math.min(page - 2, pages - 4));
            const pageNumber = start + index;
            if (pageNumber > pages) return null;
            return <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`h-8 min-w-8 rounded-lg px-2 font-bold ${pageNumber === page ? 'bg-sky-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>{pageNumber}</button>;
          })}
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, pages))}
            disabled={page >= pages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {(activeQuestion || detailLoading) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-slate-950/55 backdrop-blur-sm"
              onClick={() => setActiveQuestion(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              className="fixed inset-0 z-[61] flex items-center justify-center p-3 sm:p-5"
              onClick={() => setActiveQuestion(null)}
            >
              <div
                className="flex h-[min(92vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-gray-700 dark:bg-gray-950"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Candidate question preview"
              >
                <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white"><Eye className="h-4 w-4" /></span>
                    <div>
                      <h2 className="text-sm font-bold text-slate-950 dark:text-white">Candidate preview</h2>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400">Assessment view · responses are not saved</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 sm:inline dark:bg-sky-950/30 dark:text-sky-300">Preview mode</span>
                  <button
                    type="button"
                    onClick={() => setActiveQuestion(null)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  </div>
                </header>

                <div className="flex min-h-0 flex-1">
                  <aside className="hidden w-52 shrink-0 border-r border-slate-200 bg-white p-4 lg:block dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Question navigator</p>
                    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/30">
                      <div className="flex items-center justify-between"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white">1</span><span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300">Current</span></div>
                      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-700 dark:text-gray-200">{activeQuestion ? getLibraryQuestionTitle(activeQuestion) : 'Loading question'}</p>
                      {activeQuestion && isPassageSet(activeQuestion) && <p className="mt-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300">Passage set · {getLibraryQuestionCount(activeQuestion)} questions</p>}
                    </div>
                    <div className="mt-5 space-y-2 text-[11px] text-slate-500 dark:text-gray-400"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-sky-600" />Current</div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-slate-300" />Not answered</div></div>
                  </aside>

                  <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="mx-auto max-w-3xl">
                      {activeQuestion && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{isPassageSet(activeQuestion) ? 'Passage MCQ set' : labelForType(activeQuestion.questionType)}</span><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{activeQuestion.difficulty || 'Not set'}</span></div><span className="text-xs font-semibold text-slate-500 dark:text-gray-400">{getLibraryQuestionCount(activeQuestion)} question{getLibraryQuestionCount(activeQuestion) === 1 ? '' : 's'}</span></div>}
                      {detailLoading || !activeQuestion ? <div className="flex min-h-72 items-center justify-center text-sm text-slate-500 dark:text-gray-400">Loading candidate preview...</div> : renderQuestionPreview(activeQuestion)}
                    </div>
                  </main>
                </div>

                <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6 dark:border-gray-800 dark:bg-gray-900">
                  <button type="button" disabled className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 opacity-50 dark:border-gray-700"><ChevronLeft className="h-4 w-4" />Previous</button>
                  <button type="button" onClick={() => setActiveQuestion(null)} className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white hover:bg-sky-500">Done previewing</button>
                </footer>
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

