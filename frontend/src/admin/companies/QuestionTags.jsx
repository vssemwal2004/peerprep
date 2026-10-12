import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Building2, Globe2, Hourglass, Search, Tags } from 'lucide-react';
import { api } from '../../utils/api';
import { Notice, ProgressBar, SearchBox, Segmented, card } from '../quickprep/ui';
import { formatDate } from '../quickprep/format';
import { EmptyState, TableSkeleton } from './companyUi';
import { useDebounced } from './companyHelpers';

const TAG_LIMIT = 100;
const FILTERS = [{ value: 'all', label: 'All' }, { value: 'verified', label: 'Verified' }, { value: 'collecting', label: 'Collecting' }];
const EMPTY = {
  all: ['No interview reports yet', 'Question and company pairs appear here as students report interviews after solving.'],
  verified: ['No verified tags yet', 'A tag is verified once enough different students confirm it.'],
  collecting: ['Nothing collecting', 'Every reported tag has reached the threshold.'],
};
// Reports are stored under 'control' (central/shared library) or 'university:<id>' (a campus's own questions).
const isShared = (scopeKey = '') => scopeKey === 'control';

/** Question tags view: each (question, approved company) pair and how close it is to becoming visible. */
export default function QuestionTags({ threshold, version }) {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [state, setState] = useState({ rows: [], threshold: null, loading: true, error: '' });
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await api.companyTagProgress({ status, limit: TAG_LIMIT, ...(term ? { search: term } : {}) });
      if (id === latest.current) setState({ rows: data.rows || [], threshold: data.threshold ?? null, loading: false, error: '' });
    } catch (cause) {
      if (id === latest.current) setState((previous) => ({ ...previous, loading: false, error: cause.message || 'Question tags could not load.' }));
    }
  }, [status, term]);
  useEffect(() => { void load(); }, [load, version]);

  const needed = state.threshold ?? threshold;
  const { rows } = state;
  const [emptyTitle, emptyText] = EMPTY[status];
  return <section className={card} aria-labelledby="question-tags-title">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-zinc-800">
      <div className="mr-auto min-w-0">
        <h2 id="question-tags-title" className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Question tags</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-zinc-400">{needed ? `Collecting tags become visible to students at ${needed} confirmations.` : 'Collecting tags become visible to students once enough students confirm them.'}</p>
      </div>
      <Segmented label="Tag status" value={status} onChange={setStatus} options={FILTERS} />
      <div className="w-full sm:w-auto sm:min-w-[16rem]"><SearchBox value={search} onChange={setSearch} placeholder="Search question or company" label="Search question tags" /></div>
    </div>

    {state.error && <div className="p-4"><Notice tone="error">{state.error} <button type="button" className="font-semibold underline" onClick={load}>Retry</button></Notice></div>}
    {state.loading && !rows.length ? <TableSkeleton />
      : !rows.length ? (!state.error && (term ? <EmptyState icon={Search} title={`Nothing matches “${term}”`}>Try a different question title or company.</EmptyState> : <EmptyState icon={Tags} title={emptyTitle}>{emptyText}</EmptyState>))
        : <div className={`overflow-x-auto transition-opacity ${state.loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[920px] whitespace-nowrap text-left text-sm">
            <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th scope="col" className="py-3 pl-4 pr-3">Question</th>
                <th scope="col" className="px-3 py-3">Source</th>
                <th scope="col" className="px-3 py-3">Company</th>
                <th scope="col" className="w-56 px-3 py-3">Confirmations</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="py-3 pl-3 pr-4">Last reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {rows.map((row) => {
                const of = row.threshold || needed || 1;
                const shared = isShared(row.scopeKey);
                return <tr key={`${row.scopeKey}:${row.questionId}:${row.companyKey}`} className="transition hover:bg-sky-50/40 dark:hover:bg-zinc-800/40">
                  <td className="py-3 pl-4 pr-3">
                    <p className="max-w-[20rem] truncate font-semibold text-slate-900 dark:text-zinc-50" title={row.questionTitle || undefined}>{row.questionTitle || 'Campus question'}</p>
                    {row.scopeLabel && <p className="mt-0.5 max-w-[20rem] truncate text-[12px] text-slate-500 dark:text-zinc-400">{row.scopeLabel}</p>}
                  </td>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold ${shared ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
                    {shared ? <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Building2 className="h-3.5 w-3.5" aria-hidden="true" />}{shared ? 'Central' : 'University'}</span></td>
                  <td className="px-3 py-3 font-semibold text-slate-800 dark:text-zinc-100">{row.company}</td>
                  <td className="px-3 py-3">
                    <ProgressBar value={Math.round((row.voters / of) * 100)} tone={row.verified ? 'bg-emerald-500' : 'bg-sky-500'} label={`${row.voters} of ${of} confirmations for ${row.company}`} />
                    <p className="mt-1 text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400"><span className="font-semibold text-slate-700 dark:text-zinc-200">{row.voters}</span> / {of} students</p>
                  </td>
                  <td className="px-3 py-3">{row.verified
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Verified</span>
                    : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700"><Hourglass className="h-3.5 w-3.5" aria-hidden="true" />Collecting</span>}</td>
                  <td className="py-3 pl-3 pr-4 text-[12.5px] text-slate-500 dark:text-zinc-400">{formatDate(row.latestDate)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
    {rows.length > 0 && <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
      {rows.length >= TAG_LIMIT ? `Showing the first ${TAG_LIMIT} tags. Search to narrow the list.` : `Showing ${rows.length} ${rows.length === 1 ? 'tag' : 'tags'}`}
    </p>}
  </section>;
}
