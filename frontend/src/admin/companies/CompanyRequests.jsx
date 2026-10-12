import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Briefcase, CircleCheck, GitMerge, Inbox, PenLine, RotateCcw, Search } from 'lucide-react';
import { api } from '../../utils/api';
import { isControlDeployment as central } from '../../platform/universityPermissions';
import { Notice, RowMenu, SearchBox, Segmented, card } from '../quickprep/ui';
import { formatDate, plural, timeAgo } from '../quickprep/format';
import { CompanyStatus, EmptyState, MiniMeter, Pager, TableSkeleton } from './companyUi';
import { PAGE_SIZE, companies, useDebounced } from './companyHelpers';
import { MergeDialog, RenameDialog } from './CompanyDialogs';

const STATUSES = [['pending', 'Pending'], ['approved', 'Approved'], ['merged', 'Merged'], ['rejected', 'Rejected'], ['all', 'All']];
const EMPTY = {
  pending: ['No pending requests', 'Students’ new companies will appear here.'],
  approved: ['No approved companies yet', 'Approved names can tag questions once enough students confirm them.'],
  merged: ['No merged names yet', 'Misspellings you merge into an existing company appear here.'],
  rejected: ['No rejected names', 'Rejected names never appear to students.'],
  all: ['No company requests yet', 'Names students type after solving a question appear here.'],
};
const BULK = { approve: ['pending', 'rejected'], reject: ['pending'] };
const selectable = (row) => BULK.approve.includes(row.status);
const requestedRange = (first, last) => {
  const [from, to] = [formatDate(first), formatDate(last)];
  return from === to || !first ? to : `${from} – ${to}`;
};
const sinceLabel = (value) => { const ago = timeAgo(value); return ago === 'Just now' ? 'just now' : ago; };

