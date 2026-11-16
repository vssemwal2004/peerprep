import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Filter, Search, X } from 'lucide-react';
import { COLUMN_FILTERS, columnFilterActive, facetOptions } from './rosterModel';

const MENU_WIDTH = 264;

const SORT_LABELS = {
  text: ['Sort A → Z', 'Sort Z → A'],
  enum: ['Sort A → Z', 'Sort Z → A'],
  number: ['Smallest first', 'Largest first'],
  date: ['Oldest first', 'Newest first'],
};

const inputClass = 'h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';

function MenuButton({ icon: Icon, children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${active ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800'}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />{children}
    </button>
  );
}

function EnumFilter({ options, spec, onChange }) {
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(spec?.values || []), [spec]);
  const visible = options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (value) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange({ values: [...next] });
  };
  return (
    <div>
      {options.length > 7 && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search values" aria-label="Search values" className={`${inputClass} pl-7`} />
        </div>
      )}
      <div className="mb-1 flex items-center justify-between px-0.5 text-[11px]">
        <button type="button" onClick={() => onChange({ values: visible.map((option) => option.value) })} className="font-medium text-sky-600 hover:underline dark:text-sky-400">Select all</button>
        <button type="button" onClick={() => onChange({ values: [] })} className="font-medium text-slate-500 hover:underline dark:text-gray-400">Clear</button>
      </div>
      <ul className="max-h-52 space-y-0.5 overflow-y-auto pr-0.5">
        {visible.length ? visible.map((option) => (
          <li key={option.value || '__empty'}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
              <input type="checkbox" checked={selected.has(option.value)} onChange={() => toggle(option.value)} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="tabular-nums text-[11px] text-slate-400">{option.count}</span>
            </label>
          </li>
        )) : <li className="px-2 py-3 text-center text-xs text-slate-400">No values</li>}
      </ul>
    </div>
  );
}

function RangeFilter({ spec, unit, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input type="number" inputMode="decimal" placeholder={`Min${unit}`} aria-label="Minimum" value={spec?.min ?? ''} onChange={(event) => onChange({ ...spec, min: event.target.value })} className={inputClass} />
      <span className="text-[11px] text-slate-400">to</span>
      <input type="number" inputMode="decimal" placeholder={`Max${unit}`} aria-label="Maximum" value={spec?.max ?? ''} onChange={(event) => onChange({ ...spec, max: event.target.value })} className={inputClass} />
    </div>
  );
}

function DateFilter({ spec, onChange }) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-slate-500 dark:text-gray-400">From
        <input type="date" value={spec?.from || ''} onChange={(event) => onChange({ ...spec, from: event.target.value })} className={`${inputClass} mt-1`} />
      </label>
      <label className="block text-[11px] text-slate-500 dark:text-gray-400">To
        <input type="date" value={spec?.to || ''} onChange={(event) => onChange({ ...spec, to: event.target.value })} className={`${inputClass} mt-1`} />
      </label>
    </div>
  );
}

const UNITS = { score: '%', progress: '%', time: ' min', violations: '' };

/**
 * Menu of one column: sort and filter, like a spreadsheet header. Everything applies at once.
 * It is drawn in a portal so the scrolling table cannot clip it.
 */
