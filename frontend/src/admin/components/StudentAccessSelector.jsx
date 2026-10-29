import { Check, LockKeyhole } from 'lucide-react';
import { ALL_STUDENT_FEATURES, STUDENT_FEATURE_CATALOG } from '../../student/studentFeatureAccess';

export default function StudentAccessSelector({ value, onChange, showMode = true, compact = false }) {
  const access = value?.mode === 'custom'
    ? { mode: 'custom', features: value.features || [] }
    : { mode: 'all', features: [...ALL_STUDENT_FEATURES] };
  const enabled = new Set(access.features);
  const setMode = (mode) => onChange(mode === 'all'
    ? { mode: 'all', features: [...ALL_STUDENT_FEATURES] }
    : { mode: 'custom', features: access.mode === 'custom' ? access.features : [...ALL_STUDENT_FEATURES] });
  const toggle = (key) => {
    const next = new Set(access.mode === 'all' ? ALL_STUDENT_FEATURES : access.features);
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
        const active = access.mode === 'all' || enabled.has(feature.key);
        const Icon = feature.icon;
        return <button key={feature.key} type="button" disabled={access.mode === 'all'} onClick={() => toggle(feature.key)} className={`group flex min-h-[76px] items-start gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/25' : 'border-slate-200 bg-white opacity-70 hover:opacity-100 dark:border-gray-700 dark:bg-gray-900'} ${access.mode === 'all' ? 'cursor-default' : ''}`}>
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-gray-800'}`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-800 dark:text-white">{feature.label}</span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-gray-600'}`}>{active && <Check className="h-3 w-3" />}</span></span><span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-gray-400">{feature.description}</span></span>
        </button>;
      })}
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400"><LockKeyhole className="h-3.5 w-3.5" />Disabled modules are removed from navigation and blocked on direct routes and APIs.</div>
  </div>;
}