/** Requests view: every student-typed company name with its reach and a decision menu. */
export default function CompanyRequests({ threshold, version, onLoaded, onChanged, notify }) {
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [selected, setSelected] = useState(() => new Set());
  const [busyKey, setBusyKey] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const latest = useRef(0);
  const headerBox = useRef(null);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await api.listCompanySuggestions({ status, page, limit: PAGE_SIZE, ...(term ? { search: term } : {}) });
      if (id !== latest.current) return;
      // A decision can empty the last page; step back to the new last page instead of showing a false empty state.
      const pages = data.pagination?.pages || 1;
      if (!data.rows?.length && page > pages) { setPage(pages); return; }
      setState({ data, loading: false, error: '' });
      setSelected(new Set());
      onLoaded?.(data);
    } catch (cause) {
      if (id === latest.current) setState((previous) => ({ ...previous, loading: false, error: cause.message || 'Company requests could not load.' }));
    }
  }, [status, page, term, onLoaded]);
  useEffect(() => { void load(); }, [load, version]);

  const rows = state.data?.rows || [];
  const counts = state.data?.counts || {};
  const catalog = state.data?.catalog || [];
  const needed = threshold ?? state.data?.threshold;
  const eligible = rows.filter(selectable);
  const picked = rows.filter((row) => selected.has(row.key));
  const bulkCount = (action) => picked.filter((row) => BULK[action].includes(row.status)).length;
  useEffect(() => { if (headerBox.current) headerBox.current.indeterminate = picked.length > 0 && picked.length < eligible.length; }, [picked.length, eligible.length]);

  const decide = async (row, body, done) => {
    setBusyKey(row.key);
    setDialogError('');
    try {
      await api.decideCompanySuggestion(row.key, body);
      notify({ tone: 'success', text: done });
      setDialog(null);
      onChanged();
    } catch (cause) {
      const text = cause.message || `“${row.name}” could not be updated.`;
      // An open dialog covers the page notice, so its own error line shows the failure.
      if (dialog?.row.key === row.key) setDialogError(text); else notify({ tone: 'error', text });
    } finally { setBusyKey(null); }
  };
  const openDialog = (next) => { setDialogError(''); setDialog(next); };
  const merge = (row, target) => decide(row, { action: 'merge', mergeInto: target.key }, `Merged “${row.name}” into ${target.name}.`);
  const runBulk = async (action) => {
    const targets = picked.filter((row) => BULK[action].includes(row.status));
    const failed = [];
    for (const [index, row] of targets.entries()) {
      setBulk({ action, done: index, total: targets.length });
      try { await api.decideCompanySuggestion(row.key, { action }); } catch { failed.push(row.name); }
    }
    setBulk(null);
    const verb = action === 'approve' ? 'Approved' : 'Rejected';
    notify(failed.length ? { tone: 'warning', text: `${verb} ${targets.length - failed.length} of ${companies(targets.length)}. Not updated: ${failed.join(', ')}.` }
      : { tone: 'success', text: `${verb} ${companies(targets.length)}.` });
    onChanged();
  };

  const actionsFor = (row) => {
    const disabled = Boolean(busyKey || bulk);
    const approve = { id: 'approve', label: 'Approve', icon: CircleCheck, disabled, run: () => decide(row, { action: 'approve' }, `Approved “${row.name}”.`) };
    const rename = { id: 'rename', label: 'Approve with another name…', icon: PenLine, disabled, run: () => openDialog({ type: 'rename', row }) };
    const mergeInto = { id: 'merge', label: 'Merge into existing…', icon: GitMerge, disabled, run: () => openDialog({ type: 'merge', row }) };
    const reject = { id: 'reject', label: 'Reject', icon: Ban, danger: true, disabled, run: () => decide(row, { action: 'reject' }, `Rejected “${row.name}”. Students will not see it.`) };
    const reset = { id: 'reset', label: 'Move back to pending', icon: RotateCcw, disabled, run: () => decide(row, { action: 'reset' }, `Moved “${row.name}” back to pending.`) };
    return { pending: [approve, rename, mergeInto, 'divider', reject], approved: [mergeInto, 'divider', reset], merged: [reset], rejected: [approve, rename, mergeInto, 'divider', reset] }[row.status] || [];
  };
  const toggle = (key) => setSelected((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const changeStatus = (next) => { setStatus(next); setPage(1); };
  const changeSearch = (next) => { setSearch(next); setPage(1); };
  const [emptyTitle, emptyText] = EMPTY[status];

  return <section className={card} aria-labelledby="company-requests-title">
    <h2 id="company-requests-title" className="sr-only">Company requests</h2>
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-zinc-800">
      <div className="max-w-full overflow-x-auto"><Segmented label="Request status" value={status} onChange={changeStatus} options={STATUSES.map(([value, label]) => ({ value, label, count: counts[value] }))} /></div>
      <SearchBox value={search} onChange={changeSearch} placeholder="Search company or spelling" label="Search company requests" />
    </div>

    {picked.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-sky-100 bg-sky-50/70 px-4 py-2.5 text-[13px] dark:border-sky-500/20 dark:bg-sky-500/10" role="region" aria-label="Bulk actions">
      <span className="font-semibold text-sky-900 dark:text-sky-100">{picked.length} selected</span>
      {bulk ? <span className="text-sky-800 dark:text-sky-200" role="status">{bulk.action === 'approve' ? 'Approving' : 'Rejecting'} {bulk.done + 1} of {bulk.total}…</span> : <>
        <button type="button" disabled={!bulkCount('approve') || Boolean(busyKey)} onClick={() => runBulk('approve')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"><CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />Approve selected ({bulkCount('approve')})</button>
        <button type="button" disabled={!bulkCount('reject') || Boolean(busyKey)} onClick={() => runBulk('reject')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-500/30 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10"><Ban className="h-3.5 w-3.5" aria-hidden="true" />Reject selected ({bulkCount('reject')})</button>
        <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[12.5px] font-semibold text-slate-500 hover:underline dark:text-zinc-400">Clear selection</button>
      </>}
    </div>}

    {state.error && <div className="p-4"><Notice tone="error">{state.error} <button type="button" className="font-semibold underline" onClick={load}>Retry</button></Notice></div>}
    {state.loading && !state.data ? <TableSkeleton />
      : !rows.length ? (!state.error && (term ? <EmptyState icon={Search} title={`No company matches “${term}”`}>Try another spelling or switch to All.</EmptyState> : <EmptyState icon={Inbox} title={emptyTitle}>{emptyText}</EmptyState>))
        : <div className={`overflow-x-auto transition-opacity ${state.loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[1080px] whitespace-nowrap text-left text-sm">
            <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th scope="col" className="w-10 py-3 pl-4 pr-1"><input ref={headerBox} type="checkbox" aria-label="Select all on this page" disabled={!eligible.length || Boolean(bulk)} checked={eligible.length > 0 && picked.length === eligible.length}
                  onChange={(event) => setSelected(event.target.checked ? new Set(eligible.map((row) => row.key)) : new Set())} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-30 dark:border-zinc-600 dark:bg-zinc-900" /></th>
                <th scope="col" className="px-3 py-3">Company</th>
                <th scope="col" className="px-3 py-3">Students</th>
                <th scope="col" className="px-3 py-3">Questions</th>
                {central && <th scope="col" className="px-3 py-3">Universities</th>}
                <th scope="col" className="px-3 py-3">Requested</th>
                <th scope="col" className="px-3 py-3">Suggestion</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="py-3 pl-3 pr-4 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {rows.map((row) => {
                const variants = (row.variants || []).filter((name) => name.toLowerCase() !== row.name.toLowerCase());
                const checked = selected.has(row.key);
                return <tr key={row.key} className={`align-top transition hover:bg-sky-50/40 dark:hover:bg-zinc-800/40 ${checked ? 'bg-sky-50/60 dark:bg-sky-500/5' : ''} ${busyKey === row.key ? 'opacity-60' : ''}`}>
                  <td className="py-3.5 pl-4 pr-1"><input type="checkbox" aria-label={`Select ${row.name}`} disabled={!selectable(row) || Boolean(bulk)} checked={checked} onChange={() => toggle(row.key)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-30 dark:border-zinc-600 dark:bg-zinc-900" /></td>
                  <td className="px-3 py-3">
                    <p className="max-w-[16rem] truncate font-semibold text-slate-900 dark:text-zinc-50" title={row.name}>{row.name}</p>
                    {variants.length > 0 && <p className="mt-0.5 max-w-[18rem] truncate text-[12px] text-slate-500 dark:text-zinc-400" title={variants.join(', ')}>Also typed as {variants.slice(0, 3).join(', ')}{variants.length > 3 ? ` +${variants.length - 3}` : ''}</p>}
                    {row.jobTitles?.length > 0 && <p className="mt-0.5 flex max-w-[18rem] items-center gap-1 truncate text-[11.5px] text-slate-400 dark:text-zinc-500" title="Most reported job titles"><Briefcase className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{row.jobTitles.slice(0, 3).join(' · ')}</span></p>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="tabular-nums"><span className="font-semibold">{row.voters}</span>{row.verifiedQuestions > 0 && <span className="ml-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">{plural(row.verifiedQuestions, 'verified tag')}</span>}</p>
                    {needed && Number.isFinite(row.bestQuestionVoters) ? <MiniMeter value={row.bestQuestionVoters} of={needed}
                      label={`Best question: ${row.bestQuestionVoters} of ${needed} students a question tag needs`} /> : null}
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums">{row.questions}</td>
                  {central && <td className="px-3 py-3 font-semibold tabular-nums">{row.universities}</td>}
                  <td className="px-3 py-3"><p className="text-[12.5px] text-slate-700 dark:text-zinc-200">{requestedRange(row.firstRequestedAt, row.lastRequestedAt)}</p><p className="mt-0.5 text-[11.5px] text-slate-400 dark:text-zinc-500">Latest {sinceLabel(row.lastRequestedAt)}</p></td>
                  <td className="px-3 py-3">{row.suggestion && ['pending', 'rejected'].includes(row.status)
                    ? <div className="flex items-center gap-2">
                      <span className="max-w-[11rem] truncate text-[12.5px] text-slate-500 dark:text-zinc-400" title={row.suggestion.name}>Similar to <span className="font-semibold text-slate-800 dark:text-zinc-100">{row.suggestion.name}</span></span>
                      <button type="button" disabled={Boolean(busyKey || bulk)} onClick={() => merge(row, row.suggestion)} aria-label={`Merge ${row.name} into ${row.suggestion.name}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[12px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 transition hover:bg-violet-100 disabled:opacity-40 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20 dark:hover:bg-violet-500/20"><GitMerge className="h-3.5 w-3.5" aria-hidden="true" />Merge</button>
                    </div> : <span className="text-xs text-slate-400 dark:text-zinc-500">—</span>}</td>
                  <td className="px-3 py-3"><CompanyStatus status={row.status} mergedInto={row.mergedInto} /></td>
                  <td className="py-2.5 pl-3 pr-4 text-right"><div className="flex justify-end"><RowMenu name={row.name} actions={actionsFor(row)} /></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
    {(rows.length > 0 || state.data?.pagination?.total > 0) && <Pager pagination={state.data?.pagination} count={rows.length} onPage={setPage} disabled={state.loading || Boolean(bulk)} />}

    {dialog?.type === 'rename' && <RenameDialog row={dialog.row} catalog={catalog} busy={busyKey === dialog.row.key} error={dialogError} onClose={() => setDialog(null)}
      onApprove={(name) => decide(dialog.row, { action: 'approve', name }, `Approved “${dialog.row.name}” as ${name}.`)} onMerge={(target) => merge(dialog.row, target)} />}
    {dialog?.type === 'merge' && <MergeDialog row={dialog.row} catalog={catalog} busy={busyKey === dialog.row.key} error={dialogError} onClose={() => setDialog(null)} onMerge={(target) => merge(dialog.row, target)} />}
  </section>;
}
