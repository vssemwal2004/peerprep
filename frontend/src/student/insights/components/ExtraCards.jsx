import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Flag, Flame, Medal, Sparkles, Target, Trophy, TrendingDown, TrendingUp } from "lucide-react";
import {
  activityCalendarOption, cumulativeSolvesOption, DIFFICULTY_COLORS, rhythmOption, skillRadarOption, testTimeOption, weeklyAccuracyOption,
} from "../insightCharts";
import { daysAgoText, formatNumber, formatPercent, fullDate, hourLabel, LANGUAGE_NAMES, sectionPath, shortDate, strengthsAndGaps, targetProgress, TOPIC_STATES, weeklyAccuracy } from "../insightModel";
import { Card, CardTitle, Chart, Empty, focusRing, Pill, ProgressBar } from "./ui";

const linkClass = `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`;

/** The 12-month activity calendar with the streak beside it. */
export function HeatmapCard({ activity, compact = false, link = true }) {
  const calendar = useCallback((theme) => activityCalendarOption(activity, theme, { compact }), [activity, compact]);
  return (
    <Card className="p-4">
      <CardTitle title="Activity calendar" hint={`${activity.days.length} active days in the last 12 months`}
        right={link ? <Link to={sectionPath("activity")} className={linkClass}>Details<ArrowRight className="h-3.5 w-3.5" /></Link> : null} />
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[720px]"><Chart option={calendar} height={compact ? 120 : 150} label="Activity calendar for the last 12 months" /></div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-slate-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5"><Flame className={`h-4 w-4 ${activity.streak.current ? "text-orange-500" : "text-slate-300"}`} aria-hidden="true" /><b className="text-slate-800 dark:text-zinc-100">{activity.streak.current}</b> day streak · best <b className="text-slate-800 dark:text-zinc-100">{activity.streak.best}</b></span>
        <span className="inline-flex items-center gap-1.5">Less
          {["#e0f2fe", "#7dd3fc", "#0ea5e9", "#0369a1"].map((color) => <span key={color} className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} aria-hidden="true" />)}More</span>
      </div>
    </Card>
  );
}

/** When the student practises, by weekday and hour, with their sharpest hour. */
export function RhythmCard({ rhythm }) {
  const option = useCallback((theme) => rhythmOption(rhythm, theme), [rhythm]);
  return (
    <Card className="p-4">
      <CardTitle title="Practice rhythm" hint="Tries by weekday and hour, last 12 months (India time)" right={<Clock3 className="h-4 w-4 text-slate-400" aria-hidden="true" />} />
      {rhythm.total ? (
        <>
          <div className="-mx-1 overflow-x-auto px-1"><div className="min-w-[560px]"><Chart option={option} height={230} label="Practice by weekday and hour" /></div></div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-sky-50/70 px-3 py-2 dark:bg-sky-500/10"><p className="text-[11px] text-slate-500 dark:text-zinc-400">You practise most at</p><p className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">{hourLabel(rhythm.busiestHour)}</p></div>
            <div className="rounded-xl bg-emerald-50/70 px-3 py-2 dark:bg-emerald-500/10"><p className="text-[11px] text-slate-500 dark:text-zinc-400">Most accurate at</p><p className="text-[15px] font-semibold text-slate-900 dark:text-zinc-100">{rhythm.sharpestHour ? `${hourLabel(rhythm.sharpestHour.hour)} · ${rhythm.sharpestHour.accuracy}%` : "Not enough tries yet"}</p></div>
          </div>
        </>
      ) : <Empty icon={Clock3} title="No practice in the last 12 months." />}
    </Card>
  );
}

const RECORD_ICONS = { busiestDay: CalendarDays, bestStreak: Flame, topTopic: Target, hardSolved: Trophy, milestone: Flag, bestTest: Medal, bestMock: Sparkles, sheets: CheckCircle2 };

/** Personal bests. */
export function RecordsCard({ records, wide = false }) {
  return (
    <Card className="p-4">
      <CardTitle title="Personal records" hint="Your bests so far" right={<Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />} />
      {records.length ? (
        <ul className={`grid grid-cols-2 gap-2 ${wide ? "sm:grid-cols-3 xl:grid-cols-6" : ""}`}>
          {records.map((record) => {
            const Icon = RECORD_ICONS[record.key] || Trophy;
            return (
              <li key={record.key} className="group rounded-xl border border-[#eef0f3] p-3 transition duration-300 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-[0_10px_24px_-18px_rgba(217,119,6,0.6)] dark:border-white/[0.06] dark:hover:border-amber-400/30">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400"><Icon className="h-3.5 w-3.5 text-amber-500 transition-transform group-hover:scale-110" aria-hidden="true" />{record.label}</span>
                <span className="mt-1 block text-[20px] font-semibold tracking-[-0.02em] text-slate-950 tabular-nums dark:text-zinc-50">{formatNumber(record.value)}{record.unit === "%" ? "%" : ""}</span>
                <span className="block truncate text-[11px] text-slate-400 dark:text-zinc-500">{record.detail || (record.at ? fullDate(record.at) : record.unit !== "%" ? record.unit : "")}</span>
              </li>
            );
          })}
        </ul>
      ) : <Empty icon={Trophy} title="Records appear as you practise." />}
    </Card>
  );
}

