import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import AnviReport, { AiDisclaimer } from "./AnviReport";
import { reportStateOf } from "./anviReportState";

const card = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]";
const FINISHED = new Set(["completed", "evaluating", "ready", "failed"]);

const answerNote = (item) => {
  if (item.answerText?.trim()) return null;
  return item.status === "skipped" ? "Skipped" : "No answer recorded";
};

/** Answers saved -> ANVI scoring -> report: where this attempt is, at a glance. */
function Progress({ state }) {
  const scoring = state === "preparing" ? "active" : state === "failed" ? "failed" : state === "withheld" || state === "ready" ? "done" : "idle";
  const report = state === "ready" ? "done" : state === "withheld" ? "waiting" : "idle";
  const steps = [
    { label: "Answers saved", status: "done" },
    { label: state === "failed" ? "Scoring failed" : "ANVI scores your answers", status: scoring },
    { label: state === "withheld" ? "Released by your institution" : "Report ready", status: report },
  ];
  const dot = (status) => {
    if (status === "done") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>;
    if (status === "active") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-700 ring-1 ring-violet-300 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/40"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /></span>;
    if (status === "failed") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /></span>;
    if (status === "waiting") return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /></span>;
    return <span className="h-6 w-6 rounded-full border-2 border-dashed border-slate-300 dark:border-zinc-600" />;
  };
  return <ol className="grid gap-3 sm:grid-cols-3" aria-label="Report progress">
    {steps.map((step, index) => <li key={step.label} className="flex items-center gap-2.5 sm:flex-col sm:items-start">
      <span className="flex items-center gap-2 sm:w-full">
        {dot(step.status)}
        {index < steps.length - 1 && <span aria-hidden="true" className={`hidden h-px flex-1 sm:block ${step.status === "done" ? "bg-emerald-400/70" : "bg-slate-200 dark:bg-zinc-700"}`} />}
      </span>
      <span className={`text-sm ${step.status === "idle" ? "text-slate-400 dark:text-zinc-500" : "font-medium text-slate-800 dark:text-zinc-100"}`}>{step.label}</span>
    </li>)}
  </ol>;
}

