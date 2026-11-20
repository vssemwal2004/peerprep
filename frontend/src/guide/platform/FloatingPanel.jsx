import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A panel drawn on <body> next to its anchor (below if it fits, else above), closed by Esc, a
 * click outside, or scrolling the page away. Used by the ⓘ buttons.
 */
export default function FloatingPanel({ anchor, onClose, width = 340, children, label, onPointerEnter, onPointerLeave, closeOnScroll = true }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const height = ref.current?.offsetHeight || 260;
      const w = Math.min(width, window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 8);
      const below = rect.bottom + 8 + height <= window.innerHeight - 8 || rect.top - 8 - height < 8;
      const top = below ? Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - height - 8)) : rect.top - 8 - height;
      setPos({ left, top, width: w });
    };
    place();
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", place); };
  }, [anchor, width]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); anchor?.focus?.(); } };
    const onDown = (event) => {
      if (ref.current?.contains(event.target) || anchor?.contains(event.target)) return;
      onClose();
    };
    const onScroll = (event) => { if (closeOnScroll && !ref.current?.contains(event.target)) onClose(); };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, closeOnScroll, onClose]);

  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
      className="fixed z-[8600] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_20px_50px_rgba(15,23,42,0.22)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/50"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width ?? width, visibility: pos ? "visible" : "hidden" }}>
      {children}
    </div>,
    document.body,
  );
}
