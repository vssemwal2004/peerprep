import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FilePlus2, FlaskConical, Plus, Save, Upload, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import RichTextEditor from './RichTextEditor';
import MonacoCodeEditor from './MonacoCodeEditor';
import { ProblemStatementPreview } from './CompilerContentPreview';
import {
  COMPILER_LANGUAGES,
  buildProblemFormData,
  buildPreviewRunFormData,
  createDefaultProblemForm,
  createEmptySampleTestCase,
  deriveHiddenFilePairs,
  formatDuration,
  getLanguageLabel,
  submissionStatusClass,
} from './compilerUtils';
import { SectionCard } from './CompilerUi';

export default function CreateProblem() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(() => createDefaultProblemForm());
  const [activeLanguage, setActiveLanguage] = useState('python');
  const [previewInput, setPreviewInput] = useState('');
  const [runResult, setRunResult] = useState(null);
  const [currentProblemId, setCurrentProblemId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!form.supportedLanguages.includes(activeLanguage)) {
      setActiveLanguage(form.supportedLanguages[0] || 'python');
    }
  }, [activeLanguage, form.supportedLanguages]);

  const hiddenPairs = useMemo(() => deriveHiddenFilePairs(form.hiddenTestFiles), [form.hiddenTestFiles]);
  const activeTemplate = form.codeTemplates[activeLanguage] || '';
  const activeReferenceSolution = form.referenceSolutions?.[activeLanguage] || '';

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
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
  };

  const updateTemplate = (nextTemplate) => {
    setForm((previous) => ({
      ...previous,
      codeTemplates: {
        ...previous.codeTemplates,
        [activeLanguage]: nextTemplate,
      },
    }));
  };

  const updateReferenceSolution = (nextSolution) => {
    setForm((previous) => ({
      ...previous,
      referenceSolutions: {
        ...(previous.referenceSolutions || {}),
        [activeLanguage]: nextSolution,
      },
    }));
  };

  const updateSampleTestCase = (index, field, value) => {
    setForm((previous) => ({
      ...previous,
      sampleTestCases: previous.sampleTestCases.map((testCase, sampleIndex) => (
        sampleIndex === index ? { ...testCase, [field]: value } : testCase
      )),
    }));
  };

  const addSampleTestCase = () => {
    setForm((previous) => ({
      ...previous,
      sampleTestCases: [...previous.sampleTestCases, createEmptySampleTestCase()],
    }));
  };

  const removeSampleTestCase = (index) => {
    setForm((previous) => ({
      ...previous,
      sampleTestCases: previous.sampleTestCases.filter((_, sampleIndex) => sampleIndex !== index),
    }));
  };

  const persistProblem = async (status) => {
    if (form.hiddenTestUploadMode === 'pairs' && hiddenPairs.issues.length > 0) {
      toast.error('Fix hidden test case upload issues before saving.');
      return;
    }

    if (
      form.hiddenTestUploadMode === 'bulk'
      && (!form.hiddenBulkInputFile || !form.hiddenBulkOutputFile)
      && status === 'Active'
    ) {
      toast.error('Bulk hidden mode requires both inputs and outputs files before publishing.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = buildProblemFormData(form, status);
      const response = currentProblemId
        ? await api.updateCompilerProblem(currentProblemId, payload)
        : await api.createCompilerProblem(payload);

      setCurrentProblemId(response._id);
      setForm((previous) => ({
        ...previous,
        hiddenTestFiles: [],
        hiddenBulkInputFile: null,
        hiddenBulkOutputFile: null,
      }));

      toast.success(status === 'Active' ? 'Problem published successfully.' : 'Draft saved successfully.');

      if (status === 'Active') {
        navigate(`/admin/compiler/problems/${response._id}`);
      }
    } catch (error) {
      toast.error(error.message || 'Failed to save problem.');
    } finally {
      setIsSaving(false);
    }
  };

  const runPreview = async () => {
    setIsRunning(true);

    try {
      const response = await api.runCompilerPreview(
        buildPreviewRunFormData(
          form,
          activeLanguage,
          previewInput || form.sampleTestCases[0]?.input || '',
        ),
      );
      setRunResult(response);
      toast.success(`Preview run finished with status ${response.status}`);
    } catch (error) {
      toast.error(error.message || 'Failed to run preview.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.85fr)]">
      <div className="space-y-6">
        <SectionCard
          title="Create Problem"
          subtitle="Author a problem statement, starter templates, and judge configuration for the admin compiler."
          action={currentProblemId ? (
            <button
              type="button"
              onClick={() => navigate(`/admin/compiler/problems/${currentProblemId}`)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Open Workspace
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Problem Title</label>
              <input
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="Example: Longest Increasing Subsequence"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Problem Description</label>
              <RichTextEditor
                value={form.description}
                onChange={(value) => updateField('description', value)}
                rows={14}
                placeholder="Use headings, bullets, quotes, and inline code to structure the problem statement."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Difficulty</label>
              <select
                value={form.difficulty}
                onChange={(event) => updateField('difficulty', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Tags</label>
              <input
                value={form.tags}
                onChange={(event) => updateField('tags', event.target.value)}
                placeholder="arrays, dp, greedy"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Company Tags</label>
              <input
                value={form.companyTags}
                onChange={(event) => updateField('companyTags', event.target.value)}
                placeholder="Amazon, Google, Microsoft"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Supported Languages" subtitle="Choose which runtimes admins can use for testing and submission evaluation.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {COMPILER_LANGUAGES.map((language) => {
              const checked = form.supportedLanguages.includes(language.id);
              return (
                <label key={language.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${checked ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/10' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLanguage(language.id)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-gray-200">{language.label}</span>
                </label>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Code Templates" subtitle="Every selected language must keep STUDENT_CODE_START and STUDENT_CODE_END markers intact.">
          <div className="mb-4 flex flex-wrap gap-2">
            {form.supportedLanguages.map((languageId) => (
              <button
                key={languageId}
                type="button"
                onClick={() => setActiveLanguage(languageId)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeLanguage === languageId ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                {getLanguageLabel(languageId)}
              </button>
            ))}
          </div>
          <MonacoCodeEditor language={activeLanguage} value={activeTemplate} onChange={updateTemplate} height={360} />
        </SectionCard>

        <SectionCard
          title="Reference Solution (Optional)"
          subtitle="Used to generate expected output for student custom testcases. Not visible to students."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {form.supportedLanguages.map((languageId) => (
              <button
                key={languageId}
                type="button"
                onClick={() => setActiveLanguage(languageId)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeLanguage === languageId ? 'bg-slate-900 text-white dark:bg-sky-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                {getLanguageLabel(languageId)}
              </button>
            ))}
          </div>
          <MonacoCodeEditor
            language={activeLanguage}
            value={activeReferenceSolution}
            onChange={updateReferenceSolution}
            height={260}
          />
          <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">
            Leave blank if you do not want custom testcase expected outputs.
          </p>
        </SectionCard>

        <SectionCard title="Input / Output Specification" subtitle="Define the public-facing contract for the problem statement.">
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

        <SectionCard title="Execution Limits" subtitle="Use the existing platform defaults unless a problem needs tighter control.">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Time Limit (sec)</label>
              <input type="number" min="1" step="0.5" value={form.timeLimitSeconds} onChange={(event) => updateField('timeLimitSeconds', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Memory Limit (MB)</label>
              <input type="number" min="64" step="64" value={form.memoryLimitMb} onChange={(event) => updateField('memoryLimitMb', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Sample Test Cases" subtitle="Public examples shown to admins inside the problem preview and detail workspace.">
          <div className="space-y-4">
            {form.sampleTestCases.map((testCase, index) => (
              <div key={`sample-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Sample {index + 1}</h4>
                  {form.sampleTestCases.length > 1 && (
                    <button type="button" onClick={() => removeSampleTestCase(index)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <textarea value={testCase.input} onChange={(event) => updateSampleTestCase(index, 'input', event.target.value)} rows={5} placeholder="Input" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                  <textarea value={testCase.output} onChange={(event) => updateSampleTestCase(index, 'output', event.target.value)} rows={5} placeholder="Output" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                  <textarea value={testCase.explanation} onChange={(event) => updateSampleTestCase(index, 'explanation', event.target.value)} rows={5} placeholder="Explanation" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />
                </div>
              </div>
            ))}
            <button type="button" onClick={addSampleTestCase} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <Plus className="h-4 w-4" />
              Add Sample Test Case
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Hidden Test Cases" subtitle="Use pair mode for input_1/output_1 uploads, or bulk mode for one inputs.txt and outputs.txt file.">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${form.hiddenTestUploadMode === 'pairs' ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/10' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
              <input
                type="radio"
                name="hidden-upload-mode"
                checked={form.hiddenTestUploadMode === 'pairs'}
                onChange={() => updateField('hiddenTestUploadMode', 'pairs')}
                className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-gray-200">Pair files mode</span>
            </label>
            <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${form.hiddenTestUploadMode === 'bulk' ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/10' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
              <input
                type="radio"
                name="hidden-upload-mode"
                checked={form.hiddenTestUploadMode === 'bulk'}
                onChange={() => updateField('hiddenTestUploadMode', 'bulk')}
                className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-gray-200">Bulk S3 mode</span>
            </label>
          </div>

          {form.hiddenTestUploadMode === 'pairs' ? (
            <>
              <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                <Upload className="mr-2 h-4 w-4" />
                Upload hidden test case files
                <input type="file" multiple accept=".txt" className="hidden" onChange={(event) => updateField('hiddenTestFiles', Array.from(event.target.files || []))} />
              </label>

              {(hiddenPairs.pairs.length > 0 || hiddenPairs.issues.length > 0) && (
                <div className="mt-4 space-y-3">
                  {hiddenPairs.pairs.map((pair) => (
                    <div key={pair.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-gray-700">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Pair {pair.key}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{pair.input || 'Missing input'} / {pair.output || 'Missing output'}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pair.complete ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                        {pair.complete ? 'Matched' : 'Incomplete'}
                      </span>
                    </div>
                  ))}

                  {hiddenPairs.issues.map((issue) => (
                    <p key={issue} className="text-sm text-rose-600 dark:text-rose-300">{issue}</p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                  <Upload className="mr-2 h-4 w-4" />
                  {form.hiddenBulkInputFile ? form.hiddenBulkInputFile.name : 'Upload inputs.txt'}
                  <input
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={(event) => updateField('hiddenBulkInputFile', event.target.files?.[0] || null)}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                  <Upload className="mr-2 h-4 w-4" />
                  {form.hiddenBulkOutputFile ? form.hiddenBulkOutputFile.name : 'Upload outputs.txt'}
                  <input
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={(event) => updateField('hiddenBulkOutputFile', event.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Bulk Delimiter</label>
                <input
                  value={form.hiddenBulkDelimiter || '###CASE###'}
                  onChange={(event) => updateField('hiddenBulkDelimiter', event.target.value)}
                  placeholder="###CASE###"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                  Keep the same delimiter in inputs and outputs files. Example: <code>###CASE###</code>
                </p>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Actions" subtitle="Save drafts iteratively, run quick checks, and publish when the judge configuration is complete.">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={runPreview} disabled={isRunning || isSaving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700">
              <FlaskConical className="h-4 w-4" />
              {isRunning ? 'Running...' : 'Run Test'}
            </button>
            <button type="button" onClick={() => persistProblem('Draft')} disabled={isSaving || isRunning} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button type="button" onClick={() => persistProblem('Active')} disabled={isSaving || isRunning} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700">
              <FilePlus2 className="h-4 w-4" />
              {isSaving ? 'Publishing...' : 'Publish Problem'}
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <ProblemStatementPreview
          problem={{
            ...form,
            status: currentProblemId ? 'Draft' : 'Draft',
            tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean),
            companyTags: form.companyTags.split(',').map((item) => item.trim()).filter(Boolean),
            hiddenTestCaseCount: form.hiddenTestUploadMode === 'bulk'
              ? (form.hiddenBulkInputFile && form.hiddenBulkOutputFile ? 1 : 0)
              : hiddenPairs.pairs.filter((pair) => pair.complete).length,
          }}
        />

        <SectionCard title="Quick Compiler Check" subtitle="Run the current template with a custom admin input before saving or publishing.">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Preview Input</label>
          <textarea value={previewInput} onChange={(event) => setPreviewInput(event.target.value)} rows={6} placeholder="Defaults to the first sample input when left empty." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900" />

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-gray-400">Running in {getLanguageLabel(activeLanguage)}</p>
            {runResult?.status && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${submissionStatusClass(runResult.status)}`}>
                {runResult.status}
              </span>
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4 text-xs text-slate-100">
            <pre className="overflow-x-auto whitespace-pre-wrap">{runResult?.output || runResult?.stderr || 'Run Test to inspect the current starter template output.'}</pre>
          </div>

          {runResult && (
            <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">Execution time: {formatDuration(runResult.executionTimeMs)}</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
