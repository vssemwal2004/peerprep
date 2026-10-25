// Proctoring of ANVI interviews (anvi.proctoring): settings as an attempt runs them, the per-attempt event log
// kept on the live session, and the summary copied onto the finished attempt. Only flags: scores never change.
// Camera checks (`ai`) run in the browser with the assessment ProctoringManager; the server only receives the
// event type, severity and confidence, and reuses the assessment AI summary rules.
import {
  AI_PROCTORING_FLAGS, AI_PROCTORING_RANGES, ANVI_DEFAULTS, PROCTOR_FULLSCREEN, PROCTOR_MAX_VIOLATIONS, PROCTOR_MAX_WARNINGS,
  PROCTOR_ON_LIMIT, PROCTOR_REFRESH, PROCTOR_TAB_SWITCH,
} from "../../services/aiInterviewDefinition.js";
import {
  AI_PROCTORING_VIOLATION_TYPES, applyAiProctoringViolationToSummary, createAiProctoringSummary,
} from "../assessment/proctoring/proctoring.rules.js";

// `ai_camera_restored` ends a camera pause (logged, never a violation).
const AI_TYPES = new Set(AI_PROCTORING_VIOLATION_TYPES);
// Browser events a client may report; `rejoin` is recorded by the server itself.
export const PROCTOR_EVENT_TYPES = Object.freeze([
  "fullscreen_enter", "fullscreen_exit", "tab_hidden", "tab_visible", "window_blur", "window_focus", "right_click", "copy_paste", "shortcut",
  ...AI_PROCTORING_VIOLATION_TYPES, "ai_camera_restored",
]);
const CLIENT_TYPES = new Set(PROCTOR_EVENT_TYPES);
// Violations count toward the warnings and the limit; blocked actions are only logged and shown in the report.
const VIOLATIONS = new Set(["fullscreen_exit", "tab_hidden", "window_blur", "rejoin", ...AI_TYPES]);
const BLOCKED = Object.freeze({ right_click: "blockRightClick", copy_paste: "blockCopyPaste", shortcut: "blockShortcuts" });
const COUNTED = Object.freeze([...VIOLATIONS, ...Object.keys(BLOCKED)]);
const TAB_TYPES = new Set(["tab_hidden", "tab_visible", "window_blur", "window_focus"]);
const FULLSCREEN_TYPES = new Set(["fullscreen_enter", "fullscreen_exit"]);
// The camera check each AI event belongs to (ai_camera_blocked and ai_camera_restored: any camera check).
const AI_CHECK = Object.freeze({
  ai_no_face: "detectNoFace", ai_face_out_of_frame: "detectFaceOutOfFrame", ai_multiple_faces: "detectMultiplePersons",
  ai_multiple_persons: "detectMultiplePersons", ai_mobile_detected: "detectMobile", ai_looking_away: "detectLookingAway",
});
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
export const PROCTOR_EVENT_CAP = 200;
// Of those, at most this many are blocked actions and returns (right_click, fullscreen_enter, ...); once the
// log is full, a violation replaces the oldest of them, so violations are never pushed out of the report.
export const PROCTOR_OTHER_EVENT_CAP = 50;
// Switching tabs usually fires both blur and visibilitychange: two such events this close are one violation.
export const TAB_DEDUPE_MS = 1000;
// Client events accepted per attempt per minute, per bucket (screen, camera, blocked actions, returns), so a
// burst of blocked shortcuts or camera events never crowds out a fullscreen exit (and its pause), and the
// returns that end a pause have a bucket of their own.
export const PROCTOR_EVENTS_PER_MINUTE = 30;
const RETURN_TYPES = new Set(["fullscreen_enter", "tab_visible", "window_focus", "ai_camera_restored"]);
export const proctorBucketOf = (type) => (
  type in BLOCKED ? "blocked" : RETURN_TYPES.has(type) ? "return" : type.startsWith("ai_") ? "camera" : "screen"
);
// A page that rejoins this soon after its own hold ended (a reconnect, not a refresh) is not a rejoin.
export const QUICK_REJOIN_MS = 5000;

const settingsOf = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const pick = (value, choices, fallback) => (choices.includes(value) ? value : fallback);
const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const whole = (value, max, fallback) => {
  const number = Number(value);
  if (value === undefined || value === null || !Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(0, number));
};

