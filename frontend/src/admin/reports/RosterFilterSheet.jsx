import { useEffect, useRef } from 'react';
import { Filter, X } from 'lucide-react';
import {
  ROSTER_EVALUATION_OPTIONS, ROSTER_STATUS_OPTIONS, ROSTER_TYPE_OPTIONS,
} from './rosterModel';

const SCORE_PRESETS = [
  { label: 'Below 40%', min: '', max: '39.9' },
  { label: '40–75%', min: '40', max: '75' },
  { label: 'Above 75%', min: '75.1', max: '' },
];

function Section({ title, children }) {
  return (
    <section className="border-b border-slate-100 px-5 py-4 dark:border-gray-800">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-gray-400">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1.5">
      <span>
        <span className="block text-sm font-medium text-slate-800 dark:text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-gray-400">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
        <span className="h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-sky-600 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 dark:bg-gray-700" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

/**
 * Candidate filters in a side sheet. Every change applies at once and the sheet
 * stays open; it closes only on Done, the backdrop or Escape.
 */
export default function RosterFilterSheet({ open, filters, statusCounts, matchCount, totalCount, onChange, onToggleStatus, onClear, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;
  const activePreset = SCORE_PRESETS.find((preset) => preset.min === filters.scoreMin && preset.max === filters.scoreMax);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="roster-filter-title">
      <button type="button" aria-label="Close filters" onClick={onClose} className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl outline-none animate-[reportSheetIn_200ms_ease-out] dark:bg-gray-950"
      >
        <style>{'@keyframes reportSheetIn{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}'}</style>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-800">
          <h2 id="roster-filter-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Filter className="h-4 w-4 text-sky-600" />
            Filter candidates
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Status">
            <div className="flex flex-wrap gap-1.5">
              {ROSTER_STATUS_OPTIONS.map((option) => {
                const active = filters.statuses.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onToggleStatus(option.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}
                  >
                    {option.label}
                    <span className={`tabular-nums ${active ? 'text-sky-100' : 'text-slate-400'}`}>{statusCounts[option.value] || 0}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Evaluation">
            <Segmented label="Evaluation" options={ROSTER_EVALUATION_OPTIONS} value={filters.evaluation} onChange={(value) => onChange('evaluation', value)} />
          </Section>

          <Section title="Submission">
            <Segmented label="Submission" options={ROSTER_TYPE_OPTIONS} value={filters.submissionType} onChange={(value) => onChange('submissionType', value)} />
          </Section>

          <Section title="Score">
            <div className="flex flex-wrap gap-1.5">
              {SCORE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={activePreset === preset}
                  onClick={() => { onChange('scoreMin', activePreset === preset ? '' : preset.min); onChange('scoreMax', activePreset === preset ? '' : preset.max); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${activePreset === preset ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input type="number" min={0} max={100} inputMode="decimal" placeholder="Min %" value={filters.scoreMin} onChange={(event) => onChange('scoreMin', event.target.value)} aria-label="Minimum score percentage" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
              <span className="text-xs text-slate-400">to</span>
              <input type="number" min={0} max={100} inputMode="decimal" placeholder="Max %" value={filters.scoreMax} onChange={(event) => onChange('scoreMax', event.target.value)} aria-label="Maximum score percentage" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
            </div>
          </Section>

          <Section title="Integrity">
            <Toggle checked={filters.flaggedOnly} onChange={(value) => onChange('flaggedOnly', value)} label="Flagged sessions" hint="Marked for review by proctoring" />
            <Toggle checked={filters.hasViolations} onChange={(value) => onChange('hasViolations', value)} label="Any violation" hint="Tab switches, fullscreen exits, camera or AI flags" />
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-gray-800">
          <button type="button" onClick={onClear} className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white">Clear all</button>
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500">
            Show {matchCount} of {totalCount}
          </button>
        </footer>
      </div>
    </div>
  );
}
