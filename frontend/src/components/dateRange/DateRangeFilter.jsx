import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { DATE_RANGE_PRESETS, dayKey, normalizeDateRange, rangeLabel } from './dateRangeModel';

/**
 * The period picker shared by every analysis screen: preset list + "Custom range" with From / To dates.
 * value / onChange use the { preset, from, to } shape from dateRangeModel.js.
 * `presets` narrows the preset list (values from DATE_RANGE_PRESETS) when a page supports fewer.
 */
export default function DateRangeFilter({ value, onChange, presets, className = '', align = 'left', disabled = false, label = 'Period' }) {
  const range = normalizeDateRange(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: range.from || '', to: range.to || '' });
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const options = presets ? DATE_RANGE_PRESETS.filter((item) => presets.includes(item.value)) : DATE_RANGE_PRESETS;
  const today = dayKey();

  useEffect(() => {
    if (!open) return undefined;
    setDraft({ from: range.from || '', to: range.to || '' });
    setError('');
    const onPointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (preset) => { onChange?.({ preset }); setOpen(false); };
  const applyCustom = () => {
    if (!draft.from && !draft.to) { setError('Choose a start or an end date.'); return; }
    if (draft.from && draft.to && draft.from > draft.to) { setError('The start date must be on or before the end date.'); return; }
    onChange?.({ preset: 'custom', from: draft.from, to: draft.to });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${rangeLabel(range)}`}
        className="inline-flex h-9 max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm outline-none transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-sky-500/50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        <CalendarRange className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate">{rangeLabel(range)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Choose a period"
          className={`absolute z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <ul className="space-y-0.5">
            {options.map((item) => (
              <li key={item.value}>
                <button
                  type="button"
                  onClick={() => pick(item.value)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] ${range.preset === item.value ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-zinc-200 dark:hover:bg-white/[0.05]'}`}
                >
                  {item.label}
                  {range.preset === item.value ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-slate-100 pt-2 dark:border-zinc-800">
            <p className={`px-1 text-[12px] font-semibold ${range.preset === 'custom' ? 'text-sky-700 dark:text-sky-300' : 'text-slate-600 dark:text-zinc-300'}`}>Custom range</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2 px-1">
              <label className="text-[11px] text-slate-500 dark:text-zinc-400">
                From
                <input type="date" value={draft.from} max={draft.to || today} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                  className="mt-0.5 block h-8 w-full rounded-lg border border-slate-200 bg-white px-1.5 text-[12.5px] text-slate-800 outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
              </label>
              <label className="text-[11px] text-slate-500 dark:text-zinc-400">
                To
                <input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                  className="mt-0.5 block h-8 w-full rounded-lg border border-slate-200 bg-white px-1.5 text-[12.5px] text-slate-800 outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
              </label>
            </div>
            {error ? <p role="alert" className="mt-1.5 px-1 text-[11.5px] text-rose-600 dark:text-rose-400">{error}</p> : null}
            <div className="mt-2 flex justify-end gap-2 px-1 pb-0.5">
              <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg px-3 text-[12.5px] text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">Cancel</button>
              <button type="button" onClick={applyCustom} className="h-8 rounded-lg bg-sky-600 px-3 text-[12.5px] font-semibold text-white hover:bg-sky-700">Apply</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
