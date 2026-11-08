import { useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { DIFFICULTY_COLORS, growthOption } from "../insightCharts";
import { formatNumber, KPI_SECTION, preparationLevel, sectionPath, TOPIC_STATES } from "../insightModel";
import { CountUp, Reveal, RevealItem } from "./motion";
import { Card, Chart, Delta, focusRing, ProgressBar } from "./ui";

function Ring({ percent, size = 148, stroke = 12 }) {
  const reduce = useReducedMotion();
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(100, percent || 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id="prep-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100 dark:stroke-white/[0.06]" />
      <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} stroke="url(#prep-ring)" strokeLinecap="round"
        initial={reduce ? false : { strokeDasharray: `0 ${length}` }} animate={{ strokeDasharray: `${(shown / 100) * length} ${length}` }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} />
    </svg>
  );
}

/** Preparation estimate: share of the strong target met across the core topics, with its growth. */
export function PreparationCard({ coverage, kpi, previousLabel, growth }) {
  const { preparation, totals } = coverage;
  const level = preparationLevel(preparation.percent);
  const sparkline = useCallback((theme) => growthOption(growth || [], theme, { compact: true }), [growth]);
  return (
    <Card className="group relative h-full overflow-hidden p-5 transition duration-300 hover:shadow-[0_18px_40px_-24px_rgba(2,132,199,0.45)]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-100/70 blur-3xl transition-transform duration-700 group-hover:scale-125 dark:bg-sky-500/10" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative mx-auto shrink-0 sm:mx-0">
          <Ring percent={preparation.percent} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-slate-950 dark:text-zinc-50"><CountUp value={Math.round(preparation.percent)} /><span className="text-[16px] text-slate-400">%</span></span>
            <span className={`mt-1 text-[11.5px] font-semibold ${level.tone}`}>{level.label}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-slate-950 dark:text-zinc-50">Preparation estimate</h2>
              <Delta kpi={kpi} label={previousLabel} />
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">Progress to “strong” across the {preparation.coreTopics} core topics</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {["strong", "building", "needsWork", "notStarted"].map((state) => (
              <Link key={state} to={sectionPath("topics")} state={{ topicState: state }} className={`rounded-xl border border-[#eef0f3] px-2 py-1.5 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50/60 dark:border-white/[0.06] dark:hover:border-sky-400/30 dark:hover:bg-sky-500/5 ${focusRing}`}>
                <span className="block text-[17px] font-semibold tabular-nums text-slate-950 dark:text-zinc-50">{preparation.states[state] || 0}</span>
                <span className="flex items-center gap-1 truncate text-[10.5px] font-medium text-slate-500 dark:text-zinc-400"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: TOPIC_STATES[state].color }} />{TOPIC_STATES[state].label}</span>
              </Link>
            ))}
          </div>
          {growth?.length > 1 && (
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Growth over the period</p>
              <Chart option={sparkline} height={54} label="Preparation estimate over time" />
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">Solved <b className="font-semibold text-slate-800 dark:text-zinc-200">{formatNumber(totals.solved)}</b> of {formatNumber(totals.questions)} PrepCoding questions</p>
            {["Easy", "Medium", "Hard"].map((difficulty) => (
              <div key={difficulty} className="flex items-center gap-2 text-[11px]">
                <span className="w-12 shrink-0 font-medium text-slate-600 dark:text-zinc-300">{difficulty}</span>
                <ProgressBar value={totals.byDifficulty[difficulty].solved} max={totals.byDifficulty[difficulty].total} color={DIFFICULTY_COLORS[difficulty]} label={`${difficulty} solved`} />
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-500 dark:text-zinc-400">{totals.byDifficulty[difficulty].solved}/{totals.byDifficulty[difficulty].total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function KpiTile({ kpi, previousLabel }) {
  const decimals = kpi.unit === "%" ? 1 : 0;
  return (
    <Link to={sectionPath(KPI_SECTION[kpi.section] || "overview")} className={`group ${focusRing} relative flex h-full min-h-[104px] flex-col justify-between overflow-hidden rounded-2xl border border-[#e9eaee] bg-white p-3.5 text-left transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_14px_30px_-18px_rgba(2,132,199,0.55)] dark:border-white/[0.07] dark:bg-[#232325] dark:hover:border-sky-400/30`}>
      <span className="pointer-events-none absolute inset-x-0 -bottom-10 h-16 bg-gradient-to-t from-sky-100/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-sky-500/10" aria-hidden="true" />
      <span className="relative flex items-center justify-between gap-2 text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">
        <span className="truncate">{kpi.label}</span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
      </span>
      <span className="relative mt-1 text-[24px] font-semibold leading-none tracking-[-0.03em] text-slate-950 dark:text-zinc-50">
        {kpi.value === null ? "—" : <CountUp value={kpi.value} decimals={decimals} suffix={kpi.unit === "%" ? "%" : ""} />}
      </span>
      <span className="relative mt-2 flex min-h-[20px] flex-wrap items-center gap-1.5">
        <Delta kpi={kpi} label={previousLabel} />
        {kpi.hint && <span className="truncate text-[11px] text-slate-400 dark:text-zinc-500">{kpi.hint}</span>}
      </span>
    </Link>
  );
}

export default function SummaryHero({ insights }) {
  const previousLabel = insights.range.previous?.label || "";
  const prepKpi = insights.headline.find((kpi) => kpi.key === "preparation");
  const tiles = insights.headline.filter((kpi) => kpi.key !== "preparation");
  return (
    <div className={`grid gap-3 ${insights.coverage ? "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" : ""}`}>
      {insights.coverage && <PreparationCard coverage={insights.coverage} kpi={prepKpi} previousLabel={previousLabel} growth={insights.sections.coding?.growth} />}
      <Reveal className={`grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 ${tiles.length > 5 ? "lg:grid-cols-4 xl:grid-cols-3" : ""}`}>
        {tiles.map((kpi) => <RevealItem key={kpi.key}><KpiTile kpi={kpi} previousLabel={previousLabel} /></RevealItem>)}
      </Reveal>
    </div>
  );
}
