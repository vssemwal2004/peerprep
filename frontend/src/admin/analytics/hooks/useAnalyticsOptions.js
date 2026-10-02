import { useEffect, useMemo, useState } from "react";
import { adminAnalyticsApi } from "../api";

export function useAnalyticsOptions(type, search, dependencies, enabled = true) {
  const [state, setState] = useState({ items: [], loading: false, error: null, cursor: null });
  const dependencyKey = useMemo(() => JSON.stringify(dependencies || {}), [dependencies]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const result = await adminAnalyticsApi.options({ type, q: search, dependencies }, controller.signal);
        setState({ items: result.items || result.options || [], loading: false, error: null, cursor: result.nextCursor || null });
      } catch (error) {
        if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error }));
      }
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [type, search, dependencyKey, dependencies, enabled]);

  return state;
}
