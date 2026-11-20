import { useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Code2, ListChecks, RotateCcw } from "lucide-react";
import { practiceTrendOption, verdictOption } from "../insightCharts";
import { daysAgoText, formatNumber, formatPercent, shortDate } from "../insightModel";
import { LanguageCard } from "./ExtraCards";
import { Card, CardTitle, Chart, Delta, Empty, Figure, focusRing, ProgressBar, Section } from "./ui";
import { DIFFICULTY_COLORS } from "../insightCharts";
import GuideInfo from "../../../guide/platform/GuideInfo";

const compare = (value, previous, unit = "") => (previous === null || previous === undefined ? null : { change: Math.round((value - previous) * 10) / 10, unit });

export function CodingSection({ coding, range, previousLabel }) {
  const trend = useCallback((theme) => practiceTrendOption(coding.daily, { from: range.from, to: range.to }, theme), [coding.daily, range.from, range.to]);
  const verdicts = useCallback((theme) => verdictOption(coding.verdicts, theme), [coding.verdicts]);
  const solvedByLevel = ["Easy", "Medium", "Hard"].map((level) => ({ level, value: coding.solved[level] || 0 }));
  const levelMax = Math.max(1, ...solvedByLevel.map((item) => item.value));

  return (
    <Section id="coding" data-guide="an-coding" info={<GuideInfo step="an-coding" />} icon={Code2} title="Coding practice" subtitle={`Last practice: ${daysAgoText(coding.daysSinceActive)}`}
      actions={<Link to="/problems" className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>Open PrepCoding<ArrowRight className="h-3.5 w-3.5" /></Link>}>
      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Figure label="Problems accepted" value={formatNumber(coding.solved.total)} sub={`${coding.attempted} tried`}><Delta kpi={compare(coding.solved.total, coding.previous?.solved)} label={previousLabel} /></Figure>
        <Figure label="Accuracy" value={formatPercent(coding.accuracy)} sub={`${coding.accepted} of ${coding.submissions} accepted`}><Delta kpi={compare(coding.accuracy, coding.previous?.submissions ? coding.previous.accuracy : null, "%")} label={previousLabel} /></Figure>
        <Figure label="Submissions" value={formatNumber(coding.submissions)}><Delta kpi={compare(coding.submissions, coding.previous?.submissions)} label={previousLabel} /></Figure>
        <Figure label="Days practised" value={formatNumber(coding.activeDays)} />
      </Card>

      {coding.submissions === 0 ? (
        <Card><Empty icon={Code2} title="No coding submissions in this period." action={<Link to="/problems?difficulty=Easy" className={`text-[12.5px] font-semibold text-sky-700 dark:text-sky-300 ${focusRing}`}>Solve an easy question</Link>} /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <CardTitle title="Daily practice" hint="Submissions and accepted answers" />
            <Chart option={trend} height={250} label="Submissions and accepted answers over time" />
          </Card>
          <Card className="p-4">
            <CardTitle title="How submissions ended" />
            <Chart option={verdicts} height={180} label="Submission results" />
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {coding.verdicts.map((verdict) => (
                <li key={verdict.key} className="flex items-center justify-between text-[11.5px] text-slate-600 dark:text-zinc-300">
                  <span className="truncate">{verdict.name}</span><span className="tabular-nums font-semibold">{verdict.value}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <CardTitle title="Accepted by difficulty" hint="In this period" />
            <div className="space-y-3">
              {solvedByLevel.map(({ level, value }) => (
                <div key={level}>
                  <div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold" style={{ color: DIFFICULTY_COLORS[level] }}>{level}</span><span className="tabular-nums font-semibold text-slate-800 dark:text-zinc-200">{value}</span></div>
                  <ProgressBar value={value} max={levelMax} color={DIFFICULTY_COLORS[level]} height="h-2" label={`${level} accepted`} />
                </div>
              ))}
            </div>
          </Card>
          <LanguageCard languages={coding.breakdown?.languages || []} />
          <Card className="p-4" data-guide="an-retry">
            <CardTitle title="Started, not solved" hint={`${coding.retry.count} question${coding.retry.count === 1 ? "" : "s"} waiting`} right={<RotateCcw className="h-4 w-4 text-slate-400" aria-hidden="true" />} />
            {coding.retry.items.length ? (
              <ul className="-mx-2 space-y-0.5">
                {coding.retry.items.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Link to={item.to} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sky-50/70 dark:hover:bg-white/[0.04] ${focusRing}`}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: DIFFICULTY_COLORS[item.difficulty] }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700 group-hover:text-sky-700 dark:text-zinc-200 dark:group-hover:text-sky-300">{item.title}</span>
                      <span className="shrink-0 text-[10.5px] text-slate-400">{shortDate(item.lastAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty title="Nothing half-done. Nice." />}
          </Card>
        </div>
      )}
    </Section>
  );
}

export function QuickPrepSection({ quickprep }) {
  const sheets = quickprep.sheets;
  return (
    <Section id="quickprep" data-guide="an-quickprep" info={<GuideInfo step="an-quickprep" />} icon={ListChecks} title="QuickPrep sheets" subtitle={`${quickprep.finished} finished · ${quickprep.started} started · ${quickprep.available} available`}
      actions={<Link to="/student/quickprep" className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>All sheets<ArrowRight className="h-3.5 w-3.5" /></Link>}>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <CardTitle title="Overall" hint="Across the sheets you started" />
          <p className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-slate-950 tabular-nums dark:text-zinc-50">{Math.round(quickprep.progress)}<span className="text-[18px] text-slate-400">%</span></p>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">{quickprep.solved} of {quickprep.total} questions done</p>
          <div className="mt-3"><ProgressBar value={quickprep.solved} max={quickprep.total || 1} height="h-2" label="QuickPrep progress" /></div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <CardTitle title="Your sheets" />
          {sheets.length ? (
            <ul className="space-y-2.5">
              {sheets.slice(0, 8).map((sheet) => (
                <li key={sheet.id}>
                  <Link to={sheet.slug ? `/student/quickprep/${sheet.slug}` : "/student/quickprep"} className={`group block rounded-xl px-2 py-1.5 hover:bg-sky-50/60 dark:hover:bg-white/[0.03] ${focusRing}`}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="truncate font-semibold text-slate-800 group-hover:text-sky-700 dark:text-zinc-200 dark:group-hover:text-sky-300">{sheet.title}</span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-zinc-400">{sheet.finished ? "Finished" : `${sheet.solved}/${sheet.total}`}</span>
                    </div>
                    <ProgressBar value={sheet.solved} max={sheet.total || 1} color={sheet.finished ? "#10b981" : "#0284c7"} label={`${sheet.title} progress`} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty icon={ListChecks} title="You have not started a sheet yet." />}
          {quickprep.notStarted.length > 0 && (
            <div className="mt-4 border-t border-[#f1f2f4] pt-3 dark:border-white/[0.05]">
              <p className="mb-2 text-[11.5px] font-semibold text-slate-500 dark:text-zinc-400">Not started</p>
              <div className="flex flex-wrap gap-1.5">
                {quickprep.notStarted.slice(0, 10).map((sheet) => (
                  <Link key={sheet.id} to={sheet.slug ? `/student/quickprep/${sheet.slug}` : "/student/quickprep"} className={`rounded-full border border-[#e4e7ec] px-2.5 py-1 text-[11.5px] font-medium text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-white/10 dark:text-zinc-300 dark:hover:text-sky-300 ${focusRing}`}>{sheet.title}</Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </Section>
  );
}
