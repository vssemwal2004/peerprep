// What a finished attempt's evaluation is doing: "preparing" | "ready" | "failed" | "unavailable".
// Attempts saved before reports existed carry no `report` field, so it is derived from the status.
export function reportStateOf(attempt) {
  if (!attempt || attempt.status === "in_progress") return null;
  if (attempt.report) return attempt.report;
  if (attempt.status === "ready") return "ready";
  if (attempt.status === "failed") return "failed";
  return attempt.status === "completed" || attempt.status === "evaluating" ? "preparing" : "unavailable";
}

// The room polls this often while a report is being prepared, and gives up after the window.
export const REPORT_POLL_MS = 4000;
export const REPORT_POLL_WINDOW_MS = 3 * 60_000;
