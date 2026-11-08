import { useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Bot, CalendarClock, ClipboardCheck, Mic } from "lucide-react";
import { lessonsTrendOption, mockTrendOption, ratingsRadarOption, testOutcomeOption, testTrendOption } from "../insightCharts";
import { daysAgoText, formatNumber, formatPercent, fullDate, shortDate } from "../insightModel";
import { Card, CardTitle, Chart, Delta, Empty, Figure, focusRing, Pill, ProgressBar, Section } from "./ui";

const compare = (value, previous, unit = "") => (previous === null || previous === undefined ? null : { change: Math.round((value - previous) * 10) / 10, unit });
const linkClass = `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`;

export function LearningSection({ learning, range, previousLabel }) {
  const trend = useCallback((theme) => lessonsTrendOption(learning.daily, { from: range.from, to: range.to }, theme), [learning.daily, range.from, range.to]);
  return (
    <Section id="learning" icon={BookOpen} title="Learning" subtitle={`Last lesson: ${daysAgoText(learning.daysSinceActive)}`} actions={<Link to="/student/learning" className={linkClass}>Open learning<ArrowRight className="h-3.5 w-3.5" /></Link>}>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="space-y-4 p-4">
          <Figure label="Course progress" value={formatPercent(learning.progress)} sub={`${learning.completedTopics} of ${learning.availableTopics} lessons`} />
          <ProgressBar value={learning.completedTopics} max={learning.availableTopics || 1} height="h-2" label="Course progress" />
          <div className="grid grid-cols-2 gap-3">
            <Figure label="Lessons this period" value={formatNumber(learning.inPeriod)}><Delta kpi={compare(learning.inPeriod, learning.previousInPeriod)} label={previousLabel} /></Figure>
            <Figure label="Video watched" value={`${formatNumber(learning.videoMinutes)}m`} />
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <CardTitle title="Lessons completed" hint="In this period" />
          {learning.inPeriod ? <Chart option={trend} height={200} label="Lessons completed over time" /> : <Empty icon={BookOpen} title="No lessons completed in this period." />}
        </Card>
        <Card className="p-4 lg:col-span-3">
          <CardTitle title="Subjects" hint="Lessons completed of the lessons you can open" />
          {learning.subjects.length ? (
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {learning.subjects.map((subject) => (
                <li key={subject.name}>
                  <div className="mb-1 flex justify-between gap-3 text-[12.5px]"><span className="truncate font-medium text-slate-800 dark:text-zinc-200">{subject.name}</span><span className="shrink-0 tabular-nums text-slate-500 dark:text-zinc-400">{subject.completed}/{subject.total}</span></div>
                  <ProgressBar value={subject.completed} max={subject.total} color={subject.progress >= 100 ? "#10b981" : "#0284c7"} label={`${subject.name} progress`} />
                </li>
              ))}
            </ul>
          ) : <Empty icon={BookOpen} title="No subjects to show yet." />}
        </Card>
      </div>
    </Section>
  );
}

