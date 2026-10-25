import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, X } from "lucide-react";
import { Link } from "react-router-dom";
import { AnviMark } from "../../components/AnviApproach";
import { ICON_TONES, TONES } from "./theme";

/*
 * Design tokens for the admin AI interview area.
 * The app sans (Manrope, tailwind font-sans) as on the student ANVI pages, native controls follow
 * the theme (color-scheme), surfaces are white cards on slate-50 in light and gray-900 cards on
 * gray-950 in dark. Sky is the admin action colour; ANVI-branded elements use the ANVI violet.
 * Type scale: page title 22px semibold, section title 15px semibold, card title 14px semibold,
 * body 14px, helper 12px, numbers tabular.
 */
export const adminFont = "font-sans";
export const adminRoot = `${adminFont} antialiased dark:[color-scheme:dark]`;
export const pageClass = `${adminRoot} min-h-screen bg-slate-50 text-slate-800 dark:bg-gray-950 dark:text-gray-100`;
export const surfaceClass =
  "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_3px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-none";
export const insetClass = "rounded-xl border border-slate-200 bg-slate-50/70 dark:border-gray-800 dark:bg-gray-950/50";
export const labelClass = "mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-gray-200";
export const helperClass = "text-xs leading-relaxed text-slate-500 dark:text-gray-400";
export const tableHeadClass =
  "border-y border-slate-200/80 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-400";
export const tableRowClass = "transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]";
export const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:disabled:bg-gray-900 dark:disabled:text-gray-500 dark:[color-scheme:dark]";
export const primaryClass =
  "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-sky-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-sky-950/10 transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-sky-500";
export const secondaryClass =
  "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-white";
export const ghostClass =
  "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white";

export function ToneChip({ tone = "slate", dot = true, icon: Icon, children, className = "", ...rest }) {
  return (
    <span
      {...rest}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone] || TONES.slate} ${className}`}
    >
      {Icon ? (
        <Icon size={12} aria-hidden="true" className="shrink-0" />
      ) : (
        dot && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
      )}
      {children}
    </span>
  );
}

export function IconTile({ icon: Icon, tone = "sky", size = "md" }) {
  if (!Icon) return null;
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-xl";
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center ${box} ${ICON_TONES[tone] || ICON_TONES.sky}`}>
      <Icon size={size === "sm" ? 15 : 17} strokeWidth={2} />
    </span>
  );
}

