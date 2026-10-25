import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { BandChip, Bullets, CardHeader, Chip, Icon, IconTile, MetaItem, Meter, MeterList, Stars } from "./parts";
import { body, eyebrow, focusRing, muted, reportCard, toneClasses } from "./styles";
import { KpiGrid } from "./ReportHeader";
import { WarmupTranscript } from "./ReportSections";

// The Summary tab: overall narrative with the functional / non-functional split, key figures, the five
// success metrics (expandable), skills with stars, score breakdowns, strengths and areas to improve, and
// the integrity & setup card. Every block is left out when its data is missing (older attempts).

function SplitPill({ label, caption, value, cohort, testId }) {
  if (value === null || value === undefined) return null;
  const tone = value >= 85 ? "positive" : value >= 70 ? "brand" : value >= 50 ? "caution" : "critical";
  return <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]" data-split={testId}>
    <p className={eyebrow}>{label}</p>
    <p className="mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-slate-900 dark:text-zinc-50">{value}<span className="text-base font-medium text-slate-400 dark:text-zinc-500">%</span></p>
    <Meter percent={value} tone={tone} compare={cohort} className="mt-3" />
    <p className={`mt-2 text-xs leading-5 ${muted}`}>{caption}{cohort !== null && cohort !== undefined ? <span className="block tabular-nums">Cohort average {cohort}%</span> : null}</p>
  </div>;
}

function OverallPerformance({ model }) {
  // Older attempts have no narrative or split; the header's one-line summary already covers them.
  const { split } = model;
  if (!model.narrative && !split) return null;
  const text = model.narrative || model.score?.summary || "";
  return <section className={reportCard} aria-labelledby="anvi-summary-overall" data-report-overall>
    <div className={`grid gap-6 ${split ? "md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]" : ""}`}>
      <div className="min-w-0">
        <CardHeader id="anvi-summary-overall" icon="sparkles" title="Overall performance" hint={model.narrative ? `ANVI's summary of this interview, from ${model.audience === "student" ? "your" : "the"} transcript.` : "What was evaluated in this attempt."} />
        {text && <p className={`text-[15px] leading-7 ${body}`} data-report-narrative>{text}</p>}
      </div>
      {split && <div className="grid grid-cols-1 gap-3 self-start sm:grid-cols-2 md:grid-cols-1" data-report-split>
        <SplitPill testId="functional" label="Functional" caption="Technical correctness of the answers." value={split.functional} cohort={split.cohortFunctional} />
        <SplitPill testId="nonFunctional" label="Non-functional" caption="Articulation, fluency, confidence and professionalism." value={split.nonFunctional} cohort={split.cohortNonFunctional} />
      </div>}
    </div>
  </section>;
}