/** Solve-count milestones as a timeline, with the next one to reach. */
export function MilestonesCard({ milestones }) {
  return (
    <Card className="p-4">
      <CardTitle title="Milestones" hint={`${formatNumber(milestones.total)} questions solved in all`} right={<Flag className="h-4 w-4 text-slate-400" aria-hidden="true" />} />
      {milestones.next && (
        <div className="mb-3 rounded-xl bg-gradient-to-r from-sky-50 to-white p-3 ring-1 ring-inset ring-sky-100 dark:from-sky-500/10 dark:to-transparent dark:ring-sky-400/15">
          <p className="text-[12px] font-semibold text-slate-800 dark:text-zinc-100">Next: {milestones.next.count} solved</p>
          <p className="mb-1.5 text-[11px] text-slate-500 dark:text-zinc-400">{milestones.next.remaining} to go</p>
          <ProgressBar value={milestones.next.count - milestones.next.remaining} max={milestones.next.count} label="Progress to the next milestone" />
        </div>
      )}
      {milestones.reached.length ? (
        <ol className="relative ml-2 space-y-3 border-l border-dashed border-slate-200 pl-4 dark:border-white/10">
          {[...milestones.reached].reverse().slice(0, 6).map((milestone) => (
            <li key={milestone.count} className="relative">
              <span className="absolute -left-[23px] top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-600 ring-4 ring-white dark:ring-[#232325]" aria-hidden="true" />
              <p className="text-[12.5px] font-semibold text-slate-900 dark:text-zinc-100">{milestone.count === 1 ? "First solve" : `${milestone.count} solved`}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-zinc-400">{fullDate(milestone.at)} · {milestone.title}</p>
            </li>
          ))}
        </ol>
      ) : <Empty icon={Flag} title="Your first solve starts the timeline." />}
    </Card>
  );
}