// The visible asterisk is decorative; aria-required on the control carries the meaning.
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-rose-600 dark:text-rose-400">
      {" *"}
    </span>
  );
}
export function Field({ label, hint, children, className = "", required = false }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={labelClass}>
        {label}
        {required && <RequiredMark />}
      </span>
      {required && isValidElement(children)
        ? cloneElement(children, { "aria-required": true })
        : children}
      {hint && <span className={`mt-1.5 block ${helperClass}`}>{hint}</span>}
    </label>
  );
}
// Accessible on/off switch for Boolean settings.
export function Toggle({ label, description, checked, onChange, disabled }) {
  const descriptionId = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-gray-100">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className={`mt-0.5 block ${helperClass}`}>
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none dark:focus-visible:ring-offset-gray-900 ${checked ? "bg-sky-600" : "bg-slate-300 dark:bg-gray-600"}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none dark:bg-gray-100 ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
export function TextInput(props) {
  return <input {...props} className={`${inputClass} ${props.className || ""}`} />;
}
export function TextArea(props) {
  return (
    <textarea
      rows={3}
      {...props}
      className={`${inputClass} h-auto min-h-24 py-2 leading-relaxed ${props.className || ""}`}
    />
  );
}
// className sizes the wrapper (e.g. "sm:w-44"); compact gives the 36px toolbar height.
export function Select({ options, className = "", compact = false, ...props }) {
  return (
    <span className={`relative block min-w-0 ${className}`}>
      <select {...props} className={`${inputClass} appearance-none pr-9 ${compact ? "!h-9" : ""}`}>
        {options.map((o) => (
          <option
            key={typeof o === "string" ? o : o.value}
            value={typeof o === "string" ? o : o.value}
          >
            {typeof o === "string" ? o : o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500"
      />
    </span>
  );
}
// A labelled filter control for toolbars: the label is visible above, the control carries aria-label.
export function FilterField({ label, children, className = "" }) {
  return (
    <label className={`block min-w-0 text-xs font-medium text-slate-600 dark:text-gray-300 ${className}`}>
      {label}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
export function SectionHeader({ title, description, icon, tone = "sky", action, as: Heading = "h2" }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <IconTile icon={icon} tone={tone} size="sm" />
        <div className="min-w-0">
          <Heading className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">{title}</Heading>
          {description && <p className={`mt-0.5 ${helperClass} text-[13px]`}>{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
export function Panel({ title, description, icon, tone = "sky", action, children, className = "", bodyClassName = "p-5" }) {
  return (
    <section className={`${surfaceClass} ${className}`}>
      {(title || action) && (
        <div className="border-b border-slate-100 px-5 py-4 dark:border-gray-800">
          <SectionHeader title={title} description={description} icon={icon} tone={tone} action={action} />
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
export function Notice({ children, error = false }) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${error
        ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
        : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100"}`}
    >
      {children}
    </div>
  );
}
export function Badge({ children, complete, tone }) {
  return (
    <ToneChip tone={tone || (complete ? "emerald" : "slate")} className="text-[11px]">
      {children}
    </ToneChip>
  );
}
export function EmptyState({ title, detail, action }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <svg viewBox="0 0 120 90" className="mb-4 h-20 w-28" fill="none" aria-hidden="true">
        <ellipse cx="60" cy="77" rx="43" ry="7" className="fill-slate-100 dark:fill-gray-800" />
        <rect x="26" y="13" width="63" height="58" rx="10" className="fill-sky-50 stroke-sky-200 dark:fill-sky-950 dark:stroke-sky-900" />
        <path d="M40 32h32M40 42h24M40 52h16" className="stroke-sky-300 dark:stroke-sky-700" strokeWidth="3" strokeLinecap="round" />
        <circle cx="86" cy="59" r="16" className="fill-violet-100 stroke-violet-300 dark:fill-violet-950 dark:stroke-violet-800" />
        <path d="m86 49 2.5 7.5L96 59l-7.5 2.5L86 69l-2.5-7.5L76 59l7.5-2.5L86 49Z" className="fill-violet-500 dark:fill-violet-400" />
      </svg>
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-gray-400">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function Pagination({ value, onPage, onLimit }) {
  if (!value) return null;
  const { page, pages, total, limit } = value;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400">
      <span className="tabular-nums">
        {total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)}` : "0"} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        {onLimit && (
          <select
            aria-label="Items per page"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:[color-scheme:dark]"
            value={limit}
            onChange={(e) => onLimit(Number(e.target.value))}
          >
            {[25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}
        <button aria-label="Previous page" className={`${secondaryClass} min-h-8 px-2`} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} />
        </button>
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <button aria-label="Next page" className={`${secondaryClass} min-h-8 px-2`} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
export function PageHeader({ title, description, back, crumbs = [], actions, meta }) {
  return (
    <header
      data-page-header
      className="border-b border-slate-200/80 bg-white/95 px-4 pb-4 pt-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6"
    >
      <div className="mb-2 flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
        {back && (
          <Link
            aria-label="Back"
            to={back}
            className="-ml-1 mr-0.5 rounded-md p-1 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <ArrowLeft size={16} />
          </Link>
        )}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="shrink-0 text-slate-300 dark:text-gray-600" />}
              {c.to ? (
                <Link className="truncate hover:text-sky-700 dark:hover:text-sky-300" to={c.to}>
                  {c.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-slate-700 dark:text-gray-200" aria-current="page">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 truncate text-[22px] font-semibold leading-8 tracking-tight text-slate-950 dark:text-white">
              {title}
            </h1>
            {meta}
          </div>
          {description && <p className="mt-0.5 max-w-2xl text-sm text-slate-500 dark:text-gray-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
export function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null),
    label = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = ref.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus?.();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={label}
      onSubmit={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      className={`${adminRoot} m-auto max-h-[85dvh] ${wide ? "w-[min(1100px,94vw)]" : "w-[min(680px,94vw)]"} rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl shadow-slate-950/20 backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-gray-800">
        <h2 id={label} className="text-base font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>,
    document.body,
  );
}
let openDrawers = 0;
let previousBodyOverflow = "";

// Native dialog supplies focus containment and a top layer above nested editors.
export function Drawer({
  title,
  description,
  children,
  onClose,
  footer,
  readOnly = false,
}) {
  const ref = useRef(null),
    label = useId(),
    descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = ref.current;
    if (openDrawers++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    element?.showModal();
    return () => {
      element?.close();
      if (--openDrawers === 0)
        document.body.style.overflow = previousBodyOverflow;
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      data-authoring-drawer
      aria-labelledby={label}
      aria-describedby={description ? descriptionId : undefined}
      onSubmit={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.target === ref.current) onClose();
      }}
      className={`${adminRoot} fixed inset-y-0 left-auto right-0 m-0 h-[100dvh] max-h-none w-full max-w-3xl overflow-hidden border-l border-slate-200 bg-slate-50 p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100`}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="min-w-0">
            <h2 id={label} className="break-words text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className={`mt-1 ${helperClass}`}>
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <fieldset disabled={readOnly} className="min-w-0 space-y-4">
            {children}
          </fieldset>
        </div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900">
            {footer}
          </footer>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
/** The ANVI mark on a soft violet tile: the brand used on the student ANVI pages. */
export function AnviTile({ size = "md", className = "" }) {
  const box = { sm: "h-7 w-7 rounded-lg", md: "h-9 w-9 rounded-xl", lg: "h-12 w-12 rounded-2xl" }[size] || "h-9 w-9 rounded-xl";
  const mark = { sm: "h-5 w-5", md: "h-7 w-7", lg: "h-9 w-9" }[size] || "h-7 w-7";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-violet-50 to-fuchsia-50 ring-1 ring-inset ring-violet-200/80 dark:from-violet-500/15 dark:to-fuchsia-500/10 dark:ring-violet-400/25 ${box} ${className}`}
    >
      <AnviMark className={mark} />
    </span>
  );
}

/**
 * A "More" menu for secondary actions. items: { id, label, icon, danger, disabled, onSelect }
 * or { separator: true }. Destructive items go last, after a separator.
 */
export function ActionMenu({ items, label = "More actions", text = "More", className = "" }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef(null), trigger = useRef(null), menu = useRef(null);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    menu.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const onKeyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab") { close(); return; }
    const entries = [...menu.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const index = entries.indexOf(document.activeElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: entries.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    entries[(next + entries.length) % entries.length]?.focus();
  };
  return (
    <div ref={root} data-platform-popup-root className={`relative ${className}`}>
      <button
        ref={trigger}
        type="button"
        data-platform-menu-trigger
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}
        className={`${secondaryClass} ${text ? "" : "!px-2"}`}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        {text && <span className="hidden sm:inline">{text}</span>}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-50 mt-1.5 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-950/10 dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/40"
        >
          {items.filter(Boolean).map((item, index) =>
            item.separator ? (
              <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-slate-100 dark:bg-gray-800" />
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { close(true); item.onSelect(); }}
                className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${item.danger ? "text-rose-600 hover:bg-rose-50 focus:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:focus:bg-rose-500/10" : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:bg-gray-800"}`}
              >
                {item.icon && <item.icon size={15} aria-hidden="true" className="shrink-0 opacity-80" />}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// A compact icon-only action with a tooltip (title) and an accessible name.
export const iconActionClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white";
export const iconDangerClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400";

export function Avatar({ variant = "annu", size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect
        width="48"
        height="48"
        rx="13"
        fill={variant === "orbit" ? "#e0f2fe" : "#ede9fe"}
      />
      {variant === "spark" ? (
        <path d="m24 9 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#8b5cf6" />
      ) : (
        <>
          <rect
            x="11"
            y="15"
            width="26"
            height="21"
            rx="8"
            stroke={variant === "orbit" ? "#0284c7" : "#8b5cf6"}
            strokeWidth="2"
          />
          <path
            d="M24 10v5M19 29h10"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="19" cy="23" r="2" fill="#0284c7" />
          <circle cx="29" cy="23" r="2" fill="#0284c7" />
        </>
      )}
    </svg>
  );
}
