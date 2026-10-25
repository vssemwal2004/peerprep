import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CardHeader, Chip, Icon, MetaItem } from "./parts";
import { body, eyebrow, focusRing, muted, reportCard } from "./styles";
import {
  AI_COUNTS, BLOCKED_COUNTS, ON_LIMIT_LABELS, PROCTOR_COUNTS, PROCTOR_EVENTS, confidenceLabel, istClock, isAiDetection, proctorEventLabel,
  proctoringRules, secondsLabel,
} from "./reportModel";

// Integrity, interview setup, the warm-up transcript and the footer of the ANVI report. The integrity and
// setup blocks are shown in the "Proctoring details" drawer (and the admin drawer before scoring).

// ---- Interview setup --------------------------------------------------------

/** The unscored warm-up chat, collapsed by default. */
export function WarmupTranscript({ text, className = reportCard }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return <section className={`${className} !p-0`} data-warmup-transcript>
    <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)}
      className="flex w-full items-start gap-3 rounded-xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-6">
      <Icon name="messageCircle" className={`mt-0.5 h-4 w-4 shrink-0 ${muted}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 dark:text-zinc-50">Warm-up conversation</span>
        <span className={`mt-0.5 block text-xs ${muted}`}>The opening chat. It is not scored unless the interview is set to score it.</span>
      </span>
      <ChevronDown size={18} aria-hidden="true" className={`mt-0.5 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </button>
    <div id={contentId} hidden={!open} className="border-t border-slate-100 px-5 py-4 dark:border-white/[0.06] sm:px-6">
      {open && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-zinc-200">{text}</p>}
    </div>
  </section>;
}

const SETUP_ICONS = { terms: "fileText", resume: "fileText", language: "messageCircle" };

export function SetupSection({ model }) {
  return <div className="space-y-4">
    <section className={reportCard} aria-labelledby="anvi-setup-title" data-report-setup>
      <CardHeader id="anvi-setup-title" icon="fileText" tone="neutral" title="Interview setup" />
      <dl className="grid gap-4 sm:grid-cols-3">
        {model.setup.map((row) => <MetaItem key={row.key} icon={SETUP_ICONS[row.key] || "info"} label={row.label} value={row.value} />)}
      </dl>
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

// ---- Integrity --------------------------------------------------------------

function CountTile({ label, value, warn = false }) {
  const flagged = warn && Number(value) > 0;
  return <div className={`rounded-lg border px-3.5 py-3 ${flagged ? "border-amber-200 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[0.08]" : "border-slate-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.02]"}`}>
    <dt className={`text-xs ${muted}`}>{label}</dt>
    <dd className={`mt-1 text-xl font-semibold tabular-nums ${flagged ? "text-amber-800 dark:text-amber-200" : "text-slate-900 dark:text-zinc-50"}`}>{value}</dd>
  </div>;
}

const SEVERITY_TONES = { low: "neutral", medium: "caution", high: "critical", critical: "critical" };

/**
 * Camera AI checks: per-check counts (tinted when non-zero) and, for admins, one row per detection with
 * severity and confidence, in IST.
 */
function AiChecks({ ai, full }) {
  return <div className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-white/[0.08] sm:p-5" data-integrity-ai>
    <p className={`flex items-center gap-1.5 ${eyebrow}`}><Icon name="scanEye" className="h-3.5 w-3.5" />Camera AI checks · {ai.total} detection{ai.total === 1 ? "" : "s"}</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-integrity-ai-counts>
      {AI_COUNTS.map(({ key, label }) => {
        const value = ai.counts[key] ?? 0;
        return <div key={key} className={`flex flex-col-reverse rounded-lg px-3 py-2 ${value ? "bg-rose-50 dark:bg-rose-400/[0.08]" : "bg-slate-50 dark:bg-white/[0.03]"}`}>
          <dt className={`text-[11px] ${muted}`}>{label}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${value ? "text-rose-700 dark:text-rose-300" : "text-slate-700 dark:text-zinc-300"}`}>{value}</dd>
        </div>;
      })}
    </dl>
    {full && ai.events && (ai.events.length ? <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Camera AI timeline" data-integrity-ai-events>
      {ai.events.map((event, index) => {
        const confidence = confidenceLabel(event.confidence);
        return <li key={`${event.type}-${event.at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-white/[0.08]">
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100">{proctorEventLabel(event.type)}</span>
          <span className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`tabular-nums ${muted}`}>{istClock(event.at) || "—"}</span>
            {event.severity && <Chip tone={SEVERITY_TONES[event.severity] || "caution"} className="!px-2 text-[11px] capitalize">{event.severity}</Chip>}
            {confidence && <Chip tone="neutral" className="!px-2 text-[11px]">Confidence {confidence}</Chip>}
          </span>
        </li>;
      })}
    </ol> : <p className={`mt-3 text-xs ${muted}`}>No camera detections were recorded.</p>)}
    <p className={`mt-3 flex items-start gap-1.5 text-xs ${muted}`}><Icon name="lock" className="mt-px h-3.5 w-3.5 shrink-0" />No video is recorded. Detection ran in the browser; only the event, time and confidence are kept.</p>
  </div>;
}

/**
 * Proctoring outcome. Admins (`full`) see the rules, every event with its time, and the pauses;
 * students see their counts. Scores are never changed by these events.
 */
