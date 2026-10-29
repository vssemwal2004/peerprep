import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, CalendarClock, Headphones, PauseCircle, Repeat2, ShieldCheck, Wifi } from "lucide-react";
import { AnviMark } from "../../components/AnviApproach";
import { formatIST, modeLabel } from "./anviSchedule";
import { languageLabel, rejoinNeedsFullscreen } from "./anviStartSetup";
import { ConsentBox } from "./LobbySteps";
import PrestartFlow from "./prestart/PrestartFlow";
import { requestAppFullscreen } from "./prestart/fullscreen";
import useMicCheck from "./prestart/useMicCheck";
import { CheckRow, MicPanel } from "./prestart/ui";
import { glass } from "./prestart/styles";

const minutesLeft = (deadline) => {
  const ms = new Date(deadline).getTime() - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60000)) : null;
};
const timeIsUp = (deadline) => {
  const at = new Date(deadline).getTime();
  return Number.isFinite(at) && at <= Date.now();
};

const RULES = [
  { Icon: PauseCircle, title: "Speak naturally", text: "When you pause for about 2 seconds, ANVI takes it as the end of your answer and continues." },
  { Icon: Repeat2, title: "Repeat or skip by voice", text: "Say “repeat” to hear a question again, or “skip” to move on. There are no buttons to press." },
  { Icon: ShieldCheck, title: "Audio is not stored", text: "Only the text of your answers is saved for your report." },
  { Icon: Headphones, title: "Headphones recommended", text: "They keep ANVI's voice out of your microphone for the smoothest conversation." },
];

/**
 * The pre-interview window. Before a NEW attempt (`setup`, from startSetupOf) it is the phased pre-start
 * flow (Background, System check, Proctoring, Instructions & terms, Ready); `onStart({ stream, contexts,
 * body })` must resolve true once the attempt exists or false to stay. For an attempt already running
 * (`attempt`, a rejoin) it stays the quick "Ready to join?" check: microphone, consent, Join, and
 * `onStart({ stream })` joins. Both follow the app theme.
 */
export default function AnviLobby({ attempt, setup = null, ...props }) {
  if (setup) return <PrestartFlow setup={setup} {...props} />;
  return <RejoinLobby attempt={attempt} {...props} />;
}

function RejoinLobby({ attempt, support, onStart, studentName = "" }) {
  const [consent, setConsent] = useState(false);
  const micCheck = useMicCheck({ support });
  const expired = timeIsUp(attempt?.hardDeadline);
  const blocker = consent ? "" : "Tick the consent box above to join.";
  const canJoin = !blocker && support.ok && !expired;
  const fullscreenRequired = rejoinNeedsFullscreen(attempt);

  const begin = () => {
    if (!canJoin) return;
    // A proctored attempt goes back to fullscreen in this click; the room reports it either way.
    if (fullscreenRequired) void requestAppFullscreen();
    const stream = micCheck.handOver();
    micCheck.stopMeter();
    onStart({ stream });
  };

  const minutes = minutesLeft(attempt?.hardDeadline);
  const assigned = Boolean(attempt?.assignmentId);
  const facts = [attempt?.role, languageLabel(attempt?.language), minutes ? `up to ${minutes} min` : ""].filter(Boolean);
  const { check, online } = micCheck;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#111318] dark:text-zinc-100" data-anvi-lobby="room">
      <span aria-hidden="true" className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.14),transparent)] dark:bg-[radial-gradient(closest-side,rgba(124,58,237,0.2),transparent)]" />
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/75 backdrop-blur-md dark:border-white/[0.06] dark:bg-[#111318]/75">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/student/ai-interviews" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />All interviews
          </Link>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-zinc-200">
            <AnviMark className="h-6 w-6" />ANVI <span className="hidden font-normal text-slate-500 dark:text-zinc-400 sm:inline">· AI Interviewer</span>
          </span>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-x-12 lg:py-12">
        <section aria-labelledby="anvi-mic-title" className="min-w-0 space-y-4">
          <h2 id="anvi-mic-title" className="sr-only">Microphone</h2>
          <MicPanel micCheck={micCheck} support={support} studentName={studentName} />
          <p aria-live="polite" className="sr-only">{check.detail}</p>
          <div className={`${glass} p-5`}>
            <h2 className="text-sm font-semibold">Before you join</h2>
            <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.06]">
              <CheckRow state={support.ok ? "ok" : "bad"} title="Browser" detail={support.ok ? "Live audio is supported here." : support.reason} />
              <CheckRow state={check.state} title="Microphone" detail={check.detail} />
              <CheckRow state={online ? "ok" : "bad"} title={<span className="inline-flex items-center gap-1.5">Connection{!online && <Wifi className="h-3.5 w-3.5" aria-hidden="true" />}</span>} detail={online ? "You are online. A steady connection keeps ANVI responsive." : "You appear to be offline. Reconnect before you join."} />
            </ul>
          </div>
        </section>

        <section className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">{assigned ? "Scheduled interview with ANVI" : "Practice interview with ANVI"}</p>
          <h1 id="anvi-join-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Ready to join?</h1>
          <p className="mt-3 text-lg font-medium text-slate-800 dark:text-zinc-100">{attempt?.title || "AI interview"}</p>
          {facts.length > 0 && <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{facts.join(" · ")}</p>}

          {assigned && <div className="mt-4 rounded-2xl border border-violet-200/80 bg-violet-50/70 p-4 dark:border-violet-500/20 dark:bg-violet-500/[0.08]" data-testid="anvi-assigned-context">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-violet-950 dark:text-violet-100"><Building2 className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />Your institution scheduled this interview.</p>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              <li className="rounded-full bg-white px-2.5 py-1 font-semibold text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-100 dark:ring-violet-400/25">{modeLabel(attempt?.mode)}</li>
              {attempt?.hardDeadline && <li className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-white/5 dark:text-zinc-200 dark:ring-white/10"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />Ends by {formatIST(attempt.hardDeadline)}</li>}
            </ul>
          </div>}

          <h2 id="anvi-expect-title" className="mt-7 text-sm font-semibold">What to expect</h2>
          <ul className="mt-3 space-y-3.5">
            {RULES.map(({ Icon, title, text }) => <li key={title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100/70 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 text-sm"><span className="block font-medium text-slate-900 dark:text-zinc-100">{title}</span><span className="block text-slate-500 dark:text-zinc-400">{text}</span></span>
            </li>)}
          </ul>

          {!support.ok && <p role="alert" className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">{support.reason}</p>}
          {expired && <p role="alert" className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">This interview's time limit has passed, so it can no longer be continued. {assigned ? "Go back to your interviews to see what was saved." : "Go back to your interviews to see what was saved or start again."}</p>}

          <div className="mt-7"><ConsentBox checked={consent} onChange={setConsent} /></div>
          <button type="button" onClick={begin} disabled={!canJoin} aria-describedby="anvi-join-hint"
            className={`mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed ${canJoin
              ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-violet-500 text-white shadow-[0_10px_30px_-12px_rgba(109,40,217,0.8)] hover:brightness-110"
              : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-zinc-500"}`}>
            Join now
          </button>
          <p id="anvi-join-hint" aria-live="polite" className="mt-3 text-center text-xs text-slate-500 dark:text-zinc-400">
            {blocker || "ANVI starts speaking as soon as you join. Find a quiet spot first."}
          </p>
        </section>
      </main>
    </div>
  );
}
