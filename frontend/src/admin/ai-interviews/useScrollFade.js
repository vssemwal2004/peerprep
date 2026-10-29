import { useLayoutEffect, useRef, useState } from "react";

// Horizontal tab strips on phones: snap, no scrollbar, a fade on the right edge while more tabs are off-screen.
export const scrollStripClass =
  "snap-x scroll-px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const FADE = "linear-gradient(to right, #000 calc(100% - 40px), transparent)";

/** Returns { ref, style } for a scrollable strip: the active tab is scrolled into view, and the
 *  right edge fades while more tabs are hidden. `deps` re-run it (e.g. the active route). */
export function useScrollFade(deps = []) {
  const ref = useRef(null);
  const [fade, setFade] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => setFade(element.scrollWidth - element.clientWidth - element.scrollLeft > 4);
    const reveal = () => {
      const active = element.querySelector('[aria-current="page"], [aria-pressed="true"], [aria-selected="true"]');
      if (active && element.scrollWidth > element.clientWidth) {
        const box = element.getBoundingClientRect(), tab = active.getBoundingClientRect();
        if (tab.right > box.right - 8) element.scrollLeft += tab.right - box.right + 32;
      }
      update();
    };
    reveal();
    // Web fonts can widen the tabs after the first layout.
    const frame = window.requestAnimationFrame?.(reveal);
    document.fonts?.ready?.then(() => { if (element.isConnected) reveal(); });
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      if (frame) window.cancelAnimationFrame?.(frame);
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ref, style: fade ? { WebkitMaskImage: FADE, maskImage: FADE } : undefined };
}
