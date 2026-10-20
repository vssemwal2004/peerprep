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
// group that returns items, so a language-specific provider hides the built-in
// word-based list. This provider intentionally returns only variables,
// parameters, and functions declared by the student before the cursor.

const registry = {
  monaco: null,
  disposables: [],
  signatureDisposables: [],
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

function splitParameters(text) {
  const pieces = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if ('([{<'.includes(character)) depth += 1;
    else if (')]}>' .includes(character)) depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      pieces.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) pieces.push(tail);
  return pieces;
}

function parameterName(piece) {
  const source = String(piece || '').split('=')[0].trim();
  if (!source || source === 'void') return '';
  const beforeType = source.includes(':') ? source.slice(0, source.indexOf(':')) : source;
  const names = beforeType.match(/[A-Za-z_$][\w$]*/g) || [];
  const ignored = new Set(['const', 'final', 'mut', 'vararg', 'self', 'this', 'cls', 'void']);
  return [...names].reverse().find((name) => !ignored.has(name)) || '';
}

function functionCallInfo(identifier) {
  if (identifier?.kind !== 'function') return null;
  const name = identifier.name;
  const detail = String(identifier.detail || '');
  const nameIndex = detail.indexOf(name);
  const openIndex = nameIndex >= 0 ? detail.indexOf('(', nameIndex + name.length) : -1;
  if (openIndex < 0) return { snippet: `${name}($0)`, parameters: [], signature: `${name}()` };
  let depth = 0;
  let closeIndex = -1;
  for (let index = openIndex; index < detail.length; index += 1) {
    if (detail[index] === '(') depth += 1;
    if (detail[index] === ')') {
      depth -= 1;
      if (depth === 0) { closeIndex = index; break; }
    }
  }
  const rawParameters = closeIndex > openIndex ? splitParameters(detail.slice(openIndex + 1, closeIndex)) : [];
  const parameters = rawParameters
    .map((label) => ({ label, name: parameterName(label) }))
    .filter((entry) => entry.name && !['self', 'this', 'cls'].includes(entry.name));
  const placeholders = parameters.map((entry, index) => `\${${index + 1}:${entry.name}}`).join(', ');
  return {
    snippet: `${name}(${placeholders})${placeholders ? '$0' : ''}`,
    parameters,
    signature: detail || `${name}(${rawParameters.join(', ')})`,
  };
}

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

  // `editor.getEditors()` is not part of Monaco's public ESM API and is absent
  // in the production bundle. Prefer the explicit model ownership callback
  // supplied by each mounted PeerPrep editor.
  for (const holder of registry.holders) {
    if (holder.ownsModel?.(model)) return true;
  }

  // Keep the DOM check as a compatibility fallback for older integrations.
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

function createSuggestionList(monaco, range) {
  const suggestions = [];
  const seen = new Set();
  return {
    suggestions,
    has: (name) => seen.has(name),
    add(name, kind, rank, description = '', detail = '', options = {}) {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const suggestion = {
        label: description ? { label: name, description } : name,
        kind: completionKind(monaco, kind),
        detail: detail || description || undefined,
        insertText: options.insertText || name,
        filterText: name,
        sortText: `${rank}${name.toLowerCase()}`,
        range,
      };
      if (options.snippet && monaco.languages.CompletionItemInsertTextRule) {
        suggestion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
      }
      suggestions.push(suggestion);
    },
  };
}

