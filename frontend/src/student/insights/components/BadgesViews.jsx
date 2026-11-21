import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Award, Loader2, Sparkles } from "lucide-react";
import BadgeMedal from "../../badges/BadgeMedal";
import { FAMILY_LABELS, fromAward, nextLocked } from "../../badges/badgeModel";
import { useBadgeCollection } from "../../badges/useBadgeCollection";
import LevelMedallion from "../../profile/LevelMedallion";
import { levelTheme } from "../../profile/levelTheme";
import { fullDate, sectionPath } from "../insightModel";
import { Card, CardTitle, Empty, focusRing, ProgressBar } from "./ui";

const MEDAL_SIZE = { sm: 38, md: 46, lg: 60 };

/** One award as the shared badge medal (locked form when not earned). */
export function AwardMedal({ award, size = "md" }) {
  return <BadgeMedal badge={fromAward(award)} size={MEDAL_SIZE[size] || MEDAL_SIZE.md} interactive={award.earned} />;
}

/** Level, latest badges and the next badge, for the overview. */
export function BadgesCard({ badges }) {
  const reduce = useReducedMotion();
  if (badges.loading) return <Card className="flex h-full min-h-[200px] items-center justify-center gap-2 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading badges…</Card>;
  const data = badges.data;
  if (!data) return null;
  const theme = levelTheme(data.level?.level);
  const next = data.nextAward || data.locked[0];
  return (
    <Card className="group relative h-full overflow-hidden p-4">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-transform duration-700 group-hover:scale-125 ${theme.gradient}`} aria-hidden="true" />
      <CardTitle title="Badges & level" hint={`${data.earned.length} of ${data.total} earned`} right={<Link to={sectionPath("badges")} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>All badges<ArrowRight className="h-3.5 w-3.5" /></Link>} />
      {data.level && (
        <div className="relative mb-3 flex items-center gap-3 rounded-2xl bg-[#f6f7f9] p-3 dark:bg-white/[0.04]">
          <LevelMedallion level={data.level.level} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">Level {data.level.level}{data.level.totalLevels ? ` of ${data.level.totalLevels}` : ""}</p>
            <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-zinc-50">{data.level.title}</p>
            {data.level.next && Number.isFinite(Number(data.level.progress)) && (
              <div className="mt-1.5"><ProgressBar value={Number(data.level.progress)} color="#0284c7" label={`Progress to ${data.level.next.title}`} /><p className="mt-1 text-[10.5px] text-slate-400">{Math.round(data.level.progress)}% to {data.level.next.title}</p></div>
            )}
          </div>
        </div>
      )}
      <div className="relative flex flex-wrap items-center gap-1.5">
        {data.earned.slice(0, 6).map((award, index) => (
          <motion.span key={award.id} title={award.title} initial={reduce ? false : { opacity: 0, scale: 0.6, rotateY: -90 }} animate={{ opacity: 1, scale: 1, rotateY: 0 }} transition={{ delay: 0.1 + index * 0.06, type: "spring", stiffness: 320, damping: 18 }} className="transition-transform duration-200 hover:-translate-y-1">
            <AwardMedal award={award} size="sm" />
          </motion.span>
        ))}
        {!data.earned.length && <p className="text-[12px] text-slate-500 dark:text-zinc-400">No badges yet. Your first one is close.</p>}
      </div>
      {next && (
        <div className="relative mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-2.5 dark:border-white/10">
          <AwardMedal award={next} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-slate-800 dark:text-zinc-100">Next: {next.title}</p>
            <ProgressBar value={fromAward(next).progress} label={`Progress to ${next.title}`} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-slate-500">{Math.round(fromAward(next).progress)}%</span>
        </div>
      )}
    </Card>
  );
}

function BadgeTile({ badge, index }) {
  const reduce = useReducedMotion();
  const earnedText = badge.earnedLabel || (badge.earnedAt ? fullDate(badge.earnedAt) : "");
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 20) * 0.03, duration: 0.35 }}
      className={`group flex flex-col items-center rounded-2xl border p-4 text-center transition duration-300 hover:-translate-y-1 ${badge.earned ? "border-[#e9eaee] bg-white hover:border-amber-200 hover:shadow-[0_16px_32px_-22px_rgba(217,119,6,0.6)] dark:border-white/[0.07] dark:bg-[#232325]" : "border-dashed border-slate-200 bg-[#fafbfc] dark:border-white/10 dark:bg-white/[0.02]"}`}>
      <BadgeMedal badge={badge} size={64} interactive />
      <p className="mt-2 text-[13px] font-semibold text-slate-900 dark:text-zinc-100">{badge.title}</p>
      {badge.description && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-slate-500 dark:text-zinc-400">{badge.description}</p>}
      <p className="mt-1 text-[10.5px] font-medium text-slate-400 dark:text-zinc-500">{FAMILY_LABELS[badge.family]} · {badge.tier}</p>
      {badge.earned
        ? <p className="mt-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{earnedText ? `Earned ${badge.earnedLabel ? "in" : ""} ${earnedText}`.replace("  ", " ") : "Earned"}</p>
        : <div className="mt-2 w-full"><ProgressBar value={badge.progress} label={`${badge.title} progress`} /><p className="mt-1 text-[10.5px] tabular-nums text-slate-400">{badge.valueText || `${Math.round(badge.progress)}%`}</p></div>}
    </motion.li>
  );
}

const FILTERS = ["all", "award", "lifetime", "monthly"];

/**
 * Every badge — achievements, lifetime milestones and monthly badges, the same set as the profile:
 * earned first (newest first), then the next ones to unlock. "Show every locked badge" lists all.
 */
export function BadgesPage({ badges, milestones, coding = false }) {
  const collection = useBadgeCollection({ awards: badges.data?.awards, milestones: coding });
  const [family, setFamily] = useState("all");
  const [allLocked, setAllLocked] = useState(false);
  if (badges.loading) return <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading badges…</Card>;
  if (!badges.data && !collection.items.length) return <Card><Empty icon={Award} title="Badges could not be loaded." /></Card>;
  const level = badges.data?.level;
  const match = (badge) => family === "all" || badge.family === family;
  const earned = collection.earned.filter(match);
  const lockedAll = collection.locked.filter(match);
  const locked = allLocked ? lockedAll : nextLocked(lockedAll);
  const families = FILTERS.filter((key) => key === "all" || collection.items.some((badge) => badge.family === key));
  return (
    <div className="space-y-4" data-guide="an-badges-page">
      <div className="grid gap-3 md:grid-cols-3">
        {level && (
          <Card className="relative overflow-hidden p-5 md:col-span-1">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-[0.12] ${levelTheme(level.level).gradient}`} aria-hidden="true" />
            <div className="relative flex items-center gap-4">
              <LevelMedallion level={level.level} size="lg" />
              <div className="min-w-0">
                <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">Level {level.level}{level.totalLevels ? ` of ${level.totalLevels}` : ""}</p>
                <p className="text-[20px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-zinc-50">{level.title}</p>
                {level.next && Number.isFinite(Number(level.progress)) && <><div className="mt-2 w-40"><ProgressBar value={Number(level.progress)} height="h-2" label="Level progress" /></div><p className="mt-1 text-[11px] text-slate-500">{Math.round(level.progress)}% to {level.next.title}</p></>}
              </div>
            </div>
          </Card>
        )}
        <Card className={`flex items-center gap-4 p-5 ${level ? "md:col-span-2" : "md:col-span-3"}`}>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-500/10" aria-hidden="true"><Sparkles className="h-7 w-7" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-slate-500 dark:text-zinc-400">Badges earned</p>
            <p className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-slate-950 dark:text-zinc-50">{collection.earned.length}<span className="text-[16px] text-slate-400">/{collection.total}</span></p>
            <div className="mt-2 max-w-md"><ProgressBar value={collection.earned.length} max={collection.total || 1} height="h-2" color="#f59e0b" label="Badges earned" /></div>
          </div>
          {milestones?.next && <div className="hidden text-right sm:block"><p className="text-[11px] text-slate-500 dark:text-zinc-400">Next solve milestone</p><p className="text-[18px] font-semibold text-slate-900 dark:text-zinc-100">{milestones.next.count}</p><p className="text-[11px] text-slate-400">{milestones.next.remaining} to go</p></div>}
        </Card>
      </div>

      {families.length > 2 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Badge families">
          {families.map((key) => (
            <button key={key} type="button" aria-pressed={family === key} onClick={() => setFamily(key)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${focusRing} ${family === key ? "bg-slate-900 text-white dark:bg-white dark:text-zinc-900" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-white/[0.04] dark:text-zinc-300 dark:ring-white/10"}`}>
              {key === "all" ? "All" : FAMILY_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      <section aria-labelledby="earned-title">
        <h2 id="earned-title" className="mb-2 text-[14px] font-semibold text-slate-900 dark:text-zinc-100">Earned · {earned.length}</h2>
        {earned.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{earned.map((badge, index) => <BadgeTile key={badge.uid} badge={badge} index={index} />)}</ul> : <Card><Empty icon={Award} title="No badges here yet. Solve, learn or take a test to earn your first." /></Card>}
      </section>
      {lockedAll.length > 0 && (
        <section aria-labelledby="locked-title">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="locked-title" className="text-[14px] font-semibold text-slate-900 dark:text-zinc-100">{allLocked ? "Still to unlock" : "Up next"} · {locked.length}</h2>
            {lockedAll.length > locked.length || allLocked ? (
              <button type="button" onClick={() => setAllLocked((value) => !value)} className={`text-[12px] font-semibold text-sky-700 hover:underline dark:text-sky-300 ${focusRing}`}>
                {allLocked ? "Show only the next ones" : `Show every locked badge (${lockedAll.length})`}
              </button>
            ) : null}
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{locked.map((badge, index) => <BadgeTile key={badge.uid} badge={badge} index={index} />)}</ul>
        </section>
      )}
      <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">These are the same badges as on your profile. <Link to="/student/profile#badges" className="font-semibold text-sky-700 dark:text-sky-300">Open your profile</Link></p>
    </div>
  );
}
