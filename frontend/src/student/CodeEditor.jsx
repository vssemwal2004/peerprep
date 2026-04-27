import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Send, TerminalSquare } from 'lucide-react';
import MonacoCodeEditor from '../admin/compiler/MonacoCodeEditor';
import { formatDuration, getLanguageLabel } from '../admin/compiler/compilerUtils';
import {
  isRunExecutionResult,
  summarizeExecutionResult,
  verdictBadgeClass,
} from './problemUtils';

function LcBlock({ label, children }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">{label}</div>
      <div className="rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-800 dark:bg-gray-800/90 dark:text-gray-100">
        {children}
      </div>
    </div>
  );
}

function ResultValue({ value }) {
  const normalized = String(value ?? '').trimEnd();
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{normalized || '(empty)'}</pre>
  );
}

function ResultPanel({ title, content, tone = 'default' }) {
  const normalized = String(content ?? '').trimEnd();
  if (!normalized) {
    return null;
  }

  const toneStyles = tone === 'error'
    ? 'bg-rose-50 text-rose-800 dark:bg-rose-900/10 dark:text-rose-200'
    : 'bg-slate-50 text-slate-800 dark:bg-gray-800 dark:text-gray-100';

  return (
    <div className="w-full space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
        {title}
      </p>
      <div className={`rounded-[22px] px-4 py-3 text-xs ${toneStyles}`}>
        <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed">{normalized}</pre>
      </div>
    </div>
  );
}

function normalizeComparableText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

