import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAnalysisApi } from "../analysisScope";
import { PageCheckbox, RowCheckbox, SelectionBar, SendEmailDialog } from "./StudentMail";
import useStudentSelection from "./useStudentSelection";
import { AnimatedNumber } from "./Motion";
import {
  Activity, ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, BadgeCheck, Bot, BookOpenCheck, CalendarClock, CheckCircle2, CircleDashed, ClipboardList,
  Flag, Flame, ListChecks, MessagesSquare, PauseCircle, PlayCircle, Search, Target, Trophy, UserCheck, UserX, Users, X, XCircle,
} from "lucide-react";
import { DIFFICULTY_COLORS } from "../charts/chartTheme";
import { LANGUAGE_LABELS } from "../charts/chartOptions";
import { isKpiActive, kpiRule } from "../filterModel";
import { formatScore } from "../../../student/prepScore/formatScore";
import { SortHeader, TablePager } from "../../../components/table";
import { initials, sectionStyle } from "./sectionStyles";
import { Dialog, focusRing } from "./ui";

const KPI_ICONS = {
  students: Users, active: UserCheck, solved: CheckCircle2, hard: Flame, accuracy: Target, stopped: UserX, submissions: ClipboardList,
  sheetStarted: ListChecks, sheetActive: Activity, sheetFinished: BadgeCheck, review: Flag, topics: BookOpenCheck, halfway: Flag, video: PlayCircle,
  mocks: MessagesSquare, ai: Bot, strong: Trophy, scheduled: CalendarClock, never: CircleDashed,
  taken: ClipboardList, passed: CheckCircle2, passedStudents: CheckCircle2, passRate: Target, missed: XCircle, subjectDone: BadgeCheck,
  topicDone: BadgeCheck, avgMock: Target,
};
const BLANK = String.fromCharCode(160);

/** "Own work": first solves that were very fast or mostly pasted. Untracked is shown as such, never as fine. */
function ReviewCell({ review }) {
  if (!review?.tracked) return <span className="text-slate-400" title="No solve has been timed yet (tracking started recently)">Not tracked</span>;
  if (!review.flagged) {
    return <span className="whitespace-nowrap text-emerald-700 dark:text-emerald-400" title={`${review.tracked} timed solve${review.tracked === 1 ? "" : "s"}, none flagged`}>OK · {review.tracked} timed</span>;
  }
  const why = [review.fast ? `${review.fast} very fast` : "", review.pasted ? `${review.pasted} mostly pasted` : ""].filter(Boolean).join(", ");
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" title={`${why}. Open the student to see which questions.`}>
      <Flag className="h-3 w-3" aria-hidden="true" />{review.flagged} flagged
    </span>
  );
}
const lastSeenLabel = (days) => (days === null || days === undefined ? "Never" : days === 0 ? "Today" : `${days}d ago`);

const formatKpi = (kpi) => {
  if (kpi.format === "percent") return `${kpi.value}%`;
  if (kpi.format === "ratio") return `${Number(kpi.accepted || 0).toLocaleString()} / ${Number(kpi.total || 0).toLocaleString()}`;
  return Number(kpi.value).toLocaleString();
};

const TREND_TONES = {
  up: { stroke: "#10b981", text: "text-emerald-700 dark:text-emerald-300", chip: "bg-emerald-50 dark:bg-emerald-500/10", Icon: ArrowUpRight },
  down: { stroke: "#f43f5e", text: "text-rose-700 dark:text-rose-300", chip: "bg-rose-50 dark:bg-rose-500/10", Icon: ArrowDownRight },
  flat: { stroke: "#94a3b8", text: "text-slate-500 dark:text-slate-400", chip: "bg-slate-100 dark:bg-white/[0.06]", Icon: null },
};

