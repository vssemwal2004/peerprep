import { defaultFilterState, newGroup, nodeId, normalizeState } from "./filterModel.js";

const ANALYSIS_AREAS = new Set(["all", "coding", "learning", "interview", "assessment"]);

const valuesFrom = (params, key) => params.getAll(key)
  .flatMap((value) => String(value || "").split(","))
  .map((value) => value.trim())
  .filter(Boolean);

/** Build the Prep Analysis link used by an assessment report. */
export function assessmentAnalysisPath(assessment) {
  const params = new URLSearchParams({ source: "assessment" });
  const id = String(assessment?._id || assessment?.id || "").trim();
  const title = String(assessment?.title || "").trim();
  if (id) params.set("assessmentId", id);
  if (id && title) params.set("assessmentTitle", title);
  return `/admin/analysis?${params.toString()}`;
}

/**
 * URL context wins over browser-saved filters. This lets another admin page
 * open Prep Analysis for one exact feature or assessment while ordinary visits
 * still restore the admin's last filter setup.
 */
export function prepAnalysisStateFromSearch(search, storedState) {
  const params = new URLSearchParams(search || "");
  const requestedArea = params.get("area") || params.get("source");
  const assessmentIds = [...new Set([
    ...valuesFrom(params, "assessmentId"),
    ...valuesFrom(params, "assessmentIds"),
  ])];

  if (assessmentIds.length) {
    const title = String(params.get("assessmentTitle") || "").trim();
    const labels = title && assessmentIds.length === 1 ? { [assessmentIds[0]]: title } : {};
    return {
      ...defaultFilterState("assessment"),
      groups: [newGroup([{
        id: nodeId(),
        field: "assessment.assignedTests",
        operator: "anyOf",
        value: assessmentIds,
        labels,
        qualifiers: {},
      }])],
    };
  }

  if (ANALYSIS_AREAS.has(requestedArea)) return defaultFilterState(requestedArea);
  return normalizeState(storedState);
}
