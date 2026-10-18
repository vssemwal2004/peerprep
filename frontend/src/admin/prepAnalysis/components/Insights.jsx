import {
  Activity, ArrowDown, ArrowUp, BadgeCheck, Bot, BookOpenCheck, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, ClipboardList,
  Flag, Flame, ListChecks, MessagesSquare, PauseCircle, PlayCircle, Target, Trophy, Users, XCircle,
} from "lucide-react";
import { DIFFICULTY_COLORS } from "../charts/chartTheme";
import { LANGUAGE_LABELS } from "../charts/chartOptions";
import { isKpiActive, kpiRule } from "../filterModel";
import { formatScore } from "../../../student/prepScore/formatScore";
import { PrepCoin } from "../../../student/prepScore/PrepScore";
import { initials, sectionStyle } from "./sectionStyles";
import { Dialog, IconButton, focusRing } from "./ui";

const KPI_ICONS = {
  students: Users, active: Activity, solved: CheckCircle2, hard: Flame, accuracy: Target, stopped: PauseCircle,
  sheetStarted: ListChecks, sheetFinished: BadgeCheck, topics: BookOpenCheck, halfway: Flag, video: PlayCircle,
  mocks: MessagesSquare, ai: Bot, strong: Trophy, scheduled: CalendarClock, never: CircleDashed,
  taken: ClipboardList, passed: CheckCircle2, passedStudents: CheckCircle2, passRate: Target, missed: XCircle, subjectDone: BadgeCheck,
};
const BLANK = String.fromCharCode(160);

const formatKpi = (kpi) => (kpi.format === "percent" ? `${kpi.value}%` : Number(kpi.value).toLocaleString());

/**
 * Headline numbers for one section. A number with a matching filter is a button:
 * click it to show just those students, click again to undo.
 */