export function IntegritySection({ proctoring, full = false }) {
  const { counts, blocked, blockedTotal, events, pauses, violations, maxViolations, onLimit, limitReached, endedForViolations, settings } = proctoring;
  const rules = full ? proctoringRules(settings) : [];
  const pauseTotal = (pauses || []).reduce((sum, pause) => sum + (pause.seconds || 0), 0);
  // Camera AI detections have their own timeline (with confidence); "Camera restored" is information and stays here.
  const browserEvents = events ? events.filter((event) => !isAiDetection(event.type)) : null;
  return <section className={reportCard} aria-labelledby="anvi-integrity-title" data-report-integrity>
    <CardHeader id="anvi-integrity-title" icon={violations ? "shieldAlert" : "shieldCheck"} tone={violations ? "caution" : "brand"} title="Integrity"
      hint={full ? "Browser monitoring during the interview. Review these alongside the answers." : "What was recorded while you took this proctored interview."} />
    {endedForViolations && <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/[0.08] dark:text-rose-200">
      <Icon name="shieldAlert" className="mt-0.5 h-4 w-4 shrink-0" />The interview was ended because the violation limit was reached.
    </p>}
    {!endedForViolations && limitReached && maxViolations > 0 && <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.08] dark:text-amber-100">
      <Icon name="shieldAlert" className="mt-0.5 h-4 w-4 shrink-0" />The violation limit was reached{onLimit === "flag" ? "; the interview continued and this report is flagged." : "."}
    </p>}
    <p className={eyebrow}>Violations</p>
    <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5" data-integrity-counts>
      <CountTile label={maxViolations ? `Total (limit ${maxViolations})` : "Total"} value={violations ?? "—"} warn />
      {PROCTOR_COUNTS.map(({ key, label }) => <CountTile key={key} label={label} value={counts[key] ?? 0} />)}
    </dl>
    {(blockedTotal > 0 || settings?.blockRightClick || settings?.blockCopyPaste || settings?.blockShortcuts) && <>
      <p className={`mt-5 ${eyebrow}`}>Blocked actions <span className="normal-case tracking-normal">(not counted as violations)</span></p>
      <dl className="mt-2 grid grid-cols-3 gap-2" data-integrity-blocked>
        {BLOCKED_COUNTS.map(({ key, label }) => <CountTile key={key} label={label} value={blocked[key] ?? 0} />)}
      </dl>
    </>}
    {proctoring.ai && <AiChecks ai={proctoring.ai} full={full} />}
    {full && maxViolations > 0 && <p className={`mt-4 text-xs ${body}`}>At the limit: <span className="font-semibold">{ON_LIMIT_LABELS[onLimit]}</span></p>}
    {full && rules.length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Proctoring rules">
      {rules.map((rule) => <li key={rule} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-white/[0.06] dark:text-zinc-300">{rule}</li>)}
    </ul>}
    {full && pauses && pauses.length > 0 && <div className="mt-6" data-integrity-pauses>
      <p className={`flex items-center gap-1.5 ${eyebrow}`}><Icon name="circlePause" className="h-3.5 w-3.5" />Pauses · {pauses.length} · {secondsLabel(pauseTotal)} in total</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {pauses.map((pause, index) => <li key={`${pause.from}-${index}`} className="flex flex-wrap items-baseline gap-x-2 tabular-nums text-slate-700 dark:text-zinc-200">
          <span className="font-medium">{istClock(pause.from) || "—"} – {pause.to ? istClock(pause.to) : "not resumed"}</span>
          <span className={`text-xs ${muted}`}>{[pause.seconds !== null ? secondsLabel(pause.seconds) : "", pause.reason ? proctorEventLabel(pause.reason) : ""].filter(Boolean).join(" · ")}</span>
        </li>)}
      </ul>
    </div>}
    {full && browserEvents && <div className="mt-6">
      <p className={eyebrow}>Browser event timeline{events.length >= 200 ? " (first 200 events)" : ""}</p>
      {browserEvents.length ? <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/[0.08]">
        <table data-no-serial className="w-full min-w-[24rem] text-left text-sm" data-integrity-events>
          <caption className="sr-only">Proctoring events with time</caption>
          <thead className={`bg-slate-50 text-xs dark:bg-white/[0.03] ${muted}`}>
            <tr><th scope="col" className="px-3 py-2 font-semibold">Time (IST)</th><th scope="col" className="px-3 py-2 font-semibold">Event</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {browserEvents.map((event, index) => {
              const kind = PROCTOR_EVENTS[event.type];
              return <tr key={`${event.at}-${event.type}-${index}`}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-zinc-300">{istClock(event.at) || "—"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-slate-800 dark:text-zinc-100">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${kind?.violation ? "bg-amber-500" : kind?.blocked ? "bg-sky-500" : "bg-slate-300 dark:bg-zinc-600"}`} />
                    {proctorEventLabel(event.type)}{kind?.violation && <span className="sr-only"> (violation)</span>}
                  </span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div> : <p className={`mt-2 text-sm ${muted}`}>No events were recorded.</p>}
    </div>}
    <p className={`mt-5 text-xs ${muted}`}>Scores are never reduced automatically because of these events.{!full ? " Your institution can review them with your answers." : ""}</p>
  </section>;
}

// ---- Footer -----------------------------------------------------------------

export function ReportFooter({ model }) {
  return <footer className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-5 py-4 text-xs leading-5 dark:border-white/[0.08] dark:bg-white/[0.02] ${muted}`} data-report-footer>
    <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
    <div className="min-w-0">
      <p><span className="font-semibold text-slate-700 dark:text-zinc-200">AI-generated — may contain mistakes.</span> {model.disclaimer}</p>
      {model.scoredAt && <p className="mt-1">Scored {model.scoredAt}</p>}
    </div>
  </footer>;
}
