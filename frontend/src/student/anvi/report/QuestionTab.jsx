import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { BandChip, Chip, FlagChip, Icon, KeyPoint, Meter, ScoreRing, VerdictLegend } from "./parts";
import { body, eyebrow, focusRing, muted, reportCard, toneClasses } from "./styles";
import { marks } from "./reportModel";

// The Question-wise feedback tab: a question selector with Previous / Next, then one question at a time
// with its score ring, functional / non-functional bars, time, pace and fillers, success metrics, the
// transcript, key points, ANVI's feedback and (admins only) the expected answer.

const clip = (text, max = 96) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const navButton = `inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.08] ${focusRing}`;

function Navigator({ responses, index, onSelect }) {
  const selectId = useId();
  const total = responses.length;
  return <section className={`${reportCard} !p-4 sm:!p-5`} aria-label="Choose a question" data-question-nav>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label htmlFor={selectId} className={`${eyebrow} flex items-center justify-between`}>
          <span>Question</span><span className="normal-case tracking-normal tabular-nums">{index + 1} of {total}</span>
        </label>
        <div className="relative mt-1.5">
          <select id={selectId} value={index} onChange={(event) => onSelect(Number(event.target.value))} data-question-select
            className={`h-10 w-full appearance-none truncate rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-900 dark:border-white/10 dark:bg-[#2a2a2a] dark:text-zinc-50 ${focusRing}`}>
            {responses.map((response, position) => <option key={response.key} value={position}>{`${response.n}. ${clip(response.question || "Question")}`}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button type="button" className={navButton} onClick={() => onSelect(index - 1)} disabled={index <= 0} data-question-prev><Icon name="chevronLeft" />Previous</button>
        <button type="button" className={navButton} onClick={() => onSelect(index + 1)} disabled={index >= total - 1} data-question-next>Next<Icon name="chevronRight" /></button>
      </div>
    </div>
    {total > 1 && <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="All questions">
      {responses.map((response, position) => {
        const active = position === index;
        return <li key={response.key}>
          <button type="button" onClick={() => onSelect(position)} aria-current={active ? "true" : undefined}
            aria-label={`Question ${response.n}${response.percent !== null ? `, ${response.percent}%` : `, ${response.statusLabel}`}`}
            className={`inline-flex h-8 min-w-[3.25rem] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold tabular-nums transition ${focusRing} ${active
              ? "bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:text-sky-950"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]"}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white/90 dark:bg-sky-950/80" : response.percent !== null ? toneClasses(response.tone).bar : "bg-slate-300 dark:bg-zinc-600"}`} />
            {response.label}
          </button>
        </li>;
      })}
    </ol>}
  </section>;
}

function StatTile({ icon, label, value, detail, chip }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3 dark:border-white/[0.08]">
    <span className="mt-0.5 hidden h-7 w-7 shrink-0 items-center sm:inline-flex justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300" aria-hidden="true"><Icon name={icon} className="h-3.5 w-3.5" /></span>
    <div className="min-w-0">
      <p className={`text-[11px] ${muted}`}>{label}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{value}{chip}</p>
      {detail && <p className={`text-[11px] ${muted}`}>{detail}</p>}
    </div>
  </div>;
}

function SplitBar({ label, value }) {
  const tone = value >= 85 ? "positive" : value >= 70 ? "brand" : value >= 50 ? "caution" : "critical";
  return <div>
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-medium text-slate-700 dark:text-zinc-200">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{value}%</span>
    </div>
    <Meter percent={value} tone={tone} className="mt-2" />
  </div>;
}

function Notes({ title, icon, tone, items }) {
  if (!items.length) return null;
  return <div className="min-w-0">
    <p className={`flex items-center gap-1.5 text-xs font-semibold ${toneClasses(tone).text}`}><Icon name={icon} className="h-3.5 w-3.5" />{title}</p>
    <ul className="mt-2 space-y-1.5">{items.map((text) => <li key={text} className={`flex gap-2 text-sm leading-6 ${body}`}>
      <span aria-hidden="true" className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${toneClasses(tone).bar}`} /><span className="min-w-0">{text}</span>
    </li>)}</ul>
  </div>;
}

function QuestionDetail({ response, student }) {
  const { marks: score, percent, keyPoints, keyPointCounts, flags } = response;
  const meta = [response.section, response.competency].filter(Boolean).join(" · ");
  const hasSplit = response.functional !== null || response.nonFunctional !== null;
  const stats = [
    response.time && { key: "time", icon: "hourglass", label: "Time spent", value: response.time },
    response.wpm && { key: "pace", icon: "gauge", label: "Pace", value: `${response.wpm} wpm`, chip: response.pace && <Chip tone={response.pace.tone} className="!px-2 text-[11px]">{response.pace.label}</Chip> },
    response.fillers !== null && { key: "fillers", icon: "messageCircle", label: "Filler words", value: String(response.fillers), detail: response.fillerRate !== null ? `${response.fillerRate} per 100 words` : "" },
    response.words && { key: "words", icon: "textAlignStart", label: "Answer length", value: `${response.words} words` },
  ].filter(Boolean);
  const showTop = percent !== null || hasSplit || stats.length > 0;
  return <article className={reportCard} data-response data-question-detail={response.n} aria-labelledby={`anvi-question-${response.key}`}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-6 items-center rounded-md bg-sky-600 px-2 text-xs font-semibold tabular-nums text-white dark:bg-sky-500 dark:text-sky-950">{response.label}</span>
      {meta && <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">{meta}</span>}
      {!response.answered && <Chip tone="neutral">{response.statusLabel}</Chip>}
    </div>
    <h3 id={`anvi-question-${response.key}`} className="mt-3 text-[17px] font-semibold leading-7 tracking-[-0.01em] text-slate-900 dark:text-zinc-50 [text-wrap:pretty]">{response.question}</h3>
    {flags.length > 0 && <p className="mt-3 flex flex-wrap gap-1.5" data-question-flags>{flags.map((flag) => <FlagChip key={flag.key} tone={flag.tone}>{flag.label}</FlagChip>)}</p>}

    {showTop && <div className={`mt-5 grid gap-4 ${percent !== null ? "md:grid-cols-[auto_minmax(0,1fr)]" : ""}`}>
      {percent !== null && <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/[0.08] md:flex-col md:justify-center md:px-6" data-response-score>
        <ScoreRing percent={percent} band={response.band} tone={response.tone} size={104} caption="Score" label={`Question score ${percent} percent, ${response.band}`} />
        <div className="flex flex-col items-start gap-1.5 md:items-center">
          <BandChip band={response.band} tone={response.tone} />
          {score && <p className={`text-xs tabular-nums ${muted}`}><span className="font-semibold text-slate-800 dark:text-zinc-100">{marks(score.score)}</span> / {marks(score.max)} marks</p>}
        </div>
      </div>}
      <div className="flex min-w-0 flex-col gap-4">
        {hasSplit && <div className="grid gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/[0.08] sm:grid-cols-2" data-response-split>
          {response.functional !== null && <SplitBar label="Functional" value={response.functional} />}
          {response.nonFunctional !== null && <SplitBar label="Non-functional" value={response.nonFunctional} />}
        </div>}
        {stats.length > 0 && <div className={`grid gap-3 ${stats.length > 2 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`} data-response-metrics>
          {stats.map(({ key, ...stat }) => <StatTile key={key} {...stat} />)}
        </div>}
      </div>
    </div>}

    {response.dimensions.length > 0 && <div className="mt-5" data-response-dimensions>
      <p className={`flex items-center gap-1.5 ${eyebrow}`}><Icon name="target" className="h-3.5 w-3.5" />Success metrics for this answer</p>
      <ul className="mt-3 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
        {response.dimensions.map((dimension) => <li key={dimension.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-zinc-200"><Icon name={dimension.icon} className={`h-3.5 w-3.5 ${muted}`} />{dimension.label}</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-zinc-50">{dimension.percent}%</span>
          </div>
          <Meter percent={dimension.percent} tone={dimension.tone} height="h-1.5" className="mt-1.5" />
        </li>)}
      </ul>
    </div>}

    <div className="mt-6">
      <p className={`flex items-center gap-1.5 ${eyebrow}`}><Icon name="messageSquareText" className="h-3.5 w-3.5" />{student ? "Your answer" : "Answer"}<span className="font-normal normal-case tracking-normal">· transcript</span></p>
      {response.answered
        ? <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 dark:bg-white/[0.04] dark:text-zinc-200" data-response-answer>{response.answer}</p>
        : <p className={`mt-2 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm italic dark:border-white/10 ${muted}`}>{response.statusLabel}</p>}
    </div>
    {keyPoints.length > 0 && <div className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`flex items-center gap-1.5 ${eyebrow}`}><Icon name="listChecks" className="h-3.5 w-3.5" />Key points</p>
        <p className={`text-xs tabular-nums ${muted}`}>{keyPointCounts.matched} covered · {keyPointCounts.partial} partly · {keyPointCounts.missed} missed</p>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label="Key points for this response">
        {keyPoints.map((point) => <KeyPoint key={point.text} text={point.text} verdict={point.verdict} />)}
      </ul>
    </div>}
    {response.feedback && <div className="mt-5 rounded-lg border-l-2 border-sky-500 bg-sky-50/70 px-4 py-3 dark:border-sky-400 dark:bg-sky-400/[0.07]" data-response-feedback>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-200"><Icon name="sparkles" className="h-3.5 w-3.5" />ANVI feedback</p>
      <p className={`mt-1 text-sm leading-6 ${body}`}>{response.feedback}</p>
    </div>}
    {(response.strengths.length > 0 || response.improvements.length > 0) && <div className="mt-5 grid gap-5 sm:grid-cols-2" data-response-notes>
      <Notes title="What went well" icon="circleCheck" tone="positive" items={response.strengths} />
      <Notes title="Areas of improvement" icon="trendingUp" tone="caution" items={response.improvements} />
    </div>}
    {response.expectedAnswer && <details className="group mt-5 text-sm" data-response-expected>
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded font-semibold text-slate-600 dark:text-zinc-300 ${focusRing}`}>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />Expected answer (admins only)
      </summary>
      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 leading-6 text-slate-700 dark:bg-white/[0.04] dark:text-zinc-200">{response.expectedAnswer}</p>
    </details>}
  </article>;
}

export function QuestionTab({ model, index, onSelect }) {
  const { responses } = model;
  const student = model.audience === "student";
  if (!responses.length) return <p className={`${reportCard} text-sm ${muted}`}>No interview responses were saved in this attempt.</p>;
  const current = Math.max(0, Math.min(responses.length - 1, index));
  return <div className="space-y-4" data-tab-questions>
    <Navigator responses={responses} index={current} onSelect={(next) => onSelect(Math.max(0, Math.min(responses.length - 1, next)))} />
    {model.keyPointsWithheld && <p role="note" className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/[0.07] dark:text-sky-100">
      <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />Some interview content is still in use by a scheduled interview, so the key points appear after the schedule ends.
    </p>}
    <QuestionDetail key={responses[current].key} response={responses[current]} student={student} />
    {responses.some((response) => response.keyPoints.length) && <div className="flex justify-end px-1"><VerdictLegend /></div>}
  </div>;
}
