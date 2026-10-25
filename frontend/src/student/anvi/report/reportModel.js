// Pure helpers behind the ANVI report. `buildReportModel` turns the server's attempt (the student view of
// GET /student/ai-interviews/attempts/:id or the admin view of GET /ai-interviews/reports/attempts/:id) into
// the one content model that the screen, the PDF and the print fallback all render. Every number comes
// from the server as is (marks, percentages, bands, verdicts, fluency metrics); the model only counts and
// averages what is there, and leaves a block out (null / empty list) when its data is missing.
import { AI_PROCTORING_EVENTS } from "../../../features/assessment/proctoring/constants/proctoringEvents.js";

const IST_ZONE = "Asia/Kolkata";
// Logged by the room when a lost camera works again (the server keeps it, never as a violation).
export const AI_CAMERA_RESTORED = "ai_camera_restored";

export const marks = (value) => (Number.isInteger(Number(value)) ? String(Number(value)) : Number(value || 0).toFixed(1));

/** A finite number, or null for missing / blank / non-numeric values (so a missing mark never reads 0). */
export const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value)));

const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "22 Oct 2026, 3:30 pm IST", or "" when there is no time. */
export function istDateTime(value) {
  const date = validDate(value);
  return date ? `${date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: IST_ZONE })} IST` : "";
}

/** "3:30:12 pm": event times in the integrity timeline need seconds. */
export function istClock(value) {
  const date = validDate(value);
  return date ? date.toLocaleTimeString("en-IN", { timeStyle: "medium", timeZone: IST_ZONE }) : "";
}

/** "2026-10-22" in IST, used in the PDF file name. */
export function istDay(value) {
  const date = validDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: IST_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "24 min", "1 h 5 min", "Under a minute"; "" when either end is missing. */
export function durationLabel(start, end) {
  const from = validDate(start);
  const to = validDate(end);
  if (!from || !to || to < from) return "";
  const minutes = Math.round((to - from) / 60_000);
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

export const VERDICTS = Object.freeze({
  matched: { symbol: "✓", label: "Covered", icon: "check" },
  partial: { symbol: "~", label: "Partly covered", icon: "minus" },
  missed: { symbol: "✗", label: "Missed", icon: "x" },
});

export function verdictOf(item, point) {
  if ((item.matched || []).includes(point)) return "matched";
  if ((item.partial || []).includes(point)) return "partial";
  return "missed";
}

export const isAnswered = (item) => item?.status === "answered" && Boolean(item.answerText?.trim());

// Bands as the server's bandFor names them (85 / 70 / 50), with the tone each one is drawn in.
export const BAND_TONES = Object.freeze({ Excellent: "positive", Good: "brand", Fair: "caution", "Needs work": "critical" });
export const bandTone = (band) => BAND_TONES[band] || "neutral";

// Per-answer flags the conductor and the evaluator record (admin data; the student view carries none).
// Flags never change a score; they point a reviewer at an answer.
export const ITEM_FLAGS = Object.freeze({
  other_language: { label: "Answered in another language", tone: "caution" },
  off_topic_request: { label: "Off-topic request", tone: "caution" },
  wellbeing_concern: { label: "Wellbeing concern raised", tone: "caution" },
  prompt_injection: { label: "Tried to redirect the interviewer", tone: "critical" },
  evaluation_manipulation: { label: "Tried to influence the scoring", tone: "critical" },
  evaluation_answer_clipped: { label: "Long answer shortened for scoring", tone: "neutral" },
  audio_truncated: { label: "Audio cut off", tone: "neutral" },
  silent: { label: "No answer heard", tone: "neutral" },
});
const flagEntry = (flag) => {
  const key = String(flag || "").trim();
  if (!key) return null;
  const known = ITEM_FLAGS[key];
  const text = key.replaceAll("_", " ");
  return { key, label: known?.label || `${text.charAt(0).toUpperCase()}${text.slice(1)}`, tone: known?.tone || "neutral" };
};
/** [{ key, label, tone }] for a list of flag codes, without duplicates. */
export const flagList = (flags) => [...new Set(Array.isArray(flags) ? flags : [])].map(flagEntry).filter(Boolean);
/** Readable flags of one answer. */
export const itemFlags = (item) => flagList(item?.flags).map((flag) => flag.label);

export const END_REASONS = Object.freeze({
  completed: "Completed",
  closed_early: "ANVI closed the interview early",
  ended_by_student: "Ended by the student",
  deadline: "Time limit reached",
  stale: "Connection lost",
  superseded_by_assigned: "Replaced by a scheduled attempt",
  proctoring_limit: "Ended after too many proctoring violations",
});
export const endReasonLabel = (reason) => (reason ? END_REASONS[reason] || String(reason).replaceAll("_", " ") : "");

export const RESUME_SOURCE_LABELS = Object.freeze({ builder: "Resume Builder (saved resume)", upload: "Uploaded file" });

/**
 * Terms, resume and (for older non-English attempts) language: admin rows (termsAcceptedAt) and student
 * rows (terms.acceptedAt) alike. A row with nothing recorded is left out.
 */
export function setupRows(attempt = {}) {
  const acceptedAt = attempt.termsAcceptedAt || attempt.terms?.acceptedAt || null;
  const language = String(attempt.language || "").trim();
  return [
    acceptedAt && { key: "terms", label: "Terms accepted", value: istDateTime(acceptedAt) },
    { key: "resume", label: "Resume", value: RESUME_SOURCE_LABELS[attempt.resumeSource] || "Not used" },
    language && !/^english$/i.test(language) && { key: "language", label: "Language", value: language },
  ].filter(Boolean);
}

const mean = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : null);

// A clear speaking pace for interview answers.
export const PACE = Object.freeze({ min: 110, max: 160 });
export function paceLabel(wpm) {
  if (!wpm) return "";
  if (wpm < PACE.min) return "A little slow";
  if (wpm > PACE.max) return "Quite fast";
  return "Comfortable pace";
}
/** The pace chip of one answer: { key, label, tone }, or null without a measured pace. */
export function paceBand(wpm) {
  const value = Number(wpm) || 0;
  if (value <= 0) return null;
  if (value < PACE.min) return { key: "slow", label: "Too slow", tone: "caution" };
  if (value > PACE.max) return { key: "fast", label: "Too fast", tone: "caution" };
  return { key: "good", label: "Good pace", tone: "positive" };
}

/** The server's band thresholds (evaluation bandFor: 85 / 70 / 50), for per-question and per-metric chips. */
export const bandFor = (percent) => (percent >= 85 ? "Excellent" : percent >= 70 ? "Good" : percent >= 50 ? "Fair" : "Needs work");

/**
 * The five success metrics the evaluator stores (0-100 each). Every one is judged from the transcript;
 * fluency also uses the measured pace and filler words. Nothing here comes from audio or video.
 */
export const DIMENSIONS = Object.freeze([
  { key: "knowledge", label: "Knowledge", icon: "bookOpen", definition: "Accurate information, clear thinking and answers that stay relevant to the question.", basis: "Judged from the transcript" },
  { key: "articulation", label: "Articulation", icon: "messagesSquare", definition: "Vocabulary, sentence structure, grammar and getting to the point.", basis: "Judged from the transcript" },
  { key: "fluency", label: "Fluency", icon: "audioWaveform", definition: "A steady pace with few filler words, and ideas that connect.", basis: "Measured pace and fillers, with coherence judged from the transcript" },
  { key: "confidence", label: "Confidence", icon: "badgeCheck", definition: "Direct, assertive statements rather than hedging.", basis: "Judged from the wording of the transcript" },
  { key: "professionalism", label: "Professionalism", icon: "handshake", definition: "A formal tone and respectful language throughout.", basis: "Judged from the transcript" },
]);

const percentOrNull = (value) => {
  const number = numberOrNull(value);
  return number === null ? null : clampPercent(number);
};
const textList = (value, max = 6) => [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))].slice(0, max);

