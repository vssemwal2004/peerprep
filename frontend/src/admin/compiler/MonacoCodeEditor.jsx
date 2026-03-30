/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { getMonacoLanguage } from './compilerUtils';

const MONACO_CDN_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
let monacoLoaderPromise = null;

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
}) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const mutationObserverRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

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
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 22,
          readOnly,
          smoothScrolling: true,
          scrollBeyondLastLine: false,
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'hidden',
            verticalScrollbarSize: 0,
            horizontalScrollbarSize: 0,
            alwaysConsumeMouseWheel: false,
          },
          roundedSelection: false,
          padding: { top: 14, bottom: 14 },
        });

        editor.onDidChangeModelContent(() => {
          onChange?.(editor.getValue());
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
          editor.layout();
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

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="space-y-3">
            <p>{loadError}</p>
            <textarea
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
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
      className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
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