export function KpiStrip({ section = "coding", kpis, loading, state, fieldMap, onToggle }) {
  const style = sectionStyle(section);
  if (!kpis?.length) {
    return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[84px] animate-pulse rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)}</div>;
  }
  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${kpis.length > 5 ? "xl:grid-cols-6" : "xl:grid-cols-5"} ${loading ? "opacity-70" : ""}`}>
      {kpis.map((kpi) => {
        const Icon = KPI_ICONS[kpi.id] || Activity;
        const pick = state && onToggle ? kpiRule(section, kpi.id, fieldMap) : null;
        const on = Boolean(pick && isKpiActive(pick, state));
        const warn = kpi.tone === "warning" && kpi.value > 0;
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">{kpi.label}</p>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${warn ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" : style.chip}`}><Icon className="h-3.5 w-3.5" /></span>
            </div>
            <p className={`text-[22px] font-extrabold leading-7 tracking-tight tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>{formatKpi(kpi)}</p>
            <p className="truncate text-[10.5px] text-slate-400">
              {on
                ? <span className="font-semibold text-sky-600 dark:text-sky-300">Showing only these · click to undo</span>
                : <>{kpi.hint || BLANK}{pick && <span className="ml-1 hidden font-semibold text-sky-600 group-hover:inline dark:text-sky-300">· Show them</span>}</>}
            </p>
          </>
        );
        const card = "group relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-xl border bg-white px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-gray-900";
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
      <PrepCoin size={18} />
      <span className="min-w-[3.25rem] text-right text-[12px] font-bold tabular-nums text-slate-900 dark:text-white">{formatScore(row.prepScore)}</span>
      <div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"
        title={`${segments.map((segment) => `${segment.key} ${formatScore(segment.value)}`).join(" · ")} · quality ${formatScore(row.quality ?? 0)}%`}>
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
    { label: "Coding", render: (row) => <StatusPill status={row.practiceStatus} /> },
    { label: "Quick Prep sheets", sort: "sheetProgress", render: (row) => (row.quickprep?.started
      ? <span className="flex items-center gap-2"><PercentBar value={row.quickprep.progress} /><span className="whitespace-nowrap text-[10.5px] text-slate-400">{row.quickprep.finished} of {row.quickprep.started} done</span></span>
      : <StatusPill status="none" />) },
    { label: "Languages", render: (row) => <span className="block max-w-[150px] truncate text-slate-500">{row.languages.map((language) => LANGUAGE_LABELS[language] || language).join(", ") || "—"}</span> },
  ],
  learning: [
    { label: "Course completed", sort: "learningProgress", render: (row) => <PercentBar value={row.learning?.progress || 0} /> },
    { label: "Topics", sort: "topicsCompleted", render: (row) => <span className="tabular-nums">{row.learning ? `${row.learning.completedTopics} of ${row.learning.availableTopics}` : "—"}</span> },
    { label: "Video", align: "right", render: (row) => <span className="tabular-nums">{row.learning ? `${row.learning.videoMinutes} min` : "—"}</span> },
    { label: "Learning", render: (row) => <StatusPill status={row.learning?.status} /> },
  ],
  interview: [
    { label: "Mock score", sort: "mockScore", render: (row) => (row.interview?.mockDone ? <PercentBar value={row.interview.mockScore} /> : "—") },
    { label: "Interviews done", sort: "interviewsDone", align: "right", render: (row) => <span className="tabular-nums">{row.interview?.done ?? 0}</span> },
    { label: "Mock · AI", render: (row) => <span className="whitespace-nowrap tabular-nums text-slate-500">{row.interview ? `${row.interview.mockDone} mock · ${row.interview.aiCompleted} AI` : "—"}</span> },
    { label: "Scheduled", align: "right", render: (row) => <span className="tabular-nums">{row.interview?.scheduled || "—"}</span> },
    { label: "Interviews", render: (row) => <StatusPill status={row.interview?.status} /> },
  ],
  assessment: [
    { label: "Test score", sort: "testScore", render: (row) => (row.assessment?.taken ? <PercentBar value={row.assessment.averageScore} /> : "—") },
    { label: "Tests taken", sort: "testsTaken", align: "right", render: (row) => <span className="tabular-nums">{row.assessment?.taken ?? 0}</span> },
    { label: "Passed", align: "right", render: (row) => <span className="tabular-nums">{row.assessment?.taken ? `${row.assessment.passed} of ${row.assessment.taken}` : "—"}</span> },
    { label: "Missed", sort: "testsMissed", align: "right", render: (row) => <span className={`tabular-nums ${row.assessment?.missed ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>{row.assessment?.missed ?? 0}</span> },
    { label: "Tests", render: (row) => <StatusPill status={row.assessment?.status} /> },
  ],
};
const scoreCell = (value) => (value === null || value === undefined ? "—" : (
  <span className="inline-flex items-center gap-1.5"><PrepCoin size={18} /><b className="tabular-nums text-slate-900 dark:text-white">{formatScore(value)}</b></span>
));
// Prep Coding leads with its Prep Score and Prep Learning with course completed;
// Prep Interview and Prep Assessment lead with their own Prep Score points.
for (const area of ["interview", "assessment"]) {
  COLUMNS[area] = [{ label: "Prep Score", sort: "featureScore", render: (row) => scoreCell(row.scores?.features?.[area]) }, ...COLUMNS[area]];
}
COLUMNS.all = [
  { label: "Prep Score (overall)", sort: "overallScore", render: (row) => scoreCell(row.scores?.total) },
  { ...COLUMNS.coding[0], label: "Prep Coding" },
  { label: "Prep Learning", render: (row) => scoreCell(row.scores?.features?.learning) },
  { ...COLUMNS.interview[0], label: "Prep Interview", sort: undefined },
  { ...COLUMNS.assessment[0], label: "Prep Assessment", sort: undefined },
];
const POSITION_HINT = { coding: "Prep Score", learning: "course completed", interview: "Prep Score", assessment: "Prep Score", all: "overall Prep Score" };

