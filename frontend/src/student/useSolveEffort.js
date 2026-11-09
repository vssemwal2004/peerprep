import { useCallback, useEffect, useRef } from 'react';

// How the student works on one practice question: when it was opened, how long the tab was in
// use, and how much code was pasted from outside the editor. Sent with each submission; the server
// turns durations into times (backend services/solveEffort.js), so the device clock is not trusted.
// Kept in sessionStorage so a reload does not restart the clock.

const STORE_PREFIX = 'pp-solve-effort:';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const blank = () => ({ openedAt: Date.now(), activeMs: 0, pastes: 0, pastedChars: 0 });

function load(key) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_PREFIX + key) || 'null');
    if (saved && Date.now() - saved.openedAt < MAX_AGE_MS) return saved;
  } catch { /* storage unavailable: start fresh */ }
  return blank();
}

function save(key, state) {
  try { sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify(state)); } catch { /* best effort */ }
}

/**
 * `problemKey` identifies the question; `getCode` returns the editor's current code. Spread
 * `pasteProps` on an element that wraps the editor; call `snapshot()` when submitting.
 */
export default function useSolveEffort(problemKey, getCode) {
  const stateRef = useRef(null);
  const visibleSinceRef = useRef(null);

  // Adds the time since the tab last became visible to the active total.
  const settle = useCallback(() => {
    const state = stateRef.current;
    if (!state || visibleSinceRef.current === null) return;
    const now = Date.now();
    state.activeMs += Math.max(0, now - visibleSinceRef.current);
    visibleSinceRef.current = document.visibilityState === 'visible' ? now : null;
    save(problemKey, state);
  }, [problemKey]);

  useEffect(() => {
    if (!problemKey) return undefined;
    stateRef.current = load(problemKey);
    visibleSinceRef.current = document.visibilityState === 'visible' ? Date.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') visibleSinceRef.current = Date.now();
      else settle();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', settle);
    return () => {
      settle();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', settle);
    };
  }, [problemKey, settle]);

  const onPasteCapture = useCallback((event) => {
    const state = stateRef.current;
    if (!state) return;
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text.trim()) return;
    // Moving the student's own code around is not an outside paste.
    if (String(getCode?.() || '').includes(text.trim())) return;
    state.pastes += 1;
    state.pastedChars += text.length;
    save(problemKey, state);
  }, [getCode, problemKey]);

  const snapshot = useCallback(() => {
    settle();
    const state = stateRef.current;
    if (!state) return null;
    return {
      elapsedMs: Math.max(0, Date.now() - state.openedAt),
      activeMs: Math.round(state.activeMs),
      pastes: state.pastes,
      pastedChars: state.pastedChars,
    };
  }, [settle]);

  return { pasteProps: { onPasteCapture }, snapshot };
}
