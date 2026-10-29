import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
// Load Monaco's editor contributions as well as its API. `editor.api` alone
// renders text but does not register the Suggest Controller, so completion
// providers can return items while no autocomplete widget ever opens.
import * as bundledMonaco from 'monaco-editor/esm/vs/editor/edcore.main';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// C/C++ is used in assessments and must be available immediately. Keeping it
// in the editor bundle avoids a stale/missing lazy chunk leaving production in
// plaintext mode after a deployment.
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import { getMonacoLanguage } from './compilerUtils';
import {
  acquireIdentifierCompletions,
  provideIdentifierCompletions,
} from '../../student/editor/identifierCompletion';

const internalEditorClipboards = new Map();
const MAX_CACHED_MODELS = 24;
const MAX_LOCAL_VALUES = 100;
const MAX_PERSISTED_VIEW_STATES = 64;
const EDITOR_FONT = "14px 'JetBrains Mono'";
const EDITOR_FONT_WAIT_MS = 1500;
// Cursor and scroll position survive an unmount (e.g. coding -> MCQ -> coding).
const persistedViewStates = new Map();
let rCompletionProviderRegistered = false;

// Monaco measures the character width once and trusts it forever. Measuring
// the fallback font and then drawing JetBrains Mono puts the caret a fraction
// of a character off per column, so wait (briefly) for the real font.
function waitForEditorFont(maxMs = EDITOR_FONT_WAIT_MS) {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (!fonts?.load) return Promise.resolve();
  let timer;
  return Promise.race([
    Promise.all([fonts.load(EDITOR_FONT), fonts.load(`bold ${EDITOR_FONT}`)]).catch(() => {}),
    new Promise((resolve) => { timer = setTimeout(resolve, maxMs); }),
  ]).finally(() => clearTimeout(timer));
}

function persistViewState(key, viewState) {
  if (!key || !viewState) return;
  persistedViewStates.delete(key);
  persistedViewStates.set(key, viewState);
  while (persistedViewStates.size > MAX_PERSISTED_VIEW_STATES) {
    persistedViewStates.delete(persistedViewStates.keys().next().value);
  }
}

// Sync bookkeeping shared by Monaco models and the basic textarea. `localValues`
// holds recent texts this editor reported through onChange; when the parent
// renders one of them while newer local edits exist, it is a stale echo of a
// debounced commit, not a replacement.
function createSyncState(value) {
  return { lastExternalValue: value, dirty: false, localValues: new Set() };
}

function recordLocalValue(state, value) {
  state.dirty = true;
  state.localValues.delete(value);
  state.localValues.add(value);
  if (state.localValues.size > MAX_LOCAL_VALUES) {
    state.localValues.delete(state.localValues.values().next().value);
  }
}

function acknowledgeExternalValue(state, value) {
  state.lastExternalValue = value;
  state.dirty = false;
  state.localValues.clear();
}

function isStaleEcho(state, value) {
  return state.dirty && state.localValues.has(value);
}

const languageContributionLoaders = {
  c: () => Promise.resolve(),
  cpp: () => Promise.resolve(),
  csharp: () => import('monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution'),
  go: () => import('monaco-editor/esm/vs/basic-languages/go/go.contribution'),
  java: () => import('monaco-editor/esm/vs/basic-languages/java/java.contribution'),
  javascript: () => import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'),
  kotlin: () => import('monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'),
  php: () => import('monaco-editor/esm/vs/basic-languages/php/php.contribution'),
  python: () => import('monaco-editor/esm/vs/basic-languages/python/python.contribution'),
  r: () => import('monaco-editor/esm/vs/basic-languages/r/r.contribution'),
  ruby: () => import('monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'),
  rust: () => import('monaco-editor/esm/vs/basic-languages/rust/rust.contribution'),
  sql: () => import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution'),
  swift: () => import('monaco-editor/esm/vs/basic-languages/swift/swift.contribution'),
  typescript: () => import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'),
};
const languageContributionPromises = new Map();

