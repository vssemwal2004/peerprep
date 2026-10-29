import { useId, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarRange, Clock3, Eye, NotebookPen, Plus, Repeat, X } from "lucide-react";
import { Field, TextArea, Toggle, inputClass, labelClass, secondaryClass } from "../ui";
import { Choice, IstDateTimeInput, NumberField, SectionCard } from "./scheduleUi";
import {
  BOOKING_LIMITS,
  MAX_SLOTS,
  SLOT_LIMITS,
  VISIBILITY_OPTIONS,
  WEEKDAYS,
  capacityWarnings,
  formatIst,
  formatIstDate,
  istInputToMs,
  istNowInput,
  previewSlots,
} from "./scheduleModel";


function WeekdayPicker({ value = [], onChange }) {
  const label = useId();
  const chosen = new Set(value.map(Number));
  return (
    <div>
      <span id={label} className={labelClass}>Weekdays</span>
      <div role="group" aria-labelledby={label} className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => {
          const active = chosen.has(day.value);
          return <button key={day.value} type="button" aria-pressed={active} aria-label={day.label}
            onClick={() => onChange(active ? value.filter((entry) => Number(entry) !== day.value) : [...value, day.value])}
            className={`min-h-9 min-w-12 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active ? "border-sky-600 bg-sky-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800"}`}>
            {day.short}
          </button>;
        })}
      </div>
    </div>
  );
}

function BlackoutDates({ value = [], onChange, min, max }) {
  const [date, setDate] = useState("");
  const inputId = useId();
  const add = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value.includes(date)) return;
    onChange([...value, date].sort());
    setDate("");
  };
  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>Blackout dates <span className="font-normal text-slate-400 dark:text-gray-500">(IST, no slots)</span></label>
      <div className="flex gap-2">
        <input id={inputId} type="date" className={inputClass} value={date} min={min} max={max} onChange={(event) => setDate(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
        <button type="button" className={secondaryClass} disabled={!date} onClick={add}><Plus size={14} aria-hidden="true" />Add</button>
      </div>
      {value.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Blackout dates">
        {value.map((entry) => <li key={entry} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10">
          {formatIstDate(entry)}
          <button type="button" aria-label={`Remove blackout ${formatIstDate(entry)}`} className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-gray-700" onClick={() => onChange(value.filter((item) => item !== entry))}><X size={12} aria-hidden="true" /></button>
        </li>)}
      </ul>}
    </div>
  );
}

