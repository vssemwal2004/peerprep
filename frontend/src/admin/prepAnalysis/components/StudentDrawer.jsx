import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SortHeader, TablePager, useClientTable } from "../../../components/table";
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Flag, Lightbulb, Loader2, UserRound } from "lucide-react";
import { useAnalysisApi } from "../analysisScope";
import { LANGUAGE_LABELS } from "../charts/chartOptions";
import { DIFFICULTY_COLORS, OUTCOME_COLORS } from "../charts/chartTheme";
import { normalizeDateRange, rangeLabel } from "../../../components/dateRange/dateRangeModel";
import { lastSeenText, studentHighlights } from "../studentInsights";
import { ChartBody } from "./ChartCard";
import { formatScore } from "../../../student/prepScore/formatScore";
import { ScoreValue } from "../../../student/prepScore/PrepScore";
import ModuleScores from "./ModuleScores";
import { StatusPill } from "./Insights";
import { initials, sectionStyle } from "./sectionStyles";
import { Button, Drawer, focusRing } from "./ui";

/** Opens the student's full profile page (same role prefix as the page we are on). */
function ProfileLink({ studentId }) {
  const prefix = window.location.pathname.startsWith("/coordinator") ? "/coordinator" : "/admin";
  return (
    <Link
      to={`${prefix}/students/${encodeURIComponent(studentId)}`}
      title="Open this student's full profile"
      className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-2.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-sky-700 ${focusRing}`}
    >
      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />View profile
    </Link>
  );
}

const TONES = {
  warn: { Icon: AlertTriangle, className: "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100", icon: "text-amber-500" },
  tip: { Icon: Lightbulb, className: "bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100", icon: "text-sky-500" },
  good: { Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100", icon: "text-emerald-500" },
};

function Section({ section, title, children, aside }) {
  const style = sectionStyle(section);
  const Icon = style.Icon;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-slate-900 dark:text-white">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${style.chip}`}><Icon className="h-3.5 w-3.5" /></span>{title}
        </h3>
        {aside}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.03]">
      <p className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-[16px] font-extrabold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="truncate text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Bar({ label, value, max, color, right, sub }) {
  const width = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">{label}{sub && <span className="ml-1.5 font-normal text-slate-400">{sub}</span>}</span>
        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{right}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"><span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${width}%`, backgroundColor: color }} /></div>
    </div>
  );
}

function CodingScore({ coding }) {
  return (
    <div className="flex w-[124px] shrink-0 flex-col items-center gap-1.5 text-center">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prep Coding</span>
      <span className="text-[22px] font-extrabold leading-6 tabular-nums text-slate-900 dark:text-white">{formatScore(coding.prepScore)}</span>
      <span className="text-[10.5px] leading-tight text-slate-500 dark:text-slate-400">Current score, as the student sees it</span>
    </div>
  );
}

const calendarChart = (id, section, calendar) => ({ id, section, type: "calendar", title: "Daily activity", question: "", data: calendar, size: "full" });

