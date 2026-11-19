import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { api } from '../../utils/api';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { BADGE_LEVEL_EARNED, COINS_EARNED } from '../rewards/rewardEvents';
import { BADGE_MARKS, tierStyle } from '../rewards/tiers';
import { card, focusRing, ProgressBar, SectionHeader, Skeleton, Unavailable } from './ui';

const monthName = (month) => {
  const [year, index] = String(month || '').split('-').map(Number);
  return year ? new Date(Date.UTC(year, index - 1, 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' }) : '';
};
const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

function Emblem({ track, level, tier, size = 'md' }) {
  const style = tierStyle(level ? tier : null);
  const box = size === 'sm' ? 'h-9 w-9' : 'h-14 w-14';
  return <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${style.ring} p-[3px] shadow-sm`} aria-hidden="true">
    <span className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white dark:bg-[#242424]">
      <span className="text-[9px] font-bold tracking-wide text-slate-400">{BADGE_MARKS[track] || '★'}</span>
      <span className={`font-black leading-none text-slate-900 dark:text-white ${size === 'sm' ? 'text-sm' : 'text-lg'}`}>{level || '–'}</span>
    </span>
  </span>;
}

function BadgeTile({ track }) {
  const [open, setOpen] = useState(false);
  const next = track.next;
  const previousTarget = track.level ? track.targets[track.level - 1] : 0;
  const progress = next ? ((track.value - previousTarget) / Math.max(1, next.target - previousTarget)) * 100 : 100;
  const style = tierStyle(track.tier);
  return <li className={`${card} p-4`}>
    <div className="flex items-center gap-3">
      <Emblem track={track.key} level={track.level} tier={track.tier} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-zinc-50">{track.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className={`rounded-full px-1.5 py-px font-semibold ring-1 ${style.chip}`}>{track.level ? `Level ${track.level}/10 · ${track.tier}` : 'Level 0/10'}</span>
          {track.coinsEarned > 0 && <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 dark:text-amber-300"><PrepCoinIcon size={12} />{track.coinsEarned}</span>}
        </p>
      </div>
    </div>
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between text-[11.5px] text-slate-500 dark:text-zinc-400">
        <span><b className="text-slate-900 dark:text-zinc-100">{track.value}</b> {track.unit}</span>
        {next ? <span>Level {next.level} at {next.target}</span> : <span className="font-semibold text-rose-600 dark:text-rose-300">All 10 levels</span>}
      </div>
      <ProgressBar value={progress} tone={tierStyle(next?.tier).bar} label={`${track.title} progress to the next level`} />
      {next && <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-zinc-400">
        {next.target - track.value} more for <PrepCoinIcon size={12} /><b className="text-amber-700 dark:text-amber-300">+{next.coins}</b>
      </p>}
    </div>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={`mt-2 inline-flex items-center gap-1 rounded text-[11.5px] font-semibold text-sky-700 dark:text-sky-400 ${focusRing}`}>
      All levels <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <ol className="mt-2 grid grid-cols-5 gap-1.5">
      {track.levels.map((entry) => <li key={entry.level} title={`Level ${entry.level} (${entry.tier}): ${entry.target} ${track.unit} · +${entry.coins} coins`}
        className={`rounded-lg px-1 py-1 text-center text-[10.5px] ring-1 ${entry.earned ? tierStyle(entry.tier).chip : 'bg-slate-50 text-slate-400 ring-slate-100 dark:bg-white/[0.03] dark:text-zinc-500 dark:ring-white/5'}`}>
        <span className="block font-bold">{entry.earned ? `L${entry.level}` : <Lock className="mx-auto h-3 w-3" aria-label={`Level ${entry.level} locked`} />}</span>
        <span className="block tabular-nums">{entry.target}</span>
      </li>)}
    </ol>}
  </li>;
}

/**
 * This month's badges: the same six badges for everyone, with levels 1-10 whose targets come from
 * the student's own recent months. Refreshes when a reward arrives.
 */
export default function MonthlyBadgesCard() {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const timer = useRef(null);
  const load = useCallback(() => api.monthlyBadges()
    .then((data) => setState({ loading: false, error: '', data }))
    .catch((error) => setState((current) => ({ loading: false, error: error.message || 'Badges could not be loaded.', data: current.data }))), []);
  useEffect(() => {
    load();
    const refresh = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 800); };
    window.addEventListener(BADGE_LEVEL_EARNED, refresh);
    window.addEventListener(COINS_EARNED, refresh);
    return () => { clearTimeout(timer.current); window.removeEventListener(BADGE_LEVEL_EARNED, refresh); window.removeEventListener(COINS_EARNED, refresh); };
  }, [load]);

  const { data } = state;
  return <section id="badges" aria-labelledby="monthly-badges-title" className="scroll-mt-24">
    <SectionHeader id="monthly-badges-title" title={data ? `${monthName(data.month)} badges` : 'Monthly badges'}
      action={data && <span className="flex shrink-0 items-center gap-3 text-[12px] text-slate-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1"><PrepCoinIcon size={14} /><b className="text-amber-700 dark:text-amber-300">{data.coinsThisMonth}</b> earned</span>
        <span>New targets in {daysLeft(data.resetsAt)} days</span>
      </span>} />
    {state.loading && !data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-36" />)}</div>
      : state.error && !data ? <Unavailable message={state.error} onRetry={load} />
        : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.tracks.map((track) => <BadgeTile key={track.key} track={track} />)}</ul>}
  </section>;
}
