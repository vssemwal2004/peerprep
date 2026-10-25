import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarCheck, CalendarX2, Check, FileText, Globe2, Loader2, RefreshCw, X } from "lucide-react";
import { api } from "../../utils/api";
import { resumeSetupOf } from "./anviStartSetup";
import ResumeStep, { ResumeChip } from "./ResumeStep";
import useResumeUpload from "./prestart/useResumeUpload";
import {
  assignmentIdOf, bookingIdOf, formatISTDay, formatISTTime, groupSlotsByDay, istDayKey, normalizeSlots, policyOf, slotBookable,
} from "./anviSchedule";
import { btn, focus, noOutline } from "./list/styles";

const seatsText = (slot, bookable) => {
  if (slot.seatsLeft === 0) return "Full";
  if (!bookable) return "Closed";
  if (slot.seatsLeft === null || slot.seatsLeft === undefined) return "Open";
  return `${slot.seatsLeft} ${slot.seatsLeft === 1 ? "seat" : "seats"} left`;
};

/** "Thu" / "22" / "Oct" of an IST day, for the day picker. */
const dayParts = (value) => {
  const date = new Date(value);
  const part = (options) => date.toLocaleDateString("en-IN", { ...options, timeZone: "Asia/Kolkata" });
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }) };
};

/**
 * Pick a slot for a scheduled ANVI interview (or move an existing booking): IST day tabs, slot pills with
 * seats left, then a confirm footer that states the reschedule allowance and the cutoff.
 */
