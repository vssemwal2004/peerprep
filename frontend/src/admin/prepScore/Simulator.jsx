import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { LEVELS, simulate } from './engine';
import { card, helperText, inputClass, sectionTitle } from './fields';

const SAMPLE = { coding: { Easy: 12, Medium: 8, Hard: 3 } };
const format = (value, places) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: places });

/** Type a student's Easy/Medium/Hard solves and see their Prep Score under the values on screen. */
export default function Simulator({ config }) {
  const [counts, setCounts] = useState(SAMPLE);
  const result = useMemo(() => simulate(config, counts), [config, counts]);
  const places = config.formula.decimalPlaces;
  const setCount = (level, value) => setCounts((previous) => ({
    coding: { ...previous.coding, [level]: Math.max(0, Math.min(100000, Number(value) || 0)) },
  }));
  return (
    <section className={card} aria-labelledby="simulator-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-sky-600" aria-hidden="true" /><h2 id="simulator-title" className={sectionTitle}>Try it on a student</h2></div>
        <button type="button" onClick={() => setCounts(SAMPLE)} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">Reset sample</button>
      </div>
      <p className={`mt-1 ${helperText}`}>Problems solved that count. Uses the values on this page, including unsaved changes.</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {LEVELS.map((level) => (
          <label key={level} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{level}
            <input aria-label={`${level} solved`} className={`${inputClass} mt-1 py-1.5`} type="number" min={0} value={counts.coding[level]} onChange={(event) => setCount(level, event.target.value)} />
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t-2 border-slate-200 pt-3 dark:border-slate-700">
        <span className="font-bold text-slate-900 dark:text-white">Prep Score</span>
        <span id="simulator-total" className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-300">{format(result.total, places)}</span>
      </div>
    </section>
  );
}
