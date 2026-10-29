import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardCheck, Radio, RefreshCw } from "lucide-react";
import { api } from "../../../utils/api";
import { useOptionalAuth } from "../../../context/AuthContext";
import AnviLobby from "../AnviLobby";
import BookingSheet from "../BookingSheet";
import ResumeSheet from "../ResumeSheet";
import { releaseAllJoinHandoffs, setJoinHandoff } from "../anviJoinHandoff";
import { startBodyOf, startErrorOf, startSetupOf } from "../anviStartSetup";
import { anviBrowserSupport } from "../useAnviLiveSession";
import { assignmentIdOf, bookingIdOf, nextJoinBoundary } from "../anviSchedule";
import { buildTabs, TAB_IDS, TABS } from "./listModel";
import { BlockedPracticeNote, PracticeCard, PracticeRow } from "./PracticeItems";
import ScheduledRow from "./ScheduledRow";
import { btn, focus, listSurface } from "./styles";
import { Banner, EmptyState, RowSkeleton, SectionHeader } from "./ui";
import useNow from "./useNow";

/**
 * The tabbed body of the AI Interviews page: Upcoming (scheduled + "Practice anytime"), Ongoing and
 * Completed. Owns the scheduled-interview actions (join, book, reschedule, cancel, calendar, resume) and
 * the pre-start lobby: a NEW attempt (practice or scheduled) is set up there first (language, resume,
 * terms, mic check), then started; a rejoin opens its room directly. Practice starts go through
 * `onStartPractice(item, body, { onSuccess, onError, onCancel })` (the page runs the Prep Coin checkout;
 * `onCancel` when the student dismisses its cost dialog). The tab
 * is read from `?tab=`; without one it opens Ongoing when something is live, else Upcoming.
 */
