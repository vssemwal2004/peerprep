import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Minus, Plus, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { STANDARD_STUDENT_FEATURES, STUDENT_FEATURE_CATALOG } from '../../student/studentFeatureAccess';
import StudentAccessSelector from './StudentAccessSelector';

const ACTIONS = [
  { key: 'grant', label: 'Turn on', note: 'Adds the chosen modules; everything else each student has stays as it is.', Icon: Plus },
  { key: 'revoke', label: 'Turn off', note: 'Removes the chosen modules; everything else stays. Nobody is left with no module.', Icon: Minus },
  { key: 'set', label: 'Set exact access', note: 'Replaces each student’s access with exactly this.', Icon: SlidersHorizontal },
];

/**
 * "Access & features" for many students at once (the ticked ones, or every matching student).
 * onApply(change) returns the server's { updated, unchanged, skipped }; the dialog closes itself
 * through onClose after a success.
 */
export default function BulkStudentAccessDialog({ count, allMatching, onApply, onClose }) {
  const [type, setType] = useState('grant');
  const [features, setFeatures] = useState([]);
  const [access, setAccess] = useState({ mode: 'all', features: [...STANDARD_STUDENT_FEATURES] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const action = ACTIONS.find((entry) => entry.key === type);
  const toggle = (key) => setFeatures((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
  const ready = type === 'set' ? !(access.mode === 'custom' && !access.features.length) : features.length > 0;
  const who = `${count.toLocaleString()} ${allMatching ? 'matching ' : 'selected '}student${count === 1 ? '' : 's'}`;

  const apply = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    try {
      await onApply(type === 'set' ? { type, access } : { type, features });
    } catch (caught) {
      setError(caught.message || 'Could not update access.');
      setSaving(false);
    }
  };

  return <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !saving && onClose()} className="fixed inset-0 z-[70] bg-slate-950/55 backdrop-blur-sm" />
    <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
      <motion.div role="dialog" aria-modal="true" aria-labelledby="bulk-access-title" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-sky-600 p-2.5 text-white"><ShieldCheck className="h-5 w-5" /></span>
            <div><h2 id="bulk-access-title" className="text-lg font-black text-slate-950 dark:text-white">Access & features</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">For {who}</p></div>
          </div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-gray-800" role="radiogroup" aria-label="What to change">
            {ACTIONS.map(({ key, label, Icon }) => (
              <button key={key} type="button" role="radio" aria-checked={type === key} onClick={() => setType(key)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${type === key ? 'bg-white text-sky-700 shadow-sm dark:bg-gray-700 dark:text-sky-300' : 'text-slate-500 dark:text-gray-400'}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-gray-400">{action.note}</p>

          {type === 'set' ? <StudentAccessSelector value={access} onChange={setAccess} /> : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {STUDENT_FEATURE_CATALOG.map((feature) => {
                const picked = features.includes(feature.key);
                const Icon = feature.icon;
                const tone = type === 'revoke' ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/25' : 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/25';
                return (
                  <button key={feature.key} type="button" aria-pressed={picked} onClick={() => toggle(feature.key)}
                    className={`flex min-h-[64px] items-start gap-3 rounded-xl border p-3 text-left transition ${picked ? tone : 'border-slate-200 bg-white hover:border-slate-300 dark:border-gray-700 dark:bg-gray-900'}`}>
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${picked ? (type === 'revoke' ? 'bg-rose-600 text-white' : 'bg-sky-600 text-white') : 'bg-slate-100 text-slate-400 dark:bg-gray-800'}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white">{feature.label}
                          {feature.optIn && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Opt-in</span>}
                        </span>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${picked ? (type === 'revoke' ? 'border-rose-600 bg-rose-600 text-white' : 'border-sky-600 bg-sky-600 text-white') : 'border-slate-300 dark:border-gray-600'}`}>{picked && <Check className="h-3 w-3" />}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500 dark:text-gray-400">{feature.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
          {type !== 'set' && <p className="mr-auto text-xs text-slate-500 dark:text-gray-400">{features.length ? `${features.length} module${features.length === 1 ? '' : 's'} chosen` : 'Choose the modules to change'}</p>}
          <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-gray-700 dark:text-gray-300">Cancel</button>
          <button type="button" onClick={apply} disabled={!ready || saving}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-50 ${type === 'revoke' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'}`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {type === 'grant' ? 'Turn on' : type === 'revoke' ? 'Turn off' : 'Set access'} for {count.toLocaleString()}
          </button>
        </div>
      </motion.div>
    </div>
  </>;
}
