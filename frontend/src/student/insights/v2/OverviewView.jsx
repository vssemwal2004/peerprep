// Prep Analysis overview, in the Profile / Dashboard look: gradient hero cards (Prep Score, Prep
// Readiness, Prep Coins), today's status with the topic quota, what to do next, what moved the
// score and one card per feature (a start button when it has not been used yet).
import { Link } from "react-router-dom";
import { BarChart3, Bot, Briefcase, Check, Circle, ClipboardCheck, Code2, Coins, Compass, Gauge } from "lucide-react";
import ReadinessSummaryCard from "../../readiness/ReadinessSummaryCard";
import { GAIN_KINDS, LOSS_KINDS, POINT_KINDS, fillDays } from "../../prepScore/pointKinds";
import { coinFlow, durationText, msUntilIstMidnight, nextSteps, signedScore } from "../analysisModel";
import { formatNumber, formatPercent, sectionPath } from "../insightModel";
import { Reveal, RevealItem } from "../components/motion";
import { AreaTrend, DivergingBars } from "./charts";
import { ActionLink, GlassChip, GradientCard, GradientHeader, HeroNumber, muted, Panel, QuotaRing, SectionHeader, surface, glassButton, focusRing } from "./parts";

function TodayStrip({ score, coins, showScore }) {
  const today = score?.today;
  const earned = coins?.today || new Set();
  const loginDone = Boolean(today?.login || earned.has("earn_login"));
  const challengeDone = Boolean(today?.challenge || earned.has("earn_challenge"));
  const topics = (today?.topics || []).slice(0, 4);
  const items = [
    { done: loginDone, title: "Daily login", sub: loginDone ? "Counted today" : "Open PeerPrep once a day" },
    { done: challengeDone, title: "Daily challenge", sub: challengeDone ? "Done today" : "Not done yet", to: challengeDone ? null : "/problems" },
  ];
  return (
    <section aria-labelledby="pa-today" data-guide="an-today" className={`${surface} flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4`}>
      <div className="shrink-0">
        <h2 id="pa-today" className="text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-50">Today</h2>
        <p className={`text-[12px] tabular-nums ${muted}`}>Resets 12:00 AM IST · in {durationText(msUntilIstMidnight())}</p>
      </div>
      {items.map((item) => (
        <div key={item.title} className="flex min-w-[160px] items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.done ? "bg-emerald-500 text-white shadow-[0_6px_14px_-8px_rgba(16,185,129,0.9)]" : "bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-zinc-500"}`} aria-hidden="true">
            {item.done ? <Check className="h-4 w-4" strokeWidth={2.6} /> : <Circle className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">{item.title}</p>
            {item.to ? <Link to={item.to} className={`text-[12px] font-semibold text-sky-700 hover:underline dark:text-sky-300 ${focusRing}`}>{item.sub} · start</Link> : <p className={`text-[12px] ${muted}`}>{item.sub}</p>}
          </div>
        </div>
      ))}
      {showScore && today?.limit ? (
        <Link to={sectionPath("score")} className={`ml-auto flex items-center gap-3 rounded-xl bg-[#f6f7f9] px-3 py-2 transition hover:bg-sky-50 dark:bg-white/[0.04] dark:hover:bg-sky-500/10 ${focusRing}`} aria-label="Today's topic quota">
          {topics.length ? topics.map((topic) => (
            <span key={topic.key} className="flex flex-col items-center gap-0.5">
              <QuotaRing used={topic.used} limit={today.limit} size={40} id={`t-${topic.key}`} />
              <span className="max-w-[64px] truncate text-[11px] font-medium text-slate-600 dark:text-zinc-300">{topic.topic}</span>
            </span>
          )) : <span className="text-[12.5px] font-semibold text-slate-700 dark:text-zinc-200">Every topic open today</span>}
        </Link>
      ) : null}
    </section>
  );
}

function ScoreCard({ score }) {
  const history = score.data;
  const days = fillDays(history);
  const top = history ? [...GAIN_KINDS, ...LOSS_KINDS].map((kind) => [kind, Number(history.byKind?.[kind]) || 0]).filter(([, value]) => Math.abs(value) >= 0.005).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3) : [];
  return (
    <GradientCard tone="sky" className="h-full p-4" data-guide="an-tile-score">
      <GradientHeader icon={Gauge} title="Prep Score" subtitle="Grows with your practice" />
      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1.5">
        {history ? <HeroNumber value={history.total} decimals={2} /> : <span className="text-[14px] text-white/80">{score.loading ? "Loading…" : "Could not load"}</span>}
        {history ? <GlassChip tone={history.change > 0 ? "up" : history.change < 0 ? "down" : "plain"} className="mb-1">{history.change > 0 ? "▲" : history.change < 0 ? "▼" : ""} {signedScore(history.change)}</GlassChip> : null}
      </div>
      <AreaTrend values={days.map((day) => day.total)} light height="h-16 mt-3 flex-1 min-h-[56px]" />
      {top.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {top.map(([kind, value]) => { const Icon = POINT_KINDS[kind].Icon; return <li key={kind}><GlassChip tone={value < 0 ? "down" : "plain"}><Icon className="h-3 w-3" aria-hidden="true" />{POINT_KINDS[kind].short} {signedScore(value)}</GlassChip></li>; })}
        </ul>
      ) : null}
      <div className="mt-3 flex justify-end"><Link to={sectionPath("score")} className={glassButton}>How it was built</Link></div>
    </GradientCard>
  );
}

