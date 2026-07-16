import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Code2, Eye, FilePlus2, Plus, Save, TextCursorInput, Trash2, Upload, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import RichTextEditor from './RichTextEditor';
import MonacoCodeEditor from './MonacoCodeEditor';
import { ProblemStatementPreview } from './CompilerContentPreview';
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
} from './compilerUtils';
import { EmptyState, LoadingPanel, SectionCard } from './CompilerUi';
import { loadCodingDraft, saveCodingDraft } from '../assessment/assessmentCodingStore';

const EDITOR_TABS = [
  { key: 'details', label: 'Question Details' },
  { key: 'guidance', label: 'Hints & FAQ' },
  { key: 'tests', label: 'Test Cases' },
  { key: 'templates', label: 'Code Templates' },
];

function TabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'bg-sky-600 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

function TestCaseEditorCard({ title, cases, onAdd, onRemove, onChange, includeExplanation = false }) {
  return (
    <div className="space-y-4">
      {cases.map((testCase, index) => (
        <div key={`${title}-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title} {index + 1}</h4>
            {cases.length > 1 && (
              <button type="button" onClick={() => onRemove(index)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>
          <div className={`grid gap-4 ${includeExplanation ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            <textarea
              value={testCase.input}
              onChange={(event) => onChange(index, 'input', event.target.value)}
              rows={5}
              placeholder="Input"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
            />
            <textarea
              value={testCase.output}
              onChange={(event) => onChange(index, 'output', event.target.value)}
              rows={5}
              placeholder="Output"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
            />
            {includeExplanation ? (
              <textarea
                value={testCase.explanation}
                onChange={(event) => onChange(index, 'explanation', event.target.value)}
                rows={5}
                placeholder="Explanation"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
            ) : null}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Plus className="h-4 w-4" />
        Add {title}
      </button>
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
  const [templateEditorMode, setTemplateEditorMode] = useState('code');
  const [currentProblemId, setCurrentProblemId] = useState(finalAssessmentContext?.problemId || (isAssessment ? '' : (id || '')));
  const [currentStatus, setCurrentStatus] = useState('draft');
  const [previewValidated, setPreviewValidated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApprovingPreview, setIsApprovingPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const autoSaveRef = useRef(null);
  const assessmentKey = finalAssessmentContext?.assessmentKey || 'new';
  const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const assessmentReturnTo = finalAssessmentContext?.returnTo || `${rolePrefix}/assessment`;

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
  const hiddenCount = form.hiddenTestUploadMode === 'bulk'
    ? Math.max(form.hiddenBulkInputFile && form.hiddenBulkOutputFile ? 1 : 0, form.existingHiddenTestCaseCount || 0)
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
        navigate(`${rolePrefix}/compiler/${response._id}/preview`);
      } else if (!currentProblemId && !isAssessment) {
        navigate(`${rolePrefix}/compiler/${response._id}/edit`, { replace: true });
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
    const confirmed = window.confirm('Delete this problem and all related submissions? This cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await api.deleteCompilerProblem(currentProblemId);
      toast.success('Problem deleted successfully.');
      navigate(`${rolePrefix}/compiler/problems`);
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

  const handleOpenPreview = () => {
    if (!currentProblemId) {
      toast.error('Save the problem first before opening preview.');
      return;
    }
    navigate(`${rolePrefix}/compiler/${currentProblemId}/preview`);
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

  const previewProblem = {
    ...form,
    status: currentStatus,
    tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean),
    companyTags: form.companyTags.split(',').map((item) => item.trim()).filter(Boolean),
    hiddenTestCaseCount: hiddenCount,
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <div className="space-y-6">
        <SectionCard
          title={isAssessment ? 'Assessment Coding Question' : (isEditMode ? 'Edit Problem' : 'Create Problem')}
          subtitle={isAssessment ? 'Full compiler-grade authoring flow for assessment coding questions.' : 'Professional authoring workflow for question details, judge testcases, and multi-language starter code.'}
          action={<div className="flex flex-wrap gap-2">{EDITOR_TABS.map((tab) => <TabButton key={tab.key} label={tab.label} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} />)}</div>}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{currentStatus === 'published' ? 'Published problem' : 'Draft workspace'}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Sample cases: {visibleSampleCount} | Hidden cases: {hiddenCount} | Languages: {form.supportedLanguages.length}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                Preview validation: {previewValidated ? 'Completed' : 'Required before publish'}
              </p>
            </div>
            {currentProblemId ? (
              <button
                type="button"
                onClick={handleOpenPreview}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Eye className="h-4 w-4" />
                Open Preview
              </button>
            ) : null}
          </div>
        </SectionCard>

        {activeTab === 'details' ? (
          <>
            <SectionCard title="Question Details" subtitle="Core metadata and public-facing problem statement.">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Title</label>
                  <input value={form.title} onChange={(event) => updateField('title', event.target.value)} placeholder="Example: Longest Increasing Subsequence" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Description</label>
                  <RichTextEditor value={form.description} onChange={(value) => updateField('description', value)} rows={14} placeholder="Explain the problem clearly using headings, examples, and inline code." />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Difficulty</label>
                  <select value={form.difficulty} onChange={(event) => updateField('difficulty', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"><option>Easy</option><option>Medium</option><option>Hard</option></select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Tags</label>
                  <input value={form.tags} onChange={(event) => updateField('tags', event.target.value)} placeholder="arrays, dp, greedy" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Company Tags</label>
                  <input value={form.companyTags} onChange={(event) => updateField('companyTags', event.target.value)} placeholder="Amazon, Google, Microsoft" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Input / Output Specification" subtitle="Public contract shown to problem solvers.">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Input Format</label>
                  <textarea value={form.inputFormat} onChange={(event) => updateField('inputFormat', event.target.value)} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Output Format</label>
                  <textarea value={form.outputFormat} onChange={(event) => updateField('outputFormat', event.target.value)} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Constraints</label>
                  <textarea value={form.constraints} onChange={(event) => updateField('constraints', event.target.value)} rows={5} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Execution Limits" subtitle="Judge limits for submissions.">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Time Limit</label>
                  <input type="number" min="1" step="0.5" value={form.timeLimitSeconds} onChange={(event) => updateField('timeLimitSeconds', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Memory Limit</label>
                  <input type="number" min="64" step="64" value={form.memoryLimitMb} onChange={(event) => updateField('memoryLimitMb', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
              </div>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'guidance' ? (
          <>
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
              <TestCaseEditorCard
                title="Sample"
                cases={form.sampleTestCases}
                includeExplanation
                onAdd={() => updateField('sampleTestCases', [...form.sampleTestCases, createEmptySampleTestCase()])}
                onRemove={(index) => updateField('sampleTestCases', form.sampleTestCases.filter((_, itemIndex) => itemIndex !== index))}
                onChange={updateSampleTestCase}
              />
            </SectionCard>

            <SectionCard title="Hidden Test Cases" subtitle="Bulk upload input_1.txt/output_1.txt pairs or add private cases manually.">
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${form.hiddenTestUploadMode === 'pairs' ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/10' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
                  <input type="radio" name="hidden-upload-mode" checked={form.hiddenTestUploadMode === 'pairs'} onChange={() => updateField('hiddenTestUploadMode', 'pairs')} className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-gray-200">Pair / Manual mode</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${form.hiddenTestUploadMode === 'bulk' ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/10' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
                  <input type="radio" name="hidden-upload-mode" checked={form.hiddenTestUploadMode === 'bulk'} onChange={() => updateField('hiddenTestUploadMode', 'bulk')} className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-gray-200">Bulk upload mode</span>
                </label>
              </div>

              {form.hiddenTestUploadMode === 'pairs' ? (
                <div className="space-y-6">
                  <div>
                    <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-gray-300">Bulk file upload</label>
                    <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload hidden testcase files
                      <input type="file" multiple accept=".txt" className="hidden" onChange={(event) => updateField('hiddenTestFiles', Array.from(event.target.files || []))} />
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

                  <div>
                    <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-gray-300">Manual add</label>
                    <TestCaseEditorCard
                      title="Hidden"
                      cases={form.hiddenTestCases}
                      onAdd={() => updateField('hiddenTestCases', [...form.hiddenTestCases, createEmptyHiddenTestCase()])}
                      onRemove={(index) => updateField('hiddenTestCases', form.hiddenTestCases.filter((_, itemIndex) => itemIndex !== index))}
                      onChange={updateHiddenTestCase}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                      <Upload className="mr-2 h-4 w-4" />
                      {form.hiddenBulkInputFile ? form.hiddenBulkInputFile.name : 'Upload inputs.txt'}
                      <input type="file" accept=".txt" className="hidden" onChange={(event) => updateField('hiddenBulkInputFile', event.target.files?.[0] || null)} />
                    </label>
                    <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                      <Upload className="mr-2 h-4 w-4" />
                      {form.hiddenBulkOutputFile ? form.hiddenBulkOutputFile.name : 'Upload outputs.txt'}
                      <input type="file" accept=".txt" className="hidden" onChange={(event) => updateField('hiddenBulkOutputFile', event.target.files?.[0] || null)} />
                    </label>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Bulk Delimiter</label>
                    <input value={form.hiddenBulkDelimiter || '###CASE###'} onChange={(event) => updateField('hiddenBulkDelimiter', event.target.value)} placeholder="###CASE###" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Validation Preview" subtitle="Quick view of what will be parsed into the judge.">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Samples</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-gray-100">{visibleSampleCount}</p></div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Hidden</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-gray-100">{hiddenCount}</p></div>
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Upload Mode</p><p className="mt-2 text-lg font-semibold text-slate-900 dark:text-gray-100">{form.hiddenTestUploadMode === 'bulk' ? 'Bulk upload' : 'Pair / Manual'}</p></div>
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
                          <p className="font-semibold text-slate-700 dark:text-gray-200">Sample {index + 1}</p>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-gray-300">{testCase.input || '(empty input)'}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                    <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Parsed hidden tests</p>
                    <div className="mt-3 space-y-3">
                      {form.hiddenTestUploadMode === 'pairs' ? (
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
                                  <p className="font-semibold text-slate-700 dark:text-gray-200">Hidden {index + 1}</p>
                                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-gray-300">{testCase.input || '(empty input)'}</pre>
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
                      ) : <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-gray-800 dark:text-gray-300">Bulk files will be parsed server-side using delimiter <code>{form.hiddenBulkDelimiter || '###CASE###'}</code>.</div>}
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">{form.supportedLanguages.map((languageId) => <button key={languageId} type="button" onClick={() => setActiveLanguage(languageId)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeLanguage === languageId ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{getLanguageLabel(languageId)}</button>)}</div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-gray-700 dark:bg-gray-800" role="group" aria-label="Template editor mode">
                  <button
                    type="button"
                    onClick={() => setTemplateEditorMode('code')}
                    aria-pressed={templateEditorMode === 'code'}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${templateEditorMode === 'code' ? 'bg-white text-sky-700 shadow-sm dark:bg-gray-900 dark:text-sky-300' : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    Code Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateEditorMode('plain')}
                    aria-pressed={templateEditorMode === 'plain'}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${templateEditorMode === 'plain' ? 'bg-white text-sky-700 shadow-sm dark:bg-gray-900 dark:text-sky-300' : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
                  >
                    <TextCursorInput className="h-3.5 w-3.5" />
                    Plain Text
                  </button>
                </div>
              </div>
              {templateEditorMode === 'code' ? (
                <MonacoCodeEditor
                  key={`problem-template:${activeLanguage}`}
                  language={activeLanguage}
                  value={activeTemplate}
                  onChange={(nextTemplate) => updateTemplate(activeLanguage, nextTemplate)}
                  height={380}
                  readOnly={false}
                  internalClipboardOnly={false}
                  contentKey={`problem-template:${activeLanguage}`}
                />
              ) : (
                <textarea
                  key={`problem-template-plain:${activeLanguage}`}
                  value={activeTemplate}
                  onChange={(event) => updateTemplate(activeLanguage, event.target.value)}
                  aria-label={`${getLanguageLabel(activeLanguage)} code template`}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="h-[380px] w-full resize-y rounded-lg border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-sky-900/30"
                />
              )}
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



        <SectionCard
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
                {currentProblemId ? <button type="button" onClick={handleDelete} disabled={isDeleting || isSaving} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"><Trash2 className="h-4 w-4" />{isDeleting ? 'Deleting...' : 'Delete Problem'}</button> : null}
              </>
            )}
          </div>
          {isAssessment && !canAddToAssessment ? (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">Preview validation and required testcases/templates must be completed before adding to the assessment.</p>
          ) : null}
          {!isAssessment && !previewValidated ? <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">Publishing stays disabled until the preview IDE submits an Accepted solution and is approved.</p> : null}
        </SectionCard>
      </div>

      <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <ProblemStatementPreview problem={previewProblem} />
      </div>
    </div>
  );
}







