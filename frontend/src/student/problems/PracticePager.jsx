import { TablePager } from '../../components/table';
import { PAGE_SIZE_OPTIONS } from './problemsUi';

/**
 * Footer of the question list: the shared PeerPrep table pager (range, rows per page, First/Prev/pages/Next/Last)
 * in the practice library's card surface. Paging stays on the server; `page`/`total` come from its response.
 */
export default function PracticePager({ busy = false, page, total, pageSize, onPage, onPageSize }) {
  return <div data-guide="pc-pager" className="mt-3 overflow-hidden rounded-xl border border-[#eef0f3] bg-white dark:border-white/[0.06] dark:bg-[#232325]">
    <TablePager page={page || 1} pageSize={pageSize} total={total || 0} busy={busy} noun="questions"
      pageSizeOptions={PAGE_SIZE_OPTIONS} onPage={onPage} onPageSize={onPageSize} className="border-t-0" />
  </div>;
}
