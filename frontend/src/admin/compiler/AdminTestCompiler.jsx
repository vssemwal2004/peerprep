import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  PanelLeftOpen,
  PanelRightOpen,
  Play,
  RotateCcw,
  Send,
  Tag,
} from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import CodeEditor from '../../student/CodeEditor';
import {
  buildProblemDrafts,
  getCodeValidationMessage,
  getStarterCodeForLanguage,
} from '../../student/problemUtils';
import { RichTextPreview } from './CompilerContentPreview';
import { getLanguageLabel } from './compilerUtils';
import { DifficultyBadge, EmptyState, LoadingPanel, ProblemStatusBadge } from './CompilerUi';

function normalizeComparableText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

function createPreviewTestCases(problem) {
  const sampleCases = Array.isArray(problem?.sampleTestCases) ? problem.sampleTestCases : [];
  const mappedCases = sampleCases.map((testCase, index) => ({
    id: `sample-${index + 1}`,
    kind: 'sample',
    input: testCase?.input || '',
    expectedOutput: testCase?.output || '',
    explanation: testCase?.explanation || '',
  }));

  if (mappedCases.length > 0) {
    return mappedCases;
  }

  return [
    {
      id: 'custom-1',
      kind: 'custom',
      input: '',
      expectedOutput: '',
      explanation: '',
    },
  ];
}

function createCustomCase(nextIndex) {
  return {
    id: `custom-${nextIndex}`,
    kind: 'custom',
    input: '',
    expectedOutput: '',
    explanation: '',
  };
}

function statusLabel(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'AC') return 'Accepted';
  if (normalized === 'WA') return 'Wrong Answer';
  if (normalized === 'TLE') return 'Time Limit Exceeded';
  if (normalized === 'RE') return 'Runtime Error';
  if (normalized === 'CE') return 'Compilation Error';
  if (normalized === 'RUNNING') return 'Running';
  if (normalized === 'PENDING') return 'Pending';
  return status || 'Result';
}

function previewBadgeClass(previewValidated) {
  return previewValidated
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
    : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
}

