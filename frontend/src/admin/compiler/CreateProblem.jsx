import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, FilePlus2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import RichTextEditor from './RichTextEditor';
import MonacoCodeEditor from './MonacoCodeEditor';
import { ProblemStatementPreview } from './CompilerContentPreview';
import {
  COMPILER_LANGUAGES,
  buildProblemFormData,
  createDefaultProblemForm,
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

export default function CreateProblem({ mode = 'compiler', assessmentContext } = {}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { id, tempId } = useParams();
  const isAssessment = mode === 'assessment';
  const editorId = assessmentContext?.tempId || (isAssessment ? tempId : id);
  const isEditMode = !isAssessment && Boolean(id);
  const [loading, setLoading] = useState(isAssessment ? false : isEditMode);
  const [form, setForm] = useState(() => createDefaultProblemForm());
  const [activeTab, setActiveTab] = useState('details');
  const [activeLanguage, setActiveLanguage] = useState('python');
  const [currentProblemId, setCurrentProblemId] = useState(assessmentContext?.problemId || (isAssessment ? '' : (id || '')));
  const [currentStatus, setCurrentStatus] = useState('draft');
  const [previewValidated, setPreviewValidated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const autoSaveRef = useRef(null);
  const assessmentKey = assessmentContext?.assessmentKey || 'new';
  const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const assessmentReturnTo = assessmentContext?.returnTo || `${rolePrefix}/assessment`;

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
  }, [id, isEditMode, toast, isAssessment, editorId]);

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
  const activeReferenceSolution = form.referenceSolutions?.[activeLanguage] || '';
  const hasTemplate = form.supportedLanguages.some((language) => String(form.codeTemplates?.[language] || '').trim());
  const canAddToAssessment = isAssessment && previewValidated && visibleSampleCount > 0 && hiddenCount > 0 && hasTemplate;
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

  const updateTemplate = (nextTemplate) => {
    setForm((previous) => ({
      ...previous,
      codeTemplates: { ...previous.codeTemplates, [activeLanguage]: nextTemplate },
    }));
    setIsDirty(true);
  };

  const updateReferenceSolution = (nextSolution) => {
    setForm((previous) => ({
      ...previous,
      referenceSolutions: { ...(previous.referenceSolutions || {}), [activeLanguage]: nextSolution },
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

      setCurrentProblemId(response._id);
      setCurrentStatus(response.status || status);
      setPreviewValidated(Boolean(response.previewValidated ?? response.previewTested));
      setForm({
        ...createProblemFormFromProblem(response),
        hiddenTestFiles: [],
        hiddenBulkInputFile: null,
        hiddenBulkOutputFile: null,
        previewValidated: Boolean(response.previewValidated ?? response.previewTested),
      });
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
          form: createProblemFormFromProblem(response),
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
        if (isAssessment) {
          navigate(`${rolePrefix}/assessment/coding-question/${editorId}/preview/${response._id}?return=${encodeURIComponent(assessmentReturnTo)}`);
        } else {
          navigate(`${rolePrefix}/compiler/${response._id}/preview`);
        }
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
    await persistProblem('draft', { redirectToPreview: true });
  };

  const handleAddToAssessment = async () => {
    if (!canAddToAssessment) {
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
                onClick={() => navigate(`${rolePrefix}/compiler/${currentProblemId}/preview`)}
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
                      {form.hiddenTestUploadMode === 'pairs' ? form.hiddenTestCases.filter((item) => item.input || item.output).map((testCase, index) => (
                        <div key={`preview-hidden-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-gray-800">
                          <p className="font-semibold text-slate-700 dark:text-gray-200">Hidden {index + 1}</p>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-gray-300">{testCase.input || '(empty input)'}</pre>
                        </div>
                      )) : <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-gray-800 dark:text-gray-300">Bulk files will be parsed server-side using delimiter <code>{form.hiddenBulkDelimiter || '###CASE###'}</code>.</div>}
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
              <div className="mb-4 flex flex-wrap gap-2">{form.supportedLanguages.map((languageId) => <button key={languageId} type="button" onClick={() => setActiveLanguage(languageId)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeLanguage === languageId ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{getLanguageLabel(languageId)}</button>)}</div>
              <MonacoCodeEditor language={activeLanguage} value={activeTemplate} onChange={updateTemplate} height={380} />
            </SectionCard>

            <SectionCard title="Reference Solutions" subtitle="Optional private solutions for internal validation and expected-output generation.">
              <div className="mb-4 flex flex-wrap gap-2">{form.supportedLanguages.map((languageId) => <button key={languageId} type="button" onClick={() => setActiveLanguage(languageId)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeLanguage === languageId ? 'bg-slate-900 text-white dark:bg-sky-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{getLanguageLabel(languageId)}</button>)}</div>
              <MonacoCodeEditor language={activeLanguage} value={activeReferenceSolution} onChange={updateReferenceSolution} height={280} />
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
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Use for Assessment Only</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Assessment-only problems will not appear in the student problem list.</p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={form.visibility === 'assessment'}
                    onChange={(event) => updateField('visibility', event.target.checked ? 'assessment' : 'public')}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  {form.visibility === 'assessment' ? 'Assessment-only' : 'Public'}
                </label>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {isAssessment ? (
              <>
                <button type="button" onClick={() => persistProblem('draft')} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Save className="h-4 w-4" />{isSaving ? 'Saving...' : 'Save Draft'}</button>
                <button type="button" onClick={openPreview} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"><Eye className="h-4 w-4" />{isSaving ? 'Saving...' : 'Run Test / Validate'}</button>
                <button type="button" onClick={handleAddToAssessment} disabled={isSaving || !canAddToAssessment} title={!canAddToAssessment ? 'Complete validation checks before adding.' : ''} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"><FilePlus2 className="h-4 w-4" />Add to Assessment</button>
              </>
            ) : (
              <>
                <button type="button" onClick={openPreview} disabled={isSaving || isDeleting} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"><Eye className="h-4 w-4" />{isSaving ? 'Saving...' : 'Preview'}</button>
                <button type="button" onClick={() => persistProblem('draft')} disabled={isSaving || isDeleting} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Save className="h-4 w-4" />{isSaving ? 'Saving...' : 'Save Draft'}</button>
                <button type="button" onClick={() => persistProblem('published')} disabled={isSaving || isDeleting || !previewValidated || !currentProblemId} title={!previewValidated ? 'Preview testing is required before publishing.' : ''} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"><FilePlus2 className="h-4 w-4" />{isSaving ? (isEditMode ? 'Updating...' : 'Publishing...') : (isEditMode ? 'Update Problem' : 'Publish')}</button>
                {currentProblemId ? <button type="button" onClick={handleDelete} disabled={isDeleting || isSaving} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"><Trash2 className="h-4 w-4" />{isDeleting ? 'Deleting...' : 'Delete Problem'}</button> : null}
              </>
            )}
          </div>
          {isAssessment && !canAddToAssessment ? (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">Preview validation and required testcases/templates must be completed before adding to the assessment.</p>
          ) : null}
          {!isAssessment && !previewValidated ? <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">Publishing stays disabled until the admin completes at least one successful preview run or submit.</p> : null}
        </SectionCard>
      </div>

      <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <ProblemStatementPreview problem={previewProblem} />
      </div>
    </div>
  );
}







