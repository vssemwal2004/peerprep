import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import * as bundledMonaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution';
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution';
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import { getMonacoLanguage } from './compilerUtils';

const internalEditorClipboards = new Map();

if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker: (_moduleId, label) => {
      if (label === 'json') return new JsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
      if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker();
      return new EditorWorker();
    },
  };
}

function isDarkMode() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function definePeerprepThemes(monaco) {
  monaco.editor.defineTheme('peerprep-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7c3aed', fontStyle: 'bold' },
      { token: 'type', foreground: '0369a1' },
      { token: 'number', foreground: 'b45309' },
      { token: 'string', foreground: '047857' },
      { token: 'delimiter', foreground: '334155' },
      { token: 'operator', foreground: 'be123c' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1e293b',
      'editorLineNumber.foreground': '#94a3b8',
      'editorCursor.foreground': '#0284c7',
      'editor.selectionBackground': '#bae6fd99',
      'editor.lineHighlightBackground': '#f8fafc',
    },
  });

  monaco.editor.defineTheme('peerprep-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c084fc', fontStyle: 'bold' },
      { token: 'type', foreground: '7dd3fc' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'string', foreground: '86efac' },
      { token: 'delimiter', foreground: 'cbd5e1' },
      { token: 'operator', foreground: 'fb7185' },
    ],
    colors: {
      'editor.background': '#111827',
      'editor.foreground': '#e5e7eb',
      'editorLineNumber.foreground': '#64748b',
      'editorCursor.foreground': '#38bdf8',
      'editor.selectionBackground': '#07598599',
      'editor.lineHighlightBackground': '#172033',
    },
  });
}

function ensureEditorWritable(editor) {
  if (!editor) return;
  editor.updateOptions({ readOnly: false, domReadOnly: false });
  const input = editor.getDomNode()?.querySelector('textarea.inputarea');
  if (!input) return;
  input.readOnly = false;
  input.disabled = false;
  input.removeAttribute('readonly');
  input.setAttribute('aria-readonly', 'false');
}

// eslint-disable-next-line react-refresh/only-export-components
export function preloadMonacoEditor() {
  return Promise.resolve(bundledMonaco);
}

