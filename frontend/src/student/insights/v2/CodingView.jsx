// Prep Coding tab: solved and accuracy (with Easy/Medium/Hard rings against the library), daily
// practice, how submissions ended, a topic galaxy (click a topic for its details), problems to
// finish, when you practise, languages, recent solves, then the full topic list.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarClock, Code2, Languages, ListRestart, Orbit, PieChart, Sparkles } from "lucide-react";
import { formatNumber, formatPercent, hourLabel, LANGUAGE_NAMES, shortDate } from "../insightModel";
import { Reveal, RevealItem } from "../components/motion";
import { TopicsPage } from "../pages/FeaturePages";
import { BubblePack, DifficultyDonut, OutcomeBar, PracticeChart, PunchCard } from "./charts";
import { ActionLink, GlassChip, GradientCard, GradientHeader, HeroNumber, muted, Panel, SectionHeader, StartState, surface, Tile, focusRing } from "./parts";

const LEVEL_STYLE = { Easy: ["text-emerald-600 dark:text-emerald-400", "bg-emerald-500"], Medium: ["text-amber-600 dark:text-amber-400", "bg-amber-500"], Hard: ["text-rose-600 dark:text-rose-400", "bg-rose-500"] };

function levelTotals(insights) {
  const coding = insights.sections.coding;
  const totals = insights.coverage?.totals?.byDifficulty || {};
  return Object.fromEntries(["Easy", "Medium", "Hard"].map((level) => {
    const entry = totals[level];
    const total = typeof entry === "object" ? Number(entry?.total) || 0 : Number(entry) || 0;
    const solved = typeof entry === "object" && entry?.solved !== undefined ? Number(entry.solved) || 0 : Number(coding.solved[level]) || 0;
    return [level, { solved, total: Math.max(total, solved) }];
  }));
}

