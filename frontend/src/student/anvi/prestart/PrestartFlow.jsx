import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BriefcaseBusiness, Check, ClipboardCheck, Loader2, Maximize2, Mic, ShieldCheck, X } from "lucide-react";
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

// Each phase's icon, on the step's header tile.
const PHASE_ICONS = { background: BriefcaseBusiness, system: Mic, proctoring: ShieldCheck, instructions: ClipboardCheck };

// A step in the dark side rail (as in the assessment's secure setup): a numbered circle that turns into
// a tick when done, with a pulse on the current one.
function StepMarker({ status, n }) {
  const base = "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-300";
  if (status === "done") return <span className={`${base} anvi-pop bg-emerald-500 text-white`}><Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /></span>;
  if (status === "attention") return <span className={`${base} bg-amber-400 text-amber-950`}><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span>;
  if (status === "current") return <span className={`${base} bg-violet-600 text-white dark:bg-violet-500`}>
    <span aria-hidden="true" className="absolute inset-0 rounded-full bg-violet-400/40 motion-safe:animate-ping" />
    <span className="relative">{n}</span>
  </span>;
  return <span className={`${base} bg-white text-slate-400 ring-1 ring-inset ring-slate-300 dark:bg-white/5 dark:ring-white/15`}>{n}</span>;
}
const STATUS_WORD = { done: "completed", attention: "needs attention", current: "current step", upcoming: "not started" };
const STATUS_LINE = { done: "Completed", attention: "Needs attention", current: "In progress", upcoming: "Up next" };
const STATUS_TONE = { done: "text-emerald-600 dark:text-emerald-300/90", attention: "text-amber-700 dark:text-amber-300", current: "text-violet-700 dark:text-violet-300", upcoming: "text-slate-400 dark:text-zinc-500" };


