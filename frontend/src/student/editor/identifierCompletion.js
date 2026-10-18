import {
  extractDeclaredIdentifiers,
  IDENTIFIER_COMPLETION_LANGUAGES,
} from './identifierExtraction.js';
import { getLanguageVocabulary } from './languageVocabulary.js';

// One completion provider per language is shared by every mounted student code
// editor. Monaco providers are global, so the provider only answers for models
// shown inside a registered editor container; other Monaco editors in the app
// (admin harness, SQL schema, ...) keep Monaco's default behaviour.
//
// Monaco asks provider groups in order of selector score and stops at the first
// group that returns items, so a language-specific provider hides the built-in
// word-based list. This provider therefore returns everything a student needs in
// one list, best first: names they declared (with their type or signature),
// library names, keywords, then any other word already in the file. After `.`,
// `->` or `::` it offers member names instead.

const registry = {
  monaco: null,
  disposables: [],
  holders: new Set(),
  cache: new WeakMap(),
};

const MAX_DOCUMENT_WORDS = 400;

const KIND_DESCRIPTIONS = {
  function: 'function',
  variable: 'variable',
  class: 'type',
  module: 'import',
};

// Sort groups: lower sorts first when Monaco's fuzzy scores tie.
const RANK = {
  declared: '0',
  usedMember: '1',
  member: '2',
  library: '3',
  keyword: '4',
  word: '5',
};

