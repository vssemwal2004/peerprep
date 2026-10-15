import {
  extractDeclaredIdentifiers,
  IDENTIFIER_COMPLETION_LANGUAGES,
} from './identifierExtraction.js';

// One completion provider per language is shared by every mounted student code
// editor. Monaco providers are global, so the provider only answers for models
// shown inside a registered editor container; other Monaco editors in the app
// (admin harness, SQL schema, ...) keep Monaco's default behaviour.
//
// Monaco asks provider groups in order of selector score and stops at the first
// group that returns items. A language-specific provider outranks the built-in
// word-based provider ('*'), so while the student has declared names, the list
// shows only those names instead of every word in the file.

const registry = {
  monaco: null,
  disposables: [],
  holders: new Set(),
  cache: new WeakMap(),
};

const KIND_DETAILS = {
  function: 'Function in your code',
  variable: 'Variable in your code',
  class: 'Type in your code',
  module: 'Import in your code',
};

function completionKind(monaco, kind) {
  const kinds = monaco.languages.CompletionItemKind || {};
  if (kind === 'function') return kinds.Function;
  if (kind === 'class') return kinds.Class;
  if (kind === 'module') return kinds.Module;
  return kinds.Variable;
}

function isInsideRegisteredEditor(monaco, model) {
  if (registry.holders.size === 0) return false;
  const editors = monaco.editor?.getEditors?.() || [];
  return editors.some((editor) => {
    if (editor.getModel?.() !== model) return false;
    const node = editor.getDomNode?.();
    if (!node) return false;
    for (const holder of registry.holders) {
      if (holder.element === node || holder.element.contains?.(node)) return true;
    }
    return false;
  });
}

// Extraction runs at most once per model version, however often Monaco asks.
function getModelIdentifiers(model) {
  const languageId = model.getLanguageId();
  const key = `${model.getVersionId()}:${languageId}`;
  const cached = registry.cache.get(model);
  if (cached?.key === key) return cached.identifiers;
  const identifiers = extractDeclaredIdentifiers(model.getValue(), languageId);
  registry.cache.set(model, { key, identifiers });
  return identifiers;
}

export function provideIdentifierCompletions(monaco, model, position) {
  if (!isInsideRegisteredEditor(monaco, model)) return undefined;

  const lineText = model.getLineContent(position.lineNumber);
  const word = model.getWordUntilPosition(position);
  let startColumn = word.startColumn;
  const textBeforeWord = lineText.slice(0, startColumn - 1);
  // Member access (obj.x, ptr->x, std::x) needs type information we do not have.
  if (/(?:\.|->|::)\s*$/.test(textBeforeWord)) return undefined;

  const hasDollarPrefix = textBeforeWord.endsWith('$');
  if (hasDollarPrefix) startColumn -= 1;
  const currentWord = `${hasDollarPrefix ? '$' : ''}${model.getWordAtPosition(position)?.word || word.word || ''}`;

  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn,
    endColumn: word.endColumn,
  };

  const suggestions = [];
  for (const identifier of getModelIdentifiers(model)) {
    // The word being typed is usually its own (partial) declaration.
    if (identifier.name === currentWord) continue;
    suggestions.push({
      label: identifier.name,
      kind: completionKind(monaco, identifier.kind),
      detail: KIND_DETAILS[identifier.kind] || KIND_DETAILS.variable,
      insertText: identifier.name,
      filterText: identifier.name,
      sortText: `0${identifier.name.toLowerCase()}`,
      range,
    });
  }
  return { suggestions, incomplete: false };
}

function registerProviders(monaco) {
  registry.monaco = monaco;
  registry.disposables = IDENTIFIER_COMPLETION_LANGUAGES.map((languageId) => (
    monaco.languages.registerCompletionItemProvider(languageId, {
      _debugDisplayName: 'peerprepDeclaredIdentifiers',
      provideCompletionItems: (model, position) => provideIdentifierCompletions(monaco, model, position),
    })
  ));
}

function disposeProviders() {
  registry.disposables.forEach((disposable) => disposable?.dispose?.());
  registry.disposables = [];
  registry.monaco = null;
  registry.cache = new WeakMap();
}

/**
 * Enables declared-identifier completions for Monaco editors rendered inside
 * `scopeElement`. Returns a release function; the providers are disposed when
 * the last editor releases them.
 */
export function acquireIdentifierCompletions(monaco, scopeElement) {
  if (!monaco?.languages?.registerCompletionItemProvider || !scopeElement) return () => {};
  if (registry.holders.size > 0 && registry.monaco !== monaco) disposeProviders();
  if (registry.disposables.length === 0) registerProviders(monaco);

  const holder = { element: scopeElement };
  registry.holders.add(holder);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    registry.holders.delete(holder);
    if (registry.holders.size === 0) disposeProviders();
  };
}

export function getIdentifierCompletionState() {
  return { providers: registry.disposables.length, holders: registry.holders.size };
}
