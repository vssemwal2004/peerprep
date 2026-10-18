import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Lightbulb, Loader2 } from "lucide-react";
import { prepAnalysisApi } from "../api";
import { LANGUAGE_LABELS } from "../charts/chartOptions";
import { DIFFICULTY_COLORS, OUTCOME_COLORS } from "../charts/chartTheme";
import { RANGE_PRESETS } from "../filterModel";
import { lastSeenText, studentHighlights } from "../studentInsights";
import { ChartBody } from "./ChartCard";
<<<<<<< Updated upstream
import { formatScore } from "../../../student/prepScore/formatScore";
import { PrepCoin, PrepScoreFlow, ScoreValue } from "../../../student/prepScore/PrepScore";
=======
>>>>>>> Stashed changes
import { StatusPill } from "./Insights";
import { initials, sectionStyle } from "./sectionStyles";
import { Drawer } from "./ui";

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

<<<<<<< Updated upstream
/** Prep Coding's points as a coin with "work points × quality". */
function CodingScore({ coding }) {
  return (
    <div className="flex w-[124px] shrink-0 flex-col items-center gap-1.5 text-center">
      <PrepCoin size={56} />
      <span className="text-[22px] font-extrabold leading-6 tabular-nums text-slate-900 dark:text-white">{formatScore(coding.prepScore)}</span>
      <span className="text-[10.5px] leading-tight text-slate-500 dark:text-slate-400">{formatScore(coding.work)} work points × {formatScore(coding.quality)}% quality</span>
=======
function ScoreRing({ score, color = "#0284c7" }) {
  const radius = 42;
  const length = 2 * Math.PI * radius;
  return (
    <div className="relative h-[108px] w-[108px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-slate-100 dark:stroke-white/[0.06]" />
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" stroke={color} strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(100, score) / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-extrabold leading-7 tabular-nums text-slate-900 dark:text-white">{score.toFixed(1)}</span>
        <span className="text-[10px] font-semibold text-slate-400">Prep Score</span>
      </div>
>>>>>>> Stashed changes
    </div>
  );
}

const calendarChart = (id, section, calendar) => ({ id, section, type: "calendar", title: "Daily activity", question: "", data: calendar, size: "full" });

<<<<<<< Updated upstream
function CodingSection({ coding, quickprep }) {
=======
function CodingSection({ coding }) {
>>>>>>> Stashed changes
  const verdictTotal = coding.verdicts.reduce((sum, verdict) => sum + verdict.value, 0);
  const verdictColor = { AC: OUTCOME_COLORS.AC, WA: OUTCOME_COLORS.WA, TLE: OUTCOME_COLORS.TLE, RE: OUTCOME_COLORS.RE, CE: OUTCOME_COLORS.CE };
  return (
    <Section section="coding" title="Prep Coding" aside={<StatusPill status={coding.practiceStatus} />}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
<<<<<<< Updated upstream
        <CodingScore coding={coding} />
        <div className="min-w-0 flex-1 space-y-2.5">
          {["Easy", "Medium", "Hard"].map((key) => (
            <Bar key={key} label={key} value={coding.points[key]} max={coding.prepScore} color={DIFFICULTY_COLORS[key]}
              right={<><b className="text-slate-900 dark:text-white">{coding.solved[key]}</b> solved · {formatScore(coding.points[key])} points</>} />
          ))}
          <Bar label="Quality" value={coding.quality} max={100} color={DIFFICULTY_COLORS.Accuracy}
            right={<b className="text-slate-900 dark:text-white">{formatScore(coding.quality)}%</b>}
            sub={coding.solved.total ? `${coding.triesPerSolve} submissions per solve (up to 3 is fair) · ${coding.accuracy}% accepted` : `${coding.accepted} of ${coding.submissions} submissions accepted`} />
=======
        <ScoreRing score={coding.prepScore} />
        <div className="min-w-0 flex-1 space-y-2.5">
          {["Easy", "Medium", "Hard"].map((key) => (
            <Bar key={key} label={key} value={coding.solved[key]} max={coding.targets[key]} color={DIFFICULTY_COLORS[key]}
              right={<><b className="text-slate-900 dark:text-white">{coding.solved[key]}</b> of {coding.targets[key]} target · {coding.points[key]} pts</>} />
          ))}
          <Bar label="Accuracy" value={coding.accuracy} max={100} color={DIFFICULTY_COLORS.Accuracy}
            right={<><b className="text-slate-900 dark:text-white">{coding.accuracy}%</b> · {coding.points.accuracy} pts</>} sub={`${coding.accepted} of ${coding.submissions} submissions accepted`} />
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      {quickprep && <QuickPrepBlock quickprep={quickprep} />}
=======
>>>>>>> Stashed changes
    </Section>
  );
}

<<<<<<< Updated upstream
/** Quick Prep sheets, shown inside Prep Coding. */
function QuickPrepBlock({ quickprep }) {
  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3 dark:border-gray-800">
      <p className="flex items-center justify-between text-[12px] font-bold text-slate-800 dark:text-slate-100">Quick Prep sheets <StatusPill status={quickprep.status} /></p>
=======
function QuickPrepSection({ quickprep }) {
  return (
    <Section section="quickprep" title="Quick Prep sheets" aside={<StatusPill status={quickprep.status} />}>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
          {quickprep.notStarted.map((title) => <span key={title} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-slate-600 dark:border-gray-700 dark:text-slate-300">{title}</span>)}
        </div>
      )}
    </div>
  );
}

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

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
=======
          {quickprep.notStarted.map((title) => <span key={title} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-slate-600 dark:border-white/15 dark:text-slate-300">{title}</span>)}
>>>>>>> Stashed changes
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

/** Everything about one student's prep, opened from the table or a chart. */
export default function StudentDrawer({ studentId, range = "all", onClose }) {
  const [state, setState] = useState({ loading: true, error: null, profile: null });
  useEffect(() => {
    if (!studentId) return undefined;
    const controller = new AbortController();
    setState({ loading: true, error: null, profile: null });
    prepAnalysisApi.student(studentId, range, controller.signal)
      .then((profile) => setState({ loading: false, error: null, profile }))
      .catch((error) => { if (error.name !== "AbortError") setState({ loading: false, error, profile: null }); });
    return () => controller.abort();
  }, [range, studentId]);
  if (!studentId) return null;
  const { profile, loading, error } = state;
  const student = profile?.student;
  const period = RANGE_PRESETS.find((preset) => preset.value === range)?.label || "All time";
  const highlights = studentHighlights(profile);
  const classLine = student ? [student.semester ? `Semester ${student.semester}` : "", student.branch, student.course, student.group, student.college].filter(Boolean).join(" · ") : "";
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
          </div>

<<<<<<< Updated upstream
          {profile.prepScore && (
            <section aria-label="Prep Score" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Prep Score (overall)</p>
                    <p className="mt-1"><ScoreValue value={profile.prepScore.total} size="lg" /></p>
                  </div>
                </div>
                <p className="max-w-[220px] text-right text-[11px] text-slate-500">Each feature: work points × quality. Overall: their average (no maximum).</p>
              </div>
              <PrepScoreFlow prepScore={profile.prepScore} own={false} className="mt-3" />
            </section>
          )}

=======
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
          {profile.coding && <CodingSection coding={profile.coding} quickprep={profile.quickprep} />}
          {profile.learning && <LearningSection learning={profile.learning} />}
          {profile.interview && <InterviewSection interview={profile.interview} />}
          {profile.assessment && <AssessmentSection assessment={profile.assessment} />}
=======
          {profile.coding && <CodingSection coding={profile.coding} />}
          {profile.quickprep && <QuickPrepSection quickprep={profile.quickprep} />}
          {profile.learning && <LearningSection learning={profile.learning} />}
>>>>>>> Stashed changes
          <p className="text-center text-[10.5px] text-slate-400">Only this student's own work in {period.toLowerCase()} is shown. Students are never compared with each other here.</p>
        </div>
      )}
    </Drawer>
  );
}
