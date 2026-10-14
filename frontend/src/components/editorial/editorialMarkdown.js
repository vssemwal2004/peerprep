// Pure helpers for the editorial renderer (format contract "md-v2", also used for
// legacy editorials). Everything here operates on markdown text or on hast trees and
// has no React dependency, so it can be unit tested in isolation.
import { defaultSchema } from 'rehype-sanitize';

// Implementation tab order: the six judged languages, then the SQL reference (SQL problems).
export const EDITORIAL_LANGUAGE_ORDER = ['cpp', 'java', 'python', 'javascript', 'typescript', 'c', 'sql'];
export const EDITORIAL_LANGUAGE_STORAGE_KEY = 'peerprep:editorial:language';

const LANGUAGE_ALIASES = {
  'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  h: 'c',
  py: 'python', py3: 'python', python3: 'python',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  sqlite: 'sql', mysql: 'sql', postgresql: 'sql', postgres: 'sql',
  txt: 'text', plaintext: 'text', plain: 'text',
  sh: 'bash', shell: 'bash', zsh: 'bash',
};

const LANGUAGE_LABELS = {
  cpp: 'C++', java: 'Java', python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', c: 'C',
  sql: 'SQL', text: 'Text', bash: 'Shell', csharp: 'C#', go: 'Go', rust: 'Rust', kotlin: 'Kotlin',
};

export function normalizeCodeLanguage(value) {
  const key = String(value || '').trim().toLowerCase();
  return LANGUAGE_ALIASES[key] || key;
}

export function languageLabel(language) {
  const key = normalizeCodeLanguage(language);
  if (!key) return 'Code';
  return LANGUAGE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

// Implementation tabs: the six judged languages in a fixed order, then anything else.
export function buildImplementationBlocks(solutions) {
  if (!solutions || typeof solutions !== 'object') return [];
  const entries = Object.entries(solutions)
    .map(([language, code]) => [normalizeCodeLanguage(language), typeof code === 'string' ? code.replace(/\s+$/, '') : ''])
    .filter(([language, code]) => language && code.trim());
  const rank = (language) => {
    const index = EDITORIAL_LANGUAGE_ORDER.indexOf(language);
    return index === -1 ? EDITORIAL_LANGUAGE_ORDER.length : index;
  };
  return entries
    .sort((left, right) => rank(left[0]) - rank(right[0]) || left[0].localeCompare(right[0]))
    .map(([lang, code]) => ({ lang, code }));
}

/**
 * Light, line-based cleanup applied before parsing. Only touches text outside fenced
 * code: normalises newlines and unwraps stray `<p>`/`</p>` wrappers that a few legacy
 * editorials contain (they would otherwise turn the whole paragraph into raw HTML).
 * Generic-looking text such as `vector<int>` is never altered.
 */
export function normalizeEditorialMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let fence = null;
  const output = lines.map((line) => {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()) {
        fence = null;
      }
      return line;
    }
    if (fenceMatch && !(fenceMatch[1][0] === '`' && fenceMatch[2].includes('`'))) {
      fence = fenceMatch[1];
      return line;
    }
    return line.replace(/^(\s*)<p>\s*/i, '$1').replace(/\s*<\/p>\s*$/i, '');
  });
  return output.join('\n').trim();
}

/**
 * True when the markdown already carries its own "## Implementation" section (md-v2
 * `inlineImplementation`: DSA problems without validated languages paste the stored
 * reference inline). The renderer must then not append a second one. Headings inside
 * fenced code are ignored.
 */
export function hasImplementationSection(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let fence = null;
  for (const line of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()) fence = null;
      continue;
    }
    if (fenceMatch && !(fenceMatch[1][0] === '`' && fenceMatch[2].includes('`'))) {
      fence = fenceMatch[1];
      continue;
    }
    if (/^ {0,3}#{1,2}[ \t]+implementation[ \t]*#*[ \t]*$/i.test(line)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// remark plugins
// ---------------------------------------------------------------------------

/**
 * `$$ ... $$` written on a single line inside its own paragraph is parsed by
 * remark-math as inline math. Writers mean a display formula, so a paragraph whose only
 * content is one such `$$`-delimited formula is promoted to block (display) math.
 */
export function remarkPromoteDisplayMath() {
  return (tree, file) => {
    const source = String(file?.value ?? '');
    const visit = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        if (child.type !== 'paragraph') {
          visit(child);
          return child;
        }
        const content = child.children.filter((item) => !(item.type === 'text' && !item.value.trim()));
        const only = content.length === 1 ? content[0] : null;
        const start = only?.position?.start?.offset;
        const end = only?.position?.end?.offset;
        if (only?.type !== 'inlineMath' || typeof start !== 'number' || typeof end !== 'number') return child;
        const raw = source.slice(start, end);
        if (!raw.startsWith('$$') || !raw.endsWith('$$')) return child;
        return {
          type: 'math',
          value: only.value,
          position: child.position,
          data: { hName: 'pre', hChildren: [{ type: 'element', tagName: 'code', properties: { className: ['language-math', 'math-display'] }, children: [{ type: 'text', value: only.value }] }] },
        };
      });
    };
    visit(tree);
  };
}