/** { knowledge: 72, … } with only the stored, numeric dimensions; null when none is stored. */
export function dimensionsOf(value) {
  if (!value || typeof value !== "object") return null;
  const entries = DIMENSIONS.map(({ key }) => [key, percentOrNull(value[key])]).filter(([, percent]) => percent !== null);
  return entries.length ? Object.fromEntries(entries) : null;
}

/** The cohort comparison: other students of the same interview (each counted once, by their latest attempt), only with at least 5. */
export function cohortOf(source = {}) {
  const raw = source?.cohort;
  if (!raw || typeof raw !== "object" || !(Number(raw.count) >= 5)) return null;
  return {
    count: Math.round(Number(raw.count)),
    percent: percentOrNull(raw.percent),
    functional: percentOrNull(raw.functional),
    nonFunctional: percentOrNull(raw.nonFunctional),
    dimensions: dimensionsOf(raw.dimensions),
  };
}

/** Stars as stored (0-5 in half steps), else from the score: round(score / 20 * 2) / 2. */
export function starsOf(stars, percent) {
  const stored = numberOrNull(stars);
  if (stored !== null && stored >= 0 && stored <= 5) return Math.round(stored * 2) / 2;
  return percent === null ? 0 : Math.round((percent / 20) * 2) / 2;
}

/** Skills with a score, as { key, name, percent, stars, note }. */
export function skillsOf(source = {}) {
  const raw = Array.isArray(source.skills) ? source.skills : Array.isArray(source.overall?.skills) ? source.overall.skills : [];
  return raw.filter((row) => row && String(row.name || "").trim() && percentOrNull(row.score ?? row.percent) !== null).map((row, index) => {
    const percent = percentOrNull(row.score ?? row.percent);
    return { key: `${String(row.name).trim()}-${index}`, name: String(row.name).trim(), percent, stars: starsOf(row.stars, percent), note: String(row.note || "").trim() };
  });
}

/** "4 min 5 s" for a positive number of seconds, else "". */
const timeLabel = (seconds) => (seconds > 0 ? secondsLabel(seconds) : "");

/**
 * Counts and averages over the saved answers. Key points are counted per verdict (never re-scored);
 * fluency uses the server's per-answer metrics of answered items only. null when there is nothing to count.
 */
