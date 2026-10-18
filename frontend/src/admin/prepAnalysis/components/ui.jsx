import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { prepAnalysisApi } from "../api";

export const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900";

const BUTTON_TONES = {
  primary: "bg-sky-600 text-white hover:bg-sky-700 disabled:bg-sky-300 dark:disabled:bg-sky-900",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.07]",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]",
  danger: "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10",
};

export function Button({ tone = "secondary", size = "md", className = "", children, ...props }) {
  const sizes = { sm: "h-7 px-2.5 text-[11.5px] gap-1.5", md: "h-8 px-3 text-[12px] gap-1.5" };
  return (
    <button type="button" className={`inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${BUTTON_TONES[tone]} ${focusRing} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-white ${focusRing} ${className}`} {...props}>
      {children}
    </button>
  );
}

/** A two-or-more option toggle (AND / OR, Top / Bottom, Count / %). */
export function Segmented({ value, options, onChange, size = "sm", label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={`rounded-md font-semibold transition-colors ${size === "sm" ? "h-6 px-2 text-[10.5px]" : "h-7 px-2.5 text-[11.5px]"} ${value === option.value ? "bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"} ${focusRing}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

/** Right-side drawer. data-platform-popup-root keeps the global popup closer away from it. */
export function Drawer({ open, onClose, title, subtitle, width = "max-w-[1040px]", footer, children }) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex justify-end" data-platform-popup-root>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative flex h-full w-full ${width} flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950`}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-gray-700">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[14px] font-bold text-slate-900 dark:text-white">{title}</h2>
<<<<<<< Updated upstream
            {subtitle && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
=======
            {subtitle && <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
>>>>>>> Stashed changes
          </div>
          <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
<<<<<<< Updated upstream
        {footer && <footer className="border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5 dark:border-gray-700 dark:bg-white/[0.02]">{footer}</footer>}
=======
        {footer && <footer className="border-t border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-gray-700 dark:bg-white/[0.02]">{footer}</footer>}
>>>>>>> Stashed changes
      </section>
    </div>,
    document.body,
  );
}

export function Dialog({ open, onClose, title, subtitle, size = "max-w-lg", footer, children }) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" data-platform-popup-root>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative flex max-h-[90vh] w-full ${size} flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950`}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-gray-700">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[13.5px] font-bold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11.5px] leading-4 text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-gray-700">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}

// Open popovers, innermost last. Only the innermost one reacts to outside clicks
// and Escape, so a list opened inside a popover never closes its parent.
const openPopovers = [];

/** Closes a popover on pointer-down outside all of `refs`, and on Escape. */
function useDismiss(open, refs, onClose) {
  // The latest handler, read at event time, so re-renders never re-register the popover.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const entry = {};
    openPopovers.push(entry);
    const isTop = () => openPopovers[openPopovers.length - 1] === entry;
    const onPointer = (event) => {
      if (isTop() && !refs.some((ref) => ref.current?.contains(event.target))) closeRef.current();
    };
    const onKey = (event) => {
      if (event.key === "Escape" && isTop()) { event.stopPropagation(); closeRef.current(); }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      openPopovers.splice(openPopovers.indexOf(entry), 1);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, refs]);
}

/**
 * Fixed position for a popover under (or, near the bottom of the screen, above)
 * its anchor. Rendered in a portal, so dialogs and scroll areas never cut it off.
 */
function useAnchoredPosition(open, anchorRef, { minWidth = 240, maxHeight = 360 } = {}) {
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return undefined; }
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(window.innerWidth - 16, Math.max(rect.width, minWidth));
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
<<<<<<< Updated upstream
      // Open upwards when the panel would not get its preferred height below the anchor.
      const wanted = Math.min(maxHeight, 360);
      const openUp = below < wanted && above > below;
=======
      const openUp = below < 260 && above > below;
