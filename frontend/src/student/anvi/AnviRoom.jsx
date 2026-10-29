import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { api } from "../../utils/api";
import { InlineLoader } from "../../components/Skeletons";
import { useOptionalAuth } from "../../context/AuthContext";
import AnviLobby from "./AnviLobby";
import AnviCompletion from "./AnviCompletion";
import LiveCall from "./room/LiveCall";
import AnviHybridStage from "./AnviHybridStage";
import { REPORT_POLL_MS, REPORT_POLL_WINDOW_MS, reportStateOf } from "./anviReportState";
import { anviBrowserSupport, createAnviAudioContexts, useAnviLiveSession } from "./useAnviLiveSession";
import { hasJoinHandoff, releaseJoinHandoff, takeJoinHandoff } from "./anviJoinHandoff";

// A scheduled attempt whose report is scored but not released: the server reports "preparing" for a
// "ready" attempt until visibleToStudentAt (or says "withheld"). Polling cannot change that.
const reportWithheld = (attempt) => Boolean(attempt?.assignmentId)
  && (attempt.report === "withheld" || (attempt.status === "ready" && reportStateOf(attempt) === "preparing"));

function ReleaseNote() {
  return <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
    <p role="status" className="flex items-start gap-2.5 rounded-xl border border-violet-200/80 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-100">
      <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Your institution scheduled this interview. Report will be released by your institution.
    </p>
  </div>;
}

// The handoff's camera: `cameraStream` (or `camera` / `camera.stream`). The mic stream is never used
// for it, so stopping the camera can never stop the microphone.
const cameraStreamOf = (handoff) => {
  const camera = handoff?.cameraStream || handoff?.camera?.stream || handoff?.camera || null;
  return camera?.getVideoTracks && camera !== handoff?.stream ? camera : null;
};

const usableContext = (context) => context && context.state !== "closed";
// A hybrid call starts after its stage mounts, so its audio contexts are created here, inside the Join
// click (autoplay rules), unless the pre-start lobby already handed them over.
function hybridLaunchOf(handoff) {
  const handed = handoff?.contexts;
  if (usableContext(handed?.capture) && usableContext(handed?.playback)) return { ...handoff };
  let contexts = null;
  try { contexts = createAnviAudioContexts(); } catch { contexts = null; }
  return { ...(handoff || {}), contexts };
}

// Handoff releases waiting a tick after a room unmounted, by attempt id; a room mounting for the same
// attempt (StrictMode's remount, or a new room) cancels its own.
const pendingReleases = new Map();

const shell ="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100";