function CoinsCard({ wallet, flow }) {
  return (
    <GradientCard tone="gold" className="h-full p-4">
      <GradientHeader icon={Coins} title="Prep Coins" subtitle="Earned by showing up" />
      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1.5">
        {wallet.data ? <HeroNumber value={wallet.data.balance} /> : <span className="text-[14px] text-white/85">{wallet.loading ? "Loading…" : "Could not load"}</span>}
        {flow ? <GlassChip tone="plain" className="mb-1">+{flow.earnedIn} this month</GlassChip> : null}
      </div>
      {wallet.data?.earning ? (
        <div className="mt-4 space-y-1.5" aria-label="Coins you can still earn today">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-white/75">Today</p>
          {[["earn_login", "Daily login", wallet.data.earning.login], ["earn_challenge", "Daily challenge", wallet.data.earning.challenge]].filter(([, , amount]) => Number(amount) > 0).map(([kind, label, amount]) => {
            const done = flow?.today?.has(kind);
            return (
              <p key={kind} className="flex items-center justify-between rounded-lg bg-white/[0.1] px-2.5 py-1.5 text-[12.5px] ring-1 ring-inset ring-white/15">
                <span className="flex items-center gap-1.5">{done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />}{label}</span>
                <span className="font-semibold tabular-nums">{done ? "Earned" : `+${amount}`}</span>
              </p>
            );
          })}
        </div>
      ) : null}
      <div className="mt-auto pt-4">
        {flow?.sources?.length ? (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              {flow.sources.map((source, index) => <span key={source.label} style={{ width: `${(source.amount / Math.max(1, flow.earnedIn)) * 100}%`, opacity: 1 - index * 0.18 }} className="h-full bg-white" />)}
            </div>
            <p className="mt-2 truncate text-[11.5px] text-white/85">{flow.sources.slice(0, 3).map((source) => `${source.label} ${source.amount}`).join(" · ")}</p>
          </>
        ) : <p className="text-[11.5px] text-white/85">Earn coins from logins, daily challenges and badges.</p>}
        <div className="mt-3 flex justify-end"><Link to={sectionPath("coins")} className={glassButton}>Open coins</Link></div>
      </div>
    </GradientCard>
  );
}

const MINI_LEVELS = [["Easy", "bg-emerald-500"], ["Medium", "bg-amber-500"], ["Hard", "bg-rose-500"]];
const FEATURE_TILE = { coding: ["bg-slate-900 dark:bg-zinc-100 dark:text-zinc-900", Code2], assessment: ["bg-sky-600", ClipboardCheck], mock: ["bg-teal-600", Briefcase], interview: ["bg-violet-600", Bot] };

