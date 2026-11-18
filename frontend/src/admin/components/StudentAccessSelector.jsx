import { Check, LockKeyhole } from 'lucide-react';
import { ALL_STUDENT_FEATURES, STANDARD_STUDENT_FEATURES, STUDENT_FEATURE_CATALOG } from '../../student/studentFeatureAccess';

/**
 * Which modules a student (or every new student) can use. "All access" is every standard module;
 * opt-in modules (Prep Mates) are never part of it: ticking one keeps all the standard modules and
 * adds it ("Selected features" with everything ticked).
 */
export default function StudentAccessSelector({ value, onChange, showMode = true, compact = false }) {
  const access = value?.mode === 'custom'
    ? { mode: 'custom', features: value.features || [] }
    : { mode: 'all', features: [...STANDARD_STUDENT_FEATURES] };
  const enabled = new Set(access.features);
  const setMode = (mode) => onChange(mode === 'all'
    ? { mode: 'all', features: [...STANDARD_STUDENT_FEATURES] }
    : { mode: 'custom', features: access.mode === 'custom' ? access.features : [...STANDARD_STUDENT_FEATURES] });
  const toggle = (key) => {
    const next = new Set(access.features);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange({ mode: 'custom', features: ALL_STUDENT_FEATURES.filter((feature) => next.has(feature)) });
  };

  return <div className="space-y-4">
    {showMode && <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-gray-800">
      <button type="button" onClick={() => setMode('all')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${access.mode === 'all' ? 'bg-white text-sky-700 shadow-sm dark:bg-gray-700 dark:text-sky-300' : 'text-slate-500 dark:text-gray-400'}`}>All access</button>
      <button type="button" onClick={() => setMode('custom')} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${access.mode === 'custom' ? 'bg-white text-sky-700 shadow-sm dark:bg-gray-700 dark:text-sky-300' : 'text-slate-500 dark:text-gray-400'}`}>Selected features</button>
    </div>}
    <div className={`grid gap-2 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
      {STUDENT_FEATURE_CATALOG.map((feature) => {
        const active = enabled.has(feature.key);
        // In "All access" the standard modules are fixed on; an opt-in module can still be ticked.
        const locked = access.mode === 'all' && !feature.optIn;
        const Icon = feature.icon;
        return <button key={feature.key} type="button" disabled={locked} aria-pressed={active} onClick={() => toggle(feature.key)} className={`group flex min-h-[76px] items-start gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/25' : 'border-slate-200 bg-white opacity-70 hover:opacity-100 dark:border-gray-700 dark:bg-gray-900'} ${locked ? 'cursor-default' : ''}`}>
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-gray-800'}`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="text-sm font-bold text-slate-800 dark:text-white">{feature.label}</span>
                {feature.optIn && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Opt-in</span>}
              </span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-gray-600'}`}>{active && <Check className="h-3 w-3" />}</span>
            </span>
            <span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-gray-400">{feature.description}{feature.optIn ? ' Off unless you turn it on, even with All access.' : ''}</span>
          </span>
        </button>;
      })}
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400"><LockKeyhole className="h-3.5 w-3.5" />Disabled modules are removed from navigation and blocked on direct routes and APIs.</div>
  </div>;
}
