import { useEffect, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { formatRelativeAge } from './rosterModel';

const REFRESH_INTERVAL_OPTIONS = [
  { value: 15000, label: 'Every 15 s' },
  { value: 30000, label: 'Every 30 s' },
  { value: 60000, label: 'Every 1 min' },
  { value: 0, label: 'Manual only' },
];

/** Ring that empties as the next automatic update approaches. */
function CountdownRing({ fraction, active }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] -rotate-90" aria-hidden="true">
      <circle cx="9" cy="9" r={radius} fill="none" strokeWidth="2" className="stroke-slate-200 dark:stroke-gray-700" />
      {active && (
        <circle
          cx="9" cy="9" r={radius} fill="none" strokeWidth="2" strokeLinecap="round"
          className="stroke-sky-500 transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      )}
    </svg>
  );
}

/**
 * Live status, last-update age, countdown to the next batched update, the
 * update interval and a manual refresh, in one compact control.
 */
export default function LiveRefreshControl({ roster, intervalMs, onIntervalChange, onRefresh }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const secondsLeft = roster.nextRefreshAt ? Math.max(0, Math.ceil((roster.nextRefreshAt - now) / 1000)) : null;
  const fraction = intervalMs && secondsLeft != null ? Math.min(1, secondsLeft / (intervalMs / 1000)) : 0;
  const statusLabel = roster.live ? 'Live' : roster.mode === 'legacy' ? 'Polling' : 'Reconnecting';
  const statusTitle = roster.live
    ? 'Connected. Changes are collected and applied together on each update.'
    : 'Live connection unavailable. The report still updates on every interval.';

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="hidden items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-900 md:flex">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-gray-200" title={statusTitle}>
          <span className="relative flex h-2 w-2">
            {roster.live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${roster.live ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          </span>
          {statusLabel}
        </span>
        <span className="h-4 w-px bg-slate-200 dark:bg-gray-700" />
        <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
          <CountdownRing fraction={fraction} active={Boolean(intervalMs)} />
          {roster.refreshing
            ? 'Updating…'
            : `Updated ${formatRelativeAge(roster.lastUpdatedAt, now)}`}
          {intervalMs && secondsLeft != null && !roster.refreshing ? <span className="tabular-nums text-slate-400 dark:text-gray-500">· next in {secondsLeft}s</span> : null}
        </span>
        {roster.pendingChanges && !roster.refreshing && (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">New activity</span>
        )}
      </div>

      <label className="relative hidden sm:block">
        <span className="sr-only">Automatic update interval</span>
        <select
          value={intervalMs}
          onChange={(event) => onIntervalChange(Number(event.target.value))}
          className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900"
        >
          {REFRESH_INTERVAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </label>

      <button
        type="button"
        onClick={onRefresh}
        disabled={roster.loading || roster.refreshing}
        title="Refresh now"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-wait disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <RotateCcw className={`h-3.5 w-3.5 ${roster.refreshing || roster.loading ? 'animate-spin' : ''}`} />
        <span className="hidden lg:inline">Refresh</span>
      </button>
    </div>
  );
}