/** The hands-free ANVI room: lobby, then the live call, then the saved answers. */
export default function AnviRoom({ attemptId }) {
  const [attempt, setAttempt] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [stage, setStage] = useState("lobby");
  const [finishError, setFinishError] = useState(false);
  const aliveRef = useRef(true);
  const support = useMemo(() => anviBrowserSupport(), []);
  const authUser = useOptionalAuth()?.user;
  const studentName = authUser?.name || "";
  const studentAvatar = authUser?.avatarUrl || "";

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const load = useCallback(async () => {
    const value = await api.getStudentAIAttempt(attemptId);
    if (aliveRef.current) setAttempt(value);
    return value;
  }, [attemptId]);

  useEffect(() => {
    setAttempt(null); setLoadError(""); setStage("lobby");
    load().catch((cause) => { if (aliveRef.current) setLoadError(cause.message || "This interview could not be loaded."); });
  }, [load]);

  // The server finalises after pending transcriptions, so the attempt can stay in progress briefly.
  const loadFinished = useCallback(async () => {
    setFinishError(false);
    for (let tries = 0; tries < 8 && aliveRef.current; tries += 1) {
      try {
        const value = await api.getStudentAIAttempt(attemptId);
        if (value?.status !== "in_progress" || tries === 7) { if (aliveRef.current) setAttempt(value); return; }
      } catch { /* Retry below. */ }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    // Every poll failed (offline, server error): offer a retry instead of waiting forever.
    if (aliveRef.current) setFinishError(true);
  }, [attemptId]);

  // While ANVI scores the answers, poll every 4 s for up to 3 minutes; "Check again" restarts the window.
  const withheld = reportWithheld(attempt);
  const preparing = reportStateOf(attempt) === "preparing" && !withheld;
  const [pollRound, setPollRound] = useState(0);
  const [pollExpired, setPollExpired] = useState(false);
  useEffect(() => {
    if (!preparing) return undefined;
    setPollExpired(false);
    const started = Date.now();
    let timer = null;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const value = await api.getStudentAIAttempt(attemptId);
        if (cancelled || !aliveRef.current) return;
        setAttempt(value);
        if (reportStateOf(value) !== "preparing") return;
      } catch { /* Keep polling: a dropped request is retried on the next round. */ }
      if (cancelled) return;
      if (Date.now() - started + REPORT_POLL_MS > REPORT_POLL_WINDOW_MS) { setPollExpired(true); return; }
      timer = setTimeout(poll, REPORT_POLL_MS);
    };
    timer = setTimeout(poll, REPORT_POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [preparing, attemptId, pollRound]);
  const checkAgain = useCallback(() => setPollRound((round) => round + 1), []);

  const onEnded = useCallback(() => { void loadFinished(); }, [loadFinished]);
  const onJoinRejected = useCallback((res) => {
    // The interview is being saved right now: wait for the result instead of offering a rejoin.
    if (res?.code === "ATTEMPT_ENDING") { void loadFinished(); return; }
    load().catch(() => {});
  }, [load, loadFinished]);
  const retryFinish = useCallback(() => { void loadFinished(); }, [loadFinished]);

  const live = useAnviLiveSession({ attemptId, onEnded, onJoinRejected });
  const startLive = live.start;

  // Hybrid (turn-based) attempts render AnviHybridStage, which runs its own session; the Live session
  // above then stays idle. The server's join ack is authoritative: a "live" ack hands the microphone and
  // audio back here and the Live call takes over.
  const [forcedLive, setForcedLive] = useState(false);
  const hybrid = attempt?.runtimeMode === "hybrid" && !forcedLive;
  const [hybridLaunch, setHybridLaunch] = useState(null);

  // Opened from the pre-start lobby: its tested microphone and audio contexts are waiting here, so the
  // room joins at once instead of showing a second lobby. A rejoin (no handoff) shows the lobby.
  const [handoffPending, setHandoffPending] = useState(() => hasJoinHandoff(attemptId));
  // Camera AI proctoring: the pre-start camera stream travels with the handoff; the room owns it from here.
  const [cameraStream, setCameraStream] = useState(null);
  const startWith = useCallback((handoff) => {
    setCameraStream(cameraStreamOf(handoff));
    if (hybrid) setHybridLaunch(hybridLaunchOf(handoff));
    else startLive(handoff);
    setStage("live");
  }, [hybrid, startLive]);
  const onRuntimeMode = useCallback(({ runtimeMode, handoff } = {}) => {
    if (runtimeMode !== "live") return;
    setForcedLive(true);
    setHybridLaunch(null);
    startLive(handoff || {});
  }, [startLive]);
  useEffect(() => {
    if (!handoffPending) return;
    if (loadError) { releaseJoinHandoff(attemptId); setHandoffPending(false); return; }
    if (!attempt) return;
    if (attempt.status !== "in_progress") { releaseJoinHandoff(attemptId); setHandoffPending(false); return; }
    const handoff = takeJoinHandoff(attemptId);
    setHandoffPending(false);
    if (handoff) startWith(handoff);
  }, [handoffPending, attempt, attemptId, loadError, startWith]);
  // Leaving before the room took the handoff (the attempt still loading, a back click) releases its
  // microphone, camera and audio contexts. The release waits a tick: StrictMode's simulated unmount is
  // followed at once by a remount, which cancels it and still takes the handoff. A room that already
  // took its handoff schedules nothing, so it can never release one handed to the next room.
  useEffect(() => {
    const key = String(attemptId || "");
    clearTimeout(pendingReleases.get(key));
    pendingReleases.delete(key);
    return () => {
      if (!hasJoinHandoff(key)) return;
      const timer = setTimeout(() => {
        if (pendingReleases.get(key) === timer) pendingReleases.delete(key);
        if (hasJoinHandoff(key)) releaseJoinHandoff(key);
      }, 0);
      pendingReleases.set(key, timer);
    };
  }, [attemptId]);

  if (loadError && !attempt) {
    return <div className={shell}><main className="mx-auto max-w-xl space-y-4 px-4 py-16 text-center">
      <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{loadError}</p>
      <Link to="/student/ai-interviews" className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All interviews</Link>
    </main></div>;
  }
  if (!attempt) return <InlineLoader message="Opening your interview…" />;
  if (attempt.status !== "in_progress") {
    return <div className={shell}>
      {withheld && <ReleaseNote />}
      <AnviCompletion attempt={withheld ? { ...attempt, report: "withheld" } : attempt} pollExpired={pollExpired} onCheckAgain={checkAgain} />
    </div>;
  }

  if (stage === "lobby" && handoffPending) return <InlineLoader message="Joining ANVI…" />;
  if (stage === "lobby") {
    return <div className={shell}><AnviLobby attempt={attempt} support={support} studentName={studentName} onStart={startWith} /></div>;
  }

  if (hybrid) {
    return <div className={shell}><AnviHybridStage attempt={attempt} launch={hybridLaunch} studentName={studentName} studentAvatar={studentAvatar} cameraStream={cameraStream} finishError={finishError} onRetryFinish={retryFinish}
      onEnded={onEnded} onJoinRejected={onJoinRejected} onRuntimeMode={onRuntimeMode} /></div>;
  }
  return <div className={shell}><LiveCall attempt={attempt} live={live} studentName={studentName} studentAvatar={studentAvatar} cameraStream={cameraStream} finishError={finishError} onRetryFinish={retryFinish} /></div>;
}
