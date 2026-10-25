import { anviSettings } from "../../definition.js";
import { DEFAULT_AI_PROCTORING_SETTINGS } from "../../../../features/assessment/proctoring/constants/proctoringEvents.js";

// Interview rules kept under data.anvi: language, conduct (with terms), warm-up and resume.
// The server fills any missing value with its default; these readers apply the same defaults so
// older interviews (saved before these settings existed) show what students will actually get.

export const TERMS_LIMIT = 4000;
export const INTERVIEW_LANGUAGES = Object.freeze(["English", "Hindi", "Hinglish"]);

// The language settings' field names in one place (the backend contract may still be adjusted).
export const LANGUAGE_FIELDS = Object.freeze({
  group: "language",
  primary: "primary",
  studentChoice: "studentChoice",
  strict: "strict",
  onOtherLanguage: "onOtherLanguage",
});
export const OTHER_LANGUAGE_ACTIONS = Object.freeze([
  {
    value: "remind_and_flag",
    label: "Remind and flag",
    detail: "ANVI asks the student to switch back, and the answer is marked in the report.",
  },
  {
    value: "remind",
    label: "Remind only",
    detail: "ANVI asks the student to switch back. Nothing is marked in the report.",
  },
  {
    value: "ignore",
    label: "Ignore",
    detail: "ANVI carries on without comment.",
  },
]);

export const RESUME_MODES = Object.freeze(["none", "optional", "required"]);
export const RESUME_SOURCES = Object.freeze([
  { value: "builder", label: "Saved resume from Resume Builder", detail: "The student allows ANVI to read the resume they built on PeerPrep." },
  { value: "upload", label: "Uploaded file (PDF or text)", detail: "The student uploads a resume, up to 5 MB." },
]);

export const SETTINGS_DEFAULTS = Object.freeze({
  conduct: Object.freeze({
    endByVoice: false,
    finishAllQuestions: true,
    noPersonalQuestions: true,
    termsText: "",
    requireTermsAcceptance: false,
  }),
  warmup: Object.freeze({ enabled: true, icebreakers: 2, tellMeAboutYourself: true, scored: false }),
  resume: Object.freeze({ mode: "none", sources: Object.freeze(["builder", "upload"]), questionCount: 2 }),
  language: Object.freeze({ studentChoice: Object.freeze([]), strict: true, onOtherLanguage: "remind_and_flag" }),
  proctoring: Object.freeze({
    enabled: false,
    fullscreen: "off",
    pauseOutsideFullscreen: true,
    tabSwitch: "off",
    refresh: "off",
    blockRightClick: true,
    blockCopyPaste: true,
    blockShortcuts: true,
    warnings: 3,
    maxViolations: 0,
    onLimit: "end",
    // Camera checks: the Assessment module's AI proctoring settings, same shape and defaults.
    ai: DEFAULT_AI_PROCTORING_SETTINGS,
  }),
});

const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const whole = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const withAnvi = (data, key, value) => ({ ...data, anvi: { ...anviSettings(data.anvi), [key]: value } });

// ---- Language ---------------------------------------------------------------

export function readLanguage(data = {}) {
  const F = LANGUAGE_FIELDS;
  const raw = data.anvi?.[F.group] || {};
  const primary = INTERVIEW_LANGUAGES.includes(raw[F.primary])
    ? raw[F.primary]
    : INTERVIEW_LANGUAGES.includes(data.rules?.language)
      ? data.rules.language
      : "English";
  const choices = Array.isArray(raw[F.studentChoice]) ? raw[F.studentChoice] : SETTINGS_DEFAULTS.language.studentChoice;
  return {
    primary,
    studentChoice: [...new Set(choices)].filter((l) => INTERVIEW_LANGUAGES.includes(l) && l !== primary),
    strict: bool(raw[F.strict], SETTINGS_DEFAULTS.language.strict),
    onOtherLanguage: OTHER_LANGUAGE_ACTIONS.some((a) => a.value === raw[F.onOtherLanguage])
      ? raw[F.onOtherLanguage]
      : SETTINGS_DEFAULTS.language.onOtherLanguage,
  };
}

