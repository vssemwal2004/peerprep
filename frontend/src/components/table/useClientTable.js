import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE, clampPage, nextSort, slicePage, sortRows } from './tableModel';

/**
 * Sorting + paging for a table whose rows are already in the browser.
 *
 *   const table = useClientTable(rows, { getValue: (row, key) => ..., initialSort: { key: 'name', direction: 'asc' } });
 *   <SortHeader sortKey="name" sort={table.sort} onSort={table.toggleSort}>Name</SortHeader>
 *   table.pageRows.map(...)
 *   <TablePager {...table.pager} />
 *
 * `resetKey` (e.g. the search text) sends the table back to page 1 when it changes.
 */
export default function useClientTable(rows, {
  getValue,
  initialSort = null,
  initialPageSize = DEFAULT_PAGE_SIZE,
  resetKey,
  paginate = true,
} = {}) {
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const sortedRows = useMemo(() => sortRows(rows, sort, getValue), [rows, sort, getValue]);
  const total = sortedRows.length;
  const current = clampPage(page, total, pageSize);
  const pageRows = useMemo(
    () => (paginate ? slicePage(sortedRows, current, pageSize) : sortedRows),
    [paginate, sortedRows, current, pageSize],
  );

  useEffect(() => { setPage(1); }, [resetKey]);

  const toggleSort = useCallback((key) => { setSort((value) => nextSort(value, key)); setPage(1); }, []);
  const setPageSize = useCallback((size) => { setPageSizeState(Number(size) || DEFAULT_PAGE_SIZE); setPage(1); }, []);

  return {
    sort, setSort, toggleSort,
    page: current, setPage, pageSize, setPageSize,
    sortedRows, pageRows, total,
    pager: { page: current, pageSize, total, onPage: setPage, onPageSize: setPageSize },
  };
}