/** Direction of a card's line over the period: last point against the first (stock-style). */
function seriesTrend(series) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const first = Number(series[0].value) || 0;
  const last = Number(series.at(-1).value) || 0;
  const change = Math.round((last - first) * 10) / 10;
  return { first, last, change, direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

const pointDate = (at) => new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Stock-style line of a card over the selected period: green when the number rose, red when it
 * fell. Every point is measured like the card itself, and the last point is the card's number.
 */
function KpiTrendLine({ series, label, unit = "" }) {
  const gradientId = useId();
  const trend = seriesTrend(series);
  if (!trend) return null;
  const values = series.map((point) => Number(point.value) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const width = 200;
  const height = 44;
  const x = (index) => 3 + (index / (series.length - 1)) * (width - 6);
  const y = (value) => (max === min ? height / 2 : 5 + (1 - (value - min) / spread) * (height - 10));
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const tone = TREND_TONES[trend.direction];
  const describe = `${label}: ${trend.first.toLocaleString()}${unit} on ${pointDate(series[0].at)}, ${trend.last.toLocaleString()}${unit} on ${pointDate(series.at(-1).at)}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={describe} className="h-11 w-full overflow-visible">
      <title>{describe}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone.stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={tone.stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={tone.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1))} r="3" fill={tone.stroke} stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** "▲ +12 this period" chip from the card's own line. */
function TrendChip({ series, unit = "" }) {
  const trend = seriesTrend(series);
  if (!trend) return null;
  const tone = TREND_TONES[trend.direction];
  const amount = `${trend.change > 0 ? "+" : trend.change < 0 ? "−" : ""}${Math.abs(trend.change).toLocaleString()}${unit}`;
  return (
    <span title={`Change from the first to the last point of the line (${trend.first.toLocaleString()}${unit} → ${trend.last.toLocaleString()}${unit})`}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${tone.chip} ${tone.text}`}>
      {tone.Icon && <tone.Icon className="h-3 w-3" aria-hidden="true" />}{trend.direction === "flat" ? "No change" : amount}
      <span className="font-medium opacity-80">this period</span>
    </span>
  );
}

/** A truthful two-period sparkline: previous at left, current at right. */
function KpiSparkline({ delta, value, label }) {
  const hasPrevious = delta?.previous !== null && delta?.previous !== undefined;
  const previous = hasPrevious ? Number(delta.previous) : Number(value);
  const current = Number(value);
  const change = hasPrevious ? current - previous : 0;
  const rising = change > 0;
  const falling = change < 0;
  const stroke = rising ? "#10b981" : falling ? "#f43f5e" : "#94a3b8";
  const fill = rising ? "rgba(16,185,129,0.12)" : falling ? "rgba(244,63,94,0.12)" : "rgba(148,163,184,0.1)";
  const y1 = !hasPrevious || !change ? 15 : rising ? 24 : 5;
  const y2 = !hasPrevious || !change ? 15 : rising ? 5 : 24;
  const description = hasPrevious
    ? `${label}: ${previous.toLocaleString()} previously, ${current.toLocaleString()} now`
    : `${label}: ${current.toLocaleString()} in the current period; no previous-period comparison`;
  return (
    <svg viewBox="0 0 88 30" role="img" aria-label={description} className="h-8 w-[88px] shrink-0 overflow-visible">
      <path d={`M2,28 L2,${y1} L86,${y2} L86,28 Z`} fill={fill} />
      <path d={`M2,${y1} L86,${y2}`} fill="none" stroke={stroke} strokeWidth="2.25" strokeLinecap="round" />
      <circle cx="2" cy={y1} r="2" fill={stroke} />
      <circle cx="86" cy={y2} r="2.75" fill={stroke} />
    </svg>
  );
}

/**
 * Change against the previous period of the same length: { previous, change, label }.
 * Stock-style direction colours: up is green and down is red on every card.
 */