// Writes data.anvi.language and keeps data.rules.language equal to the primary language, which
// older parts of the app (voice accent, summary, interviewer profile default) still read.
export function writeLanguage(data, patch) {
  const F = LANGUAGE_FIELDS;
  const next = { ...readLanguage(data), ...patch };
  const studentChoice = INTERVIEW_LANGUAGES.filter((l) => l !== next.primary && next.studentChoice.includes(l));
  return {
    ...withAnvi(data, F.group, {
      ...(data.anvi?.[F.group] || {}),
      [F.primary]: next.primary,
      [F.studentChoice]: studentChoice,
      [F.strict]: next.strict,
      [F.onOtherLanguage]: next.onOtherLanguage,
    }),
    rules: { ...data.rules, language: next.primary },
  };
}

export const toggleLanguageChoice = (data, language) => {
  const { studentChoice } = readLanguage(data);
  return writeLanguage(data, {
    studentChoice: studentChoice.includes(language)
      ? studentChoice.filter((l) => l !== language)
      : [...studentChoice, language],
  });
};

// ANVI interviews are always in English (Indian accent). Every edit passes through this, so an older
// Hindi or Hinglish draft is converted the next time it is saved. Returns `data` itself when it
// already conforms, so nothing changes (and nothing is saved) without an edit.
export const ENGLISH_ONLY = Object.freeze({
  primary: "English",
  studentChoice: Object.freeze([]),
  strict: true,
  onOtherLanguage: "remind_and_flag",
});
export function englishOnly(data) {
  if (!data || typeof data !== "object") return data;
  const F = LANGUAGE_FIELDS;
  const raw = data.anvi?.[F.group] || {};
  const code = data.anvi?.voice?.languageCode;
  const conforms =
    data.rules?.language === "English" &&
    raw[F.primary] === "English" &&
    Array.isArray(raw[F.studentChoice]) &&
    raw[F.studentChoice].length === 0 &&
    raw[F.strict] === true &&
    raw[F.onOtherLanguage] === "remind_and_flag" &&
    (!code || code === "en-IN");
  if (conforms) return data;
  const anvi = {
    ...(data.anvi || {}),
    [F.group]: {
      ...raw,
      [F.primary]: "English",
      [F.studentChoice]: [],
      [F.strict]: true,
      [F.onOtherLanguage]: "remind_and_flag",
    },
  };
  if (code && code !== "en-IN") anvi.voice = { ...data.anvi.voice, languageCode: "en-IN" };
  return { ...data, rules: { ...(data.rules || {}), language: "English" }, anvi };
}

// "English only" or "English, Hindi (student chooses)".
export function languageSummary(data) {
  const { primary, studentChoice } = readLanguage(data);
  return studentChoice.length ? `${[primary, ...studentChoice].join(", ")} (student chooses)` : `${primary} only`;
}

// The summary and review rows: "English", or "English or Hindi" when the student picks.
export function languageRow(data) {
  const { primary, studentChoice } = readLanguage(data);
  return [primary, ...studentChoice].join(" or ");
}

// ---- Conduct and terms ------------------------------------------------------

export function readConduct(data = {}) {
  const raw = data.anvi?.conduct || {};
  const d = SETTINGS_DEFAULTS.conduct;
  const termsText = typeof raw.termsText === "string" ? raw.termsText.slice(0, TERMS_LIMIT) : d.termsText;
  return {
    endByVoice: bool(raw.endByVoice, d.endByVoice),
    finishAllQuestions: bool(raw.finishAllQuestions, d.finishAllQuestions),
    noPersonalQuestions: bool(raw.noPersonalQuestions, d.noPersonalQuestions),
    termsText,
    // Without terms there is nothing to accept; with terms the server's default is to require it.
    requireTermsAcceptance: termsText.trim() ? bool(raw.requireTermsAcceptance, true) : false,
  };
}

export function writeConduct(data, patch) {
  const current = readConduct(data);
  const next = { ...current, ...patch };
  next.termsText = String(next.termsText ?? "").slice(0, TERMS_LIMIT);
  const hadTerms = Boolean(current.termsText.trim());
  const hasTerms = Boolean(next.termsText.trim());
  if (!hasTerms) next.requireTermsAcceptance = false;
  // Adding terms for the first time asks students to accept them, as the server would.
  else if (!hadTerms && !("requireTermsAcceptance" in patch)) next.requireTermsAcceptance = true;
  return withAnvi(data, "conduct", { ...(data.anvi?.conduct || {}), ...next });
}

// ---- Warm-up ----------------------------------------------------------------

export function readWarmup(data = {}) {
  const raw = data.anvi?.warmup || {};
  const d = SETTINGS_DEFAULTS.warmup;
  return {
    enabled: bool(raw.enabled, d.enabled),
    icebreakers: whole(raw.icebreakers, 0, 3, d.icebreakers),
    tellMeAboutYourself: bool(raw.tellMeAboutYourself, d.tellMeAboutYourself),
    scored: bool(raw.scored, d.scored),
  };
}

