import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  PanelLeftOpen,
  Tag,
  X,
} from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import ProblemAssetImages from '../../components/ProblemAssetImages';
import CodeEditor from '../../student/CodeEditor';
import {
  buildProblemDrafts,
  getCodeValidationMessage,
  getStarterCodeForLanguage,
} from '../../student/problemUtils';
import { RichTextPreview } from './CompilerContentPreview';
import { getDisplayProblemStatement } from './problemStatementFormatting';
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
  const hints = Array.isArray(problem?.hints)
    ? problem.hints.filter((hint) => String(hint || '').trim()).slice(0, 10)
    : [];
  const faqs = Array.isArray(problem?.faqs)
    ? problem.faqs.filter((faq) => String(faq?.question || '').trim() || String(faq?.answer || '').trim())
    : [];
  const sampleCount = Array.isArray(problem?.sampleTestCases) ? problem.sampleTestCases.length : 0;
  const isSql = problem?.category === 'SQL';
  const constraintItems = String(problem?.constraints || '')
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  const descriptionImages = (problem?.contentImages || []).filter((image) => image.section !== 'constraints');
  const constraintImages = (problem?.contentImages || []).filter((image) => image.section === 'constraints');

  return (
    <div className="space-y-7 px-5 py-6 sm:px-6">
      <section>
        <h1 className="text-[24px] font-semibold leading-8 tracking-tight text-slate-950 dark:text-white">{problem.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          <ProblemStatusBadge status={problem.status} />
          {isSql ? <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">SQLite</span> : null}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${previewBadgeClass(previewValidated)}`}>
            {previewValidated ? 'Preview Passed' : 'Preview Required'}
          </span>
        </div>
      </section>

      <section className="space-y-4">
        <RichTextPreview content={getDisplayProblemStatement(problem.description, sampleCount > 0)} lead />
        <ProblemAssetImages images={descriptionImages} />
      </section>

      <section className="space-y-7">
        {isSql && problem.sqlConfig?.schemaSql ? <div className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Database schema</h2><pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-sky-100">{problem.sqlConfig.schemaSql}</pre></div> : null}
        {isSql && problem.sqlConfig?.seedDataSql ? <div className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Sample data</h2><pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-sky-100">{problem.sqlConfig.seedDataSql}</pre></div> : null}
        {isSql ? <div className="space-y-2"><h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">Schema notes</h2><RichTextPreview content={problem.inputFormat || 'Schema notes will appear here.'} /></div> : null}
        {isSql ? <div className="space-y-2"><h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">Required result</h2><RichTextPreview content={problem.outputFormat || 'Required result will appear here.'} /></div> : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">
            Examples
          </h2>
        </div>

        {sampleCount === 0 ? (
          <EmptyState
            title="No sample cases available"
            description="Add at least one sample testcase to review this problem like a student."
          />
        ) : (
          <div className="space-y-5">
            {problem.sampleTestCases.map((testCase, index) => (
              <article
                key={`sample-${index + 1}`}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="text-base font-semibold text-slate-900 dark:text-gray-100">Example {index + 1}:</div>

                <ProblemAssetImages images={testCase.images} />
                <div className="space-y-3 rounded-lg bg-slate-50 px-4 py-3.5 font-mono text-[13px] leading-6 text-slate-800 dark:bg-gray-800 dark:text-gray-200">
                  <div>
                    <div className="font-sans text-sm font-semibold text-slate-900 dark:text-gray-100">Input:</div>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
                      {testCase.input || ''}
                    </pre>
                  </div>

                  <div>
                    <div className="font-sans text-sm font-semibold text-slate-900 dark:text-gray-100">Output:</div>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
                      {testCase.output || ''}
                    </pre>
                  </div>
                </div>

                {testCase.explanation ? (
                  <div className="border-t border-slate-100 pt-3 text-[15px] leading-6 text-slate-800 dark:border-gray-800 dark:text-gray-200">
                    <span className="font-semibold text-slate-950 dark:text-white">Explanation: </span>
                    <RichTextPreview className="mt-1" content={testCase.explanation} />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">{isSql ? 'Query rules' : 'Constraints'}</h2>
        {constraintItems.length ? <ul className="list-disc space-y-2 pl-6 font-mono text-[13px] leading-6 text-slate-800 marker:text-slate-600 dark:text-gray-200 dark:marker:text-gray-400">{constraintItems.map((constraint, index) => <li key={`${constraint}-${index}`} className="break-words pl-1">{constraint}</li>)}</ul> : <p className="text-sm text-slate-500 dark:text-gray-400">No additional constraints.</p>}
        <ProblemAssetImages images={constraintImages} />
      </section>

      {hints.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">AnvI Approaches</h2>
            <span className="text-xs text-slate-500 dark:text-gray-400">{hints.length} configured</span>
          </div>
          <div className="space-y-2">
            {hints.map((hint, index) => (
              <details key={`preview-hint-${index + 1}`} className="group rounded-[18px] border border-sky-100 bg-sky-50/70 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-900/10">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-sky-800 dark:text-sky-200">
                  AnvI approach {index + 1}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-300">{hint}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {faqs.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">FAQ</h2>
            <span className="text-xs text-slate-500 dark:text-gray-400">{faqs.length} notes</span>
          </div>
          <div className="divide-y divide-slate-200/70 overflow-hidden rounded-[22px] bg-slate-50/80 dark:divide-gray-700 dark:bg-gray-800/70">
            {faqs.map((faq, index) => (
              <details key={`preview-faq-${index + 1}`} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 dark:text-gray-100">
                  {faq.question || `Question ${index + 1}`}
                  <ChevronDown className="h-4 w-4 flex-none text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-gray-300">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

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

function aggregateRunResults(caseResults) {
  const normalizedResults = Array.isArray(caseResults) ? caseResults : [];
  const firstFailure = normalizedResults.find((entry) => entry.status !== 'Accepted');
  const status = firstFailure?.status || (normalizedResults.length > 0 ? 'Accepted' : 'Run Result');
  const totalTime = normalizedResults.reduce((sum, entry) => sum + Number(entry.time || 0), 0);
  const maxMemory = normalizedResults.reduce((max, entry) => Math.max(max, Number(entry.memory || 0)), 0);
  const passed = normalizedResults.filter((entry) => entry.status === 'Accepted').length;

  return {
    mode: 'run',
    status,
    time: totalTime,
    memory: maxMemory,
    total: normalizedResults.length,
    passed,
    caseResults: normalizedResults,
    output: normalizedResults[0]?.output || '',
    stdout: normalizedResults[0]?.stdout || '',
    input: normalizedResults[0]?.input || '',
    expectedOutput: normalizedResults[0]?.expectedOutput ?? null,
    compile_output: firstFailure?.compile_output || normalizedResults[0]?.compile_output || '',
    compileOutput: firstFailure?.compileOutput || normalizedResults[0]?.compileOutput || '',
    stderr: firstFailure?.stderr || normalizedResults[0]?.stderr || '',
    error: firstFailure?.error || normalizedResults[0]?.error || '',
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

export default function AdminTestCompiler({ backTo, editTo, backLabel = 'Back', editLabel = 'Back to Edit', headerTargetId = '' } = {}) {
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
  const [isApprovingPublish, setIsApprovingPublish] = useState(false);
  const [leftWidth, setLeftWidth] = useState(null);
  const [mobileView, setMobileView] = useState('description');
  const [headerTarget, setHeaderTarget] = useState(null);

  const splitContainerRef = useRef(null);
  const dragFrameRef = useRef(null);
  const resizeCleanupRef = useRef(null);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!headerTargetId) return undefined;
    setHeaderTarget(document.getElementById(headerTargetId));
    return () => setHeaderTarget(null);
  }, [headerTargetId]);

  useEffect(() => {
    let isMounted = true;

    const loadProblem = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerProblemPreview(id);
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
  const validatedLanguages = Array.isArray(problem?.validatedLanguages) ? problem.validatedLanguages : [];
  const languageValidated = validatedLanguages.includes(language);
  const validationProgress = `${validatedLanguages.length}/${problem?.supportedLanguages?.length || 0} languages`;

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

  const isAcceptedSubmission = useMemo(() => {
    if (!result) return false;
    // Run mode only checks sample/custom cases, not hidden judge tests.
    if (result?.mode === 'run') return false;
    return String(verdictStatus || '').toLowerCase().includes('accepted');
  }, [result, verdictStatus]);

  const canApprovePublish = Boolean(problem?._id)
    && (isAcceptedSubmission || previewValidated)
    && String(problem?.status || 'draft').toLowerCase() !== 'published';
  const isPublished = String(problem?.status || '').toLowerCase() === 'published';

  const updateDraft = (nextCode) => {
    setDrafts((previous) => ({
      ...previous,
      [language]: nextCode,
    }));
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

  const handleRun = async (sourceOverride) => {
    if (!problem?._id) return;

    const sourceCode = typeof sourceOverride === 'string' ? sourceOverride : activeCode;
    const validationMessage = getCodeValidationMessage(sourceCode, getStarterCodeForLanguage(problem, language), 'run');
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setIsRunning(true);
    setActiveConsoleTab('result');

    try {
      const runnableCases = Array.isArray(testCases) && testCases.length > 0
        ? testCases
        : [activeTestCase].filter(Boolean);

      const responses = await Promise.all(
        runnableCases.map(async (testCase, index) => {
          const response = await api.runCompilerProblem(problem._id, {
            language,
            sourceCode,
            customInput: testCase?.input || '',
          });

          return {
            ...normalizeRunResult(response, testCase),
            id: testCase?.id || `case-${index + 1}`,
            label: `Case ${index + 1}`,
            kind: testCase?.kind || 'custom',
          };
        })
      );

      const normalized = aggregateRunResults(responses);
      setResult(normalized);
      toast.success(`Run finished. Passed ${normalized.passed}/${normalized.total} cases.`);
    } catch (error) {
      toast.error(error.message || 'Failed to run code.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async (sourceOverride) => {
    if (!problem?._id) return;

    const sourceCode = typeof sourceOverride === 'string' ? sourceOverride : activeCode;
    const validationMessage = getCodeValidationMessage(sourceCode, getStarterCodeForLanguage(problem, language), 'submit');
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setIsSubmitting(true);
    setActiveConsoleTab('result');

    try {
      const response = await api.submitCompilerProblem(problem._id, {
        language,
        sourceCode,
      });
      const normalized = normalizeSubmitResult(response);
      setResult(normalized);
      toast.success(`Submission finished with verdict ${normalized.status}.`);
    } catch (error) {
      toast.error(error.message || 'Failed to submit code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveToPublish = async () => {
    if (!problem?._id) return;
    if (!isAcceptedSubmission && !previewValidated) {
      toast.error('Submit an Accepted solution in preview before approving to publish.');
      return;
    }

    setIsApprovingPublish(true);
    try {
      if (previewValidated) {
        await api.updateCompilerProblemStatus(problem._id, 'published');
        const refreshed = await api.getCompilerProblemPreview(problem._id);
        setProblem(refreshed);
        toast.success('Published successfully.');
        return;
      }

      // Persist preview validation using the currently accepted solution (stored privately server-side).
      const fd = new FormData();
      fd.append('referenceSolutions', JSON.stringify({ [language]: activeCode }));

      const approval = await api.approveCompilerProblemPreview(problem._id, fd);
      if (!approval?.success) {
        toast.error(approval?.message || 'Approval failed.');
        return;
      }

      const refreshed = await api.getCompilerProblemPreview(problem._id);
      setProblem(refreshed);
      if (approval.previewValidated) {
        await api.updateCompilerProblemStatus(problem._id, 'published');
        const published = await api.getCompilerProblemPreview(problem._id);
        setProblem(published);
        toast.success('Every language passed. Problem published successfully.');
      } else {
        setResult(null);
        toast.success(approval.message || `${getLanguageLabel(language)} validated.`);
      }
    } catch (error) {
      toast.error(error.message || 'Failed to approve and publish.');
    } finally {
      setIsApprovingPublish(false);
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
    resizeCleanupRef.current?.();
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
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('lostpointercapture', handlePointerUp);
      window.removeEventListener('blur', handlePointerUp);

      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = handlePointerUp;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('lostpointercapture', handlePointerUp);
    window.addEventListener('blur', handlePointerUp);
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

  const statusBadgeClass = verdictTone === 'success'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
    : verdictTone === 'danger'
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
      : previewValidated
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';

  const previewHeader = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{problem.title}</p>
          <p className="text-[11px] text-slate-500 dark:text-gray-400">Coding preview · validate before publishing</p>
        </div>
        <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${statusBadgeClass}`}>
          {verdictStatus || (previewValidated ? 'All Languages Passed' : `Validation Pending · ${validationProgress}`)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => navigate(backTo || `${rolePrefix}/library/coding/problems`)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">{backLabel}</button>
        <button type="button" onClick={() => navigate(editTo || `${rolePrefix}/library/coding/${problem._id}/edit`, { state: { returnTo: backTo } })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">{editLabel}</button>
        <button
          type="button"
          onClick={canApprovePublish ? handleApproveToPublish : undefined}
          disabled={!canApprovePublish || isApprovingPublish || isSubmitting || isRunning}
          title={!isPublished && !canApprovePublish ? 'Submit an accepted solution to enable publishing.' : ''}
          className={`min-w-24 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${isPublished ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : canApprovePublish ? 'bg-sky-600 text-white hover:bg-sky-500' : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-gray-700 dark:text-gray-400'}`}
        >
          {isPublished ? 'Published' : isApprovingPublish ? 'Validating...' : previewValidated ? 'Publish' : languageValidated ? 'Validated' : 'Validate language'}
        </button>
        <button
          type="button"
          onClick={() => navigate(backTo || `${rolePrefix}/library/coding/problems`)}
          aria-label="Close preview"
          title="Close preview"
          className="ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-[680px] w-full overflow-hidden bg-[linear-gradient(180deg,_#f7fbff_0%,_#f1f7fc_100%)] dark:bg-[linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
      <div className="flex h-full min-h-0 flex-col">
        {headerTarget ? createPortal(previewHeader, headerTarget) : <header className="flex min-h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900">{previewHeader}</header>}
        <div className="relative hidden h-full min-h-0 flex-1 overflow-hidden p-2.5 lg:flex">

          <div
            ref={splitContainerRef}
            className="mx-auto grid h-full min-h-0 w-full flex-1 grid-cols-[auto_16px_minmax(0,1fr)] overflow-hidden"
          >
            <section
              style={{
                width: leftWidth === null ? 'clamp(400px, 45vw, 760px)' : `${leftWidth}px`,
                willChange: 'width',
              }}
              className="flex h-full min-w-[280px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-transparent bg-white/72 shadow-[0_12px_36px_-28px_rgba(15,23,42,0.24)] backdrop-blur-sm dark:border-transparent dark:bg-gray-900/84"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth">
                <ProblemDescriptionPanel problem={problem} previewValidated={previewValidated} />
              </div>
            </section>

            <button
              type="button"
              onPointerDown={handleResizeStart}
              className="group relative flex w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center transition-colors"
              aria-label="Resize panels"
            >
              <div className="absolute inset-y-5 left-1/2 w-px -translate-x-1/2 rounded-full bg-slate-200/45 dark:bg-gray-700/60" />
              <div className="relative z-10 rounded-full bg-white/70 p-1 text-slate-400 transition-colors group-hover:text-sky-500 dark:bg-gray-900 dark:text-gray-500">
                <PanelLeftOpen className="h-3.5 w-3.5 rotate-90" />
              </div>
            </button>

            <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
                showToolbar
                internalClipboardOnly={false}
                editorKey={`admin-test:${problem?._id || 'draft'}`}
                executionMode={problem?.category === 'SQL' ? 'sql' : 'code'}
              />
            </section>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 px-3 py-3 lg:hidden">
          <div className="rounded-[24px] bg-white/88 px-3 py-3 shadow-[0_10px_32px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/88">
            <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setMobileView('description')}
                className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${mobileView === 'description' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Description
              </button>
              <button
                type="button"
                onClick={() => setMobileView('editor')}
                className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${mobileView === 'editor' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'}`}
              >
                Editor
              </button>
            </div>
          </div>

          <div className={`overflow-hidden rounded-[28px] bg-white/84 shadow-[0_10px_32px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/84 ${mobileView === 'description' ? 'block' : 'hidden'}`}>
            <div className="max-h-[calc(100vh-15rem)] overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth">
              <ProblemDescriptionPanel problem={problem} previewValidated={previewValidated} />
            </div>
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
              showToolbar
              internalClipboardOnly={false}
              executionMode={problem?.category === 'SQL' ? 'sql' : 'code'}
              editorKey={`admin-test:${problem?._id || 'draft'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
