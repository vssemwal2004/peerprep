import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BookOpenText, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Columns3, Edit3, Eye, EyeOff, Filter, Folder, Globe2, Library, LoaderCircle, Lock, MoreVertical, RefreshCw, Search, Tag, Trash2, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { queueQuestionSelection } from './assessment/assessmentProblemSelectionStore';
import { loadAssessmentDraft } from './assessment/assessmentDraftStore';
import { buildAssessmentQuestionIdentitySet, isLibraryQuestionAlreadyAdded } from './assessment/assessmentQuestionIdentity';
import { getLanguageLabel, getProblemSupportedLanguages } from './compiler/compilerUtils';
import CodingQuestionFilterDrawer from './library/CodingQuestionFilterDrawer';

const TYPE_LABELS = {
  all: 'All Questions',
  coding: 'Coding Questions',
  mcq: 'MCQs',
  short: 'Short Questions',
  one_line: 'One-word Questions',
};
const LIBRARY_PAGE_SIZE = 25;
const LIBRARY_PAGE_SIZES = [25, 50, 100];

function labelForType(type = '') {
  return TYPE_LABELS[type] || `${String(type || 'other').replace(/_/g, ' ')} Questions`;
}

function labelForQuestionType(question = {}) {
  if (isPassageSet(question)) return 'Passage MCQ';
  const codingData = question?.questionData?.problemDataSnapshot || question?.questionData?.coding || {};
  if (question.questionType === 'coding' && codingData.category === 'SQL') return 'SQL problem';
  return {
    coding: 'Coding problem',
    mcq: 'MCQ question',
    short: 'Descriptive question',
    one_line: 'One-word question',
  }[question.questionType] || 'Other question';
}