function NoteList({ title, icon, tone, items, empty }) {
  return <div className="min-w-0">
    <p className={`flex items-center gap-1.5 text-xs font-semibold ${toneClasses(tone).text}`}><Icon name={icon} className="h-3.5 w-3.5" />{title}</p>
    {items.length ? <ul className="mt-2 space-y-2">
      {items.map((entry) => <li key={`${entry.question}-${entry.text}`} className={`flex gap-2 text-sm leading-6 ${body}`}>
        <span aria-hidden="true" className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${toneClasses(tone).bar}`} />
        <span className="min-w-0">{entry.text}{entry.question && <span className={`ml-1.5 rounded bg-slate-100 px-1.5 py-px text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-white/[0.08] dark:text-zinc-300`}>{entry.question}</span>}</span>
      </li>)}
    </ul> : <p className={`mt-2 text-sm ${muted}`}>{empty}</p>}
  </div>;
}

function MetricRow({ metric, open, onToggle }) {
  const panelId = useId();
  return <li className="border-t border-slate-100 first:border-t-0 dark:border-white/[0.06]" data-metric={metric.key}>
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle}
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg sm:grid-cols-[auto_minmax(0,1fr)_auto] px-1 py-3.5 text-left transition hover:bg-slate-50/80 dark:hover:bg-white/[0.02] sm:gap-4 sm:px-2 ${focusRing}`}>
      <span className="hidden sm:block"><IconTile name={metric.icon} tone="brand" /></span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-slate-900 dark:text-zinc-50">{metric.label}</span>
          <BandChip band={metric.band} tone={metric.tone} />
        </span>
        <span className={`mt-0.5 block text-xs leading-5 ${muted}`}>{metric.definition}</span>
        <Meter percent={metric.percent} tone={metric.tone} compare={metric.cohort} className="mt-2.5" />
      </span>
      <span className="flex items-center gap-2 self-start pt-0.5 sm:self-center sm:pt-0">
        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{metric.percent}<span className={`text-xs font-medium ${muted}`}>%</span></span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </span>
    </button>
    <div id={panelId} hidden={!open} className="pb-4 pl-1 pr-1 sm:pl-[3.25rem]" data-metric-details>
      {open && <>
        <div className="grid gap-5 rounded-xl bg-slate-50 p-4 dark:bg-white/[0.03] sm:grid-cols-2">
          <NoteList title="What went well" icon="circleCheck" tone="positive" items={metric.wentWell} empty="Nothing specific was noted." />
          <NoteList title="Areas of improvement" icon="trendingUp" tone="caution" items={metric.improve} empty="Nothing specific was noted." />
        </div>
        {metric.facts.length > 0 && <ul className={`mt-3 space-y-1 text-xs tabular-nums ${muted}`}>{metric.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>}
        <p className={`mt-2 flex items-center gap-1.5 text-[11px] ${muted}`}><Icon name="info" className="h-3.5 w-3.5" />{metric.basis}{metric.cohort !== null ? ` · Cohort average ${metric.cohort}%` : ""}</p>
      </>}
    </div>
  </li>;
}

export function SuccessMetrics({ model }) {
  const [open, setOpen] = useState("");
  if (!model.metrics.length) return null;
  const cohort = model.metrics.some((metric) => metric.cohort !== null);
  return <section className={reportCard} aria-labelledby="anvi-summary-metrics" data-report-metrics>
    <CardHeader id="anvi-summary-metrics" icon="target" title="Success metrics" hint="Judged by ANVI from the transcript. Open a metric to see what went well and what to work on."
      aside={cohort ? <span className={`hidden shrink-0 items-center gap-1.5 text-[11px] sm:inline-flex ${muted}`}><span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-orange-600 dark:bg-orange-500" />Cohort average</span> : null} />
    <ul className="-mx-1 sm:-mx-2">
      {model.metrics.map((metric) => <MetricRow key={metric.key} metric={metric} open={open === metric.key} onToggle={() => setOpen(open === metric.key ? "" : metric.key)} />)}
    </ul>
  </section>;
}

export function SkillsCard({ skills }) {
  if (!skills.length) return null;
  return <section className={reportCard} aria-labelledby="anvi-summary-skills" data-report-skills>
    <CardHeader id="anvi-summary-skills" icon="star" tone="caution" title="Skills" hint="Rated from the answers on each skill (5 stars = 100%)." />
    <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
      {skills.map((skill) => <li key={skill.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0" data-skill>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-50">{skill.name}</p>
          {skill.note && <p className={`mt-0.5 text-xs leading-5 ${muted}`}>{skill.note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Stars value={skill.stars} label={`${skill.name}: ${skill.stars} out of 5 stars`} />
          <span className="w-9 text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{skill.percent}%</span>
        </div>
      </li>)}
    </ul>
  </section>;
}

function BarsCard({ id, icon, title, hint, rows, label }) {
  return <section className={reportCard} aria-labelledby={id}>
    <CardHeader id={id} icon={icon} title={title} hint={hint} />
    <MeterList rows={rows} label={label} />
  </section>;
}

const SETUP_ICONS = { terms: "fileText", resume: "fileText", language: "messageCircle" };

/** Setup facts and the proctoring outcome in one card; the full record opens in the Proctoring details drawer. */
function IntegrityAndSetup({ model, onProctoring }) {
  const { integrity } = model;
  if (!integrity && !model.setup.length && !model.warmup) return null;
  const violations = integrity?.violations ?? 0;
  return <div className="space-y-4">
    <section className={reportCard} aria-labelledby="anvi-summary-integrity" data-report-setup>
      <CardHeader id="anvi-summary-integrity" icon={integrity ? (violations ? "shieldAlert" : "shieldCheck") : "fileText"} tone={integrity && violations ? "caution" : integrity ? "brand" : "neutral"}
        title={integrity ? "Integrity & setup" : "Interview setup"}
        hint={integrity ? "Proctoring events are recorded for review and never change a score." : undefined}
        aside={integrity ? <button type="button" onClick={onProctoring} aria-haspopup="dialog" data-report-proctoring-open
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.08] ${focusRing}`}>
          Proctoring details<Icon name="chevronRight" className="h-3.5 w-3.5" />
        </button> : null} />
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {integrity && <MetaItem icon={violations ? "shieldAlert" : "shieldCheck"} tone={violations ? "caution" : undefined} label="Violations"
          value={`${violations}${integrity.maxViolations ? ` of ${integrity.maxViolations} allowed` : ""}`}
          detail={integrity.endedForViolations ? "The interview ended at the limit" : integrity.limitReached ? "Limit reached" : ""} />}
        {integrity?.ai && <MetaItem icon="scanEye" label="Camera checks" value={`${integrity.ai.total} detection${integrity.ai.total === 1 ? "" : "s"}`} detail="No video is recorded" />}
        {model.setup.map((row) => <MetaItem key={row.key} icon={SETUP_ICONS[row.key] || "info"} label={row.label} value={row.value} />)}
      </dl>
      {integrity?.endedForViolations && <p className="mt-4"><Chip tone="critical" icon="shieldAlert">Ended after reaching the violation limit</Chip></p>}
      {model.terms && <details className="group mt-5 text-sm">
        <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded font-semibold text-slate-600 dark:text-zinc-300 ${focusRing}`}>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />Terms shown before the interview
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 leading-6 text-slate-700 dark:bg-white/[0.04] dark:text-zinc-200">{model.terms}</p>
      </details>}
    </section>
    {model.warmup && <WarmupTranscript text={model.warmup} />}
  </div>;
}

export function SummaryTab({ model, onProctoring }) {
  const { sections, competencies, criteria, strengths, improvements, skills } = model;
  // Skills come from the competencies, so a report with skills does not repeat the competency bars.
  const showCompetencies = competencies.length > 0 && !skills.length;
  const anything = model.narrative || model.score || model.split || model.metrics.length || skills.length || sections.length || competencies.length
    || criteria.length || strengths.length || improvements.length || model.kpis.length;
  return <div className="space-y-4" data-tab-summary>
    {!anything && <p className={`${reportCard} text-sm ${muted}`}>No score breakdown was recorded for this attempt. See Question-wise feedback for each answer.</p>}
    <OverallPerformance model={model} />
    <KpiGrid model={model} />
    <SuccessMetrics model={model} />
    {(skills.length > 0 || sections.length > 0 || showCompetencies) && <div className={`grid items-start gap-4 ${(skills.length > 0 || showCompetencies) && sections.length ? "md:grid-cols-2" : ""}`}>
      <SkillsCard skills={skills} />
      {showCompetencies && <BarsCard id="anvi-summary-competencies" icon="target" title="Competencies" hint="How well the answers covered the expected points, by skill." rows={competencies} label="Score by competency" />}
      {sections.length > 0 && <BarsCard id="anvi-summary-sections" icon="barChart" title="Section scores" hint="Marks earned out of each section's maximum." rows={sections} label="Score by section" />}
    </div>}
    {criteria.length > 0 && <BarsCard id="anvi-summary-criteria" icon="award" title="Evaluation criteria" hint="Average level reached on each criterion of the rubric." rows={criteria} label="Score by criterion" />}
    {(strengths.length > 0 || improvements.length > 0) && <div className="grid gap-4 md:grid-cols-2">
      <Bullets id="anvi-summary-strengths" title="Strengths" items={strengths} icon="circleCheck" tone="positive" bullet="check" empty="No particular strengths were noted in this attempt." />
      <Bullets id="anvi-summary-improve" title="Areas to improve" items={improvements} icon="lightbulb" tone="caution" bullet="trendingUp" empty="Nothing major to improve. Try a harder interview next." />
    </div>}
    <IntegrityAndSetup model={model} onProctoring={onProctoring} />
  </div>;
}