export function StudentTable({ table, area, loading, onChange, onOpen }) {
  if (!table) return null;
  const columns = COLUMNS[area] || COLUMNS.coding;
  const pages = Math.max(1, Math.ceil(table.total / table.limit));
  const sortBy = (key) => onChange({ sort: key, direction: table.sort === key && table.direction === "desc" ? "asc" : "desc", page: 1 });
  const header = (label, sort, align) => {
    const active = sort && table.sort === sort;
    return (
      <th key={label} scope="col" className={`whitespace-nowrap px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`} aria-sort={active ? (table.direction === "asc" ? "ascending" : "descending") : undefined}>
        {sort ? (
          <button type="button" onClick={() => sortBy(sort)} className={`inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-white ${focusRing}`}>
            {label}{active && (table.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
          </button>
        ) : label}
      </th>
    );
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900" aria-labelledby="students-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
        <div>
          <h2 id="students-title" className="flex items-center gap-2 text-[13.5px] font-bold text-slate-900 dark:text-white"><Users className="h-4 w-4 text-sky-500" />Students</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Click a student to see everything about their prep. # is the place by {POSITION_HINT[area] || "Prep Score"} among the students shown.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{table.total.toLocaleString()} students</span>
      </header>
      <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
        <table data-no-serial className="min-w-full text-[12px] text-slate-700 dark:text-slate-200">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
              {header("#")}
              {header("Student", "name")}
              {header("Class")}
              {columns.map((column) => header(column.label, column.sort, column.align))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
            {table.rows.map((row) => (
              <tr key={row.id} onClick={() => onOpen?.(row.id)} className="cursor-pointer transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-500/[0.06]">
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
            {!table.rows.length && <tr><td colSpan={columns.length + 3} className="px-3 py-10 text-center text-[12px] text-slate-400">No students match. Try clearing a filter.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-white/[0.06]">
          Page {table.page} of {pages}
          <IconButton label="Previous page" disabled={table.page <= 1} onClick={() => onChange({ page: table.page - 1 })}><ChevronLeft className="h-4 w-4" /></IconButton>
          <IconButton label="Next page" disabled={table.page >= pages} onClick={() => onChange({ page: table.page + 1 })}><ChevronRight className="h-4 w-4" /></IconButton>
        </footer>
      )}
    </section>
  );
}

/** Prep Score in plain words, with the live points and rules (PREP_SCORE_RULES). */
export function ScoreHelpDialog({ open, onClose, formula }) {
  if (!open || !formula?.coding) return null;
  const { coding } = formula;
  return (
    <Dialog open={open} onClose={onClose} size="max-w-lg" title="How to use Prep Analysis" subtitle="Every number belongs to one student and comes only from that student's own work.">
      <div className="space-y-3 p-4 text-[12.5px] leading-5 text-slate-600 dark:text-slate-300">
        <p className="font-bold text-slate-900 dark:text-white">Finding students</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Press <b>Filters</b> and pick what to analyse: All, Prep Coding (with Quick Prep sheets), Prep Learning, Prep Interview or Prep Assessment.</li>
          <li>Under <b>Which students?</b> tap the options you want, e.g. Semester <b>5</b> and <b>6</b>, Prep Score <b>250–1,000</b>. Several options in one row mean any of them; different rows all apply together.</li>
          <li>Need a second kind of student too? Press <b>Add another group of students</b>: students who fit group A <b>or</b> group B are shown.</li>
          <li>Optionally show only the <b>Top</b> or <b>Bottom</b> students (a number or a %). The button at the bottom shows how many students match; press it to apply.</li>
          <li>What is in use shows next to the Filters button: click it to change, or × to clear.</li>
          <li>The big numbers are shortcuts: click “Not practising” to see just those students; click again to undo.</li>
          <li>Click any student (in the table or a chart) to see their full profile.</li>
        </ul>
        <p className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white"><PrepCoin size={18} />Prep Score: work points × quality, no maximum</p>
        <div className="grid grid-cols-3 gap-2">
          {["Easy", "Medium", "Hard"].map((key) => (
            <div key={key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-gray-700">
              <p className="text-[11px] font-bold" style={{ color: DIFFICULTY_COLORS[key] }}>{key}</p>
              <p className="text-[11.5px]"><b className="text-slate-900 dark:text-white">{coding.points[key]}</b> point{coding.points[key] === 1 ? "" : "s"} per solve</p>
            </div>
          ))}
        </div>
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Work points</b>: Prep Coding as above; Prep Learning {formula.learning.perTopic} per topic completed; Prep Interview {formula.interview.perMock} per mock interview (+{formula.interview.perAiInterview} per AI interview); Prep Assessment {formula.assessment.perTest} per test taken.</li>
          <li><b>× Quality</b>, the student's own average. Coding: up to {coding.fairTriesPerSolve} submissions per solved problem are fair (the first {coding.starterSubmissions} are free); more lowers it. Interviews and tests: the average mark above the {formula.passMark}% pass mark (a failing attempt earns nothing).</li>
          <li><b>Overall Prep Score</b> = the average of the features your university uses. A well-prepared student earns about 500 in each feature; there is no maximum.</li>
        </ol>
        <p><b className="text-slate-900 dark:text-white">Course completed (Prep Learning)</b>: topics a student completed out of the topics they can open (their semester and earlier).</p>
        <p><b className="text-slate-900 dark:text-white">Sheet progress (Quick Prep sheets, part of Prep Coding)</b>: questions solved out of all questions in the sheets the student started.</p>
      </div>
    </Dialog>
  );
}
