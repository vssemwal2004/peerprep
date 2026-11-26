import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '../../utils/api';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { BADGE_LEVEL_EARNED, COINS_EARNED } from '../rewards/rewardEvents';
import MonthlyBadgeEmblem from '../rewards/MonthlyBadgeEmblem';
import { badgeLook, DARK_TIER_METAL, TIER_METAL } from '../rewards/badgeLooks';
import { card, focusRing, SectionHeader, Skeleton, Unavailable } from './ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const SHOWN = 3;
const monthName = (month) => {
  const [year, index] = String(month || '').split('-').map(Number);
  return year ? new Date(Date.UTC(year, index - 1, 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' }) : '';
};
const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/** Share of the way from the current level's target to the next one (100 when all 10 are done). */
function progressToNext(track) {
  if (!track.next) return 100;
  const previous = track.level ? track.targets[track.level - 1] : 0;
  return Math.max(0, Math.min(100, ((track.value - previous) / Math.max(1, track.next.target - previous)) * 100));
}

function BadgeCard({ track }) {
  const look = badgeLook(track.key);
  const next = track.next;
  const progress = progressToNext(track);
  const metal = track.level ? TIER_METAL[track.tier] : null;
  return <li className={`${card} group relative overflow-hidden p-4`}>
    {/* A soft wash of the badge's own colour, so every badge reads differently at a glance. */}
    <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-[0.12] blur-2xl transition-opacity group-hover:opacity-20 dark:opacity-[0.07] dark:group-hover:opacity-[0.12]" style={{ backgroundColor: look.accent }} aria-hidden="true" />
    <div className="relative flex items-start gap-3.5">
      <MonthlyBadgeEmblem track={track.key} level={track.level} tier={track.tier} size={58} title={`${track.title}: ${track.level ? `level ${track.level}, ${track.tier}` : 'not started this month'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-[color:var(--student-dash-fg)]">{track.title}</p>
          {track.level > 0 && <span className="shrink-0 rounded-full bg-[color:var(--badge-metal)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white dark:bg-[color:var(--badge-metal-dark)]"
            style={{ '--badge-metal': metal, '--badge-metal-dark': DARK_TIER_METAL[track.tier] || DARK_TIER_METAL.Bronze }}>{track.tier}</span>}
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-[color:var(--student-dash-muted)]">{track.description}</p>
        {/* Ten level pips: filled up to the current level. */}
        <ol className="mt-2.5 flex gap-1" aria-label={`Level ${track.level} of 10`}>
          {track.levels.map((entry) => <li key={entry.level} title={`Level ${entry.level} (${entry.tier}): ${entry.target} ${track.unit}${entry.coins ? ` · +${entry.coins} coins` : ''}`}
            className={`h-1.5 flex-1 rounded-full ${entry.earned ? 'dark:brightness-[0.96] dark:saturate-[0.86]' : 'bg-slate-100 dark:bg-white/[0.07]'}`} style={entry.earned ? { backgroundColor: look.accent } : undefined} />)}
        </ol>
      </div>
    </div>
    <div className="relative mt-3.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-slate-500 dark:text-[color:var(--student-dash-muted)]"><b className="text-[15px] text-slate-900 dark:text-[color:var(--student-dash-fg)]">{track.value}</b>{next ? <span className="text-slate-400 dark:text-[color:var(--student-dash-muted)]"> / {next.target}</span> : null} {track.unit}</span>
        {next
          ? <span className="inline-flex items-center gap-1 text-slate-500 dark:text-[color:var(--student-dash-muted)]">Level {next.level}{next.coins > 0
            ? <><PrepCoinIcon size={13} /><b className="text-amber-700 dark:text-amber-300">+{next.coins}</b></>
            : <span className="text-slate-400 dark:text-[color:var(--student-dash-muted)]">· badge only</span>}</span>
          : <span className="font-semibold" style={{ color: look.accent }}>All 10 levels</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={`${track.title} progress to the next level`}>
        <span className="block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none dark:brightness-[0.96] dark:saturate-[0.86]" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${look.from}, ${look.to})` }} />
      </div>
    </div>
  </li>;
}

/**
 * This month's badges: the same six for everyone, levels 1-10 with targets from the student's own
 * recent months. Shows the three closest to their next level; "Show all" opens the rest.
 */
export default function MonthlyBadgesCard() {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [expanded, setExpanded] = useState(false);
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
  // Most actionable first: closest to the next level, then the highest level.
  const ordered = useMemo(() => [...(data?.tracks || [])].sort((a, b) => (b.next ? progressToNext(b) : -1) - (a.next ? progressToNext(a) : -1) || b.level - a.level), [data]);
  const visible = expanded ? ordered : ordered.slice(0, SHOWN);
  const hidden = ordered.length - SHOWN;

  return <section id="badges" aria-labelledby="monthly-badges-title" className="scroll-mt-24">
    <SectionHeader id="monthly-badges-title" title={data ? `${monthName(data.month)} badges` : 'Monthly badges'} info={<GuideInfo step="dash-monthly-badges" />}
      action={data && <span className="flex shrink-0 items-center gap-3 text-[12px] text-slate-500 dark:text-[color:var(--student-dash-muted)]">
        <span className="inline-flex items-center gap-1"><PrepCoinIcon size={14} /><b className="text-amber-700 dark:text-amber-300">{data.coinsThisMonth}</b> earned</span>
        <span className="hidden sm:inline">New targets in {daysLeft(data.resetsAt)} days</span>
      </span>} />
    {/* Columns follow the space available, so the three badges share one row wherever they fit. */}
    {state.loading && !data ? <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">{Array.from({ length: SHOWN }, (_, index) => <Skeleton key={index} className="h-36" />)}</div>
      : state.error && !data ? <Unavailable message={state.error} onRetry={load} />
        : <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">{visible.map((track) => <BadgeCard key={track.key} track={track} />)}</ul>
          {hidden > 0 && <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
              className={`inline-flex items-center gap-1.5 rounded-full border border-[#e6e7eb] bg-white px-4 py-1.5 text-[12.5px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-[color:var(--student-dash-border)] dark:bg-[color:var(--student-dash-card)] dark:text-[color:var(--student-dash-fg)] dark:hover:bg-[color:var(--student-dash-hover)] ${focusRing}`}>
              {expanded ? 'Show fewer badges' : `Show all ${ordered.length} badges`}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          </div>}
        </>}
  </section>;
}
