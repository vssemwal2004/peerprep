import {
  ArrowRight, CalendarClock, CalendarPlus, CalendarX, Clock3, Eye, FileText, Info, Languages, Loader2, Repeat, Timer, Video,
} from "lucide-react";
import { formatDuration, modeLabel } from "../anviSchedule";
import { languageSetupOf, resumeSetupOf } from "../anviStartSetup";
import ActionMenu from "./ActionMenu";
import InterviewRow from "./InterviewRow";
import { factsOf, formatISTRange, formatISTShort, scoreOf } from "./listModel";
import { btn, focus } from "./styles";
import { ActionNote, DateTile, Meta, ScoreBadge, StatusChip } from "./ui";

const chip = "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset";
const CHIP_TONE = {
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  needed: "bg-amber-50 text-amber-800 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/25",
  quiet: "bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10",
};

/**
 * "Before your interview" chips of a booked or open scheduled interview: the resume (added, needed or
 * optional; a button that opens the resume sheet) and the interview language.
 */
export function ReadyChecklist({ item, onResume, disabled = false }) {
  const resume = resumeSetupOf(item);
  const language = languageSetupOf(item);
  // "English or Hindi" (the student picks in the lobby), else "English only".
  const languageText = language.choices.length > 1 ? `${language.choices.slice(0, -1).join(", ")} or ${language.choices.at(-1)}` : `${language.primary}${language.strict ? " only" : ""}`;
  return <ul aria-label="Before your interview" className="flex flex-wrap items-center gap-1.5" data-checklist="">
    {resume.mode !== "none" && <li>
      <button type="button" onClick={() => onResume?.(item)} disabled={disabled}
        aria-label={resume.provided ? "Resume added. Manage your resume" : `Resume ${resume.mode === "required" ? "needed" : "optional"}. Add your resume`}
        className={`${chip} ${focus} transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${resume.provided ? CHIP_TONE.done : resume.mode === "required" ? CHIP_TONE.needed : CHIP_TONE.quiet}`}>
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        {resume.provided ? "Resume added" : resume.mode === "required" ? "Add required resume" : "Resume optional"}
      </button>
    </li>}
    <li><span className={`${chip} ${CHIP_TONE.quiet}`} title={`Interview language: ${languageText}`}><Languages className="h-3.5 w-3.5" aria-hidden="true" />{languageText}</span></li>
  </ul>;
}

export const Note = ({ id, children }) => <p id={id} className="flex items-start gap-1.5"><Info className="mt-[3px] h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />{children}</p>;

/** The moment a row's date tile shows: the slot, else the window edge that matters now. */
function tileDate(item, state, now) {
  const slot = item.booking?.startsAt;
  const opens = item.window?.opensAt;
  const closes = item.window?.closesAt;
  if (state === "booked") return slot;
  if (state === "book" || state === "needs_reschedule") return closes || opens;
  if (state === "window") return opens && new Date(opens).getTime() > now ? opens : closes || opens;
  if (state === "in_progress") return item.startedAt || item.attemptStartedAt || now;
  return slot || item.endedAt || item.completedAt || closes || opens;
}

/**
 * A scheduled (institution-assigned) interview in any state. One primary action in the CTA column;
 * reschedule, calendar and cancel sit in the "more" menu with their reason when unavailable. Before the
 * join window the CTA is a quiet "Opens in ..." note, not a disabled button. The "before your interview"
 * checklist (resume, language), the reason Join is blocked, and the cancel confirmation appear under the
 * text. The resume, language and terms themselves are settled in the lobby that Join opens.
 */
