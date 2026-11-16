import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { headerClass } from './headerClass';

/**
 * A table header cell whose label is a sort button (the same in every PeerPrep table).
 * Click cycles ascending → descending → off. Pass `sortable={false}` for action/checkbox columns.
 */
export default function SortHeader({
  sortKey, sort, onSort, children, align = 'left', sortable = true, className = '', title, ...rest
}) {
  const active = sortable && sort?.key === sortKey;
  const direction = active ? sort.direction : null;
  const alignment = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined;

  const thClass = headerClass(`${alignment} ${className}`);
  if (!sortable || !onSort) {
    return <th scope="col" className={thClass} {...rest}>{children}</th>;
  }

  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  const label = typeof children === 'string' ? children : title || sortKey;
  return (
    <th scope="col" aria-sort={ariaSort} className={thClass} {...rest}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title || `Sort by ${label}`}
        // Preflight resets text-transform/letter-spacing on buttons: inherit the header's instead.
        className={`group inline-flex max-w-full items-center gap-1 rounded-md outline-none transition-colors [letter-spacing:inherit] [text-transform:inherit] focus-visible:ring-2 focus-visible:ring-sky-500/60 ${justify} ${active ? 'text-sky-700 dark:text-sky-300' : 'hover:text-slate-800 dark:hover:text-zinc-100'}`}
      >
        <span className="truncate">{children}</span>
        <Icon aria-hidden="true" className={`h-3 w-3 shrink-0 ${active ? 'opacity-100' : 'opacity-40 group-hover:opacity-80'}`} />
        <span className="sr-only">{direction === 'asc' ? ', sorted ascending' : direction === 'desc' ? ', sorted descending' : ', not sorted'}</span>
      </button>
    </th>
  );
}