export function reportKpis(attempt = {}) {
  const items = Array.isArray(attempt.items) ? attempt.items : [];
  const overall = attempt.overall || {};
  const answered = items.filter(isAnswered);
  const verdicts = { matched: 0, partial: 0, missed: 0 };
  for (const item of items) for (const point of item.expectedKeyPoints || []) verdicts[verdictOf(item, point)] += 1;
  const points = verdicts.matched + verdicts.partial + verdicts.missed;
  const withMetrics = answered.filter((item) => item.metrics && typeof item.metrics === "object");
  const words = withMetrics.map((item) => Number(item.metrics.words) || 0).filter((value) => value > 0);
  const paces = withMetrics.map((item) => Number(item.metrics.wpm) || 0).filter((value) => value > 0);
  const average = (values) => (values.length ? Math.round(mean(values)) : null);
  return {
    percent: numberOrNull(overall.percent) === null ? null : clampPercent(overall.percent),
    score: numberOrNull(overall.score),
    max: numberOrNull(overall.max),
    band: overall.band || "",
    answered: numberOrNull(overall.answered) ?? answered.length,
    skipped: items.filter((item) => item.status === "skipped").length,
    keyPoints: points ? { ...verdicts, total: points } : null,
    averageWords: average(words),
    totalWords: words.length ? words.reduce((a, b) => a + b, 0) : null,
    averageWpm: average(paces),
    fillers: withMetrics.length ? withMetrics.reduce((sum, item) => sum + (Number(item.metrics.fillerCount) || 0), 0) : null,
    measured: withMetrics.length,
  };
}

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/** One plain sentence under the score: what was evaluated and where it was strongest and weakest. */
export function summaryLine(attempt = {}) {
  const kpis = reportKpis(attempt);
  const parts = [`${plural(kpis.answered, "response")} evaluated${kpis.skipped ? `, ${kpis.skipped} skipped` : ""}.`];
  const ranked = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => row?.name && numberOrNull(row.percent) !== null);
  const rows = ranked(attempt.bySection).length > 1 ? ranked(attempt.bySection) : ranked(attempt.byCompetency);
  if (rows.length > 1) {
    const sorted = [...rows].sort((a, b) => b.percent - a.percent);
    const best = sorted[0];
    const worst = sorted.at(-1);
    if (best.percent !== worst.percent) parts.push(`Strongest in ${best.name} (${best.percent}%), most room to grow in ${worst.name} (${worst.percent}%).`);
  }
  return parts.join(" ");
}

// ---- Proctoring -------------------------------------------------------------

export const PROCTOR_EVENTS = Object.freeze({
  fullscreen_exit: { label: "Left fullscreen", violation: true },
  fullscreen_enter: { label: "Entered fullscreen", violation: false },
  tab_hidden: { label: "Switched away from the tab", violation: true },
  tab_visible: { label: "Came back to the tab", violation: false },
  window_blur: { label: "Interview window lost focus", violation: true },
  window_focus: { label: "Interview window focused again", violation: false },
  rejoin: { label: "Reloaded or rejoined the interview", violation: true },
  // Blocked actions: logged and reported, never counted as violations.
  right_click: { label: "Right-click blocked", blocked: true },
  copy_paste: { label: "Copy or paste blocked", blocked: true },
  shortcut: { label: "Keyboard shortcut blocked", blocked: true },
  paused: { label: "Interview paused", pause: true },
  resumed: { label: "Interview resumed", pause: true },
  // Camera AI checks (the Assessment module's event types); confirmed detections are violations.
  [AI_PROCTORING_EVENTS.NO_FACE]: { label: "No face detected", violation: true, ai: true },
  [AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME]: { label: "Face out of frame", violation: true, ai: true },
  [AI_PROCTORING_EVENTS.MULTIPLE_FACES]: { label: "Multiple faces", violation: true, ai: true },
  [AI_PROCTORING_EVENTS.MULTIPLE_PERSONS]: { label: "Multiple persons", violation: true, ai: true },
  [AI_PROCTORING_EVENTS.MOBILE_DETECTED]: { label: "Mobile phone detected", violation: true, ai: true },
  [AI_PROCTORING_EVENTS.LOOKING_AWAY]: { label: "Looking away", violation: true, ai: true },
  [AI_PROCTORING_EVENTS.CAMERA_BLOCKED]: { label: "Camera blocked", violation: true, ai: true },
  // Logged when the camera works again after a loss: information, not a detection or a violation.
  [AI_CAMERA_RESTORED]: { label: "Camera restored", violation: false },
  // Pause reason (not an event type) of a camera pause.
  camera_blocked: { label: "Camera blocked", pause: true },
});
export const AI_COUNTS = Object.freeze([
  { key: AI_PROCTORING_EVENTS.MOBILE_DETECTED, label: "Mobile phone" },
  { key: AI_PROCTORING_EVENTS.MULTIPLE_PERSONS, label: "Multiple persons" },
  { key: AI_PROCTORING_EVENTS.MULTIPLE_FACES, label: "Multiple faces" },
  { key: AI_PROCTORING_EVENTS.NO_FACE, label: "No face" },
  { key: AI_PROCTORING_EVENTS.FACE_OUT_OF_FRAME, label: "Out of frame" },
  { key: AI_PROCTORING_EVENTS.LOOKING_AWAY, label: "Looking away" },
  { key: AI_PROCTORING_EVENTS.CAMERA_BLOCKED, label: "Camera blocked" },
]);
/** A camera AI detection (ai_* except the informational ai_camera_restored). */
export const isAiDetection = (type) => String(type || "").startsWith("ai_") && type !== AI_CAMERA_RESTORED;
/** "Confidence 87%" from 0–1 (or 0–100) values; "" when unknown. */
export function confidenceLabel(value) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n) || n < 0) return "";
  return `${Math.round(n <= 1 ? n * 100 : Math.min(100, n))}%`;
}
export const PROCTOR_COUNTS = Object.freeze([
  { key: "fullscreen_exit", label: "Fullscreen exits" },
  { key: "tab_hidden", label: "Tab switches" },
  { key: "window_blur", label: "Focus lost" },
  { key: "rejoin", label: "Reloads / rejoins" },
]);
export const BLOCKED_COUNTS = Object.freeze([
  { key: "right_click", label: "Right-clicks" },
  { key: "copy_paste", label: "Copy / paste" },
  { key: "shortcut", label: "Shortcuts" },
]);
export const ON_LIMIT_LABELS = Object.freeze({ end: "End the interview", flag: "Only flag in report" });
export const proctorEventLabel = (type) => PROCTOR_EVENTS[type]?.label || String(type || "Event").replaceAll("_", " ");
export const questionLabel = (n) => (Number(n) >= 1 ? `Q${Number(n)}` : n === 0 ? "Before Q1" : "—");

