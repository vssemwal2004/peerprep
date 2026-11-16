// Comma-separated question search ("1, 15, lc 42, two sum"). The server does the
// matching; these helpers only mirror its term split so the picker knows when a
// search is multi-term and can show what matched nothing.

export const MAX_SEARCH_TERMS = 50;
export const QUESTION_SEARCH_PLACEHOLDER = 'Search by name or number — use commas for several';

/** Trimmed, de-duplicated (case-insensitive) terms, capped like the server. */
export function splitSearchTerms(raw) {
  const seen = new Set();
  const terms = [];
  for (const part of String(raw ?? '').split(',')) {
    const value = part.trim().replace(/\s+/g, ' ').slice(0, 100);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    terms.push(value);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }
  return terms;
}

/** True when the search holds two or more distinct terms. */
export const isMultiTermSearch = (raw) => splitSearchTerms(raw).length > 1;

/** "Not found: 999, foo" text for unmatched terms; long lists end with "and N more". */
export function unmatchedTermsLabel(terms = [], max = 8) {
  const list = (Array.isArray(terms) ? terms : []).filter(Boolean);
  if (!list.length) return '';
  const shown = list.slice(0, max).join(', ');
  return `Not found: ${shown}${list.length > max ? ` and ${list.length - max} more` : ''}`;
}

/** Adds every found row to a selection (ids Set + meta map), skipping ones that may not be picked. */
export function addFoundToSelection(selectedIds, selectedMeta, rows = [], canPick = () => true) {
  const ids = new Set(selectedIds);
  const meta = { ...selectedMeta };
  let added = 0;
  for (const row of rows) {
    if (!row?._id || !canPick(row) || ids.has(row._id)) continue;
    ids.add(row._id);
    meta[row._id] = row;
    added += 1;
  }
  return { ids, meta, added };
}