function getQuestionState(question = {}) {
  const status = String(question.status || '').toLowerCase();
  if (status === 'draft') return { label: 'Draft', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300' };
  if (status === 'hidden') return { label: 'Hidden', className: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  if (status === 'archived') return { label: 'Archived', className: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  if (question.visibility === 'private') return { label: 'Private', className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300' };
  return { label: 'Public', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' };
}

function QuestionStateBadge({ question }) {
  const state = getQuestionState(question);
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${state.className}`}>{state.label}</span>;
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

function getFullQuestionStatement(question = {}) {
  const data = question.questionData || {};
  if (question.questionType === 'coding') {
    const coding = data.problemDataSnapshot || data.coding || {};
    return coding.statement || coding.description || question.questionText || data.questionText || getLibraryQuestionTitle(question);
  }
  if (isPassageSet(question)) {
    const passage = data.passage?.text;
    const questions = (data.questions || []).map((item, index) => `${index + 1}. ${item.questionText || ''}`).filter(Boolean).join('\n\n');
    return [passage, questions].filter(Boolean).join('\n\n') || getLibraryQuestionTitle(question);
  }
  return question.questionText || data.questionText || getLibraryQuestionTitle(question);
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
        {coding.category === 'SQL' && coding.sqlConfig?.schemaSql ? <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 text-sm text-sky-100 md:col-span-2"><div className="text-[11px] uppercase tracking-[0.16em] text-sky-300">Database schema</div><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5">{coding.sqlConfig.schemaSql}</pre></div> : null}
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
  const assessmentTitle = params.get('assessmentTitle') || 'this assessment';
  const questionSet = Math.max(1, Number(params.get('questionSet')) || 1);
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const returnTo = params.get('return') || `${rolePrefix}/assessment/create`;
  const initialStatus = params.get('status') || '';
  const initialType = params.get('type') || (initialStatus || selectionMode ? 'all' : 'coding');
  const lockType = params.get('lockType') || '';
  const libraryViewStateKey = `peerprep:library-view:${location.pathname}:${lockType || initialType}`;
  const restoredViewState = useMemo(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(libraryViewStateKey) || '{}');
    } catch {
      return {};
    }
  }, [libraryViewStateKey]);

  const [filters, setFilters] = useState(() => ({
    search: '',
    tag: '',
    difficulty: '',
    status: initialStatus,
    visibility: '',
    sourceAssessmentId: '',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    topicIds: [],
    topicLabels: [],
    topicScope: 'direct',
    topicMatch: 'any',
    tagIds: [],
    tagLabels: [],
    tagMatch: 'any',
    classificationMatch: 'all',
    uncategorized: false,
    viewMode: 'questions',
    folderBy: 'topics',
    ...(restoredViewState.filters || {}),
    type: lockType || initialType,
  }));
  const [searchInput, setSearchInput] = useState(() => restoredViewState.filters?.search || '');
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statusCounts, setStatusCounts] = useState([]);
  const [availableDifficulties, setAvailableDifficulties] = useState([]);
  const [availableAssessments, setAvailableAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => Math.max(1, Number(restoredViewState.page) || 1));
  const [pageSize, setPageSize] = useState(() => LIBRARY_PAGE_SIZES.includes(Number(restoredViewState.pageSize)) ? Number(restoredViewState.pageSize) : LIBRARY_PAGE_SIZE);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedMeta, setSelectedMeta] = useState({});
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tagsModal, setTagsModal] = useState({ open: false, questionText: '', tags: [] });
  const [usageModal, setUsageModal] = useState({ open: false, questionText: '', assessments: [] });
  const [statementModal, setStatementModal] = useState({ open: false, title: '', statement: '' });
  const [actorModal, setActorModal] = useState(null);
  const [actionMenuId, setActionMenuId] = useState('');
  const [actionMenuPopup, setActionMenuPopup] = useState(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [editModal, setEditModal] = useState({ open: false, question: null, saving: false });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirm', tone: 'default', onConfirm: null });
  const [reloadKey, setReloadKey] = useState(0);
  const previousRouteTypeRef = useRef(lockType || initialType);
  const previousRouteStatusRef = useRef(initialStatus);
  const committedSearchRef = useRef(restoredViewState.filters?.search || '');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [folderItems, setFolderItems] = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderPages, setFolderPages] = useState(1);
  const [folderTotal, setFolderTotal] = useState(0);
  const [expandedFolderId, setExpandedFolderId] = useState('');
  const [folderQuestions, setFolderQuestions] = useState({});
  const [folderQuestionLoading, setFolderQuestionLoading] = useState('');
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = window.localStorage.getItem('peerprep-library-columns');
      return saved ? { difficulty: true, tags: true, usedIn: true, updated: true, ...JSON.parse(saved), type: true, source: false } : { type: true, difficulty: true, tags: true, usedIn: true, source: false, updated: true };
    } catch {
      return { type: true, difficulty: true, tags: true, usedIn: true, source: false, updated: true };
    }
  });

  useEffect(() => {
    if (!actionMenuId) return undefined;

    const closeMenu = () => setActionMenuId('');
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [actionMenuId]);
  const rowSelectionActive = selectionMode || bulkSelecting;
  const assessmentQuestionIdentities = useMemo(() => {
    if (!selectionMode) return new Set();
    const draft = loadAssessmentDraft(assessmentKey);
    return buildAssessmentQuestionIdentitySet(draft?.sections || []);
  }, [assessmentKey, selectionMode]);
  const questionAlreadyAdded = (question) => selectionMode
    && isLibraryQuestionAlreadyAdded(question, assessmentQuestionIdentities);
  const eligibleQuestions = useMemo(() => questions.filter((question) => (
    !selectionMode || !isLibraryQuestionAlreadyAdded(question, assessmentQuestionIdentities)
  )), [assessmentQuestionIdentities, questions, selectionMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (committedSearchRef.current === searchInput) return;
      committedSearchRef.current = searchInput;
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
    if (previousRouteTypeRef.current === initialType) return;
    previousRouteTypeRef.current = initialType;
    setFilters((prev) => ({
      ...prev,
      type: initialType || 'all',
      ...((initialType || 'all') === 'coding' ? {} : { topicIds: [], tagIds: [], topicLabels: [], tagLabels: [], uncategorized: false, viewMode: 'questions' }),
    }));
    setPage(1);
  }, [initialType, lockType]);

  useEffect(() => {
    if (previousRouteStatusRef.current === initialStatus) return;
    previousRouteStatusRef.current = initialStatus;
    setFilters((prev) => ({ ...prev, status: initialStatus }));
    setPage(1);
  }, [initialStatus]);

  useEffect(() => {
    window.localStorage.setItem('peerprep-library-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(libraryViewStateKey, JSON.stringify({ filters, page, pageSize }));
    } catch {
      // Keep the library usable when browser storage is restricted.
    }
  }, [filters, libraryViewStateKey, page, pageSize]);

  useEffect(() => {
    if (filters.type === 'coding' && filters.viewMode === 'folders') {
      setLoading(false);
      return undefined;
    }
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
          sourceAssessmentId: filters.sourceAssessmentId,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
          topicIds: (filters.topicIds || []).join(','),
          topicScope: filters.topicScope,
          topicMatch: filters.topicMatch,
          tagIds: (filters.tagIds || []).join(','),
          tagMatch: filters.tagMatch,
          classificationMatch: filters.classificationMatch,
          uncategorized: filters.uncategorized || undefined,
          page,
          limit: pageSize,
          skipCache: reloadKey > 0,
        });
        if (!mounted) return;
        setQuestions(data.questions || []);
        setCategories(data.filters?.categories || []);
        setStatusCounts(data.filters?.statuses || []);
        setAvailableDifficulties(data.filters?.difficulties || []);
        setAvailableAssessments(data.filters?.assessments || []);
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
  }, [filters, page, pageSize, reloadKey, toast]);

  useEffect(() => {
    if (filters.type !== 'coding' || filters.viewMode !== 'folders') {
      setFolderItems([]);
      setExpandedFolderId('');
      setFolderQuestions({});
      return undefined;
    }
    let cancelled = false;
    const loadFolders = async () => {
      setFolderLoading(true);
      try {
        const kind = filters.folderBy === 'tags' ? 'tags' : 'topics';
        const selectedIds = kind === 'tags' ? (filters.tagIds || []) : (filters.topicIds || []);
        const result = kind === 'tags'
          ? await api.listCodingTags({ ids: selectedIds.join(','), withQuestions: true, page, limit: pageSize, skipCache: reloadKey > 0 })
          : await api.listCodingTopics({ ids: selectedIds.join(','), withQuestions: true, page, limit: pageSize, skipCache: reloadKey > 0 });
        if (!cancelled) {
          setFolderItems(result[kind] || []);
          setFolderPages(Number(result.pagination?.pages || 1));
          setFolderTotal(Number(result.pagination?.total || 0));
        }
      } catch (error) {
        if (!cancelled) toast.error(error.message || 'Failed to load coding folders.');
      } finally {
        if (!cancelled) setFolderLoading(false);
      }
    };
    setExpandedFolderId('');
    setFolderQuestions({});
    loadFolders();
    return () => { cancelled = true; };
  }, [filters.folderBy, filters.tagIds, filters.topicIds, filters.type, filters.viewMode, page, pageSize, reloadKey, toast]);

  const loadFolderQuestionPage = async (folder, targetPage = 1, { allInFolder = false } = {}) => {
    const folderId = String(folder?._id || '');
    if (!folderId) return;
    setFolderQuestionLoading(folderId);
    try {
      const byTags = filters.folderBy === 'tags';
      const data = await api.listLibraryQuestions({
        type: 'coding',
        search: allInFolder ? '' : filters.search,
        difficulty: allInFolder ? '' : filters.difficulty,
        status: allInFolder ? '' : filters.status,
        visibility: allInFolder ? '' : filters.visibility,
        sourceAssessmentId: allInFolder ? '' : filters.sourceAssessmentId,
        topicIds: byTags ? (allInFolder ? '' : (filters.topicIds || []).join(',')) : folderId,
        topicScope: allInFolder ? 'direct' : filters.topicScope,
        topicMatch: allInFolder ? 'any' : filters.topicMatch,
        tagIds: byTags ? folderId : (allInFolder ? '' : (filters.tagIds || []).join(',')),
        tagMatch: allInFolder ? 'any' : filters.tagMatch,
        classificationMatch: 'all',
        page: targetPage,
        limit: pageSize,
        includeMeta: false,
        skipCache: reloadKey > 0,
      });
      setFolderQuestions((current) => ({
        ...current,
        [folderId]: {
          items: data.questions || [],
          pagination: data.pagination || { page: targetPage, pages: 1, total: 0, limit: pageSize },
          allInFolder,
        },
      }));
    } catch (error) {
      toast.error(error.message || 'Failed to open this question folder.');
      setExpandedFolderId('');
    } finally {
      setFolderQuestionLoading('');
    }
  };

  const toggleQuestionFolder = async (folder) => {
    const folderId = String(folder?._id || '');
    if (!folderId) return;
    if (expandedFolderId === folderId) {
      setExpandedFolderId('');
      return;
    }
    setExpandedFolderId(folderId);
    if (folderQuestions[folderId]) return;
    await loadFolderQuestionPage(folder, 1, { allInFolder: true });
  };


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

  const activeFilterCount = [filters.search, filters.tag, filters.difficulty, filters.status, filters.visibility, filters.sourceAssessmentId].filter(Boolean).length
    + ((filters.topicIds || []).length || filters.uncategorized ? 1 : 0)
    + ((filters.tagIds || []).length ? 1 : 0)
    + (filters.viewMode === 'folders' ? 1 : 0);
  const columnTemplate = useMemo(() => {
    const columns = [];
    if (rowSelectionActive) columns.push('32px');
    columns.push('minmax(0, 2fr)');
    columns.push('minmax(0, .9fr)');
    if (visibleColumns.difficulty) columns.push('minmax(0, .62fr)');
    if (visibleColumns.tags) columns.push('minmax(0, 1.35fr)');
    if (visibleColumns.usedIn) columns.push('minmax(0, 1.2fr)');
    if (visibleColumns.updated) columns.push('minmax(0, .72fr)');
    if (!rowSelectionActive) columns.push('76px');
    return columns.join(' ');
  }, [rowSelectionActive, visibleColumns]);

  const resetFilters = () => {
    setFilters((prev) => ({ ...prev, tag: '', difficulty: '', status: '', visibility: '', sourceAssessmentId: '', topicIds: [], tagIds: [], topicLabels: [], tagLabels: [], topicScope: 'direct', topicMatch: 'any', tagMatch: 'any', classificationMatch: 'all', uncategorized: false, viewMode: 'questions', folderBy: 'topics' }));
    setPage(1);
  };

  const removeClassificationFilter = (kind, id) => {
    const idsKey = kind === 'topic' ? 'topicIds' : 'tagIds';
    const labelsKey = kind === 'topic' ? 'topicLabels' : 'tagLabels';
    setFilters((current) => ({
      ...current,
      [idsKey]: (current[idsKey] || []).filter((value) => String(value) !== String(id)),
      [labelsKey]: (current[labelsKey] || []).filter((item) => String(item.id) !== String(id)),
    }));
    setPage(1);
  };

  const toggleSelection = (question) => {
    if (questionAlreadyAdded(question)) {
      toast.info('This question is already in the assessment.');
      return;
    }
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
    const allVisibleSelected = eligibleQuestions.length > 0 && eligibleQuestions.every((question) => selectedIds.has(question._id));
    if (allVisibleSelected) {
      const visibleIds = new Set(eligibleQuestions.map((question) => question._id));
      setSelectedIds((previous) => new Set([...previous].filter((id) => !visibleIds.has(id))));
      setSelectedMeta((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !visibleIds.has(id))));
      return;
    }

    setSelectedIds((previous) => new Set([...previous, ...eligibleQuestions.map((question) => question._id)]));
    setSelectedMeta((previous) => eligibleQuestions.reduce((acc, question) => ({ ...acc, [question._id]: question }), previous));
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
        sourceAssessmentId: filters.sourceAssessmentId,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        topicIds: (filters.topicIds || []).join(','),
        topicScope: filters.topicScope,
        topicMatch: filters.topicMatch,
        tagIds: (filters.tagIds || []).join(','),
        tagMatch: filters.tagMatch,
        classificationMatch: filters.classificationMatch,
        uncategorized: filters.uncategorized || undefined,
        selectAll: true,
        skipCache: true,
      });
      const matches = (data.questions || []).filter((question) => (
        !selectionMode || !isLibraryQuestionAlreadyAdded(question, assessmentQuestionIdentities)
      ));
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
    if (question?.questionType === 'coding' && !question.platformShared) {
      if (!question.sourceProblemId) {
        toast.error('This coding question has no linked problem preview.');
        return;
      }
      navigate(`${rolePrefix}/library/coding/${question.sourceProblemId}/preview`, {
        state: { returnTo: `${location.pathname}${location.search}` },
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
      const selectableIds = Object.values(selectedMeta)
        .filter((question) => !questionAlreadyAdded(question))
        .map((question) => question._id);
      if (!selectableIds.length) {
        toast.error('All selected questions are already in this assessment.');
        clearSelection();
        return;
      }
      const data = await api.resolveLibraryQuestions(selectableIds);
      queueQuestionSelection(assessmentKey, { questions: data.questions || [], lockType, questionSet });
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
    if (question?.platformShared) throw new Error('Shared questions are managed by the super admin.');
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
    if (question?.platformShared) { toast.error('Shared questions are managed by the super admin.'); return; }
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
    if (selectedQuestions.some((question) => question.platformShared)) { toast.error('Shared questions are managed by the super admin.'); return; }
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
    if (selectedQuestions.some((question) => question.platformShared)) { toast.error('Shared questions are managed by the super admin.'); return; }
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

  const toggleQuestionActions = (question, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (actionMenuId === question._id) {
      setActionMenuId('');
      setActionMenuPopup(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const estimatedMenuHeight = question.status === 'draft' ? 206 : 170;
    const viewportPadding = 12;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= estimatedMenuHeight + 8
      ? rect.bottom + 8
      : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8);

    setActionMenuPopup({ question, top, left });
    setActionMenuId(question._id);
  };

  return (
    <div className={embedded ? 'bg-white dark:bg-gray-900 md:flex md:h-[calc(100vh-5.5rem)] md:min-h-0 md:flex-col' : 'min-h-screen bg-white dark:bg-gray-900'}>
      <div className={embedded ? 'w-full md:flex md:min-h-0 md:flex-1 md:flex-col' : 'mx-auto max-w-7xl px-4 py-6'}>
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
          <div className="mt-1 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-xs text-slate-600 dark:border-sky-900/60 dark:bg-sky-900/15 dark:text-gray-300">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><span className="font-bold text-sky-800 dark:text-sky-200">Adding questions to:</span> <span className="font-semibold text-slate-900 dark:text-white">{assessmentTitle}</span></div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 shadow-sm dark:bg-gray-900 dark:text-sky-300">Selection mode</span>
            </div>
            <div className="mt-1.5 leading-5">
              {lockType ? `Only ${labelForType(lockType).toLowerCase()} are available in this flow. Other question types are hidden to keep section mapping clean.` : (Object.keys(selectionSummary).length
                ? Object.entries(selectionSummary).map(([type, count]) => `${count} ${labelForType(type)}`).join(' • ')
                : 'Choose questions across any category. They will be grouped by type automatically when added to the assessment.')}
            </div>
            <p className="mt-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">Questions already present in this assessment are marked Added and cannot be selected again.</p>
          </div>
        )}

        {!selectionMode && bulkSelecting && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/15 dark:text-sky-300">
            <div className="font-semibold">
              {selectedIds.size ? `${selectedIds.size} question${selectedIds.size === 1 ? '' : 's'} selected` : 'Select questions to run bulk actions.'}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleSelectVisibleQuestions} className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">
                {eligibleQuestions.length > 0 && eligibleQuestions.every((question) => selectedIds.has(question._id)) ? 'Clear Page' : 'Select Page'}
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
                  setFilters((prev) => ({
                    ...prev,
                    type: category.type,
                    ...(category.type === 'coding' ? {} : { topicIds: [], tagIds: [], topicLabels: [], tagLabels: [], uncategorized: false, viewMode: 'questions' }),
                  }));
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

        <div className={`${embedded ? 'shrink-0' : 'mt-5'} flex flex-col gap-2 border-b border-slate-200 pb-3 dark:border-gray-800 xl:flex-row xl:items-center`}>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus-within:ring-sky-900/30">
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
                <button type="button" onClick={toggleBulkSelecting} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition-colors ${bulkSelecting ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}><CheckSquare className="h-3.5 w-3.5" />{bulkSelecting ? `${selectedIds.size} selected` : 'Select'}</button>
                {bulkSelecting && (
                  <div className="relative">
                    <button type="button" aria-label="Bulk actions" aria-expanded={bulkMenuOpen} onClick={() => setBulkMenuOpen((open) => !open)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><MoreVertical className="h-4 w-4" /></button>
                    {bulkMenuOpen && (
                      <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-xs font-semibold text-slate-600 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        <div className="border-b border-slate-100 px-3 py-2.5 dark:border-gray-800"><p className="font-bold text-slate-900 dark:text-white">Bulk actions</p><p className="mt-0.5 text-[10px] font-normal text-slate-400">{selectedIds.size} selected</p></div>
                        <button type="button" onClick={toggleSelectVisibleQuestions} disabled={!eligibleQuestions.length} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-gray-800"><CheckSquare className="h-3.5 w-3.5" />{eligibleQuestions.length && eligibleQuestions.every((question) => selectedIds.has(question._id)) ? 'Clear current page' : 'Select current page'}</button>
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
                <button type="button" onClick={() => navigate(returnTo)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
                <button type="button" onClick={selectAllMatchingQuestions} disabled={!total || selectingAll} className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300"><CheckSquare className="h-3.5 w-3.5" />{selectingAll ? 'Selecting...' : `Select all ${total}`}</button>
                <button type="button" onClick={handleAddSelected} disabled={!selectedIds.size} className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"><CheckSquare className="h-3.5 w-3.5" />Add selected ({selectedIds.size})</button>
              </>
            )}
            <button type="button" aria-expanded={filterPanelOpen} onClick={() => { setFilterPanelOpen(true); setColumnsPanelOpen(false); }} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition-colors ${filterPanelOpen || activeFilterCount ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
              <Filter className="h-3.5 w-3.5" /> Filters
              {activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
            </button>

            <div className="relative">
              <button type="button" aria-expanded={columnsPanelOpen} onClick={() => { setColumnsPanelOpen((open) => !open); setFilterPanelOpen(false); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"><Columns3 className="h-3.5 w-3.5" /> Columns</button>
              {columnsPanelOpen && (
                <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                  <div className="px-1 pb-2"><p className="text-sm font-bold text-slate-900 dark:text-white">Visible columns</p><p className="mt-0.5 text-[11px] text-slate-500">Saved for this browser.</p></div>
                  <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-2 py-2 text-xs font-medium text-slate-700 dark:bg-gray-800 dark:text-gray-200"><input type="checkbox" checked disabled className="h-4 w-4 rounded border-slate-300 text-sky-600" /><span className="flex-1">Question type</span><span className="text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">Required</span></div>
                  {Object.entries({ difficulty: 'Difficulty', tags: 'Tags / topics', usedIn: 'Used in assessments', updated: 'Last updated' }).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"><input type="checkbox" checked={visibleColumns[key]} onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))} className="h-4 w-4 rounded border-slate-300 text-sky-600" />{label}</label>
                  ))}
                  <button type="button" onClick={() => setVisibleColumns({ type: true, difficulty: true, tags: true, usedIn: true, source: false, updated: true })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Restore defaults</button>
                </div>
              )}
            </div>

            <select value={`${filters.sortBy}:${filters.sortOrder}`} onChange={(event) => { const [sortBy, sortOrder] = event.target.value.split(':'); setFilters((prev) => ({ ...prev, sortBy, sortOrder })); setPage(1); }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <option value="updatedAt:desc">Recently updated</option>
              <option value="createdAt:desc">Recently created</option>
              <option value="questionText:asc">Question A–Z</option>
              <option value="difficulty:asc">Difficulty</option>
            </select>
            <button type="button" onClick={refreshLibrary} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Refresh library"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2 dark:border-gray-700 dark:bg-gray-900/70">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5 [scrollbar-width:thin]">
              <span className="shrink-0 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Active filters</span>
              {[['search', filters.search ? `Search: ${filters.search}` : ''], ['difficulty', filters.difficulty], ['tag', filters.tag], ['status', filters.status], ['visibility', filters.visibility], ['sourceAssessmentId', availableAssessments.find((item) => item.id === filters.sourceAssessmentId)?.title]].filter(([, value]) => value).map(([key, value]) => <button key={key} type="button" onClick={() => { if (key === 'search') setSearchInput(''); setFilters((prev) => ({ ...prev, [key]: '' })); setPage(1); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">{value}<X className="h-3 w-3" /></button>)}
              {(filters.topicLabels || []).map((item) => <button key={`topic-${item.id}`} type="button" onClick={() => removeClassificationFilter('topic', item.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">{item.name}<X className="h-3 w-3" /></button>)}
              {(filters.topicIds || []).length > 0 && !(filters.topicLabels || []).length && <button type="button" onClick={() => { setFilters((prev) => ({ ...prev, topicIds: [] })); setPage(1); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">{filters.topicIds.length} topics · {filters.topicMatch === 'all' ? 'all' : 'any'}<X className="h-3 w-3" /></button>}
              {(filters.tagLabels || []).map((item) => <button key={`tag-${item.id}`} type="button" onClick={() => removeClassificationFilter('tag', item.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">{item.name}<X className="h-3 w-3" /></button>)}
              {(filters.tagIds || []).length > 0 && !(filters.tagLabels || []).length && <button type="button" onClick={() => { setFilters((prev) => ({ ...prev, tagIds: [] })); setPage(1); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">{filters.tagIds.length} tags · {filters.tagMatch === 'all' ? 'all' : 'any'}<X className="h-3 w-3" /></button>}
              {filters.uncategorized && <button type="button" onClick={() => { setFilters((prev) => ({ ...prev, uncategorized: false })); setPage(1); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">No topic assigned<X className="h-3 w-3" /></button>}
              {filters.viewMode === 'folders' && <button type="button" onClick={() => setFilters((prev) => ({ ...prev, viewMode: 'questions' }))} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">{filters.folderBy === 'tags' ? 'Tag folders' : 'Topic folders'}<X className="h-3 w-3" /></button>}
            </div>
            <span className="shrink-0 border-l border-slate-200 pl-2 text-[11px] font-bold tabular-nums text-slate-600 dark:border-gray-700 dark:text-gray-300">{filters.viewMode === 'folders' ? `${folderTotal} folders` : `${total} results`}</span>
            <button type="button" onClick={resetFilters} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/30">Clear all</button>
          </div>
        )}

        <div className={`${embedded ? 'mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden' : 'mt-5 overflow-hidden'} rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900`}>
          <div className="w-full min-w-0">
          <div className={`grid min-w-0 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 ${embedded ? 'sticky top-0 z-20 shadow-[0_1px_0_rgba(148,163,184,0.18)]' : ''}`} style={{ gridTemplateColumns: columnTemplate }}>
            {rowSelectionActive ? <div className="flex items-center justify-center"><input type="checkbox" aria-label="Select all available questions on this page" checked={eligibleQuestions.length > 0 && eligibleQuestions.every((question) => selectedIds.has(question._id))} disabled={!eligibleQuestions.length} onChange={toggleSelectVisibleQuestions} className="h-4 w-4 rounded border-slate-300 text-sky-600 disabled:opacity-40" /></div> : null}
            <div className="min-w-0">Question</div>
            <div className="min-w-0">Question type</div>
            {visibleColumns.difficulty && <div>Difficulty</div>}
            {visibleColumns.tags && <div className="min-w-0">Tags / Topics</div>}
            {visibleColumns.usedIn && <div className="min-w-0 leading-4">Used in assessments</div>}
            {visibleColumns.updated && <div>Updated</div>}
            {!rowSelectionActive ? <div className="text-right">Actions</div> : null}
          </div>

          {filters.type === 'coding' && filters.viewMode === 'folders' ? (
            folderLoading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading folders...</div> : folderItems.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No topic or tag folders match the current filters.</div> : <div>
              {folderItems.map((folder, folderIndex) => {
                const folderId = String(folder._id);
                const expanded = expandedFolderId === folderId;
                const folderData = folderQuestions[folderId] || {};
                const items = folderData.items || [];
                const questionPagination = folderData.pagination || { page: 1, pages: 1, total: 0 };
                const allInFolder = Boolean(folderData.allInFolder);
                const count = Number(folder[filters.folderBy === 'tags' ? 'questionCount' : 'directQuestionCount'] || 0);
                return <div key={folderId} className="border-b border-slate-200 last:border-b-0 dark:border-gray-800">
                  <button type="button" onClick={() => toggleQuestionFolder(folder)} className="flex w-full items-center gap-3 bg-white px-4 py-3.5 text-left transition hover:bg-sky-50/60 dark:bg-gray-900 dark:hover:bg-sky-950/20">
                    <span className="flex h-7 min-w-8 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs font-bold tabular-nums text-slate-500 dark:bg-gray-800 dark:text-gray-300">{((page - 1) * pageSize) + folderIndex + 1}</span>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${filters.folderBy === 'tags' ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300' : 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300'}`}><Folder className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{folder.name}</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{filters.folderBy === 'tags' ? 'Tag folder' : 'Topic folder'}</span></span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-600 dark:bg-gray-800 dark:text-gray-300">{count} total</span>
                    {expanded && !allInFolder && folderData.pagination && Number(questionPagination.total) < count && <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold tabular-nums text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">{questionPagination.total} matching</span>}
                    {folderQuestionLoading === folderId ? <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" /> : <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
                  </button>
                  {expanded && <div className="border-t border-slate-200 bg-slate-50/40 dark:border-gray-800 dark:bg-gray-950/20">
                    {folderQuestionLoading !== folderId && folderData.pagination && (allInFolder || Number(questionPagination.total) < count) && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-sky-50/70 px-4 py-2.5 text-xs dark:border-sky-900/60 dark:bg-sky-950/20"><span className="font-medium text-slate-600 dark:text-gray-300">{allInFolder ? `Showing all ${count} questions in ${folder.name}.` : `${questionPagination.total} questions match the current search and filters out of ${count} total.`}</span><button type="button" onClick={() => loadFolderQuestionPage(folder, 1, { allInFolder: !allInFolder })} className="shrink-0 rounded-lg border border-sky-200 bg-white px-3 py-1.5 font-bold text-sky-700 shadow-sm hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">{allInFolder ? 'Apply current filters' : `View all ${count}`}</button></div>}
                    {folderQuestionLoading === folderId ? <div className="p-6 text-center text-xs text-slate-500">Loading matching questions...</div> : items.length === 0 ? <div className="p-6 text-center text-xs text-slate-500">No questions match the remaining filters in this folder.</div> : items.map((question, questionIndex) => <div key={`${folderId}-${question._id}`} onClick={() => (rowSelectionActive ? toggleSelection(question) : previewQuestion(question))} role="button" tabIndex={0} className="grid min-w-0 cursor-pointer items-center gap-2 border-b border-slate-200/70 px-3 py-3 text-sm text-slate-600 last:border-b-0 hover:bg-white dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900" style={{ gridTemplateColumns: columnTemplate }}>
                      {rowSelectionActive ? <div className="flex justify-center"><input type="checkbox" checked={selectedIds.has(question._id)} onChange={(event) => { event.stopPropagation(); toggleSelection(question); }} onClick={(event) => event.stopPropagation()} className="h-4 w-4 rounded border-slate-300 text-sky-600" /></div> : null}
                      <div className="flex min-w-0 items-center gap-2"><span className="flex h-6 min-w-7 items-center justify-center rounded-md bg-white px-1.5 text-[10px] font-bold tabular-nums text-slate-500 shadow-sm dark:bg-gray-800 dark:text-gray-300">{((Number(questionPagination.page) - 1) * pageSize) + questionIndex + 1}</span><span className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-gray-100">{getLibraryQuestionTitle(question)}</span><button type="button" onClick={(event) => { event.stopPropagation(); setStatementModal({ open: true, title: getLibraryQuestionTitle(question), statement: getFullQuestionStatement(question) }); }} className="shrink-0 text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400">+ More</button></div>
                      <div className="truncate text-xs font-semibold">{labelForQuestionType(question)}</div>
                      {visibleColumns.difficulty && <div><span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold dark:border-gray-700 dark:bg-gray-800">{question.difficulty || 'Not set'}</span></div>}
                      {visibleColumns.tags && <div className="flex min-w-0 gap-1 overflow-hidden">{(question.tags || []).slice(0, 2).map((tag) => <span key={`${question._id}-${tag}`} className="max-w-[90px] truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] dark:border-gray-700 dark:bg-gray-800">{tag}</span>)}{(question.tags || []).length > 2 && <button type="button" onClick={(event) => { event.stopPropagation(); openTagsModal(question.questionText || 'Question', question.tags || []); }} className="shrink-0 rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">+{question.tags.length - 2}</button>}</div>}
                      {visibleColumns.usedIn && <div className="flex min-w-0 gap-1 overflow-hidden">{(question.usedInAssessments || []).length ? <>{question.usedInAssessments.slice(0, 1).map((assessment) => <span key={`${question._id}-${assessment}`} className="max-w-[100px] truncate rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">{assessment}</span>)}{question.usedInAssessments.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); setUsageModal({ open: true, questionText: question.questionText || 'Question', assessments: question.usedInAssessments || [] }); }} className="shrink-0 text-[10px] font-bold text-sky-600">+{question.usedInAssessments.length - 1}</button>}</> : <span className="truncate text-xs text-slate-400">Not used yet</span>}</div>}
                      {visibleColumns.updated && <div className="text-xs text-slate-500">{question.updatedAt ? new Date(question.updatedAt).toLocaleDateString() : '-'}</div>}
                      {!rowSelectionActive ? <div className="flex justify-end gap-1"><button type="button" onClick={(event) => { event.stopPropagation(); previewQuestion(question); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-700 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300" aria-label={`Preview ${getLibraryQuestionTitle(question)}`}><Eye className="h-4 w-4" /></button>{!question.platformShared && <button id={`question-actions-trigger-${question._id}`} data-platform-menu-trigger type="button" aria-haspopup="menu" aria-controls="question-library-action-menu" aria-expanded={actionMenuId === question._id} onClick={(event) => toggleQuestionActions(question, event)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300" aria-label={`Actions for ${getLibraryQuestionTitle(question)}`}><MoreVertical className="h-4 w-4" /></button>}</div> : null}
                    </div>)}
                    {folderQuestionLoading !== folderId && items.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"><span>Showing {((Number(questionPagination.page) - 1) * pageSize) + 1}-{Math.min(Number(questionPagination.page) * pageSize, Number(questionPagination.total))} of {questionPagination.total} {allInFolder ? 'folder' : 'matching'} questions</span><div className="flex items-center gap-1.5"><button type="button" disabled={Number(questionPagination.page) <= 1} onClick={() => loadFolderQuestionPage(folder, Number(questionPagination.page) - 1, { allInFolder })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="min-w-20 text-center font-semibold">Page {questionPagination.page} of {questionPagination.pages}</span><button type="button" disabled={Number(questionPagination.page) >= Number(questionPagination.pages)} onClick={() => loadFolderQuestionPage(folder, Number(questionPagination.page) + 1, { allInFolder })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"><ChevronRight className="h-3.5 w-3.5" /></button></div></div>}
                  </div>}
                </div>;
              })}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400"><div className="flex flex-wrap items-center gap-3"><span>Showing {folderItems.length ? ((page - 1) * pageSize) + 1 : 0}-{Math.min(page * pageSize, folderTotal)} of {folderTotal} folders</span><div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900"><span className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Per page</span>{LIBRARY_PAGE_SIZES.map((size) => <button key={size} type="button" onClick={() => { setPageSize(size); setPage(1); }} className={`h-7 min-w-9 rounded-md px-2 text-xs font-bold transition ${pageSize === size ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-sky-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}>{size}</button>)}</div></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="min-w-20 text-center font-semibold">Page {page} of {folderPages}</span><button type="button" onClick={() => setPage((current) => Math.min(folderPages, current + 1))} disabled={page >= folderPages} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"><ChevronRight className="h-3.5 w-3.5" /></button></div></div>
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-gray-400">Loading library questions...</div>
          ) : questions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{filters.status === 'draft' ? 'No draft questions yet' : 'No questions found'}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{filters.status === 'draft' ? 'Choose Save draft while creating or editing a question and it will appear here.' : 'No questions matched the current filters.'}</p>
            </div>
          ) : (
            questions.map((question, questionIndex) => (
              <div
                key={question._id}
                onClick={() => (rowSelectionActive ? toggleSelection(question) : previewQuestion(question))}
                className={`grid w-full min-w-0 items-center gap-2 border-b border-slate-200/80 px-3 py-3 text-left text-sm text-slate-600 transition-colors last:border-b-0 dark:border-gray-800 dark:text-gray-300 ${questionAlreadyAdded(question) ? 'cursor-not-allowed bg-slate-50/80 opacity-65 dark:bg-gray-800/50' : 'cursor-pointer hover:bg-sky-50/50 dark:hover:bg-sky-950/20'} ${selectedIds.has(question._id) ? 'bg-sky-50/60 dark:bg-sky-900/10' : ''}`}
                style={{ gridTemplateColumns: columnTemplate }}
                role="button"
                tabIndex={0}
                aria-disabled={questionAlreadyAdded(question)}
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
                      disabled={questionAlreadyAdded(question)}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleSelection(question);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-800 dark:text-gray-100">
                    <span className="flex h-6 min-w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 px-1.5 text-[11px] font-bold tabular-nums text-slate-500 dark:bg-gray-800 dark:text-gray-300">
                      {(page - 1) * pageSize + questionIndex + 1}
                    </span>
                    {isPassageSet(question) && <BookOpenText className="h-4 w-4 shrink-0 text-sky-600" />}
                    <span className="min-w-0 max-w-[calc(100%-3.25rem)] truncate leading-5">{getLibraryQuestionTitle(question)}</span>
                    {question.platformShared && <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">Shared</span>}
                    {questionAlreadyAdded(question) && <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">Added</span>}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setStatementModal({ open: true, title: getLibraryQuestionTitle(question), statement: getFullQuestionStatement(question) });
                      }}
                      className="inline-flex shrink-0 items-center px-0.5 text-[11px] font-semibold leading-5 text-sky-600 transition-colors hover:text-sky-800 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                    >
                      + More
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center text-[11px] text-slate-500 dark:text-gray-400">
                    <QuestionStateBadge question={question} />
                    <span className="mx-1.5 text-slate-300">•</span>
                    {question.platformShared ? <span>Added by Super Admin</span> : <button type="button" onClick={(event) => { event.stopPropagation(); setActorModal(question.createdBy || { role: 'admin', name: 'Administrator' }); }} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">Added by {question.createdBy?.name || (question.createdBy?.role === 'coordinator' ? 'Coordinator' : 'Administrator')}</button>}
                  </div>
                </div>
                <div className="min-w-0 truncate text-xs font-semibold leading-5 text-slate-700 dark:text-gray-200" title={labelForQuestionType(question)}>{labelForQuestionType(question)}</div>
                {visibleColumns.difficulty && <div><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${String(question.difficulty || '').toLowerCase() === 'hard' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/15 dark:text-rose-300' : String(question.difficulty || '').toLowerCase() === 'medium' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/15 dark:text-amber-300' : String(question.difficulty || '').toLowerCase() === 'easy' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/15 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>{question.difficulty || 'Not set'}</span></div>}
                {visibleColumns.tags && <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                  {(question.tags || []).length ? (
                    <>
                      {(question.tags || []).slice(0, 2).map((tag) => (
                        <span key={`${question._id}-${tag}`} title={tag} className="min-w-0 max-w-[88px] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {tag}
                        </span>
                      ))}
                      {(question.tags || []).length > 2 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openTagsModal(question.questionText || 'Question', question.tags || []);
                          }}
                          className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
                        >
                          +{(question.tags || []).length - 2} more
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-gray-400">-</span>
                  )}
                </div>}
                {visibleColumns.usedIn && <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                  {(question.usedInAssessments || []).length ? <>
                    {(question.usedInAssessments || []).slice(0, 2).map((assessment) => <span key={`${question._id}-usage-${assessment}`} title={assessment} className="min-w-0 max-w-[88px] truncate rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">{assessment}</span>)}
                    {(question.usedInAssessments || []).length > 2 && <button type="button" onClick={(event) => { event.stopPropagation(); setUsageModal({ open: true, questionText: question.questionText || 'Question', assessments: question.usedInAssessments || [] }); }} className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">+{question.usedInAssessments.length - 2} more</button>}
                  </> : <span className="text-xs text-slate-400 dark:text-gray-500">Not used yet</span>}
                </div>}
                {visibleColumns.updated && <div className="text-xs text-slate-500 dark:text-gray-400">{question.updatedAt ? new Date(question.updatedAt).toLocaleDateString() : '-'}</div>}
                {!rowSelectionActive && (
                  <div className="relative flex min-w-0 justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        previewQuestion(question);
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
                      aria-label={`Preview ${question.questionText || 'question'}`}
                      title="Candidate preview"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {!question.platformShared && <button
                      id={`question-actions-trigger-${question._id}`}
                      data-platform-menu-trigger
                      aria-expanded={actionMenuId === question._id}
                      aria-haspopup="menu"
                      aria-controls="question-library-action-menu"
                      type="button"
                      onClick={(event) => toggleQuestionActions(question, event)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-label="Question actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>}
                  </div>
                )}
              </div>
            ))
          )}
          </div>
        </div>

        {actorModal && <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setActorModal(null); }}><div role="dialog" aria-modal="true" aria-label="Record creator" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">Added by</p><h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{actorModal.name || 'Administrator'}</h2></div><button type="button" onClick={() => setActorModal(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button></div><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Role</dt><dd className="mt-1 capitalize font-semibold text-slate-800 dark:text-slate-100">{actorModal.role || 'admin'}</dd></div>{actorModal.email && <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Email</dt><dd className="mt-1 break-all text-slate-700 dark:text-slate-200">{actorModal.email}</dd></div>}{actorModal.coordinatorId && <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Teacher ID</dt><dd className="mt-1 font-mono font-bold text-slate-700 dark:text-slate-200">{actorModal.coordinatorId}</dd></div>}</dl></div></div>}

        {filters.viewMode !== 'folders' && <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:text-gray-400">
          <div className="flex flex-wrap items-center gap-3"><span>Showing {questions.length ? ((page - 1) * pageSize) + 1 : 0}-{Math.min(page * pageSize, total)} of {total} questions</span><div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-gray-700 dark:bg-gray-800"><span className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Rows</span>{LIBRARY_PAGE_SIZES.map((size) => <button key={size} type="button" onClick={() => { setPageSize(size); setPage(1); }} className={`h-7 min-w-9 rounded-md px-2 text-xs font-bold transition ${pageSize === size ? 'bg-sky-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-sky-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{size}</button>)}</div></div>
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
        </div>}
      </div>

      {actionMenuId && actionMenuPopup && createPortal(
        <div
          id="question-library-action-menu"
          data-platform-action-menu
          role="menu"
          aria-labelledby={`question-actions-trigger-${actionMenuPopup.question._id}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="fixed z-[1000] w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 text-xs font-semibold text-slate-600 shadow-[0_18px_46px_rgba(15,23,42,0.18)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          style={{ top: actionMenuPopup.top, left: actionMenuPopup.left }}
        >
          <button type="button" role="menuitem" onClick={() => startEditQuestion(actionMenuPopup.question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800"><Edit3 className="h-3.5 w-3.5" /> Edit</button>
          {actionMenuPopup.question.status === 'draft' && <button type="button" role="menuitem" onClick={() => publishDraft(actionMenuPopup.question)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"><CheckSquare className="h-3.5 w-3.5" /> Publish</button>}
          <button type="button" role="menuitem" onClick={() => toggleVisibility(actionMenuPopup.question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800">{actionMenuPopup.question.visibility === 'private' ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{actionMenuPopup.question.visibility === 'private' ? 'Make Public' : 'Make Private'}</button>
          <button type="button" role="menuitem" onClick={() => toggleHiddenStatus(actionMenuPopup.question)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-gray-800"><EyeOff className="h-3.5 w-3.5" />{actionMenuPopup.question.status === 'hidden' ? 'Unhide' : 'Hide'}</button>
          <button type="button" role="menuitem" onClick={() => deleteQuestion(actionMenuPopup.question)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>,
        document.body,
      )}

      <CodingQuestionFilterDrawer
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
        filters={filters}
        onApply={(nextFilters) => {
          setFilters((current) => ({ ...current, ...nextFilters, type: lockType || nextFilters.type || 'all' }));
          setPage(1);
        }}
        availableDifficulties={availableDifficulties}
        availableAssessments={availableAssessments}
      />

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
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className="fixed inset-y-0 right-0 z-[61] flex w-full justify-end lg:w-[86vw] xl:max-w-[1480px]"
              onClick={() => setActiveQuestion(null)}
            >
              <div
                className="flex h-dvh w-full flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-gray-700 dark:bg-gray-950"
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
                    {activeQuestion && !activeQuestion.platformShared && <button type="button" onClick={() => { setActiveQuestion(null); startEditQuestion(activeQuestion); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"><Edit3 className="h-3.5 w-3.5" />Edit question</button>}
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
        {statementModal.open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-sm" onClick={() => setStatementModal({ open: false, title: '', statement: '' })} />
            <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} className="fixed inset-0 z-[71] flex items-center justify-center p-4" onClick={() => setStatementModal({ open: false, title: '', statement: '' })}>
              <section className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900" role="dialog" aria-modal="true" aria-label="Full question statement" onClick={(event) => event.stopPropagation()}>
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-gray-800">
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">Full question statement</p><h3 className="mt-1 text-base font-bold text-slate-950 dark:text-white">{statementModal.title}</h3></div>
                  <button type="button" onClick={() => setStatementModal({ open: false, title: '', statement: '' })} className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Close full statement"><X className="h-4 w-4" /></button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-gray-200">{statementModal.statement}</p></div>
              </section>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {usageModal.open && <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-sm" onClick={() => setUsageModal({ open: false, questionText: '', assessments: [] })} />
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed inset-0 z-[61] flex items-center justify-center px-4">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4"><div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">Used in assessments</div><h3 className="mt-2 line-clamp-2 text-lg font-semibold text-slate-900 dark:text-white">{usageModal.questionText}</h3></div><button type="button" onClick={() => setUsageModal({ open: false, questionText: '', assessments: [] })} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Close assessment usage"><X className="h-4 w-4" /></button></div>
              <div className="mt-5 max-h-72 space-y-2 overflow-y-auto pr-1" role="list" aria-label="Assessments using this question">
                {usageModal.assessments.map((assessment, index) => (
                  <div key={`usage-${assessment}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" role="listitem">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[11px] font-extrabold tabular-nums text-white shadow-sm ring-2 ring-violet-100 dark:ring-violet-900/50">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate" title={assessment}>{assessment}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>}
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
                <div className="mt-5 max-h-72 space-y-2 overflow-y-auto pr-1" role="list" aria-label="Question tags and topics">
                  {tagsModal.tags.map((tag, index) => (
                    <div key={`modal-${tag}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800" role="listitem">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-[11px] font-extrabold tabular-nums text-white shadow-sm ring-2 ring-sky-100 dark:ring-sky-900/50">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-gray-200" title={tag}>{tag}</span>
                    </div>
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