function CodingSection({ coding }) {
  const verdictTotal = coding.verdicts.reduce((sum, verdict) => sum + verdict.value, 0);
  const verdictColor = { AC: OUTCOME_COLORS.AC, WA: OUTCOME_COLORS.WA, TLE: OUTCOME_COLORS.TLE, RE: OUTCOME_COLORS.RE, CE: OUTCOME_COLORS.CE };
  return (
    <Section section="coding" title="Prep Coding" aside={<StatusPill status={coding.practiceStatus} />}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <CodingScore coding={coding} />
        <div className="min-w-0 flex-1 space-y-2.5">
          {/* Problems solved by their difficulty in this period: the same numbers as the charts. */}
          {["Easy", "Medium", "Hard"].map((key) => (
            <Bar key={key} label={key} value={coding.solved[key]} max={Math.max(1, coding.solved.total)} color={DIFFICULTY_COLORS[key]}
              right={<><b className="text-slate-900 dark:text-white">{coding.solved[key]}</b> solved</>} />
          ))}
          {coding.scoredCounts && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400" title="The Prep Score counts each solve at its scoring level, over all time, so these can differ from the solves above.">
              Counted in Prep Score (all time): Easy {coding.scoredCounts.Easy || 0} · Medium {coding.scoredCounts.Medium || 0} · Hard {coding.scoredCounts.Hard || 0}
            </p>
          )}
          <Bar label="Accepted submissions" value={coding.accepted} max={Math.max(1, coding.submissions)} color={DIFFICULTY_COLORS.Accuracy}
            right={<b className="text-slate-900 dark:text-white">{formatScore(coding.accuracy)}%</b>}
            sub={`${coding.accepted} of ${coding.submissions} submissions accepted`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Problems solved" value={coding.solved.total} hint={`${coding.attempted} tried`} />
        <Stat label="Submissions" value={coding.submissions.toLocaleString()} />
        <Stat label="Days practised" value={coding.activeDays} />
        <Stat label="Last practice" value={lastSeenText(coding.daysSinceActive)} />
      </div>
      {coding.languages.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="font-semibold text-slate-500">Languages:</span>
          {coding.languages.map((entry) => <span key={entry.language} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-white/[0.06] dark:text-slate-200">{LANGUAGE_LABELS[entry.language] || entry.language} <span className="font-normal text-slate-400">· {entry.submissions}</span></span>)}
        </div>
      )}
      {coding.topics.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold text-slate-800 dark:text-slate-100">Topics practised</p>
          <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
            {coding.topics.map((topic) => (
              <Bar key={topic.name} label={topic.name} value={topic.solved} max={topic.attempted} color={topic.solved / Math.max(1, topic.attempted) >= 0.5 ? "#0284c7" : "#f59e0b"}
                right={<><b className="text-slate-900 dark:text-white">{topic.solved}</b> of {topic.attempted} solved · {topic.accuracy}% accurate</>} />
            ))}
          </div>
        </div>
      )}
      {verdictTotal > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold text-slate-800 dark:text-slate-100">What happened to their submissions</p>
          <div className="flex h-3 overflow-hidden rounded-full">
            {coding.verdicts.map((verdict) => <span key={verdict.key} title={`${verdict.name}: ${verdict.value}`} style={{ width: `${(verdict.value / verdictTotal) * 100}%`, backgroundColor: verdictColor[verdict.key] }} />)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
            {coding.verdicts.map((verdict) => (
              <span key={verdict.key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: verdictColor[verdict.key] }} />{verdict.name} <b className="tabular-nums">{verdict.value}</b> <span className="text-slate-400">({Math.round((verdict.value / verdictTotal) * 100)}%)</span></span>
            ))}
          </div>
        </div>
      )}
      {coding.unsolved.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-bold text-slate-800 dark:text-slate-100">Tried but not solved yet</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-white/[0.05] dark:border-white/[0.06]">
            {coding.unsolved.map((problem) => (
              <li key={problem.title} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]">
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{problem.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-[11px]">
                  <span className="font-semibold" style={{ color: DIFFICULTY_COLORS[problem.difficulty] }}>{problem.difficulty}</span>
                  <span className="tabular-nums text-slate-400">{problem.attempts} tries</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {coding.calendar.days.length > 0 && (
        <div>
          <p className="mb-1 text-[12px] font-bold text-slate-800 dark:text-slate-100">Days with code submitted</p>
          <ChartBody chart={calendarChart("profile-coding", "coding", coding.calendar)} height={170} />
        </div>
      )}
    </Section>
  );
}

/** Quick Prep sheets: its own section, separate from Prep Coding. */
function QuickPrepSection({ quickprep }) {
  const lastSeen = quickprep.daysSinceActive === null || quickprep.daysSinceActive === undefined ? "never opened"
    : quickprep.daysSinceActive === 0 ? "active today" : `last active ${quickprep.daysSinceActive}d ago`;
  return (
    <Section section="quickprep" title="Quick Prep" aside={<StatusPill status={quickprep.status} />}>
      <div className="space-y-2.5">
      <p className="text-[12px] text-slate-600 dark:text-slate-300">
        <b className="text-slate-900 dark:text-white">{quickprep.sheets.length}</b> started · <b className="text-slate-900 dark:text-white">{quickprep.finished}</b> finished · <b className="text-slate-900 dark:text-white">{quickprep.solved}</b> of {quickprep.total} questions solved ({quickprep.progress}%) · {lastSeen}
      </p>
      {quickprep.sheets.length ? (
        <div className="space-y-2.5">
          {quickprep.sheets.map((sheet) => (
            <Bar key={sheet.id} label={sheet.title} value={sheet.solved} max={sheet.total} color={sheet.finished ? "#10b981" : "#0284c7"}
              sub={sheet.finished ? "Finished" : sheet.lastViewedAt ? `opened ${new Date(sheet.lastViewedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
              right={<><b className="text-slate-900 dark:text-white">{sheet.solved}</b> of {sheet.total} · {sheet.progress}%</>} />
          ))}
        </div>
      ) : <p className="text-[12px] text-slate-500">No sheet started yet.</p>}
      {quickprep.notStarted.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="font-semibold text-slate-500">Open to them, not started:</span>
          {quickprep.notStarted.map((title) => <span key={title} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-slate-600 dark:border-gray-700 dark:text-slate-300">{title}</span>)}
        </div>
      )}
      </div>
    </Section>
  );
}

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const dateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const clockTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
function duration(ms) {
  if (ms === null || ms === undefined) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
const VERDICTS = { AC: ["Accepted", "text-emerald-700 dark:text-emerald-400"], WA: ["Wrong answer", "text-rose-600"], TLE: ["Time limit", "text-amber-700"], RE: ["Runtime error", "text-rose-600"], CE: ["Compile error", "text-slate-600"] };
const REASON_TEXT = { fast: "Very fast", pasted: "Mostly pasted" };

/**
 * Every recent practice submission with its date and time, when the question was opened, how long
 * the student actively worked and how much was pasted from outside the editor. "Needs review" is
 * judged on the first accepted solve of a question only, and is a prompt to look, not a verdict.
 */
const submissionValue = (row, key) => {
  switch (key) {
    case "result": return (VERDICTS[row.status] || [row.status])[0];
    case "ownWork": return row.reasons.length ? row.reasons.map((reason) => REASON_TEXT[reason]).join(" · ") : row.firstSolve ? "OK" : null;
    default: return row[key];
  }
};
const SUBMISSION_COLUMNS = [
  { key: "submittedAt", label: "Submitted" },
  { key: "title", label: "Question" },
  { key: "result", label: "Result" },
  { key: "startedAt", label: "Started", title: "When the question was opened in that visit" },
  { key: "activeMs", label: "Time taken", align: "right", title: "Active time (tab in use) · total time open" },
  { key: "pastedShare", label: "Pasted", align: "right", title: "Share of the submitted code pasted from outside the editor" },
  { key: "ownWork", label: "Own work" },
];

function SubmissionHistorySection({ submissions }) {
  const [onlyReview, setOnlyReview] = useState(false);
  const flagged = submissions.filter((row) => row.reasons.length).length;
  const shown = useMemo(() => (onlyReview ? submissions.filter((row) => row.reasons.length) : submissions), [onlyReview, submissions]);
  const table = useClientTable(shown, { getValue: submissionValue, resetKey: onlyReview });
  return (
    <Section
      section="coding"
      title="Submission history"
      aside={flagged > 0 ? (
        <button type="button" onClick={() => setOnlyReview((value) => !value)} aria-pressed={onlyReview}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${onlyReview ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300"}`}>
          <Flag className="h-3 w-3" aria-hidden="true" />{flagged} to review
        </button>
      ) : <span className="text-[11px] text-slate-500">Latest {submissions.length}</span>}
    >
      {submissions.length === 0 ? <p className="text-[12px] text-slate-500">No practice submissions in this period.</p> : (
        <div className="overflow-hidden rounded-lg border border-slate-100 dark:border-gray-800">
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[640px] text-left text-[11.5px]" style={{ "--serial-start": (table.page - 1) * table.pageSize }}>
            <thead className="sticky top-0 bg-slate-50 dark:bg-gray-800">
              <tr>
                {SUBMISSION_COLUMNS.map((column) => (
                  <SortHeader key={column.key} sortKey={column.key} sort={table.sort} onSort={table.toggleSort} align={column.align} title={column.title} className="whitespace-nowrap">{column.label}</SortHeader>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {table.pageRows.map((row, index) => {
                const [verdict, tone] = VERDICTS[row.status] || [row.status, "text-slate-600"];
                return (
                  <tr key={`${row.submittedAt}-${index}`} className={row.reasons.length ? "bg-amber-50/60 dark:bg-amber-500/[0.06]" : ""}>
                    <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-slate-700 dark:text-slate-200">{dateTime(row.submittedAt)}</td>
                    <td className="max-w-[200px] px-2.5 py-2">
                      <span className="block truncate font-semibold text-slate-900 dark:text-white" title={row.title}>{row.title}</span>
                      {row.quickprep && <span className="mt-0.5 inline-block rounded bg-sky-50 px-1.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Quick Prep · {row.quickprep}</span>}
                    </td>
                    <td className={`whitespace-nowrap px-2.5 py-2 font-semibold ${tone}`}>{verdict}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-slate-600 dark:text-slate-300">{row.startedAt ? clockTime(row.startedAt) : <span className="text-slate-400" title="Submitted before time tracking started">—</span>}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {row.activeMs === null ? "—" : <>{duration(row.activeMs)}<span className="text-slate-400"> · {duration(row.solveMs)}</span></>}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">{row.pastedShare === null ? "—" : `${row.pastedShare}%`}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">
                      {row.reasons.length
                        ? <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"><Flag className="h-3 w-3" aria-hidden="true" />{row.reasons.map((reason) => REASON_TEXT[reason]).join(" · ")}</span>
                        : row.firstSolve ? <span className="text-emerald-700 dark:text-emerald-400">OK</span> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePager {...table.pager} noun="submissions" className="dark:border-gray-800" />
        </div>
      )}
      <p className="mt-2 text-[10.5px] text-slate-400">Flags mark first solves that were very fast for their difficulty or mostly pasted. They are a reason to look, not proof of copying.</p>
    </Section>
  );
}

function InterviewSection({ interview }) {
  const rated = interview.ratings.filter((rating) => rating.value);
  return (
    <Section section="interview" title="Prep Interview" aside={<StatusPill status={interview.status} />}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Mock score (their average)" value={interview.mockDone ? `${interview.mockScore}%` : "—"} hint={interview.mockDone ? `best ${interview.bestMockScore}% · latest ${interview.lastMockScore}%` : "no mock interview yet"} />
        <Stat label="Mock interviews" value={interview.mockDone} hint={`${interview.given} as interviewer · ${interview.scheduled} scheduled`} />
        <Stat label="AI interviews" value={interview.aiCompleted} hint={`${interview.aiStarted} started`} />
        <Stat label="Last interview" value={lastSeenText(interview.daysSinceActive)} />
      </div>
      {rated.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold text-slate-800 dark:text-slate-100">Ratings from interviewers (1 to 5)</p>
          <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
            {rated.map((rating) => <Bar key={rating.key} label={rating.label} value={rating.value} max={5} color="#0284c7" right={<b className="text-slate-900 dark:text-white">{rating.value} / 5</b>} />)}
          </div>
        </div>
      )}
      {interview.mocks.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-bold text-slate-800 dark:text-slate-100">Latest mock interviews</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-gray-800 dark:border-gray-800">
            {interview.mocks.map((mock, index) => (
              <li key={`${mock.at}-${index}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]">
                <span className="text-slate-600 dark:text-slate-300">{shortDate(mock.at)}</span>
                <b className="tabular-nums text-slate-900 dark:text-white">{mock.score}%</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function AssessmentSection({ assessment }) {
  return (
    <Section section="assessment" title="Prep Assessment" aside={<StatusPill status={assessment.status} />}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Test score (their average)" value={assessment.taken ? `${assessment.averageScore}%` : "—"} hint={assessment.taken ? `best ${assessment.bestScore}% · latest ${assessment.lastScore}%` : "no test yet"} />
        <Stat label="Tests passed" value={`${assessment.passed} of ${assessment.taken}`} hint={`pass mark ${assessment.passPercent}%`} />
        <Stat label="Tests missed" value={assessment.missed} />
        <Stat label="Last test" value={lastSeenText(assessment.daysSinceActive)} />
      </div>
      {assessment.tests.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">Their tests</p>
          {assessment.tests.map((test) => (
            <Bar key={test.id} label={test.title} value={test.percent} max={100} color={test.passed ? "#10b981" : "#f43f5e"}
              sub={`${shortDate(test.at)} · ${test.passed ? "passed" : "not passed"}`}
              right={<><b className="text-slate-900 dark:text-white">{test.percent}%</b> · {test.score} of {test.maxMarks}</>} />
          ))}
        </div>
      )}
      {assessment.missedTests.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className="font-semibold text-slate-500">Missed:</span>
          {assessment.missedTests.map((title) => <span key={title} className="rounded-full border border-dashed border-amber-300 px-2 py-0.5 text-amber-700 dark:border-amber-500/40 dark:text-amber-300">{title}</span>)}
        </div>
      )}
    </Section>
  );
}

function LearningSection({ learning }) {
  return (
    <Section section="learning" title="Prep Learning" aside={<StatusPill status={learning.status} />}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Course completed" value={`${learning.progress}%`} />
        <Stat label="Topics" value={`${learning.completedTopics} of ${learning.availableTopics}`} />
        <Stat label="Video watched" value={`${learning.videoMinutes} min`} />
        <Stat label="Last lesson" value={lastSeenText(learning.daysSinceActive)} />
      </div>
      {learning.subjects.length > 0 && (
        <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
          {learning.subjects.map((subject) => (
            <Bar key={subject.name} label={subject.name} value={subject.completed} max={subject.total} color={subject.completed >= subject.total ? "#10b981" : "#0284c7"}
              right={<><b className="text-slate-900 dark:text-white">{subject.completed}</b> of {subject.total} topics</>} />
          ))}
        </div>
      )}
      {learning.calendar.days.length > 0 && (
        <div>
          <p className="mb-1 text-[12px] font-bold text-slate-800 dark:text-slate-100">Days with topics completed</p>
          <ChartBody chart={calendarChart("profile-learning", "learning", learning.calendar)} height={170} />
        </div>
      )}
    </Section>
  );
}

/** Excel or PDF of everything about this student: every topic, problem and day, not just this drawer. */
function ReportDownload({ studentId, range }) {
  const api = useAnalysisApi();
  const [status, setStatus] = useState({ busy: "", text: "", error: false });
  const run = async (format) => {
    setStatus({ busy: format, text: "Preparing the report…", error: false });
    try {
      const result = await api.studentReport(studentId, range, format);
      setStatus({ busy: "", text: `${result.filename} downloaded`, error: false });
    } catch (error) {
      setStatus({ busy: "", text: error.message, error: true });
    }
  };
  return (
    <div className="ml-auto flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <ProfileLink studentId={studentId} />
        <Button size="sm" disabled={Boolean(status.busy)} onClick={() => run("xlsx")} title="Every topic, every problem with first try and first solve, each day of practice, and every feature's details">
          {status.busy === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}Full report (Excel)
        </Button>
        <Button size="sm" disabled={Boolean(status.busy)} onClick={() => run("pdf")} title="The same report, ready to print or share">
          {status.busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-rose-500" />}PDF
        </Button>
      </div>
      {status.text && <p role="status" className={`max-w-[260px] truncate text-[10.5px] ${status.error ? "text-rose-600" : "text-slate-500"}`}>{status.text}</p>}
    </div>
  );
}

/** Everything about one student's prep, opened from the table or a chart. */
export default function StudentDrawer({ studentId, range = "all", onClose }) {
  const api = useAnalysisApi();
  const [state, setState] = useState({ loading: true, error: null, profile: null });
  const rangeKey = JSON.stringify(typeof range === "string" ? { preset: range } : range || { preset: "all" });
  useEffect(() => {
    if (!studentId) return undefined;
    const controller = new AbortController();
    setState({ loading: true, error: null, profile: null });
    api.student(studentId, JSON.parse(rangeKey), controller.signal)
      .then((profile) => setState({ loading: false, error: null, profile }))
      .catch((error) => { if (error.name !== "AbortError") setState({ loading: false, error, profile: null }); });
    return () => controller.abort();
    // The period travels as text, so a new but equal range object never refetches.
  }, [api, rangeKey, studentId]);
  if (!studentId) return null;
  const { profile, loading, error } = state;
  const student = profile?.student;
  const period = rangeLabel(range);
  const highlights = studentHighlights(profile);
  const classLine = student ? [student.semester ? `Semester ${student.semester}` : "", student.branch, student.course, student.section ? `Section ${student.section}` : "", student.group, student.college].filter(Boolean).join(" · ") : "";
  return (
    <Drawer open onClose={onClose} width="max-w-[780px]" title={student?.name || "Student"} subtitle={student ? `${student.studentId || student.email} · ${period}` : period}>
      {loading && <div className="flex h-60 items-center justify-center text-[12px] text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading this student…</div>}
      {error && <div className="m-5 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error.status === 404 ? "This student is not in your list any more." : error.message}</div>}
      {profile && (
        <div className="space-y-4 bg-slate-50/60 p-5 dark:bg-transparent">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-[15px] font-bold text-white shadow-sm">{initials(student.name)}</span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold text-slate-900 dark:text-white">{student.name}</p>
              <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">{classLine || "No class details"}{student.email ? ` · ${student.email}` : ""}</p>
              {student.status === "inactive" && <p className="mt-0.5 text-[11px] font-semibold text-rose-600">Account disabled</p>}
            </div>
            <ReportDownload studentId={studentId} range={range} />
          </div>

          {profile.prepScore && (
            <section aria-label="Prep Score" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Prep Score (overall)</p>
                    <p className="mt-1"><ScoreValue value={profile.prepScore.total} size="lg" /></p>
                  </div>
                </div>
                <p className="max-w-[220px] text-right text-[11px] text-slate-500">Calculated from verified activity using the active Master Admin policy.</p>
              </div>
              <ModuleScores prepScore={profile.prepScore} className="mt-3" />
            </section>
          )}

          {highlights.length > 0 && (
            <section aria-label="What stands out" className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">What stands out</p>
              {highlights.map((line) => {
                const tone = TONES[line.tone] || TONES.tip;
                const ToneIcon = tone.Icon;
                return (
                  <p key={line.text} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] leading-5 ${tone.className}`}>
                    <ToneIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} aria-hidden="true" />{line.text}
                  </p>
                );
              })}
            </section>
          )}

          {profile.coding && <CodingSection coding={profile.coding} />}
          {profile.quickprep && <QuickPrepSection quickprep={profile.quickprep} />}
          {Array.isArray(profile.submissions) && <SubmissionHistorySection submissions={profile.submissions} />}
          {profile.learning && <LearningSection learning={profile.learning} />}
          {profile.interview && <InterviewSection interview={profile.interview} />}
          {profile.assessment && <AssessmentSection assessment={profile.assessment} />}
          <p className="text-center text-[10.5px] text-slate-400">Only this student's own work in {normalizeDateRange(range).preset === "custom" ? period : period.toLowerCase()} is shown. Students are never compared with each other here.</p>
        </div>
      )}
    </Drawer>
  );
}
