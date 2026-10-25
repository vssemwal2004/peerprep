import { summarize } from "../../definition.js";

// Mirrors backend ANVI_DURATIONS and DURATION_MAX_QUESTIONS (aiInterviewDefinition.js).
export const DURATIONS = Object.freeze([10, 15, 30, 45, 60]);
export const DURATION_MAX_QUESTIONS = Object.freeze({ 10: 4, 15: 5, 30: 8, 45: 12, 60: 15 });
export const HYBRID_DEFAULTS = Object.freeze({ allowLiveWarmup: false, conversationalSectionIds: [], allowStudentLiveMode: false });

/** anvi.durationMinutes, or null when the interview has no length set (older interviews). */
export const readDuration = (data) => {
  const value = Number(data?.anvi?.durationMinutes);
  return DURATIONS.includes(value) ? value : null;
};
/** Sets or clears anvi.durationMinutes; other ANVI settings are kept. */
export function writeDuration(data, minutes) {
  const value = Number(minutes);
  const anvi = { ...(data?.anvi || {}) };
  delete anvi.durationMinutes;
  return { ...data, anvi: DURATIONS.includes(value) ? { ...anvi, durationMinutes: value } : anvi };
}

/**
 * The questions a duration suits (the same range the server check uses), the questions planned now
 * and a warning when they do not fit. Returns null without a duration.
 */
export function durationGuidance(data, minutes = readDuration(data)) {
  if (!DURATIONS.includes(minutes)) return null;
  const max = DURATION_MAX_QUESTIONS[minutes];
  const shorter = DURATIONS.filter((value) => value < minutes).at(-1);
  const min = shorter ? DURATION_MAX_QUESTIONS[shorter] + 1 : 1;
  const { manual, planned: live } = summarize({ sections: [], ...data });
  const planned = manual + live;
  const warning =
    planned > max
      ? `${planned} questions are planned, but a ${minutes}-minute interview asks at most ${max}. The later questions will be left out.`
      : planned < min
        ? `${planned} question${planned === 1 ? " is" : "s are"} planned; a ${minutes}-minute interview usually asks ${min} to ${max}, so it may end early.`
        : "";
  return { min, max, planned, warning };
}

/** anvi.hybrid with defaults; section ids are limited to sections that still exist. */
export function readHybrid(data) {
  const hybrid = data?.anvi?.hybrid || {};
  const ids = new Set((data?.sections || []).map((section) => section.id));
  return {
    allowLiveWarmup: hybrid.allowLiveWarmup === true,
    conversationalSectionIds: (Array.isArray(hybrid.conversationalSectionIds) ? hybrid.conversationalSectionIds : []).filter((id) => ids.has(id)),
    allowStudentLiveMode: hybrid.allowStudentLiveMode === true,
  };
}
export const writeHybrid = (data, patch) => ({
  ...data,
  anvi: { ...(data?.anvi || {}), hybrid: { ...readHybrid(data), ...patch } },
});
export function toggleConversational(data, sectionId) {
  const { conversationalSectionIds: ids } = readHybrid(data);
  return writeHybrid(data, {
    conversationalSectionIds: ids.includes(sectionId) ? ids.filter((id) => id !== sectionId) : [...ids, sectionId],
  });
}

const STATUS_TEXT = {
  pending: "Queued",
  running: "Generating",
  done: "Ready",
  partial: "Some clips failed",
  inactive: "Not in use (unpublished)",
};
/**
 * The admin view of GET /ai-interviews/:id/audio/status: { tone, label, detail }.
 * tone: "ready" | "queued" | "failed" | "off" | "none".
 */
export function audioReadiness(status) {
  if (!status) return { tone: "none", label: "Not generated yet", detail: "Question audio is generated after you publish." };
  if (!status.enabled)
    return { tone: "off", label: "Cost-saving mode is off", detail: "Interviews run in Live mode, so no question audio is needed." };
  const assets = status.assets || {};
  const ready = Number(assets.ready ?? status.counts?.ready) || 0;
  const failed = Number(assets.failed ?? status.counts?.failed) || 0;
  const generating = Number(assets.generating) || 0;
  const total = Math.max(Number(status.counts?.total) || 0, ready + failed + generating);
  const counts = total ? `${ready} of ${total} clips ready${failed ? ` · ${failed} failed` : ""}` : "";
  const tone =
    status.status === "partial" || (failed && status.status === "done")
      ? "failed"
      : status.status === "done"
        ? "ready"
        : status.status === "inactive" || !status.status
          ? "none"
          : "queued";
  const label = status.status ? STATUS_TEXT[status.status] || "Queued" : "Not generated yet";
  return { tone, label, detail: counts || (tone === "queued" ? "Clips are being prepared in the background." : "") };
}
