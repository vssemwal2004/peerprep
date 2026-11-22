// Line-for-line parity between the preview and the PDF.
//
// react-pdf breaks lines with Knuth–Plass and lets spaces shrink, so it may
// wrap at different words than the browser. The preview is what the student
// approves, so at download time we read where the browser actually broke each
// multi-line text and insert hard line breaks at those positions in the PDF.
// Glyph widths are identical (same font files), so every PDF line then fits.
//
// Text nodes are matched by scope (block id or "banner") + their order among
// top-level texts in that scope; both renderers draw the same tree.
import { Children, cloneElement, isValidElement } from 'react';

const WHITESPACE = /\s/;

/** Character offsets where a new visual line starts inside one text element. */
export function lineStartOffsets(element) {
  const style = window.getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 12;
  if (element.getBoundingClientRect().height < lineHeight * 1.5) return [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const starts = [];
  let offset = 0;
  let lineTop = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.data;
    for (let index = 0; index < text.length; index += 1) {
      if (!WHITESPACE.test(text[index])) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (rect && rect.width + rect.height > 0) {
          if (lineTop === null) lineTop = rect.top;
          else if (rect.top > lineTop + lineHeight * 0.6) {
            starts.push(offset + index);
            lineTop = rect.top;
          }
        }
      }
    }
    offset += text.length;
  }
  range.detach?.();
  return starts;
}

/** { "<scope>#<textIndex>": [offsets] } for every multi-line text in a laid-out resume. */
export function measureLineBreaks(container) {
  const result = {};
  if (!container) return result;
  container.querySelectorAll('[data-b],[data-banner]').forEach((scope) => {
    const id = scope.getAttribute('data-b') || 'banner';
    scope.querySelectorAll('[data-t]').forEach((element, index) => {
      const starts = lineStartOffsets(element);
      if (starts.length) result[`${id}#${index}`] = starts;
    });
  });
  return result;
}

/**
 * Inserts "\n" into React text children at the given line-start offsets.
 * A break that follows a space replaces that space; otherwise (after a hyphen,
 * slash, or inside a long word) a newline is inserted.
 */
export function applyLineBreaks(children, offsets) {
  if (!offsets?.length) return children;
  // 1. Collect string leaves in order.
  const leaves = [];
  const collect = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') { leaves.push(String(node)); return; }
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (isValidElement(node)) Children.toArray(node.props.children).forEach(collect);
  };
  collect(children);
  const text = leaves.join('');
  // 2. Decide edits on the flat text.
  const replaceAt = new Set();
  const insertBefore = new Set();
  offsets.forEach((offset) => {
    if (offset <= 0 || offset >= text.length) return;
    let back = offset - 1;
    if (WHITESPACE.test(text[back])) {
      while (back > 0 && WHITESPACE.test(text[back - 1])) back -= 1; // the first of a run of spaces
      replaceAt.add(back);
    } else {
      insertBefore.add(offset);
    }
  });
  // 3. Rebuild with the edits, walking leaves in the same order.
  let cursor = 0;
  const editString = (value) => {
    let out = '';
    for (let index = 0; index < value.length; index += 1) {
      const position = cursor + index;
      if (insertBefore.has(position)) out += '\n';
      out += replaceAt.has(position) ? '\n' : value[index];
    }
    cursor += value.length;
    return out;
  };
  const rebuild = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return node;
    if (typeof node === 'string' || typeof node === 'number') return editString(String(node));
    if (Array.isArray(node)) return node.map(rebuild);
    if (isValidElement(node)) {
      const inner = Children.toArray(node.props.children).map(rebuild);
      return cloneElement(node, undefined, ...inner);
    }
    return node;
  };
  // toArray gives every element a key, since the rebuilt children are passed as a list.
  return Children.toArray(rebuild(children));
}
