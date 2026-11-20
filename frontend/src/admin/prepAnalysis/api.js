import { getApiBase } from "../../utils/apiBase";
import { reportSessionEnded } from "../../auth/sessionNotice";
import { rangeToQuery } from "../../components/dateRange/dateRangeModel";

const API_BASE = getApiBase();

async function request(path, { method = "GET", body, signal, headers } = {}) {
  const response = await fetch(`${API_BASE}/admin/prep-analysis${path}`, {
    method,
    credentials: "include",
    signal,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    reportSessionEnded(response.status, payload);
    const error = new Error(payload.message || payload.error || "Prep Analysis request failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** Saves a file response (Content-Disposition names it) and returns { filename, rowCount }. */
async function saveResponse(response, fallbackName) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || payload.error || "The download could not be prepared.");
    error.status = response.status;
    throw error;
  }
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, rowCount: Number(response.headers.get("x-row-count")) || null };
}

// A scope ({ assessmentIds }) narrows every request to those assessments: the report page shows
// the same analysis for one test. Without a scope nothing is added, so Prep Analysis is unchanged.
const hasScope = (scope) => Boolean(scope?.assessmentIds?.length);
// `scope: "chart"` already means "download one chart", so the assessments travel as `assessmentScope`.
const withScope = (body, scope) => (hasScope(scope) ? { ...body, assessmentScope: { assessmentIds: scope.assessmentIds, kind: scope.kind } } : body);
const scopeQuery = (scope) => (hasScope(scope) ? { assessmentIds: scope.assessmentIds.join(","), ...(scope.kind === 'mock' ? { kind: 'mock' } : {}) } : {});

export function createPrepAnalysisApi(scope = null) {
  return {
  catalog: (signal) => request("/catalog", { signal }),
  options: (list, q = "", signal) => request(`/options?${new URLSearchParams({ list, q, ...scopeQuery(scope) })}`, { signal }),
  query: (body, { signal, refresh = false } = {}) => request("/query", {
    method: "POST",
    body: withScope({ ...body, refresh }, scope),
    headers: refresh ? { "Cache-Control": "no-cache" } : undefined,
    signal,
  }),
  count: (body, signal) => request("/count", { method: "POST", body: withScope(body, scope), signal }),
  /** Saved views: the admin's own and the ones other admins shared. */
  views: {
    list: (signal) => request("/views", { signal }),
    create: (body) => request("/views", { method: "POST", body }),
    update: (id, body) => request(`/views/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    remove: (id) => request(`/views/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  /** The admin's progress through the guides (finished guides, getting-started steps, closed cards). */
  guides: {
    progress: (signal) => request("/guides/progress", { signal }),
    update: (body) => request("/guides/progress", { method: "PATCH", body }),
  },
  /** The students behind a chart or one part of it: body is a /query body plus `drill`. */
  drill: (body, signal) => request("/drill", { method: "POST", body: withScope(body, scope), signal }),
  /** "Select all N matching": every student id behind the table (body.table.search) or a chart part (body.drill). */
  studentIds: (body, signal) => request("/student-ids", { method: "POST", body: withScope(body, scope), signal }),
  /** Send email: the admin's own templates, a preview for one student, and the send itself. */
  email: {
    // `stage`: a Practice journey gap (lost:1 …) being emailed; its own template is suggested.
    templates: (signal, stage) => request(`/email/templates${stage ? `?stage=${encodeURIComponent(stage)}` : ""}`, { signal }),
    preview: (body, signal) => request("/email/preview", { method: "POST", body: withScope(body, scope), signal }),
    /** "Send test to me": the first student's version, to the signed-in admin's own address only. */
    test: (body) => request("/email/test", { method: "POST", body: withScope(body, scope) }),
    send: (body) => request("/email/send", { method: "POST", body: withScope(body, scope) }),
  },
  /** One student's own prep for a period ({ preset } / { preset: "custom", from, to }, or a preset name). */
  student: (id, range = "all", signal) => request(`/students/${encodeURIComponent(id)}?${new URLSearchParams({ ...rangeToQuery(range), ...scopeQuery(scope) })}`, { signal }),
  /** Downloads a CSV / Excel / PDF file of the filtered students, or (scope "chart") one chart's detail. */
  download: async (body, signal) => saveResponse(await fetch(`${API_BASE}/admin/prep-analysis/export`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withScope(body, scope)),
  }), `prep-analysis.${body.format}`),
  /** Downloads one student's full report (format "xlsx" or "pdf") for a period. */
  studentReport: async (id, range = "all", format = "xlsx") => saveResponse(
    await fetch(`${API_BASE}/admin/prep-analysis/students/${encodeURIComponent(id)}/export?${new URLSearchParams({ ...rangeToQuery(range), format, ...scopeQuery(scope) })}`, { credentials: "include" }),
    `prep-report.${format}`,
  ),
  /** Compare classes: a /query body plus compareBy { dimension, values }. */
  compare: (body, { signal, refresh = false } = {}) => request("/compare", {
    method: "POST", body: withScope({ ...body, refresh }, scope), signal, headers: refresh ? { "Cache-Control": "no-cache" } : undefined,
  }),
  /** Every student behind one compared value: a /query body plus compareBy { dimension, value }. */
  compareStudents: (body, signal) => request("/compare/students", { method: "POST", body: withScope(body, scope), signal }),
  /** Downloads the comparison table (format "xlsx" or "csv"). */
  compareDownload: async (body, signal) => saveResponse(await fetch(`${API_BASE}/admin/prep-analysis/compare/export`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withScope(body, scope)),
  }), `prep-analysis-comparison.${body.format}`),
  };
}

export const prepAnalysisApi = createPrepAnalysisApi();
