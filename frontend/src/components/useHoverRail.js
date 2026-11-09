import { useEffect, useRef, useState } from 'react';

// Shared by the side panels that collapse to an icon rail (Prep Assessment filters, Prep Library).
// Same feel as the global sidebar: a 0.8 s slide with the same easing.
export const RAIL_WIDTH = 60;
export const RAIL_PANEL_WIDTH = 240;
// Literal class strings so Tailwind generates them.
export const RAIL_SLIDE = 'duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * Hover rail state. Above `query` the panel is a rail that opens while the pointer is over it,
 * while keyboard focus is inside it, or while a native picker (select / date) is open; below it
 * the panel is always open. Spread `railProps` on the element the pointer enters, `pickProps` on
 * native selects and date inputs, and `reveal` on labels that slide in while icons stay fixed.
 */
export function useHoverRail(query = '(min-width: 1024px)') {
  const rail = useMediaQuery(query);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  // A native <select> list sits outside the page, so leaving the panel for it must not close it.
  const [picking, setPicking] = useState(false);
  const ref = useRef(null);
  const open = !rail || hovered || keyboardFocus || picking;

  return {
    rail,
    open,
    railProps: {
      ref,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: (event) => { if (event.target.matches?.(':focus-visible')) setKeyboardFocus(true); },
      onBlur: (event) => { if (!ref.current?.contains(event.relatedTarget)) setKeyboardFocus(false); },
    },
    pickProps: { onFocus: () => setPicking(true), onBlur: () => setPicking(false) },
    donePicking: () => setPicking(false),
    reveal: `transition-[opacity,transform] ${RAIL_SLIDE} ${open ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-2 opacity-0'}`,
  };
}
