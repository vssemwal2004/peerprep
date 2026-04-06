import { useEffect, useMemo, useState } from 'react';
import { Play, Send, TerminalSquare } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import MonacoCodeEditor from './MonacoCodeEditor';
import {
  formatDuration,
  getLanguageLabel,
  submissionStatusClass,
} from './compilerUtils';

function createDrafts(problem) {
  return (problem?.supportedLanguages || []).reduce((acc, language) => {
    acc[language] = problem?.codeTemplates?.[language] || '';
    return acc;
  }, {});
}

export default function AdminCodeEditor({ problem }) {
  const toast = useToast();
  const [language, setLanguage] = useState(problem?.supportedLanguages?.[0] || 'python');
  const [drafts, setDrafts] = useState(() => createDrafts(problem));
  const [customInput, setCustomInput] = useState(problem?.sampleTestCases?.[0]?.input || '');
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const nextLanguage = problem?.supportedLanguages?.[0] || 'python';
    setLanguage(nextLanguage);
    setDrafts(createDrafts(problem));
    setCustomInput(problem?.sampleTestCases?.[0]?.input || '');
    setResult(null);
  }, [problem]);

  const activeCode = drafts[language] || '';
  const supportedLanguages = problem?.supportedLanguages || [];
  const hasProblem = Boolean(problem?._id);

  const summaryLabel = useMemo(() => {
    if (!result) return 'Use the editor to run or submit against the configured test cases.';
    if (result.status === 'AC') return 'Execution completed successfully.';
    return result.stderr || 'Execution completed with a failing result.';
  }, [result]);

  const updateDraft = (nextCode) => {
    setDrafts((previous) => ({
      ...previous,
      [language]: nextCode,
    }));
  };

  const handleRun = async () => {
    if (!hasProblem) return;
    setIsRunning(true);

    try {
      const response = await api.runCompilerProblem(problem._id, {
        language,
        sourceCode: activeCode,
        customInput,
      });
      setResult(response);
      toast.success(`Run finished with status ${response.status}`);
    } catch (error) {
      toast.error(error.message || 'Failed to run code.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!hasProblem) return;
    setIsSubmitting(true);

    try {
      const response = await api.submitCompilerProblem(problem._id, {
        language,
        sourceCode: activeCode,
      });
      setResult(response);
      toast.success(`Submission finished with status ${response.status}`);
    } catch (error) {
      toast.error(error.message || 'Failed to submit code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!problem) {
    return null;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.9fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
              Admin Playground
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-gray-100">
              Embedded Compiler
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {supportedLanguages.map((supportedLanguage) => (
              <button
                key={supportedLanguage}
                type="button"
                onClick={() => setLanguage(supportedLanguage)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  language === supportedLanguage
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {getLanguageLabel(supportedLanguage)}
              </button>
            ))}
          </div>
        </div>

        <MonacoCodeEditor
          language={language}
          value={activeCode}
          onChange={updateDraft}
          height={520}
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"
          >
            <Play className="h-4 w-4" />
            {isRunning ? 'Running...' : 'Run Code'}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isRunning || isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? 'Submitting...' : 'Submit Code'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-4.5 w-4.5 text-sky-500" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Custom Input</h4>
          </div>
          <textarea
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            rows={7}
            placeholder="Provide stdin for quick admin runs..."
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Output & Results</h4>
            {result?.status && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${submissionStatusClass(result.status)}`}>
                {result.status}
              </span>
            )}
          </div>

          <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{summaryLabel}</p>

          <div className="mt-4 rounded-xl bg-slate-950 px-4 py-4 text-xs text-slate-100">
            <pre className="overflow-x-auto whitespace-pre-wrap">
              {result?.output || result?.stderr || 'Run or submit to inspect the output.'}
            </pre>
          </div>

          {result && (
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-gray-400">
              <span>Language: {getLanguageLabel(language)}</span>
              <span>Execution: {formatDuration(result.executionTimeMs)}</span>
              {result.totalTestCases > 0 && (
                <span>Passed {result.passedTestCases}/{result.totalTestCases} cases</span>
              )}
            </div>
          )}

          {result?.failedCase && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/10">
              <h5 className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                Failed Test Case #{result.failedCase.index}
              </h5>
              <div className="mt-3 grid gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500 dark:text-rose-400">Input</p>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-700 dark:bg-gray-900 dark:text-gray-200">{result.failedCase.input || '(empty)'}</pre>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500 dark:text-rose-400">Expected Output</p>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-700 dark:bg-gray-900 dark:text-gray-200">{result.failedCase.expectedOutput || '(empty)'}</pre>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500 dark:text-rose-400">Actual Output</p>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-700 dark:bg-gray-900 dark:text-gray-200">{result.failedCase.actualOutput || '(empty)'}</pre>
                </div>
              </div>
            </div>
          )}

          {result?.testCaseResults?.length > 0 && (
            <div className="mt-4 space-y-2">
              {result.testCaseResults.map((testCaseResult) => (
                <div key={`${testCaseResult.index}-${testCaseResult.status}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-gray-200">Test Case {testCaseResult.index}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{formatDuration(testCaseResult.executionTimeMs)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${submissionStatusClass(testCaseResult.status)}`}>
                    {testCaseResult.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
