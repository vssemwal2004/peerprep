export const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-sky-900/40';
export const card = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900';
export const sectionTitle = 'text-base font-bold text-slate-950 dark:text-white';
export const helperText = 'text-xs text-slate-500 dark:text-slate-400';

export function NumberField({ label, symbol, value, onChange, min = 0, max, step = 'any', helper, suffix, compact = false }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span className="flex items-center gap-1.5">
        {label}
        {symbol && <var className="rounded-md bg-sky-50 px-1.5 font-mono text-xs not-italic text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{symbol}</var>}
      </span>
      <span className="relative mt-1 block">
        <input
          className={`${inputClass} ${suffix ? 'pr-8' : ''} ${compact ? 'py-1.5' : ''}`}
          type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step}
          onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{suffix}</span>}
      </span>
      {helper && <span className={`mt-1 block font-normal ${helperText}`}>{helper}</span>}
    </label>
  );
}

export function LevelSelect({ value, onChange, label, disabled = false }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
      {label}
      <select className={`${inputClass} mt-1`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option>Easy</option><option>Medium</option><option>Hard</option>
      </select>
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}