const count = (value) => Math.max(0, Number(value) || 0);
const PAUSE_SIGNALS = new Set(["fullscreen_exit", "fullscreen_enter", "tab_hidden", "tab_visible"]);

/** "2 min 5 s", "40 s". */
export function secondsLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  return `${minutes} min${total % 60 ? ` ${total % 60} s` : ""}`;
}

/**
 * Pause intervals: `proctoring.pauses` ({ from|at|start, to|end, reason }) when the server stores them,
 * otherwise rebuilt from the event log. Explicit paused/resumed events are used when present; without
 * them (and only when the attempt paused outside fullscreen) a pause runs from fullscreen_exit or
 * tab_hidden to the next fullscreen_enter. An interval still open at the end has `to: null`.
 */
function pausesOf(raw, events, settings) {
  if (Array.isArray(raw.pauses)) {
    return raw.pauses.filter(Boolean).map((pause) => {
      const from = pause.from || pause.at || pause.start || null;
      const to = pause.to || pause.end || null;
      return { from, to, reason: pause.reason || "", questionN: pause.questionN ?? null, seconds: from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000) : null };
    });
  }
  if (!events) return null;
  const explicit = events.some((event) => event.type === "paused" || event.type === "resumed");
  const pausing = explicit || (settings?.fullscreen === "required" && settings?.pauseOutsideFullscreen === true);
  if (!pausing) return [];
  const pauses = [];
  let open = null;
  // Rebuilt from the raw signals: paused while out of fullscreen or while the tab is hidden.
  const state = { outside: false, hidden: false };
  for (const event of events) {
    let paused;
    if (explicit) {
      if (event.type !== "paused" && event.type !== "resumed") continue;
      paused = event.type === "paused";
    } else {
      if (!PAUSE_SIGNALS.has(event.type)) continue;
      if (event.type === "fullscreen_exit") state.outside = true;
      if (event.type === "fullscreen_enter") state.outside = false;
      if (event.type === "tab_hidden") state.hidden = true;
      if (event.type === "tab_visible") state.hidden = false;
      paused = state.outside || state.hidden;
    }
    if (paused && !open) open = { from: event.at, to: null, reason: event.type, questionN: event.questionN };
    else if (!paused && open) {
      open.to = event.at;
      pauses.push(open);
      open = null;
    }
  }
  if (open) pauses.push(open);
  return pauses.map((pause) => ({ ...pause, seconds: pause.from && pause.to ? Math.max(0, (Date.parse(pause.to) - Date.parse(pause.from)) / 1000) : null }));
}

/**
 * The attempt's proctoring record in one shape, or null when proctoring was off. The admin report
 * carries settings and events; the student report only counts and violations.
 */
