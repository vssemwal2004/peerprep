import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { AlertTriangle, BookOpenText, ChevronLeft, ChevronRight, Code2, Copy, Edit2, Eye, EyeOff, FilePlus2, FileText, FlaskConical, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import RichTextEditor from './RichTextEditor';
import MonacoCodeEditor from './MonacoCodeEditor';
import {
  COMPILER_LANGUAGES,
  buildProblemFormData,
  createDefaultProblemForm,
  createEmptyFaq,
  createEmptyHiddenTestCase,
  createEmptySampleTestCase,
  createProblemFormFromProblem,
  deriveHiddenFilePairs,
  getLanguageLabel,
  parseBulkCasePair,
} from './compilerUtils';
import { EmptyState, LoadingPanel, SectionCard } from './CompilerUi';
import { loadCodingDraft, saveCodingDraft } from '../assessment/assessmentCodingStore';
import AuthoringStepper from '../library/AuthoringStepper';

const EDITOR_TABS = [
  { key: 'details', label: 'Description', shortLabel: 'Details', Icon: FileText },
  { key: 'tests', label: 'Solution & test cases', shortLabel: 'Tests', Icon: FlaskConical },
  { key: 'templates', label: 'Languages', shortLabel: 'Code', Icon: Code2 },
  { key: 'editorial', label: 'Editorial', shortLabel: 'Review', Icon: BookOpenText },
];

const PAIR_TEMPLATE_FILES = [
  { name: 'input_1.txt', content: '2 3\n' },
  { name: 'output_1.txt', content: '5\n' },
  { name: 'input_2.txt', content: '10 20\n' },
  { name: 'output_2.txt', content: '30\n' },
];

const BULK_INPUT_TEMPLATE = '2 3\n###CASE###\n10 20\n###CASE###\n7 8\n';
const BULK_OUTPUT_TEMPLATE = '5\n###CASE###\n30\n###CASE###\n15\n';

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function TemplateButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <FilePlus2 className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function RequiredFieldLabel({ children, optional = false }) {
  return <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">{children}{optional ? <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span> : <span className="ml-1 font-bold text-rose-500" aria-label="required">*</span>}</label>;
}

function TestCaseEditorCard({ title, cases, onAdd, onRemove, onDuplicate, onChange, includeExplanation = false, staged = false }) {
  const [savedIndexes, setSavedIndexes] = useState(() => new Set(
    cases.map((testCase, index) => ((testCase.input || testCase.output) ? index : null)).filter((index) => index !== null),
  ));
  const [expandedIndexes, setExpandedIndexes] = useState(() => new Set());
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!staged) return;
    setSavedIndexes((current) => new Set([...current].filter((index) => index < cases.length)));
    setExpandedIndexes((current) => new Set([...current].filter((index) => index < cases.length)));
  }, [cases.length, staged]);

  const updateCase = (index, field, value) => {
    onChange(index, field, value);
    if (staged) {
      setSavedIndexes((current) => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
    }
    setValidationError('');
  };

  const saveCase = (index) => {
    const testCase = cases[index];
    if (!String(testCase?.input || '').trim() || !String(testCase?.output || '').trim()) {
      setValidationError(`Add both input and expected output before saving this ${title.toLowerCase()} case.`);
      return;
    }
    setSavedIndexes((current) => new Set([...current, index]));
    setValidationError('');
  };

  const removeCase = (index) => {
    onRemove(index);
    setSavedIndexes((current) => new Set([...current].filter((item) => item !== index).map((item) => item > index ? item - 1 : item)));
    setExpandedIndexes((current) => new Set([...current].filter((item) => item !== index).map((item) => item > index ? item - 1 : item)));
    setValidationError('');
  };

  const togglePreview = (index) => {
    setExpandedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const allCasesSaved = !staged || cases.length === 0 || cases.every((_, index) => savedIndexes.has(index));

  return (
    <div className="space-y-4">
      {cases.map((testCase, index) => savedIndexes.has(index) && staged ? (
        <div key={`${title}-${index}`} className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title} {index + 1} saved</h4>
              <p className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-gray-400">Input: {testCase.input}</p>
              <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{Number(testCase.marks) || 1} mark(s)</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <button type="button" onClick={() => togglePreview(index)} title={expandedIndexes.has(index) ? 'Hide case details' : 'View case details'} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-white/80 dark:text-gray-300 dark:hover:bg-gray-900/60">{expandedIndexes.has(index) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{expandedIndexes.has(index) ? 'Hide' : 'View'}</button>
              <button type="button" onClick={() => setSavedIndexes((current) => { const next = new Set(current); next.delete(index); return next; })} title="Edit case" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-sky-700 hover:bg-white/80 dark:text-sky-300 dark:hover:bg-gray-900/60"><Edit2 className="h-3.5 w-3.5" />Edit</button>
              {onDuplicate && <button type="button" onClick={() => onDuplicate(index)} title="Duplicate case" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-white/80 dark:text-gray-300 dark:hover:bg-gray-900/60"><Copy className="h-3.5 w-3.5" />Duplicate</button>}
              <button type="button" onClick={() => removeCase(index)} title="Delete case" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-3.5 w-3.5" />Delete</button>
            </div>
          </div>
          </div>
          {expandedIndexes.has(index) && <div className={`grid gap-3 border-t border-emerald-200 bg-white/80 p-4 text-xs dark:border-emerald-800 dark:bg-gray-900/50 ${includeExplanation ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            <div><p className="font-bold uppercase tracking-wide text-slate-400">Input</p><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3 font-mono text-slate-700 dark:bg-gray-800 dark:text-gray-200">{testCase.input || '(empty)'}</pre></div>
            <div><p className="font-bold uppercase tracking-wide text-slate-400">Expected output</p><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3 font-mono text-slate-700 dark:bg-gray-800 dark:text-gray-200">{testCase.output || '(empty)'}</pre></div>
            {includeExplanation && <div><p className="font-bold uppercase tracking-wide text-slate-400">Explanation</p><p className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3 leading-5 text-slate-700 dark:bg-gray-800 dark:text-gray-200">{testCase.explanation || 'No explanation added.'}</p></div>}
          </div>}
        </div>
      ) : (
        <div key={`${title}-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title} {index + 1}</h4>
            <button type="button" onClick={() => removeCase(index)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
          <div className={`grid gap-4 ${includeExplanation ? 'md:grid-cols-[1fr_1fr_1fr_120px]' : 'md:grid-cols-[1fr_1fr_120px]'}`}>
            <textarea
              value={testCase.input}
              onChange={(event) => updateCase(index, 'input', event.target.value)}
              rows={5}
              placeholder="Input"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
            />
            <textarea
              value={testCase.output}
              onChange={(event) => updateCase(index, 'output', event.target.value)}
              rows={5}
              placeholder="Output"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
            />
            {includeExplanation ? (
              <textarea
                value={testCase.explanation}
                onChange={(event) => updateCase(index, 'explanation', event.target.value)}
                rows={5}
                placeholder="Explanation"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
            ) : null}
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-gray-400">Marks</span>
              <input type="number" min="0.01" step="0.5" value={testCase.marks ?? 1} onChange={(event) => updateCase(index, 'marks', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500" />
            </label>
          </div>
          {staged && <div className="mt-4 flex justify-end"><button type="button" onClick={() => saveCase(index)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"><Save className="h-4 w-4" />Save {title.toLowerCase()} case</button></div>}
        </div>
      ))}

      {cases.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-800/50"><p className="text-sm font-semibold text-slate-700 dark:text-gray-200">No {title.toLowerCase()} test cases</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Add a case and enter its input, expected output and marks.</p></div>}

      {validationError && <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{validationError}</p>}

      {allCasesSaved && <button
        type="button"
        onClick={() => { onAdd(); setValidationError(''); }}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Plus className="h-4 w-4" />
        {staged ? `Add another ${title.toLowerCase()} test` : `Add ${title}`}
      </button>}
    </div>
  );
}

function HintEditor({ hints, onAdd, onRemove, onChange }) {
  return (
    <div className="space-y-4">
      {(hints || []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
          No hints added yet. Add one or more optional hints for students to reveal while solving.
        </div>
      ) : (
        hints.map((hint, index) => (
          <div key={`hint-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Hint {index + 1}</h4>
              <button type="button" onClick={() => onRemove(index)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
            <textarea
              value={hint}
              onChange={(event) => onChange(index, event.target.value)}
              rows={4}
              placeholder="Guide the student without giving away the full solution."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
            />
          </div>
        ))
      )}

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Plus className="h-4 w-4" />
        Add Hint
      </button>
    </div>
  );
}

function FaqEditor({ faqs, onAdd, onRemove, onChange }) {
  return (
    <div className="space-y-4">
      {(faqs || []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-gray-700 dark:text-gray-400">
          FAQs are optional. Add common questions with a solution note when the problem needs extra clarification.
        </div>
      ) : (
        faqs.map((faq, index) => (
          <div key={`faq-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">FAQ {index + 1}</h4>
              <button type="button" onClick={() => onRemove(index)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
            <div className="grid gap-4">
              <input
                value={faq.question}
                onChange={(event) => onChange(index, 'question', event.target.value)}
                placeholder="Question students may ask"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
              <textarea
                value={faq.answer}
                onChange={(event) => onChange(index, 'answer', event.target.value)}
                rows={5}
                placeholder="Solution or clarification shown to students"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Plus className="h-4 w-4" />
        Add FAQ
      </button>
    </div>
  );
}

export default function CreateProblem({ mode = 'compiler', assessmentContext } = {}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { id, tempId } = useParams();
  const location = useLocation();
  
  // Read assessment context from URL params if not provided as prop
  const urlParams = new URLSearchParams(location.search);
  const urlMode = urlParams.get('mode');
  const isAssessmentFromUrl = urlMode === 'assessment';
  const isAssessment = mode === 'assessment' || isAssessmentFromUrl;
  
  const assessmentContextFromUrl = isAssessmentFromUrl ? {
    tempId: tempId || urlParams.get('tempId'),
    assessmentKey: urlParams.get('assessment'),
    sectionIndex: urlParams.get('section') ? parseInt(urlParams.get('section')) : 0,
    questionIndex: urlParams.get('question') ? parseInt(urlParams.get('question')) : 0,
    returnTo: urlParams.get('return'),
  } : {};
  
  const finalAssessmentContext = assessmentContext || assessmentContextFromUrl;
  
  const editorId = finalAssessmentContext?.tempId || (isAssessment ? tempId : id);
  const isEditMode = !isAssessment && Boolean(id);
  const [loading, setLoading] = useState(isAssessment ? false : isEditMode);
  const [form, setForm] = useState(() => createDefaultProblemForm());
  const [activeTab, setActiveTab] = useState('details');
  const [activeLanguage, setActiveLanguage] = useState('python');
  const [currentProblemId, setCurrentProblemId] = useState(finalAssessmentContext?.problemId || (isAssessment ? '' : (id || '')));
  const [currentStatus, setCurrentStatus] = useState('draft');
  const [previewValidated, setPreviewValidated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApprovingPreview, setIsApprovingPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const formRef = useRef(form);
  const autoSaveRef = useRef(null);
  const editorTopRef = useRef(null);
  const assessmentKey = finalAssessmentContext?.assessmentKey || 'new';
  const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const assessmentReturnTo = finalAssessmentContext?.returnTo || `${rolePrefix}/assessment`;

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (isAssessment) {
      const draft = editorId ? loadCodingDraft(editorId) : null;
      if (draft?.form) {
        setForm(draft.form);
      } else if (draft?.problemData) {
        setForm(createProblemFormFromProblem(draft.problemData));
      } else {
        setForm(createDefaultProblemForm());
      }
      setCurrentProblemId(draft?.problemId || draft?.problemData?._id || '');
      setCurrentStatus(draft?.status || 'draft');
      setPreviewValidated(Boolean(draft?.previewValidated ?? draft?.previewTested ?? draft?.problemData?.previewValidated ?? draft?.problemData?.previewTested));
      setActiveLanguage(draft?.form?.supportedLanguages?.[0] || draft?.problemData?.supportedLanguages?.[0] || 'python');
      setLoading(false);

      if (draft?.problemId && editorId) {
        api.getCompilerProblem(draft.problemId)
          .then((response) => {
            setPreviewValidated(Boolean(response.previewValidated ?? response.previewTested));
            setCurrentStatus(response.status || 'draft');
            saveCodingDraft(editorId, {
              problemId: response._id,
              problemData: response,
              previewValidated: Boolean(response.previewValidated ?? response.previewTested),
              status: (response.previewValidated ?? response.previewTested) ? 'Validated' : 'Draft',
            });
          })
          .catch(() => {});
      }
      return undefined;
    }

    if (!isEditMode) {
      setLoading(false);
      return undefined;
    }

    let isMounted = true;
    const loadProblem = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerProblem(id);
        if (!isMounted) return;
        setForm(createProblemFormFromProblem(response));
        setCurrentProblemId(response._id);
        setCurrentStatus(response.status || 'draft');
        setPreviewValidated(Boolean(response.previewValidated ?? response.previewTested));
        setActiveLanguage(response.supportedLanguages?.[0] || 'python');
      } catch (error) {
        toast.error(error.message || 'Failed to load problem for editing.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProblem();
    return () => {
      isMounted = false;
    };
  }, [id, isEditMode, toast, isAssessment, editorId, assessmentKey]);

  useEffect(() => {
    if (!form.supportedLanguages.includes(activeLanguage)) {
      setActiveLanguage(form.supportedLanguages[0] || 'python');
    }
  }, [activeLanguage, form.supportedLanguages]);

  const hiddenPairs = useMemo(() => deriveHiddenFilePairs(form.hiddenTestFiles), [form.hiddenTestFiles]);
  const visibleSampleCount = form.sampleTestCases.filter((testCase) => testCase.input || testCase.output || testCase.explanation).length;
  const manualHiddenCount = form.hiddenTestCases.filter((testCase) => testCase.input || testCase.output).length;
  const bulkHiddenCount = Number(form.hiddenBulkCaseCount || 0);
  const hiddenCount = form.hiddenTestUploadMode === 'bulk'
    ? Math.max(bulkHiddenCount, form.existingHiddenTestCaseCount || 0)
    : Math.max(hiddenPairs.pairs.filter((pair) => pair.complete).length, manualHiddenCount, form.existingHiddenTestCaseCount || 0);
  const activeTemplate = form.codeTemplates[activeLanguage] || '';
  const hasTemplate = form.supportedLanguages.some((language) => String(form.codeTemplates?.[language] || '').trim());
  const canAddToAssessment = isAssessment && previewValidated && visibleSampleCount > 0 && hiddenCount > 0 && hasTemplate;
  const canAddToAssessmentDynamic = currentStatus === 'published' && previewValidated && visibleSampleCount > 0 && hiddenCount > 0 && hasTemplate && currentProblemId;
  const validationStatus = previewValidated ? (canAddToAssessment ? 'Ready' : 'Validated') : 'Draft';

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setIsDirty(true);
  };

  const updateHiddenUploadMode = (mode) => {
    setForm((previous) => ({
      ...previous,
      hiddenTestUploadMode: mode,
      hiddenTestFiles: mode === 'pairs' ? previous.hiddenTestFiles : [],
      hiddenBulkInputFile: mode === 'bulk' ? previous.hiddenBulkInputFile : null,
      hiddenBulkOutputFile: mode === 'bulk' ? previous.hiddenBulkOutputFile : null,
      hiddenBulkCaseCount: mode === 'bulk' ? previous.hiddenBulkCaseCount : 0,
    }));
    setIsDirty(true);
  };

  const toggleLanguage = (languageId) => {
    setForm((previous) => {
      const hasLanguage = previous.supportedLanguages.includes(languageId);
      const supportedLanguages = hasLanguage
        ? previous.supportedLanguages.filter((item) => item !== languageId)
        : [...previous.supportedLanguages, languageId];

      return {
        ...previous,
        supportedLanguages: supportedLanguages.length > 0 ? supportedLanguages : [languageId],
      };
    });
    setIsDirty(true);
  };

  const updateTemplate = (language, nextTemplate) => {
    setForm((previous) => ({
      ...previous,
      codeTemplates: { ...previous.codeTemplates, [language]: nextTemplate },
    }));
    setIsDirty(true);
  };

  const updateSampleTestCase = (index, field, value) => {
    setForm((previous) => ({
      ...previous,
      sampleTestCases: previous.sampleTestCases.map((testCase, itemIndex) => (
        itemIndex === index ? { ...testCase, [field]: value } : testCase
      )),
    }));
    setIsDirty(true);
  };

  const updateHiddenTestCase = (index, field, value) => {
    setForm((previous) => ({
      ...previous,
      hiddenTestCases: previous.hiddenTestCases.map((testCase, itemIndex) => (
        itemIndex === index ? { ...testCase, [field]: value } : testCase
      )),
    }));
    setIsDirty(true);
  };

  const updateHint = (index, value) => {
    setForm((previous) => ({
      ...previous,
      hints: (previous.hints || []).map((hint, itemIndex) => (
        itemIndex === index ? value : hint
      )),
    }));
    setIsDirty(true);
  };

  const updateFaq = (index, field, value) => {
    setForm((previous) => ({
      ...previous,
      faqs: (previous.faqs || []).map((faq, itemIndex) => (
        itemIndex === index ? { ...faq, [field]: value } : faq
      )),
    }));
    setIsDirty(true);
  };

  const persistProblem = async (status, { redirectToPreview = false, silent = false } = {}) => {
    if (form.hiddenTestUploadMode === 'pairs' && hiddenPairs.issues.length > 0) {
      toast.error('Fix hidden testcase file issues before saving.');
      return null;
    }
    if (isSaving) return null;

    setIsSaving(true);
    if (silent) setAutoSaveStatus('Saving draft...');
    try {
      const payload = buildProblemFormData(form, status);
      const response = currentProblemId
        ? await api.updateCompilerProblem(currentProblemId, payload)
        : await api.createCompilerProblem(payload);

      const nextForm = {
        ...createProblemFormFromProblem(response),
        referenceSolutions: form.referenceSolutions || {},
        hiddenTestFiles: [],
        hiddenBulkInputFile: null,
        hiddenBulkOutputFile: null,
        hiddenBulkCaseCount: 0,
        previewValidated: Boolean(response.previewValidated ?? response.previewTested),
      };

      setCurrentProblemId(response._id);
      setCurrentStatus(response.status || status);
      setPreviewValidated(Boolean(response.previewValidated ?? response.previewTested));
      setForm(nextForm);
      setActiveLanguage((previous) => {
        if (response.supportedLanguages?.includes(previous)) {
          return previous;
        }
        return response.supportedLanguages?.[0] || 'python';
      });
      setIsDirty(false);

      if (isAssessment && editorId) {
        saveCodingDraft(editorId, {
          assessmentKey,
          sectionIndex: assessmentContext?.sectionIndex,
          questionIndex: assessmentContext?.questionIndex,
          problemId: response._id,
          form: nextForm,
          problemData: response,
          previewValidated: Boolean(response.previewValidated ?? response.previewTested),
          status: (response.previewValidated ?? response.previewTested) ? 'Validated' : 'Draft',
        });
      }

      if (redirectToPreview) {
        if (!silent) {
          toast.success(isAssessment ? 'Draft saved. Opening validation workspace.' : 'Draft saved. Opening preview workspace.');
        }
      } else if (!silent) {
        toast.success(
          currentProblemId
            ? (status === 'published' ? 'Problem updated and published.' : 'Problem updated.')
            : (status === 'published' ? 'Problem published successfully.' : 'Draft saved successfully.'),
        );
      }

      if (redirectToPreview) {
        navigate(`${rolePrefix}/library/coding/${response._id}/preview${isAssessment ? location.search : ''}`);
      } else if (!currentProblemId && !isAssessment) {
        navigate(`${rolePrefix}/library/coding/${response._id}/edit`, { replace: true });
      }

      if (silent) setAutoSaveStatus('Draft auto-saved');
      return response;
    } catch (error) {
      if (!silent) {
        toast.error(error.message || 'Failed to save problem.');
      }
      if (silent) setAutoSaveStatus('Auto-save failed');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isAssessment) return undefined;
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current);
    }
    autoSaveRef.current = setInterval(() => {
      if (!isDirty) return;
      persistProblem('draft', { silent: true });
    }, 8000);
    return () => clearInterval(autoSaveRef.current);
  }, [isAssessment, isDirty, form, currentProblemId]);

  useEffect(() => {
    if (!isAssessment) return undefined;
    const handleBeforeUnload = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAssessment, isDirty]);
  const handleDelete = async () => {
    if (!currentProblemId) return;
    setIsDeleting(true);
    try {
      await api.deleteCompilerProblem(currentProblemId);
      toast.success('Problem deleted successfully.');
      setDeleteConfirmOpen(false);
      navigate(`${rolePrefix}/library/coding/problems`);
    } catch (error) {
      toast.error(error.message || 'Failed to delete problem.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openPreview = async () => {
    if (isApprovingPreview) return;
    setIsApprovingPreview(true);
    try {
      await persistProblem('draft', { redirectToPreview: true });
    } finally {
      setIsApprovingPreview(false);
    }
  };

  const handleAddToAssessment = async () => {
    if (!canAddToAssessment && !canAddToAssessmentDynamic) {
      toast.error('Complete validation requirements before adding to the assessment.');
      return;
    }
    let response = currentProblemId ? null : await persistProblem('draft', { silent: true });
    const problemId = response?._id || currentProblemId;
    if (!problemId || !editorId) {
      toast.error('Save the coding problem before adding to the assessment.');
      return;
    }

    let publishedProblem = response;
    if (!publishedProblem || publishedProblem.status !== 'published') {
      try {
        await api.updateCompilerProblemStatus(problemId, 'published');
        publishedProblem = await api.getCompilerProblem(problemId);
      } catch (error) {
        toast.error(error.message || 'Publish the problem before adding it to the assessment.');
        return;
      }
    }

    const isValidated = Boolean(publishedProblem?.previewValidated ?? publishedProblem?.previewTested);
if (!isValidated || publishedProblem.status !== 'published') {
      toast.error('Problem must be published and validated before adding to the assessment.');
      return;
    }

    // If in assessment mode, use the existing assessment context
    if (isAssessment && assessmentContext) {
      saveCodingDraft(editorId, {
        assessmentKey,
        sectionIndex: assessmentContext?.sectionIndex,
        questionIndex: assessmentContext?.questionIndex,
        problemId: publishedProblem._id,
        form: createProblemFormFromProblem(publishedProblem),
        problemData: publishedProblem,
        previewValidated: Boolean(publishedProblem.previewValidated ?? publishedProblem.previewTested),
        status: 'Ready',
      });
      toast.success('Coding question added to assessment.');
      navigate(assessmentReturnTo);
    } else {
      // If not in assessment mode, redirect to problem library to select assessment
      toast.success('Question published! You can now add it to an assessment from the problem library.');
      navigate(`${rolePrefix}/library`);
    }
  };

  if (loading) {
    return <LoadingPanel label={isEditMode ? 'Loading problem editor...' : 'Loading editor...'} />;
  }

  const handleHiddenTestFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const parsed = deriveHiddenFilePairs(files);
    if (parsed.issues.length > 0) {
      updateField('hiddenTestFiles', files);
      return;
    }

    try {
      const fileByName = new Map(files.map((file) => [file.name, file]));
      const loadedCases = await Promise.all(parsed.pairs.map(async (pair) => ({
        input: await fileByName.get(pair.input).text(),
        output: await fileByName.get(pair.output).text(),
        marks: 1,
      })));
      setForm((previous) => ({
        ...previous,
        hiddenTestUploadMode: 'pairs',
        hiddenTestFiles: files,
        hiddenTestCases: loadedCases,
      }));
      setIsDirty(true);
      toast.success(`${loadedCases.length} hidden test case pair(s) loaded. Review inputs, outputs, and marks below.`);
    } catch {
      toast.error('Could not read one or more hidden test case files. Please upload them again.');
    }
  };

  const updateHiddenBulkFile = async (field, file) => {
    const currentForm = formRef.current;
    const inputFile = field === 'hiddenBulkInputFile' ? file : currentForm.hiddenBulkInputFile;
    const outputFile = field === 'hiddenBulkOutputFile' ? file : currentForm.hiddenBulkOutputFile;

    setForm((previous) => ({
      ...previous,
      [field]: file,
      hiddenTestUploadMode: 'bulk',
      hiddenTestFiles: [],
      hiddenBulkCaseCount: inputFile && outputFile ? previous.hiddenBulkCaseCount : 0,
    }));
    setIsDirty(true);

    if (!inputFile || !outputFile) return;

    try {
      const [inputsContent, outputsContent] = await Promise.all([inputFile.text(), outputFile.text()]);
      const parsedCases = parseBulkCasePair(inputsContent, outputsContent, currentForm.hiddenBulkDelimiter || '###CASE###');
      setForm((previous) => ({
        ...previous,
        hiddenBulkCaseCount: parsedCases.length,
      }));
      toast.success(`${parsedCases.length} bulk hidden test case(s) detected.`);
    } catch (error) {
      setForm((previous) => ({
        ...previous,
        hiddenBulkCaseCount: 0,
      }));
      toast.error(error.message || 'Bulk input/output files could not be matched.');
    }
  };

  const updateHiddenBulkDelimiter = async (delimiter) => {
    updateField('hiddenBulkDelimiter', delimiter);
    if (!form.hiddenBulkInputFile || !form.hiddenBulkOutputFile) return;

    try {
      const [inputsContent, outputsContent] = await Promise.all([
        form.hiddenBulkInputFile.text(),
        form.hiddenBulkOutputFile.text(),
      ]);
      const parsedCases = parseBulkCasePair(inputsContent, outputsContent, delimiter || '###CASE###');
      setForm((previous) => ({ ...previous, hiddenBulkCaseCount: parsedCases.length }));
    } catch {
      setForm((previous) => ({ ...previous, hiddenBulkCaseCount: 0 }));
    }
  };
  const activeTabIndex = EDITOR_TABS.findIndex((tab) => tab.key === activeTab);
  const isFinalTab = activeTabIndex === EDITOR_TABS.length - 1;
  const tabCompletion = {
    details: Boolean(form.title?.trim() && form.description?.trim() && form.inputFormat?.trim() && form.outputFormat?.trim() && form.constraints?.trim()),
    tests: visibleSampleCount > 0 && hiddenCount > 0,
    templates: form.supportedLanguages.length > 0 && hasTemplate,
    editorial: Boolean(form.editorial?.trim() || form.hints?.length || form.faqs?.length),
  };
  const goToTab = (index) => {
    const nextTab = EDITOR_TABS[index];
    if (!nextTab) return;
    setActiveTab(nextTab.key);
    requestAnimationFrame(() => editorTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const selectTab = (key) => {
    setActiveTab(key);
    requestAnimationFrame(() => editorTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div ref={editorTopRef} className="mx-auto max-w-[1180px] pb-20">
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white"><Code2 className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{isAssessment ? 'Assessment coding question' : (isEditMode ? 'Edit coding problem' : 'Create coding problem')}</p>
                <p className="text-xs text-slate-500 dark:text-gray-400">{currentStatus === 'published' ? 'Published' : 'Draft'} · {visibleSampleCount} sample · {hiddenCount} hidden · {form.supportedLanguages.length} languages</p>
              </div>
            </div>
            <button type="button" onClick={openPreview} disabled={isSaving || isApprovingPreview} title="Open solving preview" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Eye className="h-4 w-4" />{isApprovingPreview ? 'Opening...' : 'Solve preview'}</button>
          </div>
          <div className="mx-auto mt-4 w-full max-w-4xl border-y border-slate-100 py-1 dark:border-gray-800">
            <AuthoringStepper steps={EDITOR_TABS} activeKey={activeTab} completed={tabCompletion} onChange={selectTab} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-gray-800 dark:text-gray-300">{visibleSampleCount} sample</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-gray-800 dark:text-gray-300">{hiddenCount} hidden</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-gray-800 dark:text-gray-300">{form.supportedLanguages.length} languages</span>
            <span className={`rounded-full px-2.5 py-1 ${previewValidated ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>{previewValidated ? 'Preview validated' : 'Validation pending'}</span>
          </div>
        </section>

        {activeTab === 'details' ? (
          <>
            <SectionCard title="Question Details" subtitle="Core metadata and public-facing problem statement.">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <RequiredFieldLabel>Problem name</RequiredFieldLabel>
                  <input value={form.title} onChange={(event) => updateField('title', event.target.value)} placeholder="Example: Longest Increasing Subsequence" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div className="md:col-span-2">
                  <RequiredFieldLabel>Problem statement</RequiredFieldLabel>
                  <RichTextEditor value={form.description} onChange={(value) => updateField('description', value)} rows={14} placeholder="Explain the problem clearly using headings, examples, and inline code." />
                </div>
                <div>
                  <RequiredFieldLabel>Difficulty</RequiredFieldLabel>
                  <select value={form.difficulty} onChange={(event) => updateField('difficulty', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"><option>Easy</option><option>Medium</option><option>Hard</option></select>
                </div>
                <div>
                  <RequiredFieldLabel optional>Tags</RequiredFieldLabel>
                  <input value={form.tags} onChange={(event) => updateField('tags', event.target.value)} placeholder="arrays, dp, greedy" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div className="md:col-span-2">
                  <RequiredFieldLabel optional>Company tags</RequiredFieldLabel>
                  <input value={form.companyTags} onChange={(event) => updateField('companyTags', event.target.value)} placeholder="Amazon, Google, Microsoft" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Input / Output Specification" subtitle="Public contract shown to problem solvers.">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <RequiredFieldLabel>Input format</RequiredFieldLabel>
                  <textarea value={form.inputFormat} onChange={(event) => updateField('inputFormat', event.target.value)} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div>
                  <RequiredFieldLabel>Output format</RequiredFieldLabel>
                  <textarea value={form.outputFormat} onChange={(event) => updateField('outputFormat', event.target.value)} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div>
                  <RequiredFieldLabel>Constraints</RequiredFieldLabel>
                  <RichTextEditor value={form.constraints} onChange={(value) => updateField('constraints', value)} rows={7} placeholder="Add one constraint per line, then format lines with headings, bold, lists, quotes, or code." />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Execution Limits" subtitle="Judge limits for submissions.">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <RequiredFieldLabel>Time limit (seconds)</RequiredFieldLabel>
                  <input type="number" min="1" step="0.5" value={form.timeLimitSeconds} onChange={(event) => updateField('timeLimitSeconds', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div>
                  <RequiredFieldLabel>Memory limit (MB)</RequiredFieldLabel>
                  <input type="number" min="64" step="64" value={form.memoryLimitMb} onChange={(event) => updateField('memoryLimitMb', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
              </div>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'editorial' ? (
          <>
            <SectionCard title="Editorial" subtitle="Optional internal solution guide for reviewers and maintainers.">
              <RequiredFieldLabel optional>Editorial solution</RequiredFieldLabel>
              <RichTextEditor value={form.editorial || ''} onChange={(value) => updateField('editorial', value)} rows={12} placeholder="Explain the intended approach, complexity, edge cases and reference reasoning." />
            </SectionCard>
            <SectionCard title="Hints" subtitle="Optional progressive guidance that students can reveal while solving.">
              <HintEditor
                hints={form.hints || []}
                onAdd={() => updateField('hints', [...(form.hints || []), ''])}
                onRemove={(index) => updateField('hints', (form.hints || []).filter((_, itemIndex) => itemIndex !== index))}
                onChange={updateHint}
              />
            </SectionCard>

            <SectionCard title="FAQ" subtitle="Optional questions and solution notes shown dynamically on the student problem page.">
              <FaqEditor
                faqs={form.faqs || []}
                onAdd={() => updateField('faqs', [...(form.faqs || []), createEmptyFaq()])}
                onRemove={(index) => updateField('faqs', (form.faqs || []).filter((_, itemIndex) => itemIndex !== index))}
                onChange={updateFaq}
              />
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'tests' ? (
          <>
            <SectionCard title="Sample Test Cases" subtitle="Visible examples for the statement and admin run flow.">
              <RequiredFieldLabel>At least one complete sample</RequiredFieldLabel>
              <TestCaseEditorCard
                title="Sample"
                cases={form.sampleTestCases}
                includeExplanation
                staged
                onAdd={() => updateField('sampleTestCases', [...form.sampleTestCases, createEmptySampleTestCase()])}
                onRemove={(index) => updateField('sampleTestCases', form.sampleTestCases.filter((_, itemIndex) => itemIndex !== index))}
                onDuplicate={(index) => updateField('sampleTestCases', [...form.sampleTestCases, { ...form.sampleTestCases[index] }])}
                onChange={updateSampleTestCase}
              />
            </SectionCard>

            <SectionCard title="Hidden Test Cases" subtitle="Add private judge cases manually or import files when you have many cases.">
              <RequiredFieldLabel>At least one hidden judge case</RequiredFieldLabel>
              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${form.hiddenTestUploadMode === 'manual' ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-100 dark:border-sky-700 dark:bg-sky-900/10 dark:ring-sky-900/30' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'}`}>
                  <input type="radio" name="hidden-upload-mode" checked={form.hiddenTestUploadMode === 'manual'} onChange={() => updateHiddenUploadMode('manual')} className="mt-0.5 h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span><span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-gray-100"><Edit2 className="h-4 w-4" />Manual entry</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-gray-400">Type one or multiple cases directly. No files required.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${form.hiddenTestUploadMode === 'pairs' ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-100 dark:border-sky-700 dark:bg-sky-900/10 dark:ring-sky-900/30' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'}`}>
                  <input type="radio" name="hidden-upload-mode" checked={form.hiddenTestUploadMode === 'pairs'} onChange={() => updateHiddenUploadMode('pairs')} className="mt-0.5 h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span><span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-gray-100"><FileText className="h-4 w-4" />File pairs</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-gray-400">Upload one or many input_N.txt/output_N.txt pairs.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${form.hiddenTestUploadMode === 'bulk' ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-100 dark:border-sky-700 dark:bg-sky-900/10 dark:ring-sky-900/30' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'}`}>
                  <input type="radio" name="hidden-upload-mode" checked={form.hiddenTestUploadMode === 'bulk'} onChange={() => updateHiddenUploadMode('bulk')} className="mt-0.5 h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span><span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-gray-100"><Upload className="h-4 w-4" />Bulk files</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-gray-400">Use one inputs file and one outputs file for a large set.</span></span>
                </label>
              </div>

              {form.hiddenTestUploadMode === 'manual' ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Manual hidden cases</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Enter input and expected output here. Add as many independent cases as needed.</p></div><span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">{manualHiddenCount} added</span></div>
                  <TestCaseEditorCard
                    title="Hidden"
                    cases={form.hiddenTestCases}
                    staged
                    onAdd={() => updateField('hiddenTestCases', [...form.hiddenTestCases, createEmptyHiddenTestCase()])}
                    onRemove={(index) => updateField('hiddenTestCases', form.hiddenTestCases.filter((_, itemIndex) => itemIndex !== index))}
                    onDuplicate={(index) => updateField('hiddenTestCases', [...form.hiddenTestCases, { ...form.hiddenTestCases[index] }])}
                    onChange={updateHiddenTestCase}
                  />
                </div>
              ) : form.hiddenTestUploadMode === 'pairs' ? (
                <div className="space-y-6">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-gray-100">Upload paired files</label>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Select a single pair or multiple pairs together. File numbers must match.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {PAIR_TEMPLATE_FILES.map((file) => (
                          <TemplateButton key={file.name} onClick={() => downloadTextFile(file.name, file.content)}>
                            {file.name}
                          </TemplateButton>
                        ))}
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                      <Upload className="mr-2 h-4 w-4" />
                      Choose input/output file pair(s)
                      <input
                        type="file"
                        multiple
                        accept=".txt,text/plain"
                        className="hidden"
                        onChange={(event) => {
                          handleHiddenTestFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </label>

                    {hiddenPairs.pairs.length > 0 || hiddenPairs.issues.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {hiddenPairs.pairs.map((pair) => (
                          <div key={pair.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Pair {pair.key}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{pair.input || 'Missing input'} / {pair.output || 'Missing output'}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pair.complete ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'}`}>{pair.complete ? 'Matched' : 'Incomplete'}</span>
                          </div>
                        ))}
                        {hiddenPairs.issues.map((issue) => (
                          <p key={issue} className="text-sm text-rose-600 dark:text-rose-300">{issue}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {(hiddenPairs.pairs.length > 0 || manualHiddenCount > 0) && <div>
                    <label className="mb-3 block text-sm font-semibold text-slate-800 dark:text-gray-100">Review imported cases</label>
                    <TestCaseEditorCard
                      title="Hidden"
                      cases={form.hiddenTestCases}
                      staged
                      onAdd={() => updateField('hiddenTestCases', [...form.hiddenTestCases, createEmptyHiddenTestCase()])}
                      onRemove={(index) => updateField('hiddenTestCases', form.hiddenTestCases.filter((_, itemIndex) => itemIndex !== index))}
                      onDuplicate={(index) => updateField('hiddenTestCases', [...form.hiddenTestCases, { ...form.hiddenTestCases[index] }])}
                      onChange={updateHiddenTestCase}
                    />
                  </div>}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Bulk template</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Use one inputs.txt and one outputs.txt file. Separate each case with the delimiter below in both files.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <TemplateButton onClick={() => downloadTextFile('inputs.txt', BULK_INPUT_TEMPLATE)}>inputs.txt</TemplateButton>
                      <TemplateButton onClick={() => downloadTextFile('outputs.txt', BULK_OUTPUT_TEMPLATE)}>outputs.txt</TemplateButton>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                      <Upload className="mr-2 h-4 w-4" />
                      {form.hiddenBulkInputFile ? form.hiddenBulkInputFile.name : 'Upload inputs.txt'}
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        className="hidden"
                        onChange={(event) => {
                          updateHiddenBulkFile('hiddenBulkInputFile', event.target.files?.[0] || null);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                      <Upload className="mr-2 h-4 w-4" />
                      {form.hiddenBulkOutputFile ? form.hiddenBulkOutputFile.name : 'Upload outputs.txt'}
                      <input
                        type="file"
                        accept=".txt,text/plain"
                        className="hidden"
                        onChange={(event) => {
                          updateHiddenBulkFile('hiddenBulkOutputFile', event.target.files?.[0] || null);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Bulk Delimiter</label>
                    <input value={form.hiddenBulkDelimiter || '###CASE###'} onChange={(event) => updateHiddenBulkDelimiter(event.target.value)} placeholder="###CASE###" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                    {form.hiddenBulkInputFile && form.hiddenBulkOutputFile ? (
                      <p className={`mt-2 text-xs font-semibold ${bulkHiddenCount > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>
                        {bulkHiddenCount > 0 ? `${bulkHiddenCount} hidden test case(s) detected from bulk files.` : 'No matching bulk cases detected. Check delimiter and input/output counts.'}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Validation Preview" subtitle="Quick view of what will be parsed into the judge.">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Samples</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-gray-100">{visibleSampleCount}</p></div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Hidden</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-gray-100">{hiddenCount}</p></div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Entry Mode</p><p className="mt-2 text-lg font-semibold text-slate-900 dark:text-gray-100">{form.hiddenTestUploadMode === 'bulk' ? 'Bulk files' : form.hiddenTestUploadMode === 'pairs' ? 'File pairs' : 'Manual entry'}</p></div>
              </div>

              {visibleSampleCount === 0 && hiddenCount === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No testcase data yet" description="Add sample and hidden cases to preview the judge input set." />
                </div>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                    <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Parsed samples</p>
                    <div className="mt-3 space-y-3">
                      {form.sampleTestCases.filter((item) => item.input || item.output || item.explanation).map((testCase, index) => (
                        <div key={`preview-sample-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-gray-800">
                          <div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-700 dark:text-gray-200">Sample {index + 1}</p><span className="font-semibold text-emerald-700 dark:text-emerald-300">{Number(testCase.marks) || 1} mark(s)</span></div>
                          <p className="mt-2 font-semibold text-slate-500">Input</p><pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-gray-300">{testCase.input || '(empty input)'}</pre>
                          <p className="mt-2 font-semibold text-slate-500">Expected output</p><pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-gray-300">{testCase.output || '(empty output)'}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                    <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Parsed hidden tests</p>
                    <div className="mt-3 space-y-3">
                      {form.hiddenTestUploadMode !== 'bulk' ? (
                        <>
                          {/* Show uploaded file pairs when available */}
                          {hiddenPairs.pairs.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">From uploaded files</p>
                              {hiddenPairs.pairs.filter((pair) => pair.complete).map((pair) => (
                                <div key={`preview-file-hidden-${pair.key}`} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-gray-800">
                                  <p className="font-semibold text-slate-700 dark:text-gray-200">File Pair {pair.key}</p>
                                  <p className="mt-1 text-slate-500 dark:text-gray-400">{pair.input} / {pair.output}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Show manually entered hidden test cases */}
                          {form.hiddenTestCases.filter((item) => item.input || item.output).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Manual entries</p>
                              {form.hiddenTestCases.filter((item) => item.input || item.output).map((testCase, index) => (
                                <div key={`preview-manual-hidden-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-gray-800">
                                  <div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-700 dark:text-gray-200">Input {index + 1} / Output {index + 1}</p><span className="font-semibold text-emerald-700 dark:text-emerald-300">{Number(testCase.marks) || 1} mark(s)</span></div>
                                  <p className="mt-2 font-semibold text-slate-500">Input {index + 1}</p><pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-gray-300">{testCase.input || '(empty input)'}</pre>
                                  <p className="mt-2 font-semibold text-slate-500">Expected output {index + 1}</p><pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-gray-300">{testCase.output || '(empty output)'}</pre>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Show existing server-side cases */}
                          {hiddenPairs.pairs.length === 0 && form.hiddenTestCases.filter((item) => item.input || item.output).length === 0 && (form.existingHiddenTestCaseCount || 0) > 0 && (
                            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                              {form.existingHiddenTestCaseCount} hidden test case{form.existingHiddenTestCaseCount === 1 ? '' : 's'} saved on the server.
                            </div>
                          )}
                          {/* Empty state */}
                          {hiddenPairs.pairs.length === 0 && form.hiddenTestCases.filter((item) => item.input || item.output).length === 0 && (form.existingHiddenTestCaseCount || 0) === 0 && (
                            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                              No hidden test cases added yet. Upload files or add manually above.
                            </div>
                          )}
                        </>
                      ) : <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-gray-800 dark:text-gray-300">Bulk files will be parsed using delimiter <code>{form.hiddenBulkDelimiter || '###CASE###'}</code>. Current detected count: <strong>{bulkHiddenCount}</strong>.</div>}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'templates' ? (
          <>
            <SectionCard title="Supported Languages" subtitle="Choose runtimes for admin testing and submissions.">
              <RequiredFieldLabel>Allowed languages</RequiredFieldLabel>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {COMPILER_LANGUAGES.map((language) => {
                  const checked = form.supportedLanguages.includes(language.id);
                  return (
                    <label key={language.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${checked ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/10' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleLanguage(language.id)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                      <span className="text-sm font-medium text-slate-700 dark:text-gray-200">{language.label}</span>
                    </label>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Code Templates" subtitle="Provide starter code for each language. Students can fully replace it with any valid program entrypoint.">
              <RequiredFieldLabel>Starter code</RequiredFieldLabel>
              <div className="mb-4 flex flex-wrap gap-2">
                <div className="flex flex-wrap gap-2">{form.supportedLanguages.map((languageId) => <button key={languageId} type="button" onClick={() => setActiveLanguage(languageId)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeLanguage === languageId ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{getLanguageLabel(languageId)}</button>)}</div>
              </div>
              <MonacoCodeEditor
                language={activeLanguage}
                value={activeTemplate}
                onChange={(nextTemplate) => updateTemplate(activeLanguage, nextTemplate)}
                height={380}
                readOnly={false}
                internalClipboardOnly={false}
                contentKey={`problem-template:${activeLanguage}`}
              />
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'draft' ? (
          <SectionCard title="Draft Workspace" subtitle="Auto-save, validation, and readiness checks.">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Status</p>
                <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-gray-100">{validationStatus}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Auto-save</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">{isAssessment ? (autoSaveStatus || 'Waiting for changes') : 'Manual save only'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Preview</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">{previewValidated ? 'Validation completed' : 'Validation required'}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-gray-300">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-gray-700">
                <span>At least 1 sample test case</span>
                <span className={visibleSampleCount > 0 ? 'text-emerald-600' : 'text-rose-500'}>{visibleSampleCount > 0 ? 'Ready' : 'Missing'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-gray-700">
                <span>At least 1 hidden test case</span>
                <span className={hiddenCount > 0 ? 'text-emerald-600' : 'text-rose-500'}>{hiddenCount > 0 ? 'Ready' : 'Missing'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-gray-700">
                <span>Language template provided</span>
                <span className={hasTemplate ? 'text-emerald-600' : 'text-rose-500'}>{hasTemplate ? 'Ready' : 'Missing'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-gray-700">
                <span>Preview validation run</span>
                <span className={previewValidated ? 'text-emerald-600' : 'text-rose-500'}>{previewValidated ? 'Done' : 'Pending'}</span>
              </div>
            </div>
          </SectionCard>
        ) : null}



        {isFinalTab && <SectionCard
          title="Actions"
          subtitle={isAssessment ? 'Save drafts, validate, and add to the assessment.' : 'Save drafts, publish, or cleanly remove the problem from the judge workspace.'}
        >
          {!isAssessment && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Question Visibility</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Toggle to make question public or private.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateField('visibility', form.visibility === 'public' ? 'assessment' : 'public')}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    form.visibility === 'public'
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {form.visibility === 'public' ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      Public
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                      Private
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {isAssessment ? (
              <>
                <button type="button" onClick={() => persistProblem('draft')} disabled={isSaving || isApprovingPreview} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Save className="h-4 w-4" />{isSaving ? 'Saving...' : 'Save Draft'}</button>
                <button type="button" onClick={openPreview} disabled={isSaving || isApprovingPreview} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"><Eye className="h-4 w-4" />{isApprovingPreview ? 'Opening...' : 'Open Preview'}</button>
                <button type="button" onClick={handleAddToAssessment} disabled={isSaving || !canAddToAssessment} title={!canAddToAssessment ? 'Complete validation checks before adding.' : ''} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"><FilePlus2 className="h-4 w-4" />Add to Assessment</button>
              </>
            ) : (
              <>
                <button type="button" onClick={openPreview} disabled={isSaving || isDeleting || isApprovingPreview} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"><Eye className="h-4 w-4" />{isApprovingPreview ? 'Opening...' : 'Open Preview'}</button>
                <button type="button" onClick={() => persistProblem('draft')} disabled={isSaving || isDeleting || isApprovingPreview} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Save className="h-4 w-4" />{isSaving ? 'Saving...' : 'Save Draft'}</button>
                <button type="button" onClick={() => persistProblem('published')} disabled={isSaving || isDeleting || isApprovingPreview || !previewValidated || !currentProblemId} title={!previewValidated ? 'Preview validation is required before publishing.' : ''} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"><FilePlus2 className="h-4 w-4" />{isSaving ? (isEditMode ? 'Updating...' : 'Publishing...') : (isEditMode ? 'Update Problem' : 'Publish')}</button>
                {canAddToAssessmentDynamic && (
                  <button type="button" onClick={handleAddToAssessment} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"><FilePlus2 className="h-4 w-4" />Add to Assessment</button>
                )}
                {currentProblemId ? <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={isDeleting || isSaving} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"><Trash2 className="h-4 w-4" />{isDeleting ? 'Deleting...' : 'Delete Problem'}</button> : null}
              </>
            )}
          </div>
          {isAssessment && !canAddToAssessment ? (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">Preview validation and required testcases/templates must be completed before adding to the assessment.</p>
          ) : null}
          {!isAssessment && !previewValidated ? <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">Publishing stays disabled until the preview IDE submits an Accepted solution and is approved.</p> : null}
        </SectionCard>}

        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
          <button type="button" onClick={() => goToTab(activeTabIndex - 1)} disabled={activeTabIndex === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span></button>
          <span className="text-xs font-semibold text-slate-500 dark:text-gray-400">Step {activeTabIndex + 1} of {EDITOR_TABS.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={openPreview} disabled={isSaving || isApprovingPreview} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"><Eye className="h-4 w-4" /><span className="hidden sm:inline">{isApprovingPreview ? 'Opening...' : 'Solve preview'}</span></button>
            {!isFinalTab && <button type="button" onClick={() => goToTab(activeTabIndex + 1)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500">Next<span className="hidden sm:inline">: {EDITOR_TABS[activeTabIndex + 1]?.label}</span><ChevronRight className="h-4 w-4" /></button>}
          </div>
        </div>
      </div>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-editor-problem-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300"><AlertTriangle className="h-5 w-5" /></div>
            <h3 id="delete-editor-problem-title" className="mt-4 text-lg font-bold text-slate-950 dark:text-white">Delete coding problem?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">The problem and all related submissions will be permanently removed. This action cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={isDeleting} onClick={() => setDeleteConfirmOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
              <button type="button" disabled={isDeleting} onClick={handleDelete} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"><Trash2 className="h-4 w-4" />{isDeleting ? 'Deleting...' : 'Delete permanently'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