export function DeltaBadge({ delta, format }) {
  if (!delta || delta.previous === null || delta.previous === undefined) return null;
  const change = delta.change;
  const flat = !change;
  const good = change > 0;
  const Icon = flat ? null : change > 0 ? ArrowUpRight : ArrowDownRight;
  const text = flat ? "no change" : format === "percent" ? `${Math.abs(change)} pts` : delta.pct === null ? `${change > 0 ? "+" : "−"}${Math.abs(change).toLocaleString()}` : `${Math.abs(delta.pct)}%`;
  return (
    <span title={`${delta.label}: ${format === "percent" ? `${delta.previous}%` : Number(delta.previous).toLocaleString()}`}
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-normal ${flat ? "bg-slate-100 text-slate-500 dark:bg-white/[0.06]" : good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>
      {Icon && <Icon className="h-3 w-3" />}{text}
    </span>
  );
}

/**
 * Headline numbers for one section. A number with a matching filter is a button:
 * click it to show just those students, click again to undo.
 */
export function KpiStrip({ section = "coding", kpis, loading, state, fieldMap, onToggle, compare = null }) {
  // With compare: each tile also shows both groups' own value.
  const sideValue = (side, id) => side.kpis.find((entry) => entry.id === id);
  const style = sectionStyle(section);
  if (!kpis?.length) {
    return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[84px] animate-pulse rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)}</div>;
  }
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${kpis.length > 5 ? "xl:grid-cols-6" : "xl:grid-cols-5"} ${loading ? "opacity-70" : ""}`}>
      {kpis.map((kpi) => {
        const Icon = KPI_ICONS[kpi.id] || Activity;
        const pick = state && onToggle ? kpiRule(section, kpi.id, fieldMap) : null;
        const on = Boolean(pick && isKpiActive(pick, state));
        const warn = kpi.tone === "warning" && kpi.value > 0;
        // Ratio and percent cards draw a % line (acceptance, pass rate, course completed, average score).
        const percentLine = kpi.format === "ratio" || kpi.format === "percent";
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{kpi.label}</p>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${warn ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : style.chip}`}><Icon className="h-4 w-4" /></span>
            </div>
            <div className="flex min-w-0 items-end justify-between gap-3">
              <p className={`min-w-0 text-[26px] font-extrabold leading-8 tracking-tight tabular-nums ${warn ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white"}`}>
                {kpi.format === "ratio"
                  ? <>{Number(kpi.accepted || 0).toLocaleString()}<span className="text-[17px] font-bold text-slate-400 dark:text-slate-500"> / {Number(kpi.total || 0).toLocaleString()}</span></>
                  : <AnimatedNumber value={kpi.value} format={(number) => formatKpi({ ...kpi, value: kpi.format === "percent" ? Math.round(number * 10) / 10 : Math.round(number) })} />}
              </p>
              {kpi.series ? <TrendChip series={kpi.series} unit={percentLine ? "%" : ""} /> : <KpiSparkline delta={kpi.delta} value={kpi.value} label={kpi.label} />}
            </div>
            {kpi.series && <KpiTrendLine series={kpi.series} label={kpi.format === "ratio" ? (kpi.rateLabel || "Rate") : kpi.label} unit={percentLine ? "%" : ""} />}
            {kpi.delta && (
              <div className="flex min-h-5 items-center gap-2">
                <DeltaBadge delta={kpi.delta} format={kpi.format} />
                {/* A ratio card's line is its rate; its badge compares the whole (e.g. submissions). */}
                <span className="truncate text-[10px] font-medium text-slate-400">{kpi.format === "ratio" ? `${kpi.valueLabel || "total"} ${kpi.delta.label}` : kpi.delta.label}</span>
              </div>
            )}
            {compare && (
              <p className="flex items-center gap-2 text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                {compare.map((side, index) => {
                  const value = sideValue(side, kpi.id);
                  return (
                    <span key={side.label} className="inline-flex min-w-0 items-center gap-1" title={side.label}>
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[8.5px] font-bold text-white ${index ? "bg-amber-500" : "bg-sky-600"}`}>{index ? "B" : "A"}</span>
                      {value ? formatKpi(value) : "—"}
                    </span>
                  );
                })}
              </p>
            )}
            <p className="truncate text-[10.5px] text-slate-400">
              {on
                ? <span className="font-semibold text-sky-600 dark:text-sky-300">Showing only these · click to undo</span>
                : <>{kpi.hint || BLANK}{pick && <span className="ml-1 hidden font-semibold text-sky-600 group-hover:inline [@media(hover:none)]:inline dark:text-sky-300">· Show them</span>}</>}
            </p>
          </>
        );
        const card = "group relative flex min-h-[148px] min-w-0 flex-col gap-1 overflow-hidden rounded-2xl border bg-white px-4 py-3.5 text-left shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-gray-900";
        return pick ? (
          <button key={kpi.id} type="button" aria-pressed={on} onClick={() => onToggle(pick)} title={on ? "Click to show every student again" : `Click to show only these ${kpi.value} students`}
            className={`${card} transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(15,23,42,0.08)] ${on ? `border-transparent ring-2 ${style.ring}` : "border-slate-200 dark:border-gray-800"} ${focusRing}`}>
            {body}
          </button>
        ) : (
          <div key={kpi.id} className={`${card} border-slate-200 dark:border-gray-800`}>{body}</div>
        );
      })}
    </div>
  );
}

const STATUS = {
  active: ["Active", "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"],
  inactive: ["Stopped", "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"],
  never: ["Not started", "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400"],
  finished: ["Finished a sheet", "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"],
  inProgress: ["In progress", "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"],
  none: ["Not started", "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400"],
};
export const StatusPill = ({ status }) => {
  const [label, className] = STATUS[status] || STATUS.never;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>{label}</span>;
};

export function PercentBar({ value, color = "#0284c7", width = "w-20" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 text-right text-[12px] font-bold tabular-nums text-slate-900 dark:text-white">{value}%</span>
      <div className={`h-1.5 ${width} overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]`}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} /></div>
    </div>
  );
}

/** Prep Coding's points, with how much each difficulty brings (the bar is that split, not a fraction of a maximum). */
function ScoreCell({ row }) {
  const segments = ["Easy", "Medium", "Hard"].map((key) => ({ key, value: row.points?.[key] || 0 }));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-[3.25rem] text-right text-[12px] font-bold tabular-nums text-slate-900 dark:text-white">{formatScore(row.prepScore)}</span>
      <div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"
        title={segments.map((segment) => `${segment.key} ${formatScore(segment.value)}`).join(" · ")}>
        {total > 0 && segments.map((segment) => <span key={segment.key} style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: DIFFICULTY_COLORS[segment.key] }} />)}
      </div>
    </div>
  );
}

const solvedCell = (row) => (
  <span className="whitespace-nowrap tabular-nums">
    {["Easy", "Medium", "Hard"].map((key) => <span key={key} className="mr-2.5 font-semibold" style={{ color: DIFFICULTY_COLORS[key] }}>{row.solved[key]}</span>)}
  </span>
);

// Columns per area. `sort` is the server sort key; `position` follows the area's own measure.
const COLUMNS = {
  coding: [
    { label: "Prep Score", sort: "prepScore", render: (row) => <ScoreCell row={row} /> },
    { label: "Solved (Easy · Medium · Hard)", sort: "solved", render: solvedCell },
    { label: "Accuracy", sort: "accuracy", align: "right", render: (row) => (row.submissions ? `${row.accuracy}%` : "—") },
    { label: "Coding", sort: "practiceStatus", render: (row) => <StatusPill status={row.practiceStatus} /> },
    { label: "Own work", sort: "solvesToReview", render: (row) => <ReviewCell review={row.review} /> },
    { label: "Languages", sort: "languages", render: (row) => <span className="block max-w-[150px] truncate text-slate-500">{row.languages.map((language) => LANGUAGE_LABELS[language] || language).join(", ") || "—"}</span> },
  ],
  quickprep: [
    { label: "Sheet progress", sort: "sheetProgress", render: (row) => (row.quickprep?.started ? <PercentBar value={row.quickprep.progress} /> : "—") },
    { label: "Sheets started", sort: "sheetsStarted", render: (row) => <span className="whitespace-nowrap tabular-nums">{row.quickprep ? `${row.quickprep.started} of ${row.quickprep.visibleSheets} open` : "—"}</span> },
    { label: "Finished", sort: "sheetsFinished", align: "right", render: (row) => <span className="tabular-nums">{row.quickprep?.finished ?? 0}</span> },
    { label: "Questions solved", sort: "sheetQuestions", align: "right", render: (row) => <span className="tabular-nums">{row.quickprep?.started ? `${row.quickprep.solved} of ${row.quickprep.total}` : "—"}</span> },
    { label: "Last activity", sort: "sheetLastActive", render: (row) => <span className="whitespace-nowrap text-slate-500">{lastSeenLabel(row.quickprep?.daysSinceActive)}</span> },
    { label: "Own work", sort: "sheetSolvesToReview", render: (row) => <ReviewCell review={row.quickprep?.review} /> },
    { label: "Quick Prep", sort: "sheetStatus", render: (row) => <StatusPill status={row.quickprep?.status || "none"} /> },
  ],
  learning: [
    { label: "Course completed", sort: "learningProgress", render: (row) => <PercentBar value={row.learning?.progress || 0} /> },
    { label: "Topics", sort: "topicsCompleted", render: (row) => <span className="tabular-nums">{row.learning ? `${row.learning.completedTopics} of ${row.learning.availableTopics}` : "—"}</span> },
    { label: "Video", sort: "videoMinutes", align: "right", render: (row) => <span className="tabular-nums">{row.learning ? `${row.learning.videoMinutes} min` : "—"}</span> },
    { label: "Learning", sort: "learningStatus", render: (row) => <StatusPill status={row.learning?.status} /> },
  ],
  interview: [
    { label: "Mock score", sort: "mockScore", render: (row) => (row.interview?.mockDone ? <PercentBar value={row.interview.mockScore} /> : "—") },
    { label: "Interviews done", sort: "interviewsDone", align: "right", render: (row) => <span className="tabular-nums">{row.interview?.done ?? 0}</span> },
    { label: "Mock · AI", sort: "mockAndAi", render: (row) => <span className="whitespace-nowrap tabular-nums text-slate-500">{row.interview ? `${row.interview.mockDone} mock · ${row.interview.aiCompleted} AI` : "—"}</span> },
    { label: "Scheduled", sort: "interviewsScheduled", align: "right", render: (row) => <span className="tabular-nums">{row.interview?.scheduled || "—"}</span> },
    { label: "Interviews", sort: "interviewStatus", render: (row) => <StatusPill status={row.interview?.status} /> },
  ],
  assessment: [
    { label: "Test score", sort: "testScore", render: (row) => (row.assessment?.taken ? <PercentBar value={row.assessment.averageScore} /> : "—") },
    { label: "Tests taken", sort: "testsTaken", align: "right", render: (row) => <span className="tabular-nums" title={row.assessment?.awaiting ? `${row.assessment.awaiting} more awaiting evaluation` : undefined}>{row.assessment?.taken ?? 0}{row.assessment?.awaiting ? <span className="text-sky-600 dark:text-sky-300"> +{row.assessment.awaiting}</span> : null}</span> },
    { label: "Passed", sort: "testsPassed", align: "right", render: (row) => <span className="tabular-nums">{row.assessment?.taken ? `${row.assessment.passed} of ${row.assessment.taken}` : "—"}</span> },
    { label: "Missed", sort: "testsMissed", align: "right", render: (row) => <span className={`tabular-nums ${row.assessment?.missed ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>{row.assessment?.missed ?? 0}</span> },
    { label: "Tests", sort: "testStatus", render: (row) => <StatusPill status={row.assessment?.status} /> },
  ],
};
const scoreCell = (value) => (value === null || value === undefined ? "—" : (
  <b className="tabular-nums text-slate-900 dark:text-white">{formatScore(value?.score ?? value)}</b>
));
// Prep Coding leads with the Prep Score (which is the Prep Coding score) and Prep Learning with
// course completed; Prep Interview and Prep Assessment lead with their own activity points, which
// are NOT part of the Prep Score.
for (const area of ["interview", "assessment"]) {
  COLUMNS[area] = [{ label: "Activity points", sort: "featureScore", render: (row) => scoreCell(row.scores?.features?.[area]) }, ...COLUMNS[area]];
}
COLUMNS.all = [
  { ...COLUMNS.coding[0], label: "Prep Score", sort: "overallScore" },
  { ...COLUMNS.quickprep[0], label: "Quick Prep" },
  { ...COLUMNS.learning[0], label: "Prep Learning" },
  { ...COLUMNS.interview[0], label: "Interview points", sort: "interviewScore" },
  { ...COLUMNS.assessment[0], label: "Assessment points", sort: "assessmentScore" },
];
// One assessment's page: the stored Prep Score covers every test, so it is left out here.
const SCOPED_ASSESSMENT_COLUMNS = [
  { label: "Test score", sort: "testScore", render: (row) => (row.assessment?.taken ? <PercentBar value={row.assessment.averageScore} /> : "—") },
  { label: "Result", sort: "testResult", render: (row) => {
    if (!row.assessment?.taken && row.assessment?.awaiting) return <span className="font-semibold text-sky-700 dark:text-sky-300">Awaiting evaluation</span>;
    if (!row.assessment?.taken) return <span className={row.assessment?.missed ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-400"}>{row.assessment?.missed ? "Missed" : "Not attempted"}</span>;
    return row.assessment.passed ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">Passed</span> : <span className="font-semibold text-rose-600 dark:text-rose-400">Failed</span>;
  } },
  { label: "Status", sort: "testStatus", render: (row) => <StatusPill status={row.assessment?.status} /> },
];
// Sorts that start A–Z (or place 1 first) on the first click; figures start high-to-low.
const ASC_FIRST = new Set(["position", "name", "className", "practiceStatus", "languages", "sheetStatus", "sheetLastActive", "learningStatus", "interviewStatus", "testStatus"]);
const POSITION_HINT = { coding: "Prep Score", quickprep: "sheet progress", learning: "course completed", interview: "interview activity points", assessment: "assessment activity points", all: "Prep Score" };

/**
 * The students on the page, sorted and paged on the server. `title` and `actions` (e.g. a
 * download button) let it lead the page when a headline number picked these students.
 */
/** The student table's search box: types freely, asks the server once typing pauses. */
export function TableSearch({ value = "", onSearch, placeholder = "Search name, email or ID" }) {
  const [text, setText] = useState(value);
  const sent = useRef(value);
  // Follow outside changes (another section, a cleared view) without fighting the typing.
  useEffect(() => { if (value !== sent.current) { sent.current = value; setText(value); } }, [value]);
  useEffect(() => {
    const next = text.trim();
    if (next === sent.current.trim()) return undefined;
    const timer = setTimeout(() => { sent.current = next; onSearch(next); }, 300);
    return () => clearTimeout(timer);
  }, [text, onSearch]);
  return (
    <label className="relative block w-full sm:w-64">
      <span className="sr-only">Search students</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { const next = text.trim(); sent.current = next; onSearch(next); } }}
        placeholder={placeholder}
        title="Use commas to find several students"
        className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-slate-100 [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button type="button" onClick={() => { setText(""); sent.current = ""; onSearch(""); }} aria-label="Clear search"
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ${focusRing}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}

export function StudentTable({ table, area, loading, onChange, onOpen, title = "Students", actions = null, scoped = false, requestBody = null }) {
  const search = table?.search || "";
  const onSearch = useRef(null);
  onSearch.current = (next) => onChange({ search: next, page: 1 });
  const [stableSearch] = useState(() => (next) => onSearch.current(next));
  const api = useAnalysisApi();
  // Ticked students for "Send email": kept across pages and searches, cleared when the filters change.
  const bodyKey = JSON.stringify(requestBody || {});
  const selection = useStudentSelection(`${area}|${bodyKey}`);
  const [emailing, setEmailing] = useState(false);
  const closeEmail = useCallback(() => setEmailing(false), []);
  if (!table) return null;
  const selectable = Boolean(requestBody);
  const pageIds = selectable ? table.rows.map((row) => String(row.id)) : [];
  const columns = scoped && area === "assessment" ? SCOPED_ASSESSMENT_COLUMNS : (COLUMNS[area] || COLUMNS.coding);
  // The server always has a sort (the area's default when none is picked), so a header click flips
  // the active column or starts a new one: high-to-low for figures, A–Z / place 1 first for the rest.
  const sortBy = (key) => onChange({
    sort: key,
    direction: table.sort === key ? (table.direction === "desc" ? "asc" : "desc") : (ASC_FIRST.has(key) ? "asc" : "desc"),
    page: 1,
  });
  const sort = table.sort ? { key: table.sort, direction: table.direction } : null;
  const header = (label, sortKey, align) => (
    <SortHeader key={label} sortKey={sortKey} sort={sort} onSort={sortBy} sortable={Boolean(sortKey)} align={align} className="whitespace-nowrap">{label}</SortHeader>
  );
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900" aria-labelledby="students-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
        <div>
          <h2 id="students-title" className="flex items-center gap-2 text-[13.5px] font-bold text-slate-900 dark:text-white"><Users className="h-4 w-4 text-sky-500" />{title}</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400"># is the place by {scoped && area === "assessment" ? "test score" : (POSITION_HINT[area] || "Prep Score")}. Click a student for their full profile.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <TableSearch value={search} onSearch={stableSearch} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
            {search && Number.isFinite(table.inView) ? `${table.total.toLocaleString()} of ${table.inView.toLocaleString()} students` : `${table.total.toLocaleString()} students`}
          </span>
          {actions}
        </div>
      </header>
      {selectable && (
        <SelectionBar className="mx-4 mt-3" selection={selection} total={table.total}
          loadAll={() => api.studentIds({ ...requestBody, table: { search } })} onEmail={() => setEmailing(true)} />
      )}
      <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
        <table data-no-serial className="min-w-full text-[12px] text-slate-700 dark:text-slate-200">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
              {selectable && <th scope="col" className="w-9 px-3 py-2.5"><PageCheckbox pageIds={pageIds} selection={selection} /></th>}
              {header("#", "position")}
              {header("Student", "name")}
              {header("Class", "className")}
              {columns.map((column) => header(column.label, column.sort, column.align))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
            {table.rows.map((row) => (
              <tr key={row.id} onClick={() => onOpen?.(row.id)} className={`cursor-pointer transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-500/[0.06] ${selection.has(String(row.id)) ? "bg-sky-50/60 dark:bg-sky-500/[0.07]" : ""}`}>
                {selectable && <td className="w-9 px-3 py-2"><RowCheckbox checked={selection.has(String(row.id))} onChange={() => selection.toggle(String(row.id))} label={`Select ${row.name}`} /></td>}
                <td className="px-3 py-2 font-bold tabular-nums text-slate-400">{row.position}</td>
                <td className="max-w-[240px] px-3 py-2">
                  <button type="button" onClick={(event) => { event.stopPropagation(); onOpen?.(row.id); }} className={`flex min-w-0 items-center gap-2.5 text-left ${focusRing}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-600 text-[10.5px] font-bold text-white">{initials(row.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">{row.name}</span>
                      <span className="block truncate text-[10.5px] text-slate-400">{row.studentId || row.email}</span>
                    </span>
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{row.semester ? `Sem ${row.semester}` : "—"}{row.branch ? ` · ${row.branch}` : ""}</td>
                {columns.map((column) => <td key={column.label} className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""}`}>{column.render(row)}</td>)}
              </tr>
            ))}
            {!table.rows.length && <tr><td colSpan={columns.length + 3 + (selectable ? 1 : 0)} className="px-3 py-10 text-center text-[12px] text-slate-400">{search ? `No student matches “${search}”.` : "No students match. Try clearing a filter."}</td></tr>}
          </tbody>
        </table>
      </div>
      <TablePager
        page={table.page}
        pageSize={table.limit}
        total={table.total}
        onPage={(page) => onChange({ page })}
        onPageSize={(limit) => onChange({ limit, page: 1 })}
        busy={loading}
        noun="students"
        className="dark:border-white/[0.06]"
      />
      {selectable && <SendEmailDialog open={emailing} onClose={closeEmail} studentIds={selection.ids} body={requestBody} />}
    </section>
  );
}