function ProblemDescriptionPanel({ problem, previewValidated }) {
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [companiesOpen, setCompaniesOpen] = useState(false);

  const topics = Array.isArray(problem?.tags) ? problem.tags : [];
  const companies = Array.isArray(problem?.companyTags) ? problem.companyTags : [];
  const sampleCount = Array.isArray(problem?.sampleTestCases) ? problem.sampleTestCases.length : 0;

  return (
    <div className="space-y-6 px-5 py-5">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          <ProblemStatusBadge status={problem.status} />
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${previewBadgeClass(previewValidated)}`}>
            {previewValidated ? 'Preview Passed' : 'Preview Required'}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{problem.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
            {sampleCount} sample case{sampleCount === 1 ? '' : 's'} | {problem.hiddenTestCaseCount || 0} hidden case{(problem.hiddenTestCaseCount || 0) === 1 ? '' : 's'}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
          Description
        </h2>
        <RichTextPreview content={problem.description} />
      </section>

      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Input</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
            {problem.inputFormat || 'Input format will appear here.'}
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Output</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
            {problem.outputFormat || 'Output format will appear here.'}
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Constraints</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-gray-300">
            {problem.constraints || 'Constraints will appear here.'}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
            Examples
          </h2>
          <span className="text-xs text-slate-500 dark:text-gray-400">
            {sampleCount} sample cases
          </span>
        </div>

        {sampleCount === 0 ? (
          <EmptyState
            title="No sample cases available"
            description="Add at least one sample testcase to review this problem like a student."
          />
        ) : (
          <div className="space-y-4">
            {problem.sampleTestCases.map((testCase, index) => (
              <div
                key={`sample-${index + 1}`}
                className="overflow-hidden rounded-[24px] bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:bg-gray-900/85"
              >
                <div className="flex items-center justify-between gap-3 bg-slate-50/85 px-4 py-3 dark:bg-gray-800/85">
                  <div className="text-sm font-semibold text-slate-900 dark:text-gray-100">Example {index + 1}</div>
                </div>

                <div className="space-y-4 px-4 py-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Input</div>
                    <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:bg-gray-800 dark:text-gray-200">
                      {testCase.input || ''}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Output</div>
                    <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:bg-gray-800 dark:text-gray-200">
                      {testCase.output || ''}
                    </pre>
                  </div>

                  {testCase.explanation ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Explanation</div>
                      <div className="text-sm text-slate-700 dark:text-gray-300">{testCase.explanation}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(topics.length > 0 || companies.length > 0) ? (
        <section className="divide-y divide-slate-200/70 rounded-[22px] bg-slate-50/80 dark:divide-gray-700 dark:bg-gray-800/70">
          {topics.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setTopicsOpen((previous) => !previous)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Tag className="h-4 w-4 text-slate-500 dark:text-gray-400" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">Topics</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform dark:text-gray-500 ${topicsOpen ? 'rotate-180' : ''}`} />
              </button>
              {topicsOpen ? (
                <div className="px-4 pb-3">
                  <div className="flex flex-wrap gap-2">
                    {topics.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {companies.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setCompaniesOpen((previous) => !previous)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">Companies</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform dark:text-gray-500 ${companiesOpen ? 'rotate-180' : ''}`} />
              </button>
              {companiesOpen ? (
                <div className="px-4 pb-3">
                  <div className="flex flex-wrap gap-2">
                    {companies.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function normalizeRunResult(response, activeCase) {
  const actualOutput = response?.output || '';
  const compileOutput = response?.compileOutput || '';
  const stderr = response?.stderr || '';
  const expectedOutput = activeCase?.expectedOutput ?? null;

  let verdict = statusLabel(response?.status);

  if (!compileOutput && !stderr && expectedOutput !== null && expectedOutput !== undefined) {
    verdict = normalizeComparableText(actualOutput) === normalizeComparableText(expectedOutput)
      ? 'Accepted'
      : 'Wrong Answer';
  }

  return {
    mode: 'run',
    status: verdict,
    stdout: actualOutput,
    output: actualOutput,
    input: activeCase?.input ?? '',
    expectedOutput,
    compile_output: compileOutput,
    compileOutput,
    stderr,
    error: compileOutput || stderr || '',
    time: Number(response?.executionTimeMs || 0) / 1000,
    memory: Number(response?.memoryUsedKb || 0),
  };
}

function normalizeSubmitResult(response) {
  return {
    status: statusLabel(response?.status),
    output: response?.output || '',
    stderr: response?.stderr || '',
    error: response?.compileOutput || response?.stderr || '',
    compile_output: response?.compileOutput || '',
    compileOutput: response?.compileOutput || '',
    executionTimeMs: Number(response?.executionTimeMs || 0),
    memoryUsedKb: Number(response?.memoryUsedKb || 0),
    total: Number(response?.totalTestCases || 0),
    passed: Number(response?.passedTestCases || 0),
    failedTestCase: response?.failedCase
      ? {
        index: response.failedCase.index,
        input: response.failedCase.input || '',
        expected: response.failedCase.expectedOutput || '',
        actual: response.failedCase.actualOutput || '',
      }
      : null,
    testCaseResults: Array.isArray(response?.testCaseResults)
      ? response.testCaseResults.map((entry) => ({
        ...entry,
        status: statusLabel(entry?.status),
      }))
      : [],
  };
}

export default function AdminTestCompiler({ backTo, editTo, backLabel = 'Back', editLabel = 'Back to Edit' } = {}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';

  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState(null);
  const [language, setLanguage] = useState('python');
  const [drafts, setDrafts] = useState({});
  const [testCases, setTestCases] = useState([]);
  const [activeTestCaseId, setActiveTestCaseId] = useState(null);
  const [activeConsoleTab, setActiveConsoleTab] = useState('testcase');
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leftWidth, setLeftWidth] = useState(null);
  const [mobileView, setMobileView] = useState('description');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const splitContainerRef = useRef(null);
  const dragFrameRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadProblem = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerProblem(id);
        if (!isMounted) return;

        const nextCases = createPreviewTestCases(response);
        setProblem(response);
        setLanguage(response.supportedLanguages?.[0] || 'python');
        setDrafts(buildProblemDrafts(response));
        setTestCases(nextCases);
        setActiveTestCaseId(nextCases[0]?.id || null);
        setActiveConsoleTab('testcase');
        setResult(null);
        setLeftWidth(null);
      } catch (error) {
        toast.error(error.message || 'Failed to load problem.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProblem();
    return () => {
      isMounted = false;
    };
  }, [id, toast]);

  const activeCode = drafts[language] || '';
  const activeTestCase = useMemo(() => {
    if (!Array.isArray(testCases) || testCases.length === 0) return null;
    return testCases.find((entry) => String(entry.id) === String(activeTestCaseId)) || testCases[0];
  }, [activeTestCaseId, testCases]);

  const previewValidated = Boolean(problem?.previewValidated ?? problem?.previewTested);

  const verdictStatus = useMemo(() => {
    if (!result) return '';
    if (typeof result.status === 'string') return result.status;
    return statusLabel(result.status);
  }, [result]);

  const verdictTone = useMemo(() => {
    const lower = String(verdictStatus || '').toLowerCase();
    if (lower.includes('accepted')) return 'success';
    if (lower.includes('wrong') || lower.includes('time') || lower.includes('error') || lower.includes('compilation')) return 'danger';
    return 'neutral';
  }, [verdictStatus]);

  const updateDraft = (nextCode) => {
    setDrafts((previous) => ({
      ...previous,
      [language]: nextCode,
    }));
  };

  const handleAddCustomTestCase = () => {
    setTestCases((previous) => {
      const nextCustomIndex = previous.filter((entry) => entry.kind === 'custom').length + 1;
      const nextCase = createCustomCase(nextCustomIndex);
      setActiveTestCaseId(nextCase.id);
      return [...previous, nextCase];
    });
    setActiveConsoleTab('testcase');
  };

  const handleTestCaseInputChange = (testCaseId, nextInput) => {
    setTestCases((previous) => previous.map((entry) => (
      String(entry.id) === String(testCaseId)
        ? { ...entry, input: nextInput }
        : entry
    )));
  };

  const resetCode = () => {
    setDrafts((previous) => ({
      ...previous,
      [language]: getStarterCodeForLanguage(problem, language),
    }));
    toast.success(`Reset ${getLanguageLabel(language)} starter code.`);
  };

  const handleRun = async () => {
    if (!problem?._id) return;

    const validationMessage = getCodeValidationMessage(activeCode, getStarterCodeForLanguage(problem, language), 'run');
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setIsRunning(true);
    setActiveConsoleTab('result');

    try {
      const response = await api.runCompilerProblem(problem._id, {
        language,
        sourceCode: activeCode,
        customInput: activeTestCase?.input || '',
      });
      const normalized = normalizeRunResult(response, activeTestCase);
      setResult(normalized);
      setProblem((previous) => (
        response?.status === 'AC' && previous
          ? { ...previous, previewValidated: true, previewTested: true }
          : previous
      ));
      toast.success(`Run finished with verdict ${normalized.status}.`);
    } catch (error) {
      toast.error(error.message || 'Failed to run code.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!problem?._id) return;

    const validationMessage = getCodeValidationMessage(activeCode, getStarterCodeForLanguage(problem, language), 'submit');
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setIsSubmitting(true);
    setActiveConsoleTab('result');

    try {
      const response = await api.submitCompilerProblem(problem._id, {
        language,
        sourceCode: activeCode,
      });
      const normalized = normalizeSubmitResult(response);
      setResult(normalized);
      setProblem((previous) => (
        response?.status === 'AC' && previous
          ? { ...previous, previewValidated: true, previewTested: true }
          : previous
      ));
      toast.success(`Submission finished with verdict ${normalized.status}.`);
    } catch (error) {
      toast.error(error.message || 'Failed to submit code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clampLeftWidth = (width) => {
    const containerWidth = splitContainerRef.current?.getBoundingClientRect().width || 1200;
    const min = 320;
    const max = Math.max(420, containerWidth - 480);
    return Math.min(max, Math.max(min, width));
  };

  const handleResizeStart = (event) => {
    if (!splitContainerRef.current) return;

    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore pointer capture failures.
    }

    const containerRect = splitContainerRef.current.getBoundingClientRect();
    const defaultWidth = containerRect.width > 0 ? containerRect.width * 0.42 : 480;
    const startWidth = clampLeftWidth(leftWidth ?? defaultWidth);
    const startX = event.clientX;
    let latestWidth = startWidth;

    const schedule = (next) => {
      latestWidth = clampLeftWidth(next);
      if (dragFrameRef.current) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        setLeftWidth(latestWidth);
      });
    };

    const handlePointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      schedule(startWidth + delta);
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (loading) {
    return <LoadingPanel label="Loading preview workspace..." />;
  }

  if (!problem) {
    return (
      <EmptyState
        title="Problem unavailable"
        description="The requested preview could not be loaded."
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-9rem)] overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_34%),linear-gradient(180deg,_#f8fbff_0%,_#eff6ff_45%,_#f8fafc_100%)] shadow-[0_16px_45px_rgba(15,23,42,0.06)] dark:bg-[linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
      <div className="flex min-h-[calc(100vh-9rem)] flex-col">
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 bg-white/86 px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)] backdrop-blur-xl dark:bg-gray-900/88">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(backTo || `${rolePrefix}/compiler/problems`)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white/90 px-3 text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition-colors hover:bg-white dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden text-sm font-semibold sm:inline">{backLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => setDetailsOpen((previous) => !previous)}
              className="hidden items-center gap-2 rounded-xl bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition-colors hover:bg-white dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 lg:inline-flex"
            >
              {detailsOpen ? <PanelRightOpen className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              Details
            </button>

            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{problem.title}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {previewValidated ? 'Preview validation completed' : 'Preview validation required before publish'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-xl bg-white/85 px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-500"
            >
              {(problem.supportedLanguages || []).map((supportedLanguage) => (
                <option key={supportedLanguage} value={supportedLanguage}>
                  {getLanguageLabel(supportedLanguage)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? 'Running...' : 'Run'}
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"
            >
              <Send className="h-3.5 w-3.5" />
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>

            <button
              type="button"
              onClick={resetCode}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.03)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>

            <button
              type="button"
              onClick={() => navigate(editTo || `${rolePrefix}/compiler/${problem._id}/edit`)}
              className="hidden rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.03)] transition-colors hover:bg-white dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 lg:inline-flex"
            >
              {editLabel}
            </button>

            <div className="flex items-center gap-1 rounded-2xl bg-white/90 p-1 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:bg-gray-900 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileView('description')}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${mobileView === 'description' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                Description
              </button>
              <button
                type="button"
                onClick={() => setMobileView('editor')}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${mobileView === 'editor' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                Editor
              </button>
            </div>
          </div>
        </header>

        <div className="relative hidden min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2 lg:flex">
          {detailsOpen ? (
            <>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="absolute inset-0 z-30 cursor-default bg-transparent"
                aria-label="Close details panel"
              />
              <aside className="absolute inset-y-0 left-0 z-40 flex w-[35vw] min-w-[340px] max-w-[460px] flex-col overflow-hidden rounded-r-[30px] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)] dark:bg-gray-900">
                <div className="border-b border-slate-200/70 px-5 py-4 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">Preview Details</p>
                      <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${previewBadgeClass(previewValidated)}`}>
                        {previewValidated ? 'Preview Passed' : 'Preview Required'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(editTo || `${rolePrefix}/compiler/${problem._id}/edit`)}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {editLabel}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ProblemDescriptionPanel problem={problem} previewValidated={previewValidated} />
                </div>
              </aside>
            </>
          ) : null}

          <div
            ref={splitContainerRef}
            className="mx-auto grid min-h-0 w-full flex-1 grid-cols-[auto_16px_minmax(0,1fr)] overflow-hidden"
          >
            <section
              style={{
                width: leftWidth === null ? 'clamp(320px, 40vw, 680px)' : `${leftWidth}px`,
                flexBasis: leftWidth === null ? 'clamp(320px, 40vw, 680px)' : `${leftWidth}px`,
                willChange: 'width',
              }}
              className="flex shrink-0 min-w-[320px] flex-col overflow-hidden rounded-[30px] bg-white/84 shadow-[0_10px_32px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/84"
            >
              <div className="border-b border-slate-200/70 bg-white/92 px-5 py-3 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/92">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">Problem Details</p>
                    <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${verdictTone === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : verdictTone === 'danger' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                      {verdictStatus || (previewValidated ? 'Preview Passed' : 'Ready for Validation')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Open Side Panel
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
                <ProblemDescriptionPanel problem={problem} previewValidated={previewValidated} />
              </div>
            </section>

            <button
              type="button"
              onPointerDown={handleResizeStart}
              className="group relative flex w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center transition-colors"
              aria-label="Resize panels"
            >
              <div className="absolute inset-y-5 left-1/2 w-px -translate-x-1/2 rounded-full bg-slate-200/90 dark:bg-gray-700" />
              <div className="relative z-10 rounded-full bg-white/92 p-1 text-slate-400 shadow-[0_10px_20px_rgba(15,23,42,0.06)] transition-colors group-hover:text-sky-500 dark:bg-gray-900 dark:text-gray-500">
                <PanelLeftOpen className="h-3.5 w-3.5 rotate-90" />
              </div>
            </button>

            <section className="min-h-0 min-w-0 overflow-hidden">
              <CodeEditor
                supportedLanguages={problem.supportedLanguages || []}
                language={language}
                code={activeCode}
                onLanguageChange={setLanguage}
                onCodeChange={updateDraft}
                customInput={activeTestCase?.input || ''}
                testCases={testCases}
                activeTestCaseId={activeTestCaseId}
                onActiveTestCaseChange={setActiveTestCaseId}
                onAddCustomTestCase={handleAddCustomTestCase}
                onTestCaseInputChange={handleTestCaseInputChange}
                expectedOutputForRun={activeTestCase?.expectedOutput ?? null}
                runInputUsed={activeTestCase?.input || ''}
                activeConsoleTab={activeConsoleTab}
                onConsoleTabChange={setActiveConsoleTab}
                result={result}
                isRunning={isRunning}
                isSubmitting={isSubmitting}
                onRun={handleRun}
                onSubmit={handleSubmit}
                onReset={resetCode}
                showToolbar={false}
              />
            </section>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 px-3 pb-3 pt-2 lg:hidden">
          <div className={`overflow-hidden rounded-[28px] bg-white/84 shadow-[0_10px_32px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/84 ${mobileView === 'description' ? 'block' : 'hidden'}`}>
            <ProblemDescriptionPanel problem={problem} previewValidated={previewValidated} />
          </div>

          <div className={`${mobileView === 'editor' ? 'block' : 'hidden'}`}>
            <CodeEditor
              supportedLanguages={problem.supportedLanguages || []}
              language={language}
              code={activeCode}
              onLanguageChange={setLanguage}
              onCodeChange={updateDraft}
              customInput={activeTestCase?.input || ''}
              testCases={testCases}
              activeTestCaseId={activeTestCaseId}
              onActiveTestCaseChange={setActiveTestCaseId}
              onAddCustomTestCase={handleAddCustomTestCase}
              onTestCaseInputChange={handleTestCaseInputChange}
              expectedOutputForRun={activeTestCase?.expectedOutput ?? null}
              runInputUsed={activeTestCase?.input || ''}
              activeConsoleTab={activeConsoleTab}
              onConsoleTabChange={setActiveConsoleTab}
              result={result}
              isRunning={isRunning}
              isSubmitting={isSubmitting}
              onRun={handleRun}
              onSubmit={handleSubmit}
              onReset={resetCode}
              showToolbar={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
