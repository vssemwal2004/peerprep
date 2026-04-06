import { difficultyBadgeClass, problemStatusClass, submissionStatusClass } from './compilerUtils';

export function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      {(title || subtitle || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-900 dark:text-gray-100">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ label, value, helper, Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-gray-100">{value}</p>
          {helper && <p className="mt-1 text-xs text-slate-400 dark:text-gray-500">{helper}</p>}
        </div>
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export function LoadingPanel({ label = 'Loading data...' }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-gray-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500 dark:border-gray-700 dark:border-t-sky-400" />
        {label}
      </div>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center dark:border-gray-700">
      <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">{title}</p>
      <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

export function MiniBarChart({ data, labelKey = 'label', valueKey = 'count' }) {
  const maxValue = Math.max(...data.map((item) => item[valueKey] || 0), 1);

  return (
    <div className="flex h-56 items-end gap-3">
      {data.map((item) => {
        const value = item[valueKey] || 0;
        const height = Math.max((value / maxValue) * 100, value > 0 ? 10 : 4);
        return (
          <div key={item[labelKey]} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500 dark:text-gray-400">{value}</span>
            <div className="flex h-40 w-full items-end rounded-2xl bg-slate-100 px-1.5 py-1.5 dark:bg-gray-800">
              <div className="w-full rounded-xl bg-gradient-to-t from-sky-500 to-sky-300" style={{ height: `${height}%` }} />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-gray-400">{item[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressList({ items, labelKey = 'label', valueKey = 'count' }) {
  const maxValue = Math.max(...items.map((item) => item[valueKey] || 0), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const value = item[valueKey] || 0;
        const width = (value / maxValue) * 100;
        return (
          <div key={item[labelKey]} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700 dark:text-gray-200">{item[labelKey]}</span>
              <span className="text-slate-500 dark:text-gray-400">{value}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-300" style={{ width: `${Math.max(width, value > 0 ? 8 : 0)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DifficultyBadge({ difficulty }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${difficultyBadgeClass(difficulty)}`}>{difficulty}</span>;
}

export function ProblemStatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  const label = normalized === 'published' || normalized === 'active'
    ? 'Published'
    : (normalized === 'draft' ? 'Draft' : (status || 'Draft'));
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${problemStatusClass(status)}`}>{label}</span>;
}
export function SubmissionStatusBadge({ status }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${submissionStatusClass(status)}`}>{status}</span>;
}