function HeaderMenu({ anchor, label, sortKey, filterKey, sort, onSortDirection, spec, rows, filters, onFilter, onClose }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });
  const kind = filterKey ? COLUMN_FILTERS[filterKey]?.kind : null;
  const options = useMemo(() => (kind === 'enum' ? facetOptions(rows, filters, filterKey) : []), [filterKey, filters, kind, rows]);
  const labels = SORT_LABELS[kind || 'text'];
  const sorted = sort.key === sortKey ? sort.dir : null;

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight || 0;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    const top = rect.bottom + 6 + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
    setPosition({ top, left });
  }, [anchor, kind, options.length]);

  useEffect(() => {
    const onPointer = (event) => {
      if (menuRef.current?.contains(event.target) || anchor.contains(event.target)) return;
      onClose();
    };
    const onKey = (event) => { if (event.key === 'Escape') { onClose(); anchor.querySelector('button')?.focus(); } };
    const onScroll = (event) => { if (!menuRef.current?.contains(event.target)) onClose(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const active = kind ? columnFilterActive(kind, spec) : false;

  return createPortal(
    <div
      ref={menuRef}
      role="dialog"
      aria-label={`${label} column options`}
      style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
      className="fixed z-[95] rounded-xl border border-slate-200 bg-white p-2 text-left normal-case tracking-normal shadow-xl dark:border-gray-700 dark:bg-gray-900"
    >
      {sortKey && (
        <div className="border-b border-slate-100 pb-2 dark:border-gray-800">
          <MenuButton icon={ArrowUp} active={sorted === 'asc'} onClick={() => onSortDirection(sortKey, 'asc')}>{labels[0]}</MenuButton>
          <MenuButton icon={ArrowDown} active={sorted === 'desc'} onClick={() => onSortDirection(sortKey, 'desc')}>{labels[1]}</MenuButton>
        </div>
      )}
      {kind ? (
        <div className="px-1 pt-2">
          <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500">
            Filter {label}
            {active && <button type="button" onClick={() => onFilter(filterKey, null)} className="inline-flex items-center gap-0.5 normal-case font-medium text-sky-600 hover:underline dark:text-sky-400"><X className="h-3 w-3" />Clear</button>}
          </p>
          {kind === 'enum' && <EnumFilter options={options} spec={spec} onChange={(next) => onFilter(filterKey, next)} />}
          {kind === 'number' && <RangeFilter spec={spec} unit={UNITS[filterKey] ?? ''} onChange={(next) => onFilter(filterKey, next)} />}
          {kind === 'date' && <DateFilter spec={spec} onChange={(next) => onFilter(filterKey, next)} />}
          {kind === 'text' && <input type="search" autoFocus value={spec?.text || ''} onChange={(event) => onFilter(filterKey, { text: event.target.value })} placeholder="Name, email or roll no." aria-label="Filter text" className={inputClass} />}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/**
 * A sortable, filterable table header cell. Clicking the label sorts (as before); the arrow
 * button opens the column menu with sort direction and a value filter.
 */
export default function ColumnHeader({
  label, sortKey, filterKey, align = 'left', sort, onSort, onSortDirection, filters, getFilter, onFilter, rows,
}) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const sortedHere = sortKey && sort.key === sortKey;
  const kind = filterKey ? COLUMN_FILTERS[filterKey]?.kind : null;
  const spec = filterKey ? getFilter(filterKey) : null;
  const filtered = kind ? columnFilterActive(kind, spec) : false;
  const hasMenu = Boolean(sortKey || filterKey);
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      ref={cellRef}
      scope="col"
      aria-sort={sortedHere ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`select-none whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${sortedHere || filtered ? 'text-slate-800 dark:text-gray-100' : 'text-slate-500 dark:text-gray-400'} ${alignClass}`}
    >
      <span className={`inline-flex items-center gap-0.5 ${justify}`}>
        {sortKey ? (
          <button type="button" onClick={() => onSort(sortKey)} title={`Sort by ${label}`} className="group inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wider transition-colors hover:text-sky-600 dark:hover:text-sky-400">
            {label}
            {/* Same indicator as the shared table SortHeader: a faint ⇅ until the column is sorted. */}
            {sortedHere
              ? (sort.dir === 'asc' ? <ArrowUp aria-hidden="true" className="h-3 w-3 text-sky-600" /> : <ArrowDown aria-hidden="true" className="h-3 w-3 text-sky-600" />)
              : <ArrowUpDown aria-hidden="true" className="h-3 w-3 opacity-40 group-hover:opacity-80" />}
          </button>
        ) : <span className="px-1">{label}</span>}
        {hasMenu && (
          <button
            type="button"
            aria-label={`${label} sort and filter options`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={`relative inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${filtered || open ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-gray-700'}`}
          >
            {filtered ? <Filter className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </span>
      {open && cellRef.current && (
        <HeaderMenu
          anchor={cellRef.current}
          label={label}
          sortKey={sortKey}
          filterKey={filterKey}
          sort={sort}
          onSortDirection={onSortDirection}
          spec={spec}
          rows={rows}
          filters={filters}
          onFilter={onFilter}
          onClose={close}
        />
      )}
    </th>
  );
}