function ReportState({ state, pollExpired, onCheckAgain }) {
  if (state === "preparing") {
    return <div className="flex flex-wrap items-start gap-3 rounded-xl bg-violet-50/80 px-4 py-3 dark:bg-violet-500/[0.08]" aria-live="polite">
      <Loader2 className={`mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300 ${pollExpired ? "" : "animate-spin motion-reduce:animate-none"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">ANVI is preparing your report…</p>
        <p className="mt-0.5 text-sm text-violet-800/80 dark:text-violet-200/70">
          {pollExpired ? "This is taking longer than usual. Your answers are saved; check again in a few minutes." : "This usually takes under a minute. You can stay here or come back later."}
        </p>
      </div>
      {pollExpired && onCheckAgain && <button type="button" onClick={onCheckAgain} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-violet-800 ring-1 ring-violet-200 hover:bg-violet-50 dark:bg-white/10 dark:text-violet-100 dark:ring-violet-500/30 dark:hover:bg-white/15">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />Check again
      </button>}
    </div>;
  }
  if (state === "failed") {
    return <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span><span className="font-semibold">Report could not be generated.</span> Your answers are saved below. Try again later, or ask your coordinator to re-run the evaluation.</span>
    </div>;
  }
  return null;
}

const PROCTOR_COUNTS = [
  ["fullscreen_exit", "left fullscreen"],
  ["tab_hidden", "switched tab"],
  ["window_blur", "left the window"],
  ["rejoin", "rejoined"],
];

const endedForProctoring =(attempt) => attempt?.endReason === "proctoring_limit" || Boolean(attempt?.proctoring?.endedForViolations);

/** Why an attempt ended early under proctoring, with what was counted (the student report has counts only). */
function ProctorLimitNote({ attempt }) {
  const proctoring = attempt?.proctoring || {};
  const violations = Number(proctoring.violations) || 0;
  const counts = proctoring.counts && typeof proctoring.counts === "object" ? proctoring.counts : {};
  const parts = PROCTOR_COUNTS.filter(([key]) => Number(counts[key]) > 0).map(([key, label]) => `${label} ${counts[key]}×`);
  const cameraFindings = Object.entries(counts).filter(([key]) => key.startsWith("ai_")).reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
  if (cameraFindings > 0) parts.push(`camera checks ${cameraFindings}×`);
  return <div role="note" data-testid="anvi-proctor-limit-note" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-50">
    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
    <div className="min-w-0">
      <p className="font-semibold">This interview was ended by proctoring.</p>
      <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
        The proctoring limit was reached{violations > 0 ? ` after ${violations} recorded violation${violations === 1 ? "" : "s"}` : ""}{parts.length ? ` (${parts.join(", ")})` : ""}. Leaving fullscreen, switching away from the interview{cameraFindings > 0 || attempt?.proctoring?.settings?.ai?.enabled ? " or a confirmed camera check" : ""} counts as a violation. The answers you gave before it ended are saved and scored as a partial attempt.
      </p>
    </div>
  </div>;
}

/**
 * Shown once an attempt is no longer in progress: the scored report when it is ready, otherwise the
 * evaluation status above the saved answers.
 */
export default function AnviCompletion({ attempt, pollExpired = false, onCheckAgain }) {
  const state = reportStateOf(attempt);
  const items = Array.isArray(attempt?.items) ? attempt.items : [];
  const complete = FINISHED.has(attempt?.status) && !attempt?.partial;
  const ready = state === "ready" && attempt?.overall;
  const proctorEnded = endedForProctoring(attempt);

  // Same top-left ghost link on the report and the waiting page (and the lobby's "All interviews").
  const back = <div className="flex justify-start">
    <Link to="/student/ai-interviews" className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to interviews
    </Link>
  </div>;

  if (ready) {
    // The report carries its own cover (title, role, date and score).
    return <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      {back}
      {proctorEnded && <ProctorLimitNote attempt={attempt} />}
      <AnviReport attempt={attempt} />
    </div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      {back}

      <section className={`${card} p-5 sm:p-7`} aria-labelledby="anvi-done-title">
        <div className="flex items-start gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${complete ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-zinc-300"}`}>
            {complete ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : <Clock3 className="h-6 w-6" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h1 id="anvi-done-title" className="text-xl font-semibold tracking-tight sm:text-2xl">{complete ? "Interview complete" : "Interview ended"}</h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-zinc-400">{[attempt?.title, attempt?.role].filter(Boolean).join(" · ")}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
              {complete ? "Your responses are saved and your report is being prepared." : proctorEnded ? "Proctoring ended the interview early. Your responses so far are saved." : "The interview ended early. Your responses so far are saved."}
            </p>
          </div>
        </div>
        {proctorEnded && <div className="mt-5"><ProctorLimitNote attempt={attempt} /></div>}
        {(state === "preparing" || state === "failed" || state === "withheld") && <div className="mt-6 border-t border-slate-100 pt-5 dark:border-zinc-800"><Progress state={state} /></div>}
        {(state === "preparing" || state === "failed") && <div className="mt-5"><ReportState state={state} pollExpired={pollExpired} onCheckAgain={onCheckAgain} /></div>}
        {state === "preparing" && <AiDisclaimer className="mt-4" />}
      </section>

      <section className={`${card} p-5 sm:p-6`} aria-labelledby="anvi-answers-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="anvi-answers-title" className="text-base font-semibold">Your answers</h2>
          {items.length > 0 && <p className="hidden text-xs text-slate-500 dark:text-zinc-400 sm:block">Transcribed from your voice</p>}
        </div>
        {items.length ? <ol className="mt-4 space-y-3">
          {items.map((item, index) => {
            const note = answerNote(item);
            const key = item.n ?? index;
            return <li key={key} className="rounded-xl border border-slate-100 p-4 dark:border-zinc-800">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-slate-900 dark:text-zinc-50">{item.questionText}</p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Your answer</p>
                  {note ? <p className="mt-1 text-sm italic text-slate-500 dark:text-zinc-400">{note}</p>
                    : <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-zinc-300">{item.answerText}</p>}
                </div>
              </div>
            </li>;
          })}
        </ol> : <p className="mt-3 text-sm text-slate-500 dark:text-zinc-400">No responses were saved in this attempt.</p>}
      </section>
    </div>
  );
}