function completionKind(monaco, kind) {
  const kinds = monaco.languages.CompletionItemKind || {};
  switch (kind) {
    case 'function': return kinds.Function;
    case 'class': return kinds.Class;
    case 'module': return kinds.Module;
    case 'method': return kinds.Method ?? kinds.Function;
    case 'field': return kinds.Field ?? kinds.Variable;
    case 'keyword': return kinds.Keyword ?? kinds.Text;
    case 'library': return kinds.Reference ?? kinds.Module;
    case 'word': return kinds.Text ?? kinds.Variable;
    default: return kinds.Variable;
  }
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

function collectDocumentWords(text) {
  const wordsInFile = new Set();
  for (const match of text.matchAll(/[A-Za-z_$][\w$]{2,}/g)) {
    wordsInFile.add(match[0]);
    if (wordsInFile.size >= MAX_DOCUMENT_WORDS) break;
  }
  return wordsInFile;
}

// Names written after `.`/`->` anywhere in the file, and `self.x =` / `this.x =` fields.
function collectUsedMembers(text) {
  const members = new Map();
  for (const match of text.matchAll(/\b(?:self|this)\s*(?:\.|->)\s*([A-Za-z_]\w*)\s*=(?!=)/g)) {
    members.set(match[1], 'field');
  }
  for (const match of text.matchAll(/(?:\.|->)\s*([A-Za-z_]\w*)/g)) {
    if (!members.has(match[1])) members.set(match[1], 'method');
    if (members.size >= MAX_DOCUMENT_WORDS) break;
  }
  return members;
}

// Analysis runs at most once per model version, however often Monaco asks.
function getModelAnalysis(model) {
  const languageId = model.getLanguageId();
  const key = `${model.getVersionId()}:${languageId}`;
  const cached = registry.cache.get(model);
  if (cached?.key === key) return cached;
  const text = model.getValue();
  const analysis = {
    key,
    identifiers: extractDeclaredIdentifiers(text, languageId),
    documentWords: collectDocumentWords(text),
    usedMembers: collectUsedMembers(text),
  };
  registry.cache.set(model, analysis);
  return analysis;
}

function createSuggestionList(monaco, range, currentWord) {
  const suggestions = [];
  const seen = new Set();
  return {
    suggestions,
    has: (name) => seen.has(name),
    add(name, kind, rank, description = '', detail = '') {
      // The word being typed is usually its own (partial) declaration.
      if (!name || name === currentWord || seen.has(name)) return;
      seen.add(name);
      suggestions.push({
        label: description ? { label: name, description } : name,
        kind: completionKind(monaco, kind),
        detail: detail || description || undefined,
        insertText: name,
        filterText: name,
        sortText: `${rank}${name.toLowerCase()}`,
        range,
      });
    },
  };
}

const TRIGGER_CHARACTER = 1; // monaco.languages.CompletionTriggerKind.TriggerCharacter
const NO_SUGGESTIONS = { suggestions: [], incomplete: false };

export function provideIdentifierCompletions(monaco, model, position, context) {
  if (!isInsideRegisteredEditor(monaco, model)) return undefined;

  const lineText = model.getLineContent(position.lineNumber);
  const word = model.getWordUntilPosition(position);
  let startColumn = word.startColumn;
  const textBeforeWord = lineText.slice(0, startColumn - 1);
  const accessor = /(\.|->|::)\s*$/.exec(textBeforeWord)?.[1] || '';
  // `>` and `:` only open the list for `->` and `::`, never for `a > b` or `def f():`;
  // a dot after a digit is a decimal point.
  if (context?.triggerKind === TRIGGER_CHARACTER && !accessor) return NO_SUGGESTIONS;
  if (accessor === '.' && /\d\.\s*$/.test(textBeforeWord)) return NO_SUGGESTIONS;

  const hasDollarPrefix = !accessor && textBeforeWord.endsWith('$');
  if (hasDollarPrefix) startColumn -= 1;
  const currentWord = `${hasDollarPrefix ? '$' : ''}${model.getWordAtPosition(position)?.word || word.word || ''}`;
  // A bare number (`arr[1`) is not the start of a name.
  if (/^\d/.test(currentWord)) return NO_SUGGESTIONS;

  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn,
    endColumn: word.endColumn,
  };
  const languageId = model.getLanguageId();
  const vocabulary = getLanguageVocabulary(languageId);
  const { identifiers, documentWords, usedMembers } = getModelAnalysis(model);
  const list = createSuggestionList(monaco, range, currentWord);

  if (accessor === '::') {
    // C++ scope access: std::sort, MyClass::helper.
    identifiers.filter((item) => item.kind === 'class' || item.kind === 'function')
      .forEach((item) => list.add(item.name, item.kind, RANK.declared, KIND_DESCRIPTIONS[item.kind], item.detail));
    vocabulary.library.forEach((name) => list.add(name, 'library', RANK.library, 'std'));
    return { suggestions: list.suggestions, incomplete: false };
  }

  if (accessor) {
    // Member access: names already used after a dot in this file, then the
    // usual container/string methods, then the student's own functions (methods).
    usedMembers.forEach((kind, name) => list.add(name, kind, RANK.usedMember, kind === 'field' ? 'field' : 'member'));
    vocabulary.members.forEach((name) => list.add(name, 'method', RANK.member, 'method'));
    identifiers.filter((item) => item.kind === 'function')
      .forEach((item) => list.add(item.name, 'method', RANK.declared, 'function', item.detail));
    return { suggestions: list.suggestions, incomplete: false };
  }

  for (const identifier of identifiers) {
    const description = identifier.detail && identifier.kind !== 'function'
      ? identifier.detail
      : KIND_DESCRIPTIONS[identifier.kind] || KIND_DESCRIPTIONS.variable;
    list.add(identifier.name, identifier.kind, RANK.declared, description, identifier.detail);
  }
  vocabulary.library.forEach((name) => list.add(name, 'library', RANK.library, 'library'));
  vocabulary.keywords.forEach((name) => list.add(name, 'keyword', RANK.keyword, 'keyword'));
  documentWords.forEach((name) => {
    if (!usedMembers.has(name)) list.add(name, 'word', RANK.word);
  });
  return { suggestions: list.suggestions, incomplete: false };
}

function registerProviders(monaco) {
  registry.monaco = monaco;
  registry.disposables = IDENTIFIER_COMPLETION_LANGUAGES.map((languageId) => (
    monaco.languages.registerCompletionItemProvider(languageId, {
      _debugDisplayName: 'peerprepDeclaredIdentifiers',
      triggerCharacters: ['.', '>', ':'],
      provideCompletionItems: (model, position, context) => provideIdentifierCompletions(monaco, model, position, context),
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
