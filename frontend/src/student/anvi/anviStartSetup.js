// What a student settles before a NEW ANVI attempt starts: the interview language, the resume and the
// terms. Field names that the backend is still finalising (the language lock) are read and written only
// here, so a rename touches this file alone.

/** Where the Resume Builder lives (App.jsx route). */
export const RESUME_BUILDER_ROUTE = "/student/resume";
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_PRIVACY_NOTE = "Only the text is used, personal details are removed, and it's deleted after your interview.";

// List items expose `languageSetup:{ primary, choices, strict, onOtherLanguage }` next to `language` (the
// primary as a plain string), and the start body takes `language` (400 LANGUAGE_NOT_ALLOWED otherwise).
const ITEM_LANGUAGE_FIELDS = ["languageSetup", "language"];
const START_LANGUAGE_FIELD = "language";

const text = (value) => (typeof value === "string" ? value.trim() : "");
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

/** { primary, choices, strict } of a list item (practice or assignment). `choices` always starts with primary. */
export function languageSetupOf(item) {
  const raw = ITEM_LANGUAGE_FIELDS.map((key) => item?.[key]).find((value) => value !== undefined && value !== null && value !== "");
  if (raw && typeof raw === "object") {
    const primary = text(raw.primary) || "English";
    const extra = Array.isArray(raw.choices) ? raw.choices : Array.isArray(raw.studentChoice) ? raw.studentChoice : [];
    return { primary, choices: unique([primary, ...extra]), strict: raw.strict !== false };
  }
  const primary = text(raw) || "English";
  return { primary, choices: [primary], strict: true };
}

/** A short label for a row's facts line: "English", or "English or Hindi" when the student may choose. */
export function languageLabel(value) {
  if (!value) return "";
  const { choices } = languageSetupOf({ language: value });
  return choices.length > 1 ? `${choices.slice(0, -1).join(", ")} or ${choices.at(-1)}` : choices[0];
}

/** The terms shown before a start: { text, required }. */
export function termsOf(item) {
  const terms = item?.terms && typeof item.terms === "object" ? item.terms : {};
  return { text: typeof terms.text === "string" ? terms.text.trim() : "", required: terms.required === true };
}

/**
 * The resume step: { mode: "none"|"optional"|"required", sources, questionCount, provided, source, providedAt }.
 * A list from before resume uploads only had `requiresResume` (consent to the Resume Builder resume).
 */
export function resumeSetupOf(item) {
  const raw = item?.resumeSetup;
  if (!raw || typeof raw !== "object") {
    return item?.requiresResume
      ? { mode: "required", sources: ["builder"], questionCount: 0, provided: false, source: null, providedAt: null }
      : { mode: "none", sources: [], questionCount: 0, provided: false, source: null, providedAt: null };
  }
  const mode = ["none", "optional", "required"].includes(raw.mode) ? raw.mode : "none";
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter((source) => source === "builder" || source === "upload");
  return {
    mode,
    sources: sources.length ? sources : ["builder", "upload"],
    questionCount: Number(raw.questionCount) || 0,
    provided: raw.provided === true,
    source: raw.source || null,
    providedAt: raw.providedAt || null,
  };
}

const intIn = (value, min, max, fallback) => {
  const number = Math.round(Number(value));
  return value === undefined || value === null || value === "" || !Number.isFinite(number) ? fallback : Math.min(max, Math.max(min, number));
};
const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);

/**
 * The proctoring rules of a list item (`proctoring`, contract addendum v2), with the addendum's defaults
 * for fields an older list leaves out. When `enabled` is false every rule is off. `active`: proctoring is
 * on and at least one rule applies, so the pre-start flow shows its Proctoring phase.
 */
export function proctoringOf(item) {
  const raw = item?.proctoring && typeof item.proctoring === "object" ? item.proctoring : {};
  const enabled = raw.enabled === true;
  const fullscreen = enabled && raw.fullscreen === "required" ? "required" : "off";
  const tabSwitch = enabled && ["record", "warn"].includes(raw.tabSwitch) ? raw.tabSwitch : "off";
  const refresh = enabled && raw.refresh === "record" ? "record" : "off";
  const rules = {
    enabled, fullscreen, tabSwitch, refresh,
    pauseOutsideFullscreen: fullscreen === "required" && flag(raw.pauseOutsideFullscreen, true),
    blockRightClick: enabled && flag(raw.blockRightClick, true),
    blockCopyPaste: enabled && flag(raw.blockCopyPaste, true),
    blockShortcuts: enabled && flag(raw.blockShortcuts, true),
    warnings: enabled ? intIn(raw.warnings, 0, 10, 3) : 0,
    maxViolations: enabled ? intIn(raw.maxViolations, 0, 20, 0) : 0,
    onLimit: raw.onLimit === "flag" ? "flag" : "end",
  };
  rules.ai = aiProctoringOf(enabled ? raw.ai : null);
  const watches = fullscreen !== "off" || tabSwitch !== "off" || refresh !== "off" || rules.blockRightClick || rules.blockCopyPaste || rules.blockShortcuts || rules.ai.enabled;
  return { ...rules, active: enabled && watches };
}

