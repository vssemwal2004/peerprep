import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Medal } from 'lucide-react';
import { Card } from './ui';
import { levelTheme } from './levelTheme';
import LevelMedallion from './LevelMedallion';
import { focusRing } from './format';
import BadgeMedal from '../badges/BadgeMedal';
import { FAMILY_LABELS, fromAward, nextLocked, orderBadges } from '../badges/badgeModel';

const SHOWN = 10;

function shortDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function GridBadge({ badge, index, onOpen }) {
  const reduce = useReducedMotion();
  const sub = badge.earned ? (badge.earnedLabel || shortDate(badge.earnedAt) || 'Earned') : badge.valueText || 'Locked';
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.04 * index, type: 'spring', stiffness: 300, damping: 22 }}>
      <button type="button" onClick={onOpen} title={`${badge.title}: ${badge.description}`}
        aria-label={`${badge.title}, ${badge.earned ? 'earned' : `locked, ${sub}`}. Open badges`}
        className={`group flex w-full flex-col items-center rounded-xl px-1 py-2 text-center transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04] ${focusRing}`}>
        <span className="transition-transform duration-300 group-hover:-translate-y-1"><BadgeMedal badge={badge} size={56} interactive /></span>
        <span className={`mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight ${badge.earned ? 'text-slate-800 dark:text-zinc-100' : 'text-slate-500 dark:text-zinc-400'}`}>{badge.title}</span>
        <span className="mt-0.5 text-[10px] tabular-nums text-slate-400 dark:text-zinc-500">{sub}</span>
      </button>
    </motion.li>
  );
}

/**
 * The profile's one Badges card: level, every badge family (achievements, lifetime milestones,
 * monthly) in one grid — earned first, then the next ones to unlock in their locked form — and
 * what is closest. "View all" (or any badge / the level block) calls onOpenGallery('awards' | 'levels').
 * collection: from useBadgeCollection; without it the card shows the achievements in `awards`.
 */
export default function BadgesCard({ level, awards, collection, learnerProgress, onOpenGallery, className = '', loading = false, error = false, onRetry }) {
  const setGallery = onOpenGallery;
  const theme = levelTheme(level?.level);
  const levelEntry = (learnerProgress?.levelHistory || []).filter((entry) => entry.level === level?.level).slice(-1)[0];
  const levelDate = shortDate(levelEntry?.achievedAt);

  const all = useMemo(() => {
    if (collection) return collection;
    const earnedDates = new Map((learnerProgress?.awards || []).map((entry) => [entry.id, entry.earnedAt]));
    const items = (awards?.awards || []).map((award) => fromAward({ ...award, earnedAt: award.earnedAt || earnedDates.get(award.id) || null }));
    return { items, ...orderBadges(items), total: items.length };
  }, [awards, collection, learnerProgress]);

  const upcoming = nextLocked(all.locked);
  const grid = [...all.earned, ...upcoming].slice(0, SHOWN);
  const families = ['award', 'lifetime', 'monthly']
    .map((family) => ({ family, total: all.items.filter((item) => item.family === family).length, earned: all.earned.filter((item) => item.family === family).length }))
    .filter((entry) => entry.total > 0);

  return (
    <Card
      id="badges"
      title="Badges"
      description={loading ? 'Loading your verified achievements…' : error ? 'Achievement sync unavailable' : `${all.earned.length} of ${all.total} earned`}
      icon={<Medal className="h-4 w-4" />}
      className={`relative scroll-mt-24 ${className}`}
      action={(
        <button type="button" onClick={() => setGallery('awards')}
          className={`inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 ${focusRing}`}>
          View all {all.total ? all.total : ''}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    >
      {/* Older notifications link to #lifetime-badges; they land on this card. */}
      <span id="lifetime-badges" className="absolute top-0" aria-hidden="true" />
      {error && <p role="status" className="mb-3 text-xs text-slate-500">Your earned badges are safe. <button type="button" onClick={onRetry} className={`text-sky-600 underline ${focusRing}`}>Retry sync</button></p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,250px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={() => setGallery('levels')} aria-label={`Level ${level?.level} ${level?.title}. View all levels`}
            className={`flex items-center gap-3 rounded-xl bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:bg-slate-100/80 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/60 ${focusRing}`}>
            <LevelMedallion level={level?.level} size="sm" className="!ring-2" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-50">
                {level?.title}
                <span className={`ml-1.5 rounded px-1 py-px align-middle text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${theme.soft}`}>Lv {level?.level}/{level?.totalLevels}</span>
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-zinc-800" aria-hidden="true">
                <div className={`h-full rounded-full bg-gradient-to-r ${theme.gradient}`} style={{ width: `${level?.progress || 0}%` }} />
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-zinc-400">{level?.next ? `${Math.round(level.progress)}% to ${level.next.title}` : 'Top level'}{levelDate ? ` · since ${levelDate}` : ''}</p>
            </div>
          </button>

          {upcoming.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-2.5 dark:border-zinc-700">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Up next</p>
              <ul className="mt-1.5 space-y-2">
                {upcoming.slice(0, 3).map((badge) => (
                  <li key={badge.uid} className="flex items-center gap-2.5">
                    <BadgeMedal badge={badge} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[12px] font-semibold text-slate-700 dark:text-zinc-200">{badge.title}</p>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400 dark:text-zinc-500">{badge.valueText}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="progressbar" aria-label={`${badge.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(badge.progress)}>
                        <div className="h-full rounded-full" style={{ width: `${badge.progress}%`, background: `linear-gradient(90deg, ${badge.look.from}, ${badge.look.to})` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col">
          {loading && !grid.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => <span key={index} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.04]" />)}
            </div>
          ) : (
            // Five per row: ten badges make two even rows.
            <ul className="grid grid-cols-3 gap-1 sm:grid-cols-5">
              {grid.map((badge, index) => <GridBadge key={badge.uid} badge={badge} index={index} onOpen={() => setGallery('awards')} />)}
            </ul>
          )}
          {families.length > 1 ? (
            <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 text-[11px] dark:border-zinc-800">
              {families.map((entry) => (
                <button key={entry.family} type="button" onClick={() => setGallery('awards')}
                  className={`rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 dark:bg-white/[0.04] dark:text-zinc-300 dark:ring-white/10 ${focusRing}`}>
                  {FAMILY_LABELS[entry.family]} <b className="tabular-nums text-slate-900 dark:text-white">{entry.earned}</b><span className="text-slate-400">/{entry.total}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