/** The latest first solves, linked. */
export function RecentSolvesCard({ recent }) {
  return (
    <Card className="p-4">
      <CardTitle title="Recently solved" right={<CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />} />
      {recent.length ? (
        <ul className="-mx-2 space-y-0.5">
          {recent.map((item) => (
            <li key={`${item.id}-${item.at}`}>
              <Link to={item.to} className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-emerald-50/60 dark:hover:bg-white/[0.04] ${focusRing}`}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: DIFFICULTY_COLORS[item.difficulty] }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-slate-800 group-hover:text-emerald-700 dark:text-zinc-200 dark:group-hover:text-emerald-300">{item.title}</span>
                  <span className="block truncate text-[10.5px] text-slate-400">{item.tags.join(" · ") || item.difficulty}</span>
                </span>
                <span className="shrink-0 text-[10.5px] text-slate-400">{shortDate(item.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <Empty icon={CheckCircle2} title="Nothing solved yet." />}
    </Card>
  );
}

/** Progress and accuracy on the biggest topics. */
export function SkillRadarCard({ topics }) {
  const core = useMemo(() => topics.filter((topic) => topic.core), [topics]);
  const option = useCallback((theme) => skillRadarOption(core, theme), [core]);
  return (
    <Card className="p-4">
      <CardTitle title="Skill radar" hint="Your 8 biggest topics: progress to strong and accuracy" />
      {core.length >= 3 ? <Chart option={option} height={300} label="Skill radar of core topics" /> : <Empty title="Not enough topics yet." />}
    </Card>
  );
}

/** Strongest topics and the ones that need attention, each opening the topic. */
export function StrengthsCard({ topics, onOpenTopic }) {
  const { strengths, gaps } = useMemo(() => strengthsAndGaps(topics), [topics]);
  const row = (topic, tone) => (
    <li key={topic.key}>
      <button type="button" onClick={() => onOpenTopic(topic.key)} className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.04] ${focusRing}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{topic.name}</span>
          <span className="mt-1 block"><ProgressBar value={targetProgress(topic)} color={tone} label={`${topic.name} progress`} /></span>
        </span>
        <span className="w-12 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-700 dark:text-zinc-300">{formatPercent(topic.accuracy)}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600" aria-hidden="true" />
      </button>
    </li>
  );
  return (
    <Card className="grid gap-4 p-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300"><TrendingUp className="h-4 w-4" aria-hidden="true" />Your strengths</p>
        {strengths.length ? <ul>{strengths.map((topic) => row(topic, TOPIC_STATES.strong.color))}</ul> : <p className="px-2.5 text-[12px] text-slate-500 dark:text-zinc-400">Solve a few more in one topic to build a strength.</p>}
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-700 dark:text-rose-300"><TrendingDown className="h-4 w-4" aria-hidden="true" />Needs attention</p>
        {gaps.length ? <ul>{gaps.map((topic) => row(topic, TOPIC_STATES.needsWork.color))}</ul> : <p className="px-2.5 text-[12px] text-slate-500 dark:text-zinc-400">No weak spots among the topics you practised.</p>}
      </div>
    </Card>
  );
}

/** Running total of solves by difficulty over the period. */
export function CumulativeCard({ growth }) {
  const option = useCallback((theme) => cumulativeSolvesOption(growth, theme), [growth]);
  return (
    <Card className="p-4">
      <CardTitle title="Solved over time" hint="Running total by difficulty" />
      {growth.length > 1 ? <Chart option={option} height={240} label="Questions solved over time by difficulty" /> : <Empty title="Not enough history yet." />}
    </Card>
  );
}

/** Weekly accuracy with submission volume. */
export function WeeklyAccuracyCard({ daily }) {
  const weeks = useMemo(() => weeklyAccuracy(daily), [daily]);
  const option = useCallback((theme) => weeklyAccuracyOption(weeks, theme), [weeks]);
  return (
    <Card className="p-4">
      <CardTitle title="Accuracy by week" hint="Share of submissions accepted" />
      {weeks.length ? <Chart option={option} height={220} label="Weekly accuracy" /> : <Empty title="No submissions in this period." />}
    </Card>
  );
}

/** Accuracy per difficulty in the period. */
export function DifficultyAccuracyCard({ difficulties }) {
  return (
    <Card className="p-4">
      <CardTitle title="Accuracy by difficulty" hint="Accepted share of your submissions" />
      <ul className="space-y-3.5">
        {difficulties.map((level) => (
          <li key={level.level}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span className="font-semibold" style={{ color: DIFFICULTY_COLORS[level.level] }}>{level.level}</span>
              <span className="tabular-nums text-slate-500 dark:text-zinc-400"><b className="text-slate-900 dark:text-zinc-100">{formatPercent(level.accuracy)}</b> · {level.solved}/{level.tried} solved</span>
            </div>
            <ProgressBar value={level.accuracy ?? 0} color={DIFFICULTY_COLORS[level.level]} height="h-2" label={`${level.level} accuracy`} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Accuracy per language in the period. */
export function LanguageCard({ languages }) {
  const max = Math.max(1, ...languages.map((language) => language.submissions));
  return (
    <Card className="p-4">
      <CardTitle title="Languages" hint="Submissions and accuracy per language" />
      {languages.length ? (
        <ul className="space-y-3">
          {languages.slice(0, 6).map((language) => (
            <li key={language.language}>
              <div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold text-slate-800 dark:text-zinc-100">{LANGUAGE_NAMES[language.language] || language.language}</span><span className="tabular-nums text-slate-500 dark:text-zinc-400">{language.submissions} · <b className="text-emerald-600 dark:text-emerald-400">{formatPercent(language.accuracy)}</b></span></div>
              <div className="relative h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                <div className="absolute inset-y-0 left-0 rounded-full bg-sky-200 dark:bg-sky-500/30" style={{ width: `${(language.submissions / max) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-sky-600" style={{ width: `${(language.accepted / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty title="No submissions in this period." />}
    </Card>
  );
}

/** Time spent on each test against its score. */
export function TestTimeCard({ tests, passPercent }) {
  const option = useCallback((theme) => testTimeOption(tests, passPercent, theme), [tests, passPercent]);
  return (
    <Card className="p-4">
      <CardTitle title="Time vs score" hint="Each test: minutes spent and score" />
      {tests.some((test) => Number.isFinite(test.minutes)) ? <Chart option={option} height={230} label="Minutes spent against test score" /> : <Empty title="No timed tests in this period." />}
    </Card>
  );
}

/** Last activity of each feature, for the overview. */
export function LastActiveList({ insights }) {
  const items = [
    insights.sections.coding && ["Coding", insights.sections.coding.daysSinceActive, sectionPath("coding")],
    insights.sections.learning && ["Learning", insights.sections.learning.daysSinceActive, sectionPath("learning")],
    insights.sections.assessment && ["Tests", insights.sections.assessment.daysSinceActive, sectionPath("tests")],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([label, days, to]) => <Link key={label} to={to} className={focusRing}><Pill className="bg-white text-slate-600 ring-[#e4e7ec] hover:ring-sky-300 dark:bg-transparent dark:text-zinc-300 dark:ring-white/10">{label}: {daysAgoText(days)}</Pill></Link>)}
    </div>
  );
}