export function TestsSection({ assessment, previousLabel }) {
  const trend = useCallback((theme) => testTrendOption(assessment.tests, assessment.passPercent, theme), [assessment.tests, assessment.passPercent]);
  const outcome = useCallback((theme) => testOutcomeOption(assessment, theme), [assessment]);
  return (
    <Section id="tests" icon={ClipboardCheck} title="Tests" subtitle={`Pass mark ${assessment.passPercent}% · last test: ${daysAgoText(assessment.daysSinceActive)}`}
      actions={<Link to="/student/assessment-reports" className={linkClass}>Test reports<ArrowRight className="h-3.5 w-3.5" /></Link>}>
      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Figure label="Average score" value={assessment.taken ? formatPercent(assessment.averageScore) : "—"}><Delta kpi={compare(assessment.averageScore, assessment.previous?.taken ? assessment.previous.averageScore : null, "%")} label={previousLabel} /></Figure>
        <Figure label="Best score" value={assessment.taken ? formatPercent(assessment.bestScore) : "—"} />
        <Figure label="Tests taken" value={formatNumber(assessment.taken)} sub={`${assessment.passed} passed · ${assessment.failed} failed`} />
        <Figure label="Missed" value={formatNumber(assessment.missed)} sub={assessment.missed ? "Ended without an attempt" : "None missed"} />
      </Card>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <CardTitle title="Score trend" hint="Each test you took, in order" />
          {assessment.tests.length ? <Chart option={trend} height={230} label="Test scores over time" /> : <Empty icon={ClipboardCheck} title="No tests taken in this period." />}
        </Card>
        <Card className="p-4">
          <CardTitle title="Results" />
          {assessment.taken + assessment.missed ? <Chart option={outcome} height={190} label="Passed, failed and missed tests" /> : <Empty title="Nothing to show yet." />}
          <div className="mt-1 flex justify-center gap-3 text-[11.5px] text-slate-600 dark:text-zinc-300">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Passed {assessment.passed}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />Failed {assessment.failed}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300" />Missed {assessment.missed}</span>
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <CardTitle title="Your tests" />
          {assessment.tests.length ? (
            <ul className="divide-y divide-[#f1f2f4] dark:divide-white/[0.05]">
              {assessment.tests.slice(0, 8).map((test) => (
                <li key={test.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-zinc-200">{test.title}</span>
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">{fullDate(test.at)} · {test.score}/{test.maxMarks}</span>
                  </span>
                  <Pill className={test.passed ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300"}>{formatPercent(test.percent)}</Pill>
                </li>
              ))}
            </ul>
          ) : <Empty title="No tests in this period." />}
          {assessment.missedTests.length > 0 && <p className="mt-2 text-[11.5px] text-slate-500 dark:text-zinc-400">Missed: {assessment.missedTests.join(", ")}</p>}
        </Card>
        <Card className="p-4">
          <CardTitle title="Coming up" right={<CalendarClock className="h-4 w-4 text-slate-400" aria-hidden="true" />} />
          {assessment.upcoming.length ? (
            <ul className="space-y-2">
              {assessment.upcoming.map((test) => (
                <li key={test.id}>
                  <Link to="/student/assessments" className={`block rounded-xl border border-[#eef0f3] px-3 py-2 hover:border-sky-200 hover:bg-sky-50/50 dark:border-white/[0.06] dark:hover:border-sky-400/30 ${focusRing}`}>
                    <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-200">{test.title}</span>
                    <span className={`text-[11px] ${test.live ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"}`}>{test.live ? `Live now · until ${shortDate(test.endTime)}` : `Starts ${fullDate(test.startTime)}`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty title="No upcoming tests." />}
        </Card>
      </div>
    </Section>
  );
}

export function InterviewSection({ interview, previousLabel }) {
  const { mock, ai } = interview;
  const radar = useCallback((theme) => ratingsRadarOption(mock?.ratings || [], theme), [mock?.ratings]);
  const trend = useCallback((theme) => mockTrendOption(mock?.mocks || [], theme), [mock?.mocks]);
  const rated = mock?.ratings?.some((rating) => rating.value > 0);
  return (
    <Section id="interviews" icon={Mic} title="Interviews" subtitle={[mock && `${mock.done} mock`, ai && `${ai.completed} AI`].filter(Boolean).join(" · ") + " in this period"}
      actions={<>{mock && <Link to="/student/interview" className={linkClass}>Mock interviews<ArrowRight className="h-3.5 w-3.5" /></Link>}{ai && <Link to="/student/ai-interviews" className={linkClass}>AI interviews<ArrowRight className="h-3.5 w-3.5" /></Link>}</>}>
      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        {mock && <Figure label="Mock interviews" value={formatNumber(mock.done)} sub={`${mock.given} given · ${mock.scheduled} scheduled`}><Delta kpi={compare(mock.done, interview.previous?.mockDone)} label={previousLabel} /></Figure>}
        {mock && <Figure label="Average mock score" value={mock.done ? formatPercent(mock.score) : "—"} sub={mock.done ? `Best ${formatPercent(mock.best)}` : ""} />}
        {ai && <Figure label="AI interviews done" value={formatNumber(ai.completed)} sub={`${ai.started} started`}><Delta kpi={compare(ai.completed, interview.previous?.aiCompleted)} label={previousLabel} /></Figure>}
        {ai && <Figure label="AI completion" value={ai.started ? formatPercent(Math.round((ai.completed / ai.started) * 100)) : "—"} />}
      </Card>
      {mock && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <CardTitle title="Interviewer ratings" hint="Average of 1–5 on each skill" />
            {rated ? <Chart option={radar} height={260} label="Interviewer ratings by skill" /> : <Empty icon={Mic} title="No rated mock interviews in this period." />}
          </Card>
          <Card className="p-4">
            <CardTitle title="Mock interview scores" hint="Latest 10" />
            {mock.mocks.length ? <Chart option={trend} height={260} label="Mock interview scores" /> : <Empty icon={Mic} title="No mock interviews in this period." action={<Link to="/student/interview" className={`text-[12.5px] font-semibold text-sky-700 dark:text-sky-300 ${focusRing}`}>Book one</Link>} />}
          </Card>
        </div>
      )}
      {ai && !mock && !ai.started && <Card><Empty icon={Bot} title="No AI interviews in this period." action={<Link to="/student/ai-interviews" className={`text-[12.5px] font-semibold text-sky-700 dark:text-sky-300 ${focusRing}`}>Start one</Link>} /></Card>}
    </Section>
  );
}
