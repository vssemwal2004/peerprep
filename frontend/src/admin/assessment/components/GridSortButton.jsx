import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/** Sort button for a CSS-grid header cell; the same look and asc → desc → off cycle as the shared SortHeader. */
export default function GridSortButton({ sortKey, sort, onSort, children }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`Sort by ${children}`}
      className={`group inline-flex max-w-full items-center gap-1 rounded-md text-left outline-none transition-colors [letter-spacing:inherit] [text-transform:inherit] focus-visible:ring-2 focus-visible:ring-sky-500/60 ${active ? 'text-sky-700 dark:text-sky-300' : 'hover:text-slate-700 dark:hover:text-gray-200'}`}
    >
      <span className="truncate">{children}</span>
      <Icon aria-hidden="true" className={`h-3 w-3 shrink-0 ${active ? 'opacity-100' : 'opacity-40 group-hover:opacity-80'}`} />
      <span className="sr-only">{active ? (sort.direction === 'asc' ? ', sorted ascending' : ', sorted descending') : ', not sorted'}</span>
    </button>
  );
}
