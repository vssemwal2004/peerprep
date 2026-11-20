import { getApiBase } from "../../utils/apiBase";

const API_BASE = getApiBase();

async function request(method, body, signal) {
  const response = await fetch(`${API_BASE}/guides/progress`, {
    method,
    credentials: "include",
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Guide progress request failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** The signed-in person's guide progress: { completed, dismissed, nudgesOff }. */
export const guideProgressApi = {
  load: (signal) => request("GET", undefined, signal),
  save: (patch) => request("PATCH", patch),
};
