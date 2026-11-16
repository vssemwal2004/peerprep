import { useCallback } from 'react';
import SortHeader from './SortHeader';
import TablePager from './TablePager';
import useClientTable from './useClientTable';

/**
 * Standard PeerPrep data table: every column sorts from its header, the pager sits under the table.
 *
 * columns: [{ key, label, value?(row) → sort/display value, render?(row) → node, sortable?=true,
 *             align?: 'left'|'right'|'center', className?, headerClassName? }]
 *
 * Client mode (default): pass `rows`; sorting and paging happen here.
 * Server mode: pass `server={{ sort, onSort, page, pageSize, total, onPage, onPageSize, busy }}` and the
 * already-sorted, already-paged `rows`.
 * serial (default true): the platform-wide S.No. column, continuing across pages; false when the table
 * already has its own rank/position column.
 */
export default function DataTable({
  columns, rows, rowKey = (row, index) => row?._id || row?.id || index, onRowClick,
  empty = 'Nothing to show.', initialSort = null, initialPageSize, resetKey, server, noun,
  className = '', tableClassName = '', rowClassName, dense = false, stickyHeader = false, caption,
  serial = true,
}) {
  const getValue = useCallback((row, key) => {
    const column = columns.find((item) => item.key === key);
    return column?.value ? column.value(row) : row?.[key];
  }, [columns]);
  const client = useClientTable(server ? [] : rows, { getValue, initialSort, initialPageSize, resetKey });

  const sort = server ? server.sort : client.sort;
  const onSort = server ? server.onSort : client.toggleSort;
  const visibleRows = server ? rows || [] : client.pageRows;
  const pager = server
    ? { page: server.page, pageSize: server.pageSize, total: server.total, onPage: server.onPage, onPageSize: server.onPageSize, busy: server.busy }
    : client.pager;
  const cell = dense ? 'px-3 py-1.5' : 'px-3 py-2.5';
  // The platform-wide "S.No." column (index.css) numbers rows on from the first row of this page.
  // Off for tables with their own position column, and for the empty-state row.
  const numbered = serial && visibleRows.length > 0;
  const serialStart = Math.max(0, ((Number(pager.page) || 1) - 1) * (Number(pager.pageSize) || visibleRows.length));

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/40 ${className}`}>
      <div className="overflow-x-auto">
        <table
          className={`min-w-full text-left text-[13px] ${tableClassName}`}
          data-no-serial={numbered ? undefined : ''}
          style={numbered ? { '--serial-start': serialStart } : undefined}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className={`bg-slate-50 dark:bg-zinc-900/70 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            <tr>
              {columns.map((column) => (
                <SortHeader
                  key={column.key}
                  sortKey={column.key}
                  sort={sort}
                  onSort={onSort}
                  sortable={column.sortable !== false}
                  align={column.align}
                  className={column.headerClassName || ''}
                >{column.label}</SortHeader>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {visibleRows.length ? visibleRows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-sky-50/60 dark:hover:bg-sky-500/[0.06]' : ''} ${typeof rowClassName === 'function' ? rowClassName(row) : rowClassName || ''}`}
              >
                {columns.map((column) => {
                  const align = column.align === 'right' ? 'text-right tabular-nums' : column.align === 'center' ? 'text-center' : '';
                  const content = column.render ? column.render(row) : (column.value ? column.value(row) : row?.[column.key]);
                  return <td key={column.key} className={`${cell} text-slate-700 dark:text-zinc-200 ${align} ${column.className || ''}`}>{content ?? '—'}</td>;
                })}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-slate-500 dark:text-zinc-400">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePager {...pager} noun={noun} />
    </div>
  );
}
