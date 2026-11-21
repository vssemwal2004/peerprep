import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Info, Medal, X } from 'lucide-react';
import { LEVEL_POINTS_FORMULA, getLearnerLevelLadder } from '../profileBadge';
import { levelTheme } from './levelTheme';
import LevelMedallion from './LevelMedallion';
import { focusRing } from './format';
import BadgeMedal from '../badges/BadgeMedal';
import { FAMILY_LABELS, fromAward, orderBadges } from '../badges/badgeModel';

const MotionDiv = motion.div;

function shortDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'earned', label: 'Earned' },
  { key: 'locked', label: 'Locked' },
];

function BadgeTile({ badge }) {
  const earnedAt = badge.earnedLabel || shortDate(badge.earnedAt);
  return (
    <li className={`group flex gap-3 rounded-xl border p-3 transition-colors ${badge.earned
      ? 'border-slate-200 bg-white hover:border-amber-200 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-400/30'
      : 'border-dashed border-slate-200 bg-slate-50/60 dark:border-zinc-800 dark:bg-zinc-900/40'}`}
    >
      <BadgeMedal badge={badge} size={54} interactive />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-100">{badge.title}</h3>
          {badge.earned ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Check className="h-3 w-3" aria-hidden="true" />
              Earned
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400 dark:text-zinc-500">{badge.valueText}</span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">{badge.description}</p>
        <p className="mt-1 text-[10px] text-sky-600 dark:text-sky-400">{FAMILY_LABELS[badge.family]} · {badge.tier}</p>
        {badge.earned ? (
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-zinc-500">{earnedAt ? `Earned ${badge.earnedLabel ? 'in' : 'on'} ${earnedAt}` : 'Unlocked'}</p>
        ) : (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-zinc-800" role="progressbar" aria-label={`${badge.title} progress`}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(badge.progress)}>
              <div className="h-full rounded-full" style={{ width: `${badge.progress}%`, background: `linear-gradient(90deg, ${badge.look.from}, ${badge.look.to})` }} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">{badge.hint}</p>
          </>
        )}
      </div>
    </li>
  );
}

function LevelRow({ tier, currentLevel, progress, achievedAt, isLast, allRequirements, hereLabel = 'You are here' }) {
  const theme = levelTheme(tier.level);
  const reached = tier.level <= currentLevel;
  const isCurrent = tier.level === currentLevel;
  const isNext = tier.level === currentLevel + 1;
  return (
    <li className="relative flex gap-4">
      {/* Ladder rail */}
      {!isLast ? (
        <span
          className={`absolute left-[27px] top-14 h-[calc(100%-2.5rem)] w-0.5 ${tier.level < currentLevel ? 'bg-sky-300 dark:bg-sky-700' : 'bg-slate-200 dark:bg-zinc-800'}`}
          aria-hidden="true"
        />
      ) : null}
      <div className={reached ? '' : 'opacity-40 grayscale'}>
        <LevelMedallion level={tier.level} size="md" />
      </div>
      <div className={`mb-4 min-w-0 flex-1 rounded-xl border p-3 ${isCurrent
        ? 'border-sky-200 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/5'
        : 'border-slate-200 dark:border-zinc-800'}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${theme.soft}`}>
            Level {tier.level}
          </span>
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-zinc-100">{tier.title}</h3>
          {isCurrent ? (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">{hereLabel}</span>
          ) : null}
          {reached && !isCurrent ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" aria-hidden="true" />
              Reached
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">{tier.helper}</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
          {tier.level === 1 ? 'Requirement' : allRequirements ? 'Complete all requirements' : 'Reach it with any one of'}
        </p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {tier.requirements.map((requirement) => (
            <li key={requirement} className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700">
              {requirement}
            </li>
          ))}
        </ul>
        {isNext ? (
          <div className="mt-2.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-zinc-800" aria-hidden="true">
              <div className={`h-full rounded-full bg-gradient-to-r ${theme.gradient}`} style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">{Math.round(progress)}% of the way there</p>
          </div>
        ) : null}
        {achievedAt ? <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">Reached on {achievedAt}</p> : null}
      </div>
    </li>
  );
}

/**
 * LeetCode-style badges gallery: every award (how to earn it, progress, earned date) and the full
 * level ladder (requirements, where the student is, progress to the next level).
 */
export default function BadgesGallery({ open, onClose, level, awards, collection, learnerProgress, initialTab = 'awards', subjectName = '', levelLadder }) {
  const reduceMotion = useReducedMotion();
  // subjectName set = someone else (admin/coordinator) is viewing this student's badges.
  const viewer = subjectName
    ? {
      heading: `${subjectName}'s badges`,
      here: 'Current level',
      practise: 'Awards unlock automatically as the student practises.',
      none: 'No awards earned yet.',
      rule: 'A student moves up a level on meeting',
      points: 'This student has',
    }
    : {
      heading: 'Your badges',
      here: 'You are here',
      practise: 'Badges unlock automatically as you practise.',
      none: 'No awards earned yet. Your first one is close.',
      rule: 'You move up a level when you meet',
      points: 'You have',
    };
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const ladder = useMemo(() => levelLadder || getLearnerLevelLadder(), [levelLadder]);

  useEffect(() => {
    if (!open) return undefined;
    setTab(initialTab);
    setFilter('all');
    setCategory('all');
    // Remember the opener so focus returns to it on close.
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      // Keep Tab / Shift+Tab inside the modal.
      const focusable = [...dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.disabled && node.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!dialogRef.current.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [initialTab, onClose, open]);

  const levelDates = new Map((learnerProgress?.levelHistory || []).map((entry) => [entry.level, shortDate(entry.achievedAt)]));
  // Every badge family in one list (achievements, lifetime milestones, monthly): earned first.
  const all = useMemo(() => {
    if (collection) return collection;
    const earnedDates = new Map((learnerProgress?.awards || []).map((entry) => [entry.id, entry.earnedAt]));
    const items = (awards?.awards || []).map((award) => fromAward({ ...award, earnedAt: award.earnedAt || earnedDates.get(award.id) || null }));
    return { items, ...orderBadges(items), total: items.length };
  }, [awards, collection, learnerProgress]);
  const ordered = [...all.earned, ...all.locked];
  const list = ordered.filter((badge) => (category === 'all' || badge.family === category) && (filter === 'all' ? true : filter === 'earned' ? badge.earned : !badge.earned));
  const categories = [...new Set(ordered.map((badge) => badge.family))];
  const currentLevel = level?.level || 1;

  return (
    <AnimatePresence>
      {open ? (
        <MotionDiv
          key="badges-gallery"
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
          role="presentation"
        >
          <MotionDiv
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="badges-gallery-title"
            className="flex max-h-[min(88vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white font-['Inter',ui-sans-serif,system-ui,sans-serif] shadow-2xl dark:border-zinc-700 dark:bg-[#1f1f22]"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-sky-500 via-sky-400 to-cyan-400 px-5 pb-4 pt-5 text-white dark:from-sky-800 dark:via-sky-700 dark:to-cyan-800">
              <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px]" aria-hidden="true" />
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close badges"
                className={`absolute right-3 top-3 z-10 rounded-lg p-1.5 text-white/90 hover:bg-white/15 ${focusRing}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="relative flex items-center gap-4">
                <LevelMedallion level={currentLevel} size="md" className="!ring-white/40" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">{viewer.heading}</p>
                  <h2 id="badges-gallery-title" className="truncate text-lg font-semibold tracking-tight">
                    Level {currentLevel} · {level?.title}
                  </h2>
                  <p className="text-[12px] text-white/85">
                    {all.earned.length} of {all.total} badges earned · {level?.score ?? 0} {levelLadder ? 'XP' : 'level points'}
                  </p>
                </div>
              </div>

              <div className="relative mt-4 inline-flex rounded-lg bg-white/15 p-1" role="tablist" aria-label="Badge views">
                {[{ key: 'awards', label: 'Badges' }, { key: 'levels', label: 'Levels' }].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    id={`badges-tab-${item.key}`}
                    aria-selected={tab === item.key}
                    aria-controls={`badges-panel-${item.key}`}
                    onClick={() => setTab(item.key)}
                    className={`rounded-md px-3 py-1 text-[12px] font-semibold transition-colors ${focusRing} ${tab === item.key ? 'bg-white text-sky-700 shadow-sm' : 'text-white/90 hover:bg-white/10'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body (scrolls inside the popup) */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tab === 'awards' ? (
                <div role="tabpanel" id="badges-panel-awards" aria-labelledby="badges-tab-awards">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-zinc-400">
                      <Medal className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                      {viewer.practise}
                    </p>
                    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-800" role="group" aria-label="Filter awards">
                      {FILTERS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          aria-pressed={filter === item.key}
                          onClick={() => setFilter(item.key)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${focusRing} ${filter === item.key
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                            : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {categories.length > 1 && <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Badge families">{['all', ...categories].map((value) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${focusRing} ${category === value ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>{value === 'all' ? 'All' : FAMILY_LABELS[value]}</button>)}</div>}
                  {list.length > 0 ? (
                    <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {list.map((badge) => <BadgeTile key={badge.uid} badge={badge} />)}
                    </ul>
                  ) : (
                    <p className="mt-6 text-center text-[13px] text-slate-500 dark:text-zinc-400">
                      {filter === 'earned' ? viewer.none : 'No badges match this filter.'}
                    </p>
                  )}
                </div>
              ) : (
                <div role="tabpanel" id="badges-panel-levels" aria-labelledby="badges-tab-levels">
                  <div className="mb-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-300">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
                    <div>
                      {levelLadder ? <p>Every level requires <strong>all three</strong>: lifetime XP, demonstrated mastery and verified active days. Your earned level is permanent. Monthly journeys reset; your XP and badges stay with you.</p> : <><p>
                        {viewer.rule} <span className="font-semibold">any one</span> of its requirements.
                        Level points are calculated as:
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {LEVEL_POINTS_FORMULA.map((item) => (
                          <li key={item.label} className="rounded-md bg-white px-2 py-0.5 text-[11px] ring-1 ring-inset ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-700">
                            {item.label} <span className="font-semibold text-sky-600 dark:text-sky-400">+{item.points}</span>
                          </li>
                        ))}
                      </ul></>}
                      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                        {viewer.points} <span className="font-semibold text-slate-700 dark:text-zinc-200">{level?.score ?? 0}</span> {levelLadder ? `XP · ${level?.mastery || 0}% mastery · ${level?.activeDays || 0} active days` : 'level points'}.
                      </p>
                    </div>
                  </div>
                  <ol>
                    {ladder.map((tier, index) => (
                      <LevelRow
                        key={tier.level}
                        tier={tier}
                        currentLevel={currentLevel}
                        progress={level?.progress || 0}
                        achievedAt={levelDates.get(tier.level)}
                        isLast={index === ladder.length - 1}
                        allRequirements={Boolean(levelLadder)}
                        hereLabel={viewer.here}
                      />
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </MotionDiv>
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}
