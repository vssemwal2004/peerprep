// Prep Score tab: what the score is, today's topic quota, how it was built, how it moved, which
// topics earned it and every change behind it. All figures come from GET /auth/prep-score/history.
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpenCheck, Gauge, History, Layers3, Loader2, Shapes, Target, TrendingUp } from "lucide-react";
import { RulesList } from "../../prepScore/PrepScoreHistory";
import { fillDays } from "../../prepScore/pointKinds";
import { durationText, groupEvents, msUntilIstMidnight, signedScore, waterfallSteps } from "../analysisModel";
import { Reveal, RevealItem } from "../components/motion";
import { AreaTrend, BubblePack, ScoreTrend, Waterfall } from "./charts";
import { ActionLink, GlassChip, GradientCard, GradientHeader, HeroNumber, HowCounted, muted, Panel, QuotaRing, surface, Tile } from "./parts";

/** Re-renders every minute (the quota reset countdown). */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  return now;
}

export function QuotaBoard({ today }) {
  const now = useMinuteClock();
  const limit = today?.limit || 0;
  const topics = today?.topics || [];
  if (!limit) return <p className={`text-[13px] ${muted}`}>There is no daily topic limit right now: every solve counts.</p>;
  return (
    <div>
      {topics.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {topics.map((topic) => (
            <li key={topic.key} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${topic.full ? "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/60 dark:border-amber-400/25 dark:from-amber-400/[0.08] dark:to-transparent" : "border-[#e9eaee] bg-gradient-to-br from-white to-sky-50/60 dark:border-white/[0.07] dark:from-white/[0.02] dark:to-sky-500/[0.05]"}`}>
              <QuotaRing used={topic.used} limit={limit} id={`q-${topic.key}`} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-zinc-100">{topic.topic}</p>
                <p className={`text-[12px] font-semibold ${topic.full ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{topic.full ? "Full for today" : `${limit - topic.used} more will count`}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className={`text-[13px] ${muted}`}>No solves yet today, so every topic is open.</p>}
      <p className={`mt-3 flex flex-wrap items-center gap-2 text-[12px] ${muted}`}>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20">Every other topic: {limit} open</span>
        All topics reset at 12:00 AM IST · in {durationText(msUntilIstMidnight(now))}
      </p>
    </div>
  );
}

const TONE_DOT = { up: "bg-emerald-500 ring-emerald-100 dark:ring-emerald-500/20", down: "bg-rose-500 ring-rose-100 dark:ring-rose-500/20", flat: "bg-slate-300 ring-slate-100 dark:ring-white/10" };

/** Every change as a timeline, newest day first. */
function Ledger({ events = [], today }) {
  const groups = useMemo(() => groupEvents(events, today), [events, today]);
  const [limit, setLimit] = useState(3);
  if (!groups.length) return <p className={`text-[13px] ${muted}`}>No changes in this period.</p>;
  return (
    <div>
      {groups.slice(0, limit).map((group) => (
        <div key={group.day} className="mt-4 first:mt-0">
          <p className="mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-zinc-400"><span>{group.label}</span><span className={`tabular-nums ${group.net > 0 ? "text-emerald-700 dark:text-emerald-300" : group.net < 0 ? "text-rose-700 dark:text-rose-300" : ""}`}>{signedScore(group.net)}</span></p>
          <ol className="relative ml-1.5 border-l-2 border-[#eef0f3] dark:border-white/[0.07]">
            {group.items.map((item, index) => (
              <li key={`${item.kind}-${index}`} className="relative flex items-start gap-3 pb-3 pl-4 last:pb-0">
                <span className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-4 ${TONE_DOT[item.tone]}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-slate-900 dark:text-zinc-100">{item.title}</span>
                  {item.detail && <span className={`block text-[12px] ${muted}`}>{item.detail}</span>}
                </span>
                <span className={`shrink-0 text-[13px] font-bold tabular-nums ${item.tone === "up" ? "text-emerald-700 dark:text-emerald-300" : item.tone === "down" ? "text-rose-700 dark:text-rose-300" : muted}`}>{signedScore(item.delta)}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {groups.length > limit && <button type="button" onClick={() => setLimit((value) => value + 5)} className="mt-4 text-[13px] font-semibold text-sky-700 dark:text-sky-300">Show earlier days</button>}
    </div>
  );
}

export default function ScoreView({ score, periodText }) {
  const [topicView, setTopicView] = useState("bubbles");
  const history = score.data;
  const days = useMemo(() => fillDays(history), [history]);
  const steps = useMemo(() => waterfallSteps(history), [history]);
  const bubbles = useMemo(() => (history?.topics || []).filter((topic) => topic.points > 0).map((topic) => ({ key: topic.topic, label: topic.topic, value: topic.points, display: signedScore(topic.points) })), [history]);
  if (score.loading && !history) return <div className={`${surface} flex h-72 items-center justify-center`}><Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading your Prep Score" /></div>;
  if (!history) return <div className={`${surface} flex items-center gap-2 p-6 text-[13px] text-rose-700 dark:text-rose-300`}><AlertCircle className="h-4 w-4" />Your Prep Score could not be loaded. <button type="button" onClick={() => score.reload()} className="font-semibold underline">Try again</button></div>;
  const today = history.today || { limit: 0, topics: [] };
  const best = steps.filter((step) => step.kind === "gain").sort((a, b) => b.value - a.value)[0];
  const worst = steps.filter((step) => step.kind === "loss").sort((a, b) => a.value - b.value)[0];
  const builtInsight = best ? `${best.label} gave the most (${signedScore(best.value)})${worst ? `; ${worst.label.toLowerCase()} cost ${signedScore(worst.value).replace("−", "")}` : ""}.` : "Nothing changed your score in this period.";
  const maxTopic = Math.max(1, ...bubbles.map((item) => item.value));
  const full = (today.topics || []).filter((topic) => topic.full).length;

  return (
    <Reveal className="space-y-6" stagger={0.06}>
      <RevealItem>
        <GradientCard tone="sky" className="p-6" data-guide="an-score-hero">
          <div className="flex flex-wrap items-stretch gap-6">
            <div className="min-w-0 flex-[1_1_320px]">
              <GradientHeader icon={Gauge} title="Your Prep Score" subtitle={periodText ? `Change in ${periodText}` : "Grows with your practice"} />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <HeroNumber value={history.total} decimals={2} className="text-[60px]" />
                <GlassChip tone={history.change > 0 ? "up" : history.change < 0 ? "down" : "plain"} className="mb-2 text-[12.5px]">{history.change > 0 ? "▲" : history.change < 0 ? "▼" : ""} {signedScore(history.change)}</GlassChip>
              </div>
              <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-white/90">Every counted solve, daily challenge and login adds to it; wrong answers and days without practice take a little away. Early solves add more and later ones less, so it grows steadily.</p>
              <div className="mt-4 grid max-w-md grid-cols-3 gap-2.5">
                <Tile glass label="Today">{signedScore(today.net || 0)}</Tile>
                <Tile glass label="Solves today">{today.solves || 0}</Tile>
                <Tile glass label="Topics full">{full}</Tile>
              </div>
            </div>
            <div className="flex min-w-0 flex-[1_1_320px] flex-col justify-end">
              <AreaTrend values={days.map((day) => day.total)} light height="h-40" label={`Prep Score over ${periodText || "the period"}`} />
            </div>
          </div>
        </GradientCard>
      </RevealItem>

      <RevealItem>
        <Panel id="quota" guide="an-quota" icon={Target} tone="amber" title="Today's topic quota" insight={today.limit ? `Up to ${today.limit} solves per topic each day add to your score. You can keep practising a full topic; it just won't add score until tomorrow.` : ""}
          actions={<ActionLink to="/problems" tone="sky">Practise a topic</ActionLink>}>
          <QuotaBoard today={today} />
        </Panel>
      </RevealItem>

      <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel id="built" guide="an-score-built" icon={Layers3} tone="emerald" title="How your score was built" insight={builtInsight}>
          <Waterfall steps={steps} />
        </Panel>
        <Panel id="rules" icon={BookOpenCheck} tone="sky" title="How Prep Score works" insight="The current rules, set by PeerPrep.">
          <div className="text-[13px] leading-6 text-slate-700 dark:text-zinc-300"><RulesList rules={history.rules} /></div>
        </Panel>
      </RevealItem>

      <RevealItem>
        <Panel id="trend" icon={TrendingUp} tone="violet" title="Score over time" insight="The line is your score; the bars below are each day's gains (green) and losses (red). Point at a day to see why.">
          <ScoreTrend days={days} />
        </Panel>
      </RevealItem>

      <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel id="topics" icon={Shapes} tone="teal" title="Points by topic" insight={bubbles.length ? `${bubbles[0].label} earned you the most in this period.` : "Topics appear once your solves count."}
          actions={bubbles.length ? (
            <div role="radiogroup" aria-label="View" className="inline-flex rounded-xl bg-[#eef0f3] p-0.5 dark:bg-white/[0.06]">
              {[["bubbles", "Bubbles"], ["list", "List"]].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={topicView === id} onClick={() => setTopicView(id)}
                  className={`rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold ${topicView === id ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white" : muted}`}>{label}</button>
              ))}
            </div>
          ) : null}>
          {topicView === "bubbles" ? <BubblePack items={bubbles} /> : (
            <ul className="space-y-2.5">
              {bubbles.map((item, index) => (
                <li key={item.key} className="grid grid-cols-[22px_minmax(0,140px)_minmax(0,1fr)_56px] items-center gap-3 text-[13px]">
                  <span className={`text-[12px] font-bold tabular-nums ${muted}`}>{index + 1}</span>
                  <span className="truncate text-slate-800 dark:text-zinc-200">{item.label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]"><span className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500" style={{ width: `${(item.value / maxTopic) * 100}%` }} /></span>
                  <span className="text-right font-bold tabular-nums text-slate-900 dark:text-zinc-100">{item.display}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel id="ledger" guide="an-score-ledger" icon={History} tone="slate" title="Why it changed" insight="Every change, newest first.">
          <Ledger events={history.events || []} today={history.to} />
        </Panel>
      </RevealItem>

      <RevealItem>
        <div className={`${surface} p-5`}>
          <HowCounted title="Why can my score go down?">
            A wrong answer takes off a little, but you get it back if you solve that problem the same day. After a few days with no submission (a login alone does not count), a small amount comes off each day, capped each month. Losses never take away more than a part of what your solves earned.
          </HowCounted>
        </div>
      </RevealItem>
    </Reveal>
  );
}
