import { getApiBase } from "../../utils/apiBase";
import { serializeAnalyticsQuery } from "./analyticsQuery";

const API_BASE = getApiBase();

async function analyticsRequest(path, { method = "GET", body, signal, headers } = {}) {
  const response = await fetch(`${API_BASE}/admin/analytics${path}`, {
    method,
    credentials: "include",
    signal,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Analytics request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function analyticsDownload(path, { body, signal } = {}) {
  const response = await fetch(`${API_BASE}/admin/analytics${path}`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || payload.error || "Analytics export failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  const disposition = response.headers.get("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const basicName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return {
    blob: await response.blob(),
    filename: encodedName ? decodeURIComponent(encodedName) : (basicName || `peerprep-analysis-report.${body?.format || "xlsx"}`),
    rowCount: Number(response.headers.get("x-analytics-row-count")) || null,
  };
}

export const adminAnalyticsApi = {
  query: (query, signal, refresh = false) => analyticsRequest("/query", { method: "POST", body: { ...serializeAnalyticsQuery(query), refresh }, headers: refresh ? { "Cache-Control": "no-cache", "X-PeerPrep-Cache-Bypass": "true" } : undefined, signal }),
  estimate: (query, signal) => analyticsRequest("/estimate", { method: "POST", body: serializeAnalyticsQuery(query), signal }),
  options: ({ type, q = "", cursor = "", dependencies = {} }, signal) => {
    const typeMap = {
      studentIds: "students", assessmentIds: "assessments", uploadBatchIds: "upload-batches", problemIds: "problems",
      codingTopics: "coding-topics", subjectIds: "learning-subjects", chapterIds: "learning-chapters", learningTopicIds: "learning-topics",
    };
    const params = new URLSearchParams({ type: typeMap[type] || type, q, dependencies: JSON.stringify(dependencies) });
    if (cursor) params.set("cursor", cursor);
    return analyticsRequest(`/options?${params}`, { signal });
  },
  graphDetails: (graphId, { query, page = 1, limit = 25, search = "", sort = null, signal } = {}) =>
    analyticsRequest(`/graphs/${encodeURIComponent(graphId)}/details`, {
      method: "POST",
      body: { query: serializeAnalyticsQuery(query), page, limit, search, sort },
      signal,
    }),
  createExport: (request, signal) => analyticsDownload("/exports", { body: { ...request, query: serializeAnalyticsQuery(request.query) }, signal }),
};
