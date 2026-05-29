import {
  ArrowDownRight, ArrowUpRight, ArrowRight, BookOpen, ChevronDown, ChevronUp,
  Clock, Copy, Download, Eye, GraduationCap, Layers, Save, Search,
  ShieldAlert, Sparkles, Target, Timer, Trophy, TrendingUp, User, X, Zap,
  LayoutDashboard, BarChart3,
} from 'lucide-react';
import { DonutChart, HorizontalProgress, Sparkline } from './ReportCharts';

/* ═════════════════ FORMATTERS ═════════════════ */
export const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const formatShortDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
export const formatDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

/* ═════════════════ STATUS METADATA ═════════════════ */
export const statusMeta = {
  submitted: { label: 'Completed', tone: 'emerald', icon: Trophy },
  violation: { label: 'Violation', tone: 'rose', icon: ShieldAlert },
  in_progress: { label: 'In Progress', tone: 'sky', icon: Clock },
  expired: { label: 'Expired', tone: 'amber', icon: Timer },
  incomplete: { label: 'Incomplete', tone: 'slate', icon: BookOpen },
};
export const assessmentStatusMeta = {
  draft: { label: 'Draft', bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  published: { label: 'Published', bg: 'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300' },
  archived: { label: 'Archived', bg: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300' },
};

/* ═════════════════ BADGES ═════════════════ */
export function TrendBadge({ change, suffix = '%', invert = false }) {
  if (change === undefined || change === null) return null;
  const up = change > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : change < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${good ? 'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300' : 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300'}`}>
      <Icon className="h-3 w-3" />{Math.abs(change)}{suffix}
    </span>
  );
}

const statusBgMap = {
  emerald: 'bg-lime-50 text-lime-700 border border-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:border-lime-800',
  rose: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
  sky: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
  amber: 'bg-lime-50 text-lime-700 border border-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:border-lime-800',
  slate: 'bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export function StatusBadge({ value, type = 'student' }) {
  const meta = type === 'assessment' ? assessmentStatusMeta[value] || assessmentStatusMeta.draft : statusMeta[value] || statusMeta.incomplete;
  const Icon = meta.icon || BookOpen;
  const bg = type === 'assessment' ? meta.bg : statusBgMap[meta.tone] || statusBgMap.slate;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${bg}`}>
      {type !== 'assessment' && <Icon className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

/* ═════════════════ KPI CARD ═════════════════ */
export function KpiCard({ icon: Icon, label, value, sub, insight, trend, chart, tone = 'sky' }) {
  const toneBg =
    tone === 'lime' ? 'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300'
    : tone === 'emerald' ? 'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300'
    : tone === 'rose' ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300'
    : tone === 'amber' ? 'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300'
    : tone === 'violet' ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300'
    : 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300';
  return (
    <div className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneBg}`}><Icon className="h-5 w-5" /></div>
        {trend !== undefined && <TrendBadge change={trend} />}
      </div>
      <div className="mt-3 min-w-0">
        <div className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white" title={String(value ?? '')}>{value}</div>
        <div className="mt-0.5 text-xs font-medium text-slate-500 dark:text-gray-400">{label}</div>
      </div>
      {chart && <div className="mt-3 opacity-60 transition-opacity group-hover:opacity-100">{chart}</div>}
      {insight && <div className="mt-2 text-[11px] leading-relaxed text-slate-400 dark:text-gray-500">{insight}</div>}
      {sub && <div className="mt-1 text-[11px] text-slate-400 dark:text-gray-500">{sub}</div>}
    </div>
  );
}

/* ═════════════════ FILTER CHIP ═════════════════ */
export function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
      {label}
      <button onClick={onRemove} className="rounded-sm p-0.5 hover:bg-sky-100 dark:hover:bg-sky-800"><X className="h-3 w-3" /></button>
    </span>
  );
}

