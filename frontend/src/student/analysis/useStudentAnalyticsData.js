import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../utils/api";
import socketService from "../../utils/socket";
import { useAuth } from "../../context/AuthContext";

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

  useEffect(() => {
    selectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  const loadAnalytics = useCallback(async ({ forceRefresh = false, withLoader = false } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      setError(null);
      if (withLoader) setLoading(true);
      else setRefreshing(true);

      const [analysisRes, companiesRes] = await Promise.all([
        api.getStudentAnalysis(forceRefresh),
        api.listStudentCompanies(),
      ]);

      setAnalysis(analysisRes?.analysis || null);
      setCompanies(companiesRes?.companies || []);

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
      const result = await api.getCompanyReadiness(companyId, true);
      setReadiness(result || null);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingReadiness(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics({ forceRefresh: true, withLoader: true });
  }, [loadAnalytics]);

  useEffect(() => {
    const handleWindowFocus = () => loadAnalytics({ forceRefresh: true });
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") loadAnalytics({ forceRefresh: true });
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAnalytics({ forceRefresh: true });
      }
    }, 30000);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
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

      loadAnalytics({ forceRefresh: true });
    };

    socketService.on("compiler-submission-updated", handleSubmissionUpdate);

    return () => {
      socketService.off("compiler-submission-updated", handleSubmissionUpdate);
    };
  }, [loadAnalytics, user?._id]);

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