// ---------------------------------------------------------------------------
// URL policy
// ---------------------------------------------------------------------------

/** Only http(s), mailto, in-page anchors and site-relative paths survive. */
export function editorialUrlTransform(value, key) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('#')) return key === 'href' ? url : '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (!protocol) {
    // Relative paths like "images/a.png" have no protocol; reject anything with
    // characters browsers may normalise into a scheme.
    return /^[\w./-][\w./?=&%#-]*$/.test(url) && !/[\s\\]/.test(url) ? url : '';
  }
  const scheme = protocol[1].toLowerCase();
  if (key === 'src') return scheme === 'https' || scheme === 'http' ? url : '';
  return ['http', 'https', 'mailto'].includes(scheme) ? url : '';
}

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

// Sanitise BEFORE KaTeX runs (the order recommended by rehype-katex): untrusted input is
// cleaned first, then KaTeX (trust: false) produces its own markup, so KaTeX classes
// and inline styles never need to be whitelisted for user content.
export const editorialSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-inline', 'math-display']],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

export const KATEX_OPTIONS = {
  throwOnError: false,
  strict: 'ignore',
  trust: false,
  maxSize: 50,
  maxExpand: 500,
  output: 'htmlAndMathml',
};

// ---------------------------------------------------------------------------
// hast utilities
// ---------------------------------------------------------------------------

function isElement(node, tagName) {
  return node?.type === 'element' && (!tagName || node.tagName === tagName);
}

function isWhitespaceText(node) {
  return node?.type === 'text' && !node.value.trim();
}

function classList(node) {
  const value = node?.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

export function hastText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return Array.isArray(node.children) ? node.children.map(hastText).join('') : '';
}

function walk(node, visitor) {
  visitor(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visitor);
  }
}

// Plain-text label for headings: inline TeX becomes readable words (\log -> log).
function plainLabel(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (isElement(node, 'code') && classList(node).includes('language-math')) {
    return hastText(node)
      .replace(/\\(?:left|right|[,;!:]|quad|qquad)/g, ' ')
      .replace(/\\([a-zA-Z]+)/g, '$1')
      .replace(/[{}]/g, '');
  }
  return Array.isArray(node.children) ? node.children.map(plainLabel).join('') : '';
}