/** One feature card: icon tile, its count, a small visual and the next action. */
function FeatureCard({ card }) {
  const [tile, Icon] = FEATURE_TILE[card.id];
  return (
    <div className={`${surface} group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-22px_rgba(16,24,40,0.35)]`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] ${tile}`} aria-hidden="true"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
        {card.start ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">Not started</span> : null}
      </div>
      <div>
        <p className="text-[13px] font-semibold text-slate-600 dark:text-zinc-300">{card.name}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5"><span className="text-[30px] font-bold leading-tight tracking-[-0.03em] tabular-nums text-slate-950 dark:text-zinc-50">{card.value}</span><span className={`text-[13px] ${muted}`}>{card.unit}</span></p>
      </div>
      {card.levels ? (
        <div className="flex h-2 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]" aria-hidden="true">
          {MINI_LEVELS.map(([level, color]) => <span key={level} className={color} style={{ width: `${((card.levels[level] || 0) / Math.max(1, card.levels.total)) * 100}%` }} />)}
        </div>
      ) : card.bar !== undefined ? (
        <div className="h-2 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]" aria-hidden="true"><span className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500" style={{ width: `${Math.max(0, Math.min(100, card.bar))}%` }} /></div>
      ) : <div className="h-2" aria-hidden="true" />}
      <p className="text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">{card.detail}</p>
      <ActionLink to={card.to} tone={card.start ? "sky" : "soft"} className="mt-auto self-start">{card.label}</ActionLink>
    </div>
  );
}

function featureCards(insights, sections) {
  const has = (id) => sections.some((section) => section.id === id);
  const { coding, assessment, prepmock, interview } = insights.sections;
  const cards = [];
  if (has("coding") && coding) {
    cards.push(coding.solved.total ? { id: "coding", name: "Prep Coding", value: formatNumber(coding.solved.total), unit: "solved", levels: coding.solved, detail: `${formatPercent(coding.accuracy)} accuracy · ${coding.solved.Easy} Easy · ${coding.solved.Medium} Medium · ${coding.solved.Hard} Hard`, to: sectionPath("coding"), label: "See coding" }
      : { id: "coding", name: "Prep Coding", value: "0", unit: "solved", detail: "Solve your first problem to start your Prep Score.", to: "/problems", label: "Start solving", start: true });
  }
  if (has("assessment") && assessment) {
    cards.push(assessment.taken ? { id: "assessment", name: "Prep Assessment", value: formatNumber(assessment.taken), unit: assessment.taken === 1 ? "test" : "tests", bar: assessment.averageScore, detail: `Average ${formatPercent(assessment.averageScore)}${assessment.upcoming?.[0] ? ` · next: ${assessment.upcoming[0].title}` : ""}`, to: sectionPath("assessment"), label: "See tests" }
      : { id: "assessment", name: "Prep Assessment", value: "0", unit: "tests", detail: assessment.upcoming?.[0] ? `Next: ${assessment.upcoming[0].title}` : "No test taken in this period.", to: "/student/assessments", label: "Open tests", start: true });
  }
  if (has("mock")) {
    const mock = prepmock || { taken: 0 };
    cards.push(mock.taken ? { id: "mock", name: "Prep Mock", value: formatNumber(mock.taken), unit: mock.taken === 1 ? "mock" : "mocks", bar: mock.averageScore, detail: `Average ${formatPercent(mock.averageScore)} · best ${formatPercent(mock.bestScore)}`, to: sectionPath("mock"), label: "See mocks" }
      : { id: "mock", name: "Prep Mock", value: "0", unit: "mocks", detail: "Take a company mock test for the role you want.", to: "/student/prep-mock", label: "Take a mock", start: true });
  }
  if (has("interview") && interview) {
    const done = (interview.mock?.done || 0) + (interview.ai?.completed || 0);
    cards.push(done ? { id: "interview", name: "Prep Interview", value: formatNumber(done), unit: done === 1 ? "interview" : "interviews", detail: [interview.mock && `${interview.mock.done} with peers`, interview.ai && `${interview.ai.completed} with ANVI`].filter(Boolean).join(" · "), to: sectionPath("interview"), label: "See interviews" }
      : { id: "interview", name: "Prep Interview", value: "0", unit: "interviews", detail: "Practise an interview with ANVI or a peer.", to: interview.ai ? "/student/ai-interviews" : "/student/interview", label: "Start your first", start: true });
  }
  return cards;
}

export default function OverviewView({ insights, sections, score, readiness, wallet, features }) {
  const monthStart = (() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1).getTime(); })();
  const flow = wallet.data ? coinFlow(wallet.data.movements, { since: monthStart }) : null;
  const steps = nextSteps({ coach: insights.coach, today: score.data?.today });
  const cards = featureCards(insights, sections);
  const showReadiness = sections.some((section) => section.id === "readiness");
  const moves = [...GAIN_KINDS, ...LOSS_KINDS].map((kind) => ({ key: kind, label: POINT_KINDS[kind]?.label || kind, value: Number(score.data?.byKind?.[kind]) || 0 })).filter((row) => Math.abs(row.value) >= 0.005);
  const heroCols = [features.score, showReadiness, showReadiness, features.coins].filter(Boolean).length;
  return (
    <Reveal className="space-y-6" stagger={0.06}>
      <RevealItem><TodayStrip score={score.data} coins={flow} showScore={features.score} /></RevealItem>

      {heroCols ? (
        <RevealItem className={`grid gap-4 md:grid-cols-2 ${heroCols >= 4 ? "xl:grid-cols-4" : heroCols === 3 ? "xl:grid-cols-3" : ""}`} data-guide="an-summary">
          {features.score && <ScoreCard score={score} />}
          {showReadiness && (
            <div className="md:col-span-2 xl:col-span-2">
              <ReadinessSummaryCard summary={readiness.data} loading={readiness.loading} error={readiness.error} onRetry={readiness.reload} viewTo={sectionPath("readiness")} guide="an-readiness-card" className="rounded-2xl" />
            </div>
          )}
          {features.coins && <CoinsCard wallet={wallet} flow={flow} />}
        </RevealItem>
      ) : null}

      <RevealItem className={`grid gap-5 ${features.score ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
        <Panel id="next" guide="an-next" icon={Compass} tone="violet" title="Do next" insight="Picked from your quota, readiness and unfinished work. You do the work; nothing is written for you.">
          {steps.length ? (
            <ol className="space-y-2.5">
              {steps.map((step, index) => (
                <li key={step.id || index} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eef0f3] bg-[#fafbfc] p-3.5 transition hover:border-sky-200 hover:bg-sky-50/40 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-sky-500/[0.06]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-[13px] font-bold tabular-nums text-white shadow-[0_6px_14px_-8px_rgba(124,58,237,0.8)]">{index + 1}</span>
                  <div className="min-w-0 flex-[1_1_220px]">
                    <p className="text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">{step.title}</p>
                    {step.reason && <p className={`mt-0.5 text-[12.5px] leading-5 ${muted}`}>{step.reason}</p>}
                  </div>
                  {step.to ? <ActionLink to={step.to}>{step.label}</ActionLink> : null}
                </li>
              ))}
            </ol>
          ) : <p className={`text-[13px] ${muted}`}>You are on track. Keep your daily practice going.</p>}
        </Panel>
        {features.score && (
          <Panel id="moves" icon={BarChart3} tone="emerald" title="What moved your Prep Score" insight={score.data ? `${signedScore(score.data.change)} in this period · green added, red took away.` : ""}>
            {moves.length ? <DivergingBars rows={moves} /> : <p className={`text-[13px] ${muted}`}>Nothing changed your score in this period.</p>}
            <div className="mt-4"><ActionLink to={sectionPath("score")} tone="soft">Open Prep Score</ActionLink></div>
          </Panel>
        )}
      </RevealItem>

      {cards.length ? (
        <RevealItem>
          <section aria-labelledby="pa-features" data-guide="an-explore">
            <SectionHeader id="pa-features" title="Your features" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <FeatureCard key={card.id} card={card} />)}</div>
          </section>
        </RevealItem>
      ) : null}
    </Reveal>
  );
}
