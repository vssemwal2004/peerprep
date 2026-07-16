import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Editor, { loader } from '@monaco-editor/react';
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

loader.config({ monaco: bundledMonaco });

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

// eslint-disable-next-line react-refresh/only-export-components
export function preloadMonacoEditor() {
  return loader.init().catch(() => null);
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
  contentKey = '',
}) {
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const clipboardScopeRef = useRef(clipboardScope);
  const onClipboardStatusRef = useRef(onClipboardStatus);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState(() => (isDarkMode() ? 'peerprep-dark' : 'peerprep-light'));

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    clipboardScopeRef.current = clipboardScope || 'peerprep-editor';
    onClipboardStatusRef.current = onClipboardStatus;
  }, [clipboardScope, onClipboardStatus]);

  useEffect(() => {
    let mounted = true;
    loader.init().catch((error) => {
      if (!mounted) return;
      setLoadError(error?.message || 'The code editor could not load.');
      setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(isDarkMode() ? 'peerprep-dark' : 'peerprep-light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const focusEditor = () => editorRef.current?.focus();
    window.addEventListener('peerprep:focus-code-editor', focusEditor);
    return () => window.removeEventListener('peerprep:focus-code-editor', focusEditor);
  }, []);

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

  const fallbackEditor = (
    <textarea
      value={value || ''}
      onChange={(event) => onChangeRef.current?.(event.target.value)}
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
      <div
        data-assessment-code-editor={internalClipboardOnly ? 'internal' : undefined}
        onCopyCapture={internalClipboardOnly ? handleInternalCopy : undefined}
        onCutCapture={internalClipboardOnly ? handleInternalCut : undefined}
        onPasteCapture={internalClipboardOnly ? handleInternalPaste : undefined}
        className="overflow-hidden rounded-lg border border-rose-200 bg-white dark:border-rose-800 dark:bg-gray-900"
        style={{ height: resolvedHeight }}
      >
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Basic editor active because Monaco could not initialize.
        </div>
        <div className="h-[calc(100%-37px)]">{fallbackEditor}</div>
      </div>
    );
  }

  return (
    <div
      data-assessment-code-editor={internalClipboardOnly ? 'internal' : undefined}
      onCopyCapture={internalClipboardOnly ? handleInternalCopy : undefined}
      onCutCapture={internalClipboardOnly ? handleInternalCut : undefined}
      onPasteCapture={internalClipboardOnly ? handleInternalPaste : undefined}
      className="relative h-full min-h-0 overflow-hidden rounded-lg bg-white dark:bg-gray-900"
      style={{ height: resolvedHeight }}
    >
      <Editor
        key={contentKey || 'peerprep-code-editor'}
        height="100%"
        language={getMonacoLanguage(language)}
        value={value || ''}
        theme={theme}
        beforeMount={definePeerprepThemes}
        onMount={(editor) => {
          editorRef.current = editor;
          setIsLoading(false);
          requestAnimationFrame(() => editor.layout());
        }}
        onChange={(nextValue) => onChangeRef.current?.(nextValue || '')}
        saveViewState={false}
        keepCurrentModel={false}
        loading={fallbackEditor}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
          fontSize: 14,
          lineHeight: 23,
          fontLigatures: true,
          readOnly,
          domReadOnly: readOnly,
          ariaLabel: 'Code editor',
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'on',
          cursorBlinking: 'smooth',
          scrollBeyondLastLine: false,
          folding: true,
          foldingHighlight: true,
          showFoldingControls: 'mouseover',
          glyphMargin: false,
          codeLens: false,
          links: false,
          colorDecorators: true,
          contextmenu: !internalClipboardOnly,
          hover: { enabled: true, delay: 350 },
          parameterHints: { enabled: true },
          inlayHints: { enabled: 'off' },
          lightbulb: { enabled: 'off' },
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestOnTriggerCharacters: true,
          wordBasedSuggestions: 'currentDocument',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
          occurrencesHighlight: 'off',
          selectionHighlight: true,
          renderValidationDecorations: 'off',
          stickyScroll: { enabled: false },
          tabSize: 2,
          insertSpaces: true,
          autoIndent: 'full',
          formatOnPaste: true,
          formatOnType: true,
          copyWithSyntaxHighlighting: true,
          mouseWheelZoom: true,
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
        }}
      />
      {isLoading ? <span className="sr-only">Loading code editor</span> : null}
    </div>
  );
}
