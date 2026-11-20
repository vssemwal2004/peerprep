import { useCallback } from "react";
import { CalendarDays, Flame, Trophy } from "lucide-react";
import { activityCalendarOption, weekdayOption } from "../insightCharts";
import { daysAgoText, formatNumber } from "../insightModel";
import { Card, CardTitle, Chart, Figure, LatestFirstScroll, Section } from "./ui";
import GuideInfo from "../../../guide/platform/GuideInfo";

const FEATURE_LABELS = [["coding", "Practice", "#0284c7"], ["learning", "Lessons", "#14b8a6"], ["tests", "Tests", "#f59e0b"], ["interviews", "Interviews", "#8b5cf6"]];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ActivitySection({ activity, access }) {
  const calendar = useCallback((theme) => activityCalendarOption(activity, theme), [activity]);
  const weekdays = useCallback((theme) => weekdayOption(activity.weekdays, theme), [activity.weekdays]);
  const best = activity.weekdays.indexOf(Math.max(...activity.weekdays));
  const totals = FEATURE_LABELS.map(([key, label, color]) => ({ key, label, color, value: activity.days.reduce((sum, day) => sum + (day[key] || 0), 0) }))
    .filter((item) => (item.key === "coding" ? access.coding : item.key === "learning" ? access.learning : item.key === "tests" ? access.assessment : access.mock || access.ai));
  const all = Math.max(1, totals.reduce((sum, item) => sum + item.value, 0));

  return (
    <Section id="activity" data-guide="an-activity" info={<GuideInfo step="an-activity" />} icon={CalendarDays} title="Activity" subtitle="Your last 12 months, every feature together">
      <div className="grid gap-3 lg:grid-cols-4">
        <Card className="grid grid-cols-2 gap-4 p-4 lg:col-span-1 lg:grid-cols-1">
          <Figure label="Current streak" value={<span className="inline-flex items-center gap-1.5">{formatNumber(activity.streak.current)}<Flame className={`h-5 w-5 ${activity.streak.current ? "text-orange-500" : "text-slate-300"}`} aria-hidden="true" /></span>} sub={activity.streak.current === 1 ? "day" : "days"} />
          <Figure label="Best streak" value={<span className="inline-flex items-center gap-1.5">{formatNumber(activity.streak.best)}<Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" /></span>} sub="days in a row" />
          <Figure label="Active days" value={formatNumber(activity.days.length)} sub="in 12 months" />
          <Figure label="Last active" value={<span className="text-[16px]">{daysAgoText(activity.daysSinceActive)}</span>} />
        </Card>
        <Card className="p-4 lg:col-span-3">
          <CardTitle title="Activity calendar" hint="Darker means more done that day" />
          <LatestFirstScroll><Chart option={calendar} height={140} label="Activity calendar for the last 12 months" /></LatestFirstScroll>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {totals.map((item) => (
              <div key={item.key} className="flex min-w-[120px] flex-1 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
                <span className="text-[12px] text-slate-600 dark:text-zinc-300">{item.label}</span>
                <span className="ml-auto text-[12px] font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{formatNumber(item.value)}</span>
                <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">{Math.round((item.value / all) * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <CardTitle title="Your best days" hint={activity.days.length ? `You do the most on ${WEEKDAYS[best]}s` : "No activity yet"} />
          <Chart option={weekdays} height={220} label="Activity by day of the week" />
        </Card>
        <Card className="p-4 lg:col-span-2">
          <CardTitle title="Where your time goes" hint="Share of everything you did in 12 months" />
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" aria-hidden="true">
            {totals.map((item) => <div key={item.key} style={{ width: `${(item.value / all) * 100}%`, backgroundColor: item.color }} />)}
          </div>
          <ul className="mt-4 space-y-2.5">
            {totals.map((item) => (
              <li key={item.key} className="flex items-center gap-3 text-[12.5px]">
                <span className="w-24 shrink-0 font-medium text-slate-700 dark:text-zinc-200">{item.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${(item.value / all) * 100}%`, backgroundColor: item.color }} /></div>
                <span className="w-12 shrink-0 text-right tabular-nums text-slate-500 dark:text-zinc-400">{formatNumber(item.value)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Section>
  );
}
