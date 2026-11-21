import { useCallback, useEffect, useRef, useState } from 'react';
import { READINESS_EVENT } from './readinessModel';

/**
 * Loads readiness data with a fetcher. Keeps the last good data when a refresh fails, so the page
 * can show it as stale with a retry. Reloads after an accepted solve (READINESS_EVENT) and when the
 * tab regains focus. → { data, loading, error, stale, reload }
 */
export function useReadiness(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const seq = useRef(0);

  const reload = useCallback(() => {
    if (!enabled) return;
    const id = ++seq.current;
    setState((current) => ({ ...current, loading: true }));
    fetchRef.current()
      .then((data) => { if (id === seq.current) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (id === seq.current) setState((current) => ({ data: current.data, loading: false, error })); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const later = () => { clearTimeout(timer); timer = setTimeout(reload, 1200); };
    const onFocus = () => { if (document.visibilityState === 'visible') later(); };
    window.addEventListener(READINESS_EVENT, later);
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearTimeout(timer); window.removeEventListener(READINESS_EVENT, later); document.removeEventListener('visibilitychange', onFocus); };
  }, [enabled, reload]);

  return { ...state, stale: Boolean(state.error && state.data), reload };
}
