import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronUp, Loader2, Maximize, Mic, MicOff, PauseCircle, PhoneOff, RefreshCw, ShieldAlert, ShieldCheck, VideoOff, X } from "lucide-react";
import { AnviMark } from "../../../components/AnviApproach";
import { modeLabel } from "../anviSchedule";
import { AnviTile, LevelBars, YouTile } from "./CallTiles";
import ControlBar from "./ControlBar";
import EndDialog from "./EndDialog";
import SidePanel, { FollowUpChip } from "./SidePanel";
import { chip, clockText, pointsToEndButton, surface, surfaceRing, surfaceShadow, useLevelVar, useMediaQuery, useNow } from "./callUtils";
import { hasProctoringSettings, proctoringSettingsOf, useAnviProctoring, violationsOf } from "./useAnviProctoring";
import { useAnviCameraProctoring } from "./useAnviCameraProctoring";
import { getProctoringStatusText } from "../../../features/assessment/student/components/ProctoringStatusBadge";

// [desktop text, phone text]. Phone strings fit one line at 390 px.
const STATUS_TEXT = {
  connecting: ["Connecting to ANVI…", "Connecting to ANVI…"],
  speaking: ["ANVI is speaking…", "ANVI is speaking…"],
  listening: ["Listening — pause 2 s when you finish", "Listening — pause 2 s to finish"],
  thinking: ["ANVI is thinking…", "ANVI is thinking…"],
  taken_over: ["This interview is open in another tab", "Open in another tab"],
  ending: ["Wrapping up your interview…", "Wrapping up…"],
  ended: ["Interview finished. Saving your answers…", "Finished. Saving answers…"],
  error: ["Paused", "Paused"],
  muted: ["Your microphone is muted. Unmute to answer (M).", "Muted. Press unmute to answer"],
  talkingMuted: ["You are talking while muted. Unmute to answer (M).", "You are muted. Unmute to answer"],
  proctorPaused: ["Interview paused. Return to fullscreen to continue.", "Paused. Return to fullscreen"],
  tabPaused: ["Interview paused. Return to this tab to continue.", "Paused. Return to this tab"],
  cameraPaused: ["Interview paused. Turn your camera back on to continue.", "Paused. Turn your camera on"],
  serverHeld: ["ANVI is still paused. Resuming the interview…", "Resuming the interview…"],
  // Hybrid (turn-based) interviews only.
  preparing: ["Preparing the question…", "Preparing the question…"],
  playing: ["ANVI is asking the question…", "ANVI is asking…"],
  followUp: ["ANVI is asking a follow-up…", "Asking a follow-up…"],
  recording: ["Recording your answer…", "Recording your answer…"],
  ptt: ["Hold Space or the talk button to answer", "Hold the talk button to answer"],
  processing: ["Processing your answer…", "Processing your answer…"],
  moving: ["Moving to the next question…", "Next question…"],
  closing: ["Wrapping up. Your report is being prepared…", "Preparing your report…"],
  hybridEnded: ["Interview finished. Your report is being prepared…", "Finished. Preparing your report…"],
};
// Hybrid listening says how long a pause ends the answer (the server's hangover).
const secondsText = (ms) => String(Math.round((Number(ms) || 2000) / 100) / 10);
const hybridListeningText = (hangoverMs) => {
  const seconds = secondsText(hangoverMs);
  return [`Listening — pause ${seconds} s when you finish`, `Listening — pause ${seconds} s to finish`];
};

/**
 * The status key of a hybrid call while it is live and not paused or muted: the prompt playing (or a
 * follow-up), the answer being recorded, listening (hands-free or push-to-talk), or the server's state.
 * A Live block inside it uses the Live keys.
 */
function hybridStatusKey({ turnState, activity, promptKind = "", recording = false, inputMode = "vad", socketMode = "turn" } = {}) {
  if (socketMode === "live") return STATUS_TEXT[activity] ? activity : "listening";
  // A prompt playing; an acknowledgement clip ("Okay.") while processing keeps the processing line.
  if (["preparing", "playing", "follow_up"].includes(turnState) && (activity === "speaking" || turnState !== "preparing")) return promptKind === "follow_up" ? "followUp" : "playing";
  if (recording) return "recording";
  if (turnState === "listening") return inputMode === "ptt" ? "ptt" : "hybridListening";
  return ["preparing", "playing", "processing", "moving", "closing"].includes(turnState) ? turnState : "preparing";
}
// Talking louder than this while muted shows the "you are muted" hint.
const MUTED_TALK_RMS = 0.03;
// How long the End controls stay highlighted after ANVI points to them.
const END_HINT_MS = 45_000;

// Banners float over the top of the stage, so a reconnect or error never pushes the tiles down.
const bannerTone = "pointer-events-auto flex w-full items-start gap-3 rounded-xl bg-amber-50/95 px-4 py-3 text-left text-sm text-amber-950 shadow-lg shadow-amber-900/10 ring-1 ring-inset ring-amber-300/70 backdrop-blur-md dark:bg-[#2a2414]/95 dark:text-amber-50 dark:shadow-black/40 dark:ring-amber-300/30";
const bannerButton = "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200 dark:focus-visible:outline-amber-200";
const bannerIcon = "mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300";
const pillNeutral = "bg-white/70 text-slate-700 ring-slate-900/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/[0.08]";
const pillAmber = "bg-amber-50 text-amber-800 ring-amber-300/70 dark:bg-amber-400/15 dark:text-amber-100 dark:ring-amber-300/30";

