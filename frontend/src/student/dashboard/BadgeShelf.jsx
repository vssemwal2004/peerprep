import { Link } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import BadgeEmblem from '../profile/BadgeEmblem';
import LevelMedallion from '../profile/LevelMedallion';
import { awardIcon, awardTone } from '../profile/awardVisuals';
import { levelTheme } from '../profile/levelTheme';
import { focusRing, Skeleton } from './ui';

/** Adaptive badges use the profile's emblem; classic awards keep their round medal. */
function Medal({ award, locked = false }) {
  const title = locked ? `Next: ${award.title} (${Math.min(award.value || 0, award.target)}/${award.target})` : award.title;
  const lift = 'transition-transform duration-200 group-hover:-translate-y-0.5';
  if (award.category) {
    return <span title={title} className={`relative ${lift}`}>
      <BadgeEmblem badge={{ ...award, earned: !locked }} className="h-11 w-10 drop-shadow-[0_3px_6px_rgba(16,24,40,0.18)]" />
      {locked && <LockPip />}
    </span>;
  }
  const Icon = awardIcon(award);
  return <span title={title} className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ring-[3px] ring-white dark:ring-[#242424] ${lift} ${locked
    ? 'from-slate-100 to-slate-200 text-slate-400 dark:from-zinc-700 dark:to-zinc-800 dark:text-zinc-500'
    : `text-white shadow-md ${awardTone(award)}`}`}>
    <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
    {locked && <LockPip />}
  </span>;
}

function LockPip() {
  return <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-700">
    <Lock className="h-2.5 w-2.5 text-slate-400" aria-hidden="true" />
  </span>;
}

/**
 * Level and earned badges beside the greeting. The whole shelf is one link to the profile's badge
 * collection, where editions, history and locked requirements live.
 */
export default function BadgeShelf({ shelf, loading }) {
  if (loading) return <Skeleton className="h-[68px] w-full rounded-2xl sm:w-[360px]" />;
  if (!shelf || (!shelf.total && !shelf.level)) return null;
  const { earned, total, nextAward, level } = shelf;
  const shown = earned.slice(0, 4);
  const theme = levelTheme(level?.level);
  const hasProgress = level?.next && Number.isFinite(Number(level.progress));
  const summary = `${level ? `Level ${level.level}, ${level.title}. ` : ''}${earned.length} of ${total} badges earned${nextAward ? `. Next: ${nextAward.title}` : ''}. Open your badges`;

  return <Link to="/student/profile#badges" aria-label={summary}
    className={`group flex w-full items-center gap-4 rounded-2xl border border-[#e9eaee] bg-white/80 px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] backdrop-blur-sm transition-[border-color,box-shadow] duration-200 hover:border-sky-200 hover:shadow-[0_12px_28px_-20px_rgba(2,132,199,0.55)] sm:w-auto dark:border-white/[0.07] dark:bg-[#242424]/80 dark:hover:border-sky-400/30 ${focusRing}`}>
    {level && <div className="flex min-w-0 items-center gap-3">
      <LevelMedallion level={level.level} size="sm" className="!ring-2" />
      <div className="min-w-0">
        <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">Level {level.level}{level.totalLevels ? ` of ${level.totalLevels}` : ''}</p>
        <p className="truncate text-[14px] font-semibold leading-tight text-slate-900 dark:text-zinc-50">{level.title}</p>
        {hasProgress && <span className="mt-1.5 block h-1 w-28 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]" title={`${Math.round(level.progress)}% to ${level.next.title}`}>
          <span className={`dashboard-fill block h-full rounded-full bg-gradient-to-r ${theme.gradient}`} style={{ width: `${level.progress}%` }} />
        </span>}
      </div>
    </div>}
    {level && <span className="h-10 w-px shrink-0 bg-[#e9eaee] dark:bg-white/[0.08]" aria-hidden="true" />}
    <div className="flex items-center gap-3" aria-hidden="true">
      {shown.length
        ? <span className="flex items-center -space-x-2.5">{shown.map((award) => <Medal key={award.id} award={award} />)}</span>
        : nextAward && <Medal award={nextAward} locked />}
      <span className="leading-tight">
        <span className="block text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-slate-950 dark:text-zinc-50">
          {earned.length}<span className="text-[13px] font-medium text-slate-400 dark:text-zinc-500">/{total}</span>
        </span>
        <span className="inline-flex items-center gap-0.5 text-[12px] text-slate-500 transition-colors group-hover:text-sky-700 dark:text-zinc-400 dark:group-hover:text-sky-300">
          {shown.length ? 'badges' : `Next: ${nextAward?.title || 'badge'}`}<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </div>
  </Link>;
}
