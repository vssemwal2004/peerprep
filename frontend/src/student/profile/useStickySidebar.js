import { useEffect, useState } from 'react';

const GAP = 16;

/**
 * "Sticky to the bottom" sidebar without an inner scrollbar.
 * A short sidebar sticks at the top (GAP). A sidebar taller than the viewport gets a negative
 * top offset, so it scrolls along with the page until its last item is visible and then stays
 * fixed while the main column keeps scrolling. Nothing is clipped and no scrollbar is shown.
 *
 * Returns a callback ref (the sidebar mounts only after the profile loads) and the style to apply.
 */
export default function useStickySidebar() {
  const [node, setNode] = useState(null);
  const [top, setTop] = useState(GAP);

  useEffect(() => {
    if (!node) return undefined;

    const update = () => {
      const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
      setTop(Math.min(GAP, viewport - node.offsetHeight - GAP));
    };

    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [node]);

  return { ref: setNode, style: { top } };
}