>>>>>>> Stashed changes
      setPosition({
        left, width,
        maxHeight: Math.min(maxHeight, openUp ? above - 4 : below - 4),
        ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, maxHeight, minWidth, open]);
  return position;
}

<<<<<<< Updated upstream
const FOCUSABLE = "[autofocus], input:not([disabled]), button:not([disabled]), select, [tabindex]:not([tabindex='-1'])";

/**
 * A floating panel anchored to `anchorRef`, drawn above everything (portal),
 * closed by clicking outside or pressing Escape. Focus moves into the panel when
 * it opens and back to where it was when it closes. Inside a modal dialog or
 * drawer it is rendered within that dialog, so screen readers keep it reachable.
=======
/**
 * A floating panel anchored to `anchorRef`, drawn above everything (portal),
 * closed by clicking outside or pressing Escape.
>>>>>>> Stashed changes
 */
export function Popover({ open, anchorRef, onClose, minWidth = 280, maxHeight = 420, label, children }) {
  const panelRef = useRef(null);
  const refs = useMemo(() => [anchorRef, panelRef], [anchorRef]);
  useDismiss(open, refs, onClose);
  const position = useAnchoredPosition(open, anchorRef, { minWidth, maxHeight });
<<<<<<< Updated upstream
  const shown = Boolean(open && position);
  useEffect(() => {
    if (!shown) return undefined;
    const previous = document.activeElement;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
    return () => {
      // Only when focus was lost with the panel (not when the admin clicked elsewhere).
      const lost = !document.activeElement || document.activeElement === document.body || panel?.contains(document.activeElement);
      if (lost && previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, [shown]);
  if (!shown) return null;
  const host = anchorRef.current?.closest("[aria-modal='true']") || document.body;
=======
  if (!open || !position) return null;
>>>>>>> Stashed changes
  return createPortal(
    <div ref={panelRef} role="dialog" aria-label={label} data-platform-popup-root
      style={{ position: "fixed", left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
      className="z-[200] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      {children}
    </div>,
<<<<<<< Updated upstream
    host,
=======
    document.body,
>>>>>>> Stashed changes
  );
}

const optionLabel = (option) => option.label ?? String(option.value);

/** Options for a picker: a static list, or a server list searched as the admin types. */
function useOptions({ list, staticOptions, query, active = true }) {
  const [remote, setRemote] = useState({ options: [], loading: false });
  useEffect(() => {
    if (!active || staticOptions || !list) return undefined;
    const controller = new AbortController();
    setRemote((current) => ({ ...current, loading: true }));
    const timer = setTimeout(() => {
      prepAnalysisApi.options(list, query, controller.signal)
        .then((result) => setRemote({ options: result.options || [], loading: false }))
        .catch((error) => { if (error.name !== "AbortError") setRemote({ options: [], loading: false }); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, list, query, staticOptions]);
  if (staticOptions) {
    const needle = query.trim().toLowerCase();
    return { options: staticOptions.filter((option) => optionLabel(option).toLowerCase().includes(needle)), loading: false };
  }
  return remote;
}

/**
 * A searchable tick list, shown inline (inside a popover or panel).
 * multiple: value is an array; otherwise a single value. onChange(value, labels).
 */
export function OptionList({ list, staticOptions, value, multiple = true, onChange, labels = {}, maxHeight = "max-h-60", autoFocus = true }) {
  const [query, setQuery] = useState("");
  const { options, loading } = useOptions({ list, staticOptions, query });
  const selected = multiple ? (Array.isArray(value) ? value : []) : (value === "" || value == null ? [] : [value]);
  const isSelected = (option) => selected.some((entry) => String(entry) === String(option.value));
  const toggle = (option) => {
    const nextLabels = { ...labels, [option.value]: optionLabel(option) };
    if (!multiple) { onChange(option.value, nextLabels); return; }
    onChange(isSelected(option) ? selected.filter((entry) => String(entry) !== String(option.value)) : [...selected, option.value], nextLabels);
  };
  return (
    <div className="flex min-h-0 flex-col">
      <label className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 dark:border-gray-700">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <input autoFocus={autoFocus} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search…" aria-label="Search values"
          className="h-8 w-full bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100" />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </label>
      <ul role="listbox" aria-multiselectable={multiple} className={`mt-1.5 min-h-0 overflow-y-auto ${maxHeight}`}>
        {options.map((option) => (
          <li key={String(option.value)}>
            <button type="button" role="option" aria-selected={isSelected(option)} onClick={() => toggle(option)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.05]">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${multiple ? "rounded" : "rounded-full"} ${isSelected(option) ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 dark:border-white/20"}`}>
                {isSelected(option) && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className={`min-w-0 flex-1 truncate ${option.parent ? "pl-3" : ""}`}>{optionLabel(option)}</span>
              {option.count != null && <span className="text-[10.5px] tabular-nums text-slate-400">{option.count}</span>}
            </button>
          </li>
        ))}
        {!options.length && !loading && <li className="px-2 py-3 text-center text-[11.5px] text-slate-400">No matches</li>}
      </ul>
    </div>
  );
}

/** A compact dropdown button that opens an OptionList (used for "Only count…" and pickers in settings). */
export function OptionPicker({ list, staticOptions, value, multiple = true, onChange, placeholder = "Choose…", labels = {}, compact = false }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const selected = multiple ? (Array.isArray(value) ? value : []) : (value === "" || value == null ? [] : [value]);
  const labelOf = (entry) => labels[entry] ?? staticOptions?.find((option) => String(option.value) === String(entry))?.label ?? String(entry);
  const summary = selected.length === 0 ? placeholder
    : selected.length <= 2 ? selected.map(labelOf).join(", ")
      : `${labelOf(selected[0])} +${selected.length - 1}`;
  return (
    <div ref={anchorRef} className="relative min-w-0">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox"
        className={`flex w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white text-left text-[12px] transition-colors hover:border-slate-300 dark:border-gray-700 dark:bg-white/[0.03] dark:hover:border-white/20 ${compact ? "h-7 px-2" : "h-8 px-2.5"} ${focusRing}`}>
        <span className={`truncate ${selected.length ? "font-medium text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={260} label="Choose values">
        <div className="flex min-h-0 flex-col p-2">
          <OptionList list={list} staticOptions={staticOptions} value={value} multiple={multiple} labels={labels}
            onChange={(next, nextLabels) => { onChange(next, nextLabels); if (!multiple) setOpen(false); }} />
          {multiple && (
            <div className="mt-1.5 flex shrink-0 items-center justify-between border-t border-slate-100 pt-1.5 text-[11px] dark:border-gray-700">
              <span className="text-slate-500">{selected.length ? `${selected.length} selected` : "Pick one or more"}</span>
              <span className="flex gap-3">
                {selected.length > 0 && <button type="button" onClick={() => onChange([], labels)} className="font-semibold text-slate-500 hover:underline">Clear</button>}
                <button type="button" onClick={() => setOpen(false)} className="font-semibold text-sky-600 hover:underline dark:text-sky-400">Done</button>
              </span>
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}

<<<<<<< Updated upstream
// fieldClass has no width, for inputs and selects that size themselves (w-20, w-auto…):
// combining a width with inputClass's w-full would lose to w-full.
export const fieldClass = `h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-800 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-300 focus:border-sky-400 dark:border-gray-700 dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-gray-400 ${focusRing}`;
export const inputClass = `${fieldClass} w-full`;
export const selectClass = `${inputClass} pr-7`;
export const fieldSelectClass = `${fieldClass} pr-7`;
=======
export const inputClass = `h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-400 dark:border-gray-700 dark:bg-white/[0.03] dark:text-slate-100 ${focusRing}`;
export const selectClass = `${inputClass} pr-7`;
>>>>>>> Stashed changes