/** The room's backdrop: slow-drifting violet, cyan and fuchsia light over a faint dot grid. */
function RoomBackdrop() {
  return <div aria-hidden="true" className="anvi-room-backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    <style>{`
      @keyframes anviRoomDrift { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(3%, -4%, 0) scale(1.08); } }
      .anvi-room-backdrop .drift { animation: anviRoomDrift 28s ease-in-out infinite; will-change: transform; }
      .anvi-room-backdrop .drift-slow { animation: anviRoomDrift 40s ease-in-out infinite reverse; will-change: transform; }
      @media (prefers-reduced-motion: reduce) { .anvi-room-backdrop * { animation: none !important; } }
    `}</style>
    <span className="drift absolute -left-[14%] -top-[22%] h-[62vmax] w-[62vmax] rounded-full bg-violet-300/40 blur-[120px] dark:bg-violet-600/[0.18]" />
    <span className="drift-slow absolute -right-[18%] top-[18%] h-[52vmax] w-[52vmax] rounded-full bg-cyan-200/45 blur-[120px] dark:bg-cyan-500/[0.08]" />
    <span className="drift absolute -bottom-[30%] left-[22%] h-[48vmax] w-[48vmax] rounded-full bg-fuchsia-200/40 blur-[130px] dark:bg-fuchsia-600/[0.09]" />
    <span className="absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_75%)] dark:bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)]" />
  </div>;
}

function LivePill({ status, compact = false }) {
  const amber = [pillAmber, "bg-amber-500 dark:bg-amber-400"];
  const grey = [pillNeutral, "bg-slate-400 dark:bg-zinc-400"];
  const tone = {
    live: ["Live", "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-400/30", "bg-rose-500"],
    reconnecting: ["Reconnecting", ...amber],
    error: ["Paused", ...amber],
    taken_over: ["Paused", ...amber],
    ending: ["Ending", ...grey],
    ended: ["Ended", ...grey],
  }[status] || ["Connecting", ...grey];
  const [label, pill, dot] = tone;
  const live = status === "live";
  // On phones only "Live" keeps its label (unless the header is crowded by the Proctored pill); other
  // states shrink to the coloured dot (the banner explains them).
  const keepLabel = live && !compact;
  return <span title={label} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 text-xs font-semibold ring-1 ring-inset ${keepLabel ? "px-2.5" : "px-2 sm:px-2.5"} ${pill}`}>
    <span className="relative flex h-2 w-2">
      {live && <span aria-hidden="true" className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70 motion-reduce:hidden" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
    </span><span className={keepLabel ? "" : "max-sm:sr-only"}>{label}</span>
  </span>;
}

