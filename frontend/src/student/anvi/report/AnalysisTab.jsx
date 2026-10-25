import { Suspense, lazy } from "react";
import { CardHeader, Icon } from "./parts";
import { muted, reportCard, toneClasses } from "./styles";
import { BAND_TONES, PACE } from "./reportModel";

// The Analysis tab: radar charts of the success metrics (with the cohort average when there is one) and of
// the skills, the question-wise score chart (each bar opens that question), the speaking pace across
// questions and the filler-word breakdown. Recharts loads with the tab (AnalysisCharts.jsx).

const Charts = {
  RadarPlot: lazy(() => import("./AnalysisCharts.jsx").then((module) => ({ default: module.RadarPlot }))),
  PacePlot: lazy(() => import("./AnalysisCharts.jsx").then((module) => ({ default: module.PacePlot }))),
  FillerPlot: lazy(() => import("./AnalysisCharts.jsx").then((module) => ({ default: module.FillerPlot }))),
};

function ChartFallback({ height = "h-72" }) {
  return <div className={`${height} w-full animate-pulse rounded-xl bg-slate-100/80 motion-reduce:animate-none dark:bg-white/[0.04]`} aria-hidden="true" />;
}

function LegendItem({ color, dashed = false, children }) {
  return <li className="inline-flex items-center gap-1.5">
    <svg aria-hidden="true" width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? "4 3" : undefined} /></svg>
    {children}
  </li>;
}

function ChartCard({ id, icon, tone = "brand", title, hint, children, legend, footer, data }) {
  return <section className={`${reportCard} flex min-w-0 flex-col`} aria-labelledby={id} data-chart={data}>
    <CardHeader id={id} icon={icon} tone={tone} title={title} hint={hint} />
    {legend && <ul className={`-mt-2 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${muted}`} aria-label="Legend">{legend}</ul>}
    <div className="min-w-0 flex-1">{children}</div>
    {footer}
  </section>;
}

const BAND_ORDER = ["Excellent", "Good", "Fair", "Needs work"];

