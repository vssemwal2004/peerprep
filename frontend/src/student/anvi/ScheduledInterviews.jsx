import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, CalendarClock, CalendarPlus, CalendarX, Eye, Loader2, Repeat, RefreshCw, Timer } from "lucide-react";
import { api } from "../../utils/api";
import BookingSheet from "./BookingSheet";
import {
  assignmentIdOf, bookingIdOf, cardStateOf, changeStateOf, formatDuration, formatIST, joinStateOf, modeLabel, nextJoinBoundary,
} from "./anviSchedule";

const card = "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]";
const ghost = "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-white/5";
const primary = "inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-12px_rgba(124,58,237,0.8)] transition hover:from-violet-700 hover:to-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
const CHIP = {
  book: { label: "Book a slot", chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200" },
  needs_reschedule: { label: "Pick a new slot", chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200" },
  booked: { label: "Booked", chip: "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30" },
  window: { label: "Scheduled", chip: "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30" },
  in_progress: { label: "In progress", chip: "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30" },
  completed: { label: "Completed", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
  missed: { label: "Missed", chip: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200" },
  cancelled: { label: "Cancelled", chip: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-zinc-300" },
};

const TICK_MS = 15_000;

function useNow(fixedNow) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return undefined;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [fixedNow]);
  return fixedNow ?? now;
}

/** Join is enabled only inside the join window; otherwise the reason is shown next to it. */
function JoinControl({ item, join, busy, disabled, consentNeeded, consent, onJoin, label = "Join interview" }) {
  const reasonId = `anvi-join-reason-${assignmentIdOf(item)}`;
  const reason = join.enabled && consentNeeded && !consent ? "Agree to the resume use above to join." : join.reason;
  return <div className="flex flex-col items-end gap-1.5">
    <button type="button" onClick={onJoin} disabled={!join.enabled || busy || disabled || (consentNeeded && !consent)} aria-describedby={reason ? reasonId : undefined} className={primary}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{label}{!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </button>
    {reason && <p id={reasonId} className="max-w-xs text-right text-xs text-slate-500 dark:text-zinc-400">{reason}</p>}
  </div>;
}

function Countdown({ item, join, now }) {
  const start = new Date(item?.booking?.startsAt).getTime();
  if (join.phase === "open") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><Timer className="h-3.5 w-3.5" aria-hidden="true" />Join open · closes in {formatDuration(join.window.to - now)}</span>;
  }
  if (Number.isFinite(start) && start > now) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/5 dark:text-zinc-300"><Timer className="h-3.5 w-3.5" aria-hidden="true" />Starts in {formatDuration(start - now)}</span>;
  }
  return null;
}

/**
 * "Scheduled for you": interviews the institution assigned, with booking, join and report states.
 * Each item's requiresResume decides the start consent; `interviews` (the practice list) is a fallback.
 */
export default function ScheduledInterviews({ items = [], interviews = [], loading = false, error = "", onReload, now: fixedNow }) {
  const navigate = useNavigate();
  const now = useNow(fixedNow);
  const [sheet, setSheet] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [confirmCancel, setConfirmCancel] = useState("");
  const [consent, setConsent] = useState({});
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  // Reload when a join window opens or closes, so the server's canStart catches up with the clock.
  useEffect(() => {
    if (fixedNow !== undefined || !onReload) return undefined;
    const delay = nextJoinBoundary(items, Date.now());
    if (delay === null || delay > 6 * 60 * 60_000) return undefined;
    const id = setTimeout(() => onReload(), delay + 1500);
    return () => clearTimeout(id);
  }, [items, onReload, fixedNow]);

  if (!loading && !error && !items.length) return null;

  // The assignment item says whether its pinned snapshot asks about the resume; the practice list (capped
  // at 200 interviews) is only a fallback for an older server.
  const requiresResume = (item) => (typeof item.requiresResume === "boolean"
    ? item.requiresResume
    : Boolean(interviews.find((entry) => String(entry.id) === String(item.interviewId))?.requiresResume));

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

  const join = async (item) => {
    const id = assignmentIdOf(item);
    setBusyId(id); setActionError(""); setNotice("");
    try {
      const attempt = await api.startAnviAssignment(id, consent[id] === true);
      navigate(`/student/ai-interviews/room/${attempt.id}`);
    } catch (cause) {
      setActionError(cause.message || "The interview could not be started.");
      void onReload?.();
    } finally {
      setBusyId("");
    }
  };

  const calendar = (item) => run(assignmentIdOf(item), () => api.downloadAnviBookingCalendar(bookingIdOf(item.booking)), "");
  const cancel = (item) => run(assignmentIdOf(item), () => api.cancelAnviBooking(bookingIdOf(item.booking)), "Your booking was cancelled. You can book another slot.")
    .finally(() => setConfirmCancel(""));

  return <section aria-labelledby="anvi-scheduled-title" className="space-y-3">
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 id="anvi-scheduled-title" className="text-lg font-semibold tracking-tight">Scheduled for you</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400">Interviews your institution assigned. Times are shown in IST. They cost no Prep Coins.</p>
      </div>
      {error && onReload && <button type="button" onClick={onReload} className={ghost}><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</button>}
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
    {actionError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{actionError}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{notice}</p>}
    {loading && !items.length ? <div className={`${card} h-32 animate-pulse`} aria-busy="true" />
      : <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const id = assignmentIdOf(item);
          const state = cardStateOf(item, now);
          const chip = CHIP[state] || CHIP.window;
          const joinState = joinStateOf(item, now);
          const change = changeStateOf(item, now);
          const busy = busyId === id;
          const needsConsent = requiresResume(item) && ["booked", "window"].includes(state);
          return <li key={id} data-assignment={id} className={`${card} flex flex-col`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug">{item.title || "AI interview"}</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-zinc-400">{[item.role, modeLabel(item.mode)].filter(Boolean).join(" · ")}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.chip}`}>{chip.label}</span>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400"><Building2 className="h-3.5 w-3.5" aria-hidden="true" />Your institution scheduled this interview.</p>

            <div className="mt-3 space-y-2 text-sm">
              {state === "booked" && <>
                <p className="inline-flex items-center gap-1.5 font-semibold"><CalendarClock className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />{formatIST(item.booking.startsAt)}</p>
                <div><Countdown item={item} join={joinState} now={now} /></div>
              </>}
              {(state === "book" || state === "needs_reschedule") && <p className="text-slate-600 dark:text-zinc-300">
                {state === "needs_reschedule" ? "Your slot was changed by your institution. Pick a new one." : "Pick a time slot to take this interview."}
                {item.window?.closesAt ? ` Slots run until ${formatIST(item.window.closesAt)}.` : ""}
              </p>}
              {state === "window" && <p className="text-slate-600 dark:text-zinc-300">Start any time from {formatIST(item.window?.opensAt)} until {formatIST(item.window?.closesAt)}.</p>}
              {state === "in_progress" && <p className="text-slate-600 dark:text-zinc-300">You have started this interview. Continue before your time runs out.</p>}
              {state === "completed" && <p className="text-slate-600 dark:text-zinc-300">{item.reportVisible ? "Your report is ready." : "Report will be released by your institution."}</p>}
              {state === "missed" && <p className="text-slate-600 dark:text-zinc-300">You missed this interview{item.booking?.startsAt ? ` (slot at ${formatIST(item.booking.startsAt)})` : item.window?.closesAt ? ` (closed ${formatIST(item.window.closesAt)})` : ""}. Contact your institution if you need another chance.</p>}
              {state === "cancelled" && <p className="text-slate-600 dark:text-zinc-300">Your institution cancelled this interview.</p>}
            </div>

            {needsConsent && <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-zinc-300">
              <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-800" checked={Boolean(consent[id])} onChange={(event) => setConsent((current) => ({ ...current, [id]: event.target.checked }))} />
              <span>I agree to use my saved <Link className="font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300" to="/student/resume">resume</Link> to generate interview questions.</span>
            </label>}

            {state === "booked" && confirmCancel === id && <div role="group" aria-label="Confirm cancellation" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-100">
              <p>{change.rescheduleLeft > 0
                ? `Cancel this booking? Your seat is released. Booking another slot counts as one of your ${change.rescheduleLeft} remaining ${change.rescheduleLeft === 1 ? "change" : "changes"}.`
                : "Cancel this booking? Your seat is released, and you have no changes left, so only your institution can book a new slot for you."}</p>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmCancel("")} disabled={busy} className={ghost}>Keep booking</button>
                <button type="button" onClick={() => cancel(item)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Cancel booking
                </button>
              </div>
            </div>}

            <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
              {state === "booked" && <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSheet(item)} disabled={Boolean(busyId) || !change.canReschedule} title={change.rescheduleReason || undefined} className={ghost}><Repeat className="h-4 w-4" aria-hidden="true" />Reschedule</button>
                <button type="button" onClick={() => setConfirmCancel(id)} disabled={Boolean(busyId) || !change.canCancel} title={change.cancelReason || undefined} className={ghost}><CalendarX className="h-4 w-4" aria-hidden="true" />Cancel</button>
                <button type="button" onClick={() => calendar(item)} disabled={Boolean(busyId)} className={ghost}><CalendarPlus className="h-4 w-4" aria-hidden="true" />Add to calendar</button>
                {(change.rescheduleReason || change.cancelReason) && <p className="w-full text-xs text-slate-500 dark:text-zinc-400">{change.blocked ? change.cancelReason : `${change.rescheduleReason} You can still cancel.`}</p>}
                {!change.blocked && change.rescheduleLeft > 0 && <p className="w-full text-xs text-slate-500 dark:text-zinc-400">{change.rescheduleLeft} {change.rescheduleLeft === 1 ? "reschedule" : "reschedules"} left.</p>}
              </div>}
              <div className="ml-auto">
                {(state === "book" || state === "needs_reschedule") && item.status === "paused" && <p className="mb-1.5 text-right text-xs text-slate-500 dark:text-zinc-400">Your institution has paused bookings for this interview.</p>}
                {(state === "book" || state === "needs_reschedule") && <button type="button" onClick={() => setSheet(item)} disabled={Boolean(busyId) || item.status === "paused"} className={primary}><CalendarClock className="h-4 w-4" aria-hidden="true" />{state === "book" ? "Book a slot" : "Pick a new slot"}</button>}
                {(state === "booked" || state === "window") && <JoinControl item={item} join={joinState} busy={busy} disabled={Boolean(busyId) && !busy} consentNeeded={needsConsent} consent={consent[id] === true} onJoin={() => join(item)} />}
                {state === "in_progress" && <button type="button" onClick={() => navigate(`/student/ai-interviews/room/${item.attemptId}`)} className={primary}>Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
                {state === "completed" && item.reportVisible && item.attemptId && <button type="button" onClick={() => navigate(`/student/ai-interviews/room/${item.attemptId}`)} className={ghost}><Eye className="h-4 w-4" aria-hidden="true" />View report</button>}
              </div>
            </div>
          </li>;
        })}
      </ul>}
    {sheet && <BookingSheet item={sheet} now={fixedNow} onClose={() => setSheet(null)} onDone={(_, message) => { setSheet(null); setNotice(message); void onReload?.(); }} />}
  </section>;
}
