import { api } from "../../../utils/api";
import { getApiBase } from "../../../utils/apiBase";

// Admin scheduling endpoints, mounted at /api/ai-interviews/schedules (admin only).
const query = (values = {}) => {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  });
  const text = p.toString();
  return text ? `?${text}` : "";
};
const id = (value) => encodeURIComponent(String(value));
const send = (path, method, body, headers) =>
  api.aiInterviewRequest(path, { method, body, headers });
// Create, add students and lifecycle actions notify up to 2,000 students before answering; the server
// allows them 120 s, so the client waits as long (an Idempotency-Key retry stays safe).
const LONG_REQUEST = Object.freeze({ timeoutMs: 120_000, skipQueue: true });
const sendLong = (path, method, body, headers) =>
  api.aiInterviewRequest(path, { method, body, headers, ...LONG_REQUEST });

async function download(path, fallbackName) {
  const res = await fetch(`${getApiBase()}/ai-interviews${path}`, { credentials: "include" });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "The export could not be downloaded.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const disposition = res.headers.get("Content-Disposition") || "";
  a.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A plain object so tests can replace single methods.
export const scheduleApi = {
  list: (values = {}) => api.aiInterviewRequest(`/schedules${query(values)}`),
  get: (assignmentId, values = {}) => api.aiInterviewRequest(`/schedules/${id(assignmentId)}${query(values)}`),
  // The Idempotency-Key makes a double submit create one schedule.
  create: (body, key) => sendLong("/schedules", "POST", body, key ? { "Idempotency-Key": key } : undefined),
  // The server reads { revision, ...changedFields } and answers 409 REVISION_CONFLICT when stale.
  update: (assignmentId, revision, patch) => send(`/schedules/${id(assignmentId)}`, "PATCH", { ...patch, revision }),
  transition: (assignmentId, action) => sendLong(`/schedules/${id(assignmentId)}/${action}`, "POST", {}),
  // Adds only students not yet on the schedule. A student holding this interview in another active
  // schedule is rejected (default, 409 ALREADY_ASSIGNED) or skipped (`duplicates: "skip"`); once that
  // schedule is cancelled or closed they can be assigned again.
  addTargets: (assignmentId, studentIds, { source, duplicates } = {}) => sendLong(`/schedules/${id(assignmentId)}/targets`, "POST", {
    studentIds, ...(source ? { source } : {}), ...(duplicates ? { duplicates } : {}),
  }),
  removeTarget: (assignmentId, studentId) => send(`/schedules/${id(assignmentId)}/targets/${id(studentId)}`, "DELETE"),
  // Removing cancels each student's future booking; their rows and booking history are kept.
  removeTargets: (assignmentId, studentIds, { endInProgress = false } = {}) => sendLong(`/schedules/${id(assignmentId)}/targets/remove`, "POST", { studentIds, ...(endInProgress ? { endInProgress: true } : {}) }),
  resetTarget: (assignmentId, studentId, { endInProgress = false } = {}) => send(`/schedules/${id(assignmentId)}/targets/${id(studentId)}/reset`, "POST", endInProgress ? { endInProgress: true } : {}),
  notifyTargets: (assignmentId, studentIds) => sendLong(`/schedules/${id(assignmentId)}/targets/notify`, "POST", { studentIds }),
  // Assigned students with booking and attempt: { rows, counts, pagination, schedules, sort }.
  targets: (assignmentId, values = {}) => api.aiInterviewRequest(`/schedules/${id(assignmentId)}/targets${query(values)}`),
  interviewTargets: (interviewId, values = {}) => api.aiInterviewRequest(`/schedules/by-interview/${id(interviewId)}/targets${query(values)}`),
  slots: (assignmentId, values = {}) => api.aiInterviewRequest(`/schedules/${id(assignmentId)}/slots${query(values)}`),
  moveBooking: (bookingId, slotId) => send(`/schedules/bookings/${id(bookingId)}/move`, "POST", { slotId }),
  cancelBooking: (bookingId, reason = "") => send(`/schedules/bookings/${id(bookingId)}/cancel`, "POST", { reason }),
  downloadRoster: (assignmentId) => download(`/schedules/${id(assignmentId)}/roster.csv`, "anvi-schedule-roster.csv"),
  // Cohort report endpoints live with the attempt reports.
  summary: (assignmentId) => api.aiInterviewRequest(`/reports/assignments/${id(assignmentId)}/summary`),
  downloadReport: (assignmentId) => download(`/reports/assignments/${id(assignmentId)}/export.csv`, "anvi-cohort-report.csv"),
};
