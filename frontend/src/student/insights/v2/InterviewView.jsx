// Prep Interview tab: interviews with peers and with ANVI in the period, interviewer ratings per
// skill (weakest marked) and the score line of recent peer interviews. From sections.interview.
import { Bot, LineChart, MessagesSquare, Star } from "lucide-react";
import { formatNumber, formatPercent } from "../insightModel";
import { Reveal, RevealItem } from "../components/motion";
import { RatingBars, ScoreLine } from "./charts";
import { ActionLink, GlassChip, GradientCard, GradientHeader, HeroNumber, muted, Panel, StartState, surface, Tile } from "./parts";

export default function InterviewView({ insights }) {
  const interview = insights.sections.interview;
  const { mock, ai } = interview;
  const done = (mock?.done || 0) + (ai?.completed || 0);
  const previousDone = interview.previous ? (mock ? interview.previous.mockDone || 0 : 0) + (ai ? interview.previous.aiCompleted || 0 : 0) : null;
  const change = previousDone === null ? null : done - previousDone;
  return (
    <Reveal className="space-y-6" stagger={0.06}>
      <RevealItem>
        <GradientCard tone="violet" className="p-6" data-guide="an-interviews">
          <div className="flex flex-wrap items-end gap-6">
            <div className="min-w-0 flex-[1_1_300px]">
              <GradientHeader icon={MessagesSquare} title="Interviews done" subtitle="With peers and with ANVI" />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <HeroNumber value={done} className="text-[60px]" />
                {change !== null ? <GlassChip tone={change > 0 ? "up" : change < 0 ? "down" : "plain"} className="mb-2">{change > 0 ? `▲ +${change}` : change < 0 ? `▼ ${change}` : "Same as before"} vs previous</GlassChip> : null}
              </div>
              <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-white/90">Each interview builds confidence. Practise with ANVI any time; book a peer for real feedback on each skill.</p>
            </div>
            <div className="grid flex-[0_1_420px] grid-cols-2 gap-2.5 sm:grid-cols-4">
              {mock && <Tile glass label="With peers">{formatNumber(mock.done)}</Tile>}
              {mock && <Tile glass label="Avg score">{mock.done ? formatPercent(mock.score) : "—"}</Tile>}
              {ai && <Tile glass label="With ANVI">{formatNumber(ai.completed)}</Tile>}
              {ai && <Tile glass label="ANVI started">{formatNumber(ai.started)}</Tile>}
            </div>
          </div>
        </GradientCard>
      </RevealItem>

      {!done ? (
        <RevealItem><div className={surface}><StartState icon={Bot} title="No interview in this period" text="Practise an interview with ANVI or book one with a peer. Your scores and feedback show here." to={ai ? "/student/ai-interviews" : "/student/interview"} label="Start an interview" /></div></RevealItem>
      ) : null}

      {mock ? (
        <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel id="mock-scores" icon={LineChart} tone="violet" title="Peer interview scores" insight={mock.mocks?.length ? `Your best is ${formatPercent(mock.best)}. Point at a dot for its date.` : "No peer interviews in this period."}
            actions={<ActionLink to="/student/interview" tone="soft">Book an interview</ActionLink>}>
            <ScoreLine points={[...(mock.mocks || [])].sort((a, b) => new Date(a.at) - new Date(b.at)).map((item, index) => ({ label: `Interview ${index + 1}`, value: Math.round(Number(item.score) || 0), at: item.at }))} />
          </Panel>
          <Panel id="ratings" icon={Star} tone="amber" title="Interviewer ratings" insight="Average of 1–5 on each skill. Start with the one marked.">
            <RatingBars ratings={mock.ratings || []} />
          </Panel>
        </RevealItem>
      ) : null}

      {ai && !mock ? (
        <RevealItem><p className={`text-[13px] ${muted}`}>ANVI interviews give a report after each attempt. Open AI interviews to see them.</p></RevealItem>
      ) : null}
    </Reveal>
  );
}