export default function CodingView({ insights, onOpenTopic }) {
  const coding = insights.sections.coding;
  const levels = useMemo(() => levelTotals(insights), [insights]);
  const topics = useMemo(() => (insights.coverage?.topics || []).filter((topic) => topic.solved > 0)
    .map((topic) => ({ key: topic.key, label: topic.name, value: topic.solved, display: `${topic.solved} solved`, state: topic.state })), [insights.coverage]);
  const languages = coding.breakdown?.languages || [];
  const maxLanguage = Math.max(1, ...languages.map((language) => language.submissions));
  const previous = coding.previous;
  const solvedChange = previous ? coding.solved.total - previous.solved : null;
  const rhythm = coding.rhythm;

  return (
    <Reveal className="space-y-6" stagger={0.06}>
      <RevealItem>
        <GradientCard tone="ink" className="p-6" data-guide="an-coding">
          <div className="flex flex-wrap items-center gap-8">
            <div className="min-w-0 flex-[1_1_320px]">
              <GradientHeader icon={Code2} title="Prep Coding" subtitle="Problems accepted in this period" />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <HeroNumber value={coding.solved.total} className="text-[60px]" />
                {solvedChange !== null ? <GlassChip tone={solvedChange > 0 ? "up" : solvedChange < 0 ? "down" : "plain"} className="mb-2">{solvedChange > 0 ? `▲ +${solvedChange}` : solvedChange < 0 ? `▼ ${solvedChange}` : "Same as before"} vs previous</GlassChip> : null}
              </div>
              <div className="mt-5 grid max-w-xl grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Tile glass label="Accuracy">{formatPercent(coding.accuracy)}</Tile>
                <Tile glass label="Submissions">{formatNumber(coding.submissions)}</Tile>
                <Tile glass label="Tried">{formatNumber(coding.attempted)}</Tile>
                <Tile glass label="Days practised">{formatNumber(coding.activeDays)}</Tile>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <DifficultyDonut levels={levels} light />
              <ul className="space-y-2.5">
                {["Easy", "Medium", "Hard"].map((level) => (
                  <li key={level} className="flex items-center gap-2.5">
                    <span className={`h-3 w-3 rounded-full ${LEVEL_STYLE[level][1]}`} aria-hidden="true" />
                    <span className="w-16 text-[13px] font-semibold">{level}</span>
                    <span className="text-[15px] font-bold tabular-nums">{levels[level].solved}</span>
                    <span className="text-[12px] text-white/60 tabular-nums">/ {formatNumber(levels[level].total)}</span>
                  </li>
                ))}
                <li className="pt-1 text-[11.5px] text-white/60">Solved, out of every problem in the library</li>
              </ul>
            </div>
          </div>
        </GradientCard>
      </RevealItem>

      {coding.submissions === 0 ? (
        <RevealItem><div className={surface}><StartState icon={Code2} title="No coding submissions in this period" text="Pick a longer period, or solve an easy problem to get started." to="/problems?difficulty=Easy" label="Solve an easy problem" /></div></RevealItem>
      ) : (
        <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel id="practice" icon={Activity} tone="sky" title="Daily practice" insight="Bars are submissions; the green line is accepted answers. Point at a day for its numbers.">
            <PracticeChart daily={coding.daily} />
          </Panel>
          <Panel id="outcomes" icon={PieChart} tone="rose" title="How your submissions ended" insight={`${formatPercent(coding.accuracy)} were accepted. The rest show where to slow down and check.`}>
            <OutcomeBar verdicts={coding.verdicts} />
          </Panel>
        </RevealItem>
      )}

      <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel id="galaxy" icon={Orbit} tone="teal" title="Your topic galaxy" insight="Bigger bubbles: more solved. Green is strong, blue building, red needs work. Tap a topic for its details.">
          <BubblePack items={topics} byState onPick={onOpenTopic ? (circle) => onOpenTopic(circle.key) : undefined} height={300} />
          <div className="mt-3 flex flex-wrap gap-3 text-[12px]">
            {[["Strong", "bg-emerald-500"], ["Building", "bg-sky-500"], ["Needs work", "bg-rose-500"]].map(([label, color]) => <span key={label} className={`inline-flex items-center gap-1.5 ${muted}`}><span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden="true" />{label}</span>)}
          </div>
        </Panel>
        <div className="flex min-w-0 flex-col gap-5">
        <Panel id="retry" guide="an-retry" icon={ListRestart} tone="amber" title="Finish these" insight={coding.retry.count ? `${coding.retry.count} problem${coding.retry.count === 1 ? "" : "s"} you tried but have not solved yet.` : "Nothing half-done. Nice."}>
          {coding.retry.items.length ? (
            <ul className="space-y-1.5">
              {coding.retry.items.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <Link to={item.to} className={`group flex items-center gap-3 rounded-xl border border-[#eef0f3] px-3 py-2.5 transition hover:border-sky-200 hover:bg-sky-50/50 dark:border-white/[0.06] dark:hover:bg-sky-500/[0.06] ${focusRing}`}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLE[item.difficulty]?.[1] || "bg-slate-400"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800 group-hover:text-sky-700 dark:text-zinc-200 dark:group-hover:text-sky-300">{item.title}</span>
                    <span className={`shrink-0 text-[11.5px] ${muted}`}>{shortDate(item.lastAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <ActionLink to="/problems" tone="soft">Find a new problem</ActionLink>}
        </Panel>
        {coding.recent?.length ? (
          <Panel id="recent" icon={Sparkles} tone="emerald" title="Recently solved" insight="Your latest accepted problems." className="flex-1">
            <ul className="flex flex-wrap gap-2">
              {coding.recent.slice(0, 8).map((item, index) => (
                <li key={item.id || index} className="min-w-0 max-w-full">
                  <Link to={item.to || "/problems"} className={`inline-flex max-w-full items-center gap-2 rounded-full border border-[#e9eaee] bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 ${focusRing}`}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLE[item.difficulty]?.[1] || "bg-slate-400"}`} aria-hidden="true" /><span className="truncate">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        </div>
      </RevealItem>

      <RevealItem className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {rhythm?.cells?.length ? (
          <Panel id="rhythm" icon={CalendarClock} tone="violet" title="When you practise" insight={`Most active around ${hourLabel(rhythm.busiestHour)}${rhythm.sharpestHour !== null && rhythm.sharpestHour !== undefined ? `; most accurate around ${hourLabel(rhythm.sharpestHour)}` : ""}. Bigger dots: more submissions.`}>
            <PunchCard cells={rhythm.cells} />
          </Panel>
        ) : <div className="hidden lg:block" />}
        <Panel id="languages" icon={Languages} tone="slate" title="Languages" insight={languages[0] ? `${LANGUAGE_NAMES[languages[0].language] || languages[0].language} is your main language.` : "No submissions yet."}>
          <ul className="space-y-3">
            {languages.slice(0, 6).map((language) => (
              <li key={language.language}>
                <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold text-slate-800 dark:text-zinc-200">{LANGUAGE_NAMES[language.language] || language.language}</span><span className={`tabular-nums ${muted}`}>{language.accepted} of {language.submissions} accepted</span></div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-sky-200 dark:bg-sky-500/30" style={{ width: `${(language.submissions / maxLanguage) * 100}%` }} />
                  <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-violet-500" style={{ width: `${(language.accepted / maxLanguage) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </RevealItem>

      {insights.coverage ? (
        <RevealItem>
          <section aria-labelledby="pa-all-topics">
            <SectionHeader id="pa-all-topics" title="All topics" />
            <TopicsPage insights={insights} onOpenTopic={onOpenTopic} topicsOnly />
          </section>
        </RevealItem>
      ) : null}
    </Reveal>
  );
}