function ensureLanguageContribution(language) {
  const languageId = getMonacoLanguage(language);
  const loader = languageContributionLoaders[languageId];
  if (!loader) return Promise.resolve();
  if (!languageContributionPromises.has(languageId)) {
    languageContributionPromises.set(languageId, loader().catch((error) => {
      languageContributionPromises.delete(languageId);
      throw error;
    }));
  }
  return languageContributionPromises.get(languageId);
}

const R_KEYWORDS = [
  'if', 'else', 'repeat', 'while', 'for', 'in', 'next', 'break', 'function',
  'return', 'switch', 'try', 'tryCatch', 'stop', 'warning',
];

const R_CONSTANTS_AND_TYPES = [
  'TRUE', 'FALSE', 'NULL', 'NA', 'NaN', 'Inf', 'NA_integer_', 'NA_real_',
  'NA_complex_', 'NA_character_', 'logical', 'integer', 'double', 'numeric',
  'complex', 'character', 'raw', 'list', 'matrix', 'array', 'factor',
  'data.frame', 'Date', 'POSIXct', 'environment',
];

const R_BASE_FUNCTIONS = [
  'c', 'list', 'vector', 'matrix', 'array', 'data.frame', 'factor', 'seq',
  'seq_len', 'seq_along', 'rep', 'length', 'nrow', 'ncol', 'dim', 'names',
  'rownames', 'colnames', 'class', 'typeof', 'attributes', 'attr', 'structure',
  'as.logical', 'as.integer', 'as.numeric', 'as.double', 'as.character',
  'as.factor', 'as.matrix', 'as.data.frame', 'is.null', 'is.na', 'is.nan',
  'is.finite', 'is.infinite', 'is.logical', 'is.integer', 'is.numeric',
  'is.character', 'is.list', 'is.matrix', 'is.array', 'is.data.frame',
  'print', 'cat', 'message', 'readline', 'scan', 'readLines', 'writeLines',
  'read.csv', 'read.table', 'write.csv', 'write.table', 'paste', 'paste0',
  'sprintf', 'format', 'substr', 'substring', 'strsplit', 'grep', 'grepl',
  'gsub', 'sub', 'tolower', 'toupper', 'trimws', 'chartr', 'nchar',
  'sum', 'prod', 'min', 'max', 'range', 'mean', 'median', 'quantile', 'var',
  'sd', 'cor', 'cov', 'round', 'signif', 'floor', 'ceiling', 'trunc', 'abs',
  'sqrt', 'exp', 'log', 'log10', 'sin', 'cos', 'tan', 'choose', 'factorial',
  'sort', 'order', 'rank', 'rev', 'unique', 'duplicated', 'match', '%in%',
  'which', 'which.max', 'which.min', 'any', 'all', 'anyNA', 'complete.cases',
  'sample', 'set.seed', 'rnorm', 'runif', 'dnorm', 'pnorm', 'qnorm',
  'apply', 'lapply', 'sapply', 'vapply', 'tapply', 'mapply', 'Map', 'Reduce',
  'Filter', 'aggregate', 'merge', 'subset', 'transform', 'within', 'split',
  'rbind', 'cbind', 'do.call', 'unlist', 'append', 'head', 'tail', 'str',
  'summary', 'table', 'prop.table', 'cut', 'findInterval', 'diff', 'cumsum',
  'cumprod', 'cummin', 'cummax', 'lm', 'glm', 'predict', 'anova', 'plot',
  'hist', 'boxplot', 'barplot', 'lines', 'points', 'legend', 'par',
  'library', 'require', 'data', 'get', 'assign', 'exists', 'rm', 'ls',
  'source', 'invisible', 'identical', 'all.equal', 'quote', 'expression',
];

function registerRCompletionProvider(monaco) {
  if (rCompletionProviderRegistered) return;
  rCompletionProviderRegistered = true;
  const keywordSet = new Set(R_KEYWORDS);
  const typeSet = new Set(R_CONSTANTS_AND_TYPES);
  const labels = [...new Set([...R_KEYWORDS, ...R_CONSTANTS_AND_TYPES, ...R_BASE_FUNCTIONS])];

  monaco.languages.registerCompletionItemProvider('r', {
    triggerCharacters: ['.', '_'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: labels.map((label) => ({
          label,
          insertText: label,
          range,
          kind: keywordSet.has(label)
            ? monaco.languages.CompletionItemKind.Keyword
            : typeSet.has(label)
              ? monaco.languages.CompletionItemKind.Class
              : monaco.languages.CompletionItemKind.Function,
          detail: keywordSet.has(label) ? 'R keyword' : typeSet.has(label) ? 'R constant or data type' : 'Base R function',
        })),
      };
    },
  });
}