function normalizeAi(input) {
  const ai = settingsOf(input);
  const d = ANVI_DEFAULTS.proctoring.ai;
  const out = {};
  for (const key of AI_PROCTORING_FLAGS) out[key] = flag(ai[key], d[key]);
  for (const [key, [min, max]] of Object.entries(AI_PROCTORING_RANGES)) {
    const number = Number(ai[key]);
    out[key] = ai[key] === undefined || ai[key] === null || !Number.isFinite(number) ? d[key] : Math.min(max, Math.max(min, number));
  }
  return out;
}

/** The proctoring settings an attempt runs with, with defaults for anything missing (older snapshots: off). */
export function normalizeProctoring(input) {
  const settings = settingsOf(input);
  const d = ANVI_DEFAULTS.proctoring;
  const enabled = settings.enabled === true;
  const ai = normalizeAi(settings.ai);
  return {
    enabled,
    fullscreen: pick(settings.fullscreen, PROCTOR_FULLSCREEN, d.fullscreen),
    pauseOutsideFullscreen: flag(settings.pauseOutsideFullscreen, d.pauseOutsideFullscreen),
    tabSwitch: pick(settings.tabSwitch, PROCTOR_TAB_SWITCH, d.tabSwitch),
    refresh: pick(settings.refresh, PROCTOR_REFRESH, d.refresh),
    blockRightClick: flag(settings.blockRightClick, d.blockRightClick),
    blockCopyPaste: flag(settings.blockCopyPaste, d.blockCopyPaste),
    blockShortcuts: flag(settings.blockShortcuts, d.blockShortcuts),
    warnings: whole(settings.warnings, PROCTOR_MAX_WARNINGS, d.warnings),
    maxViolations: whole(settings.maxViolations, PROCTOR_MAX_VIOLATIONS, d.maxViolations),
    onLimit: pick(settings.onLimit, PROCTOR_ON_LIMIT, d.onLimit),
    // Camera checks only run under the proctoring master switch.
    ai: { ...ai, enabled: enabled && ai.enabled },
  };
}

/** What the student sees before starting (the full settings; off for interviews without proctoring). */
export const proctoringSetupOf = (snapshotData) => normalizeProctoring(snapshotData?.anvi?.proctoring);

/** Whether the interview holds (pauses) while the student is out of fullscreen or the tab is hidden. */
export const pausesOutsideFullscreen = (settings) => Boolean(settings?.enabled && settings.fullscreen === "required" && settings.pauseOutsideFullscreen);
/**
 * Whether a blocked camera holds the interview (instead of counting as a violation): camera checks under the
 * same pause rule, which applies only with fullscreen required (as the room shows it).
 */
export const pausesForCamera = (settings) => pausesOutsideFullscreen(settings) && Boolean(settings.ai?.enabled);

const emptyCounts = () => Object.fromEntries(COUNTED.map((type) => [type, 0]));
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

/**
 * The event log of a running attempt (live.proctoring), cleaned up. `joins`: successful joins so far;
 * `lastTabAt`: when the last tab-switch violation was counted (for the blur/hidden pairing); `warningsGiven`:
 * warnings shown so far; `limitReached`: the violation limit was reached (ended, or only flagged); `ai`: the
 * assessment-style AI summary (per-type counts, risk level).
 */
export function proctorStateOf(saved) {
  const state = settingsOf(saved);
  const counts = emptyCounts();
  for (const type of COUNTED) counts[type] = count(state.counts?.[type]);
  return {
    events: Array.isArray(state.events) ? state.events.slice(0, PROCTOR_EVENT_CAP) : [],
    counts,
    violations: count(state.violations),
    warningsGiven: count(state.warningsGiven),
    limitReached: state.limitReached === true,
    endedForViolations: state.endedForViolations === true,
    joins: count(state.joins),
    lastTabAt: Number(state.lastTabAt) || 0,
    ai: createAiProctoringSummary(settingsOf(state.ai)),
    pauses: Array.isArray(state.pauses) ? state.pauses.slice(0, PROCTOR_PAUSE_CAP) : [],
  };
}