/**
 * The pre-start flow of a NEW ANVI attempt, laid out like the assessment's secure setup: one centred card
 * with a dark step rail (steps, their status and the overall progress) beside the current step. Phases:
 * Background (details and resume), System check, Proctoring (only when on), then one compact Review & join
 * screen that combines instructions, consent and the readiness summary.
 * One phase at a time (it scrolls inside the card; phones get the full window and a progress strip) with a
 * fixed Back / Next footer, and each phase gates Next with one short reason. A resume upload runs in the background across
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
  const micCheck = useMicCheck({ support, readAloud: true });
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
    micError: micCheck.mic.state === "error", micSilent: micCheck.silent, micVerified: micCheck.verified, micReading: micCheck.read.state, online: micCheck.online, fullscreenSupported: fsSupported,
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

  const done = statuses.filter((status) => status === "done").length;
  const percent = Math.round((done / Math.max(1, phases.length)) * 100);
  const PhaseIcon = PHASE_ICONS[current] || ClipboardCheck;
  const subtitle = [setup.role, setup.companyName].filter(Boolean).join(" · ");
  const exitButton = (className) => onClose && <button type="button" onClick={onClose} disabled={exitLocked} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${focus} ${className}`}>
    <X className="h-4 w-4" aria-hidden="true" /><span>Exit<span className="hidden sm:inline"> setup</span></span>
  </button>;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="anvi-prestart-title" data-anvi-lobby="prestart" data-phase={current}
      className="fixed inset-0 z-[80] flex h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 p-0 text-slate-900 antialiased [font-family:Inter,ui-sans-serif,system-ui,sans-serif] dark:bg-[#0b0c10] dark:text-zinc-100 sm:p-6">
      <AiMotionStyles />
      {/* A soft wash of the primary colour behind the card. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_0%,rgba(124,58,237,0.10),transparent)] dark:bg-[radial-gradient(60%_70%_at_50%_0%,rgba(139,92,246,0.16),transparent)]" />

      {/* One contained card, centred, as in the assessment's secure setup: the dark step rail on the left,
          the current step on the right with its own Back / Next footer. */}
      <div className="anvi-fade-up relative z-10 flex h-full w-full max-w-6xl overflow-hidden bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/10 dark:bg-[#14161c] dark:shadow-black/40 dark:ring-white/10 sm:h-[min(780px,calc(100dvh-3rem))] sm:rounded-2xl">
        <aside className="relative hidden w-[300px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-gradient-to-b from-violet-50 via-slate-50 to-slate-50 p-7 text-slate-900 dark:border-white/[0.06] dark:from-[#1a1526] dark:via-[#121319] dark:to-[#0f1015] dark:text-white md:flex">
          <span aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-600/25" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-20 h-64 w-64 rounded-full bg-fuchsia-200/30 blur-3xl dark:bg-fuchsia-500/10" />
          <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
            <AnviMark className="h-5 w-5" />Interview setup
          </div>
          <h2 id="anvi-prestart-title" className="relative mt-3 text-xl font-semibold leading-snug">{setup.title}</h2>
          {subtitle && <p className="relative mt-1 text-sm font-medium text-slate-600 dark:text-zinc-300">{subtitle}</p>}
          <p className="relative mt-2 text-sm leading-6 text-slate-500 dark:text-zinc-400">
            {assigned ? "Scheduled by your institution. " : ""}Complete these quick steps. The interview starts only when you join.
          </p>

          <nav aria-label="Setup steps" className="relative mt-8">
            <ol>
              {phases.map((id, at) => {
                const status = statuses[at];
                const reachable = at <= reached && !busy;
                const last = at === phases.length - 1;
                return <li key={id} data-rail={id} data-status={status} className="relative pb-5 last:pb-0">
                  {!last && <span aria-hidden="true" className={`absolute left-[1.375rem] top-12 h-[calc(100%-2.75rem)] w-px transition-colors duration-500 ${status === "done" ? "bg-emerald-400/70" : "bg-slate-200 dark:bg-white/10"}`} />}
                  <button type="button" onClick={() => goTo(at)} disabled={!reachable} aria-current={status === "current" ? "step" : undefined}
                    className={`flex w-full items-start gap-3.5 rounded-xl p-1.5 text-left transition-colors disabled:cursor-default ${focus} ${status === "current" ? "bg-white shadow-sm ring-1 ring-slate-900/[0.06] dark:bg-white/[0.06] dark:shadow-none dark:ring-white/10" : reachable ? "hover:bg-white/70 dark:hover:bg-white/[0.05]" : ""}`}>
                    <StepMarker status={status} n={at + 1} />
                    <span className="min-w-0 pt-0.5">
                      <span className={`block text-sm font-medium ${status === "current" ? "text-slate-950 dark:text-white" : status === "upcoming" ? "text-slate-400 dark:text-zinc-500" : "text-slate-700 dark:text-zinc-200"}`}>{PHASES[id].title}</span>
                      <span className={`mt-0.5 block text-xs ${STATUS_TONE[status]}`} aria-hidden="true">{STATUS_LINE[status]}</span>
                      <span className="sr-only">, {STATUS_WORD[status]}</span>
                    </span>
                  </button>
                </li>;
              })}
            </ol>
          </nav>

          <div className="relative mt-auto pt-6">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
              <span>{done} of {phases.length} steps complete</span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
            </div>
            {exitButton("-ml-2 mt-5 text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white")}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {/* Phones and tablets: the rail folds into a progress strip. */}
          <div className="shrink-0 border-b border-slate-200 px-5 py-3 dark:border-white/[0.06] md:hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><AnviMark className="h-5 w-5 shrink-0" /><span className="truncate">{setup.title}</span></span>
              {exitButton("text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100")}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-violet-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.round((n / phases.length) * 100)}%` }} />
            </div>
          </div>

          <main ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div key={current} className={`px-5 py-6 sm:px-9 sm:py-8 ${direction === "prev" ? "anvi-slide-prev" : "anvi-slide-next"}`}>
              <div className="mb-7 flex items-start gap-4">
                <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20 sm:flex">
                  <PhaseIcon className="h-7 w-7" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p data-mobile-progress="" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500">
                    Step {n} of {phases.length}<span className="md:hidden"> · {PHASES[current].title}</span>
                  </p>
                  <h1 id="anvi-phase-title" ref={headingRef} tabIndex={-1} className={`mt-1 text-2xl font-semibold tracking-[-0.015em] text-slate-950 dark:text-white ${noOutline}`}>
                    {HEADINGS[current]}
                  </h1>
                  <p className="mt-1.5 max-w-xl text-[15px] leading-6 text-slate-500 dark:text-zinc-400">{current === "background" ? (withResume ? INTROS.background : INTROS.backgroundNoResume) : current === "system" && cameraCheck.enabled ? INTROS.systemCamera : INTROS[current]}</p>
                </div>
              </div>
              {phaseBody}
            </div>
          </main>

          {/* Back / Next (Join on the last phase), fixed to the bottom of the card. */}
          <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3.5 dark:border-white/[0.06] dark:bg-[#14161c] sm:px-9">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap">
              <p id={onReady ? "anvi-join-hint" : "anvi-phase-hint"} aria-live="polite" className="order-1 w-full text-center text-xs text-slate-500 empty:hidden dark:text-zinc-400 sm:order-2 sm:w-auto sm:min-w-0 sm:flex-1 sm:text-right">{onReady ? joinHint : blocker}</p>
              <div className="order-2 sm:order-1">
                {index > 0 && <button type="button" onClick={() => goTo(index - 1)} disabled={busy} className={secondaryButton}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button>}
              </div>
              <div className="order-3 ml-auto">
                {onReady
                  ? <button type="button" onClick={() => void join()} disabled={!canJoin} aria-describedby="anvi-join-hint" data-join="" className={`${primaryButton(canJoin)} h-11 min-w-[180px] px-6 text-[15px]`}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{joinLabel}{!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  : <button type="button" onClick={next} disabled={Boolean(blocker) || busy} aria-describedby="anvi-phase-hint" data-next="" className={`${primaryButton(!blocker && !busy)} h-11 min-w-[180px]`}>
                    <span>{index === 0 ? "Continue" : "Next"}<span className="hidden sm:inline">: {PHASES[nextId].title}</span></span><ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>}
              </div>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
