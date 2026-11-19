import { useCallback, useEffect, useState } from 'react';
import { getSidebarWidth } from './sidebarLayout';

/**
 * Admin / coordinator sidebar state, like the student shell: hovering expands the sidebar OVER the
 * page (the page never reflows), and the pin button keeps it open and reserves its width. Only the
 * pin changes the page's left padding, so hover costs one composited animation of the fixed rail
 * (cheap in Safari) instead of a full-page relayout on every frame.
 */
export function useOverlaySidebar(storageKey) {
  const [isPinned, setIsPinned] = useState(() => {
    try { return window.localStorage.getItem(storageKey) === 'true'; } catch { return false; }
  });
  const [isHovered, setIsHovered] = useState(false);
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, String(isPinned)); } catch { /* Storage can be disabled by the browser. */ }
  }, [storageKey, isPinned]);
  const togglePin = useCallback(() => {
    setIsPinned((value) => !value);
    setIsHovered(false);
  }, []);
  return {
    isPinned,
    isExpanded: isPinned || isHovered,
    // The page reserves the full panel only when pinned; otherwise just the rail.
    reservedWidth: getSidebarWidth(isPinned),
    togglePin,
    onExpand: useCallback(() => setIsHovered(true), []),
    onCollapse: useCallback(() => setIsHovered(false), []),
  };
}