// Proctoring pauses ([{ from, to, reason }]; `to` null while the pause lasts), capped like the event log.
// `joinHold`: the hold a new holder starts with under the pause rule (kept in the live doc, never in the report).
// A join hold that ends (or whose attempt ends) within QUICK_REJOIN_MS was never a pause: the room was in
// fullscreen and simply had not reported back yet.
export const PROCTOR_PAUSE_CAP = 100;
/** Opens a pause; returns it (null once the cap is reached). */
export function openPause(state, { at, reason, joinHold = false }) {
  if (state.pauses.length >= PROCTOR_PAUSE_CAP) return null;
  const pause = { from: at, to: null, reason, ...(joinHold ? { joinHold: true } : {}) };
  state.pauses.push(pause);
  return pause;
}
const quickJoinHold = (pause, at) => Boolean(pause?.joinHold) && !pause.to && Boolean(at)
  && new Date(at).getTime() - new Date(pause.from).getTime() < QUICK_REJOIN_MS;
/** Closes the open pause at `at`; a join hold this short is dropped instead, a longer one becomes a pause. */
export function closePause(state, at) {
  const open = state.pauses.at(-1);
  if (!open || open.to) return;
  if (quickJoinHold(open, at)) { state.pauses.pop(); return; }
  open.to = at;
  delete open.joinHold;
}

// Whether the interview's settings watch this event type at all.
function watched(settings, type) {
  if (!settings?.enabled) return false;
  if (FULLSCREEN_TYPES.has(type)) return settings.fullscreen === "required";
  if (TAB_TYPES.has(type)) return settings.tabSwitch !== "off";
  if (type === "rejoin") return settings.refresh === "record";
  if (type in BLOCKED) return settings[BLOCKED[type]] === true;
  if (type.startsWith("ai_")) return Boolean(settings.ai?.enabled) && (!(type in AI_CHECK) || settings.ai[AI_CHECK[type]] === true);
  return false;
}

export const isClientProctorEvent = (type) => CLIENT_TYPES.has(type);

/** `{ severity, confidence }` of a camera event: an enum and a number in 0..1; anything else is dropped. */
export function aiEventDetails(payload) {
  const severity = String(payload?.severity ?? "").toLowerCase();
  const confidence = typeof payload?.confidence === "number" || typeof payload?.confidence === "string" ? Number(payload.confidence) : NaN;
  return {
    ...(SEVERITIES.has(severity) ? { severity } : {}),
    ...(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? { confidence: Math.round(confidence * 1000) / 1000 } : {}),
  };
}

const CAMERA_WARNING = "Keep your face clearly in view of the camera, alone, and without a phone; this is recorded.";
const WARNINGS = {
  fullscreen_exit: "You left fullscreen. Return to fullscreen to continue; leaving it is recorded.",
  tab_hidden: "Switching tabs or windows during this interview is recorded.",
  window_blur: "Switching tabs or windows during this interview is recorded.",
  rejoin: "Leaving and rejoining this interview is recorded.",
  ai_camera_blocked: "Your camera is blocked or off. Keep it on and uncovered; this is recorded.",
};
export const LIMIT_ENDED_MESSAGE = "The interview has ended because the proctoring limit was reached.";

// Adds an event to the capped log; violations keep priority over blocked actions and returns.
function logEvent(state, event) {
  const isOther = (entry) => !VIOLATIONS.has(entry.type);
  if (isOther(event)) {
    if (state.events.length < PROCTOR_EVENT_CAP && state.events.filter(isOther).length < PROCTOR_OTHER_EVENT_CAP) state.events.push(event);
    return;
  }
  if (state.events.length >= PROCTOR_EVENT_CAP) {
    const oldest = state.events.findIndex(isOther);
    if (oldest < 0) return;
    state.events.splice(oldest, 1);
  }
  state.events.push(event);
}

/**
 * Records one event into `state` (mutated). `details`: a camera event's sanitized { severity, confidence }.
 * Returns { recorded, counted, warning, warningNumber, limitReached, end }: `warning` is the message for the
 * student, `end` is true once (the interview ends for violations).
 * The first `warnings` violations each warn the student ("Warning N of W"), except a tab switch under "record",
 * which stays silent; violations keep counting after that. At maxViolations, onLimit "end" ends the interview
 * and "flag" only marks the attempt. A blocked camera that pauses the interview is logged, not counted.
 */
