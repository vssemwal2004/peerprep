import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw, Send, TerminalSquare } from 'lucide-react';
import MonacoCodeEditor from '../admin/compiler/MonacoCodeEditor';
import { formatDuration, getLanguageLabel } from '../admin/compiler/compilerUtils';
import {
  isRunExecutionResult,
  summarizeExecutionResult,
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

function normalizeComparableText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

function hasValue(value) {
  return value !== null && value !== undefined;
}

function hasText(value) {
  return String(value ?? '').length > 0;
}

function getCompileOutput(entry) {
  return entry?.compileOutput ?? entry?.compile_output ?? '';
}

function getErrorOutput(entry) {
  return entry?.error ?? entry?.stderr ?? '';
}

function normalizeRunCaseStatus(status) {
  if (status === 'AC' || status === 'Accepted' || status === 'Passed') return 'Passed';
  if (status === 'WA' || status === 'Wrong Answer' || status === 'Failed') return 'Failed';
  if (status === 'CE' || status === 'Compilation Error') return 'Compilation Error';
  if (status === 'RE' || status === 'Runtime Error') return 'Runtime Error';
  if (status === 'TLE' || status === 'Time Limit Exceeded') return 'Time Limit Exceeded';
  if (status === 'Run Completed') return 'Passed';
  return status || 'Run Completed';
}

function isPassedStatus(status) {
  return normalizeRunCaseStatus(status) === 'Passed';
}

function runStatusTone(status) {
  const normalized = normalizeRunCaseStatus(status);
  if (normalized === 'Passed') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
  if (normalized === 'Failed') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
  }
  return 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300';
}