/**
 * Whether a rejoin must re-enter fullscreen in its Join click. The student attempt detail of an
 * in-progress attempt carries `proctoring: { enabled, settings, violations }`, so the answer is exact:
 * fullscreen "required" in the settings the attempt runs with. A join reply carries the settings fields
 * themselves. An older view with only `{ enabled, counts, violations }` (no settings) still asks for
 * fullscreen when proctored, because the room cannot ask for it later without another click.
 */
export function rejoinNeedsFullscreen(attempt) {
  const raw = attempt?.proctoring && typeof attempt.proctoring === "object" ? attempt.proctoring : null;
  if (!raw || raw.enabled !== true) return false;
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings
    : "fullscreen" in raw ? raw : null;
  if (!settings) return true;
  // `enabled` is the top-level switch; settings only turn it off when they say so explicitly.
  return proctoringOf({ proctoring: { ...settings, enabled: settings.enabled !== false } }).fullscreen === "required";
}

/**
 * Camera AI checks (`proctoring.ai`, contract addendum v3): the Assessment `aiProctoring` shape and
 * defaults. Off unless proctoring itself is on (the caller passes null then).
 */
export function aiProctoringOf(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: value.enabled === true,
    detectMobile: flag(value.detectMobile, true),
    detectMultiplePersons: flag(value.detectMultiplePersons, true),
    detectNoFace: flag(value.detectNoFace, true),
    detectFaceOutOfFrame: flag(value.detectFaceOutOfFrame, true),
    faceOutOfFrameGraceSec: intIn(value.faceOutOfFrameGraceSec, 3, 60, 10),
    detectLookingAway: flag(value.detectLookingAway, true),
    detectionIntervalMs: intIn(value.detectionIntervalMs, 500, 5000, 500),
    ignoreLimit: intIn(value.ignoreLimit, 0, 50, 5),
    violationCooldownSec: intIn(value.violationCooldownSec, 5, 120, 20),
    criticalAutoFlag: flag(value.criticalAutoFlag, true),
  };
}

/** Whether the camera checks need a face model (any face-based check is on). */
export const aiNeedsFace = (ai) => Boolean(ai?.enabled && (ai.detectNoFace || ai.detectFaceOutOfFrame || ai.detectMultiplePersons || ai.detectLookingAway));

/** Everything the pre-start lobby needs from a list item. `kind`: "practice" or "assignment". */
export function startSetupOf(item, kind) {
  const assignment = kind === "assignment";
  return {
    kind: assignment ? "assignment" : "practice",
    id: String(assignment ? item?.assignmentId || item?.id || "" : item?.id || ""),
    title: item?.title || "AI interview",
    role: item?.role || "",
    companyName: item?.companyName || "",
    mode: item?.mode || "",
    questionCount: Number(item?.questionCount || item?.totalQuestions) || 0,
    estimatedMinutes: Number(item?.estimatedMinutes) || 0,
    language: languageSetupOf(item),
    terms: termsOf(item),
    resume: resumeSetupOf(item),
    proctoring: proctoringOf(item),
    // A scheduled interview's join window closes here (shown in the Background phase).
    deadline: assignment ? item?.joinWindow?.to || null : null,
  };
}

/** The resume API target of a setup: { kind, id }. */
export const resumeTargetOf = (setup) => ({ kind: setup?.kind === "assignment" ? "assignment" : "practice", id: String(setup?.id || "") });

/** The start request body. */
export function startBodyOf({ termsAccepted = false, resumeConsent = false, language = "" } = {}) {
  const body = { termsAccepted: termsAccepted === true, resumeConsent: resumeConsent === true };
  if (text(language)) body[START_LANGUAGE_FIELD] = text(language);
  return body;
}

/**
 * The first thing that still blocks Join now, as a short sentence (or "" when nothing does).
 * `state`: { termsAccepted, resumeProvided, resumeUploading, consent, proctoringAck }. A resume still
 * uploading counts: Join waits for it to finish.
 */
