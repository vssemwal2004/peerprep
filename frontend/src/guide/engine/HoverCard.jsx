import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A small card shown on hover or focus (and on tap) next to its trigger, drawn on <body> so a
 * card's rounded or overflow-hidden frame never clips it. `children` is the trigger.
 */
export default function HoverCard({ title, children, body, className = "", width = 260 }) {
  const ref = useRef(null);
  const [rect, setRect] = useState(null);
  const timer = useRef(null);
  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (ref.current) setRect(ref.current.getBoundingClientRect()); }, 120);
  }, []);
  const hide = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setRect(null), 80); }, []);
  useEffect(() => {
    if (!rect) return undefined;
    const close = () => setRect(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [rect]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const below = rect ? rect.bottom + 8 + 120 < window.innerHeight : true;
  const left = rect ? Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8) : 0;
  return (
    <>
      <span ref={ref} tabIndex={0} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}
        onClick={(event) => { event.stopPropagation(); if (ref.current) setRect(rect ? null : ref.current.getBoundingClientRect()); }}
        data-own-clicks className={`cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${className}`}>
        {children}
      </span>
      {rect && typeof document !== "undefined" && createPortal(
        <div role="tooltip" onPointerEnter={() => window.clearTimeout(timer.current)} onPointerLeave={hide}
          className="fixed z-[10050] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.18)] dark:border-gray-700 dark:bg-gray-900"
          style={{ width, left, ...(below ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }) }}>
          {title && <p className="text-[12px] font-bold text-slate-900 dark:text-white">{title}</p>}
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">{body}</p>
        </div>,
        document.body,
      )}
    </>
  );
}