export default function BookingSheet({ item, onClose, onDone, now: fixedNow }) {
  const rescheduling = Boolean(item?.booking && ["booked", "needs_reschedule"].includes(item.booking.status) && bookingIdOf(item.booking));
  const movingBooked = rescheduling && item.booking.status === "booked";
  const assignmentId = assignmentIdOf(item);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [day, setDay] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A new booking of an interview that uses the resume adds a step after the slot: "slots" -> "resume" ->
  // confirm -> "done" (the confirmation says whether the resume is in). Rescheduling keeps one step.
  const resume = resumeSetupOf(item);
  const askResume = !rescheduling && resume.mode !== "none";
  const [phase, setPhase] = useState("slots");
  const [booked, setBooked] = useState(null);
  // Held here, not in the step, so an upload keeps going while the student confirms the booking: no
  // waiting for the resume to be read.
  const resumeCtl = useResumeUpload({ target: { kind: "assignment", id: assignmentId }, setup: resume });
  const resumeShown = resumeCtl.provided || resumeCtl.uploading;
  const openResume = (next) => { setError(""); setPhase(next); };
  const titleRef = useRef(null);
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const value = await api.listAnviAssignmentSlots(assignmentId);
      if (aliveRef.current) setResponse(value);
    } catch (cause) {
      if (aliveRef.current) setLoadError(cause.message || "Slots could not be loaded.");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [assignmentId]);
  useEffect(() => { void load(); }, [load]);

  const now = fixedNow ?? Date.now();
  const policy = policyOf(item, response);
  const currentSlotId = String(item?.booking?.slotId || "");
  const slots = useMemo(() => normalizeSlots(response), [response]);
  const days = useMemo(() => groupSlotsByDay(slots), [slots]);
  const activeDay = days.find((entry) => entry.key === day) || days.find((entry) => entry.slots.some((slot) => slotBookable(slot, policy, now))) || days[0];
  const rescheduleLeft = Number.isFinite(Number(item?.booking?.rescheduleLeft)) ? Math.max(0, Number(item.booking.rescheduleLeft)) : policy.rescheduleLimit;
  const currentDayKey = item?.booking?.startsAt ? istDayKey(item.booking.startsAt) : "";

  // Once booked, closing the sheet (Done, Escape, the backdrop) reports the booking.
  const finish = useCallback(() => { if (booked) onDone?.(booked.result, booked.message); }, [booked, onDone]);
  const dismiss = booked ? finish : onClose;
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) dismiss?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, dismiss]);
  useEffect(() => {
    // Focus the title (not the Close button), so screen readers announce the sheet and no ring flashes.
    const opener = document.activeElement;
    titleRef.current?.focus({ preventScroll: true });
    return () => { if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus(); };
  }, []);

  const confirm = async () => {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const result = rescheduling
        ? await api.rescheduleAnviBooking(bookingIdOf(item.booking), selected.id)
        : await api.bookAnviSlot(assignmentId, selected.id);
      const message = `${rescheduling ? "Moved to" : "Booked for"} ${formatISTDay(selected.startsAt)}, ${formatISTTime(selected.startsAt)} IST.`;
      if (askResume) {
        if (aliveRef.current) { setBooked({ result, message }); setPhase("done"); }
        return;
      }
      onDone?.(result, message);
    } catch (cause) {
      if (!aliveRef.current) return;
      const code = cause?.response?.data?.code;
      setError(code === "SLOT_FULL" ? "That slot just filled up. Pick another one." : cause.message || "The slot could not be booked.");
      setSelected(null);
      setPhase("slots");
      void load();
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const title = phase === "done" ? "You're booked" : phase === "resume" ? "Add your resume" : rescheduling ? (movingBooked ? "Reschedule your slot" : "Pick a new slot") : "Book a slot";
  const showGrid = phase === "slots" && !loading && !loadError && days.length > 0;
  const slotText = selected ? `${formatISTDay(selected.startsAt)}, ${formatISTTime(selected.startsAt)}${selected.endsAt ? ` – ${formatISTTime(selected.endsAt)}` : ""} IST` : "";
  const resumeRequired = resume.mode === "required";
  const resumeIntro = <p className="text-sm text-slate-600 dark:text-zinc-300">
    {resumeRequired ? "ANVI asks about your projects and experience, so this interview needs your resume before you join. You can add it now or later." : "Optional. Add it if you want ANVI to ask about your own projects and experience."}
  </p>;

  // Portalled to <body> and above the student sidebar (z-70) and header (z-60), so the backdrop dims all of it.
  const sheet = (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onClick={busy ? undefined : dismiss}>
      <div role="dialog" aria-modal="true" aria-labelledby="anvi-booking-title"
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#242424] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-white/[0.07] sm:px-6">
          <div className="min-w-0">
            <h2 id="anvi-booking-title" ref={titleRef} tabIndex={-1} className={`text-lg font-semibold tracking-tight text-slate-950 dark:text-white ${noOutline}`}>{title}</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-zinc-400">{item?.title}</p>
          </div>
          <button type="button" onClick={dismiss} disabled={busy} aria-label="Close" className={`-mr-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${focus}`}><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {phase === "done" ? <div data-booking-done="">
            <p className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white"><CalendarCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{slotText}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">You can join from {policy.earlyJoinMinutes} min before the start. Reschedule or cancel from the interview's card.</p>
            {resumeCtl.uploading
              ? <div data-resume-confirmation="uploading" aria-live="polite" className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50/70 px-3.5 py-3 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100">
                <p className="flex flex-wrap items-center gap-2 font-semibold"><FileText className="h-4 w-4 shrink-0" aria-hidden="true" />Your resume<ResumeChip controller={resumeCtl} /></p>
                <p className="mt-1 text-[13px] opacity-90">It finishes in the background, even if you close this.</p>
              </div>
              : resumeCtl.provided
              ? <p data-resume-confirmation="added" aria-live="polite" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200"><FileText className="h-4 w-4 shrink-0" aria-hidden="true" />Resume added ✓</p>
              : <div data-resume-confirmation="missing" className={`mt-4 rounded-xl border px-3.5 py-3 text-sm ${resumeRequired ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100" : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"}`}>
                <p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 shrink-0" aria-hidden="true" />{resumeRequired ? "Add your resume before the interview" : "No resume added (optional)"}</p>
                {resumeCtl.error && <p role="alert" className="mt-1 text-[13px]">Your upload didn't go through: {resumeCtl.error.message}</p>}
                <p className="mt-1 text-[13px] opacity-90">You can add it any time from this interview's card under Upcoming.</p>
                <button type="button" onClick={() => openResume("resume-later")} className={`${btn.secondary} mt-3`}>Add resume now</button>
              </div>}
          </div>
            : phase === "resume" || phase === "resume-later" ? <div data-booking-resume="">
              {phase === "resume" && selected && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">Your slot · <span className="normal-case tracking-normal">{slotText}</span></p>}
              {resumeIntro}
              <div className="mt-4"><ResumeStep controller={resumeCtl} setup={resume} /></div>
              {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
            </div>
              : <>
          <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400"><Globe2 className="h-3.5 w-3.5" aria-hidden="true" />All times are India Standard Time (IST).</p>
          {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}

          {loading ? <div className="mt-4 space-y-4" aria-busy="true">
            <div className="flex gap-2">{[0, 1, 2, 3].map((key) => <div key={key} className="h-[76px] w-[72px] animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.06]" />)}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((key) => <div key={key} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.06]" />)}</div>
          </div>
            : loadError ? <div className="mt-4 space-y-3">
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{loadError}</p>
              <button type="button" onClick={load} className={btn.secondary}><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</button>
            </div>
              : !days.length ? <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-white/10">
                <CalendarX2 className="h-8 w-8 text-slate-300 dark:text-zinc-600" aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-600 dark:text-zinc-300">No open slots are left. Contact your institution if you still need one.</p>
              </div>
                : <div className="mt-4">
                  <div role="tablist" aria-label="Days" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
                    {days.map((entry) => {
                      const open = entry.slots.filter((slot) => slotBookable(slot, policy, now)).length;
                      const active = entry.key === activeDay?.key;
                      const parts = dayParts(entry.slots[0].startsAt);
                      return <button key={entry.key} type="button" role="tab" aria-selected={active} aria-label={`${entry.label}, ${open ? `${open} open` : "full"}`} onClick={() => setDay(entry.key)}
                        className={`relative flex w-[72px] shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-center transition ${focus} ${active
                          ? "border-violet-500 bg-violet-50 text-violet-800 ring-1 ring-violet-500 dark:border-violet-400 dark:bg-violet-500/15 dark:text-violet-100 dark:ring-violet-400"
                          : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.05]"}`}>
                        <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{parts.weekday}</span>
                        <span className="text-xl font-bold leading-7 tabular-nums">{parts.day}</span>
                        <span className="text-[11px] opacity-70">{parts.month}</span>
                        <span className={`mt-1 text-[10px] font-semibold ${open ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-zinc-400"}`}>{open ? `${open} open` : "Full"}</span>
                        {currentDayKey === entry.key && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />}
                      </button>;
                    })}
                  </div>
                  <ul role="tabpanel" aria-label={activeDay?.label} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {activeDay?.slots.map((slot) => {
                      const current = currentSlotId && slot.id === currentSlotId;
                      const bookable = !current && slotBookable(slot, policy, now);
                      const picked = selected?.id === slot.id;
                      const few = slot.seatsLeft !== null && slot.seatsLeft <= 2 && bookable;
                      return <li key={slot.id}>
                        <button type="button" disabled={!bookable} aria-pressed={picked} onClick={() => { setError(""); setSelected(slot); }}
                          aria-label={`${formatISTDay(slot.startsAt)}, ${formatISTTime(slot.startsAt)} IST, ${current ? "your current slot" : seatsText(slot, bookable)}`}
                          className={`relative w-full rounded-xl border px-3 py-2.5 text-left transition ${focus} disabled:cursor-not-allowed ${picked
                            ? "border-violet-600 bg-violet-600 text-white shadow-[0_6px_16px_-8px_rgba(124,58,237,0.7)] dark:border-violet-500 dark:bg-violet-500"
                            : current ? "border-dashed border-violet-300 bg-violet-50/50 text-violet-800 dark:border-violet-400/40 dark:bg-violet-500/[0.07] dark:text-violet-200"
                              : "border-slate-200 bg-white text-slate-900 hover:border-violet-400 hover:bg-violet-50/60 disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:border-slate-100 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-100 dark:hover:border-violet-400/60 dark:hover:bg-violet-500/10 dark:disabled:border-white/[0.05] dark:disabled:bg-transparent dark:disabled:text-zinc-500"}`}>
                          <span className="block text-sm font-semibold tabular-nums">{formatISTTime(slot.startsAt)}</span>
                          <span className={`mt-0.5 block text-[11px] font-medium ${picked ? "text-violet-100" : few ? "text-amber-700 dark:text-amber-300" : "opacity-70"}`}>{current ? "Your current slot" : seatsText(slot, bookable)}</span>
                          {picked && <Check className="absolute right-2.5 top-2.5 h-4 w-4" aria-hidden="true" />}
                        </button>
                      </li>;
                    })}
                  </ul>
                  <p className="mt-3 text-xs text-slate-500 dark:text-zinc-400">Slots starting within {policy.cutoffMinutes} min cannot be booked.</p>
                </div>}
              </>}
        </div>

        {phase === "resume" && <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/[0.07] dark:bg-white/[0.02] sm:px-6">
          <button type="button" onClick={() => { setError(""); setPhase("slots"); }} disabled={busy} className={btn.ghost}>Back</button>
          <button type="button" onClick={confirm} disabled={busy || !selected} className={`${btn.primary} h-10`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="h-4 w-4" aria-hidden="true" />}
            {resumeShown ? "Confirm booking" : "Confirm booking without resume"}
          </button>
        </div>}
        {(phase === "done" || phase === "resume-later") && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/[0.07] dark:bg-white/[0.02] sm:px-6">
          {phase === "resume-later" && <button type="button" onClick={() => setPhase("done")} className={btn.ghost}>Back</button>}
          <button type="button" onClick={finish} className={`${btn.primary} h-10`}>Done</button>
        </div>}

        {showGrid && <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/[0.07] dark:bg-white/[0.02] sm:px-6">
          {selected ? <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">{rescheduling ? "New slot" : "Your slot"}</p>
                <p className="mt-0.5 text-base font-semibold text-slate-900 dark:text-white">{formatISTDay(selected.startsAt)}, {formatISTTime(selected.startsAt)}{selected.endsAt ? ` – ${formatISTTime(selected.endsAt)}` : ""} IST</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} disabled={busy} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100">Clear</button>
            </div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs leading-5 text-slate-600 marker:text-slate-300 dark:text-zinc-400 dark:marker:text-zinc-600">
              {rescheduling
                ? <li>{movingBooked ? `This uses 1 of your ${rescheduleLeft} remaining ${rescheduleLeft === 1 ? "reschedule" : "reschedules"}. Your current slot is released.` : "Your earlier slot is no longer available, so this pick does not use a reschedule."}</li>
                : <li>You can reschedule up to {policy.rescheduleLimit} {policy.rescheduleLimit === 1 ? "time" : "times"}.</li>}
              <li>Booking, rescheduling and cancelling close {policy.cutoffMinutes} min before the slot starts.</li>
              <li>You can join from {policy.earlyJoinMinutes} min before the start until {policy.lateGraceMinutes} min after it.</li>
            </ul>
            <div className="flex sm:justify-end">
              {askResume
                ? <button type="button" onClick={() => openResume("resume")} disabled={busy} className={`${btn.primary} h-10 w-full sm:w-auto`}>
                  Next: your resume<ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                : <button type="button" onClick={confirm} disabled={busy} className={`${btn.primary} h-10 w-full sm:w-auto`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="h-4 w-4" aria-hidden="true" />}
                  {rescheduling ? "Confirm new slot" : "Confirm booking"}
                </button>}
            </div>
          </div>
            : <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-zinc-400">Select a time to continue.</p>
              <button type="button" disabled className={`${btn.primary} h-10`}><CalendarCheck className="h-4 w-4" aria-hidden="true" />{rescheduling ? "Confirm new slot" : "Confirm booking"}</button>
            </div>}
        </div>}
      </div>
    </div>
  );
  return typeof document !== "undefined" && document.body ? createPortal(sheet, document.body) : sheet;
}