export function proctoringOf(attempt = {}) {
  const raw = attempt?.proctoring;
  const endedByLimit = attempt?.endReason === "proctoring_limit";
  if (!raw || typeof raw !== "object") {
    return endedByLimit ? { settings: null, events: null, counts: {}, blocked: {}, blockedTotal: 0, pauses: null, violations: null, maxViolations: 0, onLimit: "end", endedForViolations: true } : null;
  }
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : null;
  if (settings?.enabled === false || raw.enabled === false) return null;
  const counts = Object.fromEntries(PROCTOR_COUNTS.map(({ key }) => [key, count(raw.counts?.[key])]));
  const events = Array.isArray(raw.events)
    ? raw.events.filter((event) => event && event.type).map((event) => ({
      type: String(event.type), at: event.at || null, questionN: event.questionN ?? null,
      ...(event.severity ? { severity: String(event.severity) } : {}),
      ...(event.confidence !== undefined && event.confidence !== null ? { confidence: event.confidence } : {}),
    })).sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))
    : null;
  // Camera AI checks: counts from the server when kept, else from the event log.
  const aiEvents = events ? events.filter((event) => isAiDetection(event.type)) : null;
  const aiCounts = Object.fromEntries(AI_COUNTS.map(({ key }) => [key, raw.counts && key in raw.counts
    ? count(raw.counts[key])
    : (aiEvents || []).filter((event) => event.type === key).length]));
  const aiTotal = Object.values(aiCounts).reduce((a, b) => a + b, 0);
  const ai = settings?.ai?.enabled || raw.ai?.enabled || aiTotal > 0 ? { counts: aiCounts, total: aiTotal, events: aiEvents, settings: settings?.ai || null } : null;
  // Blocked actions come from counts when the server keeps them, else from the event log.
  const blocked = Object.fromEntries(BLOCKED_COUNTS.map(({ key }) => [key, raw.counts && key in raw.counts
    ? count(raw.counts[key])
    : (events || []).filter((event) => event.type === key).length]));
  const maxViolations = count(settings?.maxViolations ?? raw.maxViolations);
  const onLimit = (settings?.onLimit ?? raw.onLimit) === "flag" ? "flag" : "end";
  const violations = Number.isFinite(Number(raw.violations)) ? count(raw.violations) : Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    settings,
    events,
    counts,
    blocked,
    blockedTotal: Object.values(blocked).reduce((a, b) => a + b, 0),
    ai,
    pauses: pausesOf(raw, events, settings),
    violations,
    maxViolations,
    onLimit,
    // With "flag", reaching the limit only marks the report.
    limitReached: Boolean(raw.limitReached) || (maxViolations > 0 && violations >= maxViolations),
    endedForViolations: Boolean(raw.endedForViolations) || endedByLimit,
  };
}

/** The rules the attempt ran under, as short phrases (admin report). */
export function proctoringRules(settings) {
  if (!settings) return [];
  const rules = [];
  if (settings.fullscreen === "required") rules.push(settings.pauseOutsideFullscreen ? "Fullscreen required, paused outside it" : "Fullscreen required");
  if (settings.tabSwitch === "record") rules.push("Tab switches recorded");
  if (settings.tabSwitch === "warn") rules.push("Tab switches recorded, student warned");
  if (settings.refresh === "record") rules.push("Reloads and rejoins recorded");
  if (settings.blockRightClick) rules.push("Right-click blocked");
  if (settings.blockCopyPaste) rules.push("Copy & paste blocked");
  if (settings.blockShortcuts) rules.push("Shortcuts blocked");
  if (settings.ai?.enabled) {
    const checks = [settings.ai.detectMobile && "phone", settings.ai.detectMultiplePersons && "other persons", settings.ai.detectNoFace && "no face",
      settings.ai.detectFaceOutOfFrame && "out of frame", settings.ai.detectLookingAway && "looking away"].filter(Boolean);
    rules.push(`Camera AI checks${checks.length ? `: ${checks.join(", ")}` : ""}`);
  }
  if (Number.isFinite(Number(settings.warnings))) rules.push(`${count(settings.warnings)} warning${count(settings.warnings) === 1 ? "" : "s"} before the limit`);
  const max = count(settings.maxViolations);
  rules.push(max ? `Limit ${max} violation${max === 1 ? "" : "s"} · ${settings.onLimit === "flag" ? "then flagged only" : "then the interview ends"}` : "No violation limit");
  return rules;
}

/** "ANVI report - Asha Verma - Backend round - 2026-10-22": the print fallback's document title. */
export function reportFileName(attempt = {}, studentName = "") {
  const parts = ["ANVI report", studentName, attempt.title || attempt.interviewTitle || "AI interview", istDay(attempt.startedAt || attempt.endedAt)];
  return parts.filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
}

const slug = (text, max = 60) => String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");

/** "ANVI-Report-Asha-Verma-Backend-round-2026-10-22.pdf" (candidate and date left out when unknown). */
export function reportPdfFileName(attempt = {}, candidate = "") {
  const title = attempt.title || attempt.interviewTitle || "AI interview";
  return `${["ANVI-Report", slug(candidate), slug(title), istDay(attempt.startedAt || attempt.endedAt)].filter(Boolean).join("-")}.pdf`;
}

export const REPORT_FOOTER = "Generated by PeerPrep ANVI · AI-generated, review before decisions";
export const REPORT_DISCLAIMER = "This report was generated by ANVI, PeerPrep's AI interviewer, from the transcribed answers. It can contain mistakes: review the responses before making any decision. Proctoring events never change a score automatically.";

function statusOf(attempt) {
  if (attempt.endReason === "proctoring_limit") return { value: "Ended early", detail: endReasonLabel("proctoring_limit"), tone: "critical" };
  if (attempt.partial) return { value: "Ended early", detail: endReasonLabel(attempt.endReason), tone: "caution" };
  return { value: "Completed", detail: "", tone: "positive" };
}