if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
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
      'editor.lineHighlightBackground': '#00000000',
      'editorIndentGuide.background1': '#00000000',
      'editorIndentGuide.activeBackground1': '#00000000',
      'editorBracketPairGuide.background1': '#00000000',
      'editorBracketPairGuide.activeBackground1': '#00000000',
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
      'editor.lineHighlightBackground': '#00000000',
      'editorIndentGuide.background1': '#00000000',
      'editorIndentGuide.activeBackground1': '#00000000',
      'editorBracketPairGuide.background1': '#00000000',
      'editorBracketPairGuide.activeBackground1': '#00000000',
    },
  });
}

function ensureEditorWritable(editor) {
  if (!editor) return;
  const options = editor.getRawOptions();
  if (options.readOnly || options.domReadOnly) {
    editor.updateOptions({ readOnly: false, domReadOnly: false });
  }
  const editorNode = editor.getDomNode();
  editorNode?.removeAttribute('aria-hidden');
  editorNode?.querySelectorAll('[aria-hidden="true"]').forEach((node) => {
    if (node.matches?.('textarea.inputarea, .inputarea, .view-lines, .monaco-mouse-cursor-text')) {
      node.removeAttribute('aria-hidden');
    }
  });
  const input = editorNode?.querySelector('textarea.inputarea');
  if (!input) return;
  input.readOnly = false;
  input.disabled = false;
  input.removeAttribute('readonly');
  input.removeAttribute('disabled');
  input.setAttribute('aria-readonly', 'false');
  input.style.pointerEvents = 'auto';
  input.style.userSelect = 'text';
}

function getModelKey(contentKey) {
  return String(contentKey || 'peerprep-code-editor');
}

