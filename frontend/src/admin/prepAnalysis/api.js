import { getApiBase } from "../../utils/apiBase";

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

export const prepAnalysisApi = {
  catalog: (signal) => request("/catalog", { signal }),
  options: (list, q = "", signal) => request(`/options?${new URLSearchParams({ list, q })}`, { signal }),
  query: (body, { signal, refresh = false } = {}) => request("/query", {
    method: "POST",
    body: { ...body, refresh },
    headers: refresh ? { "Cache-Control": "no-cache" } : undefined,
    signal,
  }),
  count: (body, signal) => request("/count", { method: "POST", body, signal }),
  /** Saved views: the admin's own and the ones other admins shared. */
  views: {
    list: (signal) => request("/views", { signal }),
    create: (body) => request("/views", { method: "POST", body }),
    update: (id, body) => request(`/views/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    remove: (id) => request(`/views/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  /** The students behind a chart or one part of it: body is a /query body plus `drill`. */
  drill: (body, signal) => request("/drill", { method: "POST", body, signal }),
  /** One student's own prep for a period (preset such as "90d" or "all"). */
  student: (id, range = "all", signal) => request(`/students/${encodeURIComponent(id)}?${new URLSearchParams({ range })}`, { signal }),
  /** Downloads a CSV / Excel / PDF file of the filtered students, or (scope "chart") one chart's detail. */
  download: async (body, signal) => saveResponse(await fetch(`${API_BASE}/admin/prep-analysis/export`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), `prep-analysis.${body.format}`),
  /** Downloads one student's full report (format "xlsx" or "pdf") for a period preset. */
  studentReport: async (id, range = "all", format = "xlsx") => saveResponse(
    await fetch(`${API_BASE}/admin/prep-analysis/students/${encodeURIComponent(id)}/export?${new URLSearchParams({ range, format })}`, { credentials: "include" }),
    `prep-report.${format}`,
  ),
};