/** "Proctored" with the violation count; amber once anything was counted. */
function ProctorPill({ violations, maxViolations, onLimit }) {
  const flagged = violations > 0;
  const limited = maxViolations > 0 && onLimit === "end";
  const count = limited ? `${violations}/${maxViolations}` : String(violations);
  const title = `Proctored interview: ${violations} violation${violations === 1 ? "" : "s"} recorded${limited ? `; it ends at ${maxViolations}` : ""}.`;
  const Icon = flagged ? ShieldAlert : ShieldCheck;
  return <span data-testid="anvi-proctor-pill" title={title} aria-label={title}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset sm:px-2.5 ${flagged ? pillAmber : pillNeutral}`}>
    <Icon className="h-3.5 w-3.5" aria-hidden="true" /><span className="max-sm:sr-only">Proctored</span>
    <span aria-hidden="true" className={`rounded-full px-1.5 tabular-nums ${flagged ? "bg-amber-500/15 dark:bg-amber-300/15" : "bg-slate-900/[0.06] dark:bg-white/10"}`}>{count}</span>
  </span>;
}

/** One timer: time left. The elapsed time is in its tooltip. */
/** `header`: in the crowded phone header the "left" word is dropped (the aria-label keeps it). */
function Timer({ startedAt, deadlineAt, header = false }) {
  const now = useNow(1000);
  const [mountedAt] = useState(() => Date.now());
  const started = new Date(startedAt).getTime();
  const elapsed = (now - (Number.isFinite(started) ? started : mountedAt)) / 1000;
  const end = new Date(deadlineAt).getTime();
  const left = Number.isFinite(end) ? Math.max(0, Math.round((end - now) / 1000)) : null;
  if (left === null) return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${pillNeutral}`} title="Time in this interview">{clockText(elapsed)}</span>;
  return <span title={`Elapsed ${clockText(elapsed)}`} aria-label={`Time left ${Math.floor(left / 60)} minutes ${left % 60} seconds`}
    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${left < 120 ? pillAmber : pillNeutral}`}>
    {clockText(left)}<span className={header ? "max-sm:hidden" : ""}> left</span>
  </span>;
}

/**
 * `pauseKey`: "proctorPaused", "tabPaused", "cameraPaused" or "serverHeld" while proctoring holds the interview.
 * `hybrid`: `{ key, hangoverMs, recording }` for a hybrid call (absent for Live).
 */
function StatusPill({ status, activity, muted, talkingMuted, pauseKey = "", getLevel, compact, hybrid = null }) {
  const levelRef = useLevelVar(getLevel);
  const live = status === "live";
  const showMuted = live && muted && activity !== "speaking";
  let key = showMuted ? (talkingMuted ? "talkingMuted" : "muted") : live ? (STATUS_TEXT[activity] ? activity : "listening") : STATUS_TEXT[status] ? status : "connecting";
  if (hybrid && live && !showMuted) key = hybrid.key;
  else if (hybrid && status === "ended") key = "hybridEnded";
  const paused = live && Boolean(STATUS_TEXT[pauseKey]);
  if (paused) key = pauseKey;
  const text = (key === "hybridListening" ? hybridListeningText(hybrid?.hangoverMs) : STATUS_TEXT[key])[compact ? 1 : 0];
  const recording = Boolean(hybrid) && key === "recording";
  let icon = <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400 motion-reduce:animate-none dark:text-zinc-400" aria-hidden="true" />;
  if (paused) icon = <PauseCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />;
  else if (showMuted) icon = <MicOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />;
  else if (recording) icon = <span data-testid="anvi-recording" aria-hidden="true" className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 dark:bg-rose-400" /></span>;
  else if (live && activity === "speaking") icon = <LevelBars />;
  else if (live && activity === "listening") icon = <span aria-hidden="true" className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400" /></span>;
  else if (live && activity === "thinking") icon = <span aria-hidden="true" className="inline-flex shrink-0 gap-1">{[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 motion-reduce:animate-none dark:bg-violet-300" style={{ animationDelay: `${delay}ms` }} />)}</span>;
  else if (status === "ended") icon = <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />;
  else if (status === "error" || status === "taken_over") icon = <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />;
  const tone = (showMuted && talkingMuted) || paused ? pillAmber : `${surface} ${surfaceRing} text-slate-800 shadow-sm dark:text-zinc-100 dark:shadow-none`;
  return <p ref={levelRef} role="status" aria-live="polite" className={`mx-auto inline-flex max-w-full items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset ${tone}`}>
    {icon}<span className="min-w-0 text-center max-sm:whitespace-normal sm:truncate">{text}</span>
  </p>;
}

const norm = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * An ANVI line that only repeats the question already on screen is shortened to a pointer, so the
 * question is not shown twice. A preamble before the question ("Ab doosra sawaal.") is kept.
 */
function captionParts(line, question) {
  if (line.role !== "anvi" || !question) return { text: line.text };
  const q = question.text.trim();
  const label = "the current prompt";
  const index = q.length >= 12 ? line.text.indexOf(q) : -1;
  const before = index >= 0 ? line.text.slice(0, index).trim() : "";
  if (before) return { text: before, pointer: `(${label}, shown ${question.where})` };
  if (index >= 0 || (q && norm(line.text) === norm(q))) return { text: "", pointer: `Asked ${label}, shown ${question.where}.` };
  return { text: line.text };
}

/**
 * One caption line: the speaker in a fixed left column, the words in a box `rows` lines tall that keeps
 * the newest words in view. Older rows leave through the top behind a fade, so the text always breaks at
 * word boundaries and the speaker label never scrolls away.
 */
function CaptionLine({ line, question, rows }) {
  const boxRef = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const { text, pointer } = captionParts(line, question);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) setOverflow(box.scrollHeight > box.clientHeight + 1);
  }, [text, pointer, rows]);
  // Re-measure when the strip is resized (rotation, side panel opening).
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(() => setOverflow(box.scrollHeight > box.clientHeight + 1));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const anvi = line.role === "anvi";
  return <div className="flex gap-3">
    <span className={`w-9 shrink-0 pt-[3px] text-xs font-semibold uppercase leading-5 tracking-wider ${anvi ? "text-violet-700 dark:text-violet-300" : "text-sky-700 dark:text-sky-300"}`}>{anvi ? "ANVI" : "You"}</span>
    <div ref={boxRef} style={{ maxHeight: `${rows * 1.5}rem` }}
      className={`flex min-w-0 flex-1 flex-col justify-end overflow-hidden ${overflow ? "[mask-image:linear-gradient(to_bottom,transparent,#000_1.25rem)]" : ""}`}>
      <p className="text-[15px] leading-6 text-slate-800 dark:text-zinc-100 sm:text-base">
        {text}{text && pointer ? " " : ""}{pointer && <span className="text-sm text-slate-500 dark:text-zinc-400">{pointer}</span>}
      </p>
    </div>
  </div>;
}

/** Live captions under the stage: the latest line from each side (one on phones), newest last. */
function CaptionStrip({ captions, compact = false, question = null }) {
  const lines = captions.slice(compact ? -1 : -2);
  if (!lines.length) return <p className="text-center text-sm text-slate-500 dark:text-zinc-500">Captions appear here as you talk.</p>;
  return <div className="space-y-1.5">
    {lines.map((line) => <CaptionLine key={line.id} line={line} question={question} rows={compact ? 3 : 2} />)}
  </div>;
}

const overlayPrimary = "inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 motion-reduce:transition-none dark:bg-violet-500 dark:hover:bg-violet-400 dark:shadow-violet-950/40";
const overlaySecondary = "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-violet-700 ring-1 ring-violet-300 transition hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 motion-reduce:transition-none dark:text-violet-200 dark:ring-violet-400/40 dark:hover:bg-violet-500/10";

// The overlay's title per pause reason (useAnviProctoring's `pauseReason`, in the server's terms).
const PAUSE_TITLES = {
  fullscreen_exit: "Interview paused — return to fullscreen to continue",
  tab_hidden: "Interview paused — return to this tab to continue",
  camera_blocked: "Interview paused — turn your camera back on to continue",
  server: "ANVI is still paused — resuming the interview",
};
// The status pill's text key per pause reason.
const PAUSE_KEYS = { fullscreen_exit: "proctorPaused", tab_hidden: "tabPaused", camera_blocked: "cameraPaused", server: "serverHeld" };

/**
 * Blocks the room while proctoring pauses the interview: the room's own pause (out of fullscreen, a
 * hidden tab, a blocked camera under the pause rule) or whenever the server says it holds. The action
 * follows the reason (Return to fullscreen inside this click, Retry camera, or Resume interview when the
 * room is back but the server still holds); End interview stays available and the timer keeps running.
 */
function PauseOverlay({ proctor, camera, onEnd, endDisabled, startedAt, deadlineAt, trapFocus = true }) {
  const returnRef = useRef(null);
  const dialogRef = useRef(null);
  const reason = PAUSE_TITLES[proctor.pauseReason] ? proctor.pauseReason : "fullscreen_exit";
  useEffect(() => { (returnRef.current || dialogRef.current?.querySelector("button:not([disabled])"))?.focus(); }, [reason]);
  // Keep Tab and Shift+Tab inside the modal (the End dialog above it traps its own focus).
  useEffect(() => {
    if (!trapFocus) return undefined;
    const onKey = (event) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trapFocus]);
  const forCamera = reason === "camera_blocked";
  const resuming = reason === "server";
  // Each fix the room can see is offered; the one the pause is about comes first, as the primary.
  const needsFullscreen = proctor.fullscreenRequired && !proctor.isFullscreen;
  const needsCamera = Boolean(camera?.blocked);
  const primary = resuming ? "resume" : forCamera && needsCamera ? "camera" : needsFullscreen ? "fullscreen" : needsCamera ? "camera" : "";
  const actions = [
    needsFullscreen && { key: "fullscreen", label: "Return to fullscreen", Icon: Maximize, onClick: () => { void proctor.requestFullscreen(); } },
    needsCamera && { key: "camera", label: "Retry camera", Icon: RefreshCw, onClick: camera.retry },
    resuming && { key: "resume", label: "Resume interview", Icon: RefreshCw, onClick: proctor.resumeServer },
  ].filter(Boolean).sort((a, b) => (b.key === primary) - (a.key === primary));
  // A camera pause is logged, not counted as a violation.
  const recorded = reason === "fullscreen_exit" && proctor.leftFullscreen && proctor.label;
  return <div ref={dialogRef} data-testid="anvi-pause-overlay" data-reason={reason} role="dialog" aria-modal="true" aria-labelledby="anvi-pause-title" aria-describedby="anvi-pause-body"
    className="fixed inset-0 z-[88] flex items-center justify-center bg-slate-50/75 p-4 backdrop-blur-xl dark:bg-[#0a0b10]/80">
    <div className={`w-full max-w-md rounded-3xl p-6 text-center ring-1 sm:p-8 ${surface} ${surfaceRing} ${surfaceShadow}`}>
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-700 ring-1 ring-violet-200 dark:from-violet-500/20 dark:to-fuchsia-500/10 dark:text-violet-200 dark:ring-violet-400/20">
        <PauseCircle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 id="anvi-pause-title" className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{PAUSE_TITLES[reason]}</h2>
      <p id="anvi-pause-body" className="mt-2 text-sm leading-6 text-slate-600 dark:text-zinc-300">
        {resuming
          ? "You are back, so the interview is resuming. ANVI is waiting and your microphone stays off until it does. "
          : `${forCamera && camera?.blockedMessage ? `${camera.blockedMessage} ` : ""}ANVI is waiting and your microphone is off. When you return, ANVI repeats the current question. `}
        <span className="font-semibold text-slate-800 dark:text-zinc-100">The timer keeps running while the interview is paused.</span>
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Timer startedAt={startedAt} deadlineAt={deadlineAt} />
        {recorded && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${pillAmber}`}>{proctor.label} · leaving fullscreen was recorded</span>}
      </div>
      {proctor.fullscreenError && <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{proctor.fullscreenError}</p>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {actions.map(({ key, label, Icon, onClick }, index) => <button key={key} ref={index === 0 ? returnRef : undefined} type="button" onClick={onClick} className={index === 0 ? overlayPrimary : overlaySecondary}>
          <Icon className="h-4 w-4" aria-hidden="true" />{label}
        </button>)}
        <button type="button" onClick={onEnd} disabled={endDisabled}
          className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:opacity-40 motion-reduce:transition-none dark:text-rose-200 dark:ring-rose-400/40 dark:hover:bg-rose-500/10">
          <PhoneOff className="h-4 w-4" aria-hidden="true" />End interview
        </button>
      </div>
    </div>
  </div>;
}

