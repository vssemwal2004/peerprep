// Finds the names a student declared in their own code (functions, variables,
// parameters, classes) with cheap per-language regexes. It is deliberately not a
// parser: a rare false positive is still a word that exists in the code, and the
// whole scan must stay fast enough to run on every completion request.

export const MAX_IDENTIFIER_SUGGESTIONS = 200;
const MAX_SCAN_CHARS = 200_000;
const MAX_DECLARATOR_SCAN = 600;
const MAX_BALANCED_SCAN = 2000;

const LANGUAGE_FAMILIES = {
  c: 'clike',
  cpp: 'clike',
  java: 'clike',
  csharp: 'clike',
  javascript: 'js',
  typescript: 'js',
  python: 'python',
  go: 'go',
  kotlin: 'kotlin',
  rust: 'rust',
  swift: 'swift',
  php: 'php',
  ruby: 'ruby',
};

export const IDENTIFIER_COMPLETION_LANGUAGES = Object.keys(LANGUAGE_FAMILIES);

// Keywords and primitive type names are never suggested. They are kept per
// language so a valid name in one language (`double` in JavaScript, `union` in
// a Python union-find) is not hidden because it is reserved in another.
const words = (text) => text.split(/\s+/).filter(Boolean);
const CORE_KEYWORDS = words(`
if else for while do switch case default break continue return try catch finally throw new this self
super null nullptr NULL nil None true false True False undefined import export class in is as
`);
const FAMILY_KEYWORDS = {
  clike: `int long short char float double bool boolean byte void signed unsigned auto const static
    public private protected struct enum union typedef template typename namespace using virtual override
    final abstract extern inline register volatile mutable explicit friend operator constexpr noexcept
    decltype sizeof goto interface extends implements throws synchronized transient native instanceof
    foreach var string sbyte ushort uint ulong delegate unsafe readonly char16_t char32_t wchar_t`,
  js: `const let var function async await yield typeof instanceof delete void with extends implements
    interface enum static public private protected readonly abstract declare`,
  python: 'def lambda pass raise elif except global nonlocal del assert async await yield with from and or not',
  go: `func var const package defer go chan map struct interface range type select fallthrough goto int
    int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 string bool byte rune
    error complex64 complex128`,
  kotlin: 'fun val var when object companion data sealed lateinit suspend vararg override open internal inline typealias',
  rust: `fn let mut pub impl trait struct enum use mod crate dyn match loop ref move where type unsafe
    extern const static i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 str bool char Self`,
  swift: 'func let var guard inout struct protocol extension deinit init subscript fileprivate internal open where repeat static',
  php: 'function echo print public private protected static fn',
  ruby: 'def end do then unless until elsif begin rescue ensure module yield redo retry alias undef',
};
const KEYWORDS_BY_FAMILY = Object.fromEntries(
  Object.entries(FAMILY_KEYWORDS).map(([family, list]) => [family, new Set([...CORE_KEYWORDS, ...words(list)])]),
);

// Words that can sit in the "type" slot of `TYPE NAME` without declaring NAME.
const NON_TYPE_PREFIXES = new Set([
  'return', 'new', 'delete', 'throw', 'case', 'goto', 'else', 'do', 'using', 'namespace', 'import',
  'package', 'sizeof', 'co_return', 'co_yield', 'yield', 'await', 'in', 'is', 'as', 'throws',
  'extends', 'implements', 'instanceof', 'operator', 'template', 'typename', 'class', 'struct',
  'enum', 'union', 'interface', 'record', 'typedef', 'goto', 'not', 'and', 'or', 'echo', 'print',
]);

const KIND_PRIORITY = { function: 3, class: 2, module: 1, variable: 0 };

const COMMENT_STRING_PATTERNS = {
  clike: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'/g,
  js: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`/g,
  go: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|`[^`]*`/g,
  kotlin: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'/g,
  swift: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|"(?:\\[\s\S]|[^"\\\n])*"/g,
  // Rust lifetimes ('a) are not char literals, so only single-character literals are removed.
  rust: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[^'\n]{1,10}|[^'\\\n])'/g,
  python: /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'/g,
  php: /\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
  ruby: /#[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
};

