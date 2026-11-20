import { createContext, useContext, useMemo } from "react";
import { createPrepAnalysisApi } from "./api";

/**
 * Which assessments the analysis is limited to: { assessmentIds: [...] }, or null for the whole
 * Prep Analysis page. Components read the API through useAnalysisApi so one place decides.
 */
export const AnalysisScopeContext = createContext(null);

export function useAnalysisScope() {
  return useContext(AnalysisScopeContext);
}

export function useAnalysisApi() {
  const scope = useContext(AnalysisScopeContext);
  const key = `${scope?.kind || 'assessment'}:${scope?.assessmentIds?.join(",") || ""}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => createPrepAnalysisApi(scope), [key]);
}
