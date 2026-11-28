// Prep Mock tab: company mock tests the student took in the period (sections.prepmock, built by the
// same profile builder as Prep Assessment). With none yet: a clear start button.
import { Briefcase, ListOrdered } from "lucide-react";
import { formatPercent } from "../insightModel";
import { Reveal, RevealItem } from "../components/motion";
import { ActionLink, BulletBar, GlassChip, GradientCard, GradientHeader, HeroNumber, muted, Panel, StartState, surface, Tile } from "./parts";

const PASS = 40;
const dateText = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

export default function MockView({ insights }) {
  const mock = insights.sections.prepmock || { taken: 0, tests: [] };
  const previous = mock.previous;
  if (!mock.taken) {
    return (
      <div className={surface} data-guide="an-mock">
        <StartState icon={Briefcase} title={mock.everTaken ? "No mock taken in this period" : "No Prep Mock taken yet"}
          text={mock.everTaken ? `You have taken ${mock.everTaken} mock${mock.everTaken === 1 ? "" : "s"} in all. Pick a longer period, or take another.` : "Prep Mock tests copy a company's real test for a role. Your score, time and every mock appear here."}
          to="/student/prep-mock" label="Take a mock" />
      </div>
    );
  }
  const change = previous?.taken ? (Number(mock.averageScore) || 0) - (Number(previous.averageScore) || 0) : null;
  const passMark = Number(mock.passPercent) || PASS;
  const tests = [...(mock.tests || [])].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  return (
    <Reveal className="space-y-6" stagger={0.06}>
      <RevealItem>
        <GradientCard tone="teal" className="p-6" data-guide="an-mock">
          <div className="flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-[1_1_300px]">
              <GradientHeader icon={Briefcase} title="Average Prep Mock score" subtitle="Company mock tests by role" />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <HeroNumber value={mock.averageScore} decimals={1} suffix="%" className="text-[60px]" />
                {change !== null ? <GlassChip tone={change > 0 ? "up" : change < 0 ? "down" : "plain"} className="mb-2">{change > 0 ? "▲ +" : change < 0 ? "▼ " : ""}{change.toFixed(1)} pts vs previous</GlassChip> : null}
              </div>
              <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-white/90">Each mock copies a company's test for a role. Aim to clear {passMark}% on every one, then raise your best.</p>
            </div>
            <div className="grid flex-[0_1_400px] grid-cols-3 gap-2.5">
              <Tile glass label="Mocks taken">{mock.taken}</Tile>
              <Tile glass label="Best">{formatPercent(mock.bestScore)}</Tile>
              <Tile glass label="Cleared">{mock.passed ?? 0}</Tile>
            </div>
          </div>
        </GradientCard>
      </RevealItem>
      <RevealItem>
        <Panel id="mock-list" icon={ListOrdered} tone="teal" title="Each mock against the pass mark" insight={`The dark line is ${passMark}%. Green bars cleared it; red ones did not yet.`} actions={<ActionLink to="/student/prep-mock" tone="sky">Take another mock</ActionLink>}>
          <ul className="space-y-4">
            {tests.map((test, index) => {
              const cleared = Number(test.percent) >= passMark;
              return (
                <li key={test.id || index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_64px] items-center gap-4">
                  <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">{test.title}</span><span className={`text-[12px] ${muted}`}>{dateText(test.at)}</span></span>
                  <BulletBar value={test.percent} target={passMark} gradient={cleared ? "from-emerald-400 to-teal-600" : "from-rose-400 to-rose-600"} label={`${test.title} score`} />
                  <span className={`text-right text-[14px] font-bold tabular-nums ${cleared ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{formatPercent(test.percent)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </RevealItem>
    </Reveal>
  );
}
