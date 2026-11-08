import { getApiBase } from "../../utils/apiBase";

const API_BASE = getApiBase();

async function request(path, { signal } = {}) {
  const response = await fetch(`${API_BASE}/student/analysis${path}`, { credentials: "include", signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Your analysis could not be loaded.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** { period } or { period: "custom", from, to } as a query string; refresh asks for a fresh build. */
export const periodQuery = ({ period, from, to }, extra = {}) => new URLSearchParams({
  period, ...(period === "custom" ? { ...(from ? { from } : {}), ...(to ? { to } : {}) } : {}), ...extra,
}).toString();

export const insightsApi = {
  load: (range, { refresh = false, signal } = {}) => request(`/insights?${periodQuery(range, refresh ? { refresh: "1" } : {})}`, { signal }),
  topic: (key, signal) => request(`/insights/topics/${encodeURIComponent(key)}`, { signal }),
  companies: (signal) => request("/companies", { signal }),
  readiness: (companyId, signal) => request(`/readiness?companyId=${encodeURIComponent(companyId)}`, { signal }),
  /** Saves the student's own report (format "xlsx" or "pdf") for the period. */
  async report(range, format) {
    const response = await fetch(`${API_BASE}/student/analysis/insights/report?${periodQuery(range, { format })}`, { credentials: "include" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || payload.error || "The report could not be prepared.");
    }
    const filename = (response.headers.get("content-disposition") || "").match(/filename="?([^";]+)"?/i)?.[1] || `prep-report.${format}`;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  },
};
