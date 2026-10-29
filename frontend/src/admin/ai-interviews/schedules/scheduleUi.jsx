import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, MoreVertical } from "lucide-react";
import { ICON_TONES } from "../theme";
import { Dialog, PageHeader, RequiredMark, SectionHeader, ToneChip, adminRoot, helperClass, inputClass, labelClass, pageClass, primaryClass, secondaryClass, surfaceClass } from "../ui";
import { OUTCOME_META, STATUS_META, formatIst, istInputToIso } from "./scheduleModel";

export const dangerClass =
  "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20";

export function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status || "Unknown", tone: "slate" };
  return <ToneChip tone={meta.tone}>{meta.label}</ToneChip>;
}
export function OutcomePill({ outcome }) {
  const meta = OUTCOME_META[outcome] || { label: String(outcome || "pending").replaceAll("_", " "), tone: "slate" };
  return <ToneChip tone={meta.tone}>{meta.label}</ToneChip>;
}

/** A card section with an icon header, used by the schedule wizard, edit dialog and detail page. */
export function SectionCard({ title, description, icon, tone = "sky", action, children, className = "" }) {
  return (
    <section className={`${surfaceClass} p-5 ${className}`}>
      {title && <div className="mb-5"><SectionHeader as="h3" title={title} description={description} icon={icon} tone={tone} action={action} /></div>}
      {children}
    </section>
  );
}

/** The workspace frame: the same header and optional secondary navigation as the other AI interview pages. */
export function ScheduleFrame({ title, description, meta, back, crumbs, actions, navigation, children }) {
  return (
    <main className={pageClass}>
      <PageHeader title={title} description={description} meta={meta} back={back} crumbs={crumbs} actions={actions} />
      <div className={`min-h-[calc(100vh-100px)] ${navigation ? "grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]" : ""}`}>
        {navigation}
        <div className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** A wall-clock IST date-time input; the value is "YYYY-MM-DDTHH:mm" and is sent with +05:30. */
export function IstDateTimeInput({ label, value, onChange, min, required = false, error = "", hint }) {
  const inputId = useId(), messageId = useId();
  const iso = istInputToIso(value);
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className={labelClass}>
        {label} <span className="font-normal text-slate-400 dark:text-gray-500">(IST)</span>{required && <RequiredMark />}
      </label>
      <input
        id={inputId}
        type="datetime-local"
        className={`${inputClass} tabular-nums ${error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500/70" : ""}`}
        value={value || ""}
        min={min || undefined}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={messageId} className={`mt-1.5 block text-xs ${error ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-gray-400"}`} role={error ? "alert" : undefined}>
        {error || (iso ? formatIst(iso) : hint || "India Standard Time (UTC+05:30)")}
      </span>
    </div>
  );
}

export function NumberField({ label, value, onChange, min, max, suffix, hint, disabled }) {
  const inputId = useId(), hintId = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className={labelClass}>{label}</label>
      <div className="relative">
        <input id={inputId} type="number" inputMode="numeric" min={min} max={max} step={1} disabled={disabled}
          className={`${inputClass} tabular-nums ${suffix ? "pr-12" : ""}`} value={value} aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />
        {suffix && <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-gray-500">{suffix}</span>}
      </div>
      {hint && <span id={hintId} className={`mt-1.5 block ${helperClass}`}>{hint}</span>}
    </div>
  );
}

export function Choice({ active, onClick, icon: Icon, title, description, disabled }) {
  return (
    <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick}
      className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-sky-500 bg-sky-50/70 ring-1 ring-sky-500 dark:border-sky-500 dark:bg-sky-400/10" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800/60"}`}>
      {Icon && <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? ICON_TONES.sky : ICON_TONES.slate}`}><Icon size={16} /></span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 dark:text-gray-100">{title}</span>
        {description && <span className="mt-1 block text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">{description}</span>}
      </span>
      <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 dark:border-gray-600"}`}>
        {active && <Check size={12} strokeWidth={3} />}
      </span>
    </button>
  );
}

const BARS = { slate: "bg-slate-400", sky: "bg-sky-500", violet: "bg-violet-500", emerald: "bg-emerald-500", rose: "bg-rose-500", amber: "bg-amber-500" };

export function KpiTile({ label, value, total, tone = "slate", icon: Icon, detail }) {
  const share = total ? Math.round((value / total) * 100) : null;
  return (
    <div className={`${surfaceClass} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-slate-500 dark:text-gray-400">{label}</p>
        {Icon && <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-lg ${ICON_TONES[tone] || ICON_TONES.slate}`}><Icon size={14} /></span>}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-8 tracking-tight tabular-nums text-slate-900 dark:text-white">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
      {share !== null ? <>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" aria-hidden="true">
          <div className={`h-full rounded-full ${BARS[tone] || BARS.slate}`} style={{ width: `${Math.min(100, share)}%` }} />
        </div>
        <p className="mt-1.5 text-xs tabular-nums text-slate-500 dark:text-gray-400">{share}% of cohort</p>
      </> : detail ? <p className="mt-1.5 text-xs text-slate-500 dark:text-gray-400">{detail}</p> : null}
    </div>
  );
}