/** Explains the analysis workflow without duplicating the centrally managed score policy. */
export function ScoreHelpDialog({ open, onClose }) {
  if (!open) return null;
  return (
    <Dialog open={open} onClose={onClose} size="max-w-lg" title="How to use Prep Analysis" subtitle="Every number belongs to one student and comes only from that student's own work.">
      <div className="space-y-3 p-4 text-[12.5px] leading-5 text-slate-600 dark:text-slate-300">
        <p className="font-bold text-slate-900 dark:text-white">Finding students</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Press <b>Filters</b> and pick what to analyse: All, Prep Coding (with Quick Prep sheets), Prep Learning, Prep Interview or Prep Assessment.</li>
          <li>Under <b>Which students?</b> tap the options you want, e.g. Semester <b>5</b> and <b>6</b>, Prep Score <b>10–25</b>. Several options in one row mean any of them; different rows all apply together.</li>
          <li>Need a second kind of student too? Press <b>Add another group of students</b>: students who fit group A <b>or</b> group B are shown.</li>
          <li>Optionally show only the <b>Top</b> or <b>Bottom</b> students (a number or a %). The button at the bottom shows how many students match; press it to apply.</li>
          <li>What is in use shows next to the Filters button: click it to change, or × to clear.</li>
          <li>The big numbers are shortcuts: click “Not practising” to see just those students; click again to undo.</li>
          <li>Click any student (in the table or a chart) to see their full profile.</li>
        </ul>
        <p className="font-bold text-slate-900 dark:text-white">Prep Score</p>
        <p>Each student's current Prep Score: exactly the number they see and are ranked on, from practice coding problems solved (up to the daily limit per topic). The values behind it are set by the Master Admin in Prep Score Adjustment.</p>
        <p>The selected period narrows activity figures, not the Prep Score. Interview and assessment activity points are shown for reference and are not part of the Prep Score.</p>
        <p><b className="text-slate-900 dark:text-white">Course completed (Prep Learning)</b>: topics a student completed out of the topics they can open (their semester and earlier).</p>
        <p><b className="text-slate-900 dark:text-white">Sheet progress (Quick Prep sheets, part of Prep Coding)</b>: questions solved out of all questions in the sheets the student started.</p>
      </div>
    </Dialog>
  );
}