function responseOf(item, index, { showExpectedAnswer }) {
  const answered = isAnswered(item);
  const keyPoints = (Array.isArray(item.expectedKeyPoints) ? item.expectedKeyPoints : []).filter(Boolean)
    .map((text) => ({ text: String(text), verdict: verdictOf(item, text) }));
  const score = numberOrNull(item.marks);
  const max = numberOrNull(item.maxMarks);
  const percent = numberOrNull(item.percentCorrect);
  const metrics = answered && item.metrics && typeof item.metrics === "object" ? item.metrics : null;
  const words = Number(metrics?.words) || 0;
  const wpm = Number(metrics?.wpm) || 0;
  const fillers = numberOrNull(metrics?.fillerCount);
  const feedback = String(item.feedback || "").trim();
  const shownPercent = percent === null ? null : clampPercent(percent);
  const band = shownPercent === null ? "" : bandFor(shownPercent);
  const dimensions = answered ? dimensionsOf(item.dimensions) : null;
  const seconds = answered ? Math.round(Number(item.answerSeconds) || 0) : 0;
  return {
    // The student's own sequence (questions are generated per student, so this is not a bank number).
    n: index + 1,
    label: `Q${index + 1}`,
    band,
    tone: band ? bandTone(band) : "neutral",
    functional: answered ? percentOrNull(item.functional) : null,
    nonFunctional: answered ? percentOrNull(item.nonFunctional) : null,
    dimensions: dimensions ? DIMENSIONS.filter(({ key }) => key in dimensions).map((dimension) => ({
      key: dimension.key, label: dimension.label, icon: dimension.icon, percent: dimensions[dimension.key], tone: bandTone(bandFor(dimensions[dimension.key])),
    })) : [],
    seconds: seconds > 0 ? seconds : null,
    time: timeLabel(seconds),
    words: words > 0 ? words : null,
    wpm: wpm > 0 ? Math.round(wpm) : null,
    pace: paceBand(wpm),
    fillers: metrics && fillers !== null ? fillers : null,
    fillerRate: metrics && fillers !== null && words > 0 ? Math.round((fillers / words) * 1000) / 10 : null,
    strengths: answered ? textList(item.strengths, 4) : [],
    improvements: answered ? textList(item.improvements, 4) : [],
    key: String(item.qid || `${item.n ?? "r"}-${index}`),
    section: item.sectionName || "",
    competency: item.competency && item.competency !== item.sectionName ? item.competency : "",
    question: String(item.questionText || "").trim(),
    answered,
    status: answered ? "answered" : item.status === "skipped" ? "skipped" : "not_attempted",
    statusLabel: answered ? "Answered" : item.status === "skipped" ? "Skipped" : "Not attempted",
    answer: answered ? String(item.answerText).trim() : "",
    // Marks only when the server scored this answer (admin rows of an unscored attempt carry null).
    marks: score !== null && max ? { score, max } : null,
    percent: shownPercent,
    keyPoints,
    keyPointCounts: keyPoints.reduce((counts, point) => ({ ...counts, [point.verdict]: counts[point.verdict] + 1 }), { matched: 0, partial: 0, missed: 0 }),
    // The evaluator writes "Not attempted." for unanswered items; the status already says so.
    feedback: !answered && /^not attempted\.?$/i.test(feedback) ? "" : feedback,
    flags: flagList(item.flags),
    metrics: [
      words > 0 && { key: "words", icon: "textAlignStart", label: plural(words, "word") },
      wpm > 0 && { key: "wpm", icon: "gauge", label: `${wpm} words / min` },
      fillers !== null && metrics && { key: "fillers", icon: "messageCircle", label: plural(fillers, "filler") },
    ].filter(Boolean),
    expectedAnswer: showExpectedAnswer ? String(item.expectedAnswer || "").trim() : "",
  };
}

/**
 * The success metrics (overall dimensions) with what went well and what to improve for each. That text is
 * the evaluator's own per-answer strengths / improvements, taken from the answers that scored highest
 * (70+) or lowest (under 70) on the metric and tagged with their question; without any, the overall lists.
 */
function successMetrics(source, responses, cohort, kpis) {
  const overall = dimensionsOf(source.overall?.dimensions ?? source.dimensions);
  if (!overall) return [];
  const fallback = { strengths: textList(source.overall?.strengths, 3), improvements: textList(source.overall?.improvements, 3) };
  const pick = (entries, field) => {
    const seen = new Set();
    const out = [];
    for (const { response } of entries) {
      for (const text of response[field].slice(0, 2)) {
        if (seen.has(text) || out.length >= 3) continue;
        seen.add(text);
        out.push({ text, question: response.label });
      }
    }
    return out;
  };
  return DIMENSIONS.filter(({ key }) => key in overall).map((dimension) => {
    const percent = overall[dimension.key];
    const band = bandFor(percent);
    const rated = responses.map((response) => ({ response, value: response.dimensions.find((entry) => entry.key === dimension.key)?.percent ?? null }))
      .filter((entry) => entry.value !== null);
    let wentWell = pick([...rated].filter((entry) => entry.value >= 70).sort((a, b) => b.value - a.value), "strengths");
    let improve = pick([...rated].filter((entry) => entry.value < 70).sort((a, b) => a.value - b.value), "improvements");
    if (!wentWell.length && !improve.length) {
      wentWell = fallback.strengths.map((text) => ({ text, question: "" }));
      improve = fallback.improvements.map((text) => ({ text, question: "" }));
    }
    const sorted = [...rated].sort((a, b) => b.value - a.value);
    const facts = [];
    if (sorted.length > 1 && sorted[0].value !== sorted.at(-1).value) {
      facts.push(`Highest in ${sorted[0].response.label} (${sorted[0].value}%), lowest in ${sorted.at(-1).response.label} (${sorted.at(-1).value}%).`);
    }
    if (dimension.key === "fluency" && kpis.averageWpm !== null) facts.push(`Average pace ${kpis.averageWpm} words a minute (${PACE.min}–${PACE.max} is a clear pace).`);
    if (dimension.key === "fluency" && kpis.fillers !== null && kpis.totalWords) facts.push(`${plural(kpis.fillers, "filler word")} in ${kpis.totalWords} words.`);
    return {
      ...dimension, percent, band, tone: bandTone(band),
      cohort: cohort?.dimensions?.[dimension.key] ?? null,
      wentWell, improve, facts,
    };
  });
}

