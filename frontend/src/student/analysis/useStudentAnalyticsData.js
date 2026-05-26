import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../utils/api";
import socketService from "../../utils/socket";
import { useAuth } from "../../context/AuthContext";

const SOFT_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const EVENT_REFRESH_DEBOUNCE_MS = 2500;

export function useStudentAnalyticsData() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [error, setError] = useState(null);
  const inFlightRef = useRef(false);
  const selectedCompanyRef = useRef("");
  const companiesLoadedRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const eventRefreshTimerRef = useRef(null);

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
      const [analysisRes, companiesRes] = await Promise.all([
        api.getStudentAnalysis(forceRefresh),
        shouldLoadCompanies ? api.listStudentCompanies() : Promise.resolve(null),
      ]);

      setAnalysis(analysisRes?.analysis || null);
      lastLoadedAtRef.current = Date.now();
      if (companiesRes?.companies) {
        companiesLoadedRef.current = true;
        setCompanies(companiesRes.companies);
      }

      if (selectedCompanyRef.current) {
        const readinessRes = await api.getCompanyReadiness(selectedCompanyRef.current, forceRefresh);
        setReadiness(readinessRes || null);
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
    setSelectedCompany(companyId);
    selectedCompanyRef.current = companyId;

    if (!companyId) {
      setReadiness(null);
      return;
    }

    try {
      setLoadingReadiness(true);
      setError(null);
      const result = await api.getCompanyReadiness(companyId, false);
      setReadiness(result || null);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingReadiness(false);
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
    companies,
    readiness,
    selectedCompany,
    loading,
    refreshing,
    loadingReadiness,
    error,
    reload: loadAnalytics,
    changeCompany,
  };
}
