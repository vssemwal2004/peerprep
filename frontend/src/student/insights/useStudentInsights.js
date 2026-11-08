import { useCallback, useEffect, useRef, useState } from "react";
import socketService from "../../utils/socket";
import { useAuth } from "../../context/AuthContext";
import { insightsApi } from "./insightsApi";
import { normalizeInsights } from "./insightModel";

const SUBMISSION_REFRESH_MS = 3000;
// Moving between Prep Analysis pages remounts the page; answers are kept for this long so the
// next page opens at once (and is quietly refreshed when older).
const FRESH_MS = 60_000;
const cache = new Map();
const cacheKey = (userId, range) => `${userId || ""}|${range.period}|${range.from || ""}|${range.to || ""}`;

/**
 * The student's analysis for a period. While another period loads, the last answer stays on
 * screen (refreshing = true). A graded submission by this student refreshes it shortly after.
 */
export function useStudentInsights(range) {
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const key = cacheKey(userId, range);
  const [state, setState] = useState(() => {
    const cached = cache.get(key);
    return { data: cached?.data || null, loading: !cached, refreshing: false, error: null };
  });
  const requestRef = useRef(0);
  const controllerRef = useRef(null);

  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = ++requestRef.current;
    if (!quiet) setState((previous) => ({ ...previous, loading: !previous.data, refreshing: Boolean(previous.data), error: null }));
    try {
      const data = normalizeInsights(await insightsApi.load(range, { refresh, signal: controller.signal }));
      cache.set(key, { data, at: Date.now() });
      if (request === requestRef.current) setState({ data, loading: false, refreshing: false, error: null });
    } catch (error) {
      if (error.name === "AbortError" || request !== requestRef.current) return;
      setState((previous) => ({ ...previous, loading: false, refreshing: false, error }));
    }
    // `key` stands for the range's values; the range object itself changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached.data, loading: false, refreshing: false, error: null });
      if (Date.now() - cached.at > FRESH_MS) load({ quiet: true });
    } else load();
    return () => controllerRef.current?.abort();
  }, [key, load]);

  useEffect(() => {
    if (!userId) return undefined;
    let timer = null;
    socketService.connect();
    const onSubmission = (payload) => {
      if (String(payload?.userId || "") !== String(userId) || payload?.mode !== "submit") return;
      if (!["AC", "WA", "TLE", "RE", "CE"].includes(payload?.status)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => load({ refresh: true }), SUBMISSION_REFRESH_MS);
    };
    socketService.on("compiler-submission-updated", onSubmission);
    return () => { window.clearTimeout(timer); socketService.off("compiler-submission-updated", onSubmission); };
  }, [load, userId]);

  return { ...state, reload: load };
}
