import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Gauge, Loader2, PauseCircle, Save, Undo2 } from 'lucide-react';
import { api } from '../../utils/api';
import { CardHeader, Glass } from '../../overview/ui';
import { buttonClass, inputClass } from './coinModel';
import { InfoTitle } from './shared';

// The per-check cost cap and the per-student daily limit were removed (2026-11-28): a student's
// Prep Coins are the only limit. Their stored values are kept but no longer edited or enforced.
const FIELDS = [
  ['monthlyBudgetInr', 'Monthly budget (₹)', 'Kill switch: checks pause (no coins taken) once this month’s spend reaches it. 0 pauses now.', 0, 1000000, 100],
  ['usdToInr', '₹ per US$', 'Used to convert Gemini’s dollar prices.', 50, 200, 0.5],
];
const rupees = (value, digits = 2) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** Master Admin: what one ANVI JD Match check may cost PeerPrep, the monthly budget and the live spend. */
export default function JdMatchBudget() {
  const [saved, setSaved] = useState(null);
  const [limits, setLimits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminJdMatchSettings().then((data) => { setSaved(data); setLimits({ ...data.limits }); })
      .catch((cause) => setError(cause.message || 'JD Match limits could not be loaded.'));
  }, []);

  const problem = useMemo(() => {
    if (!limits) return '';
    const bad = FIELDS.find(([key, , , min, max]) => !Number.isFinite(limits[key]) || limits[key] < min || limits[key] > max);
    if (bad) return `${bad[1]} must be from ${bad[3]} to ${bad[4]}.`;
    return '';
  }, [limits]);
  const unsaved = saved && limits && JSON.stringify(limits) !== JSON.stringify(saved.limits);

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await api.saveAdminJdMatchSettings({ limits, expectedVersion: saved.version, reason: 'JD Match limits updated' });
      setSaved(next); setLimits({ ...next.limits });
      setNotice('Saved. The new limits apply to the next check.');
    } catch (cause) {
      setError(cause.message || 'JD Match limits could not be saved.');
    } finally { setBusy(false); }
  }

  const spend = saved?.spend;
  const model = saved?.model;
  const used = spend && spend.budgetInr ? Math.min(100, Math.round((spend.spentInr / spend.budgetInr) * 100)) : spend?.paused ? 100 : 0;

  return (
    <Glass data-guide="pcp-jd-match" className="mt-4 p-5">
      <CardHeader title={<InfoTitle title="ANVI JD Match · Gemini budget" step="pcp-jd-match" />} subtitle="What PeerPrep pays Google per résumé check. Students pay the Prep Coin price above; this keeps the real cost capped" Icon={Gauge} />
      {error && <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4" />{error}</p>}
      {notice && <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
      {!limits ? <p className="text-sm text-slate-500">{error ? '' : 'Loading…'}</p> : <>
        {spend ? (
          <div className="mb-4 rounded-2xl bg-slate-900/[0.03] p-4 dark:bg-white/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">This month ({spend.month})</p>
              {spend.paused ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><PauseCircle className="h-3.5 w-3.5" />Paused: budget used</span>
                : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">Running</span>}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className={`h-full rounded-full ${used >= 90 ? 'bg-rose-500' : used >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${used}%` }} /></div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-[11px] text-slate-500">Spent</p><p className="font-semibold tabular-nums text-slate-900 dark:text-white">{rupees(spend.spentInr)} <span className="text-xs font-normal text-slate-400">of {rupees(spend.budgetInr, 0)}</span></p></div>
              <div><p className="text-[11px] text-slate-500">Gemini calls</p><p className="font-semibold tabular-nums text-slate-900 dark:text-white">{spend.calls.toLocaleString()}</p></div>
              <div><p className="text-[11px] text-slate-500">Average per check</p><p className="font-semibold tabular-nums text-slate-900 dark:text-white">{rupees(spend.averageInr, 3)}</p></div>
              <div><p className="text-[11px] text-slate-500">Costliest check</p><p className={`font-semibold tabular-nums ${spend.overCap ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{rupees(spend.maxCallInr, 3)}{spend.overCap ? <span className="ml-1 text-xs">({spend.overCap} over cap)</span> : null}</p></div>
            </div>
            {model ? <p className="mt-3 text-[11px] text-slate-400">Model {model.model} · ${model.inputUsdPerM}/1M input, ${model.outputUsdPerM}/1M output (thinking billed as output, level “{model.thinkingLevel}”) · at most {model.maxOutputTokens} output tokens. Tokens this month: {spend.inputTokens.toLocaleString()} in / {spend.outputTokens.toLocaleString()} out.</p> : null}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([key, label, detail, min, max, step]) => (
            <label key={key} className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}
              <input aria-label={label} className={`${inputClass} mt-1 font-semibold tabular-nums`} type="number" min={min} max={max} step={step}
                value={Number.isFinite(limits[key]) ? limits[key] : ''} onChange={(event) => setLimits((current) => ({ ...current, [key]: event.target.value === '' ? Number.NaN : Number(event.target.value) }))} />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">{detail}</span>
            </label>
          ))}
        </div>
        {problem && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">{problem}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setLimits({ ...saved.limits })} disabled={busy || !unsaved} className={`${buttonClass.secondary} h-10`}><Undo2 className="h-4 w-4" />Discard</button>
          <button type="button" onClick={save} disabled={busy || !unsaved || Boolean(problem)} className={`${buttonClass.primary} h-10`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save limits</button>
        </div>
      </>}
    </Glass>
  );
}