/** Chart data of the Analysis tab; each list is empty (or null) when its data is missing. */
function analysisOf({ metrics, cohort, skills, competencies, responses, score }) {
  const skillRows = skills.length ? skills.map((row) => ({ key: row.key, label: row.name, you: row.percent }))
    : competencies.map((row) => ({ key: row.key, label: row.name, you: row.percent }));
  const scored = responses.map((response, index) => ({ response, index })).filter(({ response }) => response.percent !== null);
  const fillerRows = responses.map((response, index) => ({ response, index })).filter(({ response }) => response.fillers !== null)
    .map(({ response, index }) => ({ key: response.key, label: response.label, index, count: response.fillers, words: response.words, rate: response.fillerRate }));
  const fillerWords = fillerRows.reduce((sum, row) => sum + (row.words || 0), 0);
  const fillerTotal = fillerRows.reduce((sum, row) => sum + row.count, 0);
  return {
    dimensionRadar: metrics.length >= 3 ? {
      rows: metrics.map((metric) => ({ key: metric.key, label: metric.label, you: metric.percent, cohort: metric.cohort })),
      cohort: Boolean(cohort) && metrics.some((metric) => metric.cohort !== null),
      cohortCount: cohort?.count || 0,
    } : null,
    skillRadar: skillRows.length >= 3 ? { title: skills.length ? "Skills" : "Competencies", rows: skillRows } : null,
    questions: scored.length ? [
      ...(score ? [{ key: "overall", label: "Overall", percent: score.percent, tone: score.tone, band: score.band, index: -1, question: "Overall result" }] : []),
      ...scored.map(({ response, index }) => ({ key: response.key, label: response.label, percent: response.percent, tone: response.tone, band: response.band, index, question: response.question, status: response.answered ? "" : response.statusLabel })),
    ] : [],
    cohortPercent: cohort?.percent ?? null,
    pace: responses.map((response, index) => ({ response, index })).filter(({ response }) => response.wpm)
      .map(({ response, index }) => ({ key: response.key, label: response.label, index, wpm: response.wpm, pace: response.pace })),
    fillers: fillerRows.length ? {
      total: fillerTotal,
      words: fillerWords,
      perHundred: fillerWords ? Math.round((fillerTotal / fillerWords) * 1000) / 10 : null,
      rows: fillerRows,
    } : null,
  };
}

const MODE_LABELS = Object.freeze({ practice: "Practice", adaptive: "Adaptive", mock: "Mock interview" });
const capitalized = (text) => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "");

const barRows = (rows, detailOf) => (Array.isArray(rows) ? rows : [])
  .filter((row) => row && row.name && numberOrNull(row.percent) !== null)
  .map((row, index) => ({ key: String(row.sectionId || row.id || `${row.name}-${index}`), name: String(row.name), percent: clampPercent(row.percent), detail: detailOf(row) }));

/**
 * The report content shared by the screen, the PDF and the print layout.
 * `audience`: "student" (counts-only integrity, no warm-up) or "admin" (full proctoring timeline, warm-up,
 * flags, candidate ids). `studentName`: the candidate when the attempt carries no `student` (the student's own copy).
 */