/**
 * A row's "⋮" menu. The list renders in a portal at a fixed position, so a scrolling table never clips it.
 * items: { id, label, icon, danger, disabled, onSelect } or { separator: true }.
 */
export function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const trigger = useRef(null), menu = useRef(null);
  const menuId = useId();
  const entries = items.filter(Boolean);
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight || 0;
    const below = box.bottom + 6 + height <= window.innerHeight - 8;
    setPlace({ top: below ? box.bottom + 6 : Math.max(8, box.top - 6 - height), right: Math.max(8, window.innerWidth - box.right) });
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    const dismiss = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    menu.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [open]);
  const onKeyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab") { close(); return; }
    const list = [...menu.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const index = list.indexOf(document.activeElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    list[(next + list.length) % list.length]?.focus();
  };
  return <>
    <button ref={trigger} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
      <MoreVertical size={16} aria-hidden="true" />
    </button>
    {open && createPortal(
      <div ref={menu} id={menuId} role="menu" aria-label={label} onKeyDown={onKeyDown} data-platform-popup-root
        style={{ position: "fixed", top: place?.top ?? -9999, right: place?.right ?? 0 }}
        className={`${adminRoot} z-[60] w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-950/10 dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/40`}>
        {entries.map((item, index) => item.separator
          ? <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-slate-100 dark:bg-gray-800" />
          : <button key={item.id} type="button" role="menuitem" disabled={item.disabled} title={item.hint || undefined}
            onClick={() => { close(true); item.onSelect(); }}
            className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${item.danger ? "text-rose-600 hover:bg-rose-50 focus:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:focus:bg-rose-500/10" : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:bg-gray-800"}`}>
            {item.icon && <item.icon size={15} aria-hidden="true" className="shrink-0 opacity-80" />}
            {item.label}
          </button>)}
      </div>, document.body)}
  </>;
}

/** Segmented control (role=tablist) for switching views inside a card. items: { value, label, icon, count }. */
export function Segmented({ label, value, onChange, items, className = "" }) {
  const refs = useRef([]);
  const move = (event, index) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = (index + delta + items.length) % items.length;
    if (items[next].disabled) return;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return <div role="tablist" aria-label={label} className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-gray-950/70 ${className}`}>
    {items.map((item, index) => {
      const active = value === item.value;
      const Icon = item.icon;
      return <button key={item.value} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
        disabled={item.disabled} onKeyDown={(event) => move(event, index)} onClick={() => onChange(item.value)}
        className={`inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-gray-800 dark:text-white dark:ring-gray-700" : "text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"}`}>
        {Icon && <Icon size={15} aria-hidden="true" className={active ? "text-sky-600 dark:text-sky-400" : ""} />}
        {item.label}
        {item.count !== undefined && item.count !== null && <span className={`rounded-md px-1.5 py-px text-[11px] font-semibold tabular-nums ${active ? "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300" : "bg-slate-200/70 text-slate-600 dark:bg-white/5 dark:text-gray-400"}`}>{Number(item.count).toLocaleString("en-IN")}</span>}
      </button>;
    })}
  </div>;
}

/** A 16px checkbox drawn to match the kit; `indeterminate` shows a dash (some rows on the page are selected). */
export function CheckBox({ checked, indeterminate = false, disabled = false, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = Boolean(indeterminate && !checked); }, [indeterminate, checked]);
  return <span className="relative inline-flex h-4 w-4 shrink-0">
    <input ref={ref} type="checkbox" aria-label={label} checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)}
      className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 bg-white transition-colors checked:border-sky-600 checked:bg-sky-600 indeterminate:border-sky-600 indeterminate:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-950 dark:checked:border-sky-500 dark:checked:bg-sky-500 dark:indeterminate:border-sky-500 dark:indeterminate:bg-sky-500dark:focus-visible:ring-offset-gray-900" />
    {checked ? <Check size={12} strokeWidth={3} aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 text-white" />
      : indeterminate ? <Minus size={12} strokeWidth={3} aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 text-white" /> : null}
  </span>;
}

const AVATAR_TONES = ["bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300", "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300", "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300", "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300", "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300", "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300"];
/** Initials on a soft tile, the colour stable per name. */
export function Initials({ name = "", size = "md" }) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const text = (parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : (parts[0] || "?").slice(0, 2)).toUpperCase();
  const tone = AVATAR_TONES[[...String(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TONES.length];
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${size === "sm" ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-xs"} ${tone}`}>{text}</span>;
}

/** A confirm step for consequential actions, with an optional reason field. */
export function ConfirmDialog({ title, message, confirmLabel, danger = false, busy = false, error = "", onConfirm, onClose, children }) {
  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose}>
      <p className="text-sm leading-relaxed text-slate-600 dark:text-gray-300">{message}</p>
      {children && <div className="mt-4">{children}</div>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>Keep as is</button>
        <button type="button" className={danger ? dangerClass : primaryClass} disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </Dialog>
  );
}