export function joinBlockerOf(setup, state = {}) {
  if (setup?.resume?.mode === "required" && !state.resumeProvided && !state.resumeUploading) return "Add your resume to join.";
  if (setup?.proctoring?.active && !state.proctoringAck) return "Confirm the proctoring rules to join.";
  if (setup?.terms?.required && !state.termsAccepted) return "Accept the interview terms to join.";
  if (!state.consent) return "Tick the consent box to join.";
  return "";
}

const RESUME_COPY = {
  RESUME_BUILDER_EMPTY: "Your Resume Builder resume is empty. Add your details in the Resume Builder, or upload a file instead.",
  RESUME_DOCX_UNSUPPORTED: "Word files can't be read yet. Save your resume as a PDF (File → Save as → PDF) and upload that.",
  RESUME_TYPE_UNSUPPORTED: "Upload your resume as a PDF or a plain-text (.txt) file.",
  NOT_A_RESUME: "This file doesn't look like a resume. Check that you picked the right file and try again.",
  RESUME_UNREADABLE: "No text could be read from this file. Scanned PDFs often fail; try a text-based PDF or a .txt file.",
  RESUME_TOO_LARGE: "This file is larger than 5 MB. Upload a smaller PDF or a .txt file.",
  RATE_LIMITED: "Too many resume uploads in a short time. Wait a few minutes and try again.",
  AI_UNAVAILABLE: "Your resume couldn't be read right now. Please try again in a minute.",
  RESUME_SOURCE_DISABLED: "This interview doesn't accept that kind of resume. Use the other option.",
  RESUME_SOURCE_REQUIRED: "Choose your Resume Builder resume or upload a file.",
  RESUME_FILE_REQUIRED: "Choose a PDF or .txt file to upload.",
  RESUME_UPLOAD_INVALID: "Upload one PDF or .txt file at a time.",
  RESUME_NOT_USED: "This interview doesn't use a resume, so there is nothing to add.",
  RESUME_NOT_PROVIDED: "No resume has been added for this interview yet.",
};

/** A resume API failure as { code, message, builderLink }. `builderLink`: offer the Resume Builder page. */
export function resumeErrorOf(cause) {
  const code = cause?.response?.data?.code || cause?.code || "";
  const status = cause?.response?.status;
  let message = RESUME_COPY[code];
  if (!message && status === 0) message = "The upload did not finish. Check your connection and try again.";
  if (!message && status === 413) message = RESUME_COPY.RESUME_TOO_LARGE;
  if (!message && status === 429) message = RESUME_COPY.RATE_LIMITED;
  if (!message) message = cause?.message && !/^\{/.test(cause.message) ? cause.message : "Your resume could not be saved. Please try again.";
  return { code, message, builderLink: code === "RESUME_BUILDER_EMPTY" };
}

/** A problem with a picked file before it is sent ("" when it can be uploaded). */
export function resumeFileProblem(file) {
  if (!file) return RESUME_COPY.RESUME_FILE_REQUIRED;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  if (/\.(docx?|odt|rtf|pages)$/.test(name) || /msword|officedocument|opendocument/.test(type)) return RESUME_COPY.RESUME_DOCX_UNSUPPORTED;
  if (!/\.(pdf|txt)$/.test(name) && type !== "application/pdf" && type !== "text/plain") return RESUME_COPY.RESUME_TYPE_UNSUPPORTED;
  if (file.size > RESUME_MAX_BYTES) return RESUME_COPY.RESUME_TOO_LARGE;
  if (file.size === 0) return "This file is empty. Pick your resume file again.";
  return "";
}

/** A start refusal as a sentence for the lobby. */
export function startErrorOf(cause) {
  const code = cause?.response?.data?.code || cause?.code || "";
  const copy = {
    TERMS_REQUIRED: "Please read and accept the interview terms, then join again.",
    RESUME_REQUIRED: "This interview needs your resume. Add it in the Background step, then join again.",
    LANGUAGE_NOT_ALLOWED: "That language is no longer offered for this interview. Pick another one and join again.",
    AI_UNAVAILABLE: "ANVI couldn't prepare this interview right now. Please try again in a minute.",
    RATE_LIMITED: "Too many attempts in a short time. Wait a minute and try again.",
  }[code];
  return copy || cause?.message || "The interview could not be started. Please try again.";
}

/** "Resume Builder" / "uploaded file" for a stored resume's source. */
export const resumeSourceLabel = (source) => (source === "builder" ? "your Resume Builder resume" : source === "upload" ? "your uploaded file" : "your resume");