/** "Warning 2 of 3. You left fullscreen…" unless the server's message already names the warning. */
const withLabel = (label, message) => (!label || /warning\s+\d+\s+of\s+\d+/i.test(message) ? message : `${label}. ${message}`);

/**
 * The live call stage, like Teams or Meet, following the app theme: ANVI is the main stage and the
 * student's optional mirror view is a compact overlay. The question/transcript panel, captions and
 * controls stay visible without competing for stage space. Proctoring remains active when the mirror
 * preview is hidden.
 */
export default function LiveCall({ attempt, live, studentName, studentAvatar = "", cameraStream = null, finishError, onRetryFinish }) {
  const { status, activity, serverState, captions, error } = live;
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const tablet = useMediaQuery("(min-width: 768px)", true);
  const [panelOpen, setPanelOpen] = useState(wide);
  const [tab, setTab] = useState("question");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [selfViewOpen, setSelfViewOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [talkingMuted, setTalkingMuted] = useState(false);

  // The join ack carries the running settings (and the live state may); then the attempt detail, whose
  // running view is { enabled, settings, counts, violations }. An older counts-only view
  // ({ enabled: false, counts }) has no settings and never decides them.
  const proctorSource = [live.joinProctoring, serverState?.proctoring, attempt?.proctoring].find(hasProctoringSettings) || null;
  const proctorSettings = useMemo(() => proctoringSettingsOf(proctorSource), [proctorSource]);
  // Known once a source has them, or once a join without them (proctoring off) went through.
  const [joinedOnce, setJoinedOnce] = useState(false);
  useEffect(() => { if (status === "live") setJoinedOnce(true); }, [status]);
  const settingsKnown = Boolean(proctorSource) || joinedOnce || status === "ended";
  // Camera AI (Assessment's ProctoringManager) feeds its confirmed findings to the proctoring hook.
  const reportAiRef = useRef(null);
  const onAiViolation = useCallback((event) => reportAiRef.current?.(event), []);
  const camera = useAnviCameraProctoring({
    enabled: proctorSettings.enabled && proctorSettings.ai.enabled,
    aiSettings: proctorSettings.ai,
    initialStream: cameraStream,
    // A tab another one took over releases the camera; "Continue here" starts it again.
    running: status !== "ended" && status !== "taken_over",
    settled: settingsKnown,
    onViolation: onAiViolation,
  });
  const proctor = useAnviProctoring({
    settings: proctorSettings, live,
    initialViolations: violationsOf(attempt?.proctoring),
    serverViolations: Math.max(violationsOf(live.joinProctoring), violationsOf(serverState?.proctoring)),
    cameraBlocked: camera.blocked,
  });
  useEffect(() => { reportAiRef.current = proctor.reportAi; });
  // The blocking pause overlay: the room's own pause, or the server saying it holds (the room retries
  // on its own when it is back and offers Resume interview).
  const proctorPaused = proctor.pauseShown;
  const serverHeld = proctor.serverHeld && !proctor.paused;
  const pauseKey = proctorPaused ? PAUSE_KEYS[proctor.pauseReason] || "proctorPaused" : serverHeld ? "serverHeld" : "";
  // The phone sheet would sit outside the overlay's inert stage: it closes when a pause starts.
  useEffect(() => { if (proctorPaused && !wide) setPanelOpen(false); }, [proctorPaused, wide]);
  const cameraTile = camera.enabled ? {
    videoRef: camera.videoRef,
    live: camera.hasStream && !camera.blocked,
    previewVisible: selfViewOpen,
    onTogglePreview: () => setSelfViewOpen((value) => !value),
    status: camera.status,
    statusText: getProctoringStatusText,
  } : null;

  // Hybrid (turn-based) call: the same room plus Repeat, push-to-talk / Done, and its own status line.
  const hybrid = live.runtimeMode === "hybrid";
  const muted = Boolean(live.muted);
  const canMute = typeof live.setMuted === "function" && status !== "ended" && status !== "ending";
  const toggleMute = useCallback(() => { if (canMute) live.setMuted(!muted); }, [canMute, live, muted]);
  const toggleCaptions = useCallback(() => setCaptionsOn((value) => !value), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const cancelEnd = useCallback(() => setConfirmEnd(false), []);
  // When ANVI points the student to the End button (they asked to finish, voice ending is off), both End
  // controls are highlighted for a while so the way out is obvious.
  const lastAnvi = useMemo(() => captions.findLast?.((line) => line.role === "anvi") || null, [captions]);
  const [endHint, setEndHint] = useState(false);
  const hintedLine = useRef("");
  useEffect(() => {
    if (!lastAnvi || hintedLine.current === lastAnvi.id || !pointsToEndButton(lastAnvi.text)) return;
    hintedLine.current = lastAnvi.id;
    setEndHint(true);
  }, [lastAnvi]);
  useEffect(() => {
    if (!endHint) return undefined;
    const id = setTimeout(() => setEndHint(false), END_HINT_MS);
    return () => clearTimeout(id);
  }, [endHint]);
  const askEnd = useCallback(() => { setEndHint(false); setConfirmEnd(true); }, []);

  // Keyboard shortcuts: M mutes, C toggles captions. Ignored while typing, with modifiers, in the dialog
  // or while proctoring has paused the interview.
  useEffect(() => {
    const onKey = (event) => {
      if (confirmEnd || proctorPaused || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key?.toLowerCase();
      if (key === "m") { event.preventDefault(); toggleMute(); }
      else if (key === "c") { event.preventDefault(); toggleCaptions(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmEnd, proctorPaused, toggleCaptions, toggleMute]);

  // Hybrid: holding Space is push-to-talk, under the same guards as the shortcuts above (and never on a
  // focused button, link or tab, where Space activates it). A dialog, a pause or a lost focus releases it.
  const pttRef = useRef(null);
  useEffect(() => { pttRef.current = hybrid ? { down: live.pttDown, up: live.pttUp } : null; });
  useEffect(() => {
    if (!hybrid || confirmEnd || proctorPaused) return undefined;
    let held = false;
    const isSpace = (event) => event.key === " " || event.code === "Space";
    const release = () => { if (held) { held = false; pttRef.current?.up?.(); } };
    const onDown = (event) => {
      if (!isSpace(event) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target?.closest?.("input, textarea, select, [contenteditable='true'], button, a, [role='tab']")) return;
      event.preventDefault();
      if (event.repeat || held) return;
      held = Boolean(pttRef.current?.down?.());
    };
    const onUp = (event) => { if (isSpace(event) && held) { event.preventDefault(); release(); } };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [hybrid, confirmEnd, proctorPaused]);

  // Notice speech while muted (polled: no re-render per audio frame).
  useEffect(() => {
    if (!muted || typeof live.mutedLevel !== "function") { setTalkingMuted(false); return undefined; }
    let lastLoud = 0;
    const id = setInterval(() => {
      if (live.mutedLevel() > MUTED_TALK_RMS) lastLoud = Date.now();
      const talking = Date.now() - lastLoud < 1500;
      setTalkingMuted((value) => (value === talking ? value : talking));
    }, 200);
    return () => clearInterval(id);
  }, [muted, live]);

  const phase = status === "live" ? (proctorPaused || serverHeld ? "idle" : activity) : status === "ended" ? "idle" : "connecting";
  const anviLevel = status === "live" && activity === "speaking" ? live.outputLevel : null;
  const youLevel = status === "live" && activity === "listening" && !muted && !proctorPaused && !serverHeld ? live.inputLevel : null;
  const followUp = Boolean(serverState?.followUp);
  const questionText = serverState?.questionText || "";
  const deadlineAt = serverState?.deadlineAt || attempt.hardDeadline;
  const ending = status === "ending" || status === "ended";
  const orbSize = wide ? 260 : tablet ? 220 : 200;
  const hybridTips = hybrid ? { hangoverMs: live.hangoverMs, inputMode: live.inputMode, onInputMode: live.setInputMode } : null;
  const panelProps = { tab, onTab: setTab, onClose: closePanel, followUp, questionText, captions, studentName, ...(hybrid ? { hybrid: hybridTips } : {}) };
  const openQuestion = () => { setTab("question"); setPanelOpen(true); };
  const scheduled = attempt.assignmentId ? `Scheduled · ${modeLabel(attempt.mode).replace(/ interview$/, "")}` : "";
  const docked = panelOpen && wide;
  const endedForLimit = status === "ended" && live.endReason === "proctoring_limit";

  // Where the current question is already on screen, captions point to it instead of repeating it.
  // A hybrid call always shows it: on wide screens a question card sits above the captions whenever the
  // panel's Question tab is not open.
  const inPanel = docked && tab === "question";
  const questionBar = hybrid && wide && !inPanel;
  const questionShown = !wide || inPanel || questionBar;
  const captionQuestion = questionText && questionShown ? { text: questionText, where: wide && inPanel ? "in the panel" : "above" } : null;
  const hybridStatus = hybrid ? {
    key: hybridStatusKey({ turnState: live.turnState, activity, promptKind: live.promptKind, recording: live.recording, inputMode: live.inputMode, socketMode: live.socketMode }),
    hangoverMs: live.hangoverMs,
  } : null;
  const turnMode = hybrid && live.socketMode !== "live";
  const hybridControls = hybrid ? {
    onRepeat: live.replay,
    canRepeat: status === "live" && turnMode && Boolean(live.canReplay) && !proctorPaused && !serverHeld,
    inputMode: live.inputMode,
    onPttDown: live.pttDown,
    onPttUp: live.pttUp,
    pttHeld: Boolean(live.pttHeld),
    onDone: live.done,
    canDone: status === "live" && turnMode && !muted && !proctorPaused && !serverHeld && (live.turnState === "listening" || Boolean(live.recording)),
    canTalk: status === "live" && turnMode && !muted && !proctorPaused && !serverHeld,
  } : null;
  // The open transcript already shows every line.
  const showCaptions = captionsOn && !(docked && tab === "transcript");

  const banners = [];
  if (error || status === "taken_over") banners.push(<div key="error" role="alert" className={bannerTone}>
    <AlertTriangle className={bannerIcon} aria-hidden="true" />
    <span className="flex-1">{status === "taken_over" ? "This interview is open in another tab. Continue here to move it to this tab." : error.message}</span>
    {status !== "taken_over" && error?.action === "end"
      ? <button type="button" onClick={() => { void live.end(); }} className={bannerButton}><PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />End again</button>
      : (status === "taken_over" || error?.retryable) && <button type="button" onClick={live.retry} className={bannerButton}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{status === "taken_over" ? "Continue here" : "Try again"}
      </button>}
    {status !== "taken_over" && error && !error.retryable && <Link to="/student/ai-interviews" className={bannerButton}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />All interviews</Link>}
    {error && status !== "taken_over" && <button type="button" onClick={live.dismissError} aria-label="Dismiss" className="rounded-full p-0.5 text-amber-700 hover:bg-amber-900/5 dark:text-amber-200 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>}
  </div>);
  else if (status === "reconnecting") banners.push(<div key="reconnecting" role="status" className={bannerTone}>
    <Loader2 className={`${bannerIcon} animate-spin motion-reduce:animate-none`} aria-hidden="true" />
    <span className="flex-1"><span className="font-semibold">Reconnecting to ANVI.</span> Your answers so far are saved, and ANVI continues where you left off. Stay on this page.</span>
  </div>);
  // Hybrid: a noisy room (or answers that came out empty) suggests push-to-talk, one tap away.
  if (hybrid && live.suggestPtt && live.inputMode === "vad" && status === "live" && !proctorPaused) banners.push(<div key="ptt" role="status" data-testid="anvi-ptt-suggestion" className={bannerTone}>
    <Mic className={bannerIcon} aria-hidden="true" />
    <span className="flex-1">It sounds noisy where you are. With push-to-talk, ANVI records only while you hold the talk button or Space.</span>
    <button type="button" onClick={() => live.setInputMode("ptt")} className={bannerButton}>Use push-to-talk</button>
    <button type="button" onClick={live.dismissPttSuggestion} aria-label="Dismiss" className="rounded-full p-0.5 text-amber-700 hover:bg-amber-900/5 dark:text-amber-200 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
  </div>);
  if (live.audioPaused && status === "live") banners.push(<div key="audio" role="alert" className={bannerTone}>
    <AlertTriangle className={bannerIcon} aria-hidden="true" />
    <span className="flex-1">Your device paused the audio (for example a call or a locked screen). ANVI cannot hear you until it resumes.</span>
    <button type="button" onClick={live.resumeAudio} className={bannerButton}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Resume audio</button>
  </div>);
  // Fullscreen required without the pause rule: a non-blocking reminder with a way back.
  if (proctor.needsFullscreen && !proctor.settings.pauseOutsideFullscreen && !proctorPaused) banners.push(<div key="fullscreen" role="alert" data-testid="anvi-proctor-banner" className={bannerTone}>
    <ShieldAlert className={bannerIcon} aria-hidden="true" />
    <span className="flex-1">
      {proctor.leftFullscreen
        ? `You left fullscreen. Return to fullscreen to continue — this was recorded${proctor.label ? ` (${proctor.label})` : ""}.`
        : "This interview runs in fullscreen. Enter fullscreen to continue."}
      {proctor.fullscreenError && <span className="mt-1 block text-xs">{proctor.fullscreenError}</span>}
    </span>
    <button type="button" onClick={() => { void proctor.requestFullscreen(); }} className={bannerButton}><Maximize className="h-3.5 w-3.5" aria-hidden="true" />{proctor.leftFullscreen ? "Return to fullscreen" : "Enter fullscreen"}</button>
  </div>);
  else if (proctor.lastWarning && !proctorPaused) {
    const label = proctor.lastWarning.violations > 0 ? proctor.label : "";
    const message = proctor.lastWarning.message || "You switched away from the interview. Stay on this tab until it ends — this was recorded.";
    banners.push(<div key="proctor-warning" role="alert" data-testid="anvi-proctor-warning" className={bannerTone}>
      <ShieldAlert className={bannerIcon} aria-hidden="true" />
      <span className="flex-1">{withLabel(label, message)}</span>
      <button type="button" onClick={proctor.dismissWarning} aria-label="Dismiss warning" className="rounded-full p-0.5 text-amber-700 hover:bg-amber-900/5 dark:text-amber-200 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
    </div>);
  }
  // Camera AI without the pause rule (fullscreen off, or pauseOutsideFullscreen off): a lost camera is
  // a counted violation, and the student is asked to fix it while the interview goes on.
  if (camera.blocked && !proctorPaused && !ending) banners.push(<div key="camera" role="alert" data-testid="anvi-camera-banner" className={bannerTone}>
    <VideoOff className={bannerIcon} aria-hidden="true" />
    <span className="flex-1"><span className="font-semibold">Your camera is unavailable.</span> This interview uses camera checks — this was recorded{proctor.label ? ` (${proctor.label})` : ""}. {camera.blockedMessage}</span>
    <button type="button" onClick={camera.retry} className={bannerButton}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Retry camera</button>
  </div>);
  if (endedForLimit) banners.push(<div key="limit" role="alert" data-testid="anvi-proctor-limit" className={bannerTone}>
    <ShieldAlert className={bannerIcon} aria-hidden="true" />
    <span className="flex-1"><span className="font-semibold">The interview was ended by proctoring.</span> The violation limit{proctor.maxViolations > 0 ? ` (${proctor.maxViolations})` : ""} was reached. Your answers so far are saved.</span>
  </div>);
  if (status === "ended" && finishError) banners.push(<div key="finish" role="alert" className={bannerTone}>
    <AlertTriangle className={bannerIcon} aria-hidden="true" />
    <span className="flex-1">Your interview has ended, but your answers could not be loaded. Check your connection and try again.</span>
    <button type="button" onClick={onRetryFinish} className={bannerButton}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Retry</button>
  </div>);

  const blockSelect = proctor.enabled && proctor.settings.blockCopyPaste;
  // While the pause overlay is up, the stage behind it takes no focus or clicks.
  const behindOverlay = proctorPaused && !ending ? { inert: true } : {};
  return (
    <div data-anvi-room="live" data-proctored={proctor.enabled ? "on" : undefined} data-proctor-paused={proctorPaused ? "on" : undefined}
      className={`fixed inset-0 z-[80] isolate flex flex-col overflow-hidden bg-[#f6f5fb] text-slate-900 dark:bg-[#0a0b10] dark:text-zinc-100 ${blockSelect ? "select-none" : ""}`}>
      <RoomBackdrop />
      <header {...behindOverlay} className="flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:h-16 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${chip}`}><AnviMark className="h-6 w-6" /></span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{attempt.title || "AI interview"}</h1>
              {scheduled && <span title="Your institution scheduled this interview" className="hidden shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-200 dark:bg-violet-400/15 dark:text-violet-100 dark:ring-violet-300/30 sm:inline">{scheduled}</span>}
            </div>
            <p className="hidden truncate text-xs text-slate-500 dark:text-zinc-400 sm:block">{[attempt.role, attempt.companyName, "Interview with ANVI"].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {proctor.enabled && <ProctorPill violations={proctor.violations} maxViolations={proctor.maxViolations} onLimit={proctor.settings.onLimit} />}
          <LivePill status={status} compact={proctor.enabled} />
          <Timer startedAt={attempt.startedAt} deadlineAt={deadlineAt} header />
          {/* ANVI tells students who want to finish to use "the End interview button at the top right". */}
          <span className="relative">
            <button type="button" onClick={askEnd} disabled={ending} aria-label="End interview" title="End interview" data-end-hint={endHint ? "on" : undefined}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-rose-600 px-3 text-sm font-semibold text-white shadow-md shadow-rose-600/20 transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none dark:shadow-none dark:focus-visible:outline-rose-300 sm:px-4 ${endHint ? "ring-4 ring-rose-400/50 motion-safe:animate-pulse" : ""}`}>
              <PhoneOff className="h-4 w-4" aria-hidden="true" /><span className="max-sm:sr-only">End interview</span>
            </button>
            {endHint && <span role="status" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl bg-rose-600 px-3 py-2 text-xs font-medium leading-5 text-white shadow-lg shadow-rose-900/25 dark:shadow-black/40">
              <span aria-hidden="true" className="absolute -top-1 right-5 h-2 w-2 rotate-45 bg-rose-600" />
              Ready to finish? Click End interview here.
            </span>}
          </span>
        </div>
      </header>

      {!wide && <button {...behindOverlay} type="button" onClick={openQuestion} aria-label="Open the current question"
        className={`mx-3 mb-2 flex shrink-0 items-start gap-3 rounded-xl px-3.5 py-2.5 text-left ring-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 sm:mx-5 ${surface} ${surfaceRing}`}>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
            Current conversation{followUp && <FollowUpChip />}
          </span>
          <span className="mt-1 line-clamp-3 block text-sm leading-5 text-slate-800 dark:text-zinc-100">{questionText || "ANVI will guide the conversation naturally."}</span>
        </span>
        <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
      </button>}

      <div {...behindOverlay} className="flex min-h-0 flex-1 gap-3 px-3 sm:px-5">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <AnviTile phase={phase} getLevel={anviLevel} orbSize={orbSize} avatar={attempt.avatar} className="h-full" />
              <YouTile name={studentName} profileImage={studentAvatar} muted={muted} getLevel={youLevel} camera={cameraTile} pip
                className="absolute right-3 top-3 z-20 h-28 w-32 shadow-xl shadow-slate-900/15 dark:shadow-black/40 sm:right-4 sm:top-4 sm:h-32 sm:w-48" />
            </div>
            {/* Banners stay clear of the compact self-view in the top corner. */}
            {banners.length > 0 && <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 mx-auto max-w-3xl space-y-2 md:bottom-auto md:top-3">{banners}</div>}
          </div>
          {questionBar && <section aria-label="Current question" data-testid="anvi-hybrid-question" className={`mx-auto mt-3 w-full max-w-3xl shrink-0 rounded-xl px-4 py-3 ring-1 ring-inset ${surface} ${surfaceRing}`}>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Current question{followUp && <FollowUpChip />}</p>
            <p className="mt-1 text-[15px] leading-6 text-slate-800 dark:text-zinc-100 sm:text-base">{questionText || "ANVI will guide the conversation naturally."}</p>
          </section>}
          {showCaptions && <section aria-label="Live captions" className={`mx-auto mt-2.5 w-full max-w-2xl shrink-0 rounded-xl px-4 py-2.5 ring-1 ring-inset ${surface} ${surfaceRing}`}>
            <CaptionStrip captions={captions} compact={!tablet} question={captionQuestion} />
          </section>}
          <footer className="shrink-0 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2.5">
            <div className="flex min-h-9 justify-center">
              {/* While reconnecting the banner and the header chip say it; the empty row keeps the controls still. */}
              {status !== "reconnecting" && <StatusPill status={status} activity={activity} muted={muted} talkingMuted={talkingMuted} pauseKey={pauseKey} getLevel={anviLevel} compact={!tablet} hybrid={hybridStatus} />}
            </div>
            {status === "ended" && <p className="mt-2 text-center"><Link to="/student/ai-interviews" className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-200"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All interviews</Link></p>}
            <div className="mt-2.5">
              <ControlBar muted={muted} canMute={canMute} onToggleMute={toggleMute} captionsOn={captionsOn} onToggleCaptions={toggleCaptions}
                panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((value) => !value)} onLeave={askEnd} leaveDisabled={ending} highlightLeave={endHint} hybrid={hybridControls} />
            </div>
          </footer>
        </main>
        {docked && <SidePanel variant="dock" {...panelProps} />}
      </div>

      {/* Never behind the pause overlay, where it would stay focusable (it also closes when a pause starts). */}
      {panelOpen && !wide && !(proctorPaused && !ending) && <SidePanel variant="sheet" {...panelProps} />}
      {proctorPaused && !ending && <PauseOverlay proctor={proctor} camera={camera} onEnd={askEnd} endDisabled={ending} startedAt={attempt.startedAt} deadlineAt={deadlineAt} trapFocus={!confirmEnd} />}
      {confirmEnd && <EndDialog busy={status === "ending"}
        onCancel={cancelEnd} onConfirm={() => { setConfirmEnd(false); void live.end(); }} />}
    </div>
  );
}
