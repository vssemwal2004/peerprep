import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleCheck, Gauge, Layers3, PlayCircle, RefreshCw, Zap } from 'lucide-react';
import { api } from '../../utils/api';
import { Card, EmptyRow, Pill, ProgressBar } from '../../student/profile/ui';
import { DataTable } from '../../components/table';
import WindowChip from '../../student/quests/WindowChip';
import { hasWindow, windowText } from '../../student/quests/questWindow';
import { MetricTile, SearchInput } from './shared';
import { fmtDate, fmtRelative } from './utils';

const STATE = {
  completed: ['Completed', 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30'],
  'in-progress': ['In progress', 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30'],
  'not-started': ['Not started', 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700'],
};
const STATE_ORDER = { completed: 0, 'in-progress': 1, 'not-started': 2 };

/** The student's QuickPrep sheets: window, progress (window-limited) and dates, from GET /students/:id/quickprep. */
export default function QuickPrepTab({ studentId }) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try { setState({ data: await api.getStudentQuickPrepByAdmin(studentId), loading: false, error: '' }); }
    catch (cause) { setState({ data: null, loading: false, error: cause?.message || 'Quick Prep progress could not load.' }); }
  }, [studentId]);
  useEffect(() => { void load(); }, [load]);

  const sheets = useMemo(() => state.data?.sheets || [], [state.data]);
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => (term ? sheets.filter((sheet) => sheet.title.toLowerCase().includes(term)) : sheets), [sheets, term]);
  const columns = useMemo(() => [
    { key: 'title', label: 'Sheet', render: (sheet) => <div className="min-w-0"><p className="max-w-[16rem] truncate font-semibold text-slate-900 dark:text-zinc-100">{sheet.title}</p>{!sheet.visible && <p className="text-[11px] text-slate-400">No longer shown to the student</p>}</div> },
    { key: 'windowStatus', label: 'Window', value: (sheet) => sheet.startsAt || sheet.endsAt || null, render: (sheet) => <span className="flex flex-col items-start gap-0.5"><WindowChip quest={sheet} />{hasWindow(sheet) && <span className="text-[11px] text-slate-400">{windowText(sheet)}</span>}</span> },
    { key: 'state', label: 'Status', value: (sheet) => STATE_ORDER[sheet.state], render: (sheet) => <Pill className={STATE[sheet.state]?.[1]}>{STATE[sheet.state]?.[0]}</Pill> },
    { key: 'solved', label: 'Solved', align: 'right', render: (sheet) => <span className="font-semibold">{sheet.solved}<span className="font-normal text-slate-400">/{sheet.total}</span></span> },
    { key: 'progress', label: 'Progress', headerClassName: 'w-40', render: (sheet) => <div className="flex items-center gap-2"><ProgressBar value={sheet.progress} className="h-1.5 flex-1" colorClass={sheet.completedAt ? 'bg-emerald-500' : 'bg-sky-500'} label={`${sheet.title} progress ${sheet.progress}%`} /><span className="w-9 text-right text-[11px] tabular-nums text-slate-500">{sheet.progress}%</span></div> },
    { key: 'startedAt', label: 'Started on', className: 'whitespace-nowrap', render: (sheet) => fmtDate(sheet.startedAt) },
    { key: 'completedAt', label: 'Completed on', className: 'whitespace-nowrap', render: (sheet) => fmtDate(sheet.completedAt) },
    { key: 'lastActivity', label: 'Last activity', className: 'whitespace-nowrap', render: (sheet) => fmtRelative(sheet.lastActivity) },
  ], []);

  if (state.loading && !state.data) return <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" role="status" aria-label="Loading Quick Prep" />;
  if (state.error) {
    return <Card title="Quick Prep" icon={<Zap className="h-4 w-4" />}>
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
        {state.error}<button type="button" onClick={load} className="inline-flex items-center gap-1 font-semibold"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Retry</button>
      </div>
    </Card>;
  }
  const summary = state.data?.summary || {};
  if (state.data && state.data.enabled === false) return <Card title="Quick Prep" icon={<Zap className="h-4 w-4" />}><EmptyRow message="Quick Prep is not available to this student." /></Card>;

  return <div className="space-y-4">
    <Card id="quickprep-summary" title="Quick Prep summary" description="Sheets started and finished" icon={<Zap className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
        <MetricTile icon={<Layers3 className="h-3.5 w-3.5" />} tone="sky" label="Sheets available" value={summary.available ?? 0} helper="Shown to this student" />
        <MetricTile icon={<PlayCircle className="h-3.5 w-3.5" />} tone="amber" label="Sheets started" value={summary.started ?? 0} helper={`${summary.inProgress ?? 0} in progress`} />
        <MetricTile icon={<CircleCheck className="h-3.5 w-3.5" />} tone="emerald" label="Completed" value={summary.completed ?? 0} helper={`${summary.solved ?? 0} questions solved`} />
        <MetricTile icon={<Gauge className="h-3.5 w-3.5" />} tone="rose" label="Avg. progress" value={`${summary.averageProgress ?? 0}%`} helper="Across started sheets" />
      </div>
    </Card>
    <Card id="quickprep-sheets" title="Sheets" description="Only solves inside a sheet's start and end time count" icon={<Layers3 className="h-4 w-4" />}
      action={sheets.length > 5 ? <SearchInput value={search} onChange={setSearch} label="Search sheets" placeholder="Search sheets" /> : null}>
      {!sheets.length ? <EmptyRow message="No Quick Prep sheets yet." />
        : <DataTable columns={columns} rows={rows} noun="sheets" empty="No sheet matches." resetKey={term} tableClassName="w-full min-w-[860px]" />}
    </Card>
  </div>;
}