function blankCommentOrString(match) {
  const first = match[0];
  const isString = first === '"' || first === "'" || first === '`';
  // Keep line breaks so line-anchored patterns still see the original lines.
  const newlines = match.includes('\n') ? match.replace(/[^\n]/g, '') : '';
  return (isString ? '""' : ' ') + newlines;
}

export function stripCommentsAndStrings(source, family) {
  const pattern = COMMENT_STRING_PATTERNS[family];
  if (!pattern) return source;
  return source.replace(pattern, blankCommentOrString);
}

const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

// Returns the text inside the bracket that opens at `openIndex`, or null.
function readBalanced(code, openIndex) {
  if (!OPENERS[code[openIndex]]) return null;
  let depth = 0;
  const limit = Math.min(code.length, openIndex + MAX_BALANCED_SCAN);
  for (let index = openIndex; index < limit; index += 1) {
    const char = code[index];
    if (OPENERS[char]) depth += 1;
    else if (CLOSERS.has(char)) {
      depth -= 1;
      if (depth === 0) return { inner: code.slice(openIndex + 1, index), end: index };
    }
  }
  return null;
}

function splitTopLevel(text, separator = ',') {
  const pieces = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (OPENERS[char]) depth += 1;
    else if (CLOSERS.has(char)) depth = Math.max(0, depth - 1);
    else if (char === separator && depth === 0) {
      pieces.push(text.slice(start, index));
      start = index + 1;
    }
  }
  pieces.push(text.slice(start));
  return pieces;
}

// Reads comma-separated declarators that follow a declaration keyword, stopping
// at `;`, at a closing bracket that ends the enclosing list, or (optionally) at
// a newline outside brackets.
function readDeclaratorPieces(code, start, stopAtNewline) {
  const pieces = [];
  let depth = 0;
  let pieceStart = start;
  const limit = Math.min(code.length, start + MAX_DECLARATOR_SCAN);
  let index = start;
  for (; index < limit; index += 1) {
    const char = code[index];
    if (OPENERS[char]) depth += 1;
    else if (CLOSERS.has(char)) {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0) {
      if (char === ';' || (stopAtNewline && char === '\n')) break;
      if (char === ',') {
        pieces.push(code.slice(pieceStart, index));
        pieceStart = index + 1;
      }
    }
  }
  pieces.push(code.slice(pieceStart, index));
  return pieces;
}

function leadingIdentifier(text, pattern = /^[\s*&.]*([A-Za-z_$][\w$]*)/) {
  return pattern.exec(text)?.[1] || '';
}

function identifiersIn(text) {
  return text.match(/[A-Za-z_$][\w$]*/g) || [];
}

// `{ a, b: alias, c = 1, ...rest }` / `[x, , y]` -> a, alias, c, rest / x, y
function destructuredNames(pattern) {
  const cleaned = pattern
    .replace(/[A-Za-z_$][\w$]*\s*:(?!:)/g, ' ')
    .replace(/=[^,}\]]*/g, ' ');
  return identifiersIn(cleaned);
}

function createCollector(limit, keywords) {
  const found = new Map();
  return {
    isKeyword: (name) => keywords.has(name),
    add(name, kind = 'variable') {
      if (!name || name === '_' || name.length > 64 || keywords.has(name)) return;
      if (!/^\$?[A-Za-z_][\w$]*[?!]?$/.test(name)) return;
      const existing = found.get(name);
      if (existing) {
        if (KIND_PRIORITY[kind] > KIND_PRIORITY[existing]) found.set(name, kind);
        return;
      }
      if (found.size >= limit) return;
      found.set(name, kind);
    },
    get full() {
      return found.size >= limit;
    },
    result() {
      return [...found.entries()].map(([name, kind]) => ({ name, kind }));
    },
  };
}

function eachMatch(code, pattern, callback, collector) {
  pattern.lastIndex = 0;
  for (const match of code.matchAll(pattern)) {
    if (collector.full) return;
    callback(match);
  }
}

// ---------------------------------------------------------------- C, C++, Java, C#