function SlotPreview({ preview, cohortSize, warnings }) {
  const shown = preview.days.slice(0, 14);
  return (
    <section aria-label="Slot preview" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/60">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-inset ring-slate-200/70 dark:bg-gray-900 dark:ring-gray-800"><p className="text-xs font-medium text-slate-500 dark:text-gray-400">Slots</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{preview.capped ? `${MAX_SLOTS.toLocaleString("en-IN")}+` : preview.count.toLocaleString("en-IN")}</p></div>
        <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-inset ring-slate-200/70 dark:bg-gray-900 dark:ring-gray-800"><p className="text-xs font-medium text-slate-500 dark:text-gray-400">Seats</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{preview.seats.toLocaleString("en-IN")}</p></div>
        <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-inset ring-slate-200/70 dark:bg-gray-900 dark:ring-gray-800"><p className="text-xs font-medium text-slate-500 dark:text-gray-400">Students</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{cohortSize === null || cohortSize === undefined ? "—" : cohortSize.toLocaleString("en-IN")}</p></div>
      </div>
      {preview.count > 0 && <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">First slot {formatIst(preview.first)} · last slot {formatIst(preview.last)} · {preview.days.length} day{preview.days.length === 1 ? "" : "s"}</p>}
      {shown.length > 0 && <ul className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3" aria-label="Slots per day">
        {shown.map((day) => <li key={day.date} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-inset ring-slate-200/70 dark:bg-gray-900 dark:ring-gray-800"><span className="text-slate-700 dark:text-gray-200">{formatIstDate(day.date)}</span><span className="tabular-nums text-slate-500 dark:text-gray-400">{day.count} slot{day.count === 1 ? "" : "s"}</span></li>)}
      </ul>}
      {preview.days.length > shown.length && <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">and {preview.days.length - shown.length} more days</p>}
      {warnings.length > 0 && <ul className="mt-3 space-y-1.5" aria-label="Capacity warnings">
        {warnings.map((warning) => <li key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"><AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />{warning}</li>)}
      </ul>}
    </section>
  );
}

/**
 * Window and slot settings, shared by the wizard and the edit dialog.
 * `value` holds opensAt, closesAt, timing, slotPolicy and bookingPolicy.attemptsAllowed.
 */
export function WindowSlotFields({ value, onChange, cohortSize = null, estimatedMinutes = null, timingLocked = false, now = Date.now() }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setSlots = (patch) => set({ slotPolicy: { ...value.slotPolicy, ...patch } });
  const preview = useMemo(() => previewSlots({ opensAt: value.opensAt, closesAt: value.closesAt, slotPolicy: value.slotPolicy, now }), [value.opensAt, value.closesAt, value.slotPolicy, now]);
  const warnings = value.timing === "slots" ? capacityWarnings({ preview, cohortSize, slotMinutes: value.slotPolicy.slotMinutes, estimatedMinutes, attemptsAllowed: Number(value.bookingPolicy?.attemptsAllowed) || 1 }) : [];
  const open = istInputToMs(value.opensAt), close = istInputToMs(value.closesAt);
  const closeError = Number.isFinite(open) && Number.isFinite(close) && close <= open ? "Must be after the opening time." : "";
  const windowMinutes = Number.isFinite(open) && Number.isFinite(close) && close > open ? Math.round((close - open) / 60000) : null;
  return (
    <div className="space-y-5">
      <SectionCard title="Availability window" description="All times are India Standard Time (UTC+05:30)." icon={CalendarRange}>
        <div className="grid gap-4 md:grid-cols-2">
          <IstDateTimeInput label="Opens" required value={value.opensAt} min={istNowInput(now)} onChange={(opensAt) => set({ opensAt })} />
          <IstDateTimeInput label="Closes" required value={value.closesAt} min={value.opensAt || istNowInput(now)} error={closeError} onChange={(closesAt) => set({ closesAt })} />
        </div>
        {windowMinutes !== null && <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">Window length: {windowMinutes >= 1440 ? `${Math.floor(windowMinutes / 1440)} d ` : ""}{Math.floor((windowMinutes % 1440) / 60)} h {windowMinutes % 60} min</p>}
      </SectionCard>
      <SectionCard title="How students pick a time" description="Bookable slots spread the load; an open window lets students start any time." icon={Clock3} tone="indigo">
        <div className="grid gap-3 md:grid-cols-2">
          <Choice active={value.timing === "slots"} disabled={timingLocked} onClick={() => set({ timing: "slots" })} icon={CalendarClock} title="Bookable slots" description="Students book a slot with limited seats. Best for proctored labs and spreading load." />
          <Choice active={value.timing === "window"} disabled={timingLocked} onClick={() => set({ timing: "window" })} icon={CalendarRange} title="Anytime in the window" description="No booking. Students start whenever they like until 5 minutes before the window closes." />
        </div>
        {timingLocked && <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">The timing type cannot change after scheduling.</p>}
        {value.timing === "slots" && <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField label="Slot length" suffix="min" min={SLOT_LIMITS.slotMinutes[0]} max={SLOT_LIMITS.slotMinutes[1]} value={value.slotPolicy.slotMinutes} onChange={(slotMinutes) => setSlots({ slotMinutes })} hint={estimatedMinutes ? `Interview takes up to ${estimatedMinutes} min` : "15–120 minutes"} />
            <NumberField label="Seats per slot" min={SLOT_LIMITS.capacityPerSlot[0]} max={SLOT_LIMITS.capacityPerSlot[1]} value={value.slotPolicy.capacityPerSlot} onChange={(capacityPerSlot) => setSlots({ capacityPerSlot })} hint="1–200 students at once" />
            <Field label="Daily start (IST)"><input type="time" className={inputClass} value={value.slotPolicy.dailyStart} onChange={(event) => setSlots({ dailyStart: event.target.value })} /></Field>
            <Field label="Daily end (IST)"><input type="time" className={inputClass} value={value.slotPolicy.dailyEnd} onChange={(event) => setSlots({ dailyEnd: event.target.value })} /></Field>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <WeekdayPicker value={value.slotPolicy.weekdays} onChange={(weekdays) => setSlots({ weekdays })} />
            <BlackoutDates value={value.slotPolicy.blackoutDates} onChange={(blackoutDates) => setSlots({ blackoutDates })} min={value.opensAt?.slice(0, 10) || undefined} max={value.closesAt?.slice(0, 10) || undefined} />
          </div>
          <SlotPreview preview={preview} cohortSize={cohortSize} warnings={warnings} />
        </div>}
      </SectionCard>
    </div>
  );
}

/** Booking rules, attempts, report visibility, practice blocking and notes. */
export function PolicyFields({ value, onChange, showBlockPractice = true }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setPolicy = (patch) => set({ bookingPolicy: { ...value.bookingPolicy, ...patch } });
  const slots = value.timing === "slots";
  const range = (key) => ({ min: BOOKING_LIMITS[key][0], max: BOOKING_LIMITS[key][1] });
  return (
    <div className="space-y-5">
      <SectionCard title={slots ? "Booking and joining" : "Attempts"} description={slots ? "Reschedules, join window and attempts per student." : "Free scheduled attempts per student."} icon={Repeat}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slots && <>
            <NumberField label="Reschedules allowed" {...range("rescheduleLimit")} value={value.bookingPolicy.rescheduleLimit} onChange={(rescheduleLimit) => setPolicy({ rescheduleLimit })} hint="Per student, 0 to disable" />
            <NumberField label="Change cutoff" suffix="min" {...range("cutoffMinutes")} value={value.bookingPolicy.cutoffMinutes} onChange={(cutoffMinutes) => setPolicy({ cutoffMinutes })} hint="No booking, reschedule or cancel this close to the start" />
            <NumberField label="Early join" suffix="min" {...range("earlyJoinMinutes")} value={value.bookingPolicy.earlyJoinMinutes} onChange={(earlyJoinMinutes) => setPolicy({ earlyJoinMinutes })} hint="Before the slot starts" />
            <NumberField label="Late grace" suffix="min" {...range("lateGraceMinutes")} value={value.bookingPolicy.lateGraceMinutes} onChange={(lateGraceMinutes) => setPolicy({ lateGraceMinutes })} hint="After the start; later counts as a no-show" />
          </>}
          <NumberField label="Attempts allowed" {...range("attemptsAllowed")} value={value.bookingPolicy.attemptsAllowed} onChange={(attemptsAllowed) => setPolicy({ attemptsAllowed })} hint="Free scheduled attempts per student" />
        </div>
      </SectionCard>
      <SectionCard title="When students see their report" description="You always see results as soon as they are evaluated." icon={Eye} tone="indigo">
        <div className="grid gap-3 lg:grid-cols-3">
          {VISIBILITY_OPTIONS.map((option) => <Choice key={option.value} active={value.reportVisibility === option.value} onClick={() => set({ reportVisibility: option.value })} title={option.label} description={option.description} />)}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">Expected answers and key points stay hidden from students until their report is visible.</p>
      </SectionCard>
      <SectionCard title="Practice and notes" icon={NotebookPen} tone="slate" className="space-y-0">
        <div className="space-y-5">
        {showBlockPractice && <Toggle label="Block practice while scheduled" description="Students cannot take this interview as paid practice while the schedule is scheduled or open, so questions do not leak ahead of the cohort." checked={value.blockPractice !== false} onChange={(blockPractice) => set({ blockPractice })} />}
        <Field label="Internal notes" hint="Visible to admins only. Up to 1,000 characters.">
          <TextArea maxLength={1000} value={value.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="e.g. Placement drive round 1 · Lab B proctored" />
        </Field>
        </div>
      </SectionCard>
    </div>
  );
}
