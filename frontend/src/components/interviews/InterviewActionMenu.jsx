import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export default function InterviewActionMenu({ name, actions }) {
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState(320);
  const menuId = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  // The global dismiss manager may click the trigger in the same pointer
  // cycle as our outside listener. Use this render's open state so both
  // dismissals close it instead of toggling it closed and open again.
  const toggle = () => setOpen(!open);
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }); };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = trigger.current.getBoundingClientRect();
      setMaxHeight(Math.max(80, Math.min(320, window.innerHeight - rect.bottom - 12)));
    };
    place();
    // An anchored dropdown moves with its trigger. Scrolling must not discard
    // a pointer press before the browser can dispatch the item's click.
    const reposition = (event) => { if (!event.target?.nodeType || !menu.current?.contains(event.target)) place(); };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open, actions.length]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector('button')?.focus({ preventScroll: true }); }, [open]);

  return <div ref={root} data-platform-popup-root className="relative">
    <button ref={trigger} type="button" data-platform-menu-trigger aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-controls={menuId} aria-expanded={open} onClick={(event) => { event.stopPropagation(); toggle(); }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 focus-visible:outline-sky-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"><MoreVertical className="h-4 w-4" /></button>
    {open && <div ref={menu} id={menuId} data-platform-action-menu data-dropdown-direction="down" role="menu" aria-label={`${name} actions`} style={{ maxHeight }} className="absolute right-0 top-full z-[1000] mt-1.5 w-60 max-w-[calc(100vw_-_2rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (event.key === 'Tab') close();
      const items = [...menu.current.querySelectorAll('[role="menuitem"]')];
      const index = items.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>{actions.map(({ id, label, icon: Icon, danger, run }) => <button key={id} type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); close(true); run(); }} className={`flex min-h-8 w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium outline-none hover:bg-slate-50 focus:bg-sky-50 dark:hover:bg-gray-800 dark:focus:bg-gray-800 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-gray-200'}`}><Icon className="h-3.5 w-3.5 shrink-0" />{label}</button>)}</div>}
  </div>;
}