/* ═════════════════ SORT HEADER ═════════════════ */
export function SortHeader({ label, sortKey, currentSort, onSort, align = 'left' }) {
  const active = currentSort.key === sortKey;
  return (
    <th onClick={() => onSort(sortKey)} className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      <span className="inline-flex items-center gap-1">{label}{active && (currentSort.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-sky-600" /> : <ChevronDown className="h-3 w-3 text-sky-600" />)}</span>
    </th>
  );
}

/* ═════════════════ ASSESSMENT LIST ITEM ═════════════════ */
export function AssessmentListItem({ assessment, isActive, onClick, stats }) {
  return (
    <button onClick={onClick} className={`flex w-full flex-col gap-2 rounded-xl border p-3.5 text-left transition-all ${isActive ? 'border-sky-300 bg-sky-50 shadow-sm dark:border-sky-700 dark:bg-sky-900/15' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{assessment.title || 'Untitled'}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-[10px] font-medium text-slate-400 dark:text-gray-500">{assessment.assessmentType || 'mixed'}</span>
            <span className="h-3 w-px bg-slate-200 dark:bg-gray-700" />
            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${assessmentStatusMeta[assessment.lifecycleStatus]?.bg || assessmentStatusMeta.draft.bg}`}>
              {assessmentStatusMeta[assessment.lifecycleStatus]?.label || 'Draft'}
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-bold text-slate-900 dark:text-white">{assessment.attempted || 0}</div>
          <div className="text-[10px] text-slate-400 dark:text-gray-500">attempts</div>
        </div>
      </div>
      {stats && (
        <div className="mt-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-gray-500">
            <span>Avg score</span>
            <span className="font-medium text-slate-600 dark:text-gray-300">{stats.avgScore?.toFixed?.(1) || 0}%</span>
          </div>
          <HorizontalProgress value={stats.avgScore || 0} max={100} height={3} color="#0ea5e9" />
        </div>
      )}
    </button>
  );
}

/* ═════════════════ TABLE EMPTY STATE ═════════════════ */
export function TableEmpty() {
  return (
    <tr><td colSpan={12} className="px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-gray-800">
          <Search className="h-6 w-6 text-slate-300 dark:text-gray-600" />
        </div>
        <div className="text-sm font-semibold text-slate-700 dark:text-gray-300">No candidates found</div>
        <div className="max-w-xs text-xs text-slate-400 dark:text-gray-500">Adjust your filters or search to see results.</div>
      </div>
    </td></tr>
  );
}

/* ═════════════════ TABLE ROW ═════════════════ */
export function TableRow({ row, idx, pagination, visibleColumns, openStudentDetail, openViolationReport, toast }) {
  const getInitials = (name) => (name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <tr key={row._id} className="group cursor-pointer text-slate-700 transition-colors hover:bg-sky-50/40 dark:text-slate-200 dark:hover:bg-sky-900/10" onClick={() => openStudentDetail(row)}>
      <td className="px-4 py-3 text-[11px] text-slate-400 dark:text-gray-500">{(pagination.page - 1) * pagination.limit + idx + 1}</td>
      {visibleColumns.student && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-[10px] font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">{getInitials(row.studentName)}</div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{row.studentName || 'Unknown'}</div>
              <div className="text-[10px] tabular-nums text-slate-400 dark:text-gray-500">{row.studentId || row.studentRollNo || '—'}</div>
            </div>
          </div>
        </td>
      )}
      {visibleColumns.attemptDate && <td className="px-4 py-3 text-xs text-slate-600 dark:text-gray-300">{formatDateTime(row.attemptDate)}</td>}
      {visibleColumns.attempts && <td className="px-4 py-3 text-center text-xs">{row.attempts || 1}</td>}
      {visibleColumns.score && (
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <DonutChart value={row.score || 0} total={row.totalMarks || 100} size={32} stroke={3} />
            <span className="text-sm font-bold text-slate-900 dark:text-white">{row.score ?? 0}<span className="text-[10px] font-normal text-slate-400 dark:text-gray-500">/{row.totalMarks || 100}</span></span>
          </div>
        </td>
      )}
      {visibleColumns.accuracy && (
        <td className="px-4 py-3 text-center">
          <div className="mx-auto w-24">
            <div className="text-[10px] text-slate-400 dark:text-gray-500">{row.accuracy ?? 0}%</div>
            <HorizontalProgress value={row.accuracy || 0} max={100} height={3} color={row.accuracy >= 75 ? '#84cc16' : '#0ea5e9'} />
          </div>
        </td>
      )}
      {visibleColumns.time && <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600 dark:text-gray-300">{formatDuration(row.timeTakenSec)}</td>}
      {visibleColumns.violations && (
        <td className="px-4 py-3 text-center">
          {row.violationCount ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); openViolationReport(row._id); }} className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/30">
              <ShieldAlert className="h-3 w-3" />{row.violationCount}
            </button>
          ) : (<span className="text-xs text-slate-300 dark:text-gray-600">—</span>)}
        </td>
      )}
      {visibleColumns.status && (
        <td className="px-4 py-3 text-center">
          <StatusBadge value={row.status} />
        </td>
      )}
      {visibleColumns.rank && <td className="px-4 py-3 text-center text-xs font-semibold">{row.rank ?? '—'}</td>}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={(e) => { e.stopPropagation(); openStudentDetail(row); }} className="rounded-md p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-sky-900/20 dark:hover:text-sky-400" title="View report"><Eye className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(row.studentId || row._id); toast.success('ID copied'); }} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200" title="Copy ID"><Copy className="h-3.5 w-3.5" /></button>
        </div>
      </td>
    </tr>
  );
}

/* ═════════════════ SKELETON ROW ═════════════════ */
export function SkeletonRow() {
  return (
    <tr><td colSpan={12} className="px-4 py-3">
      <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800" />
    </td></tr>
  );
}
