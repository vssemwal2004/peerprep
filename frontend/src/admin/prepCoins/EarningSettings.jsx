import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save, Sparkles, Undo2 } from 'lucide-react';
import { api } from '../../utils/api';
import { CardHeader, Glass } from '../../overview/ui';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { buttonClass, inputClass } from './coinModel';

const TIERS = ['Bronze', 'Bronze', 'Silver', 'Silver', 'Gold', 'Gold', 'Platinum', 'Platinum', 'Diamond', 'Legend'];
const whole = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000;

/** Master Admin: coins students earn for a daily login, each counted solve, and each badge level. */
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
    if (![earning.login, earning.solve, ...earning.badgeLevels].every(whole)) return 'Use whole numbers from 0 to 1000.';
    if (earning.badgeLevels.some((value, index) => index && value < earning.badgeLevels[index - 1])) return 'A harder level cannot pay fewer coins than an easier one.';
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
    <Glass className="mb-4 p-5">
      <CardHeader title="Coins students earn" subtitle="Minted by PeerPrep for a student's own work; university balances are never used" Icon={Sparkles} />
      {error && <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4" />{error}</p>}
      {notice && <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
      {!earning ? <p className="text-sm text-slate-500">{error ? '' : 'Loading…'}</p> : <>
        <div className="grid gap-3 sm:grid-cols-2">
          {[['login', 'Daily login', 'First time a student opens PeerPrep each day'], ['solve', 'Per problem solved', 'First solve of a problem, within the daily topic limit']].map(([key, label, detail]) => (
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
        <div className="mt-1 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {earning.badgeLevels.map((value, index) => (
            <label key={index} className="text-center text-[11px] text-slate-500 dark:text-slate-400">L{index + 1}
              <span className="block text-[10px]">{TIERS[index]}</span>
              <input aria-label={`Badge level ${index + 1} coins`} className={`${inputClass} mt-1 px-1 text-center font-semibold tabular-nums`} type="number" min={0} max={1000} step={1}
                value={Number.isFinite(value) ? value : ''} onChange={(event) => setEarning((current) => ({ ...current, badgeLevels: current.badgeLevels.map((entry, at) => (at === index ? number(event.target.value) : entry)) }))} />
            </label>
          ))}
        </div>
        {problem && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">{problem}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setEarning(structuredClone(saved.earning))} disabled={busy || !unsaved} className={`${buttonClass.secondary} h-10`}><Undo2 className="h-4 w-4" />Discard</button>
          <button type="button" onClick={save} disabled={busy || !unsaved || Boolean(problem)} className={`${buttonClass.primary} h-10`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save earning</button>
        </div>
      </>}
    </Glass>
  );
}
