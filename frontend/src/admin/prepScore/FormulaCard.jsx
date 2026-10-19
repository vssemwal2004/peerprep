import { Sigma } from 'lucide-react';
import { MODULES } from './engine';
import { card, helperText, NumberField, sectionTitle } from './fields';

const V = ({ children }) => <var className="font-semibold not-italic text-sky-700 dark:text-sky-300">{children}</var>;

/** The formula with named variables, and the global variables the Master Admin sets. */
export default function FormulaCard({ config, update }) {
  const { formula } = config;
  const rows = [
    ['E, M, H', 'Easy, Medium and Hard activities a student has completed in the module', 'Counted from their work'],
    ['e, m, h', 'Points for one Easy, Medium and Hard activity', 'Set per module below'],
    ['N', 'Activity volume: E + M + H', 'Calculated'],
    ['Q', 'Average points per activity: (e·E + m·M + h·H) ÷ N', 'Calculated'],
    ['W', 'Module weight in the overall average', 'Set per module below'],
  ];
  return (
    <section className={card} aria-labelledby="formula-title">
      <div className="flex items-center gap-2"><Sigma className="h-5 w-5 text-sky-600" aria-hidden="true" /><h2 id="formula-title" className={sectionTitle}>Formula</h2></div>
      <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 font-mono text-sm text-slate-800 dark:bg-slate-800/60 dark:text-slate-100 lg:grid-cols-2">
        <div>
          <p className={`mb-1 font-sans ${helperText}`}>Each module ({MODULES.map((module) => module.label.replace('Prep ', '')).join(', ')})</p>
          <p>Module score = <V>S</V> × <V>N</V><sup><V>α</V></sup> × <V>Q</V><sup><V>β</V></sup></p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400"><V>N</V> = E + M + H &nbsp;·&nbsp; <V>Q</V> = (<V>e</V>·E + <V>m</V>·M + <V>h</V>·H) ÷ <V>N</V></p>
        </div>
        <div>
          <p className={`mb-1 font-sans ${helperText}`}>Overall, over the modules a university licenses</p>
          <p>Prep Score = Σ(<V>W</V> × module score) ÷ Σ<V>W</V></p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Shown to <V>d</V> decimal places · no upper limit</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Volume exponent" symbol="α" value={formula.volumeExponent} min={0.01} max={10} step={0.05} onChange={(value) => update(['formula', 'volumeExponent'], value)} helper="How much doing more raises the score" />
        <NumberField label="Difficulty exponent" symbol="β" value={formula.qualityExponent} min={0.01} max={10} step={0.05} onChange={(value) => update(['formula', 'qualityExponent'], value)} helper="How much harder work raises the score" />
        <NumberField label="Scale" symbol="S" value={formula.scale} min={0.0001} max={10000} onChange={(value) => update(['formula', 'scale'], value)} helper="Multiplies every score" />
        <NumberField label="Decimal places" symbol="d" value={formula.decimalPlaces} min={0} max={4} step={1} onChange={(value) => update(['formula', 'decimalPlaces'], value)} helper="0 to 4" />
      </div>
      <table className="mt-5 w-full text-left text-sm" data-no-serial>
        <caption className="sr-only">Formula variables</caption>
        <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-3 font-semibold">Variable</th><th className="py-2 pr-3 font-semibold">Meaning</th><th className="py-2 font-semibold">Value</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(([symbol, meaning, value]) => (
            <tr key={symbol}><td className="py-2 pr-3 font-mono text-sky-700 dark:text-sky-300">{symbol}</td><td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{meaning}</td><td className="py-2 text-slate-500">{value}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
