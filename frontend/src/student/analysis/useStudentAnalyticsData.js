import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../utils/api";
import socketService from "../../utils/socket";
import { useAuth } from "../../context/AuthContext";

const SOFT_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const EVENT_REFRESH_DEBOUNCE_MS = 2500;

export function useStudentAnalyticsData() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [meta, setMeta] = useState(null);
  const [history, setHistory] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [error, setError] = useState(null);
  const [companiesError, setCompaniesError] = useState(null);
  const inFlightRef = useRef(false);
  const selectedCompanyRef = useRef("");
  const companiesLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const eventRefreshTimerRef = useRef(null);
  const readinessRequestIdRef = useRef(0);

  useEffect(() => {
    selectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  const loadAnalytics = useCallback(async ({ forceRefresh = false, withLoader = false, skipIfFresh = false } = {}) => {
    if (skipIfFresh && !forceRefresh && Date.now() - lastLoadedAtRef.current < SOFT_REFRESH_INTERVAL_MS) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      setError(null);
      if (withLoader) setLoading(true);
      else setRefreshing(true);

      const shouldLoadCompanies = !companiesLoadedRef.current;
      const [analysisResult, companiesResult] = await Promise.allSettled([
        api.getStudentAnalysis(forceRefresh),
        shouldLoadCompanies ? api.listStudentCompanies() : Promise.resolve(null),
      ]);

      if (analysisResult.status === "rejected") throw analysisResult.reason;
      const analysisRes = analysisResult.value;

      setAnalysis(analysisRes?.analysis || null);
      setMeta(analysisRes?.meta || null);
      lastLoadedAtRef.current = Date.now();

      const historyResult = await Promise.allSettled([
        api.getStudentAnalysisHistory(90, forceRefresh),
      ]);
      if (historyResult[0].status === "fulfilled" && Array.isArray(historyResult[0].value?.history)) {
        setHistory(historyResult[0].value.history);
      }
      if (shouldLoadCompanies) {
        if (companiesResult.status === "fulfilled" && Array.isArray(companiesResult.value?.companies)) {
          companiesLoadedRef.current = true;
          setCompanies(companiesResult.value.companies);
          setCompaniesError(null);
        } else {
          setCompaniesError(
            companiesResult.status === "rejected"
              ? companiesResult.reason
              : new Error("Company benchmarks returned an invalid response.")
          );
        }
      }

      const companyId = selectedCompanyRef.current;
      if (companyId) {
        const requestId = ++readinessRequestIdRef.current;
        const readinessRes = await api.getCompanyReadiness(companyId, false);
        if (requestId === readinessRequestIdRef.current && selectedCompanyRef.current === companyId) {
          setReadiness(readinessRes || null);
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const changeCompany = useCallback(async (companyId) => {
    const requestId = ++readinessRequestIdRef.current;
    setSelectedCompany(companyId);
    selectedCompanyRef.current = companyId;
    setError(null);
    setReadiness(null);

    if (!companyId) {
      setLoadingReadiness(false);
      return;
    }

    try {
      setLoadingReadiness(true);
      const result = await api.getCompanyReadiness(companyId, false);
      if (requestId === readinessRequestIdRef.current && selectedCompanyRef.current === companyId) {
        setReadiness(result || null);
      }
    } catch (err) {
      if (requestId === readinessRequestIdRef.current) setError(err);
    } finally {
      if (requestId === readinessRequestIdRef.current) setLoadingReadiness(false);
    }
  }, []);

  const scheduleEventRefresh = useCallback(() => {
    window.clearTimeout(eventRefreshTimerRef.current);
    eventRefreshTimerRef.current = window.setTimeout(() => {
      loadAnalytics({ forceRefresh: true });
    }, EVENT_REFRESH_DEBOUNCE_MS);
  }, [loadAnalytics]);

  useEffect(() => {
    loadAnalytics({ withLoader: true });
  }, [loadAnalytics]);

  useEffect(() => {
    const handleWindowFocus = () => loadAnalytics({ skipIfFresh: true });
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") loadAnalytics({ skipIfFresh: true });
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAnalytics({ skipIfFresh: true });
      }
    }, SOFT_REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
      window.clearTimeout(eventRefreshTimerRef.current);
    };
  }, [loadAnalytics]);

  useEffect(() => {
    if (!user?._id) return undefined;

    socketService.connect();

    const handleSubmissionUpdate = (payload) => {
      const payloadUserId = String(payload?.userId || "");
      if (payloadUserId !== String(user._id)) return;
      if (payload?.mode !== "submit") return;
      if (!["AC", "WA", "TLE", "RE", "CE"].includes(payload?.status)) return;

      scheduleEventRefresh();
    };

    socketService.on("compiler-submission-updated", handleSubmissionUpdate);

    return () => {
      socketService.off("compiler-submission-updated", handleSubmissionUpdate);
    };
  }, [scheduleEventRefresh, user?._id]);

  return {
    analysis,
    meta,
    history,
    companies,
    readiness,
    selectedCompany,
    loading,
    refreshing,
    loadingReadiness,
    error,
    companiesError,
    reload: loadAnalytics,
    changeCompany,
  };
}
