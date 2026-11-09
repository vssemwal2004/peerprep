// "Only these sheets" on the Quick Prep page: every student's Quick Prep figures are rebuilt from
// the chosen sheets alone (started, finished, progress, activity, open sheets, own work), with the
// same rules as the all-sheets rows (studentRows.buildQuickPrep), so KPIs, charts, the table, drills
// and downloads all describe just those sheets.

import { sheetVisibleTo } from './quickPrepFacts.js';
import { buildQuickPrep, summarizeReview } from './studentRows.js';

export const MAX_SCOPED_SHEETS = 500;

/** A clean list of sheet ids from a request (unknown ones are dropped later, never an error). */
export function normalizeSheetIds(value) {
  const list = [].concat(value ?? []).flatMap((part) => String(part).split(',')).map((part) => part.trim()).filter((part) => /^[a-f0-9]{24}$/i.test(part));
  return [...new Set(list)].slice(0, MAX_SCOPED_SHEETS);
}

// One narrowed copy per loaded context and sheet choice, so one page's table, charts and drills agree.
const narrowed = new WeakMap();

/** The context with rows and sheets limited to `sheetIds`; the context itself when nothing applies. */
export function narrowToSheets(context, sheetIds, range) {
  const wanted = new Set((sheetIds || []).filter((id) => context.sheets?.has(id)));
  if (!wanted.size) return context;
  const cacheKey = `${[...wanted].sort().join(',')}|${range?.preset || ''}`;
  const cached = narrowed.get(context)?.get(cacheKey);
  if (cached) return cached;

  const sheets = new Map([...context.sheets].filter(([id]) => wanted.has(id)));
  const sheetKeys = new Set([...sheets.values()].flatMap((sheet) => [...(sheet.itemKeys || [])]));
  const now = range?.to ? new Date(range.to) : new Date();
  const rows = context.rows.map((row) => {
    if (!row.quickprep) return row;
    const entries = [...row.quickprep.bySheet.values()].filter((entry) => wanted.has(entry.sheetId));
    const visible = [...sheets.values()].filter((sheet) => sheet.published && sheetVisibleTo(sheet, row.student.semester));
    const quickprep = buildQuickPrep(entries, visible, now, range);
    quickprep.review = summarizeReview((row.quickprep.review?.items || []).filter((item) => sheetKeys.has(item.key)));
    return { ...row, quickprep };
  });
  const result = { ...context, rows, sheets, sheetScope: [...wanted] };
  if (!narrowed.has(context)) narrowed.set(context, new Map());
  narrowed.get(context).set(cacheKey, result);
  return result;
}
