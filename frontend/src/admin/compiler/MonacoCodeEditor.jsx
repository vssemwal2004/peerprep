/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { getMonacoLanguage } from './compilerUtils';

const MONACO_CDN_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
let monacoLoaderPromise = null;
const internalEditorClipboards = new Map();

function isDarkMode() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function ensureMonaco() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Monaco can only load in the browser.'));
  }

  if (window.monaco?.editor) {
    return Promise.resolve(window.monaco);
  }

  if (monacoLoaderPromise) {
    return monacoLoaderPromise;
  }

  monacoLoaderPromise = new Promise((resolve, reject) => {
    window.MonacoEnvironment = {
      getWorkerUrl: () => {
        const workerSource = `self.MonacoEnvironment = { baseUrl: '${MONACO_CDN_BASE}' }; importScripts('${MONACO_CDN_BASE}/base/worker/workerMain.js');`;
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(workerSource)}`;
      },
    };

    const initializeEditor = () => {
      window.require.config({
        paths: {
          vs: MONACO_CDN_BASE,
        },
      });

      window.require(['vs/editor/editor.main'], () => {
        resolve(window.monaco);
      }, reject);
    };

    if (window.require?.config) {
      initializeEditor();
      return;
    }

    const script = document.createElement('script');
    script.src = `${MONACO_CDN_BASE}/loader.js`;
    script.async = true;
    script.onload = initializeEditor;
    script.onerror = () => reject(new Error('Failed to load Monaco Editor.'));
    document.body.appendChild(script);
  });

  return monacoLoaderPromise;
}

export default function MonacoCodeEditor({
  value,
  onChange,
  language,
  height = 420,
  readOnly = false,
  internalClipboardOnly = false,
  clipboardScope = 'peerprep-editor',
  onClipboardStatus,
}) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const mutationObserverRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const layoutFrameRef = useRef(null);
  const internalClipboardOnlyRef = useRef(internalClipboardOnly);
  const clipboardScopeRef = useRef(clipboardScope);
  const onClipboardStatusRef = useRef(onClipboardStatus);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    internalClipboardOnlyRef.current = internalClipboardOnly;
    clipboardScopeRef.current = clipboardScope || 'peerprep-editor';
    onClipboardStatusRef.current = onClipboardStatus;
  }, [internalClipboardOnly, clipboardScope, onClipboardStatus]);

  useEffect(() => {
    let cancelled = false;

    ensureMonaco()
      .then((monaco) => {
        if (cancelled || !containerRef.current) return;

        monaco.editor.defineTheme('peerprep-light', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#ffffff',
            'editorLineNumber.foreground': '#94a3b8',
          },
        });

        monaco.editor.defineTheme('peerprep-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#111827',
            'editorLineNumber.foreground': '#64748b',
          },
        });

        const editor = monaco.editor.create(containerRef.current, {
          value: value || '',
          language: getMonacoLanguage(language),
          theme: isDarkMode() ? 'peerprep-dark' : 'peerprep-light',
          automaticLayout: false,
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 22,
          readOnly,
          smoothScrolling: false,
          cursorSmoothCaretAnimation: 'off',
          scrollBeyondLastLine: false,
          folding: false,
          glyphMargin: false,
          codeLens: false,
          links: false,
          colorDecorators: false,
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          wordBasedSuggestions: 'off',
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          renderValidationDecorations: 'off',
          stickyScroll: { enabled: false },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            alwaysConsumeMouseWheel: false,
          },
          roundedSelection: false,
          padding: { top: 14, bottom: 14 },
        });

        editor.onDidChangeModelContent(() => {
          onChangeRef.current?.(editor.getValue());
        });

        mutationObserverRef.current = new MutationObserver(() => {
          monaco.editor.setTheme(isDarkMode() ? 'peerprep-dark' : 'peerprep-light');
        });
        mutationObserverRef.current.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        });

        editorRef.current = editor;

        // If the editor was initialized while the container had 0px height,
        // automaticLayout can get stuck. Force an initial layout and keep it in sync.
        resizeObserverRef.current = new ResizeObserver(() => {
          if (layoutFrameRef.current) cancelAnimationFrame(layoutFrameRef.current);
          layoutFrameRef.current = requestAnimationFrame(() => {
            layoutFrameRef.current = null;
            editor.layout();
          });
        });
        resizeObserverRef.current.observe(containerRef.current);

        requestAnimationFrame(() => {
          editor.layout();
        });

        setIsLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error.message || 'Failed to load Monaco Editor.');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      mutationObserverRef.current?.disconnect();
      resizeObserverRef.current?.disconnect();
      if (layoutFrameRef.current) cancelAnimationFrame(layoutFrameRef.current);
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (editor.getValue() !== value) {
      editor.setValue(value || '');
    }
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !window.monaco?.editor) return;

    window.monaco.editor.setModelLanguage(model, getMonacoLanguage(language));
  }, [language]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  const reportClipboardStatus = (status, message) => {
    onClipboardStatusRef.current?.({ status, message });
  };

  const getSelectedEditorText = (event) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (model && selection && !selection.isEmpty()) {
      return model.getValueInRange(selection);
    }

    const target = event?.target;
    if (target && typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
      return String(target.value || '').slice(target.selectionStart, target.selectionEnd);
    }
    return '';
  };

  const replaceEditorSelection = (event, text) => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    if (editor && selection) {
      editor.pushUndoStop();
      editor.executeEdits('peerprep-internal-clipboard', [{
        range: selection,
        text,
        forceMoveMarkers: true,
      }]);
      editor.pushUndoStop();
      editor.focus();
      return true;
    }

    const target = event?.target;
    if (target && typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
      const source = String(target.value || '');
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const nextValue = `${source.slice(0, start)}${text}${source.slice(end)}`;
      onChangeRef.current?.(nextValue);
      requestAnimationFrame(() => {
        target.selectionStart = start + text.length;
        target.selectionEnd = start + text.length;
        target.focus?.();
      });
      return true;
    }
    return false;
  };

  const stopClipboardEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
  };

  const handleInternalCopy = (event) => {
    if (!internalClipboardOnlyRef.current) return;
    stopClipboardEvent(event);
    const selectedText = getSelectedEditorText(event);
    if (!selectedText) {
      reportClipboardStatus('empty', 'Select code inside the editor before copying.');
      return;
    }
    internalEditorClipboards.set(clipboardScopeRef.current, selectedText);
    reportClipboardStatus('copied', 'Code copied to the protected editor clipboard.');
  };

  const handleInternalCut = (event) => {
    if (!internalClipboardOnlyRef.current) return;
    stopClipboardEvent(event);
    if (readOnly) return;
    const selectedText = getSelectedEditorText(event);
    if (!selectedText) {
      reportClipboardStatus('empty', 'Select code inside the editor before cutting.');
      return;
    }
    internalEditorClipboards.set(clipboardScopeRef.current, selectedText);
    replaceEditorSelection(event, '');
    reportClipboardStatus('copied', 'Code moved to the protected editor clipboard.');
  };

  const handleInternalPaste = (event) => {
    if (!internalClipboardOnlyRef.current) return;
    stopClipboardEvent(event);
    if (readOnly) return;
    const protectedCode = internalEditorClipboards.get(clipboardScopeRef.current) || '';
    if (!protectedCode) {
      reportClipboardStatus('blocked', 'External paste blocked. Copy code inside this editor first.');
      return;
    }
    replaceEditorSelection(event, protectedCode);
    reportClipboardStatus('pasted', 'Protected editor code pasted.');
  };

  if (loadError) {
    return (
      <div
        data-assessment-code-editor={internalClipboardOnly ? 'internal' : undefined}
        onCopyCapture={handleInternalCopy}
        onCutCapture={handleInternalCut}
        onPasteCapture={handleInternalPaste}
        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="space-y-3">
            <p>{loadError}</p>
            <textarea
              value={value}
              onChange={(event) => onChangeRef.current?.(event.target.value)}
              readOnly={readOnly}
              style={{ height: resolvedHeight }}
              className="w-full rounded-xl border border-rose-200 bg-white px-3 py-3 font-mono text-xs text-slate-700 outline-none dark:border-rose-800 dark:bg-gray-950 dark:text-gray-200"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-assessment-code-editor={internalClipboardOnly ? 'internal' : undefined}
      onCopyCapture={handleInternalCopy}
      onCutCapture={handleInternalCut}
      onPasteCapture={handleInternalPaste}
      className="relative h-full min-h-0 overflow-hidden rounded-xl border border-transparent bg-white shadow-none dark:border-transparent dark:bg-gray-900"
      style={{ height: resolvedHeight }}
    >
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Monaco Editor
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ height: '100%' }} />
    </div>
  );
}




