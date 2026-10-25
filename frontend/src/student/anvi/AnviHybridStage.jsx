import { useEffect, useRef } from "react";
import LiveCall from "./room/LiveCall";
import { useAnviHybridSession } from "./useAnviHybridSession";

/**
 * The hybrid (turn-based) call: the hybrid session behind the same room as Live (LiveCall with its
 * proctoring, ControlBar and SidePanel). `launch` is the lobby's handoff ({ stream, contexts }), with the
 * audio contexts already created inside the Join click. `onRuntimeMode` receives the handoff back when
 * the server says the attempt runs Live.
 */
export default function AnviHybridStage({ attempt, launch, studentName, studentAvatar = "", cameraStream = null, finishError, onRetryFinish, onEnded, onJoinRejected, onRuntimeMode }) {
  const hybrid = useAnviHybridSession({ attemptId: attempt.id, onEnded, onJoinRejected, onRuntimeMode });
  const start = hybrid.start;
  const startedRef = useRef(null);
  // Started a tick after mounting, so StrictMode's simulated unmount (which tears the session down)
  // happens before anything is opened; the remount starts it for real.
  useEffect(() => {
    if (!launch || startedRef.current === launch) return undefined;
    const id = setTimeout(() => { startedRef.current = launch; start(launch); }, 0);
    return () => clearTimeout(id);
  }, [launch, start]);
  return <LiveCall attempt={attempt} live={hybrid} studentName={studentName} studentAvatar={studentAvatar} cameraStream={cameraStream} finishError={finishError} onRetryFinish={onRetryFinish} />;
}