export const writeWarmup = (data, patch) => {
  const next = { ...readWarmup(data), ...patch };
  next.icebreakers = whole(next.icebreakers, 0, 3, SETTINGS_DEFAULTS.warmup.icebreakers);
  return withAnvi(data, "warmup", { ...(data.anvi?.warmup || {}), ...next });
};

// ---- Resume -----------------------------------------------------------------

export const hasResumeQuestions = (data = {}) =>
  (data.sections || []).some((s) => (s.groups || []).some((g) => (g.questions || []).some((q) => q.kind === "resume")));

// Older interviews have no anvi.resume; the server then derives the mode from the questions and rules.
const derivedMode = (data) => {
  const ruled = RESUME_MODES.includes(data.rules?.resume) ? data.rules.resume : "none";
  return hasResumeQuestions(data) || ruled === "required" ? "required" : ruled;
};

export function readResume(data = {}) {
  const raw = data.anvi?.resume || {};
  const d = SETTINGS_DEFAULTS.resume;
  const sources = Array.isArray(raw.sources)
    ? RESUME_SOURCES.map((s) => s.value).filter((value) => raw.sources.includes(value))
    : [...d.sources];
  return {
    mode: RESUME_MODES.includes(raw.mode) ? raw.mode : derivedMode(data),
    sources: sources.length ? sources : [...d.sources],
    questionCount: whole(raw.questionCount, 0, 5, d.questionCount),
  };
}

// Students must always have at least one way to share a resume: the last source cannot be removed.
export function toggleSource(sources, source) {
  if (!sources.includes(source)) return RESUME_SOURCES.map((s) => s.value).filter((v) => v === source || sources.includes(v));
  return sources.length > 1 ? sources.filter((s) => s !== source) : sources;
}

// ---- AI proctoring ----------------------------------------------------------
// Browser-based monitoring (no camera). Scores are never changed by it; events are report flags.

export const PROCTORING_LIMITS = Object.freeze({ warnings: 10, maxViolations: 20 });
export const FULLSCREEN_MODES = Object.freeze([
  { value: "off", label: "Off", detail: "Students can take the interview in a normal window." },
  { value: "required", label: "Required", detail: "Students must be in fullscreen to join. Each exit counts as a violation." },
]);
export const TAB_SWITCH_MODES = Object.freeze([
  { value: "off", label: "Off", detail: "Switching tabs or windows is not tracked." },
  { value: "record", label: "Record", detail: "Each switch is logged for your report. The student is not told." },
  { value: "warn", label: "Record + warn", detail: "Each switch is logged and the student sees a warning." },
]);
export const REFRESH_MODES = Object.freeze([
  { value: "off", label: "Off", detail: "Reloading the page or rejoining is not tracked." },
  { value: "record", label: "Record", detail: "Each reload or rejoin of the same attempt is logged as a violation." },
]);
export const ON_LIMIT_ACTIONS = Object.freeze([
  { value: "end", label: "End the interview", detail: "The interview ends and is scored on the answers so far." },
  { value: "flag", label: "Only flag in report", detail: "The interview continues; the report is marked as over the limit." },
]);
const oneOf = (options, value, fallback) => (options.some((o) => o.value === value) ? value : fallback);

// Ranges of the Assessment aiProctoringSettingsSchema. The server's definition validator rejects a
// value outside them (422), so writeProctoring stores only in-range numbers.
export const AI_PROCTORING_RANGES = Object.freeze({
  faceOutOfFrameGraceSec: [3, 60],
  detectionIntervalMs: [500, 5000],
  ignoreLimit: [0, 50],
  violationCooldownSec: [5, 120],
});
const AI_FLAGS = ["enabled", "detectMobile", "detectMultiplePersons", "detectNoFace", "detectFaceOutOfFrame", "detectLookingAway", "criticalAutoFlag"];

/** The camera settings with defaults and ranges applied (what students will actually get). */
export function readAiProctoring(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_AI_PROCTORING_SETTINGS;
  const next = { ...source };
  for (const key of AI_FLAGS) next[key] = bool(source[key], d[key]);
  for (const [key, [min, max]] of Object.entries(AI_PROCTORING_RANGES)) {
    const n = Number(source[key]);
    next[key] = Number.isFinite(n) && source[key] !== null && source[key] !== "" ? Math.min(max, Math.max(min, Math.round(n))) : d[key];
  }
  return next;
}