export default function MonacoCodeEditor({
  value,
  onChange,
  language,
  height = 420,
  readOnly = false,
  internalClipboardOnly = false,
  blockContextMenu = false,
  clipboardScope = 'peerprep-editor',
  onClipboardStatus,
  contentKey = '',
}) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const applyingExternalValueRef = useRef(false);
  const pendingLocalValueRef = useRef(null);
  const contentKeyRef = useRef(contentKey);
  const externalValueRef = useRef(value || '');
  const latestLanguageRef = useRef(language);
  const latestReadOnlyRef = useRef(readOnly);
  const latestBlockContextMenuRef = useRef(blockContextMenu);
  const clipboardScopeRef = useRef(clipboardScope);
  const onClipboardStatusRef = useRef(onClipboardStatus);
  const [fallbackValue, setFallbackValue] = useState(value || '');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    latestLanguageRef.current = language;
    latestReadOnlyRef.current = readOnly;
    latestBlockContextMenuRef.current = blockContextMenu;
  }, [language, readOnly, blockContextMenu]);

  useEffect(() => {
    clipboardScopeRef.current = clipboardScope || 'peerprep-editor';
    onClipboardStatusRef.current = onClipboardStatus;
  }, [clipboardScope, onClipboardStatus]);

  useEffect(() => {
    const nextValue = value || '';
    const previousExternalValue = externalValueRef.current;
    const contentChanged = contentKeyRef.current !== contentKey;
    externalValueRef.current = nextValue;

    if (contentChanged) {
      contentKeyRef.current = contentKey;
      pendingLocalValueRef.current = null;
    } else if (pendingLocalValueRef.current !== null) {
      if (nextValue === pendingLocalValueRef.current) {
        pendingLocalValueRef.current = null;
        setFallbackValue(nextValue);
        return;
      }
      if (nextValue === previousExternalValue) return;
      pendingLocalValueRef.current = null;
    }

    setFallbackValue(nextValue);
    const editor = editorRef.current;
    if (!editor || editor.getValue() === nextValue) return;

    applyingExternalValueRef.current = true;
    try {
      editor.setValue(nextValue);
    } finally {
      applyingExternalValueRef.current = false;
    }
  }, [value, contentKey]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    let editor;
    let model;
    let changeSubscription;
    let focusSubscription;
    let readOnlyAttemptSubscription;
    let mutationObserver;
    let resizeObserver;
    let layoutFrame;

    try {
      definePeerprepThemes(bundledMonaco);
      editor = bundledMonaco.editor.create(containerRef.current, {
        value: externalValueRef.current,
        language: getMonacoLanguage(latestLanguageRef.current),
        theme: isDarkMode() ? 'peerprep-dark' : 'peerprep-light',
        automaticLayout: false,
        minimap: { enabled: false },
        fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
        fontSize: 14,
        lineHeight: 23,
        fontLigatures: true,
        readOnly: Boolean(latestReadOnlyRef.current),
        domReadOnly: Boolean(latestReadOnlyRef.current),
        ariaLabel: 'Code editor',
        scrollBeyondLastLine: false,
        folding: true,
        glyphMargin: false,
        codeLens: false,
        links: false,
        contextmenu: !latestBlockContextMenuRef.current,
        hover: { enabled: false },
        parameterHints: { enabled: false },
        inlayHints: { enabled: 'off' },
        lightbulb: { enabled: 'off' },
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: 'off',
        inlineSuggest: { enabled: false },
        tabCompletion: 'off',
        acceptSuggestionOnEnter: 'off',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
        occurrencesHighlight: 'off',
        selectionHighlight: true,
        renderValidationDecorations: 'off',
        stickyScroll: { enabled: false },
        tabSize: 2,
        insertSpaces: true,
        autoIndent: 'full',
        formatOnPaste: false,
        formatOnType: false,
        copyWithSyntaxHighlighting: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: {
          vertical: 'auto',
          horizontal: 'auto',
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
          alwaysConsumeMouseWheel: false,
        },
        roundedSelection: false,
        padding: { top: 14, bottom: 14 },
      });

      model = editor.getModel();
      editorRef.current = editor;
      if (!latestReadOnlyRef.current) ensureEditorWritable(editor);

      changeSubscription = editor.onDidChangeModelContent(() => {
        if (applyingExternalValueRef.current) return;
        const nextValue = editor.getValue();
        pendingLocalValueRef.current = nextValue;
        setFallbackValue(nextValue);
        onChangeRef.current?.(nextValue);
      });
      focusSubscription = editor.onDidFocusEditorText(() => {
        if (!latestReadOnlyRef.current) ensureEditorWritable(editor);
      });
      readOnlyAttemptSubscription = editor.onDidAttemptReadOnlyEdit(() => {
        if (!latestReadOnlyRef.current) {
          ensureEditorWritable(editor);
          editor.focus();
        }
      });

      mutationObserver = new MutationObserver(() => {
        bundledMonaco.editor.setTheme(isDarkMode() ? 'peerprep-dark' : 'peerprep-light');
      });
      mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      resizeObserver = new ResizeObserver(() => {
        if (layoutFrame) cancelAnimationFrame(layoutFrame);
        layoutFrame = requestAnimationFrame(() => {
          layoutFrame = null;
          editor.layout();
        });
      });
      resizeObserver.observe(containerRef.current);

      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        editor.layout();
      });
      setIsLoading(false);
    } catch (error) {
      setLoadError(error?.message || 'The code editor could not load.');
      setIsLoading(false);
    }

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      changeSubscription?.dispose();
      focusSubscription?.dispose();
      readOnlyAttemptSubscription?.dispose();
      editor?.dispose();
      model?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) bundledMonaco.editor.setModelLanguage(model, getMonacoLanguage(language));
  }, [language]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (readOnly) {
      editor.updateOptions({ readOnly: true, domReadOnly: true });
      return;
    }
    ensureEditorWritable(editor);
  }, [readOnly]);

  useEffect(() => {
    editorRef.current?.updateOptions({ contextmenu: !blockContextMenu });
  }, [blockContextMenu]);

  useEffect(() => {
    const focusEditor = () => editorRef.current?.focus();
    window.addEventListener('peerprep:focus-code-editor', focusEditor);
    return () => window.removeEventListener('peerprep:focus-code-editor', focusEditor);
  }, []);

  const handleEditorChange = (nextValue) => {
    pendingLocalValueRef.current = nextValue;
    setFallbackValue(nextValue);
    onChangeRef.current?.(nextValue);
  };

  const enforceWritableState = () => {
    if (!readOnly) ensureEditorWritable(editorRef.current);
  };

  const reportClipboardStatus = (status, message) => {
    onClipboardStatusRef.current?.({ status, message });
  };

  const getSelectedEditorText = (event) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (model && selection && !selection.isEmpty()) return model.getValueInRange(selection);

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
      editor.executeEdits('peerprep-internal-clipboard', [{ range: selection, text, forceMoveMarkers: true }]);
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
      handleEditorChange(nextValue);
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
    if (!internalClipboardOnly) return;
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
    if (!internalClipboardOnly) return;
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
    if (!internalClipboardOnly) return;
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

  const captureProps = internalClipboardOnly
    ? {
        'data-assessment-code-editor': 'internal',
        onCopyCapture: handleInternalCopy,
        onCutCapture: handleInternalCut,
        onPasteCapture: handleInternalPaste,
      }
    : {};

  const basicEditor = (
    <textarea
      value={fallbackValue}
      onChange={(event) => handleEditorChange(event.target.value)}
      readOnly={readOnly}
      aria-label="Code editor"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      className="h-full w-full resize-none border-0 bg-white px-4 py-3.5 font-mono text-sm leading-[23px] text-slate-800 outline-none dark:bg-gray-900 dark:text-gray-100"
    />
  );

  if (loadError) {
    return (
      <div {...captureProps} className="overflow-hidden rounded-lg border border-rose-200 bg-white dark:border-rose-800 dark:bg-gray-900" style={{ height: resolvedHeight }}>
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Basic editor active because Monaco could not initialize.
        </div>
        <div className="h-[calc(100%-37px)]">{basicEditor}</div>
      </div>
    );
  }

  return (
    <div
      {...captureProps}
      onPointerDownCapture={enforceWritableState}
      onFocusCapture={enforceWritableState}
      className="relative h-full min-h-0 overflow-hidden rounded-lg bg-white dark:bg-gray-900"
      style={{ height: resolvedHeight }}
    >
      {isLoading ? <div className="absolute inset-0 z-10">{basicEditor}</div> : null}
      <div ref={containerRef} aria-hidden={isLoading ? 'true' : undefined} className="h-full w-full" style={{ visibility: isLoading ? 'hidden' : 'visible' }} />
    </div>
  );
}
