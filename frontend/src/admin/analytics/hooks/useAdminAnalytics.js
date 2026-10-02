import { useCallback, useEffect, useRef, useState } from "react";
import { adminAnalyticsApi } from "../api";

export function useAdminAnalytics(initialQuery) {
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const run = useCallback(async (nextQuery, { refresh = false } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await adminAnalyticsApi.query(nextQuery, controller.signal);
      setData(result);
      setQuery(nextQuery);
      return result;
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError);
      return null;
    } finally {
      if (controllerRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    run(initialQuery);
    return () => controllerRef.current?.abort();
  }, [initialQuery, run]);

  return { query, data, loading, refreshing, error, apply: run, refresh: () => run(query, { refresh: true }) };
}

