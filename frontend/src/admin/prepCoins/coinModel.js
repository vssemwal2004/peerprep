import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Building2, RotateCcw, Sparkles } from 'lucide-react';

// Labels, formatting and the live-refresh hook shared by the Prep Coin console pages.

export const formatCoins = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0);

const ISSUED = 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20';
const SHARED = 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20';
const SPENT = 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20';
const NEUTRAL = 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10';

export const KIND_META = {
  initial: { label: 'Starting coins', group: 'issued', Icon: Sparkles, chip: ISSUED },
  topup: { label: 'University top-up', group: 'issued', Icon: Building2, chip: ISSUED },
  superadmin_to_coordinator: { label: 'Issued to coordinator', group: 'issued', Icon: ArrowDownLeft, chip: ISSUED },
  superadmin_to_student: { label: 'Issued to student', group: 'issued', Icon: ArrowDownLeft, chip: ISSUED },
  admin_to_coordinator: { label: 'Admin → coordinator', group: 'shared', Icon: ArrowRightLeft, chip: SHARED },
  coordinator_to_student: { label: 'Coordinator → student', group: 'shared', Icon: ArrowRightLeft, chip: SHARED },
  student_spend: { label: 'Spent', group: 'spent', Icon: ArrowUpRight, chip: SPENT },
  student_refund: { label: 'Refund', group: 'refunded', Icon: RotateCcw, chip: NEUTRAL },
};

export const KIND_GROUPS = [
  { value: '', label: 'All movements' },
  { value: 'issued', label: 'Issued' },
  { value: 'shared', label: 'Passed on' },
  { value: 'spent', label: 'Spent' },
  { value: 'refunded', label: 'Refunded' },
];

export const kindMeta = (kind) => KIND_META[kind] || { label: kind, group: '', Icon: ArrowRightLeft, chip: NEUTRAL };

/** Polls a loader while the tab is visible; refreshes immediately when the tab comes back. */
export function useLive(loader, intervalMs = 30_000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; }, [loader]);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loaderRef.current());
      setError('');
      setUpdatedAt(new Date());
    } catch (failure) {
      setError(failure?.message || 'Could not load Prep Coin data.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload, intervalMs]);
  return { data, error, loading, updatedAt, reload, setData };
}

export const buttonClass = {
  primary: 'inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10',
};

export const inputClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white/90 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-slate-900/70 dark:text-white';
