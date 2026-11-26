// Prep Mock builder, Schedule step: only the test length. Prep Mocks have no dates: they are
// always open, universities get them for their package period and own students at any time.
import { Building2, Clock, Infinity as InfinityIcon, Timer, UserRound } from 'lucide-react';
import { formatTestLength as formatMinutes } from '../../features/prepMock/patternModel';

const PRESETS = [
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1.5 hours' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
];

const MAX_MOCK_MINUTES = 600;

export default function MockScheduleStep({ duration, onChange, patternMinutes = 0, readOnly = false }) {
  const value = Number(duration) || 0;
  const isPreset = PRESETS.some((preset) => preset.minutes === value);
  const patternTime = Math.round(Number(patternMinutes) || 0);
  const setMinutes = (next) => {
    const minutes = Math.min(MAX_MOCK_MINUTES, Math.max(0, Math.round(Number(next) || 0)));
    onChange(minutes);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-800 dark:bg-gray-900" aria-labelledby="mock-length-title">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300"><Timer className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 id="mock-length-title" className="text-sm font-semibold text-slate-900 dark:text-white">Test length <span className="text-rose-500">*</span></h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">How long one attempt lasts. The timer starts when the student begins and the test submits itself at the end.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Test length">
          {PRESETS.map((preset) => {
            const active = preset.minutes === value;
            return (
              <button
                key={preset.minutes}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readOnly}
                onClick={() => setMinutes(preset.minutes)}
                className={`h-11 rounded-xl border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed ${active
                  ? 'border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sky-700 dark:hover:bg-gray-800'}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">Custom length</span>
            <span className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min="1"
                max={MAX_MOCK_MINUTES}
                inputMode="numeric"
                disabled={readOnly}
                value={value || ''}
                onChange={(event) => setMinutes(event.target.value)}
                aria-label="Test length in minutes"
                className={`h-10 w-28 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-sky-950 ${!isPreset && value > 0 ? 'border-sky-400 dark:border-sky-600' : 'border-slate-200 dark:border-gray-700'}`}
              />
              <span className="text-xs text-slate-500 dark:text-gray-400">minutes</span>
            </span>
          </label>
          {patternTime > 0 && (
            <button
              type="button"
              disabled={readOnly || patternTime === value}
              onClick={() => setMinutes(patternTime)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-default disabled:opacity-60 dark:border-violet-900/60 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
            >
              <Clock className="h-3.5 w-3.5" />
              {patternTime === value ? `Matches pattern time (${formatMinutes(patternTime)})` : `Use pattern time (${patternTime} min)`}
            </button>
          )}
        </div>
        {!(value > 0) && <p role="alert" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-300">Choose a length to continue.</p>}
        {value > 0 && patternTime > 0 && patternTime !== value && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200">
            The pattern adds up to {patternTime} min; the test will run for {value} min. Students see both, so keep them the same unless you mean it.
          </p>
        )}
      </section>

      <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-gray-500">Availability</p>
        <p className="flex items-start gap-2 text-slate-600 dark:text-gray-300"><InfinityIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" /><span><strong className="font-semibold text-slate-800 dark:text-white">Always open.</strong> Prep Mocks have no start or end date.</span></p>
        <p className="flex items-start gap-2 text-slate-600 dark:text-gray-300"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" /><span>Universities get the mock for their package period (University → Plan).</span></p>
        <p className="flex items-start gap-2 text-slate-600 dark:text-gray-300"><UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" /><span>Own platform students can take it any time after you add them.</span></p>
        <p className="border-t border-slate-100 pt-2 text-slate-500 dark:border-gray-800 dark:text-gray-400">Selected: <strong className="text-slate-800 dark:text-white">{formatMinutes(value)}</strong></p>
      </aside>
    </div>
  );
}