export function readProctoring(data = {}) {
  const raw = data.anvi?.proctoring || {};
  const d = SETTINGS_DEFAULTS.proctoring;
  return {
    ai: readAiProctoring(raw.ai),
    enabled: bool(raw.enabled, d.enabled),
    fullscreen: oneOf(FULLSCREEN_MODES, raw.fullscreen, d.fullscreen),
    pauseOutsideFullscreen: bool(raw.pauseOutsideFullscreen, d.pauseOutsideFullscreen),
    tabSwitch: oneOf(TAB_SWITCH_MODES, raw.tabSwitch, d.tabSwitch),
    refresh: oneOf(REFRESH_MODES, raw.refresh, d.refresh),
    blockRightClick: bool(raw.blockRightClick, d.blockRightClick),
    blockCopyPaste: bool(raw.blockCopyPaste, d.blockCopyPaste),
    blockShortcuts: bool(raw.blockShortcuts, d.blockShortcuts),
    warnings: whole(raw.warnings, 0, PROCTORING_LIMITS.warnings, d.warnings),
    maxViolations: whole(raw.maxViolations, 0, PROCTORING_LIMITS.maxViolations, d.maxViolations),
    onLimit: oneOf(ON_LIMIT_ACTIONS, raw.onLimit, d.onLimit),
  };
}

/** True when proctoring is on but nothing would be watched or blocked. */
export function proctoringIsEmpty(settings) {
  return settings.enabled && settings.fullscreen === "off" && settings.tabSwitch === "off" && settings.refresh === "off"
    && !settings.blockRightClick && !settings.blockCopyPaste && !settings.blockShortcuts && !settings.ai?.enabled;
}

// Writes data.anvi.proctoring, keeping keys this editor does not know. Turning proctoring on while
// fullscreen, tab and refresh checks are all off picks the recommended checks, so the switch does
// something: fullscreen required, tab switches recorded and warned, reloads recorded.
export function writeProctoring(data, patch) {
  const current = readProctoring(data);
  const next = { ...current, ...patch };
  if (patch.enabled === true && !current.enabled && !("fullscreen" in patch) && !("tabSwitch" in patch) && !("refresh" in patch)
    && current.fullscreen === "off" && current.tabSwitch === "off" && current.refresh === "off") {
    Object.assign(next, { fullscreen: "required", tabSwitch: "warn", refresh: "record" });
  }
  next.warnings = whole(next.warnings, 0, PROCTORING_LIMITS.warnings, current.warnings);
  next.maxViolations = whole(next.maxViolations, 0, PROCTORING_LIMITS.maxViolations, current.maxViolations);
  // The camera block is stored with the ranges applied: an out-of-range number becomes the nearest
  // allowed value and an empty one the default, because the server refuses the whole save otherwise.
  // The card keeps the half-typed text on screen until the field loses focus.
  next.ai = readAiProctoring(patch.ai ? { ...current.ai, ...patch.ai } : current.ai);
  return withAnvi(data, "proctoring", { ...(data.anvi?.proctoring || {}), ...next });
}

/** Out-of-range camera values (as typed), as "Detection interval: 500–5000 ms" lines for the card. */
export function aiRangeIssues(ai = {}) {
  const labels = { faceOutOfFrameGraceSec: ["Face absence grace period", "sec"], detectionIntervalMs: ["Detection interval", "ms"], ignoreLimit: ["Ignore limit", "violations"], violationCooldownSec: ["Violation cooldown", "sec"] };
  return Object.entries(AI_PROCTORING_RANGES).filter(([key, [min, max]]) => {
    const n = Number(ai[key]);
    return ai[key] !== undefined && (!Number.isFinite(n) || n < min || n > max);
  }).map(([key, [min, max]]) => `${labels[key][0]}: ${min}–${max} ${labels[key][1]}`);
}

// Writes data.anvi.resume and keeps the older data.rules.resume in step.
export function writeResume(data, patch) {
  const next = { ...readResume(data), ...patch };
  if (!next.sources.length) next.sources = readResume(data).sources;
  next.questionCount = whole(next.questionCount, 0, 5, SETTINGS_DEFAULTS.resume.questionCount);
  return {
    ...withAnvi(data, "resume", { ...(data.anvi?.resume || {}), ...next }),
    rules: { ...data.rules, resume: next.mode },
  };
}