function CodeEditor({
  supportedLanguages = [],
  language,
  code,
  onLanguageChange,
  onCodeChange,
  customInput,
  testCases = [],
  activeTestCaseId = null,
  onActiveTestCaseChange,
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
  internalClipboardOnly = false,
  clipboardScope = 'assessment-editor',
  editorKey = '',
  onLiveCodeChange,
}) {
  const rootRef = useRef(null);
  const toolbarRef = useRef(null);
  const splitterRef = useRef(null);
  const editorContainerRef = useRef(null);
  const consoleContainerRef = useRef(null);
  const resizeFrameRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const codeCommitTimerRef = useRef(null);
  const pendingCodeCommitRef = useRef(null);
  const liveCodeRef = useRef(code || '');
  const externalCodeRef = useRef(code || '');
  const editorContextRef = useRef({ editorKey, language });
  const clipboardNoticeTimerRef = useRef(null);
  const [consoleHeight, setConsoleHeight] = useState(116);
  const [editorHeight, setEditorHeight] = useState(440);
  const [activeResultCaseId, setActiveResultCaseId] = useState(null);
  const [clipboardNotice, setClipboardNotice] = useState(
    internalClipboardOnly ? 'Editor-only clipboard' : '',
  );
  const MIN_EDITOR_HEIGHT = 360;
  const AUTO_OPEN_CONSOLE_HEIGHT = 320;

  const getLayoutRect = () => {
    const root = rootRef.current;
    if (!root) return null;

    const parent = root.parentElement;
    const candidate = parent?.getBoundingClientRect?.();
    if (candidate && Number.isFinite(candidate.height) && candidate.height > 0) {
      return candidate;
    }

    return root.getBoundingClientRect();
  };

  const readNumberStyle = (styles, property) => {
    if (!styles) return 0;
    const raw = styles.getPropertyValue(property);
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  };

  const clampConsoleHeight = (height) => {
    const min = 88;

    if (!rootRef.current) {
      return Math.min(520, Math.max(min, height));
    }

    const layoutRect = getLayoutRect();
    const toolbarRect = toolbarRef.current?.getBoundingClientRect();
    const splitterRect = splitterRef.current?.getBoundingClientRect();

    const editorStyles = editorContainerRef.current ? window.getComputedStyle(editorContainerRef.current) : null;
    const consoleStyles = consoleContainerRef.current ? window.getComputedStyle(consoleContainerRef.current) : null;

    const toolbarH = toolbarRect?.height || 0;
    const splitterH = splitterRect?.height || 0;
    const editorChrome = readNumberStyle(editorStyles, 'padding-top') + readNumberStyle(editorStyles, 'padding-bottom');
    const consoleChrome =
      readNumberStyle(consoleStyles, 'margin-top')
      + readNumberStyle(consoleStyles, 'margin-bottom')
      + readNumberStyle(consoleStyles, 'padding-top')
      + readNumberStyle(consoleStyles, 'padding-bottom')
      + readNumberStyle(consoleStyles, 'border-top-width')
      + readNumberStyle(consoleStyles, 'border-bottom-width');

    // Keep the console height bounded even if the root container is content-sized.
    // Use both root height and viewport height; take the tighter constraint.
    const bottomGutter = 24;
    const maxByRoot = (layoutRect?.height || 0) - (toolbarH + splitterH + editorChrome + consoleChrome + MIN_EDITOR_HEIGHT);
    const maxByViewport = window.innerHeight - ((layoutRect?.top || 0) + bottomGutter) - (toolbarH + splitterH + editorChrome + consoleChrome + MIN_EDITOR_HEIGHT);
    const max = Math.max(180, Math.min(Number.isFinite(maxByRoot) ? maxByRoot : 520, Number.isFinite(maxByViewport) ? maxByViewport : 520));

    return Math.min(max, Math.max(min, height));
  };

  const recomputeEditorHeight = () => {
    if (!rootRef.current) return;
    const layoutRect = getLayoutRect();
    const toolbarRect = toolbarRef.current?.getBoundingClientRect();
    const splitterRect = splitterRef.current?.getBoundingClientRect();

    const editorStyles = editorContainerRef.current ? window.getComputedStyle(editorContainerRef.current) : null;
    const consoleStyles = consoleContainerRef.current ? window.getComputedStyle(consoleContainerRef.current) : null;

    const toolbarH = toolbarRect?.height || 0;
    const splitterH = splitterRect?.height || 0;
    const consoleH = clampConsoleHeight(consoleHeight);

    const editorChrome = readNumberStyle(editorStyles, 'padding-top') + readNumberStyle(editorStyles, 'padding-bottom');
    const consoleChrome =
      readNumberStyle(consoleStyles, 'margin-top')
      + readNumberStyle(consoleStyles, 'margin-bottom')
      + readNumberStyle(consoleStyles, 'padding-top')
      + readNumberStyle(consoleStyles, 'padding-bottom')
      + readNumberStyle(consoleStyles, 'border-top-width')
      + readNumberStyle(consoleStyles, 'border-bottom-width');

    // Reserve fixed chrome (padding/margins) so height calculations converge even
    // when the editor container is content-sized (prevents runaway growth).
    const reserved = toolbarH + splitterH + consoleH + editorChrome + consoleChrome;
    const next = Math.max(MIN_EDITOR_HEIGHT, Math.floor((layoutRect?.height || 0) - reserved));
    setEditorHeight((current) => (current === next ? current : next));
  };

  useEffect(() => {
    recomputeEditorHeight();
    if (!rootRef.current) return;

    const observer = new ResizeObserver(() => {
      if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        recomputeEditorHeight();
      });
    });
      observer.observe(rootRef.current);
      if (rootRef.current.parentElement) {
        observer.observe(rootRef.current.parentElement);
      }

    return () => {
      observer.disconnect();
      if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    recomputeEditorHeight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleHeight]);

  useEffect(() => {
    const previousContext = editorContextRef.current;
    const questionChanged = previousContext.editorKey !== editorKey;
    const languageChanged = previousContext.language !== language;
    if (questionChanged || languageChanged) {
      if (codeCommitTimerRef.current) {
        clearTimeout(codeCommitTimerRef.current);
        codeCommitTimerRef.current = null;
      }
      const pending = pendingCodeCommitRef.current;
      pendingCodeCommitRef.current = null;
      // Preserve a fast final keystroke when navigating to another question.
      // Language switching already captures the live draft before changing.
      if (questionChanged && pending) pending.commit(pending.value);
    }
    externalCodeRef.current = code || '';
    liveCodeRef.current = code || '';
    editorContextRef.current = { editorKey, language };
  }, [code, language, editorKey]);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
    if (codeCommitTimerRef.current) clearTimeout(codeCommitTimerRef.current);
    if (clipboardNoticeTimerRef.current) clearTimeout(clipboardNoticeTimerRef.current);
    const pending = pendingCodeCommitRef.current;
    if (pending) pending.commit(pending.value);
  }, []);

  useEffect(() => {
    if (internalClipboardOnly) {
      setClipboardNotice((current) => current || 'Editor-only clipboard');
      return;
    }

    if (clipboardNoticeTimerRef.current) {
      clearTimeout(clipboardNoticeTimerRef.current);
      clipboardNoticeTimerRef.current = null;
    }
    setClipboardNotice('');
  }, [internalClipboardOnly]);

  const commitPendingCode = () => {
    if (codeCommitTimerRef.current) {
      clearTimeout(codeCommitTimerRef.current);
      codeCommitTimerRef.current = null;
    }
    const pending = pendingCodeCommitRef.current;
    pendingCodeCommitRef.current = null;
    if (pending) pending.commit(pending.value);
  };

  const handleEditorCodeChange = (nextCode) => {
    liveCodeRef.current = nextCode;
    onLiveCodeChange?.(nextCode);

    if (nextCode === externalCodeRef.current) {
      if (codeCommitTimerRef.current) {
        clearTimeout(codeCommitTimerRef.current);
        codeCommitTimerRef.current = null;
      }
      pendingCodeCommitRef.current = null;
      return;
    }

    if (codeCommitTimerRef.current) clearTimeout(codeCommitTimerRef.current);
    pendingCodeCommitRef.current = { value: nextCode, commit: onCodeChange };
    codeCommitTimerRef.current = setTimeout(() => {
      codeCommitTimerRef.current = null;
      const pending = pendingCodeCommitRef.current;
      pendingCodeCommitRef.current = null;
      pending?.commit(pending.value);
    }, 1200);
  };

  const handleClipboardStatus = ({ message } = {}) => {
    if (!internalClipboardOnly) return;
    setClipboardNotice(message || 'Editor-only clipboard');
    if (clipboardNoticeTimerRef.current) clearTimeout(clipboardNoticeTimerRef.current);
    clipboardNoticeTimerRef.current = setTimeout(() => {
      setClipboardNotice('Editor-only clipboard');
    }, 2600);
  };

  const handleConsoleResizeStart = (event) => {
    if (!rootRef.current) return;
    event.preventDefault();
    resizeCleanupRef.current?.();

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore pointer capture failures.
    }

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
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('lostpointercapture', handlePointerUp);
      window.removeEventListener('blur', handlePointerUp);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = handlePointerUp;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('lostpointercapture', handlePointerUp);
    window.addEventListener('blur', handlePointerUp);
  };

  const isRunResult = isRunExecutionResult(result);
  const summary = summarizeExecutionResult(result);
  const runCaseResults = useMemo(
    () => (Array.isArray(result?.caseResults) ? result.caseResults : []),
    [result?.caseResults],
  );
  const activeResultCase = (() => {
    if (runCaseResults.length === 0) return null;
    return runCaseResults.find((entry, index) => String(entry.id || index) === String(activeResultCaseId))
      || runCaseResults[0];
  })();

  useEffect(() => {
    if (!result) return;
    setConsoleHeight((current) => clampConsoleHeight(Math.max(current, AUTO_OPEN_CONSOLE_HEIGHT)));
    onConsoleTabChange?.('result');
    if (runCaseResults.length > 0) {
      setActiveResultCaseId(runCaseResults[0].id || 0);
    }
    // The result object marks a completed run/submit and should reveal the output panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const openResultPanel = () => {
    setConsoleHeight((current) => clampConsoleHeight(Math.max(current, AUTO_OPEN_CONSOLE_HEIGHT)));
    onConsoleTabChange?.('result');
  };

  const handleRun = () => {
    commitPendingCode();
    openResultPanel();
    onRun?.(liveCodeRef.current);
  };

  const handleSubmit = () => {
    commitPendingCode();
    openResultPanel();
    onSubmit?.(liveCodeRef.current);
  };

  const activeTestCase = (() => {
    if (!Array.isArray(testCases) || testCases.length === 0) return null;
    const found = testCases.find((entry) => String(entry.id) === String(activeTestCaseId));
    return found || testCases[0];
  })();

  const latestRunCaseByIndex = useMemo(() => {
    if (!Array.isArray(runCaseResults) || runCaseResults.length === 0) return new Map();
    return new Map(runCaseResults.map((entry, index) => [index, entry]));
  }, [runCaseResults]);

  const runDerivedVerdict = (() => {
    if (!result || !isRunResult) return null;
    const hasExpectedOutput = hasValue(expectedOutputForRun);
    const compileOutput = getCompileOutput(result);
    const errorOutput = getErrorOutput(result);

    if (
      result?.mode === 'run'
      && hasExpectedOutput
      && !compileOutput
      && !errorOutput
    ) {
      const actual = normalizeComparableText(result.output ?? result.stdout ?? '');
      const expected = normalizeComparableText(expectedOutputForRun || '');
      return actual === expected ? 'Accepted' : 'Wrong Answer';
    }

    if (result?.mode === 'run' && typeof result.status === 'string') {
      return result.status;
    }
    if (compileOutput) return 'Compilation Error';
    if (result.status?.id === 5) return 'Time Limit Exceeded';
    if (errorOutput) return 'Runtime Error';

    if (hasExpectedOutput) {
      const actual = normalizeComparableText(result.output ?? result.stdout ?? '');
      const expected = normalizeComparableText(expectedOutputForRun || '');
      return actual === expected ? 'Accepted' : 'Wrong Answer';
    }

    return result.status?.description || 'Run Result';
  })();

  const verdictLabel = (() => {
    if (!result) return '';
    if (isRunResult) {
      if (runCaseResults.length > 0) {
        return runCaseResults.every((entry) => isPassedStatus(entry.status)) ? 'Passed' : 'Failed';
      }
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
    if (lower.includes('accepted') || lower.includes('passed')) return 'text-emerald-600 dark:text-emerald-300';
    if (lower.includes('error') || lower.includes('compilation') || lower.includes('runtime')) return 'text-rose-600 dark:text-rose-300';
    if (lower.includes('wrong') || lower.includes('time') || lower.includes('failed')) return 'text-amber-600 dark:text-amber-300';
    return 'text-slate-800 dark:text-gray-100';
  })();

  const singleRunExpectedOutput = (() => {
    if (hasValue(result?.expectedOutput) && hasText(result.expectedOutput)) {
      return result.expectedOutput;
    }
    return expectedOutputForRun;
  })();

  const effectiveSummary = (() => {
    if (!result) return summary;
    const compileOutput = getCompileOutput(result);
    const errorOutput = getErrorOutput(result);
    if (!isRunResult || compileOutput || errorOutput) return summary;

    // When the backend provides per-case verdicts, trust those over the
    // locally-selected expected output (which can change after a run).
    if (runCaseResults.length > 0) {
      const allPassed = runCaseResults.every((entry) => isPassedStatus(entry.status));
      if (allPassed) return 'Accepted on this example.';

      const comparable = runCaseResults.find((entry) => hasValue(entry.expectedOutput)) || runCaseResults[0];
      if (!hasValue(comparable?.expectedOutput)) return summary;

      const actual = normalizeComparableText(comparable.output ?? comparable.stdout ?? '');
      const expected = normalizeComparableText(comparable.expectedOutput ?? '');
      return actual === expected
        ? 'Accepted on this example.'
        : 'Output does not match the expected output for this example.';
    }

    if (hasValue(singleRunExpectedOutput)) {
      const actual = normalizeComparableText(result.output ?? result.stdout ?? '');
      const expected = normalizeComparableText(singleRunExpectedOutput ?? '');
      return actual === expected
        ? 'Accepted on this example.'
        : 'Output does not match the expected output for this example.';
    }

    return summary;
  })();

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-transparent bg-white/90 shadow-[0_14px_40px_-32px_rgba(15,23,42,0.28)] backdrop-blur-sm dark:border-transparent dark:bg-gray-900"
    >
      {showToolbar ? (
        <div
          ref={toolbarRef}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-transparent bg-slate-50/55 px-4 py-2.5 backdrop-blur-sm dark:border-transparent dark:bg-gray-900"
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
              onClick={handleRun}
              disabled={isRunning || isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? 'Running...' : 'Run Code'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
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

      <div
        ref={editorContainerRef}
        className="relative z-0 min-h-0 bg-transparent px-3 pb-0 pt-1"
        style={{ height: editorHeight }}
      >
        {internalClipboardOnly ? (
          <div className="pointer-events-none absolute right-5 top-3 z-20 rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[9px] font-bold text-slate-500 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300">
            {clipboardNotice}
          </div>
        ) : null}
        <MonacoCodeEditor
          language={language}
          value={code}
          onChange={handleEditorCodeChange}
          height="100%"
          internalClipboardOnly={internalClipboardOnly}
          clipboardScope={clipboardScope}
          onClipboardStatus={handleClipboardStatus}
          contentKey={`${editorKey || 'code-editor'}:${language || 'plain'}`}
        />
      </div>

      <button
        type="button"
        ref={splitterRef}
        onPointerDown={handleConsoleResizeStart}
        className="group relative z-20 mx-3 flex h-2.5 w-auto cursor-row-resize items-center justify-center transition-colors"
        aria-label="Resize testcase panel"
      >
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-200/45 dark:bg-gray-700/60" />
        <div className="relative z-10 h-1 w-10 rounded-full bg-slate-300/80 transition-colors group-hover:bg-sky-400 dark:bg-gray-700 dark:group-hover:bg-sky-500" />
      </button>

      <div
        ref={consoleContainerRef}
        className="relative z-20 mx-3 mb-2.5 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-transparent bg-slate-50/60 px-3 pb-2 pt-0.5 dark:border-transparent dark:bg-gray-900"
        style={{ height: clampConsoleHeight(consoleHeight) }}
      >
        <div className="flex flex-none items-center gap-5 overflow-x-auto bg-transparent [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => onConsoleTabChange('testcase')}
            className={`whitespace-nowrap border-b-2 py-2 text-xs font-medium transition-colors ${
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
            className={`whitespace-nowrap border-b-2 py-2 text-xs font-medium transition-colors ${
              activeConsoleTab === 'result'
                ? 'border-sky-600 text-slate-900 dark:border-sky-500 dark:text-gray-100'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Test Result
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth pt-2">
          {activeConsoleTab === 'testcase' ? (
            <div className="space-y-2 text-slate-700 dark:text-gray-200">
              {Array.isArray(testCases) && testCases.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden]">
                  {testCases.map((entry, index) => {
                    const isActive = activeTestCase && String(entry.id) === String(activeTestCase.id);
                    const latestCase = latestRunCaseByIndex.get(index);
                    const latestStatus = latestCase ? normalizeRunCaseStatus(latestCase.status) : '';
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onActiveTestCaseChange?.(entry.id)}
                        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${isActive ? 'bg-slate-800 text-white dark:bg-sky-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                      >
                        <span>Case {index + 1}</span>
                        {latestStatus && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-white/15 text-white' : runStatusTone(latestCase.status)}`}>
                            {latestStatus}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {hasValue(activeTestCase?.input) && (
                <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-gray-900 dark:ring-gray-700">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500">Input</div>
                  <ResultValue value={activeTestCase.input || ''} />
                </div>
              )}
              {hasValue(activeTestCase?.expectedOutput) && (
                <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-gray-900 dark:ring-gray-700">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500">Expected Output</div>
                  <ResultValue value={activeTestCase.expectedOutput || ''} />
                </div>
              )}

            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <div className={`text-xl font-bold ${headerStatusTone}`}>{verdictLabel || 'Test Result'}</div>
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

              {result && isRunResult && runCaseResults.length >= 1 && (
                <div className="space-y-3">
                  <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {runCaseResults.map((entry, index) => {
                      const entryStatus = normalizeRunCaseStatus(entry.status);
                      const toneClass = runStatusTone(entry.status);
                      const resultCaseKey = entry.id || index;
                      const isActiveResultCase = String(activeResultCase?.id || runCaseResults.indexOf(activeResultCase)) === String(resultCaseKey);

                      return (
                        <button
                          type="button"
                          key={entry.id || `run-case-${index + 1}`}
                          onClick={() => setActiveResultCaseId(resultCaseKey)}
                          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${isActiveResultCase ? 'bg-slate-800 text-white dark:bg-sky-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                        >
                          <span>{entry.label || `Case ${index + 1}`}</span>
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${toneClass}`}>{entryStatus}</span>
                        </button>
                      );
                    })}
                  </div>

                  {activeResultCase && (
                    <div>
                      {(() => {
                        const entry = activeResultCase;
                        const index = runCaseResults.indexOf(entry);
                        const compileOutput = getCompileOutput(entry);
                        const errorOutput = getErrorOutput(entry);
                        const hasExpected = hasValue(entry.expectedOutput);
                        const entryStatus = normalizeRunCaseStatus(entry.status);

                        return (
                          <div
                            key={entry.id || `run-case-card-${index + 1}`}
                            className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/50"
                          >
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                                  {entry.label || `Case ${index + 1}`}
                                </span>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${runStatusTone(entry.status)}`}>
                                  Status: {entryStatus}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-gray-400">
                                <span>Runtime: {formatDuration(Number(entry.time || 0) * 1000)}</span>
                                <span>Memory: {Number(entry.memory || 0)} KB</span>
                              </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                              <LcBlock label="Input">
                                <ResultValue value={entry.input || ''} />
                              </LcBlock>
                              <LcBlock label="Your Output">
                                <ResultValue value={(entry.output ?? entry.stdout) || ''} />
                              </LcBlock>

                              <LcBlock label="Expected Output">
                                <ResultValue value={hasExpected ? entry.expectedOutput || '' : 'Expected output unavailable.'} />
                              </LcBlock>

                              {(compileOutput || errorOutput) && (
                                <div className="lg:col-span-2">
                                  <LcBlock label={compileOutput || entryStatus === 'Compilation Error' ? 'Compile Output' : 'Errors'}>
                                    <ResultValue value={compileOutput || errorOutput || ''} />
                                  </LcBlock>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {result && isRunResult && runCaseResults.length === 0 && (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <LcBlock label="Input">
                      <ResultValue value={result.input ?? runInputUsed ?? customInput} />
                    </LcBlock>
                    <LcBlock label={singleRunExpectedOutput !== null && singleRunExpectedOutput !== undefined ? 'Your Output' : 'Output'}>
                      <ResultValue value={(result.output ?? result.stdout) || ''} />
                    </LcBlock>

                    {hasValue(singleRunExpectedOutput) && !(getCompileOutput(result) || getErrorOutput(result)) && (
                      <LcBlock label="Expected">
                        <ResultValue value={singleRunExpectedOutput || ''} />
                      </LcBlock>
                    )}
                    {(getCompileOutput(result) || getErrorOutput(result)) && (
                      <div className="lg:col-span-2">
                        <LcBlock label={getCompileOutput(result) || result.status === 'Compilation Error' ? 'Compile Output' : 'Errors'}>
                          <ResultValue value={getCompileOutput(result) || getErrorOutput(result) || ''} />
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

function sameStringList(left = [], right = []) {
  return left === right || (
    left.length === right.length
    && left.every((item, index) => item === right[index])
  );
}

function sameTestCases(left = [], right = []) {
  return left === right || (
    left.length === right.length
    && left.every((item, index) => {
      const other = right[index];
      return item?.id === other?.id
        && item?.kind === other?.kind
        && item?.input === other?.input
        && item?.expectedOutput === other?.expectedOutput;
    })
  );
}

function codeEditorPropsEqual(previous, next) {
  return previous.language === next.language
    && previous.code === next.code
    && previous.customInput === next.customInput
    && previous.activeTestCaseId === next.activeTestCaseId
    && previous.expectedOutputForRun === next.expectedOutputForRun
    && previous.runInputUsed === next.runInputUsed
    && previous.activeConsoleTab === next.activeConsoleTab
    && previous.result === next.result
    && previous.isRunning === next.isRunning
    && previous.isSubmitting === next.isSubmitting
    && previous.showToolbar === next.showToolbar
    && previous.internalClipboardOnly === next.internalClipboardOnly
    && previous.clipboardScope === next.clipboardScope
    && previous.editorKey === next.editorKey
    && sameStringList(previous.supportedLanguages, next.supportedLanguages)
    && sameTestCases(previous.testCases, next.testCases);
}

export default memo(CodeEditor, codeEditorPropsEqual);
