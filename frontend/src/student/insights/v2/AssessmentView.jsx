// Prep Assessment tab: average score, the score line with the pass mark, each test against the
// pass mark, coming tests and missed ones. From insights.sections.assessment.
import { Link } from "react-router-dom";
import { CalendarClock, ClipboardCheck, LineChart, ListOrdered } from "lucide-react";
import { formatNumber, formatPercent, fullDate, shortDate } from "../insightModel";
import { Reveal, RevealItem } from "../components/motion";
import { ScoreLine } from "./charts";
import { ActionLink, BulletBar, GlassChip, GradientCard, GradientHeader, HeroNumber, muted, Panel, StartState, surface, Tile, focusRing } from "./parts";

export default function AssessmentView({ insights }) {
  const assessment = insights.sections.assessment;
  const pass = Number(assessment.passPercent) || 40;
  const tests = assessment.tests || [];
  const previous = assessment.previous;
  const change = previous?.taken && assessment.taken ? (Number(assessment.averageScore) || 0) - (Number(previous.averageScore) || 0) : null;
  const ordered = [...tests].sort((a, b) => new Date(a.at) - new Date(b.at));
  return (
    <Reveal className="space-y-6" stagger={0.06}>
      <RevealItem>
        <GradientCard tone="violet" className="p-6" data-guide="an-tests">
          <div className="flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-[1_1_300px]">
              <GradientHeader icon={ClipboardCheck} title="Average test score" subtitle={`Pass mark ${pass}%`} />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                {assessment.taken ? <HeroNumber value={assessment.averageScore} decimals={1} suffix="%" className="text-[60px]" /> : <span className="text-[44px] font-bold leading-none">—</span>}
                {change !== null ? <GlassChip tone={change > 0 ? "up" : change < 0 ? "down" : "plain"} className="mb-2">{change > 0 ? "▲ +" : change < 0 ? "▼ " : ""}{change.toFixed(1)} pts vs previous</GlassChip> : null}
              </div>
              <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-white/90">{assessment.taken ? `You passed ${assessment.passed} of ${assessment.taken} test${assessment.taken === 1 ? "" : "s"} in this period.` : "No test taken in this period."}{assessment.missed ? ` ${assessment.missed} ended without an attempt.` : ""}</p>
            </div>
            <div className="grid flex-[0_1_420px] grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Tile glass label="Taken">{formatNumber(assessment.taken)}</Tile>
              <Tile glass label="Best">{assessment.taken ? formatPercent(assessment.bestScore) : "—"}</Tile>
              <Tile glass label="Passed">{formatNumber(assessment.passed)}</Tile>
              <Tile glass label="Missed">{formatNumber(assessment.missed)}</Tile>
            </div>
          </div>
        </GradientCard>
      </RevealItem>

      {!tests.length ? (
        <RevealItem><div className={surface}><StartState icon={ClipboardCheck} title="No tests in this period" text={assessment.upcoming?.[0] ? `Next: ${assessment.upcoming[0].title}.` : "Pick a longer period, or open your tests."} to="/student/assessments" label="Open tests" /></div></RevealItem>
      ) : (
        <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel id="test-trend" icon={LineChart} tone="violet" title="Score trend" insight="Each test you took, in order. Green dots passed; the dashed line is the pass mark.">
            <ScoreLine points={ordered.map((test) => ({ label: test.title, value: Math.round(Number(test.percent) || 0), at: test.at }))} target={pass} />
          </Panel>
          <Panel id="coming" icon={CalendarClock} tone="sky" title="Coming up" insight={assessment.upcoming?.length ? "Tests you can still take." : "No upcoming tests."}>
            {assessment.upcoming?.length ? (
              <ul className="space-y-2">
                {assessment.upcoming.map((test) => (
                  <li key={test.id}>
                    <Link to="/student/assessments" className={`block rounded-xl border border-[#eef0f3] px-3 py-2.5 transition hover:border-sky-200 hover:bg-sky-50/50 dark:border-white/[0.06] dark:hover:bg-sky-500/[0.06] ${focusRing}`}>
                      <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{test.title}</span>
                      <span className={`text-[12px] ${test.live ? "font-semibold text-emerald-700 dark:text-emerald-300" : muted}`}>{test.live ? `Live now · until ${shortDate(test.endTime)}` : `Starts ${fullDate(test.startTime)}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <ActionLink to="/student/assessments" tone="soft">Open tests</ActionLink>}
            {assessment.missedTests?.length ? <p className={`mt-3 text-[12px] ${muted}`}>Missed: {assessment.missedTests.join(", ")}</p> : null}
          </Panel>
        </RevealItem>
      )}

      {tests.length ? (
        <RevealItem>
          <Panel id="tests" icon={ListOrdered} tone="emerald" title="Each test against the pass mark" insight={`The dark line is ${pass}%.`} actions={<ActionLink to="/student/assessment-reports" tone="soft">Test reports</ActionLink>}>
            <ul className="space-y-4">
              {tests.slice(0, 10).map((test) => (
                <li key={test.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_64px] items-center gap-4">
                  <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">{test.title}</span><span className={`text-[12px] ${muted}`}>{fullDate(test.at)} · {test.score}/{test.maxMarks}</span></span>
                  <BulletBar value={test.percent} target={pass} gradient={test.passed ? "from-emerald-400 to-teal-600" : "from-rose-400 to-rose-600"} label={`${test.title} score`} />
                  <span className={`text-right text-[14px] font-bold tabular-nums ${test.passed ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{formatPercent(test.percent)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </RevealItem>
      ) : null}
    </Reveal>
  );
}
