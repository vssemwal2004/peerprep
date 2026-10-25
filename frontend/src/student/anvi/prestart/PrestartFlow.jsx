import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, Maximize2, X } from "lucide-react";
import { AnviMark } from "../../../components/AnviApproach";
import { createAnviAudioContexts } from "../useAnviLiveSession";
import { resumeTargetOf, startBodyOf } from "../anviStartSetup";
import { releaseAudio } from "../anviJoinHandoff";
import { INTERVIEW_LANGUAGE } from "../LobbySteps";
import { focus, noOutline } from "../list/styles";
import { FULLSCREEN_HELP, exitAppFullscreen, fullscreenSupported, isFullscreen, requestAppFullscreen } from "./fullscreen";
import { PHASES, joinBlockOf, phaseBlockerOf, phaseStatusesOf, phasesOf } from "./prestartModel";
import { BackgroundPhase, InstructionsPhase, ProctoringPhase, SystemPhase } from "./phases";
import { AiMotionStyles } from "./motion";
import useCameraCheck from "./useCameraCheck";
import useMicCheck from "./useMicCheck";
import useResumeUpload from "./useResumeUpload";
import { primaryButton, secondaryButton } from "./styles";

const HEADINGS = {
  background: "About this interview",
  system: "Check your setup",
  proctoring: "Proctoring rules",
  instructions: "Ready to interview",
};
const INTROS = {
  background: "Review the interview and add your resume.",
  backgroundNoResume: "Review what this interview covers before you begin.",
  system: "Make sure ANVI can hear you clearly.",
  systemCamera: "Make sure ANVI can hear you and your camera can see your face.",
  proctoring: "Read how this interview is monitored, then confirm.",
  instructions: "Review the essentials, confirm consent, and join when you're ready.",
};

