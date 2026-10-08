import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, Info, RotateCcw } from 'lucide-react';
import {
  LIMITS, MIN_FACTOR, PROGRESSION_MODES, PROGRESSION_SOURCES, REFERENCE_PACE,
  buildProgressionPayload, computePreview, normalizeProgression, permissionOn, validateProgression,
} from './progressionMath';

const numberInput = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const fieldError = 'mt-1 text-xs text-rose-600 dark:text-rose-400';
const modeTone = {
  off: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  shadow: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  live: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
};
const formatFactor = (value) => (value === null ? '—' : value.toFixed(2));
const formatXp = (value) => Math.round(value).toLocaleString();
const formatWeeks = (weeks) => {
  if (weeks === null) return '—';
  if (weeks < 1) return '< 1 week';
  if (weeks >= 104) return `${(weeks / 52).toFixed(1)} years`;
  return `${Math.round(weeks)} weeks`;
};
const toNumber = (value) => (value === '' ? '' : Number(value));
const serverFieldPath = (field) => String(field || '').replace(/^progression\./, '');

function Switch({ checked, onChange, label, disabled }) {
  return <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900 ${checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-600'}`}
  >
    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
  </button>;
}

function ProgressionModeBadge({ mode }) {
  const label = PROGRESSION_MODES.find((item) => item.value === mode)?.label || 'Shadow';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modeTone[mode] || modeTone.shadow}`}>{label}</span>;
}

/**
 * Edits one `progression` block (platform defaults or a single university).
 * `onSave(body)` must perform the PUT/PATCH and resolve with the server response;
 * `onSaved()` runs afterwards (usually the page reload).
 */
export default function ProgressionEditor({ stored, permissions, onSave, onSaved, resetSource, resetLabel = 'Copy platform defaults', disabled = false, defaultOpen = false, scopeLabel }) {
  const id = useId();
  const storedKey = JSON.stringify(stored ?? null);
  const baseline = normalizeProgression(stored);
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(baseline);
  const [syncedKey, setSyncedKey] = useState(storedKey);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [conflict, setConflict] = useState(false);

  // Adopt fresh server data (after a save or reload) without an effect.
  if (syncedKey !== storedKey) {
    setSyncedKey(storedKey);
    setDraft(baseline);
    setServerErrors({});
    setConflict(false);
  }

  const preview = computePreview(draft, permissions);
  const savedPreview = computePreview(baseline, permissions);
  const { errors: localErrors, warnings } = validateProgression(draft, permissions);
  const errors = { ...serverErrors, ...localErrors };
  const hasErrors = Object.keys(localErrors).length > 0;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const locked = disabled || saving;
  const modeInfo = PROGRESSION_MODES.find((item) => item.value === draft.mode);
  const generalServerErrors = Object.entries(serverErrors).filter(([path]) => !path.startsWith('sources.') && !path.startsWith('curve') && !path.startsWith('normalization'));

  function update(mutator) {
    setDraft((previous) => {
      const next = structuredClone(previous);
      mutator(next);
      return next;
    });
    setFeedback(null);
  }

  async function save() {
    if (hasErrors || !dirty) return;
    if (draft.mode === 'live' && baseline.mode !== 'live'
      && !window.confirm(`Switch ${scopeLabel || 'this configuration'} to Live? Students will start seeing the new levels, XP and awards.`)) return;
    setSaving(true);
    setFeedback(null);
    setServerErrors({});
    try {
      const response = await onSave({ progression: buildProgressionPayload(draft, stored?.version) });
      setFeedback({ tone: 'success', text: 'Progression settings saved.', warnings: Array.isArray(response?.warnings) ? response.warnings : [] });
      await onSaved?.();
    } catch (error) {
      const status = error.response?.status;
      const field = serverFieldPath(error.response?.data?.field);
      if (status === 409) setConflict(true);
      else if (status === 400 && field) setServerErrors({ [field]: error.message });
      else setFeedback({ tone: 'error', text: error.message || 'Could not save progression settings.' });
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700">
    <button
      type="button"
      aria-expanded={open}
      aria-controls={`${id}-panel`}
      onClick={() => setOpen((value) => !value)}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-slate-800/60"
    >
      <span className="text-sm font-semibold">Progression</span>
      {/* Without a stored block nothing runs on the server, so no mode or N is claimed. */}
      {stored
        ? <><ProgressionModeBadge mode={baseline.mode} />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {savedPreview.effectiveKeys.length} active sources · N = {formatFactor(savedPreview.factor)}
            {stored.version ? ` · v${stored.version}` : ''}
          </span></>
        : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modeTone.off}`}>Not configured</span>}
      {dirty && <span className="text-xs font-medium text-sky-700 dark:text-sky-300">Unsaved changes</span>}
      <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div id={`${id}-panel`} className="space-y-5 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
      <fieldset>
        <legend id={`${id}-mode`} className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mode</legend>
        <div role="radiogroup" aria-labelledby={`${id}-mode`} className="mt-2 inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
          {PROGRESSION_MODES.map((item) => {
            const checked = draft.mode === item.value;
            return <label key={item.value} className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 ${checked ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'} ${locked ? 'cursor-not-allowed opacity-60' : ''}`}>
              <input type="radio" className="sr-only" name={`${id}-mode`} value={item.value} checked={checked} disabled={locked} onChange={() => update((next) => { next.mode = item.value; })} />
              {item.label}
            </label>;
          })}
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{modeInfo?.description}</p>
        {draft.mode === 'live' && baseline.mode !== 'live' && <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Saving makes levels and awards visible to students. Existing levels are never lowered.</p>}
      </fieldset>

      <section aria-labelledby={`${id}-sources`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 id={`${id}-sources`} className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sources and weights</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">Weight sets relative emphasis (0–3). Share is of expected weekly XP.</p>
        </div>
        {errors.sources && <p role="alert" className={fieldError}>{errors.sources}</p>}
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {PROGRESSION_SOURCES.map((source) => {
            const row = draft.sources[source.key];
            const permitted = permissionOn(permissions, source.permission);
            const effective = preview.effectiveKeys.includes(source.key);
            const share = preview.shares[source.key] || 0;
            const rowLocked = locked || Boolean(source.unavailable);
            const weightError = errors[`sources.${source.key}.weight`];
            const note = source.unavailable
              || (!permitted ? 'Module is off for this university. This setting applies when the module is enabled.' : null)
              || (source.key === 'consistency' && row.enabled && !effective ? 'Needs at least one active activity source.' : null)
              || (source.key === 'resumes' ? 'One-time milestones; not counted in the pace.' : null);
            return <li key={source.key} className={`grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,11rem)_5rem_6.5rem] ${(!permitted || source.unavailable) ? 'bg-slate-50/70 dark:bg-slate-800/30' : ''}`}>
              <Switch checked={Boolean(row.enabled)} disabled={rowLocked} label={`${source.label} earns XP`} onChange={(value) => update((next) => { next.sources[source.key].enabled = value; })} />
              <div className="min-w-0">
                <p className={`text-sm font-medium ${(!permitted || source.unavailable) ? 'text-slate-500 dark:text-slate-400' : ''}`}>{source.label}</p>
                {note && <p className="text-xs text-slate-500 dark:text-slate-400" title={note}>{note}</p>}
              </div>
              <input
                type="range"
                min={LIMITS.weight[0]}
                max={LIMITS.weight[1]}
                step="0.1"
                value={Number(row.weight) || 0}
                disabled={rowLocked || !row.enabled}
                aria-label={`${source.label} weight`}
                onChange={(event) => update((next) => { next.sources[source.key].weight = Number(event.target.value); })}
                className="col-span-2 w-full accent-sky-600 disabled:opacity-40 sm:col-span-1"
              />
              <div className="col-start-2 sm:col-start-auto">
                <input
                  type="number"
                  min={LIMITS.weight[0]}
                  max={LIMITS.weight[1]}
                  step="0.1"
                  inputMode="decimal"
                  value={row.weight}
                  disabled={rowLocked || !row.enabled}
                  aria-label={`${source.label} weight value`}
                  aria-invalid={Boolean(weightError)}
                  onChange={(event) => update((next) => { next.sources[source.key].weight = toNumber(event.target.value); })}
                  className={numberInput}
                />
                {weightError && <p className={fieldError}>{weightError}</p>}
              </div>
              <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
                <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, share)}%` }} />
                </div>
                <span className="w-9 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400"><span className="sr-only">{source.label} share of weekly XP: </span>{effective && source.pace > 0 ? `${Math.round(share)}%` : '—'}</span>
              </div>
            </li>;
          })}
        </ul>
      </section>

      <section aria-labelledby={`${id}-preview`} className="rounded-lg bg-sky-50/70 p-3 ring-1 ring-sky-100 dark:bg-sky-500/5 dark:ring-sky-500/20">
        <h4 id={`${id}-preview`} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300"><Info aria-hidden="true" className="h-3.5 w-3.5" />Live preview</h4>
        <p className="mt-1.5 text-sm">
          {draft.normalization.mode === 'off'
            ? <>Normalization is off, so <strong>N = 1.00</strong>. XP = rule XP × weight.</>
            : preview.factor === null
              ? <>No enabled source earns paced XP, so N cannot be computed.</>
              : <>Normalization factor <strong>N = {formatFactor(preview.factor)}</strong> = {REFERENCE_PACE} ÷ {formatXp(preview.paceSum)} (Σ weight × expected weekly XP){preview.clamped ? `, clamped to ${MIN_FACTOR}–${draft.normalization.maxFactor}` : ''}. An active student earns about {formatXp(preview.weeklyXp)} XP a week.</>}
        </p>
        {preview.examples.length > 0 && preview.factor !== null && <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {preview.examples.map((example) => <li key={example.key} className="flex justify-between gap-3 border-b border-sky-100 py-0.5 dark:border-sky-500/10">
            <span className="text-slate-600 dark:text-slate-300">{example.label}</span>
            <span className="font-semibold tabular-nums">{formatXp(example.xp)} XP</span>
          </li>)}
        </ul>}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Estimate using the published formula and expected weekly XP. The server computes the actual values.</p>
      </section>

      <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
          Advanced: level curve and normalization
          {(errors.curve || errors['curve.base'] || errors['curve.exponent'] || errors['normalization.maxFactor']) && <span className="text-xs text-rose-600 dark:text-rose-400">Needs attention</span>}
        </summary>
        <div className="space-y-4 border-t border-slate-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap gap-4">
            <label className="grid gap-1 text-sm">
              <span>Curve base <span className="text-xs text-slate-500 dark:text-slate-400">({LIMITS.base[0]}–{LIMITS.base[1]})</span></span>
              <input type="number" className={numberInput} min={LIMITS.base[0]} max={LIMITS.base[1]} step="1" value={draft.curve.base} disabled={locked} aria-invalid={Boolean(errors['curve.base'])} onChange={(event) => update((next) => { next.curve.base = toNumber(event.target.value); })} />
              {errors['curve.base'] && <span className={fieldError}>{errors['curve.base']}</span>}
            </label>
            <label className="grid gap-1 text-sm">
              <span>Curve exponent <span className="text-xs text-slate-500 dark:text-slate-400">({LIMITS.exponent[0]}–{LIMITS.exponent[1]})</span></span>
              <input type="number" className={numberInput} min={LIMITS.exponent[0]} max={LIMITS.exponent[1]} step="0.05" value={draft.curve.exponent} disabled={locked} aria-invalid={Boolean(errors['curve.exponent'])} onChange={(event) => update((next) => { next.curve.exponent = toNumber(event.target.value); })} />
              {errors['curve.exponent'] && <span className={fieldError}>{errors['curve.exponent']}</span>}
            </label>
            <label className="grid gap-1 text-sm">
              <span>Normalization</span>
              <select className={`${numberInput} w-28`} value={draft.normalization.mode} disabled={locked} onChange={(event) => update((next) => { next.normalization.mode = event.target.value; })}>
                <option value="auto">Auto</option>
                <option value="off">Off (N = 1)</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Max factor <span className="text-xs text-slate-500 dark:text-slate-400">({LIMITS.maxFactor[0]}–{LIMITS.maxFactor[1]})</span></span>
              <input type="number" className={numberInput} min={LIMITS.maxFactor[0]} max={LIMITS.maxFactor[1]} step="0.5" value={draft.normalization.maxFactor} disabled={locked || draft.normalization.mode === 'off'} aria-invalid={Boolean(errors['normalization.maxFactor'])} onChange={(event) => update((next) => { next.normalization.maxFactor = toNumber(event.target.value); })} />
              {errors['normalization.maxFactor'] && <span className={fieldError}>{errors['normalization.maxFactor']}</span>}
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">XP to reach level n = round10(base × (n − 1)<sup>exponent</sup>). Weeks assume the active pace above.</p>
          {errors.curve && <p role="alert" className={fieldError}>{errors.curve}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">Cumulative XP and estimated weeks per level</caption>
              <thead><tr className="text-xs text-slate-500 dark:text-slate-400"><th scope="col" className="py-1 pr-3 font-medium">Level</th>{preview.curve.map((row) => <th scope="col" key={row.level} className="py-1 pr-3 font-medium tabular-nums">L{row.level}</th>)}</tr></thead>
              <tbody>
                <tr className="border-t border-slate-100 dark:border-slate-800"><th scope="row" className="py-1 pr-3 text-xs font-medium text-slate-500 dark:text-slate-400">XP</th>{preview.curve.map((row) => <td key={row.level} className="py-1 pr-3 tabular-nums">{Number.isFinite(row.xp) ? formatXp(row.xp) : '—'}</td>)}</tr>
                <tr className="border-t border-slate-100 dark:border-slate-800"><th scope="row" className="py-1 pr-3 text-xs font-medium text-slate-500 dark:text-slate-400">Time</th>{preview.curve.map((row) => <td key={row.level} className="py-1 pr-3 text-xs text-slate-600 dark:text-slate-300">{Number.isFinite(row.xp) ? formatWeeks(row.weeks) : '—'}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </div>
      </details>

      {(warnings.length > 0 || feedback?.warnings?.length > 0) && <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
        {[...warnings, ...(feedback?.warnings || [])].map((warning, index) => <li key={index} className="flex items-start gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{typeof warning === 'string' ? warning : warning?.message || JSON.stringify(warning)}</li>)}
      </ul>}
      {generalServerErrors.map(([path, text]) => <p key={path} role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{text} <span className="font-mono">({path})</span></p>)}
      {conflict && <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
        Someone else changed these settings after you opened them. Reload to see the latest version; your unsaved edits will be discarded.
        <button type="button" className="font-semibold underline" onClick={() => { setConflict(false); onSaved?.(); }}>Reload</button>
      </p>}
      {feedback && <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${feedback.tone === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{feedback.text}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <p className="mr-auto text-xs text-slate-500 dark:text-slate-400">
          {stored?.version ? `Version ${stored.version}` : 'Not configured yet · values below are suggestions until saved'}
          {stored?.updatedAt ? ` · updated ${new Date(stored.updatedAt).toLocaleString()}` : ''}
        </p>
        {resetSource && <button type="button" disabled={locked} onClick={() => update((next) => { Object.assign(next, normalizeProgression(resetSource)); })} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />{resetLabel}
        </button>}
        <button type="button" disabled={locked || !dirty} onClick={() => { setDraft(baseline); setFeedback(null); setServerErrors({}); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Discard</button>
        <button type="button" disabled={locked || !dirty || hasErrors} onClick={save} className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-slate-900">{saving ? 'Saving…' : 'Save progression'}</button>
      </div>
    </div>}
  </div>;
}