export default function ScheduledRow({ entry, now, facts, busy, locked, confirmingCancel, handlers }) {
  const { item, state, join, change, id } = entry;
  const title = item.title || "AI interview";
  const subtitle = [item.role, item.companyName].filter(Boolean).join(" · ") || "Scheduled by your institution";
  const factLine = [modeLabel(item.mode), ...factsOf(facts)];
  const reasonId = `anvi-join-reason-${id}`;
  const live = (state === "booked" || state === "window") && join.phase === "open";
  const paused = item.status === "paused";
  const when = tileDate(item, state, now);

  let tone = "slate", pulse = false, chip, badge = null, meta = null, primary = null, caption = null, captionTone = "default";
  let menu = [], extra = null, extraTone = "default";

  // Join: a button once the window is open (disabled with a reason when something else blocks it); before
  // the window, a neutral "Opens in" note that carries the exact opening time.
  const beforeWindow = join.phase === "before" && join.window;
  const joinReason = beforeWindow ? "" : join.reason;
  const joinAction = (label) => (beforeWindow
    ? <ActionNote icon={Clock3} title={join.reason}>Opens in {formatDuration(join.window.from - now)}<span className="sr-only"> · {join.reason}</span></ActionNote>
    : <button type="button" onClick={() => handlers.join(item)}
      disabled={!join.enabled || busy || locked} aria-describedby={joinReason ? reasonId : undefined} className={btn.primary}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : live ? <Video className="h-4 w-4" aria-hidden="true" /> : null}
      {label}{!busy && !live && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </button>);
  const joinExtra = <div className="space-y-2">
    <ReadyChecklist item={item} onResume={handlers.resume} disabled={Boolean(locked) || busy} />
    {joinReason && <Note id={reasonId}>{joinReason}</Note>}
  </div>;

  if (state === "booked") {
    tone = live ? "emerald" : "violet"; pulse = live;
    chip = live ? <StatusChip tone="emerald" pulse>Live now</StatusChip> : <StatusChip tone="violet">Booked</StatusChip>;
    const start = new Date(item.booking.startsAt).getTime();
    meta = <Meta icon={CalendarClock}>{formatISTRange(item.booking.startsAt, item.booking.endsAt)}</Meta>;
    // The countdown sits under the CTA; before the window the "Opens in" note already says it.
    if (live) { caption = `Closes in ${formatDuration(join.window.to - now)}`; captionTone = "emerald"; }
    else if (!beforeWindow && Number.isFinite(start) && start > now) caption = `Starts in ${formatDuration(start - now)}`;
    primary = joinAction(live ? "Join now" : "Join interview");
    const left = change.rescheduleLeft;
    menu = [
      { id: "reschedule", label: "Reschedule", icon: Repeat, onSelect: () => handlers.reschedule(item), disabled: Boolean(locked) || !change.canReschedule,
        hint: change.rescheduleReason || `${left} ${left === 1 ? "reschedule" : "reschedules"} left.` },
      { id: "calendar", label: "Add to calendar", icon: CalendarPlus, onSelect: () => handlers.calendar(item), disabled: Boolean(locked), hint: "Download an .ics invite." },
      { id: "cancel", label: "Cancel booking", icon: CalendarX, danger: true, divider: true, onSelect: () => handlers.askCancel(id), disabled: Boolean(locked) || !change.canCancel,
        hint: change.cancelReason || "Releases your seat." },
    ];
    extra = joinExtra;
    if (confirmingCancel) {
      extra = <div role="group" aria-label="Confirm cancellation" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/[0.08] dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between">
        <p>{left > 0
          ? `Cancel this booking? Your seat is released. Booking another slot counts as one of your ${left} remaining ${left === 1 ? "change" : "changes"}.`
          : "Cancel this booking? Your seat is released, and you have no changes left, so only your institution can book a new slot for you."}</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={handlers.keepBooking} disabled={busy} className={btn.secondary}>Keep booking</button>
          <button type="button" onClick={() => handlers.cancel(item)} disabled={busy} className={btn.danger}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Yes, cancel</button>
        </div>
      </div>;
    }
  } else if (state === "book" || state === "needs_reschedule") {
    const rebook = state === "needs_reschedule";
    tone = "amber";
    chip = <StatusChip tone="amber">{rebook ? "Slot withdrawn" : "Booking needed"}</StatusChip>;
    meta = <Meta icon={CalendarClock}>{item.window?.closesAt ? `Book by ${formatISTShort(item.window.closesAt)}` : "Pick a time slot"}</Meta>;
    primary = <button type="button" onClick={() => handlers.book(item)} disabled={locked || paused} className={btn.primary}>
      <CalendarClock className="h-4 w-4" aria-hidden="true" />{rebook ? "Pick a new slot" : "Book a slot"}
    </button>;
    if (paused) extra = <Note>Your institution has paused bookings for this interview.</Note>;
    else if (rebook) { extraTone = "amber"; extra = <Note>Your slot was changed by your institution. Pick a new one; it does not use a reschedule.</Note>; }
  } else if (state === "window") {
    tone = live ? "emerald" : "violet"; pulse = live;
    chip = live ? <StatusChip tone="emerald" pulse>Open now</StatusChip> : <StatusChip tone="violet">Scheduled</StatusChip>;
    meta = <Meta icon={CalendarClock}>Start any time · {formatISTRange(item.window?.opensAt, item.window?.closesAt)}</Meta>;
    if (live) { caption = `Closes in ${formatDuration(join.window.to - now)}`; captionTone = "emerald"; }
    primary = joinAction(live ? "Start now" : "Join interview");
    extra = joinExtra;
  } else if (state === "in_progress") {
    tone = "violet"; pulse = true;
    chip = <StatusChip tone="violet" pulse>In progress</StatusChip>;
    meta = <Meta icon={Timer}>{item.window?.closesAt ? `Finish before ${formatISTShort(item.window.closesAt)}` : "Pick up where you left off"}</Meta>;
    primary = <button type="button" onClick={() => handlers.open(item.attemptId)} disabled={!item.attemptId} className={btn.primary}>Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>;
  } else {
    const slotAt = item.booking?.startsAt;
    meta = <Meta icon={CalendarClock}>{slotAt ? formatISTRange(slotAt, item.booking.endsAt) : `Window · ${formatISTRange(item.window?.opensAt, item.window?.closesAt)}`}</Meta>;
    if (state === "completed") {
      chip = item.reportVisible ? <StatusChip tone="emerald">Report ready</StatusChip> : <StatusChip tone="slate">Report pending</StatusChip>;
      badge = item.reportVisible ? <ScoreBadge score={scoreOf(item)} /> : null;
      primary = item.reportVisible && item.attemptId
        ? <button type="button" onClick={() => handlers.open(item.attemptId)} className={btn.secondary}><Eye className="h-4 w-4" aria-hidden="true" />View report</button>
        : null;
      if (!item.reportVisible) extra = <Note>Report will be released by your institution.</Note>;
    } else if (state === "missed") {
      tone = "rose";
      chip = <StatusChip tone="rose">Missed</StatusChip>;
      extra = <Note>You missed this interview. Contact your institution if you need another chance.</Note>;
    } else {
      chip = <StatusChip tone="slate">Cancelled</StatusChip>;
      extra = <Note>Your institution cancelled this interview.</Note>;
    }
  }

  return <InterviewRow data-assignment={id} tile={<DateTile value={when} tone={tone} pulse={pulse} />}
    title={title} chip={chip} badge={badge} subtitle={subtitle} meta={meta} facts={factLine}
    primary={primary} caption={caption} captionTone={captionTone} menu={menu.length ? <ActionMenu label={title} items={menu} /> : null} extra={extra} extraTone={extraTone} />;
}
