import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save, Sparkles, Undo2 } from 'lucide-react';
import { api } from '../../utils/api';
import { CardHeader, Glass } from '../../overview/ui';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { buttonClass, inputClass } from './coinModel';
import { InfoTitle } from './shared';

const TIERS = ['Bronze', 'Bronze', 'Silver', 'Silver', 'Gold', 'Gold', 'Platinum', 'Platinum', 'Diamond', 'Legend'];
const LIFETIME_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legend'];
// Solving a problem no longer pays coins (2026-11-21): the daily challenge and finished sheets do.
const AMOUNTS = [
  ['login', 'Daily login', 'First time a student opens PeerPrep each day'],
  ['challenge', 'Daily challenge', 'Completing the day’s daily challenge (also grows the Prep Streak)'],
  ['sheet', 'Sheet completed', 'Solving every question of a Quick Prep sheet, once per sheet'],
];
const whole = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000;

/** Master Admin: coins students earn for a daily login, the daily challenge, a finished sheet and badges. */
export default function EarningSettings() {
  const [saved, setSaved] = useState(null);
  const [earning, setEarning] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminCoinEarning().then((data) => { setSaved(data); setEarning(structuredClone(data.earning)); })
      .catch((cause) => setError(cause.message || 'Earning amounts could not be loaded.'));
  }, []);

  const problem = useMemo(() => {
    if (!earning) return '';
    if (![earning.login, earning.challenge, earning.sheet, ...earning.badgeLevels, ...(earning.milestoneTiers || []), ...(earning.levelCoins || [])].every(whole)) return 'Use whole numbers from 0 to 1000.';
    if ((earning.levelCoins || []).some((value, index) => index && value < earning.levelCoins[index - 1])) return 'A higher learner level cannot pay fewer coins.';
    if (earning.badgeLevels.some((value, index) => index && value < earning.badgeLevels[index - 1])) return 'A harder level cannot pay fewer coins than an easier one.';
    if ((earning.milestoneTiers || []).some((value, index) => index && value < earning.milestoneTiers[index - 1])) return 'A higher lifetime badge tier cannot pay fewer coins.';
    return '';
  }, [earning]);
  const unsaved = saved && earning && JSON.stringify(earning) !== JSON.stringify(saved.earning);
  const number = (value) => (value === '' ? Number.NaN : Number(value));

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await api.saveAdminCoinEarning({ earning, expectedVersion: saved.version, reason: 'Earning amounts updated' });
      setSaved(next); setEarning(structuredClone(next.earning));
      setNotice('Saved. New amounts apply to rewards earned from now on.');
    } catch (cause) {
      setError(cause.message || 'Earning amounts could not be saved.');
    } finally { setBusy(false); }
  }

  return (
    <Glass data-guide="pcp-earning" className="mb-4 p-5">
      <CardHeader title={<InfoTitle title="Coins students earn" step="pcp-earning" />} subtitle="Minted by PeerPrep for a student's own work; university balances are never used" Icon={Sparkles} />
      {error && <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4" />{error}</p>}
      {notice && <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
      {!earning ? <p className="text-sm text-slate-500">{error ? '' : 'Loading…'}</p> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          {AMOUNTS.map(([key, label, detail]) => (
            <label key={key} className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}
              <span className="relative mt-1 block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><PrepCoinIcon size={18} /></span>
                <input aria-label={label} className={`${inputClass} pl-10 font-semibold tabular-nums`} type="number" min={0} max={1000} step={1}
                  value={Number.isFinite(earning[key]) ? earning[key] : ''} onChange={(event) => setEarning((current) => ({ ...current, [key]: number(event.target.value) }))} />
              </span>
              <span className="mt-1 block text-[11px] font-normal text-slate-400">{detail}</span>
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-300">Monthly badge levels (each level pays once per badge per month)</p>
        <div data-guide="pcp-badge-levels" className="mt-1 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {earning.badgeLevels.map((value, index) => (
            <label key={index} className="text-center text-[11px] text-slate-500 dark:text-slate-400">L{index + 1}
              <span className="block text-[10px]">{TIERS[index]}</span>
              <input aria-label={`Badge level ${index + 1} coins`} className={`${inputClass} mt-1 px-1 text-center font-semibold tabular-nums`} type="number" min={0} max={1000} step={1}
                value={Number.isFinite(value) ? value : ''} onChange={(event) => setEarning((current) => ({ ...current, badgeLevels: current.badgeLevels.map((entry, at) => (at === index ? number(event.target.value) : entry)) }))} />
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-300">Lifetime badges by tier (each badge pays once, ever)</p>
        <div data-guide="pcp-milestone-tiers" className="mt-1 grid grid-cols-5 gap-2">
          {(earning.milestoneTiers || []).map((value, index) => (
            <label key={index} className="text-center text-[11px] text-slate-500 dark:text-slate-400">{LIFETIME_TIERS[index]}
              <input aria-label={`Lifetime badge ${LIFETIME_TIERS[index]} coins`} className={`${inputClass} mt-1 px-1 text-center font-semibold tabular-nums`} type="number" min={0} max={1000} step={1}
                value={Number.isFinite(value) ? value : ''} onChange={(event) => setEarning((current) => ({ ...current, milestoneTiers: current.milestoneTiers.map((entry, at) => (at === index ? number(event.target.value) : entry)) }))} />
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-300">Elite learner levels 8–12 (each level pays once, ever)</p>
        <div data-guide="pcp-level-coins" className="mt-1 grid grid-cols-5 gap-2">
          {(earning.levelCoins || []).map((value, index) => (index < 7 ? null : (
            <label key={index} className="text-center text-[11px] text-slate-500 dark:text-slate-400">Level {index + 1}
              <input aria-label={`Level ${index + 1} coins`} className={`${inputClass} mt-1 px-1 text-center font-semibold tabular-nums`} type="number" min={0} max={1000} step={1}
                value={Number.isFinite(value) ? value : ''} onChange={(event) => setEarning((current) => ({ ...current, levelCoins: current.levelCoins.map((entry, at) => (at === index ? number(event.target.value) : entry)) }))} />
            </label>
          )))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Solving a problem does not pay coins; it adds to the Prep Score.</p>
        {problem && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">{problem}</p>}
        <div data-guide="pcp-earning-save" className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setEarning(structuredClone(saved.earning))} disabled={busy || !unsaved} className={`${buttonClass.secondary} h-10`}><Undo2 className="h-4 w-4" />Discard</button>
          <button type="button" onClick={save} disabled={busy || !unsaved || Boolean(problem)} className={`${buttonClass.primary} h-10`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save earning</button>
        </div>
      </>}
    </Glass>
  );
}
