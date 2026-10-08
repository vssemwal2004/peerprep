import { ChevronRight, Lock, Medal } from 'lucide-react';
import { Card } from './ui';
import { levelTheme } from './levelTheme';
import LevelMedallion from './LevelMedallion';
import { awardIcon, awardTone } from './awardVisuals';
import { focusRing } from './format';

function shortDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function MiniMedal({ award, onClick }) {
  const Icon = awardIcon(award);
  const status = award.earned ? 'Earned' : `${Math.min(award.value, award.target)}/${award.target}`;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        title={`${award.title}: ${award.description} (${status})`}
        aria-label={`${award.title}, ${award.earned ? 'earned' : `locked, ${status}`}. Open badges`}
        className={`group flex w-full justify-center rounded-lg ${focusRing}`}
      >
        {/* 32px + shrink-0: ten medals fit a half-width card (xl) without squashing into ovals. */}
        <span
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:-translate-y-0.5 ${award.earned
            ? `bg-gradient-to-br text-white shadow-md ${awardTone(award)}`
            : 'bg-slate-100 text-slate-300 dark:bg-zinc-800 dark:text-zinc-600'}`}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
          {!award.earned ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-700">
              <Lock className="h-2 w-2 text-slate-400" />
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * LeetCode-style badges card: level block + every award (earned in colour, locked faded).
 * "View all" (or any medal / the level block) calls onOpenGallery('awards' | 'levels').
 */
export default function BadgesCard({ level, awards, learnerProgress, onOpenGallery, className = '' }) {
  const setGallery = onOpenGallery;
  const theme = levelTheme(level?.level);
  const levelEntry = (learnerProgress?.levelHistory || []).filter((entry) => entry.level === level?.level).slice(-1)[0];
  const levelDate = shortDate(levelEntry?.achievedAt);
  // Earned first, then locked by closeness, so the row reads as a progress story.
  const ordered = [...awards.awards].sort((a, b) => (Number(b.earned) - Number(a.earned)) || (b.progress - a.progress));
  // Most recent earned award (by server earned date when known, else the last earned in order).
  const earnedDates = new Map((learnerProgress?.awards || []).map((entry) => [entry.id, entry.earnedAt]));
  const mostRecent = awards.awards
    .filter((award) => award.earned)
    .sort((a, b) => new Date(earnedDates.get(b.id) || 0) - new Date(earnedDates.get(a.id) || 0))[0] || null;

  return (
    <Card
      id="badges"
      title="Badges"
      description={`${awards.earnedCount} of ${awards.awards.length} earned`}
      icon={<Medal className="h-4 w-4" />}
      className={className}
      action={(
        <button
          type="button"
          onClick={() => setGallery('awards')}
          className={`inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 ${focusRing}`}
        >
          View all
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    >
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setGallery('levels')}
            aria-label={`Level ${level?.level} ${level?.title}. View all levels`}
            className={`flex items-center gap-3 rounded-lg bg-slate-50/80 px-2.5 py-2 text-left transition-colors hover:bg-slate-100/80 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/60 ${focusRing}`}
          >
            <LevelMedallion level={level?.level} size="sm" className="!ring-2" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-50">
                  {level?.title}
                  <span className={`ml-1.5 rounded px-1 py-px align-middle text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${theme.soft}`}>
                    Lv {level?.level}/{level?.totalLevels}
                  </span>
                </p>
                <span className="shrink-0 text-[10px] text-slate-500 dark:text-zinc-400">
                  {level?.next ? `${Math.round(level.progress)}% to ${level.next.title}` : 'Top level'}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-zinc-800" aria-hidden="true">
                <div className={`h-full rounded-full bg-gradient-to-r ${theme.gradient}`} style={{ width: `${level?.progress || 0}%` }} />
              </div>
              {levelDate ? <p className="mt-0.5 text-[10px] text-slate-400 dark:text-zinc-500">Since {levelDate}</p> : null}
            </div>
          </button>

          <ul className="grid grid-cols-5 gap-x-0.5 gap-y-1.5 sm:grid-cols-10">
            {ordered.map((award) => (
              <MiniMedal key={award.id} award={award} onClick={() => setGallery('awards')} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] dark:border-zinc-800">
            <span className="text-slate-500 dark:text-zinc-400">
              Most recent:{' '}
              <span className="font-semibold text-slate-700 dark:text-zinc-200">{mostRecent ? mostRecent.title : 'None yet'}</span>
            </span>
            {awards.nextAward ? (
              <span className="text-slate-500 dark:text-zinc-400">
                Next: <span className="font-semibold text-slate-700 dark:text-zinc-200">{awards.nextAward.title}</span>
                {' '}<span className="tabular-nums">({Math.min(awards.nextAward.value, awards.nextAward.target)}/{awards.nextAward.target})</span>
              </span>
            ) : (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">All earned!</span>
            )}
          </div>
        </div>
    </Card>
  );
}