export function slugifyHeading(label) {
  const slug = String(label || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'section';
}

// ---------------------------------------------------------------------------
// rehype plugins
// ---------------------------------------------------------------------------

/**
 * Raw HTML in markdown (e.g. `<int>` in `vector<int>`, or a `<script>` tag) is kept as
 * literal text instead of being parsed or silently dropped. React escapes it on render.
 */
export function rehypeRawToText() {
  return (tree) => {
    walk(tree, (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map((child) => (
        child.type === 'raw' ? { type: 'text', value: String(child.value || '') } : child
      ));
    });
  };
}

const CALLOUT_KINDS = {
  note: 'note', info: 'note',
  tip: 'tip', hint: 'tip',
  warning: 'warning', caution: 'warning', important: 'warning',
  thinking: 'insight', intuition: 'insight', 'key idea': 'insight', 'key insight': 'insight',
};

function stripLeadingPunctuation(children, pattern) {
  const first = children.findIndex((child) => !(child.type === 'text' && !child.value.replace(pattern, '')));
  const rest = first === -1 ? [] : children.slice(first);
  if (rest[0]?.type === 'text') rest[0] = { ...rest[0], value: rest[0].value.replace(pattern, '') };
  return rest;
}

function leadingStrong(container) {
  if (!container || !Array.isArray(container.children)) return null;
  const index = container.children.findIndex((child) => !isWhitespaceText(child));
  const child = container.children[index];
  return isElement(child, 'strong') ? { index, label: hastText(child).trim() } : null;
}

function markCallout(blockquote) {
  const firstIndex = blockquote.children.findIndex((child) => !isWhitespaceText(child));
  const paragraph = blockquote.children[firstIndex];
  if (!isElement(paragraph, 'p')) return;
  const strong = leadingStrong(paragraph);
  if (!strong) return;
  const label = strong.label.replace(/\s*:\s*$/, '');
  const kind = CALLOUT_KINDS[label.toLowerCase()];
  if (!kind) return;
  paragraph.children = stripLeadingPunctuation(paragraph.children.slice(strong.index + 1), /^[\s:]+/);
  if (!paragraph.children.some((child) => !isWhitespaceText(child))) {
    blockquote.children.splice(firstIndex, 1);
  }
  blockquote.data = { ...(blockquote.data || {}), callout: kind, calloutLabel: label };
}

function markComplexity(listItem) {
  const firstIndex = listItem.children.findIndex((child) => !isWhitespaceText(child));
  const first = listItem.children[firstIndex];
  const container = isElement(first, 'p') ? first : listItem;
  const strong = leadingStrong(container);
  if (!strong) return false;
  const match = /^(time|space)(?:\s+complexity)?\s*:?$/i.exec(strong.label);
  if (!match) return false;
  container.children = stripLeadingPunctuation(container.children.slice(strong.index + 1), /^[\s:]+/);
  listItem.data = { ...(listItem.data || {}), complexity: match[1].toLowerCase() };
  return true;
}

function codeBlockOf(node) {
  if (!isElement(node, 'pre')) return null;
  const code = node.children.find((child) => isElement(child, 'code'));
  if (!code) return null;
  const classes = classList(code);
  if (classes.includes('language-math')) return null;
  const languageClass = classes.find((name) => name.startsWith('language-'));
  return {
    lang: normalizeCodeLanguage(languageClass ? languageClass.slice('language-'.length) : ''),
    code: hastText(code).replace(/\n$/, ''),
  };
}

// Consecutive fenced blocks (separated only by blank lines) become ONE tab group.
function groupCodeBlocks(parent) {
  if (!Array.isArray(parent.children)) return;
  const next = [];
  let index = 0;
  while (index < parent.children.length) {
    const block = codeBlockOf(parent.children[index]);
    if (!block) {
      next.push(parent.children[index]);
      index += 1;
      continue;
    }
    const blocks = [block];
    let cursor = index + 1;
    let lastBlock = index;
    while (cursor < parent.children.length) {
      const candidate = parent.children[cursor];
      if (isWhitespaceText(candidate)) { cursor += 1; continue; }
      const nextBlock = codeBlockOf(candidate);
      if (!nextBlock) break;
      blocks.push(nextBlock);
      lastBlock = cursor;
      cursor += 1;
    }
    next.push({
      type: 'element',
      tagName: 'editorial-code-group',
      properties: {},
      children: [],
      data: { blocks },
    });
    index = lastBlock + 1;
  }
  parent.children = next;
}

/**
 * Structural pass (runs after sanitising, before KaTeX):
 * - a leading h1 equal to the problem title is dropped; any other h1 is demoted to h2; h2/h3 receive stable, prefixed ids and an outline label;
 * - in-page links (#slug) are re-pointed at the prefixed ids;
 * - "> **Note:**" / Tip / Warning (and legacy "> **Thinking**") blockquotes become callouts;
 * - "- **Time:** ..." / "- **Space:** ..." list items are marked as complexity rows;
 * - consecutive code fences are grouped into a single tabbed code group.
 */
function comparableTitle(value) {
  return String(value || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

// A leading "# <problem title>" repeats the page title; drop it instead of demoting it.
function dropLeadingTitleHeading(tree, title) {
  const wanted = comparableTitle(title);
  if (!wanted || !Array.isArray(tree.children)) return;
  const index = tree.children.findIndex((child) => !isWhitespaceText(child));
  const first = tree.children[index];
  if (isElement(first, 'h1') && comparableTitle(plainLabel(first)) === wanted) {
    tree.children.splice(index, 1);
  }
}

export function rehypeEditorialStructure(options = {}) {
  const idPrefix = String(options.idPrefix || 'editorial-');
  return (tree) => {
    dropLeadingTitleHeading(tree, options.title);
    const seen = new Map();
    const anchors = [];
    walk(tree, (node) => {
      if (!isElement(node)) return;
      if (node.tagName === 'h1') node.tagName = 'h2';
      if (node.tagName === 'h2' || node.tagName === 'h3') {
        const label = plainLabel(node).replace(/\s+/g, ' ').trim();
        const base = slugifyHeading(label);
        const count = seen.get(base) || 0;
        seen.set(base, count + 1);
        node.properties = {
          ...node.properties,
          id: `${idPrefix}${count ? `${base}-${count + 1}` : base}`,
          dataOutlineLabel: label || 'Section',
        };
      }
      if (node.tagName === 'a' && typeof node.properties?.href === 'string' && node.properties.href.startsWith('#')) {
        anchors.push(node);
      }
      if (node.tagName === 'blockquote') markCallout(node);
      if (node.tagName === 'ul' || node.tagName === 'ol') {
        const items = node.children.filter((child) => isElement(child, 'li'));
        const marked = items.map(markComplexity);
        if (items.length > 0 && marked.every(Boolean)) {
          node.data = { ...(node.data || {}), complexityList: true };
        }
      }
    });
    const ids = new Set();
    walk(tree, (node) => { if (isElement(node) && node.properties?.id) ids.add(String(node.properties.id)); });
    for (const anchor of anchors) {
      const target = `${idPrefix}${anchor.properties.href.slice(1)}`;
      if (ids.has(target)) anchor.properties.href = `#${target}`;
    }
    walk(tree, groupCodeBlocks);
  };
}