/** Overall + Q1..Qn as columns coloured by band; each column is a button that opens its question. */
function QuestionBars({ rows, cohort, onSelect }) {
  const ticks = [100, 75, 50, 25, 0];
  const width = { minWidth: `${rows.length * 2 + 2}rem` };
  return <div data-question-chart>
    <div className="overflow-x-auto pb-1">
      <div className="pl-8 pt-6" style={width}>
        <div className="relative h-52">
          {ticks.map((tick) => <div key={tick} className={`absolute inset-x-0 border-t ${tick ? "border-slate-100 dark:border-white/[0.06]" : "border-slate-300 dark:border-white/20"}`} style={{ bottom: `${tick}%` }} aria-hidden="true">
            <span className={`absolute -left-8 -top-[7px] w-6 text-right text-[10px] leading-none tabular-nums ${muted}`}>{tick}</span>
          </div>)}
          {cohort !== null && <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-orange-600/90 dark:border-orange-500/90" style={{ bottom: `${cohort}%` }} aria-hidden="true" />}
          <ol className="absolute inset-0 flex items-end gap-1.5 sm:gap-3" aria-label="Score by question">
            {rows.map((row) => {
              const overall = row.index < 0;
              return <li key={row.key} className={`relative flex h-full min-w-0 flex-1 justify-center ${overall ? "mr-2 border-r border-dashed border-slate-200 pr-2 dark:border-white/10 sm:mr-3 sm:pr-3" : ""}`}>
                <button type="button" onClick={() => !overall && onSelect(row.index)} disabled={overall} data-question-bar={overall ? "overall" : row.index + 1}
                  aria-label={overall ? `Overall ${row.percent}%${row.band ? `, ${row.band}` : ""}` : `${row.label}: ${row.percent}%${row.band ? `, ${row.band}` : ""}${row.status ? `, ${row.status}` : ""}. Open this question`}
                  title={overall ? undefined : row.question}
                  className="group relative flex h-full w-full max-w-[3rem] items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 enabled:cursor-pointer disabled:cursor-default dark:focus-visible:ring-offset-[#242424]">
                  <span className={`relative w-full rounded-t-[4px] transition-[filter] group-enabled:group-hover:brightness-110 ${toneClasses(row.tone).bar}`} style={{ height: `${Math.max(row.percent, 1.5)}%` }} aria-hidden="true">
                    <span className="absolute -top-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-1 text-[11px] font-semibold tabular-nums text-slate-800 dark:bg-[#242424]/90 dark:text-zinc-100">{row.percent}%</span>
                  </span>
                </button>
              </li>;
            })}
          </ol>
        </div>
        <ol className="mt-2 flex gap-1.5 sm:gap-3" aria-hidden="true">
          {rows.map((row) => <li key={row.key} className={`flex-1 whitespace-nowrap text-center text-[10px] font-semibold sm:text-[11px] ${row.index < 0 ? "mr-2 pr-2 text-slate-900 dark:text-zinc-50 sm:mr-3 sm:pr-3" : `truncate ${muted}`}`}>{row.label}</li>)}
        </ol>
      </div>
    </div>
  </div>;
}

export function AnalysisTab({ model, onSelectQuestion }) {
  const { analysis } = model;
  const { dimensionRadar, skillRadar, questions, pace, fillers } = analysis;
  const any = dimensionRadar || skillRadar || questions.length || pace.length || fillers;
  if (!any) return <p className={`${reportCard} text-sm ${muted}`}>There is not enough scored data in this attempt to chart.</p>;
  const radars = [dimensionRadar, skillRadar].filter(Boolean).length;
  const bands = BAND_ORDER.filter((band) => questions.some((row) => row.band === band));
  const paceOff = pace.filter((row) => row.pace?.key !== "good");
  return <div className="space-y-4" data-tab-analysis>
    {radars > 0 && <div className={`grid gap-4 ${radars === 2 ? "md:grid-cols-2" : ""}`}>
      {dimensionRadar && <ChartCard id="anvi-analysis-dimensions" data="dimensions" icon="radar" title="Success metrics" hint="Your five metrics on one chart, judged from the transcript."
        legend={<><LegendItem color="#0284c7">Your score</LegendItem>{dimensionRadar.cohort && <LegendItem color="#ea580c" dashed>Cohort average · {dimensionRadar.cohortCount} students</LegendItem>}</>}>
        <Suspense fallback={<ChartFallback />}><Charts.RadarPlot rows={dimensionRadar.rows} cohort={dimensionRadar.cohort}
          label={`Success metrics: ${dimensionRadar.rows.map((row) => `${row.label} ${row.you}%${row.cohort !== null && dimensionRadar.cohort ? ` (cohort ${row.cohort}%)` : ""}`).join(", ")}`} /></Suspense>
      </ChartCard>}
      {skillRadar && <ChartCard id="anvi-analysis-skills" data="skills" icon={skillRadar.title === "Skills" ? "star" : "target"} tone={skillRadar.title === "Skills" ? "caution" : "brand"} title={skillRadar.title} hint={skillRadar.title === "Skills" ? "Your rating on each skill the interview covered." : "How well the answers covered each competency."}>
        <Suspense fallback={<ChartFallback />}><Charts.RadarPlot rows={skillRadar.rows} label={`${skillRadar.title}: ${skillRadar.rows.map((row) => `${row.label} ${row.you}%`).join(", ")}`} /></Suspense>
      </ChartCard>}
    </div>}
    {questions.length > 0 && <ChartCard id="anvi-analysis-questions" data="questions" icon="barChart" title="Question-wise scores" hint="Select a bar to open that question's feedback."
      legend={<>
        {bands.map((band) => <li key={band} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${toneClasses(BAND_TONES[band]).bar}`} />{band}</li>)}
        {analysis.cohortPercent !== null && <LegendItem color="#ea580c" dashed>Cohort average {analysis.cohortPercent}%</LegendItem>}
      </>}>
      <QuestionBars rows={questions} cohort={analysis.cohortPercent} onSelect={onSelectQuestion} />
    </ChartCard>}
    {(pace.length > 0 || fillers) && <div className={`grid gap-4 ${pace.length > 0 && fillers ? "md:grid-cols-2" : ""}`}>
      {pace.length > 0 && <ChartCard id="anvi-analysis-pace" data="pace" icon="gauge" title="Speaking pace" hint={`Words a minute per answer. The shaded band (${PACE.min}–${PACE.max}) is a clear pace.`}
        legend={<><LegendItem color="#0284c7">Your pace</LegendItem><li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-emerald-500/20 ring-1 ring-inset ring-emerald-500/30" />Good pace</li></>}
        footer={<p className={`mt-3 text-xs ${muted}`} data-pace-summary>{paceOff.length
          ? `${paceOff.map((row) => `${row.label} ${row.pace.key === "slow" ? "slow" : "fast"} (${row.wpm})`).join(" · ")}`
          : "Every measured answer was at a clear pace."}</p>}>
        <Suspense fallback={<ChartFallback height="h-60" />}><Charts.PacePlot rows={pace} onSelect={onSelectQuestion} /></Suspense>
      </ChartCard>}
      {fillers && <ChartCard id="anvi-analysis-fillers" data="fillers" icon="messageCircle" title="Filler words" hint="Words such as um, uh, like and basically, counted in each answer."
        footer={<dl className="mt-3 grid grid-cols-2 gap-3" data-filler-summary>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.03]"><dt className={`text-[11px] ${muted}`}>In total</dt><dd className="text-base font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{fillers.total}</dd></div>
          {fillers.perHundred !== null && <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.03]"><dt className={`text-[11px] ${muted}`}>Per 100 words</dt><dd className="text-base font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{fillers.perHundred}</dd></div>}
        </dl>}>
        <Suspense fallback={<ChartFallback height="h-60" />}><Charts.FillerPlot rows={fillers.rows} onSelect={onSelectQuestion} /></Suspense>
      </ChartCard>}
    </div>}
    <p className={`flex items-start gap-1.5 px-1 text-xs ${muted}`}><Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0" />Charts use the stored evaluation and the measured pace and filler counts of each answer.</p>
  </div>;
}
