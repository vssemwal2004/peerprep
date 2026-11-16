export const TH_CLASS = 'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400';

// Tailwind decides conflicting utilities by stylesheet order, not class order, so a table's own
// header classes (e.g. `px-4 text-xs normal-case`) must REPLACE the matching defaults, not sit beside them.
const DEFAULT_GROUPS = [
  ['px-3', /(^|\s)(p|px|pl|pr)-/],
  ['py-2.5', /(^|\s)(p|py|pt|pb)-/],
  ['text-[11px]', /(^|\s)text-(xs|sm|base|lg|xl|\d|\[\d)/],
  ['font-semibold', /(^|\s)font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(\s|$)/],
  ['uppercase', /(^|\s)(uppercase|lowercase|capitalize|normal-case)(\s|$)/],
  ['tracking-wide', /(^|\s)tracking-/],
  ['text-slate-500', /(^|\s)text-(?!(xs|sm|base|lg|xl|left|right|center|justify|start|end|ellipsis|clip|wrap|nowrap|balance|pretty)(\s|$))(?!\d|\[\d)[a-z]+(-\d{2,3})?(\/\d+)?(\s|$)/],
  ['dark:text-zinc-400', /(^|\s)dark:text-(?!(xs|sm|base|lg|xl)(\s|$))/],
];

/** The default header classes, minus any group the caller's own classes override. */
export function headerClass(extra = '') {
  const kept = DEFAULT_GROUPS.filter(([, overridden]) => !overridden.test(extra)).map(([value]) => value);
  return `${kept.join(' ')} ${extra}`.trim();
}
