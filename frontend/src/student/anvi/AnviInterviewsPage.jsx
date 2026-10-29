import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import StudentDashboardHeader from "../../components/StudentDashboardHeader";
import { AnviMark } from "../../components/AnviApproach";
import { api } from "../../utils/api";
import { usePrepCoinCheckout } from "../prepCoin/usePrepCoinCheckout";
import InterviewBoard from "./list/InterviewBoard";

const unwrapAssignments = (value) => (Array.isArray(value) ? value : Array.isArray(value?.assignments) ? value.assignments : []);

/**
 * Student AI Interviews: interviews the institution scheduled and practice interviews, in Upcoming /
 * Ongoing / Completed tabs. Starting a new practice interview may cost Prep Coins; continuing never does,
 * and scheduled interviews never do.
 */
export default function AnviInterviewsPage({ now }) {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [startError, setStartError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [assigned, setAssigned] = useState({ items: [], loading: true, error: "" });
  const { checkout, dialog, pending } = usePrepCoinCheckout("ai_interview.start");

  const load = useCallback(() => {
    let active = true;
    setLoading(true); setLoadError("");
    api.listStudentAIInterviews().then((items) => { if (active) setInterviews(Array.isArray(items) ? items : []); })
      .catch((cause) => { if (active) setLoadError(cause.message || "Practice interviews could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => load(), [load]);

  // Scheduled interviews load on their own, so a failure there never hides practice.
  const assignedRequest = useRef(0);
  const loadAssigned = useCallback(async ({ silent = false } = {}) => {
    const request = ++assignedRequest.current;
    setAssigned((current) => ({ ...current, loading: silent ? current.loading : true, error: "" }));
    try {
      const items = unwrapAssignments(await api.listStudentAnviAssignments());
      if (request === assignedRequest.current) setAssigned({ items, loading: false, error: "" });
    } catch (cause) {
      if (request === assignedRequest.current) setAssigned((current) => ({ ...current, loading: false, error: cause.message || "Scheduled interviews could not be loaded." }));
    }
  }, []);
  useEffect(() => {
    void loadAssigned();
    return () => { assignedRequest.current += 1; };
  }, [loadAssigned]);
  // After a booking change or a start, refresh both lists without the loading skeleton.
  const reloadAll = useCallback(async () => {
    await Promise.allSettled([loadAssigned({ silent: true }), api.listStudentAIInterviews().then((items) => { if (Array.isArray(items)) setInterviews(items); })]);
  }, [loadAssigned]);

  // Keep an open student dashboard aligned with admin edits. Focus refreshes immediately; the quiet
  // interval covers a dashboard left open beside the admin workspace without flashing skeletons.
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void reloadAll(); };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [reloadAll]);

  // Without `body` this opens an existing attempt. With `body` (from the pre-start lobby) it starts a new
  // one through the Prep Coin checkout and reports back through `callbacks` ({ onSuccess, onError,
  // onCancel }); onCancel when the student dismisses the cost dialog, so the lobby can join again.
  const openPractice = async (item, body, callbacks = {}) => {
    if (!body) {
      if (item.status === "completed" && item.lastAttempt?.id) { navigate(`/student/ai-interviews/room/${item.lastAttempt.id}`); return; }
      if (item.status === "active" && item.activeAttemptId) { navigate(`/student/ai-interviews/room/${item.activeAttemptId}`); return; }
    }
    if (item.practiceBlocked) { callbacks.onError?.(new Error("This interview is scheduled by your institution, so practice is unavailable for now.")); return; }
    setBusyId(item.id); setStartError("");
    await checkout((cost) => api.startStudentAIInterview(item.id, body || {}, cost), {
      // Any earlier attempt already paid for this interview, so a restart is free.
      alreadyStarted: item.status === "active" || Boolean(item.lastAttempt),
      onSuccess: (attempt) => (callbacks.onSuccess ? callbacks.onSuccess(attempt) : navigate(`/student/ai-interviews/room/${attempt.id}`)),
      onError: (cause) => (callbacks.onError ? callbacks.onError(cause) : setStartError(cause.message)),
      onCancel: () => callbacks.onCancel?.(),
    });
    setBusyId("");
  };

  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100">
    <StudentDashboardHeader />
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <header className="mb-7 flex min-w-0 items-center gap-3.5 sm:gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-white/10 dark:bg-white/[0.04] sm:h-12 sm:w-12">
          <AnviMark className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl">AI Interviews</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-zinc-400">Complete scheduled interviews or practise with ANVI.</p>
        </div>
      </header>

      <InterviewBoard
        assignments={assigned.items} assignmentsLoading={assigned.loading} assignmentsError={assigned.error}
        practice={interviews} practiceLoading={loading} practiceError={loadError || startError} onRetryPractice={loadError ? load : undefined}
        onReload={reloadAll} onStartPractice={openPractice} practiceBusyId={busyId} practicePending={pending} now={now} />
    </main>
    {/* Above the pre-start lobby (z-80), which is portalled to <body> too. */}
    {dialog && (typeof document !== "undefined" && document.body ? createPortal(<div className="relative z-[95]">{dialog}</div>, document.body) : dialog)}
  </div>;
}