export function recordProctorEvent(settings, state, { type, at, questionN = 0, details = {} }) {
  const none = { recorded: false, counted: false, warning: null, warningNumber: 0, limitReached: false, end: false };
  if (!watched(settings, type) || state.endedForViolations) return none;
  const time = at instanceof Date ? at : new Date(at);
  const camera = type.startsWith("ai_") ? aiEventDetails(details) : {};
  logEvent(state, { type, at: time, questionN: Math.max(0, Number(questionN) || 0), ...camera });
  if (!COUNTED.includes(type)) return { ...none, recorded: true };
  state.counts[type] += 1;
  if (AI_TYPES.has(type)) state.ai = applyAiProctoringViolationToSummary(state.ai, type, time);
  if (!VIOLATIONS.has(type) || (type === "ai_camera_blocked" && pausesForCamera(settings))) return { ...none, recorded: true };
  if (type === "tab_hidden" || type === "window_blur") {
    if (state.lastTabAt && time.getTime() - state.lastTabAt < TAB_DEDUPE_MS) return { ...none, recorded: true };
    state.lastTabAt = time.getTime();
  }
  state.violations += 1;
  const max = settings.maxViolations || 0;
  const reached = max > 0 && state.violations >= max && !state.limitReached;
  if (reached) state.limitReached = true;
  const end = reached && settings.onLimit === "end";
  if (end) state.endedForViolations = true;
  const silent = TAB_TYPES.has(type) && settings.tabSwitch === "record";
  let warning = null;
  let warningNumber = 0;
  if (end) {
    warning = LIMIT_ENDED_MESSAGE;
  } else if (!silent && state.warningsGiven < (settings.warnings || 0)) {
    state.warningsGiven += 1;
    warningNumber = state.warningsGiven;
    const limit = max > 0 && settings.onLimit === "end" ? ` Violations: ${state.violations} of ${max}; the interview ends at ${max}.` : "";
    warning = `Warning ${warningNumber} of ${settings.warnings}: ${WARNINGS[type] || CAMERA_WARNING}${limit}`;
  }
  return { recorded: true, counted: true, warning, warningNumber, limitReached: reached, end };
}

/** What the live doc keeps (`live.proctoring`). */
export const storedProctorState = (state) => ({
  events: state.events, counts: state.counts, violations: state.violations, warningsGiven: state.warningsGiven,
  limitReached: state.limitReached, endedForViolations: state.endedForViolations, joins: state.joins, lastTabAt: state.lastTabAt,
  ai: state.ai, pauses: state.pauses,
});

/**
 * The attempt's `proctoring` field ({ settings, events, counts, violations, endedForViolations, limitReached,
 * warningsGiven, pauses, ai, aiEvents }) from the settings stored with the plan and the event log; null when the
 * attempt was not proctored. `ai` is the assessment AI summary and `aiEvents` the camera events, as the assessment
 * AI report panel reads them. A pause still open at `endedAt` ends there, except a join hold under
 * QUICK_REJOIN_MS old (an end right after a join, by socket or REST), which is left out.
 */
export function proctoringSummary(rawSettings, rawState, endedAt = null) {
  const settings = normalizeProctoring(rawSettings);
  if (!settings.enabled) return null;
  const state = proctorStateOf(rawState);
  const pauses = state.pauses
    .filter((pause) => !quickJoinHold(pause, endedAt))
    .map((pause) => ({ from: pause.from, to: pause.to || endedAt || null, reason: pause.reason }));
  return {
    settings, events: state.events, counts: state.counts, violations: state.violations, endedForViolations: state.endedForViolations,
    limitReached: state.limitReached, warningsGiven: state.warningsGiven, pauses,
    ...(settings.ai.enabled ? { ai: state.ai, aiEvents: state.events.filter((event) => AI_TYPES.has(event.type)) } : {}),
  };
}

/** Same as proctoringSummary, from a live session document. */
export const proctoringSummaryOfLive = (live, endedAt = null) => proctoringSummary(live?.rules?.proctoring, live?.proctoring, endedAt);

/**
 * The student's view of a running attempt's proctoring (live doc): the rules the room and the rejoin lobby apply
 * (`settings`, normalized from rules.proctoring) and the counts so far; never the event log.
 */
export function liveProctoringView(live) {
  const settings = normalizeProctoring(live?.rules?.proctoring);
  const state = proctorStateOf(settings.enabled ? live?.proctoring : null);
  return { enabled: settings.enabled, settings, counts: state.counts, violations: state.violations, endedForViolations: state.endedForViolations };
}

/** The student's view of a finished attempt's proctoring: counts only, never the event log. */
export function studentProctoringView(stored) {
  const enabled = Boolean(stored?.settings?.enabled);
  const state = proctorStateOf(enabled ? stored : null);
  return { enabled, counts: state.counts, violations: state.violations, endedForViolations: state.endedForViolations };
}