export function buildReportModel(attempt = {}, { audience = "student", studentName = "", showExpectedAnswer = false } = {}) {
  const admin = audience === "admin";
  const source = attempt && typeof attempt === "object" ? attempt : {};
  const items = Array.isArray(source.items) ? source.items : [];
  const overall = source.overall && typeof source.overall === "object" ? source.overall : null;
  const k = reportKpis(source);
  const student = source.student && typeof source.student === "object" ? source.student : null;
  const name = String(student?.name || studentName || "").trim();
  const candidateIds = admin ? [student?.studentId, student?.email].filter(Boolean) : [];
  const title = source.title || source.interviewTitle || "AI interview";
  const startedAt = source.startedAt || source.endedAt || null;
  const status = statusOf(source);
  const duration = durationLabel(source.startedAt, source.endedAt);
  const responses = items.map((item, index) => responseOf(item, index, { showExpectedAnswer: admin && showExpectedAnswer }));
  const kpis = [
    k.keyPoints && {
      key: "keyPoints", icon: "listChecks", label: "Key points covered", value: `${k.keyPoints.matched} of ${k.keyPoints.total}`,
      detail: [k.keyPoints.partial && `${k.keyPoints.partial} partly`, k.keyPoints.missed && `${k.keyPoints.missed} missed`].filter(Boolean).join(" · ") || "All covered",
    },
    k.averageWords !== null && { key: "length", icon: "textAlignStart", label: "Avg. answer length", value: `${k.averageWords} words`, detail: `${k.totalWords} words in total` },
    k.averageWpm !== null && { key: "pace", icon: "gauge", label: "Speaking pace", value: `${k.averageWpm} wpm`, detail: paceLabel(k.averageWpm) },
    k.fillers !== null && { key: "fillers", icon: "messageCircle", label: "Filler words", value: String(k.fillers), detail: "um, uh, like, basically…" },
  ].filter(Boolean);
  const score = overall && k.percent !== null ? {
    percent: k.percent,
    marks: k.score !== null && k.max ? { score: k.score, max: k.max } : null,
    band: k.band,
    tone: bandTone(k.band),
    answered: k.answered,
    skipped: k.skipped,
    summary: summaryLine(source),
  } : null;
  const cohort = cohortOf(source);
  const skills = skillsOf(source);
  const competencies = barRows(source.byCompetency, () => "");
  const metrics = successMetrics(source, responses, cohort, k);
  const functional = percentOrNull(overall?.functional ?? source.functional);
  const nonFunctional = percentOrNull(overall?.nonFunctional ?? source.nonFunctional);
  const difficulty = String(source.difficulty || "").trim();
  return {
    audience: admin ? "admin" : "student",
    title,
    subtitle: [source.role, source.companyName].filter(Boolean).join(" · "),
    kind: source.assignmentId ? "Scheduled" : "Practice",
    candidate: name ? { name, ids: candidateIds.join(" · ") } : null,
    when: istDateTime(startedAt),
    day: istDay(startedAt),
    duration,
    status,
    partial: Boolean(source.partial),
    scoredAt: istDateTime(source.scoredAt),
    meta: [
      name && { key: "candidate", icon: "user", label: "Candidate", value: name, detail: candidateIds.join(" · ") },
      startedAt && { key: "date", icon: "calendar", label: "Date & time", value: istDateTime(startedAt) },
      duration && { key: "duration", icon: "clock", label: "Duration", value: duration },
      { key: "status", icon: status.tone === "positive" ? "circleCheck" : "circleAlert", label: "Status", value: status.value, detail: status.detail, tone: status.tone },
    ].filter(Boolean),
    // null when the attempt has no overall score (never shown as 0).
    score,
    attemptId: String(source.id || source.attemptId || ""),
    // Header chips: role · company · type · difficulty · duration (each only when known).
    chips: [
      source.role && { key: "role", icon: "briefcaseBusiness", label: String(source.role) },
      source.companyName && { key: "company", icon: "building2", label: String(source.companyName) },
      { key: "type", icon: "layers", label: source.assignmentId ? "Scheduled" : MODE_LABELS[source.mode] || "Practice" },
      difficulty && { key: "difficulty", icon: "signal", label: capitalized(difficulty) },
      duration && { key: "duration", icon: "timer", label: duration },
    ].filter(Boolean),
    // The evaluator's narrative (newer attempts); the one-line summary stands in for older ones.
    narrative: String(overall?.summary || "").trim(),
    split: functional !== null || nonFunctional !== null ? {
      functional, nonFunctional, cohortFunctional: cohort?.functional ?? null, cohortNonFunctional: cohort?.nonFunctional ?? null,
    } : null,
    metrics,
    skills,
    cohort,
    analysis: analysisOf({ metrics, cohort, skills, competencies, responses, score }),
    kpis,
    sections: barRows(source.bySection, (row) => (numberOrNull(row.max) ? `${marks(row.score)} / ${marks(row.max)}` : "")),
    competencies,
    criteria: barRows(source.byRubric, (row) => (Number(row.weight) > 0 ? `${Number(row.weight)}% weight` : "")),
    strengths: (overall?.strengths || []).filter(Boolean).map(String),
    improvements: (overall?.improvements || []).filter(Boolean).map(String),
    actions: (Array.isArray(source.actionItems) ? source.actionItems : []).filter(Boolean).map(String),
    responses,
    keyPointsWithheld: Boolean(source.keyPointsWithheld),
    flags: admin ? flagList(source.flags) : [],
    integrity: proctoringOf(source),
    integrityFull: admin,
    setup: setupRows(source),
    terms: String(source.terms?.text || "").trim(),
    warmup: admin ? String(source.warmup || "").trim() : "",
    footer: REPORT_FOOTER,
    disclaimer: REPORT_DISCLAIMER,
  };
}

/** The tabs a report shows: Analysis and Action items only when they have something to show. */
export function reportTabs(model) {
  const { analysis } = model;
  const charts = Boolean(analysis.dimensionRadar || analysis.skillRadar || analysis.questions.length || analysis.pace.length || analysis.fillers);
  return [
    { id: "summary", label: "Summary", icon: "sparkles" },
    { id: "questions", label: "Question-wise feedback", short: "Questions", icon: "messageSquareText", count: model.responses.length },
    charts && { id: "analysis", label: "Analysis", icon: "barChart" },
    model.actions.length > 0 && { id: "actions", label: "Action items", short: "Actions", icon: "listTodo", count: model.actions.length },
  ].filter(Boolean);
}