const CLIKE_TYPE = String.raw`[A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*(?:\s*<[\w\s,:<>*&\[\]]{0,80}>)?(?:\s*\[\s*\])*`;
const CLIKE_DECLARATION = new RegExp(
  String.raw`\b(${CLIKE_TYPE})(\s*[*&]+\s*|\s+)([A-Za-z_]\w*)\b\s*(\(|=(?!=)|;|,|\[|\{|\)|:(?!:)|in\b)`,
  'g',
);
const CLIKE_FUNCTION_BODY = /^\s*(?:const\s*|noexcept\s*|override\s*|final\s*|throws\s+[\w\s,.]+?)*(?:->\s*[\w:<>,\s*&]+)?\{/;
const CLIKE_PARAMETER = /^\s*(?:const\s+|final\s+)?[A-Za-z_][\w:<>,\s*&[\]]*?[\s*&]+[A-Za-z_]\w*\s*(?:\[\s*\])*\s*(?:=[\s\S]*)?$/;
const CLIKE_EXTRA_DECLARATOR = /^\s*[*&]*\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*(?:=[\s\S]*|\([\s\S]*\)|\{[\s\S]*\})?\s*$/;

function looksLikeFunctionDeclaration(code, typeName, openIndex) {
  const params = readBalanced(code, openIndex);
  if (!params) return false;
  const after = code.slice(params.end + 1, params.end + 120);
  if (CLIKE_FUNCTION_BODY.test(after)) return true;
  if (typeName === 'void') return true;
  const inner = params.inner.trim();
  // `int solve();` is a prototype; `vector<int> v(n);` constructs a variable.
  if (!inner || inner === 'void') return /^\s*;/.test(after);
  return splitTopLevel(inner).every((piece) => CLIKE_PARAMETER.test(piece));
}

function extractClike(code, collector) {
  eachMatch(code, /^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)(\()?/gm, (match) => {
    collector.add(match[1], match[2] ? 'function' : 'variable');
  }, collector);
  const body = code.replace(/^[ \t]*#[^\n]*/gm, ' ');

  eachMatch(body, /\b(?:class|struct|enum|interface|record|union)\s+(?:class\s+|struct\s+)?([A-Za-z_]\w*)/g, (match) => {
    collector.add(match[1], 'class');
  }, collector);
  eachMatch(body, /\busing\s+([A-Za-z_]\w*)\s*=/g, (match) => collector.add(match[1], 'class'), collector);

  CLIKE_DECLARATION.lastIndex = 0;
  let match;
  while (!collector.full && (match = CLIKE_DECLARATION.exec(body))) {
    const typeName = match[1].trim();
    const name = match[3];
    if (NON_TYPE_PREFIXES.has(typeName) || collector.isKeyword(name)) {
      // `static int[] memo`, `return new Node(`: the rejected name may itself be
      // the type of the real declaration, so resume scanning from it.
      CLIKE_DECLARATION.lastIndex = match.index + match[1].length;
      continue;
    }
    const terminator = match[4];
    const terminatorIndex = match.index + match[0].length - terminator.length;

    if (terminator === '(') {
      collector.add(name, looksLikeFunctionDeclaration(body, typeName, terminatorIndex) ? 'function' : 'variable');
      continue;
    }
    const isLambda = terminator === '=' && /^\s*\[[^\]]*\]\s*\(/.test(body.slice(terminatorIndex + 1, terminatorIndex + 80));
    collector.add(name, isLambda ? 'function' : 'variable');

    if (terminator === ',' || terminator === '=') {
      const pieces = readDeclaratorPieces(body, terminatorIndex + 1, false);
      // After `=` the first piece is this declarator's own initializer.
      for (const piece of terminator === '=' ? pieces.slice(1) : pieces) {
        collector.add(CLIKE_EXTRA_DECLARATOR.exec(piece)?.[1]);
      }
    }
  }

  // C++17 structured bindings: auto& [key, value] = ...
  eachMatch(body, /\bauto\s*[&*]{0,2}\s*\[([^\]]+)\]/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
}

// ---------------------------------------------------------------- JavaScript, TypeScript

const JS_ARROW_OR_FUNCTION_VALUE = /^\s*(?:async\s+)?(?:function\b|[A-Za-z_$][\w$]*\s*=>|\([^()]*\)\s*(?::\s*[^=]+)?=>)/;
const JS_MODIFIERS = /^(?:\s*(?:\.\.\.|public\s+|private\s+|protected\s+|readonly\s+|override\s+|@[\w$.]+\s+))*/;

function addJsParameters(paramText, collector) {
  for (const piece of splitTopLevel(paramText)) {
    const trimmed = piece.replace(JS_MODIFIERS, '').trim();
    if (!trimmed) continue;
    if (trimmed[0] === '{' || trimmed[0] === '[') {
      const pattern = readBalanced(trimmed, 0);
      destructuredNames(pattern ? pattern.inner : trimmed).forEach((name) => collector.add(name));
      continue;
    }
    collector.add(leadingIdentifier(trimmed));
  }
}

function addJsDeclarator(piece, collector) {
  const trimmed = piece.trim();
  if (!trimmed) return;
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    const pattern = readBalanced(trimmed, 0);
    destructuredNames(pattern ? pattern.inner : trimmed).forEach((name) => collector.add(name));
    return;
  }
  const name = leadingIdentifier(trimmed);
  const assignment = /^[A-Za-z_$][\w$]*\s*(?::[^=]*)?=(?![=>])/.exec(trimmed);
  const value = assignment ? trimmed.slice(assignment[0].length) : '';
  collector.add(name, value && JS_ARROW_OR_FUNCTION_VALUE.test(value) ? 'function' : 'variable');
}

function extractJs(code, collector) {
  eachMatch(code, /\b(?:class|interface|enum|type)\s+([A-Za-z_$][\w$]*)/g, (match) => {
    collector.add(match[1], 'class');
  }, collector);

  eachMatch(code, /\bfunction\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*(?:<[^>()]*>)?\s*\(/g, (match) => {
    if (match[1]) collector.add(match[1], 'function');
    const params = readBalanced(code, match.index + match[0].length - 1);
    if (params) addJsParameters(params.inner, collector);
  }, collector);

  eachMatch(code, /\b(?:const|let|var)\s+/g, (match) => {
    readDeclaratorPieces(code, match.index + match[0].length, true)
      .forEach((piece) => addJsDeclarator(piece, collector));
  }, collector);

  // Class methods: `name(params) {`, `async name(...)`, `static get name()`.
  eachMatch(code, /^[ \t]*(?:(?:static|async|get|set|public|private|protected|readonly|override|abstract)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\(/gm, (match) => {
    const params = readBalanced(code, match.index + match[0].length - 1);
    if (!params) return;
    if (!/^\s*(?::\s*[^{;\n]+)?\{/.test(code.slice(params.end + 1, params.end + 120))) return;
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with'].includes(match[1])) return;
    collector.add(match[1], 'function');
    addJsParameters(params.inner, collector);
  }, collector);

  // Arrow function parameters: `(a, b) =>` and `x =>`.
  eachMatch(code, /(?:\(([^()]*)\)|\b([A-Za-z_$][\w$]*))\s*(?::\s*[^=;{()]+)?=>/g, (match) => {
    if (match[2]) collector.add(match[2]);
    else addJsParameters(match[1], collector);
  }, collector);

  eachMatch(code, /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g, (match) => collector.add(match[1]), collector);
}

// ---------------------------------------------------------------- Python

function addPythonParameters(paramText, collector) {
  for (const piece of splitTopLevel(paramText)) {
    const name = leadingIdentifier(piece, /^\s*\*{0,2}\s*([A-Za-z_]\w*)/);
    if (name !== 'self' && name !== 'cls') collector.add(name);
  }
}

function extractPython(code, collector) {
  eachMatch(code, /^[ \t]*(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/gm, (match) => {
    collector.add(match[1], 'function');
    const params = readBalanced(code, match.index + match[0].length - 1);
    if (params) addPythonParameters(params.inner, collector);
  }, collector);

  eachMatch(code, /^[ \t]*class[ \t]+([A-Za-z_]\w*)/gm, (match) => collector.add(match[1], 'class'), collector);

  // a = ..., a, b = ..., x: int = ..., first, *rest = ...
  eachMatch(code, /^[ \t]*(\*?[A-Za-z_]\w*(?:[ \t]*,[ \t]*\*?[A-Za-z_]\w*)*)[ \t]*,?[ \t]*(?::[^=\n]+)?=(?!=)/gm, (match) => {
    const isLambda = /^\s*lambda\b/.test(code.slice(match.index + match[0].length, match.index + match[0].length + 40));
    const names = identifiersIn(match[1]);
    names.forEach((name) => collector.add(name, isLambda && names.length === 1 ? 'function' : 'variable'));
  }, collector);

  eachMatch(code, /\bfor[ \t]+([A-Za-z_][\w \t,()*]*?)[ \t]+in\b/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);

  eachMatch(code, /\bas[ \t]+([A-Za-z_]\w*)/g, (match) => collector.add(match[1]), collector);
  eachMatch(code, /([A-Za-z_]\w*)[ \t]*:=/g, (match) => collector.add(match[1]), collector);
  eachMatch(code, /\blambda\b([^:\n]*):/g, (match) => addPythonParameters(match[1], collector), collector);

  // Imported modules and names are bound by the student's own code too.
  eachMatch(code, /^[ \t]*import[ \t]+([^\n]+)/gm, (match) => {
    splitTopLevel(match[1]).forEach((piece) => {
      if (!/\bas\b/.test(piece)) collector.add(leadingIdentifier(piece), 'module');
    });
  }, collector);
  eachMatch(code, /^[ \t]*from[ \t]+[\w.]+[ \t]+import[ \t]+\(?([^\n)]+)/gm, (match) => {
    splitTopLevel(match[1]).forEach((piece) => {
      if (!/\bas\b/.test(piece) && piece.trim() !== '*') collector.add(leadingIdentifier(piece), 'module');
    });
  }, collector);
}

// ---------------------------------------------------------------- Go

function extractGo(code, collector) {
  eachMatch(code, /\bfunc\s*(?:\(([^)]*)\)\s*)?([A-Za-z_]\w*)?\s*(?:\[[^\]]*\])?\s*\(/g, (match) => {
    if (match[1]) collector.add(leadingIdentifier(match[1]));
    if (match[2]) collector.add(match[2], 'function');
    const params = readBalanced(code, match.index + match[0].length - 1);
    if (params) splitTopLevel(params.inner).forEach((piece) => collector.add(leadingIdentifier(piece)));
  }, collector);

  eachMatch(code, /\b(?:var|const)\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*:=/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /\btype\s+([A-Za-z_]\w*)/g, (match) => collector.add(match[1], 'class'), collector);
}

// ---------------------------------------------------------------- Kotlin, Swift, Rust

function addTypedParameters(code, openIndex, collector) {
  const params = readBalanced(code, openIndex);
  if (!params) return;
  for (const piece of splitTopLevel(params.inner)) {
    // Kotlin `vararg x: Int`, Swift `_ label name: Int`, Rust `mut x: i32`: the name sits before `:`.
    const name = /([A-Za-z_]\w*)\s*:(?!:)/.exec(piece)?.[1];
    collector.add(name);
  }
}

function extractKotlin(code, collector) {
  eachMatch(code, /\bfun\s+(?:<[^>]*>\s*)?(?:[A-Za-z_][\w.]*\.)?([A-Za-z_]\w*)\s*\(/g, (match) => {
    collector.add(match[1], 'function');
    addTypedParameters(code, match.index + match[0].length - 1, collector);
  }, collector);
  eachMatch(code, /\b(?:class|object|interface)\s+([A-Za-z_]\w*)/g, (match) => collector.add(match[1], 'class'), collector);
  eachMatch(code, /\b(?:val|var)\s+(?:([A-Za-z_]\w*)|\(([^)]*)\))/g, (match) => {
    if (match[1]) {
      const isLambda = /^\s*(?::[^=\n]*)?=\s*\{\s*[\w\s,:]*->/.test(code.slice(match.index + match[0].length, match.index + match[0].length + 80));
      collector.add(match[1], isLambda ? 'function' : 'variable');
    } else identifiersIn(match[2]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /\bfor\s*\(\s*(\([^)]*\)|[A-Za-z_]\w*)\s+in\b/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /\{\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*->/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
}

function extractSwift(code, collector) {
  eachMatch(code, /\bfunc\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/g, (match) => {
    collector.add(match[1], 'function');
    addTypedParameters(code, match.index + match[0].length - 1, collector);
  }, collector);
  eachMatch(code, /\b(?:class|struct|enum|protocol)\s+([A-Za-z_]\w*)/g, (match) => collector.add(match[1], 'class'), collector);
  eachMatch(code, /\b(?:let|var)\s+(?:([A-Za-z_]\w*)|\(([^)]*)\))/g, (match) => {
    if (match[1]) collector.add(match[1]);
    else identifiersIn(match[2]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /\bfor\s+(\([^)]*\)|[A-Za-z_]\w*)\s+in\b/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
}

function extractRust(code, collector) {
  eachMatch(code, /\bfn\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/g, (match) => {
    collector.add(match[1], 'function');
    addTypedParameters(code, match.index + match[0].length - 1, collector);
  }, collector);
  eachMatch(code, /\b(?:struct|enum|trait|type)\s+([A-Za-z_]\w*)/g, (match) => collector.add(match[1], 'class'), collector);
  eachMatch(code, /\blet\s+(?:mut\s+)?(?:([A-Za-z_]\w*)|\(([^)]*)\))/g, (match) => {
    if (match[1]) {
      const isClosure = /^\s*(?::[^=\n]*)?=\s*(?:move\s*)?\|/.test(code.slice(match.index + match[0].length, match.index + match[0].length + 60));
      collector.add(match[1], isClosure ? 'function' : 'variable');
    } else identifiersIn(match[2]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /\bfor\s+(\([^)]*\)|[A-Za-z_]\w*)\s+in\b/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
  // Closure parameters: |a, b| or |&x: &i32|
  eachMatch(code, /\|([^|\n]+)\|/g, (match) => {
    splitTopLevel(match[1]).forEach((piece) => collector.add(leadingIdentifier(piece.replace(/\bmut\s+/, ''))));
  }, collector);
}

// ---------------------------------------------------------------- PHP, Ruby

function extractPhp(code, collector) {
  eachMatch(code, /\bfunction\s+&?\s*([A-Za-z_]\w*)\s*\(/g, (match) => collector.add(match[1], 'function'), collector);
  eachMatch(code, /\b(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/g, (match) => collector.add(match[1], 'class'), collector);
  eachMatch(code, /\$([A-Za-z_]\w*)/g, (match) => {
    if (match[1] !== 'this') collector.add(`$${match[1]}`);
  }, collector);
}

function extractRuby(code, collector) {
  eachMatch(code, /\bdef\s+(?:self\.)?([A-Za-z_]\w*[?!]?)\s*(\()?([^\n)]*)/g, (match) => {
    collector.add(match[1], 'function');
    splitTopLevel(match[3]).forEach((piece) => collector.add(leadingIdentifier(piece, /^\s*[*&]{0,2}([A-Za-z_]\w*)/)));
  }, collector);
  eachMatch(code, /\b(?:class|module)\s+([A-Z]\w*)/g, (match) => collector.add(match[1], 'class'), collector);
  eachMatch(code, /^[ \t]*([a-z_]\w*(?:[ \t]*,[ \t]*[a-z_]\w*)*)[ \t]*(?:\|\||&&|[+\-*/])?=(?![=~>])/gm, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /\|([^|\n]+)\|/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
  eachMatch(code, /\bfor\s+([\w\s,]+?)\s+in\b/g, (match) => {
    identifiersIn(match[1]).forEach((name) => collector.add(name));
  }, collector);
}

const EXTRACTORS = {
  clike: extractClike,
  js: extractJs,
  python: extractPython,
  go: extractGo,
  kotlin: extractKotlin,
  swift: extractSwift,
  rust: extractRust,
  php: extractPhp,
  ruby: extractRuby,
};

export function supportsIdentifierCompletion(languageId) {
  return Object.hasOwn(LANGUAGE_FAMILIES, String(languageId || ''));
}

/**
 * Lists the functions, variables, parameters and classes declared in `source`.
 * Returns `[{ name, kind }]` in order of first appearance, where kind is one of
 * 'function' | 'variable' | 'class' | 'module'. Comments and strings are ignored.
 */
export function extractDeclaredIdentifiers(source, languageId, { limit = MAX_IDENTIFIER_SUGGESTIONS } = {}) {
  const family = LANGUAGE_FAMILIES[String(languageId || '')];
  if (!family) return [];
  const text = String(source ?? '').slice(0, MAX_SCAN_CHARS);
  if (!text.trim()) return [];
  const collector = createCollector(limit, KEYWORDS_BY_FAMILY[family]);
  EXTRACTORS[family](stripCommentsAndStrings(text, family), collector);
  return collector.result();
}
