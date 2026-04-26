import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckSquare, Eye, Library, Search, Tag, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { queueQuestionSelection } from './assessment/assessmentProblemSelectionStore';

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
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Difficulty</div>
          <div className="mt-1 font-semibold text-slate-800 dark:text-white">{coding.difficulty || question.difficulty || '-'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Languages</div>
          <div className="mt-1 font-semibold text-slate-800 dark:text-white">{coding.supportedLanguages?.length || 0}</div>
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

  const [filters, setFilters] = useState({
    type: initialType,
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
      setPage(1);
    }, 160);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
  }, [filters, page, toast]);

  const categoryTabs = useMemo(() => {
    const coreTypes = ['mcq', 'one_line', 'short', 'coding'];
    const counts = new Map();
    (categories || []).forEach((entry) => {
      if (!entry?.type) return;
      counts.set(entry.type, Number(entry.count) || 0);
    });

    const coreTabs = coreTypes.map((type) => ({ type, count: counts.get(type) || 0 }));
    const extras = (categories || []).filter((entry) => entry?.type && !coreTypes.includes(entry.type));

    return [{ type: 'all', count: total }, ...coreTabs, ...extras];
  }, [categories, total]);

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
      queueQuestionSelection(assessmentKey, { questions: data.questions || [] });
      toast.success('Selected library questions added to the assessment draft.');
      navigate(returnTo);
    } catch (error) {
      toast.error(error.message || 'Failed to add selected questions.');
    }
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

          {selectionMode && (
            <button
              type="button"
              onClick={handleAddSelected}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
            >
              <CheckSquare className="h-4 w-4" />
              Add Selected ({selectedIds.size})
            </button>
          )}
        </div>

        {selectionMode && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <div className="font-semibold text-slate-800 dark:text-white">Mixed selection is enabled.</div>
            <div className="mt-1">
              {Object.keys(selectionSummary).length
                ? Object.entries(selectionSummary).map(([type, count]) => `${count} ${labelForType(type)}`).join(' • ')
                : 'Choose questions across any category. They will be grouped by type automatically when added to the assessment.'}
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
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
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
          <div className={`grid gap-3 border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:border-gray-700 ${selectionMode ? 'grid-cols-[42px_1.7fr_0.9fr_0.9fr_1fr_0.8fr]' : 'grid-cols-[1.9fr_0.9fr_0.9fr_1fr_0.8fr_72px]'}`}>
            {selectionMode ? <div /> : null}
            <div>Question</div>
            <div>Type</div>
            <div>Tags</div>
            <div>Source</div>
            <div>Updated</div>
            {!selectionMode ? <div className="text-right">View</div> : null}
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-gray-400">Loading library questions...</div>
          ) : questions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-gray-400">No questions matched the current filters.</div>
          ) : (
            questions.map((question) => (
              <button
                key={question._id}
                type="button"
                onClick={() => openQuestion(question._id)}
                className={`grid w-full gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-600 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/60 ${selectionMode ? 'grid-cols-[42px_1.7fr_0.9fr_0.9fr_1fr_0.8fr]' : 'grid-cols-[1.9fr_0.9fr_0.9fr_1fr_0.8fr_72px]'}`}
              >
                {selectionMode && (
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
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-gray-200">{labelForType(question.questionType).replace(' Questions', '')}</div>
                <div className="text-xs text-slate-500 dark:text-gray-400">{question.tags?.join(', ') || '-'}</div>
                <div className="text-xs text-slate-500 dark:text-gray-400">{question.sourceTitle || question.sourceAssessmentTitle || '-'}</div>
                <div className="text-xs text-slate-500 dark:text-gray-400">{question.updatedAt ? new Date(question.updatedAt).toLocaleDateString() : '-'}</div>
                {!selectionMode && (
                  <div className="flex justify-end">
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-gray-700 dark:text-gray-300">
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </span>
                  </div>
                )}
              </button>
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
    </div>
  );
}
