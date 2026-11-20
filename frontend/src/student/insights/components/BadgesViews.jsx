import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Award, Loader2, Lock, Sparkles } from "lucide-react";
import BadgeEmblem from "../../profile/BadgeEmblem";
import LevelMedallion from "../../profile/LevelMedallion";
import { awardIcon, awardTone } from "../../profile/awardVisuals";
import { levelTheme } from "../../profile/levelTheme";
import { fullDate, sectionPath } from "../insightModel";
import { Card, CardTitle, Empty, focusRing, ProgressBar } from "./ui";

/** One badge: the adaptive emblem when it has a category, else the classic round medal. */
export function AwardMedal({ award, size = "md" }) {
  const box = size === "lg" ? "h-16 w-14" : size === "sm" ? "h-10 w-9" : "h-12 w-11";
  if (award.category) {
    return (
      <span className="relative inline-flex">
        <BadgeEmblem badge={award} className={`${box} drop-shadow-[0_4px_8px_rgba(16,24,40,0.18)]`} />
        {!award.earned && <LockPip />}
      </span>
    );
  }
  const Icon = awardIcon(award);
  const round = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  return (
    <span className={`relative flex ${round} items-center justify-center rounded-full bg-gradient-to-br ring-[3px] ring-white dark:ring-[#232325] ${award.earned ? `text-white shadow-md ${awardTone(award)}` : "from-slate-100 to-slate-200 text-slate-400 dark:from-zinc-700 dark:to-zinc-800 dark:text-zinc-500"}`} aria-hidden="true">
      <Icon className="h-[42%] w-[42%]" strokeWidth={2} />
      {!award.earned && <LockPip />}
    </span>
  );
}

function LockPip() {
  return <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-zinc-900 dark:ring-zinc-700"><Lock className="h-2.5 w-2.5 text-slate-400" aria-hidden="true" /></span>;
}

const progressOf = (award) => Math.max(0, Math.min(100, Number(award.progress) || (award.target ? ((award.value || 0) / award.target) * 100 : 0)));

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
      <div className="relative flex flex-wrap items-center gap-2">
        {data.earned.slice(0, 6).map((award, index) => (
          <motion.span key={award.id} title={award.title} initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.1 + index * 0.06, type: "spring", stiffness: 320, damping: 18 }} className="transition-transform duration-200 hover:-translate-y-1">
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
            <ProgressBar value={progressOf(next)} label={`Progress to ${next.title}`} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-slate-500">{Math.round(progressOf(next))}%</span>
        </div>
      )}
    </Card>
  );
}

function BadgeTile({ award, index }) {
  const reduce = useReducedMotion();
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 20) * 0.03, duration: 0.35 }}
      className={`group flex flex-col items-center rounded-2xl border p-4 text-center transition duration-300 hover:-translate-y-1 ${award.earned ? "border-[#e9eaee] bg-white hover:border-amber-200 hover:shadow-[0_16px_32px_-22px_rgba(217,119,6,0.6)] dark:border-white/[0.07] dark:bg-[#232325]" : "border-dashed border-slate-200 bg-[#fafbfc] dark:border-white/10 dark:bg-white/[0.02]"}`}>
      <span className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]"><AwardMedal award={award} size="lg" /></span>
      <p className="mt-2 text-[13px] font-semibold text-slate-900 dark:text-zinc-100">{award.title}</p>
      {award.description && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-slate-500 dark:text-zinc-400">{award.description}</p>}
      {award.earned
        ? <p className="mt-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{award.earnedAt ? `Earned ${fullDate(award.earnedAt)}` : "Earned"}</p>
        : <div className="mt-2 w-full"><ProgressBar value={progressOf(award)} label={`${award.title} progress`} /><p className="mt-1 text-[10.5px] tabular-nums text-slate-400">{award.target ? `${Math.min(award.value || 0, award.target)}/${award.target}` : `${Math.round(progressOf(award))}%`}</p></div>}
    </motion.li>
  );
}

/** Every badge: earned first (newest first), then locked ones closest to unlocking. */
export function BadgesPage({ badges, milestones }) {
  if (badges.loading) return <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading badges…</Card>;
  if (!badges.data) return <Card><Empty icon={Award} title="Badges could not be loaded." /></Card>;
  const { earned, locked, level, total } = badges.data;
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
            <p className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-slate-950 dark:text-zinc-50">{earned.length}<span className="text-[16px] text-slate-400">/{total}</span></p>
            <div className="mt-2 max-w-md"><ProgressBar value={earned.length} max={total || 1} height="h-2" color="#f59e0b" label="Badges earned" /></div>
          </div>
          {milestones?.next && <div className="hidden text-right sm:block"><p className="text-[11px] text-slate-500 dark:text-zinc-400">Next solve milestone</p><p className="text-[18px] font-semibold text-slate-900 dark:text-zinc-100">{milestones.next.count}</p><p className="text-[11px] text-slate-400">{milestones.next.remaining} to go</p></div>}
        </Card>
      </div>
      <section aria-labelledby="earned-title">
        <h2 id="earned-title" className="mb-2 text-[14px] font-semibold text-slate-900 dark:text-zinc-100">Earned · {earned.length}</h2>
        {earned.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{earned.map((award, index) => <BadgeTile key={award.id} award={award} index={index} />)}</ul> : <Card><Empty icon={Award} title="No badges yet. Solve, learn or take a test to earn your first." /></Card>}
      </section>
      {locked.length > 0 && (
        <section aria-labelledby="locked-title">
          <h2 id="locked-title" className="mb-2 text-[14px] font-semibold text-slate-900 dark:text-zinc-100">Still to unlock · {locked.length}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{locked.map((award, index) => <BadgeTile key={award.id} award={award} index={index} />)}</ul>
        </section>
      )}
      <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">These are the same badges as on your dashboard and profile. <Link to="/student/profile#badges" className="font-semibold text-sky-700 dark:text-sky-300">Open your profile</Link></p>
    </div>
  );
}