export default function CodeEditor({
  supportedLanguages = [],
  language,
  code,
  onLanguageChange,
  onCodeChange,
  customInput,
  testCases = [],
  activeTestCaseId = null,
  onActiveTestCaseChange,
  onAddCustomTestCase,
  onTestCaseInputChange,
  expectedOutputForRun = null,
  runInputUsed = null,
  activeConsoleTab,
  onConsoleTabChange,
  result,
  isRunning,
  isSubmitting,
  onRun,
  onSubmit,
  onReset,
  showToolbar = true,
}) {
  const rootRef = useRef(null);
  const toolbarRef = useRef(null);
  const splitterRef = useRef(null);
  const editorContainerRef = useRef(null);
  const consoleContainerRef = useRef(null);
  const [consoleHeight, setConsoleHeight] = useState(220);
  const [editorHeight, setEditorHeight] = useState(320);

  const readNumberStyle = (styles, property) => {
    if (!styles) return 0;
    const raw = styles.getPropertyValue(property);
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  };

  const clampConsoleHeight = (height) => {
    const min = 128;
    const max = rootRef.current ? Math.max(180, rootRef.current.getBoundingClientRect().height - 220) : 520;
    return Math.min(max, Math.max(min, height));
  };

  const recomputeEditorHeight = () => {
    if (!rootRef.current) return;
    const rootRect = rootRef.current.getBoundingClientRect();
    const toolbarRect = toolbarRef.current?.getBoundingClientRect();
    const splitterRect = splitterRef.current?.getBoundingClientRect();

    const editorStyles = editorContainerRef.current ? window.getComputedStyle(editorContainerRef.current) : null;
    const consoleStyles = consoleContainerRef.current ? window.getComputedStyle(consoleContainerRef.current) : null;

    const toolbarH = toolbarRect?.height || 0;
    const splitterH = splitterRect?.height || 0;
    const consoleH = clampConsoleHeight(consoleHeight);

    const editorChrome = readNumberStyle(editorStyles, 'padding-top') + readNumberStyle(editorStyles, 'padding-bottom');
    const consoleChrome = readNumberStyle(consoleStyles, 'margin-top') + readNumberStyle(consoleStyles, 'margin-bottom');

    // Reserve fixed chrome (padding/margins) so height calculations converge even
    // when the editor container is content-sized (prevents runaway growth).
    const reserved = toolbarH + splitterH + consoleH + editorChrome + consoleChrome;
    const next = Math.max(260, Math.floor(rootRect.height - reserved));
    setEditorHeight(next);
  };

  useEffect(() => {
    recomputeEditorHeight();
    if (!rootRef.current) return;

    const observer = new ResizeObserver(() => {
      recomputeEditorHeight();
    });
    observer.observe(rootRef.current);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    recomputeEditorHeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleHeight]);

  const handleConsoleResizeStart = (event) => {
    if (!rootRef.current) return;
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = consoleHeight;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const handlePointerMove = (moveEvent) => {
      const delta = startY - moveEvent.clientY;
      setConsoleHeight(clampConsoleHeight(startHeight + delta));
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const isRunResult = isRunExecutionResult(result);
  const summary = summarizeExecutionResult(result);

  const activeTestCase = (() => {
    if (!Array.isArray(testCases) || testCases.length === 0) return null;
    const found = testCases.find((entry) => String(entry.id) === String(activeTestCaseId));
    return found || testCases[0];
  })();

  const runDerivedVerdict = (() => {
    if (!result || !isRunResult) return null;
    if (result?.mode === 'run' && typeof result.status === 'string') {
      return result.status;
    }
    if (result.compile_output) return 'Compilation Error';
    if (result.status?.id === 5) return 'Time Limit Exceeded';
    if (result.stderr) return 'Runtime Error';

    if (expectedOutputForRun !== null && expectedOutputForRun !== undefined) {
      const actual = normalizeComparableText(result.stdout || '');
      const expected = normalizeComparableText(expectedOutputForRun || '');
      return actual === expected ? 'Accepted' : 'Wrong Answer';
    }

    return result.status?.description || 'Run Result';
  })();

  const verdictLabel = (() => {
    if (!result) return '';
    if (isRunResult) {
      return runDerivedVerdict || 'Run Result';
    }
    return result.status || 'Result';
  })();

  const runtimeLabel = (() => {
    if (!result) return '';
    if (result.time === undefined || result.time === null) return '';
    return formatDuration(Number(result.time || 0) * 1000);
  })();

  const headerStatusTone = (() => {
    if (!verdictLabel) return 'text-slate-800 dark:text-gray-100';
    const lower = String(verdictLabel).toLowerCase();
    if (lower.includes('accepted')) return 'text-emerald-600 dark:text-emerald-300';
    if (lower.includes('error') || lower.includes('compilation') || lower.includes('runtime')) return 'text-rose-600 dark:text-rose-300';
    if (lower.includes('wrong') || lower.includes('time')) return 'text-amber-600 dark:text-amber-300';
    return 'text-slate-800 dark:text-gray-100';
  })();

  const effectiveSummary = (() => {
    if (!result) return summary;
    if (
      isRunResult
      && expectedOutputForRun !== null
      && expectedOutputForRun !== undefined
      && !result.compile_output
      && !result.stderr
    ) {
      return runDerivedVerdict === 'Accepted'
        ? 'Accepted on this example.'
        : 'Output does not match the expected output for this example.';
    }
    return summary;
  })();

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-[30px] bg-white/84 shadow-[0_10px_32px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:bg-gray-900/84"
    >
      {showToolbar ? (
        <div
          ref={toolbarRef}
          className="flex flex-wrap items-center justify-between gap-2 bg-white/88 px-3 py-3 backdrop-blur-sm dark:bg-gray-900/88"
        >
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              className="rounded-xl bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-colors focus:bg-white focus:ring-2 focus:ring-sky-400 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-500"
            >
              {supportedLanguages.map((supportedLanguage) => (
                <option key={supportedLanguage} value={supportedLanguage}>
                  {getLanguageLabel(supportedLanguage)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRun}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? 'Running...' : 'Run Code'}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-gray-700"
            >
              <Send className="h-3.5 w-3.5" />
              {isSubmitting ? 'Submitting...' : 'Submit Code'}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.03)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Code
            </button>
          </div>
        </div>
      ) : (
        <div ref={toolbarRef} />
      )}

      <div ref={editorContainerRef} className="relative z-0 min-h-0 flex-1 bg-transparent px-4 pb-1 pt-1">
        <MonacoCodeEditor
          language={language}
          value={code}
          onChange={onCodeChange}
          height={editorHeight}
        />
      </div>

      <button
        type="button"
        ref={splitterRef}
        onPointerDown={handleConsoleResizeStart}
        className="group relative z-20 mx-4 flex h-3 w-auto cursor-row-resize items-center justify-center transition-colors"
        aria-label="Resize testcase panel"
      >
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-200/80 dark:bg-gray-700" />
        <div className="relative z-10 h-1.5 w-12 rounded-full bg-slate-300 transition-colors group-hover:bg-sky-400 dark:bg-gray-700 dark:group-hover:bg-sky-500" />
      </button>

      <div
        ref={consoleContainerRef}
        className="relative z-20 mx-3 mb-3 flex min-h-0 flex-col overflow-hidden rounded-[24px] bg-white px-4 pb-3 pt-1.5 dark:bg-gray-900"
        style={{ height: clampConsoleHeight(consoleHeight) }}
      >
        <div className="flex flex-none items-end gap-6 overflow-x-auto bg-white pr-1 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => onConsoleTabChange('testcase')}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2 pt-2 text-sm font-semibold transition-colors ${
              activeConsoleTab === 'testcase'
                ? 'border-sky-600 text-slate-900 dark:border-sky-500 dark:text-gray-100'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Testcase
          </button>
          <button
            type="button"
            onClick={() => onConsoleTabChange('result')}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2 pt-2 text-sm font-semibold transition-colors ${
              activeConsoleTab === 'result'
                ? 'border-sky-600 text-slate-900 dark:border-sky-500 dark:text-gray-100'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Test Result
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth pt-2.5">
          {activeConsoleTab === 'testcase' ? (
            <div className="space-y-3 text-slate-700 dark:text-gray-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-gray-100">
                  <TerminalSquare className="h-4 w-4 text-sky-500" />
                  Testcase
                </div>

                {typeof onAddCustomTestCase === 'function' && (
                  <button
                    type="button"
                    onClick={onAddCustomTestCase}
                    className="inline-flex h-8 items-center justify-center rounded-xl bg-white px-3 text-xs font-semibold text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    title="Add custom testcase"
                  >
                    +
                  </button>
                )}
              </div>

              {Array.isArray(testCases) && testCases.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {testCases.map((entry, index) => {
                    const isActive = activeTestCase && String(entry.id) === String(activeTestCase.id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onActiveTestCaseChange?.(entry.id)}
                        className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${isActive ? 'bg-slate-900 text-white dark:bg-sky-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                      >
                        Case {index + 1}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/70">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                    {activeTestCase?.kind === 'sample' ? 'Sample Testcase' : 'Custom Testcase'}
                  </div>
                  {activeTestCase?.expectedOutput !== null && activeTestCase?.expectedOutput !== undefined ? (
                    <div className="text-[11px] text-slate-500 dark:text-gray-400">Expected output available</div>
                  ) : null}
                </div>
                <textarea
                  value={activeTestCase?.input ?? customInput ?? ''}
                  onChange={(event) => {
                    if (!activeTestCase) return;
                    onTestCaseInputChange?.(activeTestCase.id, event.target.value);
                  }}
                  readOnly={activeTestCase?.kind === 'sample'}
                  placeholder="Provide stdin for the selected testcase."
                  className="h-36 w-full resize-none rounded-[18px] bg-white/88 px-4 py-3 font-mono text-xs text-slate-700 outline-none shadow-[inset_0_0_0_1px_rgba(226,232,240,0.7)] transition-colors focus:bg-white focus:ring-2 focus:ring-sky-400 read-only:opacity-80 dark:bg-gray-900/90 dark:text-gray-200 dark:shadow-[inset_0_0_0_1px_rgba(55,65,81,0.85)] dark:focus:ring-sky-500"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Run executes the selected testcase. Submit ignores testcases and runs hidden tests only.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div className={`text-2xl font-bold ${headerStatusTone}`}>{verdictLabel || 'Test Result'}</div>
                {runtimeLabel && (
                  <div className="text-sm text-slate-500 dark:text-gray-400">Runtime: {runtimeLabel}</div>
                )}
                {result?.memory !== undefined && result?.memory !== null && (
                  <div className="text-sm text-slate-500 dark:text-gray-400">Memory: {Number(result.memory || 0)} KB</div>
                )}
                {result?.total !== undefined && (
                  <div className="text-sm text-slate-500 dark:text-gray-400">Cases: {result.passed || 0}/{result.total}</div>
                )}
              </div>

              {effectiveSummary && (
                <p className="text-sm text-slate-500 dark:text-gray-400">{effectiveSummary}</p>
              )}

              {!result && (
                <div className="rounded-[22px] bg-white/45 px-4 py-8 text-center text-sm text-slate-500 dark:bg-gray-900/35 dark:text-gray-400">
                  Run or submit to inspect the latest result.
                </div>
              )}

              {result && isRunResult && (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <LcBlock label="Input">
                      <ResultValue value={result.input ?? runInputUsed ?? customInput} />
                    </LcBlock>
                    <LcBlock label={(result.expectedOutput !== null && result.expectedOutput !== undefined) || (expectedOutputForRun !== null && expectedOutputForRun !== undefined) ? 'Your Output' : 'Output'}>
                      <ResultValue value={(result.output ?? result.stdout) || ''} />
                    </LcBlock>

                    {((result.expectedOutput !== null && result.expectedOutput !== undefined) || (expectedOutputForRun !== null && expectedOutputForRun !== undefined)) && !(result.compile_output || result.error) && !result.stderr && (
                      <LcBlock label="Expected">
                        <ResultValue value={(result.expectedOutput ?? expectedOutputForRun) || ''} />
                      </LcBlock>
                    )}
                    {(result.compile_output || result.stderr || result.error) && (
                      <div className="lg:col-span-2">
                        <LcBlock label={result.compile_output || result.status === 'Compilation Error' ? 'Compile Output' : 'Errors'}>
                          <ResultValue value={result.compile_output || result.error || result.stderr || ''} />
                        </LcBlock>
                      </div>
                    )}
                  </div>
                </>
              )}

              {result && !isRunResult && (
                <>
                  {result.status === 'Accepted' && (
                    <div className="rounded-[22px] bg-emerald-50 px-4 py-4 text-sm text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-300">
                      All test cases passed.
                    </div>
                  )}

                  {result.status === 'Wrong Answer' && result.failedTestCase && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                          Case {result.failedTestCase.index}
                        </span>
                      </div>
                      <div className="rounded-[22px] bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:bg-rose-900/10 dark:text-rose-300">
                        One of the hidden test cases did not match the expected output.
                      </div>
                    </div>
                  )}

                  {result.status === 'Compilation Error' && (
                    <LcBlock label="Compile Output">
                      <ResultValue value={result.error || ''} />
                    </LcBlock>
                  )}

                  {result.status === 'Runtime Error' && (
                    <LcBlock label="Errors">
                      <ResultValue value={result.error || ''} />
                    </LcBlock>
                  )}

                  {result.status === 'Time Limit Exceeded' && (
                    <div className="rounded-[22px] bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:bg-rose-900/10 dark:text-rose-300">
                      The submission exceeded the configured execution limit.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