function trimModelCache(entries, activeKey) {
  if (entries.size <= MAX_CACHED_MODELS) return;
  const staleEntries = [...entries.entries()]
    .filter(([key]) => key !== activeKey)
    .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);

  while (entries.size > MAX_CACHED_MODELS && staleEntries.length > 0) {
    const [key, entry] = staleEntries.shift();
    entry.model.dispose();
    entries.delete(key);
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function preloadMonacoEditor(language) {
  // Also starts the editor font download so the first editor measures it.
  return Promise.all([ensureLanguageContribution(language), waitForEditorFont()]).then(() => bundledMonaco);
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
  valueVersion = 0,
  identifierSuggestions = false,
}) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const applyingExternalValueRef = useRef(false);
  const contentKeyRef = useRef(contentKey);
  const valueVersionRef = useRef(valueVersion);
  const externalValueRef = useRef(value || '');
  const modelEntriesRef = useRef(new Map());
  const activeModelKeyRef = useRef(getModelKey(contentKey));
  const latestLanguageRef = useRef(language);
  const latestReadOnlyRef = useRef(readOnly);
  const latestBlockContextMenuRef = useRef(blockContextMenu);
  const clipboardScopeRef = useRef(clipboardScope);
  const onClipboardStatusRef = useRef(onClipboardStatus);
  const fallbackTextareaRef = useRef(null);
  const fallbackTextRef = useRef(value || '');
  const fallbackSyncRef = useRef(null);
  if (!fallbackSyncRef.current) fallbackSyncRef.current = createSyncState(value || '');
  const pendingFocusRef = useRef(null);
  const [fallbackValue, setFallbackValue] = useState(value || '');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [assistMessage, setAssistMessage] = useState('Type to see suggestions automatically');

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
    const nextModelKey = getModelKey(contentKey);
    const forceExternalValue = valueVersionRef.current !== valueVersion;
    externalValueRef.current = nextValue;
    valueVersionRef.current = valueVersion;

    const editor = editorRef.current;
    if (!editor) {
      // Basic textarea (Monaco still loading or unavailable): same stale-echo
      // rule as the models, so a debounced commit cannot undo newer typing.
      const fallbackSync = fallbackSyncRef.current;
      const fallbackKeyChanged = activeModelKeyRef.current !== nextModelKey;
      if (fallbackTextRef.current === nextValue) {
        acknowledgeExternalValue(fallbackSync, nextValue);
      } else if (forceExternalValue || fallbackKeyChanged || !isStaleEcho(fallbackSync, nextValue)) {
        acknowledgeExternalValue(fallbackSync, nextValue);
        fallbackTextRef.current = nextValue;
        setFallbackValue(nextValue);
      }
      contentKeyRef.current = contentKey;
      activeModelKeyRef.current = nextModelKey;
      return;
    }

    const entries = modelEntriesRef.current;
    const previousModelKey = activeModelKeyRef.current;
    const contentChanged = previousModelKey !== nextModelKey;
    if (contentChanged) {
      const previousEntry = entries.get(previousModelKey);
      if (previousEntry) previousEntry.viewState = editor.saveViewState();
    }

    let entry = entries.get(nextModelKey);
    if (!entry) {
      entry = {
        ...createSyncState(nextValue),
        model: bundledMonaco.editor.createModel(nextValue, getMonacoLanguage(latestLanguageRef.current)),
        viewState: persistedViewStates.get(nextModelKey) || null,
        lastUsed: Date.now(),
      };
      entries.set(nextModelKey, entry);
    } else {
      entry.lastUsed = Date.now();
      bundledMonaco.editor.setModelLanguage(entry.model, getMonacoLanguage(latestLanguageRef.current));
    }

    if (entry.model.getValue() === nextValue) {
      acknowledgeExternalValue(entry, nextValue);
    } else if (forceExternalValue || contentChanged || !isStaleEcho(entry, nextValue)) {
      // A stale echo (the parent rendering an older debounced commit while the
      // user kept typing) is ignored; anything else replaces the text. Opening
      // another model is authoritative: no commit is pending for it.
      applyingExternalValueRef.current = true;
      try {
        const attached = editor.getModel() === entry.model;
        let applied = false;
        if (forceExternalValue && attached) {
          // An undoable edit keeps history (Ctrl+Z after Reset Code) and does
          // not flush the cursor collection the way setValue does.
          const previousPosition = editor.getPosition();
          editor.pushUndoStop();
          applied = editor.executeEdits('peerprep-external-value', [{
            range: entry.model.getFullModelRange(),
            text: nextValue,
          }], () => {
            const position = entry.model.validatePosition(previousPosition || { lineNumber: 1, column: 1 });
            return [new bundledMonaco.Selection(position.lineNumber, position.column, position.lineNumber, position.column)];
          });
          editor.pushUndoStop();
        }
        // Read-only editors refuse executeEdits; detached models have no cursor.
        if (!applied) entry.model.setValue(nextValue);
        acknowledgeExternalValue(entry, nextValue);
      } finally {
        applyingExternalValueRef.current = false;
      }
    }

    if (contentChanged) {
      contentKeyRef.current = contentKey;
      activeModelKeyRef.current = nextModelKey;
      editor.setModel(entry.model);
      if (entry.viewState) {
        editor.restoreViewState(entry.viewState);
      } else {
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.setScrollTop(0);
        editor.setScrollLeft(0);
      }
      editor.layout();
    }
    trimModelCache(entries, nextModelKey);
    if (!latestReadOnlyRef.current) ensureEditorWritable(editor);
  }, [value, contentKey, valueVersion]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    let editor;
    let changeSubscription;
    let focusSubscription;
    let widgetFocusSubscription;
    let readOnlyAttemptSubscription;
    let typingSubscription;
    let mutationObserver;
    let resizeObserver;
    let layoutFrame;
    let releaseIdentifierCompletions;
    let applySuggestionAction;
    let assistMessageTimer;
    let automaticSuggestionTimer;
    let removeFontListener;
    let cancelled = false;
    const modelEntries = modelEntriesRef.current;

    const initializeEditor = async () => {
      try {
      await Promise.all([ensureLanguageContribution(latestLanguageRef.current), waitForEditorFont()]);
      if (cancelled || !containerRef.current) return;
      definePeerprepThemes(bundledMonaco);
      registerRCompletionProvider(bundledMonaco);
      const initialModelKey = getModelKey(contentKeyRef.current);
      // Start from what was typed into the basic textarea while Monaco loaded,
      // not from the (possibly older) parent value.
      const fallbackSync = fallbackSyncRef.current;
      const initialText = fallbackTextRef.current;
      const initialModel = bundledMonaco.editor.createModel(
        initialText,
        getMonacoLanguage(latestLanguageRef.current),
      );
      modelEntries.set(initialModelKey, {
        model: initialModel,
        viewState: null,
        lastExternalValue: externalValueRef.current,
        lastUsed: Date.now(),
        dirty: initialText !== externalValueRef.current,
        localValues: initialText !== externalValueRef.current ? new Set(fallbackSync.localValues) : new Set(),
      });
      activeModelKeyRef.current = initialModelKey;
      const fallbackTextarea = fallbackTextareaRef.current;
      const fallbackHadFocus = Boolean(fallbackTextarea) && document.activeElement === fallbackTextarea;
      editor = bundledMonaco.editor.create(containerRef.current, {
        model: initialModel,
        theme: isDarkMode() ? 'peerprep-dark' : 'peerprep-light',
        automaticLayout: false,
        minimap: { enabled: false },
        fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 23,
        // Show the exact source characters. With ligatures enabled, valid C++
        // `!=` looked like a Unicode `≠`, which was easily mistaken for a
        // compiler-breaking character.
        fontLigatures: false,
        // Position the caret from DOM measurements instead of column x cached
        // character width, so a late font swap can never misplace it.
        disableMonospaceOptimizations: true,
        smoothScrolling: false,
        cursorBlinking: 'blink',
        cursorSmoothCaretAnimation: 'off',
        readOnly: Boolean(latestReadOnlyRef.current),
        domReadOnly: Boolean(latestReadOnlyRef.current),
        ariaLabel: 'Code editor',
        scrollBeyondLastLine: false,
        folding: true,
        glyphMargin: false,
        codeLens: false,
        links: false,
        contextmenu: !latestBlockContextMenuRef.current,
        hover: { enabled: true, delay: 350, sticky: true },
        parameterHints: { enabled: true, cycle: true },
        inlayHints: { enabled: 'off' },
        lightbulb: { enabled: 'off' },
        // The student completion provider opens the widget only when an actual
        // previously-declared variable/function matches. This avoids Monaco's
        // empty "No suggestions" popup.
        quickSuggestions: false,
        quickSuggestionsDelay: 80,
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: 'off',
        inlineSuggest: { enabled: false },
        suggest: {
          showIcons: true,
          showStatusBar: true,
          // Ghost text after the caret made the caret look misplaced.
          preview: false,
          snippetsPreventQuickSuggestions: false,
          localityBonus: true,
          shareSuggestSelections: true,
          showKeywords: false,
          showWords: false,
          showClasses: false,
          showModules: false,
        },
        snippetSuggestions: 'top',
        suggestSelection: 'first',
        tabCompletion: 'on',
        // Tab accepts (as the status bar says); Enter always inserts a newline.
        acceptSuggestionOnEnter: 'off',
        acceptSuggestionOnCommitCharacter: true,
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoSurround: 'languageDefined',
        bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
        guides: {
          bracketPairs: 'active',
          bracketPairsHorizontal: false,
          highlightActiveBracketPair: true,
          indentation: false,
          highlightActiveIndentation: false,
        },
        matchBrackets: 'always',
        occurrencesHighlight: 'singleFile',
        selectionHighlight: true,
        renderValidationDecorations: 'off',
        stickyScroll: { enabled: false },
        tabSize: 2,
        insertSpaces: true,
        autoIndent: 'full',
        formatOnPaste: false,
        formatOnType: false,
        copyWithSyntaxHighlighting: false,
        largeFileOptimizations: true,
        maxTokenizationLineLength: 20000,
        renderLineHighlight: 'line',
        renderWhitespace: 'none',
        mouseWheelZoom: false,
        fixedOverflowWidgets: true,
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

      editorRef.current = editor;
      const persistedViewState = persistedViewStates.get(initialModelKey);
      if (persistedViewState) editor.restoreViewState(persistedViewState);

      const fontSet = document.fonts;
      if (fontSet) {
        const remeasure = (event) => {
          if (cancelled) return;
          const loadedFaces = event?.fontfaces ? [...event.fontfaces] : [];
          if (loadedFaces.length && !loadedFaces.some((face) => /jetbrains mono/i.test(face.family || ''))) return;
          bundledMonaco.editor.remeasureFonts();
        };
        fontSet.addEventListener?.('loadingdone', remeasure);
        removeFontListener = () => fontSet.removeEventListener?.('loadingdone', remeasure);
        fontSet.ready?.then(() => remeasure()).catch(() => {});
      }

      if (fallbackHadFocus && !latestReadOnlyRef.current) {
        pendingFocusRef.current = {
          start: fallbackTextarea.selectionStart,
          end: fallbackTextarea.selectionEnd,
          direction: fallbackTextarea.selectionDirection,
        };
      }

      if (identifierSuggestions) {
        releaseIdentifierCompletions = acquireIdentifierCompletions(
          bundledMonaco,
          containerRef.current,
          (candidateModel) => {
            for (const entry of modelEntriesRef.current.values()) {
              if (entry.model === candidateModel) return true;
            }
            return false;
          },
        );
        applySuggestionAction = editor.addAction({
          id: 'peerprep.apply-best-intellisense-suggestion',
          label: 'Apply best IntelliSense suggestion',
          keybindings: [bundledMonaco.KeyMod.Alt | bundledMonaco.KeyCode.Enter],
          run: async (activeEditor) => {
            setAssistMessage('Finding the best suggestion…');
            await activeEditor.getAction('editor.action.triggerSuggest')?.run();
            window.setTimeout(async () => {
              await activeEditor.getAction('acceptSelectedSuggestion')?.run();
              setAssistMessage('Suggestion applied · Undo with Ctrl+Z');
              window.clearTimeout(assistMessageTimer);
              assistMessageTimer = window.setTimeout(
                () => setAssistMessage('Type to see suggestions automatically'),
                2600,
              );
            }, 90);
          },
        });

        // Monaco's internal quick-suggestion scheduler can be suppressed by
        // host-page focus/read-only transitions. Trigger the same native
        // suggestion command after real identifier typing so the popup is
        // dependable without requiring Ctrl+Space. The check runs once typing
        // pauses so fast typing never pays for a parse per keystroke.
        typingSubscription = editor.onDidType((typedText) => {
          if (!/[A-Za-z0-9_$.:>]/.test(typedText)) return;
          window.clearTimeout(automaticSuggestionTimer);
          automaticSuggestionTimer = window.setTimeout(() => {
            if (cancelled || latestReadOnlyRef.current || !editor.hasTextFocus()) return;
            const activeModel = editor.getModel();
            const activePosition = editor.getPosition();
            const available = activeModel && activePosition
              ? provideIdentifierCompletions(bundledMonaco, activeModel, activePosition)
              : null;
            if (!available?.suggestions?.length) {
              editor.trigger('peerprep.identifier-completion', 'hideSuggestWidget', null);
              return;
            }
            void editor.getAction('editor.action.triggerSuggest')?.run();
          }, 180);
        });
      }
      if (!latestReadOnlyRef.current) ensureEditorWritable(editor);

      changeSubscription = editor.onDidChangeModelContent(() => {
        if (applyingExternalValueRef.current) return;
        const nextValue = editor.getValue();
        const activeEntry = modelEntries.get(activeModelKeyRef.current);
        if (activeEntry) {
          recordLocalValue(activeEntry, nextValue);
          activeEntry.lastUsed = Date.now();
        }
        onChangeRef.current?.(nextValue);
      });
      focusSubscription = editor.onDidFocusEditorText(() => {
        if (!latestReadOnlyRef.current) ensureEditorWritable(editor);
      });
      widgetFocusSubscription = editor.onDidFocusEditorWidget(() => {
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
        if (!cancelled) {
          setLoadError(error?.message || 'The code editor could not load.');
          setIsLoading(false);
        }
      }
    };

    void initializeEditor();

    return () => {
      cancelled = true;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      changeSubscription?.dispose();
      focusSubscription?.dispose();
      widgetFocusSubscription?.dispose();
      readOnlyAttemptSubscription?.dispose();
      typingSubscription?.dispose();
      applySuggestionAction?.dispose();
      releaseIdentifierCompletions?.();
      window.clearTimeout(assistMessageTimer);
      window.clearTimeout(automaticSuggestionTimer);
      removeFontListener?.();
      const activeKey = activeModelKeyRef.current;
      modelEntries.forEach((entry, key) => {
        if (key !== activeKey) persistViewState(key, entry.viewState);
      });
      const activeEntry = modelEntries.get(activeKey);
      if (editor && activeEntry) {
        persistViewState(activeKey, editor.saveViewState());
        // A re-created editor (identifierSuggestions toggled) starts from the
        // live text, which may be ahead of the parent's debounced value.
        fallbackTextRef.current = activeEntry.model.getValue();
        fallbackSyncRef.current = {
          lastExternalValue: activeEntry.lastExternalValue,
          dirty: activeEntry.dirty,
          localValues: new Set(activeEntry.localValues),
        };
      }
      editor?.setModel(null);
      editor?.dispose();
      modelEntries.forEach((entry) => entry.model.dispose());
      modelEntries.clear();
      editorRef.current = null;
    };
  }, [identifierSuggestions]);

  useEffect(() => {
    let cancelled = false;
    void ensureLanguageContribution(language).then(() => {
      if (cancelled) return;
      const model = editorRef.current?.getModel();
      if (model) bundledMonaco.editor.setModelLanguage(model, getMonacoLanguage(language));
    }).catch(() => {
      // Keep the existing language active if an optional syntax contribution fails to load.
    });
    return () => { cancelled = true; };
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

  // The basic textarea had focus when Monaco took over: keep typing flowing
  // into Monaco at the same caret instead of losing keystrokes to <body>.
  useLayoutEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    const editor = editorRef.current;
    if (isLoading || !pendingFocus || !editor) return;
    pendingFocusRef.current = null;
    const model = editor.getModel();
    if (!model) return;
    const start = model.getPositionAt(Number(pendingFocus.start) || 0);
    const end = model.getPositionAt(Number(pendingFocus.end ?? pendingFocus.start) || 0);
    const selection = pendingFocus.direction === 'backward'
      ? new bundledMonaco.Selection(end.lineNumber, end.column, start.lineNumber, start.column)
      : new bundledMonaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column);
    editor.layout();
    editor.focus();
    editor.setSelection(selection);
    editor.revealPositionInCenterIfOutsideViewport(selection.getPosition());
  }, [isLoading]);

  useEffect(() => {
    const focusEditor = () => editorRef.current?.focus();
    const repairEditor = () => {
      if (!latestReadOnlyRef.current) ensureEditorWritable(editorRef.current);
    };
    window.addEventListener('peerprep:focus-code-editor', focusEditor);
    window.addEventListener('pageshow', repairEditor);
    document.addEventListener('visibilitychange', repairEditor);
    return () => {
      window.removeEventListener('peerprep:focus-code-editor', focusEditor);
      window.removeEventListener('pageshow', repairEditor);
      document.removeEventListener('visibilitychange', repairEditor);
    };
  }, []);

  const handleEditorChange = (nextValue) => {
    fallbackTextRef.current = nextValue;
    recordLocalValue(fallbackSyncRef.current, nextValue);
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
      ref={fallbackTextareaRef}
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
      onClickCapture={enforceWritableState}
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white dark:bg-gray-900"
      style={{ height: resolvedHeight }}
    >
      <div className="relative min-h-0 flex-1">
        {isLoading ? <div className="absolute inset-0 z-10">{basicEditor}</div> : null}
        <div ref={containerRef} aria-hidden={isLoading ? 'true' : undefined} className="h-full w-full" style={{ visibility: isLoading ? 'hidden' : 'visible' }} />
      </div>
      {identifierSuggestions && !readOnly ? (
        <div className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 text-[10px] font-medium text-slate-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            {assistMessage}
          </span>
          <span className="hidden shrink-0 items-center gap-2 sm:inline-flex" aria-label="Editor completion shortcuts">
            <span><kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">Tab</kbd> accept</span>
            <span><kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-[9px] text-slate-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">Alt Enter</kbd> apply best</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
