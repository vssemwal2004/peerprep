import { useEffect, useState } from 'react';

const DEFAULT_GAP = 16;

/**
 * "Sticky to the bottom" sidebar without an inner scrollbar.
 *
 * top = min(gap, viewportHeight - sidebarHeight - gap)
 *
 * A short sidebar sticks `gap` px below the top. A sidebar taller than the viewport gets a negative
 * top, so it scrolls with the page until its last item is visible and then stays put while the
 * main column keeps scrolling. Nothing is clipped and no scrollbar is shown.
 *
 * The admin shell scrolls inside `[data-app-scroll-container]`, so that element's height is the
 * viewport; window height is the fallback. A callback ref is used so the measurement starts when
 * the sidebar actually mounts (it is not rendered while the profile is loading).
 */
export default function useStickyTop(gap = DEFAULT_GAP) {
  const [node, setNode] = useState(null);
  const [top, setTop] = useState(gap);

  useEffect(() => {
    if (!node) return undefined;
    const container = node.closest('[data-app-scroll-container]');

    const update = () => {
      const viewport = container?.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;
      setTop(Math.min(gap, viewport - node.offsetHeight - gap));
    };

    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    if (container) observer?.observe(container);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [gap, node]);

  return { ref: setNode, style: { top } };
}
