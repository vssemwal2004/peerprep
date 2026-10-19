import { useEffect, useMemo, useState } from 'react';
import { Coins, Save } from 'lucide-react';
import { api } from '../utils/api';
import { card, helperText, inputClass, sectionTitle } from './prepScore/fields';

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

  if (!pricing) return <div className="p-8 text-sm text-slate-500">{error || 'Loading Prep Coin prices…'}</div>;
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-600">Master Admin settings</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Prep Coin Pricing</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Prep Coins are credits students spend on features. A price of 0 makes a feature free. Free uses each month come before any coins, so every student can keep practising, and coins never change Prep Score or rank.</p>
      </header>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}

      <section className={card} aria-labelledby="coin-prices-title">
        <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-sky-600" aria-hidden="true" /><h2 id="coin-prices-title" className={sectionTitle}>Feature prices</h2></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" data-no-serial>
            <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 text-left font-semibold">Feature</th><th className="py-2 text-left font-semibold">Price (coins)</th><th className="py-2 text-left font-semibold">Free uses per month</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pricing.catalog.map((feature) => {
                const value = features[feature.key] || { price: 0, freePerMonth: 0 };
                return (
                  <tr key={feature.key} className="align-top">
                    <td className="py-3 pr-4"><p className="font-semibold text-slate-900 dark:text-white">{feature.label}</p><p className={`mt-0.5 ${helperText}`}>{feature.detail}</p></td>
                    <td className="py-3 pr-4"><input aria-label={`${feature.label} price`} className={`${inputClass} w-28`} type="number" min={0} step={1} value={Number.isFinite(value.price) ? value.price : ''} onChange={(event) => set(feature.key, 'price', event.target.value)} />{value.price === 0 && <span className={`mt-1 block ${helperText}`}>Free</span>}</td>
                    <td className="py-3"><input aria-label={`${feature.label} free uses per month`} className={`${inputClass} w-28`} type="number" min={0} step={1} disabled={value.price === 0} value={Number.isFinite(value.freePerMonth) ? value.freePerMonth : ''} onChange={(event) => set(feature.key, 'freePerMonth', event.target.value)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {invalid && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Use whole numbers of 0 or more.</p>}
        <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">Reason for this change (optional)
          <input className={`${inputClass} mt-1`} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: AI interviews now use a paid speech model." />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !unsaved || invalid} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"><Save className="h-4 w-4" aria-hidden="true" />{busy ? 'Saving…' : 'Save prices'}</button>
          <span className={helperText}>{pricing.updatedAt ? `Last changed ${new Date(pricing.updatedAt).toLocaleString()}` : 'Every feature is free until a price is saved.'}</span>
        </div>
      </section>
    </div>
  );
}
