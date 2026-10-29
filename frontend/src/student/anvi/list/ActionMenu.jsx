import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { btn, noOutline } from "./styles";

/**
 * The "more actions" menu of a row: secondary actions, each optionally disabled with a one-line reason
 * shown under its label. Keyboard: Arrow keys / Home / End move, Escape closes and returns focus.
 * items: [{ id, label, icon, onSelect, disabled, hint, danger, divider }]
 */
export default function ActionMenu({ label, items = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const menuId = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }); };

  // Open upward when the menu would run past the bottom of the viewport.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = menu.current.offsetHeight || 0;
    setUp(rect.bottom + height + 12 > window.innerHeight && rect.top - height - 12 > 0);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open) menu.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
  }, [open]);

  if (!items.length) return null;
  return <div ref={root} data-platform-popup-root className="relative">
    <button ref={trigger} type="button" className={btn.icon} disabled={disabled}
      aria-label={`More actions for ${label}`} aria-haspopup="menu" aria-controls={menuId} aria-expanded={open}
      onClick={(event) => { event.stopPropagation(); setOpen(!open); }}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
    </button>
    {open && <div ref={menu} id={menuId} role="menu" aria-label={`${label} actions`} data-platform-action-menu data-dropdown-direction={up ? "up" : "down"}
      className={`absolute right-0 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[#2a2a2a] dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] ${up ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === "Tab") { close(); return; }
        const entries = [...menu.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !entries.length) return;
        event.preventDefault();
        const index = entries.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length;
        entries[next]?.focus();
      }}>
      {items.map(({ id, label: text, icon: Icon, onSelect, disabled: off, hint, danger, divider }) => <div key={id}>
        {divider && <div role="separator" className="my-1 h-px bg-slate-100 dark:bg-white/[0.08]" />}
        <button type="button" role="menuitem" disabled={off} onClick={() => { close(true); onSelect?.(); }}
          className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${noOutline} transition hover:bg-slate-50 focus-visible:bg-violet-50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:hover:bg-white/[0.06] dark:focus-visible:bg-violet-500/10 dark:focus-visible:ring-violet-400/40 ${danger ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-zinc-200"}`}>
          {Icon && <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${off ? "opacity-40" : "opacity-80"}`} aria-hidden="true" />}
          <span className="min-w-0">
            <span className={`block text-sm font-medium ${off ? "opacity-50" : ""}`}>{text}</span>
            {hint && <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-zinc-400">{hint}</span>}
          </span>
        </button>
      </div>)}
    </div>}
  </div>;
}
