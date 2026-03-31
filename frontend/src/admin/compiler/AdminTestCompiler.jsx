import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PanelLeftOpen, Play, Send } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { RichTextPreview } from './CompilerContentPreview';
import MonacoCodeEditor from './MonacoCodeEditor';
import {
  formatDuration,
  getLanguageLabel,
  submissionStatusClass,
} from './compilerUtils';
import { DifficultyBadge, LoadingPanel, ProblemStatusBadge, SectionCard } from './CompilerUi';

function createDrafts(problem) {
  return (problem?.supportedLanguages || []).reduce((acc, language) => {
    acc[language] = problem?.codeTemplates?.[language] || '';
    return acc;
  }, {});
}

export default function AdminTestCompiler() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState(null);
  const [language, setLanguage] = useState('python');
  const [drafts, setDrafts] = useState({});
  const [activeBottomTab, setActiveBottomTab] = useState('testcase');
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leftWidth, setLeftWidth] = useState(520);
  const splitContainerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadProblem = async () => {
      try {
        setLoading(true);
        const response = await api.getCompilerProblem(id);
        if (!isMounted) return;
        setProblem(response);
        setLanguage(response.supportedLanguages?.[0] || 'python');
        setDrafts(createDrafts(response));
        setLeftWidth(520);
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
  const sampleCases = problem?.sampleTestCases || [];

  const updateDraft = (nextCode) => {
    setDrafts((previous) => ({
      ...previous,
      [language]: nextCode,
    }));
  };

  const handleRun = async () => {
    if (!problem?._id) return;
    setIsRunning(true);
    setActiveBottomTab('result');
    try {
      const response = await api.runCompilerProblem(problem._id, {
        language,
        sourceCode: activeCode,
        customInput: sampleCases[0]?.input || '',
      });
      setResult(response);
      if (response.status === 'AC') {
        setProblem((previous) => (previous ? { ...previous, previewTested: true } : previous));
      }
      toast.success(`Run finished with status ${response.status}`);
    } catch (error) {
      toast.error(error.message || 'Failed to run code.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!problem?._id) return;
    setIsSubmitting(true);
    setActiveBottomTab('result');
    try {
      const response = await api.submitCompilerProblem(problem._id, {
        language,
        sourceCode: activeCode,
      });
      setResult(response);
      if (response.status === 'AC') {
        setProblem((previous) => (previous ? { ...previous, previewTested: true } : previous));
      }
      toast.success(`Submission finished with status ${response.status}`);
    } catch (error) {
      toast.error(error.message || 'Failed to submit code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingPanel label="Loading admin test compiler..." />;
  }

  if (!problem) {
    return null;
  }

  const handleResizeStart = (event) => {
    if (!splitContainerRef.current) return;
    event.preventDefault();
    const containerRect = splitContainerRef.current.getBoundingClientRect();
    const startWidth = leftWidth;
    const startX = event.clientX;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const maxWidth = Math.max(420, containerRect.width - 480);
      setLeftWidth(Math.min(Math.max(startWidth + delta, 420), maxWidth));
    };

    const handleUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Preview Workspace"
        subtitle="Student-style preview required before a problem can be published."
        action={(
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/admin/compiler/problems')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button type="button" onClick={() => navigate(`/admin/compiler/${problem._id}/edit`)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              Back to Edit
            </button>
          </div>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          <ProblemStatusBadge status={problem.status} />
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${problem.previewTested ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'}`}>
            {problem.previewTested ? 'Preview Passed' : 'Preview Required'}
          </span>
          {(problem.tags || []).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">{tag}</span>
          ))}
        </div>
      </SectionCard>

      <div ref={splitContainerRef} className="hidden min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 lg:flex">
        <div style={{ width: `${leftWidth}px`, flexBasis: `${leftWidth}px` }} className="min-w-[420px] shrink-0 overflow-y-auto border-r border-slate-200 dark:border-gray-700">
          <SectionCard title={problem.title} subtitle="Problem description" className="h-full rounded-none border-0 shadow-none">
          <div className="space-y-4 text-sm text-slate-600 dark:text-gray-300">
            <RichTextPreview content={problem.description} />
            <div className="grid gap-4 md:grid-cols-3">
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Input</p><p className="whitespace-pre-wrap">{problem.inputFormat || 'Not provided.'}</p></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Output</p><p className="whitespace-pre-wrap">{problem.outputFormat || 'Not provided.'}</p></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Constraints</p><p className="whitespace-pre-wrap">{problem.constraints || 'Not provided.'}</p></div>
            </div>
          </div>
          </SectionCard>
        </div>

        <button type="button" onPointerDown={handleResizeStart} className="group relative flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-slate-50 dark:bg-gray-900">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200 dark:bg-gray-700" />
          <div className="relative z-10 rounded-full border border-slate-200 bg-white p-1 text-slate-400 shadow-sm transition-colors group-hover:text-sky-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
            <PanelLeftOpen className="h-3.5 w-3.5 rotate-90" />
          </div>
        </button>

        <div className="min-w-[480px] flex-1 overflow-hidden">
        <SectionCard title="Code Editor" subtitle="Student-like preview compiler." className="h-full rounded-none border-0 shadow-none">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {problem.supportedLanguages.map((supportedLanguage) => (
                <button
                  key={supportedLanguage}
                  type="button"
                  onClick={() => setLanguage(supportedLanguage)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${language === supportedLanguage ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                >
                  {getLanguageLabel(supportedLanguage)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleRun} disabled={isRunning || isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"><Play className="h-4 w-4" />{isRunning ? 'Running...' : 'Run'}</button>
              <button type="button" onClick={handleSubmit} disabled={isRunning || isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"><Send className="h-4 w-4" />{isSubmitting ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>

          <MonacoCodeEditor language={language} value={activeCode} onChange={updateDraft} height={520} />
        </SectionCard>
        </div>
      </div>

      <div className="grid gap-6 lg:hidden">
        <SectionCard title={problem.title} subtitle="Problem description">
          <div className="space-y-4 text-sm text-slate-600 dark:text-gray-300">
            <RichTextPreview content={problem.description} />
            <div className="grid gap-4 md:grid-cols-3">
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Input</p><p className="whitespace-pre-wrap">{problem.inputFormat || 'Not provided.'}</p></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Output</p><p className="whitespace-pre-wrap">{problem.outputFormat || 'Not provided.'}</p></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Constraints</p><p className="whitespace-pre-wrap">{problem.constraints || 'Not provided.'}</p></div>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Code Editor" subtitle="Student-like preview compiler.">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {problem.supportedLanguages.map((supportedLanguage) => (
                <button key={supportedLanguage} type="button" onClick={() => setLanguage(supportedLanguage)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${language === supportedLanguage ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{getLanguageLabel(supportedLanguage)}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleRun} disabled={isRunning || isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"><Play className="h-4 w-4" />{isRunning ? 'Running...' : 'Run'}</button>
              <button type="button" onClick={handleSubmit} disabled={isRunning || isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"><Send className="h-4 w-4" />{isSubmitting ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>
          <MonacoCodeEditor language={language} value={activeCode} onChange={updateDraft} height={420} />
        </SectionCard>
      </div>

      <SectionCard title="Console" subtitle="Terminal-style testcase and result panel.">
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveBottomTab('testcase')} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeBottomTab === 'testcase' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>Testcase</button>
          <button type="button" onClick={() => setActiveBottomTab('result')} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeBottomTab === 'result' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>Result</button>
        </div>

        {activeBottomTab === 'testcase' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {sampleCases.map((testCase, index) => (
              <div key={`sample-case-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Sample {index + 1}</p>
                <div className="mt-3 space-y-3 text-xs">
                  <div><p className="mb-1 font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Input</p><pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 dark:bg-gray-800">{testCase.input || '(empty)'}</pre></div>
                  <div><p className="mb-1 font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-gray-500">Output</p><pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 dark:bg-gray-800">{testCase.output || '(empty)'}</pre></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-gray-400">Language: {getLanguageLabel(language)}</p>
              {result?.status ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${submissionStatusClass(result.status)}`}>{result.status}</span> : null}
            </div>
            <div className="rounded-2xl bg-slate-950 px-4 py-4 text-xs text-slate-100">
              <pre className="overflow-x-auto whitespace-pre-wrap">{result?.output || result?.stderr || result?.compileOutput || 'Run or submit to inspect outputs and judge details.'}</pre>
            </div>
            {result ? (
              <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-gray-400">
                <span>Execution time: {formatDuration(result.executionTimeMs || result.time || 0)}</span>
                {result.totalTestCases ? <span>Passed: {result.passedTestCases}/{result.totalTestCases}</span> : null}
              </div>
            ) : null}

            {result?.failedCase ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-500 dark:text-rose-400">Input</p><pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs dark:border-rose-800 dark:bg-rose-900/10">{result.failedCase.input || '(empty)'}</pre></div>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-500 dark:text-rose-400">Expected</p><pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs dark:border-rose-800 dark:bg-rose-900/10">{result.failedCase.expectedOutput || result.failedTestCase?.expected || '(empty)'}</pre></div>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-500 dark:text-rose-400">Output</p><pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs dark:border-rose-800 dark:bg-rose-900/10">{result.failedCase.actualOutput || result.failedTestCase?.actual || '(empty)'}</pre></div>
              </div>
            ) : null}

            {result?.testCaseResults?.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {result.testCaseResults.map((testCaseResult) => (
                  <div key={`${testCaseResult.index}-${testCaseResult.status}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Testcase {testCaseResult.index}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${submissionStatusClass(testCaseResult.status)}`}>{testCaseResult.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">{formatDuration(testCaseResult.executionTimeMs)}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
