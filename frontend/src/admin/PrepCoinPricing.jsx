import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Gift, LayoutDashboard, Loader2, Save, Undo2 } from 'lucide-react';
import { api } from '../utils/api';
import { CardHeader, Glass } from '../overview/ui';
import PrepCoinIcon from '../components/prepCoin/PrepCoinIcon';
import { CoinPage } from './prepCoins/shared';
import { buttonClass, inputClass } from './prepCoins/coinModel';

const whole = (value) => Number.isSafeInteger(value) && value >= 0;

/** Master Admin only: what each student feature costs in Prep Coins, and free uses per month. */
export default function PrepCoinPricing() {
  const [pricing, setPricing] = useState(null);
  const [features, setFeatures] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api.adminCoinPricing();
    setPricing(data);
    setFeatures(structuredClone(data.features));
  };
  useEffect(() => { load().catch((cause) => setError(cause.message || 'Prices could not be loaded.')); }, []);

  const unsaved = pricing && JSON.stringify(features) !== JSON.stringify(pricing.features);
  const invalid = useMemo(() => Object.values(features).some((value) => !whole(value.price) || !whole(value.freePerMonth)), [features]);
  const set = (key, field, value) => setFeatures((previous) => ({ ...previous, [key]: { ...previous[key], [field]: value === '' ? Number.NaN : Number(value) } }));

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await api.saveAdminCoinPricing({ features, expectedVersion: pricing.version, reason });
      setPricing(saved); setFeatures(structuredClone(saved.features)); setReason('');
      setNotice('Prices saved. They apply to the next paid action; nothing already paid changes.');
    } catch (cause) {
      setError(cause.message || 'Prices could not be saved.');
    } finally { setBusy(false); }
  }

  return (
    <CoinPage title="Pricing" subtitle="What paid features cost students. Free monthly uses come first, and coins never change Prep Score or rank"
      actions={<Link to="/admin/prep-coins" className={buttonClass.secondary}><LayoutDashboard className="h-4 w-4" />Overview</Link>}>
      {error && <p role="alert" className="mb-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}
      {!pricing ? <p className="text-sm text-slate-500">{error ? '' : 'Loading Prep Coin prices…'}</p> : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {pricing.catalog.map((feature) => {
              const value = features[feature.key] || { price: 0, freePerMonth: 0 };
              const saved = pricing.features[feature.key] || { price: 0, freePerMonth: 0 };
              const changed = value.price !== saved.price || value.freePerMonth !== saved.freePerMonth;
              const free = value.price === 0;
              return (
                <Glass key={feature.key} className={`p-5 transition ${changed ? 'ring-2 ring-amber-300/70 dark:ring-amber-400/40' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{feature.label}</h2>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{feature.detail}</p>
                    </div>
                    {changed ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20">Unsaved</span>
                      : <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${free ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200' : 'bg-slate-900/[0.05] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'}`}>{free ? 'Free' : 'Paid'}</span>}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Price
                      <span className="relative mt-1 block">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><PrepCoinIcon size={18} /></span>
                        <input aria-label={`${feature.label} price`} className={`${inputClass} pl-10 font-semibold tabular-nums`} type="number" min={0} step={1}
                          value={Number.isFinite(value.price) ? value.price : ''} onChange={(event) => set(feature.key, 'price', event.target.value)} />
                      </span>
                    </label>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Free uses per month
                      <span className="relative mt-1 block">
                        <Gift className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" aria-hidden="true" />
                        <input aria-label={`${feature.label} free uses per month`} className={`${inputClass} pl-9 tabular-nums`} type="number" min={0} step={1} disabled={free}
                          value={Number.isFinite(value.freePerMonth) ? value.freePerMonth : ''} onChange={(event) => set(feature.key, 'freePerMonth', event.target.value)} />
                      </span>
                    </label>
                  </div>
                  <p className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900/[0.03] px-3 py-2 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                    <PrepCoinIcon size={16} />
                    Students see: {free ? 'free, no coins needed' : `${value.price} coin${value.price === 1 ? '' : 's'} per use${value.freePerMonth ? ` after ${value.freePerMonth} free use${value.freePerMonth === 1 ? '' : 's'} a month` : ''}`}
                  </p>
                </Glass>
              );
            })}
          </div>

          <Glass className="sticky bottom-4 mt-4 p-4">
            {invalid && <p role="alert" className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Use whole numbers of 0 or more.</p>}
            <CardHeader title="Save changes" subtitle={pricing.updatedAt ? `Version ${pricing.version} · last changed ${new Date(pricing.updatedAt).toLocaleString()}` : 'Every feature is free until a price is saved.'} Icon={Save} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={inputClass} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Reason for this change (optional)"
                placeholder="Reason for this change (optional), e.g. AI interviews now use a paid speech model" />
              <button type="button" onClick={() => setFeatures(structuredClone(pricing.features))} disabled={busy || !unsaved} className={`${buttonClass.secondary} h-10 shrink-0`}><Undo2 className="h-4 w-4" />Discard</button>
              <button type="button" onClick={save} disabled={busy || !unsaved || invalid} className={`${buttonClass.primary} h-10 shrink-0`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? 'Saving…' : 'Save prices'}</button>
            </div>
          </Glass>
        </>
      )}
    </CoinPage>
  );
}
