import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { LEVELS, MODULES, simulate } from './engine';
import { card, helperText, inputClass, sectionTitle } from './fields';

const SAMPLE = {
  coding: { Easy: 12, Medium: 8, Hard: 3 },
  assessment: { Easy: 1, Medium: 2, Hard: 1 },
  interview: { Easy: 0, Medium: 2, Hard: 1 },
  learning: { Easy: 6, Medium: 4, Hard: 2 },
};
const format = (value, places) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: places });

/**
 * Type a student's coding solves and see the Prep Score under the values on screen. Same maths as
 * the points ledger (prepScore/points.js) for solves only: activity points = solves × solve points,
 * Prep Score = scale × points^exponent. The old formula result stays as the Prep Coding metric.
 */
export default function Simulator({ config }) {
  const [counts, setCounts] = useState(SAMPLE);
  const result = useMemo(() => {
    const formula = simulate(config, counts);
    const points = config.points || {};
    const activity = LEVELS.reduce((sum, level) => sum + (counts.coding[level] || 0) * (points.solve?.[level] || 0), 0);
    const { scale = 1, exponent = 1 } = points.curve || {};
    return { modules: formula.modules, activity, total: scale * Math.max(0, activity) ** exponent };
  }, [config, counts]);
  const places = config.points?.decimalPlaces ?? config.formula.decimalPlaces;
  const setCount = (moduleKey, level, value) => setCounts((previous) => ({
    ...previous, [moduleKey]: { ...previous[moduleKey], [level]: Math.max(0, Math.min(100000, Number(value) || 0)) },
  }));
  return (
    <section data-guide="psa-simulator" className={card} aria-labelledby="simulator-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-sky-600" aria-hidden="true" /><h2 id="simulator-title" className={sectionTitle}>Try it on a student</h2></div>
        <button type="button" onClick={() => setCounts(SAMPLE)} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">Reset sample</button>
      </div>
      <p className={`mt-1 ${helperText}`}>Verified coding solves by difficulty, using the values on this page (unsaved too). Solves only: logins, challenges, sheets and badges add more.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm" data-no-serial>
          <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 text-left font-semibold">Module</th>{LEVELS.map((level) => <th key={level} className="px-2 py-2 text-left font-semibold">{level}</th>)}<th className="py-2 text-right font-semibold">Coding metric</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {MODULES.filter(({ key }) => key === 'coding').map(({ key, label }) => (
              <tr key={key}>
                <td className="py-2 pr-2 font-medium text-slate-800 dark:text-slate-200">{label}</td>
                {LEVELS.map((level) => (
                  <td key={level} className="px-2 py-2"><input aria-label={`${label} ${level}`} className={`${inputClass} w-20 py-1.5`} type="number" min={0} value={counts[key][level]} onChange={(event) => setCount(key, level, event.target.value)} /></td>
                ))}
                <td className="py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{format(result.modules[key], places)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-slate-200 dark:border-slate-700"><td className="pt-3 font-bold" colSpan={4}>Prep Score <span className="font-normal text-slate-500">({format(result.activity, 2)} activity points)</span></td><td className="pt-3 text-right text-xl font-bold tabular-nums text-sky-700 dark:text-sky-300">{format(result.total, places)}</td></tr></tfoot>
        </table>
      </div>
    </section>
  );
}