export default function InterviewBoard({
  assignments = [], assignmentsLoading = false, assignmentsError = "",
  practice = [], practiceLoading = false, practiceError = "", onRetryPractice,
  onReload, onStartPractice, practiceBusyId = "", practicePending = false, now: fixedNow, support: supportOverride,
}) {
  const navigate = useNavigate();
  const now = useNow(fixedNow);
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState(null);
  const [resumeSheet, setResumeSheet] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [confirmCancel, setConfirmCancel] = useState("");
  // The pre-start lobby: { kind: "practice"|"assignment", item, setup } while a new attempt is being set up.
  const [lobby, setLobby] = useState(null);
  const [lobbyError, setLobbyError] = useState("");
  const pendingStart = useRef(null);
  const support = useMemo(() => supportOverride || anviBrowserSupport(), [supportOverride]);
  const studentName = useOptionalAuth()?.user?.name || "";
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const tabRefs = useRef({});
  const tabListRef = useRef(null);

  const model = useMemo(() => buildTabs({ assignments, practice, now }), [assignments, practice, now]);
  const requested = params.get("tab");
  const tab = TAB_IDS.includes(requested) ? requested : model.defaultTab;
  const selectTab = (id, focus = false) => {
    setParams((current) => { const next = new URLSearchParams(current); next.set("tab", id); return next; }, { replace: true });
    if (focus) tabRefs.current[id]?.focus();
  };

  // On narrow screens the tab strip can scroll: keep the selected tab fully in view (horizontally only).
  useEffect(() => {
    const list = tabListRef.current;
    const node = tabRefs.current[tab];
    if (!list || !node || list.scrollWidth <= list.clientWidth) return;
    const left = node.offsetLeft; // the tablist is `relative`, so this is measured from its edge
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (left + node.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = left + node.offsetWidth - list.clientWidth;
  }, [tab]);

  // Reload when a join window opens or closes, so the server's canStart catches up with the clock.
  useEffect(() => {
    if (fixedNow !== undefined || !onReload) return undefined;
    const delay = nextJoinBoundary(assignments, Date.now());
    if (delay === null || delay > 6 * 60 * 60_000) return undefined;
    const id = setTimeout(() => onReload(), delay + 1500);
    return () => clearTimeout(id);
  }, [assignments, onReload, fixedNow]);

  const practiceById = useMemo(() => new Map(practice.map((entry) => [String(entry.id), entry])), [practice]);
  const factsOf = (item) => {
    const listing = practiceById.get(String(item.interviewId));
    const pick = (key) => item[key] ?? listing?.[key];
    return { language: pick("language"), questionCount: pick("questionCount"), estimatedMinutes: pick("estimatedMinutes") };
  };

  const run = async (id, work, success) => {
    setBusyId(id); setActionError(""); setNotice("");
    try {
      await work();
      if (success) setNotice(success);
      await onReload?.();
    } catch (cause) {
      setActionError(cause.message || "That did not work. Please try again.");
    } finally {
      setBusyId("");
    }
  };
  // ---- Pre-start lobby ----
  const settlePending = (value) => {
    const resolve = pendingStart.current;
    pendingStart.current = null;
    resolve?.(value);
  };
  useEffect(() => () => settlePending(false), []);
  // Back on the list, no room is open: media handed to a room that never took it is released now
  // instead of staying live (camera light on) until the handoff times out.
  useEffect(() => { releaseAllJoinHandoffs(); }, []);
  const openLobby = (kind, item) => {
    setActionError(""); setNotice(""); setLobbyError("");
    setLobby({ kind, item, setup: startSetupOf(kind === "assignment" ? { ...factsOf(item), ...item } : item, kind) });
  };
  const closeLobby = () => {
    settlePending(false);
    setLobby(null); setLobbyError("");
    // A resume added or removed in the lobby changes the list's checklist.
    void onReload?.();
  };
  // Resolves true once the attempt exists (its audio is handed to the room), false to stay in the lobby.
  const startFromLobby = ({ stream, contexts, body, cameraStream = null }) => new Promise((resolve) => {
    const current = lobby;
    if (!current) { resolve(false); return; }
    settlePending(false);
    pendingStart.current = resolve;
    setLobbyError("");
    const mine = () => pendingStart.current === resolve;
    const succeed = (attempt) => {
      if (!mine()) return;
      pendingStart.current = null;
      if (!attempt?.id) { setLobbyError("The interview could not be started. Please try again."); resolve(false); return; }
      setJoinHandoff(attempt.id, { stream, contexts, cameraStream });
      resolve(true);
      setLobby(null);
      navigate(`/student/ai-interviews/room/${attempt.id}`);
    };
    const fail = (cause) => {
      if (!mine()) return;
      pendingStart.current = null;
      setLobbyError(startErrorOf(cause));
      resolve(false);
      if (["LANGUAGE_NOT_ALLOWED", "RESUME_REQUIRED", "TERMS_REQUIRED"].includes(cause?.response?.data?.code)) void onReload?.();
    };
    // The student dismissed the Prep Coin dialog: nothing started, so the flow takes its media back.
    const cancel = () => {
      if (!mine()) return;
      pendingStart.current = null;
      resolve(false);
    };
    if (current.kind === "practice") {
      onStartPractice?.(current.item, body, { onSuccess: succeed, onError: fail, onCancel: cancel });
      return;
    }
    const id = assignmentIdOf(current.item);
    setBusyId(id);
    api.startAnviAssignment(id, body).then(succeed, fail).finally(() => setBusyId(""));
  });

  const handlers = {
    join: async (item) => {
      const id = assignmentIdOf(item);
      // A new attempt is set up in the lobby; an attempt that can be rejoined opens its room directly.
      if (!item.resume) { openLobby("assignment", item); return; }
      setBusyId(id); setActionError(""); setNotice("");
      try {
        const attempt = await api.startAnviAssignment(id, startBodyOf());
        navigate(`/student/ai-interviews/room/${attempt.id}`);
      } catch (cause) {
        setActionError(cause.message || "The interview could not be started.");
        void onReload?.();
      } finally {
        setBusyId("");
      }
    },
    resume: (item) => setResumeSheet(item),
    book: (item) => setSheet(item),
    reschedule: (item) => setSheet(item),
    calendar: (item) => run(assignmentIdOf(item), () => api.downloadAnviBookingCalendar(bookingIdOf(item.booking)), ""),
    askCancel: (id) => setConfirmCancel(id),
    keepBooking: () => setConfirmCancel(""),
    cancel: (item) => run(assignmentIdOf(item), () => api.cancelAnviBooking(bookingIdOf(item.booking)), "Your booking was cancelled. You can book another slot.")
      .finally(() => setConfirmCancel("")),
    open: (attemptId) => attemptId && navigate(`/student/ai-interviews/room/${attemptId}`),
  };
  // A practice interview that is running or finished opens its room; a new one is set up in the lobby.
  const openPractice = (item) => {
    if (item.status === "not_started" || (!item.status && !item.activeAttemptId)) openLobby("practice", item);
    else onStartPractice?.(item);
  };
  const locked = Boolean(busyId) || Boolean(practiceBusyId);

  const scheduledRow = (entry) => <ScheduledRow key={entry.key} entry={entry} now={now} facts={factsOf(entry.item)}
    busy={busyId === entry.id} locked={locked && busyId !== entry.id}
    confirmingCancel={entry.state === "booked" && confirmCancel === entry.id} handlers={handlers} />;
  const practiceRow = (entry) => <PracticeRow key={entry.key} entry={entry} now={now} busy={practiceBusyId === entry.id} locked={locked} onOpen={openPractice} />;
  const row = (entry) => (entry.kind === "scheduled" ? scheduledRow(entry) : practiceRow(entry));

  const lobbyStarting = lobby ? (lobby.kind === "practice" ? practiceBusyId === String(lobby.item.id) || practicePending : busyId === assignmentIdOf(lobby.item)) : false;
  const lobbyView = lobby && <AnviLobby key={`${lobby.kind}:${lobby.setup.id}`} setup={lobby.setup} support={support} studentName={studentName}
    starting={lobbyStarting} startError={lobbyError} onStart={startFromLobby} onClose={closeLobby} />;

  const loadingAll = (assignmentsLoading && !assignments.length) || (practiceLoading && !practice.length);
  const counts = model.counts;

  const onTabKey = (event) => {
    const index = TAB_IDS.indexOf(tab);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step) { event.preventDefault(); selectTab(TAB_IDS[(index + step + TAB_IDS.length) % TAB_IDS.length], true); }
    if (event.key === "Home") { event.preventDefault(); selectTab(TAB_IDS[0], true); }
    if (event.key === "End") { event.preventDefault(); selectTab(TAB_IDS[TAB_IDS.length - 1], true); }
  };

  return <div className="space-y-5">
    <div>
      {/* On narrow screens the tabs scroll sideways instead of clipping their count badges. */}
      <div ref={tabListRef} role="tablist" aria-label="Interviews" onKeyDown={onTabKey}
        className="relative flex max-w-full gap-0.5 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 [scrollbar-width:none] dark:border-white/[0.06] dark:bg-white/[0.04] sm:inline-flex sm:w-auto sm:gap-1 [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          const live = id === "ongoing" && counts.ongoing > 0;
          return <button key={id} ref={(node) => { tabRefs.current[id] = node; }} type="button" role="tab" id={`anvi-tab-${id}`}
            aria-selected={active} aria-controls={`anvi-panel-${id}`} tabIndex={active ? 0 : -1} onClick={() => selectTab(id)}
            className={`inline-flex flex-1 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-2 text-xs font-semibold transition ${focus} sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${active
              ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.12)] dark:bg-[#2f2f2f] dark:text-white dark:shadow-none"
              : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100"}`}>
            {live && <span className="relative hidden h-2 w-2 shrink-0 sm:flex" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-full w-full rounded-full bg-emerald-500" /></span>}
            {label}
            {!loadingAll && counts[id] > 0 && <span className={`${live ? "ring-1 ring-inset ring-emerald-400/70 sm:ring-0" : ""} min-w-[1.125rem] rounded-md px-1 text-[11px] tabular-nums leading-5 sm:min-w-[1.25rem] sm:px-1.5 sm:text-xs ${active ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200" : "bg-slate-200/80 text-slate-600 dark:bg-white/[0.08] dark:text-zinc-400"}`}>{counts[id]}</span>}
          </button>;
        })}
      </div>
    </div>

    {assignmentsError && <Banner tone="rose" role="alert" icon={AlertCircle}
      action={onReload && <button type="button" onClick={onReload} className="-my-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-500/20"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Try again</button>}>
      {assignmentsError}
    </Banner>}
    {practiceError && <Banner tone="rose" role="alert" icon={AlertCircle}
      action={onRetryPractice && <button type="button" onClick={onRetryPractice} className="-my-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-500/20"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Try again</button>}>
      {practiceError}
    </Banner>}
    {actionError && <Banner tone="rose" role="alert" icon={AlertCircle} onDismiss={() => setActionError("")}>{actionError}</Banner>}
    {notice && <Banner tone="emerald" role="status" icon={CheckCircle2} onDismiss={() => setNotice("")}>{notice}</Banner>}

    <section id={`anvi-panel-${tab}`} role="tabpanel" aria-labelledby={`anvi-tab-${tab}`} className="space-y-8">
      {loadingAll ? <RowSkeleton rows={3} />
        : tab === "upcoming" ? <UpcomingPanel model={model} scheduledRow={scheduledRow} assignmentsLoading={assignmentsLoading}
          practicePanel={model.upcoming.practice.length > 0 && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-labelledby="anvi-practice-title">
            {model.upcoming.practice.map((entry) => <PracticeCard key={entry.key} entry={entry} busy={practiceBusyId === entry.id} locked={locked}
              onOpen={openPractice} onReport={handlers.open} />)}
          </ul>} />
          : tab === "ongoing" ? (model.ongoing.length
            ? <div className="space-y-3">
              <SectionHeader id="anvi-ongoing-title" title="In progress" count={model.ongoing.length} />
              <ul className={listSurface} aria-labelledby="anvi-ongoing-title">{model.ongoing.map(row)}</ul>
            </div>
            : <EmptyState icon={Radio} title="Nothing live right now" body="Interviews move here when their join window opens, and stay while you are answering one."
              action={<button type="button" className={btn.secondary} onClick={() => selectTab("upcoming")}><CalendarClock className="h-4 w-4" aria-hidden="true" />See upcoming</button>} />)
            : model.completed.length
              ? <div className="space-y-3">
                <SectionHeader id="anvi-completed-title" title="Interview history" count={model.completed.length} />
                <ul className={listSurface} aria-labelledby="anvi-completed-title">{model.completed.map(row)}</ul>
              </div>
              : <EmptyState icon={ClipboardCheck} title="No completed interviews yet" body="Once you finish an interview, it is listed here with its report."
                action={model.upcoming.practice.length > 0 && <button type="button" className={btn.secondary} onClick={() => selectTab("upcoming")}>Start a practice interview</button>} />}
    </section>

    {sheet && <BookingSheet item={sheet} now={fixedNow} onClose={() => setSheet(null)} onDone={(_, message) => { setSheet(null); setNotice(message); void onReload?.(); }} />}
    {resumeSheet && <ResumeSheet item={resumeSheet} onClose={(changed) => { setResumeSheet(null); if (changed) void onReload?.(); }} />}
    {lobby && (typeof document !== "undefined" && document.body ? createPortal(lobbyView, document.body) : lobbyView)}
  </div>;
}

function UpcomingPanel({ model, scheduledRow, practicePanel, assignmentsLoading }) {
  const { scheduled, practice, blocked } = model.upcoming;
  if (!scheduled.length && !practice.length && !blocked.length && !assignmentsLoading) {
    return <EmptyState icon={CalendarClock} title="No interviews available" body="New interviews will appear here when they are assigned or published." />;
  }
  return <>
    {scheduled.length > 0 ? <div className="space-y-3">
      <SectionHeader id="anvi-scheduled-title" title="Scheduled interviews" count={scheduled.length} />
      <ul className={listSurface} aria-labelledby="anvi-scheduled-title">{scheduled.map(scheduledRow)}</ul>
    </div> : assignmentsLoading ? <div className="space-y-3">
      <SectionHeader id="anvi-scheduled-title" title="Scheduled interviews" />
      <RowSkeleton rows={1} />
    </div> : null}
    {practice.length > 0 && <div className="space-y-3">
      <SectionHeader id="anvi-practice-title" title="Practice interviews" count={practice.length} />
      {practicePanel}
    </div>}
    <BlockedPracticeNote entries={blocked} />
  </>;
}