function addDeclaredSuggestion(list, identifier) {
  const description = identifier.detail && identifier.kind !== 'function'
    ? identifier.detail
    : KIND_DESCRIPTIONS[identifier.kind] || KIND_DESCRIPTIONS.variable;
  const call = functionCallInfo(identifier);
  list.add(
    identifier.name,
    identifier.kind,
    RANK.declared,
    description,
    identifier.detail,
    call ? { insertText: call.snippet, snippet: true } : {},
  );
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
  const list = createSuggestionList(monaco, range);

  // Member/library completion is deliberately disabled. The student asked for
  // only their own previously declared variables, parameters, and functions.
  if (accessor) return NO_SUGGESTIONS;

  const sourceBeforeCurrentWord = textBeforePosition(model, {
    lineNumber: position.lineNumber,
    column: startColumn,
  });
  const identifiers = extractDeclaredIdentifiers(sourceBeforeCurrentWord, languageId)
    .filter((identifier) => (
      (identifier.kind === 'variable' || identifier.kind === 'function')
      && (!currentWord || identifier.name.toLowerCase().startsWith(currentWord.toLowerCase()))
    ));
  for (const identifier of identifiers) addDeclaredSuggestion(list, identifier);
  return { suggestions: list.suggestions, incomplete: false };
}

function textBeforePosition(model, position) {
  if (typeof model.getOffsetAt === 'function') return model.getValue().slice(0, model.getOffsetAt(position));
  return model.getValue().split('\n').slice(0, position.lineNumber - 1).concat(
    model.getLineContent(position.lineNumber).slice(0, position.column - 1),
  ).join('\n');
}

function activeCall(text) {
  let depth = 0;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const character = text[index];
    if (character === ')') depth += 1;
    else if (character === '(') {
      if (depth > 0) { depth -= 1; continue; }
      const before = text.slice(0, index);
      const name = /([A-Za-z_$][\w$]*)\s*$/.exec(before)?.[1];
      if (!name) return null;
      const argumentText = text.slice(index + 1);
      let activeParameter = 0;
      let argumentDepth = 0;
      for (const argumentCharacter of argumentText) {
        if ('([{<'.includes(argumentCharacter)) argumentDepth += 1;
        else if (')]}>' .includes(argumentCharacter)) argumentDepth = Math.max(0, argumentDepth - 1);
        else if (argumentCharacter === ',' && argumentDepth === 0) activeParameter += 1;
      }
      return { name, activeParameter };
    }
  }
  return null;
}

export function provideIdentifierSignatureHelp(monaco, model, position) {
  if (!isInsideRegisteredEditor(monaco, model)) return undefined;
  const call = activeCall(textBeforePosition(model, position));
  if (!call) return undefined;
  const identifier = getModelAnalysis(model).identifiers.find((item) => item.kind === 'function' && item.name === call.name);
  const info = functionCallInfo(identifier);
  if (!info) return undefined;
  return {
    value: {
      signatures: [{
        label: info.signature,
        documentation: 'Function declared in this solution',
        parameters: info.parameters.map((parameter) => ({ label: parameter.label })),
      }],
      activeSignature: 0,
      activeParameter: Math.min(call.activeParameter, Math.max(0, info.parameters.length - 1)),
    },
    dispose() {},
  };
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
  if (monaco.languages.registerSignatureHelpProvider) {
    registry.signatureDisposables = IDENTIFIER_COMPLETION_LANGUAGES.map((languageId) => (
      monaco.languages.registerSignatureHelpProvider(languageId, {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp: (model, position) => provideIdentifierSignatureHelp(monaco, model, position),
      })
    ));
  }
}

function disposeProviders() {
  registry.disposables.forEach((disposable) => disposable?.dispose?.());
  registry.signatureDisposables.forEach((disposable) => disposable?.dispose?.());
  registry.disposables = [];
  registry.signatureDisposables = [];
  registry.monaco = null;
  registry.cache = new WeakMap();
}

/**
 * Enables declared-identifier completions for Monaco editors rendered inside
 * `scopeElement`. Returns a release function; the providers are disposed when
 * the last editor releases them.
 */
export function acquireIdentifierCompletions(monaco, scopeElement, ownsModel) {
  if (!monaco?.languages?.registerCompletionItemProvider || !scopeElement) return () => {};
  if (registry.holders.size > 0 && registry.monaco !== monaco) disposeProviders();
  if (registry.disposables.length === 0) registerProviders(monaco);

  const holder = { element: scopeElement, ownsModel };
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
