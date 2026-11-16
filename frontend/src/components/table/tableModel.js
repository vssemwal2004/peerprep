/**
 * Pure helpers behind every PeerPrep data table: one sort order, one paging model.
 * Kept free of React so they can be unit-tested and reused by server-paged tables.
 */

export const PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100]);
export const DEFAULT_PAGE_SIZE = 25;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const isBlank = (value) => value === null || value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value));

/** Turns a cell value into something comparable: numbers stay numbers, dates become epoch ms, the rest text. */
export function sortableValue(value) {
  if (isBlank(value)) return null;
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item ?? '')).join(', ') : null;
  const text = String(value).trim();
  if (!text) return null;
  if (ISO_DATE.test(text)) {
    // Safari cannot parse "YYYY-MM-DD HH:mm" — normalise the space to a "T" before Date.parse.
    const time = Date.parse(text.includes(' ') ? text.replace(' ', 'T') : text);
    if (!Number.isNaN(time)) return time;
  }
  return text;
}

/** Compares two cell values. Blank values always sort last, whatever the direction. */
export function compareValues(left, right, direction = 'asc') {
  const a = sortableValue(left);
  const b = sortableValue(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const sign = direction === 'desc' ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return collator.compare(String(a), String(b)) * sign;
}

/** Next state when a header is clicked: off → ascending → descending → off. */
export function nextSort(current, key) {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

/**
 * Stable sort of rows by a column. `getValue(row, key)` reads the cell; the original order breaks ties,
 * so clicking a header never shuffles equal rows.
 */
export function sortRows(rows, sort, getValue = (row, key) => row?.[key]) {
  const list = Array.isArray(rows) ? rows : [];
  if (!sort?.key) return list;
  return list
    .map((row, index) => ({ row, index }))
    .sort((left, right) => compareValues(getValue(left.row, sort.key), getValue(right.row, sort.key), sort.direction) || left.index - right.index)
    .map((entry) => entry.row);
}

export function pageCount(total, pageSize) {
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / size));
}

export function clampPage(page, total, pageSize) {
  const last = pageCount(total, pageSize);
  const value = Math.floor(Number(page) || 1);
  return Math.min(Math.max(1, value), last);
}

/** "Showing first–last of total" for a page. */
export function pageRange(page, pageSize, total) {
  const count = Math.max(0, Number(total) || 0);
  if (!count) return { first: 0, last: 0, total: 0 };
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  const current = clampPage(page, count, size);
  const first = (current - 1) * size + 1;
  return { first, last: Math.min(count, first + size - 1), total: count };
}

/** The page numbers to show, with null where an ellipsis goes: 1 … 4 5 6 … 20. */
export function pageWindow(page, pages, radius = 1) {
  const last = Math.max(1, Number(pages) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), last);
  const wanted = new Set([1, last]);
  for (let value = current - radius; value <= current + radius; value += 1) if (value >= 1 && value <= last) wanted.add(value);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((value, index) => {
    if (index > 0) {
      const gap = value - sorted[index - 1];
      if (gap === 2) out.push(value - 1);
      else if (gap > 2) out.push(null);
    }
    out.push(value);
  });
  return out;
}

export function slicePage(rows, page, pageSize) {
  const list = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  const current = clampPage(page, list.length, size);
  return list.slice((current - 1) * size, current * size);
}