function StepMarker({ status, n }) {
  const base = "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-300";
  if (status === "done") return <span className={`${base} anvi-pop bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200`}><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /></span>;
  if (status === "attention") return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300`}><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /></span>;
  if (status === "current") return <span className={`${base} bg-violet-600 text-white ring-4 ring-violet-600/15 dark:bg-violet-500 dark:ring-violet-400/20`}>{n}</span>;
  return <span className={`${base} bg-white text-slate-400 ring-1 ring-inset ring-slate-300 dark:bg-transparent dark:text-zinc-500 dark:ring-white/15`}>{n}</span>;
}
const STATUS_WORD = { done: "completed", attention: "needs attention", current: "current step", upcoming: "not started" };


/**
 * The full-window pre-start flow of a NEW ANVI attempt, in assessment-style phases with a horizontal
 * stepper: Background (details and resume), System check, Proctoring (only when on), then one compact
 * Review & join screen that combines instructions, consent and the readiness summary.
 * One phase per screen (it fits a desktop window; phones scroll inside the phase) with a fixed Back / Next
 * footer, and each phase gates Next with one short reason. A resume upload runs in the background across
 * phases; Join waits for it. Interviews are English only. When the interview requires fullscreen, Join
 * requests it in its own click (never earlier), together with the call's audio contexts, then starts
 * through `onStart({ stream, contexts, body })` (true: started).
 */
export default function PrestartFlow({ setup, support, starting = false, startError = "", onStart, onClose, studentName = "", createProctoringManager }) {
  const phases = useMemo(() => phasesOf(setup), [setup]);
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [direction, setDirection] = useState("next");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [proctoringAck, setProctoringAck] = useState(false);
  const [joining, setJoining] = useState("");
  const [joinNote, setJoinNote] = useState("");
  const [fullscreenRefused, setFullscreenRefused] = useState(false);
  const resume = useResumeUpload({ target: resumeTargetOf(setup), setup: setup.resume });
  const micCheck = useMicCheck({ support });
  const fsSupported = useMemo(() => fullscreenSupported(), []);
  const headingRef = useRef(null);
  const bodyRef = useRef(null);
  const runRef = useRef(0);
  const mountedRef = useRef(true);
  const skipFailedResumeRef = useRef(false);
  // Fullscreen this flow entered in a Join click, and whether that Join started the interview (the room
  // keeps fullscreen then). A failed start, or leaving without one, gives the fullscreen back.
  const enteredFullscreenRef = useRef(false);
  const startedRef = useRef(false);
  const leaveFullscreen = () => {
    if (!enteredFullscreenRef.current) return;
    enteredFullscreenRef.current = false;
    void exitAppFullscreen();
  };
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // After pending promise callbacks, so a start that just succeeded (and closed this flow) counts.
      if (enteredFullscreenRef.current) setTimeout(() => { if (!startedRef.current) leaveFullscreen(); }, 0);
    };
  }, []);

  const current = phases[index];
  const cameraCheck = useCameraCheck({ ai: setup.proctoring.active ? setup.proctoring.ai : null, active: current === "system", ...(createProctoringManager ? { createManager: createProctoringManager } : {}) });
  const busy = Boolean(joining) || starting;
  // Exit stays open while a start waits on the student elsewhere (a Prep Coin confirmation), so a
  // dismissed dialog can never trap the flow; closing settles the start as not started.
  const exitLocked = busy && !(joining === "start" && !starting);
  const state = {
    resumeProvided: resume.provided, resumeUploading: resume.uploading, support, micReady: micCheck.ready,
    micError: micCheck.mic.state === "error", online: micCheck.online, fullscreenSupported: fsSupported,
    cameraOn: cameraCheck.camera.state === "on", cameraReady: cameraCheck.ready, cameraError: cameraCheck.camera.state === "error",
    proctoringAck, termsAccepted, consent,
  };
  const blocker = phaseBlockerOf(current, setup, state);
  const statuses = phaseStatusesOf(phases, { index, reached }, setup, state);
  const joinBlock = joinBlockOf(phases, setup, state);

  // Each phase announces itself: its heading takes focus and the phase scrolls back to the top.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [index]);

  // The System check starts the microphone test on arrival; the level meter only runs on that phase.
  // With camera AI proctoring the camera starts there too (its detector runs only on that phase).
  const testRef = useRef(micCheck.test);
  const stopMeterRef = useRef(micCheck.stopMeter);
  const cameraStartRef = useRef(cameraCheck.start);
  useEffect(() => { testRef.current = micCheck.test; stopMeterRef.current = micCheck.stopMeter; cameraStartRef.current = cameraCheck.start; });
  useEffect(() => {
    if (current === "system") {
      if (support.ok) void testRef.current();
      void cameraStartRef.current();
    } else stopMeterRef.current();
  }, [current, support.ok]);

  const goTo = (target) => {
    if (busy || target < 0 || target >= phases.length || target > reached) return;
    setJoinNote(""); setFullscreenRefused(false);
    setDirection(target < index ? "prev" : "next");
    setIndex(target);
  };
  const next = () => {
    if (busy || blocker || index >= phases.length - 1) return;
    const target = index + 1;
    setReached((value) => Math.max(value, target));
    setDirection("next");
    setIndex(target);
  };
  const editPhase = (id) => goTo(phases.indexOf(id));

  const needFullscreen = setup.proctoring.fullscreen === "required";
  const canJoin = !joinBlock && support.ok && !busy;

  const join = async () => {
    if (!canJoin) return;
    const run = ++runRef.current;
    setJoinNote(""); setFullscreenRefused(false);
    const waitedForUpload = resume.uploading;
    // Both browser permissions need this click: fullscreen first (it must start before any await), then
    // the call's audio contexts, so the room can play ANVI without another tap.
    const alreadyFullscreen = isFullscreen();
    const fullscreen = needFullscreen ? requestAppFullscreen() : Promise.resolve(true);
    let contexts = null;
    try { contexts = createAnviAudioContexts(); } catch { contexts = null; }
    setJoining(needFullscreen ? "fullscreen" : waitedForUpload ? "upload" : "start");
    const stop = (note = "") => {
      releaseAudio({ contexts });
      if (run !== runRef.current || !mountedRef.current) return;
      leaveFullscreen();
      setJoining("");
      if (note) setJoinNote(note);
    };

    if (!(await fullscreen)) { stop(); if (mountedRef.current) setFullscreenRefused(true); return; }
    if (needFullscreen && !alreadyFullscreen) enteredFullscreenRef.current = true;
    if (run !== runRef.current || !mountedRef.current) { stop(); return; }

    if (resume.uploading) setJoining("upload");
    const { provided, error } = await resume.settled();
    if (run !== runRef.current || !mountedRef.current) { stop(); return; }
    if (!provided && setup.resume.mode === "required") { stop("Your resume could not be added. Fix it in Background, then join."); return; }
    if (!provided && error && waitedForUpload && setup.resume.mode === "optional" && !skipFailedResumeRef.current) {
      skipFailedResumeRef.current = true;
      stop("Your resume could not be added, so ANVI won't use it. Press Join again to continue without it, or fix it in Background.");
      return;
    }

    setJoining("start");
    const stream = micCheck.handOver();
    // With camera AI proctoring the tested camera goes to the room too, so it is not asked for again.
    const cameraStream = cameraCheck.enabled ? cameraCheck.handOver() : null;
    // Interviews are English only, whatever an older interview's language setting offered.
    const body = startBodyOf({ termsAccepted, resumeConsent: provided, language: INTERVIEW_LANGUAGE });
    const ok = await Promise.resolve(onStart({ stream, contexts, body, cameraStream })).catch(() => false);
    if (ok === true && run === runRef.current) { startedRef.current = true; micCheck.stopMeter(); return; }
    // Refused, cancelled or superseded: these audio contexts were not handed over.
    releaseAudio({ contexts });
    if (run !== runRef.current) return;
    micCheck.takeBack();
    cameraCheck.takeBack();
    if (!mountedRef.current) { releaseAudio({ stream, cameraStream }); return; }
    leaveFullscreen();
    setJoining("");
  };

  const readyItems = phases.filter((id) => id !== "instructions" && id !== "ready").map((id) => {
    const phaseBlocker = phaseBlockerOf(id, setup, state);
    if (id === "background") {
      if (setup.resume.mode === "none") return { id, state: "ok", detail: "Interview details reviewed." };
      if (resume.uploading) return { id, state: "busy", detail: "Resume uploading. Join waits for it to finish." };
      if (resume.provided) return { id, state: "ok", detail: "Resume added ✓" };
      if (phaseBlocker) return { id, state: "bad", detail: resume.error ? "Resume upload failed. Add it again." : "Resume needed." };
      return { id, state: resume.error ? "bad" : "ok", detail: resume.error ? "Resume upload failed. ANVI won't use a resume." : "No resume (optional)." };
    }
    if (phaseBlocker) return { id, state: "bad", detail: phaseBlocker };
    if (id === "system") return { id, state: "ok", detail: `Microphone ready${cameraCheck.enabled ? (cameraCheck.faceDetected ? " · face detected" : " · camera on") : ""} · browser supported · online` };
    if (id === "proctoring") return { id, state: "ok", detail: needFullscreen ? "Rules confirmed. Joining opens fullscreen." : "Rules confirmed." };
    return { id, state: "ok", detail: [INTERVIEW_LANGUAGE, setup.terms.required ? "terms accepted" : "", "consent given"].filter(Boolean).join(" · ") };
  });

  const joinLabel = joining === "fullscreen" ? "Entering fullscreen…" : joining === "upload" ? "Finishing upload…" : joining === "start" || starting ? "Starting your interview…" : "Join now";
  const joinHint = joining === "upload" ? "Your resume is still uploading. You'll join as soon as it's done."
    : joining === "start" || starting ? "Starting the call. This can take up to a minute."
      : joinBlock ? `${PHASES[joinBlock.id].title}: ${joinBlock.blocker}`
        : support.ok ? "ANVI starts speaking as soon as you join. Find a quiet spot first." : support.reason;
  const assigned = setup.kind === "assignment";
  const n = index + 1;
  const nextId = phases[index + 1];
  const onReady = current === phases[phases.length - 1];
  const withResume = setup.resume.mode !== "none";

  const notices = <>
    {needFullscreen && <p data-fullscreen-notice="" className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 dark:bg-white/[0.04] dark:text-zinc-300">
      <Maximize2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
      {setup.proctoring.pauseOutsideFullscreen
        ? "Joining opens fullscreen. Stay in fullscreen until you finish; leaving pauses the interview."
        : "Joining opens fullscreen. Stay in fullscreen until you finish; leaving is recorded."}
    </p>}
    {fullscreenRefused && <div role="alert" data-fullscreen-refused="" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
      <p className="font-semibold">Fullscreen was blocked, so the interview didn't start.</p>
      <p className="mt-1 text-[13px]">{FULLSCREEN_HELP}</p>
    </div>}
    {joinNote && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">{joinNote}</p>}
    {startError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{startError}</p>}
  </>;

  const phaseBody = current === "background" ? <BackgroundPhase setup={setup} resume={resume} />
    : current === "system" ? <SystemPhase setup={setup} support={support} micCheck={micCheck} cameraCheck={cameraCheck} studentName={studentName} fullscreenSupported={fsSupported} />
      : current === "proctoring" ? <ProctoringPhase setup={setup} assigned={assigned} acknowledged={proctoringAck} onAcknowledge={setProctoringAck} fullscreenSupported={fsSupported} disabled={busy} />
        : <InstructionsPhase
          setup={setup}
          termsAccepted={termsAccepted}
          onTerms={setTermsAccepted}
          consent={consent}
          onConsent={setConsent}
          disabled={busy}
          readyItems={readyItems}
          onEdit={editPhase}
          notices={notices}
        />;

  const column = "mx-auto w-full max-w-5xl px-4 sm:px-6";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="anvi-prestart-title" data-anvi-lobby="prestart" data-phase={current}
      className="fixed inset-0 z-[80] flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-slate-900 antialiased [font-family:Inter,ui-sans-serif,system-ui,sans-serif] dark:bg-[#111318] dark:text-zinc-100">
      <AiMotionStyles />
      {/* A very subtle wash of the primary colour from the top. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_100%_at_50%_0%,rgba(124,58,237,0.07),transparent)] dark:bg-[radial-gradient(70%_100%_at_50%_0%,rgba(139,92,246,0.12),transparent)]" />

      {/* One slim header row: brand, the stepper, Exit. */}
      <header className="relative z-20 shrink-0 border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-white/[0.06] dark:bg-[#111318]/80">
        <div className={`${column} flex h-14 items-center gap-4`}>
          <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><AnviMark className="h-6 w-6" /><span className="hidden sm:inline">ANVI</span></span>
          <nav aria-label="Setup steps" className="min-w-0 flex-1">
            <ol className="flex items-center justify-center">
              {phases.map((id, at) => {
                const status = statuses[at];
                const reachable = at <= reached && !busy;
                const last = at === phases.length - 1;
                return <li key={id} data-rail={id} data-status={status} className="flex min-w-0 items-center">
                  <button type="button" onClick={() => goTo(at)} disabled={!reachable} aria-current={status === "current" ? "step" : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-full p-0.5 text-left transition-colors lg:pr-1.5 ${focus} disabled:cursor-default ${reachable && status !== "current" ? "hover:bg-slate-100 dark:hover:bg-white/[0.06]" : ""}`}>
                    <StepMarker status={status} n={at + 1} />
                    <span className={`hidden whitespace-nowrap text-[13px] lg:inline ${status === "current" ? "font-semibold text-slate-900 dark:text-white" : status === "attention" ? "font-medium text-amber-700 dark:text-amber-300" : status === "done" ? "font-medium text-slate-700 dark:text-zinc-300" : "text-slate-400 dark:text-zinc-500"}`}>{PHASES[id].title}</span>
                    <span className="sr-only lg:hidden">{PHASES[id].title}</span>
                    <span className="sr-only">, {STATUS_WORD[status]}</span>
                  </button>
                  {!last && <span aria-hidden="true" className="relative mx-1.5 h-px w-5 bg-slate-200 dark:bg-white/10 sm:w-8 lg:mx-2.5 lg:w-10">
                    <span className={`absolute inset-y-0 left-0 bg-violet-500 transition-[width] duration-500 ease-out motion-reduce:transition-none dark:bg-violet-400 ${at < index ? "w-full" : "w-0"}`} />
                  </span>}
                </li>;
              })}
            </ol>
          </nav>
          {onClose && <button type="button" onClick={onClose} disabled={exitLocked} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100 ${focus}`}>
            <X className="h-4 w-4" aria-hidden="true" /><span>Exit<span className="hidden sm:inline"> setup</span></span>
          </button>}
        </div>
      </header>

      <main ref={bodyRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={current} className={`${column} pb-8 pt-6 lg:pt-8 ${direction === "prev" ? "anvi-slide-prev" : "anvi-slide-next"}`}>
          <div className="mb-5">
            <p data-mobile-progress="" className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
              <span className="text-violet-700 dark:text-violet-300">Step {n} of {phases.length}</span>
              <span aria-hidden="true">·</span><span id="anvi-prestart-title" className="truncate">{setup.title}</span>
            </p>
            <h1 id="anvi-phase-title" ref={headingRef} tabIndex={-1} className={`mt-1.5 text-2xl font-semibold tracking-[-0.015em] text-slate-950 dark:text-white ${noOutline}`}>
              {HEADINGS[current]}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{current === "background" ? (withResume ? INTROS.background : INTROS.backgroundNoResume) : current === "system" && cameraCheck.enabled ? INTROS.systemCamera : INTROS[current]}</p>
          </div>
          {phaseBody}
        </div>
      </main>

      {/* Back / Next (Join on the last phase), fixed to the bottom, inside the content column. */}
      <footer className="relative z-20 shrink-0 border-t border-slate-200/80 bg-white/85 backdrop-blur dark:border-white/[0.06] dark:bg-[#111318]/85">
        <div className={`${column} flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:flex-nowrap`}>
          <p id={onReady ? "anvi-join-hint" : "anvi-phase-hint"} aria-live="polite" className="order-1 w-full text-center text-xs text-slate-500 empty:hidden dark:text-zinc-400 sm:order-2 sm:w-auto sm:min-w-0 sm:flex-1 sm:text-right">{onReady ? joinHint : blocker}</p>
          <div className="order-2 sm:order-1">
            {index > 0 && <button type="button" onClick={() => goTo(index - 1)} disabled={busy} className={secondaryButton}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button>}
          </div>
          <div className="order-3 ml-auto">
            {onReady
              ? <button type="button" onClick={() => void join()} disabled={!canJoin} aria-describedby="anvi-join-hint" data-join="" className={`${primaryButton(canJoin)} h-11 px-6 text-[15px]`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{joinLabel}{!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
              : <button type="button" onClick={next} disabled={Boolean(blocker) || busy} aria-describedby="anvi-phase-hint" data-next="" className={primaryButton(!blocker && !busy)}>
                <span>{index === 0 ? "Continue" : "Next"}<span className="hidden sm:inline">: {PHASES[nextId].title}</span></span><ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>}
          </div>
        </div>
      </footer>
    </div>
  );
}
