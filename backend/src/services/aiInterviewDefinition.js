import sanitizeHtml from "sanitize-html";

export const LIMITS = Object.freeze({
  sections: 20,
  groups: 10,
  questions: 200,
  subquestions: 10,
  plannedQuestionsPerGroup: 50,
  followUps: 5,
  marks: 100,
  competency: 60,
  generateQuestions: 20,
  text: 12000,
  payload: 750000,
});
export const ANVI_DEFAULTS = Object.freeze({
  persona: Object.freeze({
    tone: "warm",
    pace: "normal",
    acknowledgements: true,
    introduction: "",
    closing: "",
  }),
  turns: Object.freeze({
    silenceSeconds: 2,
    nudgeSeconds: 45,
    maxNudges: 2,
    voiceCommands: true,
  }),
  // requireTermsAcceptance defaults to true once termsText is non-empty; without terms there is nothing to accept.
  conduct: Object.freeze({
    endByVoice: false,
    finishAllQuestions: true,
    noPersonalQuestions: true,
    termsText: "",
    requireTermsAcceptance: false,
  }),
  warmup: Object.freeze({
    enabled: true,
    icebreakers: 2,
    tellMeAboutYourself: true,
    scored: false,
  }),
  // mode defaults to "required" when the interview has resume questions or rules.resume is "required",
  // otherwise to rules.resume ("none" for older definitions).
  resume: Object.freeze({
    mode: "none",
    sources: Object.freeze(["builder", "upload"]),
    questionCount: 2,
  }),
  // primary defaults to rules.language (older definitions). studentChoice: other languages a student may pick
  // in the lobby (empty: fixed). strict: ANVI never changes language. onOtherLanguage: what ANVI does when the
  // candidate answers in another language ("remind" once per question, "remind_and_flag" also flags the answer).
  language: Object.freeze({
    primary: "English",
    studentChoice: Object.freeze([]),
    strict: true,
    onOtherLanguage: "remind_and_flag",
  }),
  // name "" uses the server's Live voice (ANVI_LIVE_VOICE, Aoede by default); languageCode "" follows the
  // interview language (English en-IN, Hindi hi-IN, Hinglish unset).
  voice: Object.freeze({ name: "", languageCode: "" }),
  // A fixed set of reusable R2 video loops can visually represent ANVI in the
  // room without generating a new video for every response.
  avatar: Object.freeze({ enabled: false, avatarId: "" }),
  // Off unless the admin turns it on. fullscreen "required": joining needs fullscreen and each exit is a
  // violation; pauseOutsideFullscreen (with it) holds the interview while out of fullscreen or the tab is hidden.
  // tabSwitch "record" logs silently, "warn" also warns the student; refresh "record" logs a rejoin. The block*
  // options stop right-click, copy/paste and shortcuts in the room (attempts are logged, never violations).
  // The first `warnings` violations warn the student; at maxViolations (0: no limit) onLimit "end" ends the
  // interview, "flag" only flags it. Scores are never penalised.
  // `ai`: camera checks run in the browser by the assessment ProctoringManager (same fields, defaults and ranges
  // as Assessment settings.aiProctoring); only with proctoring enabled. No video or frame is ever uploaded.
  proctoring: Object.freeze({
    enabled: false, fullscreen: "off", pauseOutsideFullscreen: true, tabSwitch: "off", refresh: "off",
    blockRightClick: true, blockCopyPaste: true, blockShortcuts: true, warnings: 3, maxViolations: 0, onLimit: "end",
    ai: Object.freeze({
      enabled: false, detectMobile: true, detectMultiplePersons: true, detectNoFace: true, detectFaceOutOfFrame: true,
      faceOutOfFrameGraceSec: 10, detectLookingAway: true, detectionIntervalMs: 500, ignoreLimit: 5, violationCooldownSec: 20,
      criticalAutoFlag: true,
    }),
  }),
});
// The numeric ranges of Assessment aiProctoringSettingsSchema (src/models/Assessment.js), as [min, max].
export const AI_PROCTORING_RANGES = Object.freeze({
  faceOutOfFrameGraceSec: Object.freeze([3, 60]),
  detectionIntervalMs: Object.freeze([500, 5000]),
  ignoreLimit: Object.freeze([0, 50]),
  violationCooldownSec: Object.freeze([5, 120]),
});
export const AI_PROCTORING_FLAGS = Object.freeze([
  "enabled", "detectMobile", "detectMultiplePersons", "detectNoFace", "detectFaceOutOfFrame", "detectLookingAway", "criticalAutoFlag",
]);
export const PROCTOR_FULLSCREEN = Object.freeze(["off", "required"]);
export const PROCTOR_TAB_SWITCH = Object.freeze(["off", "record", "warn"]);
export const PROCTOR_REFRESH = Object.freeze(["off", "record"]);
export const PROCTOR_ON_LIMIT = Object.freeze(["end", "flag"]);
export const PROCTOR_MAX_VIOLATIONS = 20;
export const PROCTOR_MAX_WARNINGS = 10;
// Gemini Live prebuilt voices an admin may pick for ANVI, and the accent locales the Live API accepted.
export const ANVI_VOICES = Object.freeze(["Aoede", "Kore", "Leda", "Zephyr", "Puck", "Charon"]);
export const ANVI_VOICE_LOCALES = Object.freeze(["", "en-IN", "hi-IN"]);
export const INTERVIEW_LANGUAGES = Object.freeze(["English", "Hindi", "Hinglish"]);
// DECISIONS #0 (2026-10-23): every ANVI interview is conducted in English. Hindi and Hinglish are still
// accepted as input (older editors and snapshots) but are never stored or used.
export const ANVI_LANGUAGE = "English";
// Optional interview length (anvi.durationMinutes) and the questions a hybrid attempt of that length plans.
export const ANVI_DURATIONS = Object.freeze([10, 15, 30, 45, 60]);
export const DURATION_MAX_QUESTIONS = Object.freeze({ 10: 4, 15: 5, 30: 8, 45: 12, 60: 15 });
export const OTHER_LANGUAGE_ACTIONS = Object.freeze(["remind", "remind_and_flag", "ignore"]);
// Live (ANVI-generated) topics share an interview's live question pool by priority: High 3 : Medium 2 : Low 1.
export const TOPIC_PRIORITIES = Object.freeze(["high", "medium", "low"]);
export const PRIORITY_SHARES = Object.freeze({ high: 3, medium: 2, low: 1 });
export const DEFAULT_TOPIC_PRIORITY = "medium";
// Questions a live topic asks when neither its own count nor an interview pool says otherwise.
export const DEFAULT_LIVE_COUNT = 3;
export const priorityOf = (value) => (TOPIC_PRIORITIES.includes(value) ? value : DEFAULT_TOPIC_PRIORITY);

/**
 * Splits `total` questions over topics in priority order by their shares (largest remainder, ties to the
 * higher priority, then the earlier topic). When there are at least as many questions as topics, every topic
 * gets one; otherwise the lowest-priority topics get none. Returns one count per entry of `priorities`.
 */
export function priorityCounts(priorities, total) {
  const shares = (Array.isArray(priorities) ? priorities : []).map((p) => PRIORITY_SHARES[priorityOf(p)]);
  const pool = Math.max(0, Math.floor(Number(total) || 0));
  if (!shares.length || !pool) return shares.map(() => 0);
  const sum = shares.reduce((n, s) => n + s, 0);
  const quotas = shares.map((s) => (pool * s) / sum);
  const counts = quotas.map(Math.floor);
  const byRemainder = shares.map((_, i) => i).sort((a, b) =>
    quotas[b] - counts[b] - (quotas[a] - counts[a]) || shares[b] - shares[a] || a - b);
  for (let left = pool - counts.reduce((n, c) => n + c, 0), k = 0; left > 0; left -= 1, k += 1)
    counts[byRemainder[k % byRemainder.length]] += 1;
  if (pool >= shares.length) {
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i]) continue;
      // Take one from the topic furthest above its quota (ties: the lower priority, then the later topic).
      let donor = -1;
      for (let j = 0; j < counts.length; j += 1) {
        if (counts[j] < 2) continue;
        if (donor < 0) { donor = j; continue; }
        const over = counts[j] - quotas[j] - (counts[donor] - quotas[donor]);
        if (over > 1e-9 || (Math.abs(over) <= 1e-9 && (shares[j] < shares[donor] || (shares[j] === shares[donor] && j > donor)))) donor = j;
      }
      if (donor < 0) break;
      counts[donor] -= 1;
      counts[i] = 1;
    }
  }
  return counts;
}

const explicitCount = (value) =>
  Number.isInteger(value) && value >= 1 ? Math.min(value, LIMITS.plannedQuestionsPerGroup) : null;
const liveTotalOf = (data) => {
  const value = data?.anvi?.liveQuestionCount;
  return Number.isInteger(value) && value >= 1 ? Math.min(value, LIMITS.questions) : null;
};

/**
 * Questions per live topic (`groups[].source === "annu"`), as `{ [groupId]: count }`, in definition order.
 * A topic's own `annu.targetCount` wins. Topics without one share `anvi.liveQuestionCount` by priority;
 * without that pool they ask DEFAULT_LIVE_COUNT. Accepts raw (older) snapshots as well as normalized ones.
 */
export function liveTopicCounts(data) {
  const live = (data?.sections || []).flatMap((section) => (section?.groups || []).filter((group) => group?.source === "annu"));
  const total = liveTotalOf(data);
  const out = {};
  const pooled = [];
  for (const group of live) {
    const own = explicitCount(group.annu?.targetCount);
    if (own !== null) out[group.id] = own;
    else if (total !== null) pooled.push(group);
    else out[group.id] = DEFAULT_LIVE_COUNT;
  }
  const counts = priorityCounts(pooled.map((group) => group.priority), total);
  pooled.forEach((group, i) => { out[group.id] = counts[i]; });
  return out;
}
export const RESUME_MODES = Object.freeze(["none", "optional", "required"]);
export const RESUME_SOURCES = Object.freeze(["builder", "upload"]);
export const TERMS_LIMIT = 4000;
const hasResumeKind = (sections) =>
  (Array.isArray(sections) ? sections : []).some((section) =>
    (section?.groups || []).some((group) =>
      (group?.questions || []).some((question) => question?.kind === "resume"),
    ),
  );
/** The resume mode an interview gets when its ANVI settings do not choose one (older definitions). */
export function derivedResumeMode(data) {
  const ruled = RESUME_MODES.includes(data?.rules?.resume) ? data.rules.resume : "none";
  return hasResumeKind(data?.sections) || ruled === "required" ? "required" : ruled;
}
export const CAPABILITIES = Object.freeze({
  authoring: true,
  manualQuestions: true,
  annuSpecification: true,
  staticProfiles: true,
  questionGeneration: true,
  liveConversation: true,
  candidateAssignment: false,
  evaluation: true,
  limits: LIMITS,
});
export class AuthoringError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
const fail = (message) => {
  throw new AuthoringError(422, "VALIDATION_FAILED", message);
};
const object = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Configuration fields must be objects.");
  return value;
};
// Runs one field's validation so a failure names it ("anvi.proctoring.ai.detectionIntervalMs: Expected ...");
// the path is also in `details.field`.
const field = (path, work) => {
  try {
    return work();
  } catch (error) {
    if (error instanceof AuthoringError && error.status === 422 && !error.details?.field)
      throw new AuthoringError(422, error.code, `${path}: ${error.message}`, { ...error.details, field: path });
    throw error;
  }
};
export const cleanText = (value, max = LIMITS.text) => {
  if (typeof value !== "string") fail("Text fields must contain text.");
  if (value.length > max) fail(`Text cannot exceed ${max} characters.`);
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
};
export const normalizedName = (name) =>
  cleanText(name, 120)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
const text = (value, max) => cleanText(value ?? "", max);
const choice = (value, choices, fallback) => {
  const v = value ?? fallback;
  if (!choices.includes(v)) fail(`Invalid option: ${String(v).slice(0, 40)}`);
  return v;
};
const integer = (value, min, max, fallback) => {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v < min || v > max)
    fail(`Expected a whole number between ${min} and ${max}.`);
  return v;
};
const list = (value, max) => {
  if (!Array.isArray(value) || value.length > max)
    fail(`Expected a list of at most ${max} items.`);
  return value;
};
const words = (value) => [
  ...new Set(
    list(value ?? [], 30)
      .map((v) => text(v, 80))
      .filter(Boolean),
  ),
];
const bool = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") fail("Expected true or false.");
  return value;
};
// Turn settings are clamped into range so an older or hand-edited value still produces a usable interview.
const clamped = (value, min, max, fallback, step = 1) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(`Expected a number between ${min} and ${max}.`);
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
};
const difficulty = (v) => choice(v, ["", "easy", "medium", "hard"], "");
const weight = (v) => {
  if (!Number.isFinite(v) || v < 0 || v > 100)
    fail("Weights must be between 0 and 100.");
  return Math.round(v * 100) / 100;
};
export function normalizeRules(input = {}, overrides = false) {
  object(input);
  const out = {};
  for (const [key, max, fallback] of [
    ["preparationSeconds", 600, 15],
    ["responseSeconds", 1800, 120],
    ["minimumSeconds", 1800, 0],
    ["replays", 7, 1],
  ]) {
    if (overrides && input[key] === undefined) continue;
    out[key] =
      (key === "preparationSeconds" || key === "responseSeconds") &&
      input[key] === null
        ? null
        : integer(input[key], 0, max, fallback);
  }
  if (!overrides) {
    out.mode = choice(input.mode, ["mock", "guided"], "mock");
    out.language = choice(input.language, INTERVIEW_LANGUAGES, "English");
    out.resume = choice(input.resume, ["none", "optional", "required"], "none");
    out.documents = choice(
      input.documents,
      ["none", "optional", "required"],
      "none",
    );
  }
  return out;
}
export function normalizeProfile(input = {}) {
  object(input);
  return {
    name: text(input.name, 120),
    displayName: text(input.displayName, 120),
    avatar: choice(input.avatar, ["annu", "orbit", "spark"], "annu"),
    tone: choice(
      input.tone,
      ["Professional", "Friendly", "Neutral"],
      "Professional",
    ),
    // Only a default for new interviews; the interview's own anvi.language decides at runtime.
    language: choice(input.language, INTERVIEW_LANGUAGES, "English"),
    introduction: text(input.introduction, 2000),
    closing: text(input.closing, 2000),
  };
}
// Camera AI proctoring settings (`anvi.proctoring.ai`): booleans, and numbers inside the Assessment ranges.
function normalizeAiProctoring(input) {
  const path = "anvi.proctoring.ai";
  const ai = field(path, () => object(input ?? {}));
  const d = ANVI_DEFAULTS.proctoring.ai;
  const out = {};
  for (const key of AI_PROCTORING_FLAGS) out[key] = field(`${path}.${key}`, () => bool(ai[key], d[key]));
  for (const [key, [min, max]] of Object.entries(AI_PROCTORING_RANGES)) {
    const value = ai[key] ?? d[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
      field(`${path}.${key}`, () => fail(`Expected a number between ${min} and ${max}.`));
    out[key] = value;
  }
  return out;
}
// The interview's live question pool (`anvi.liveQuestionCount`): null (no pool) or 1..LIMITS.questions.
const liveQuestionCount = (value) =>
  value === undefined || value === null ? null : integer(value, 1, LIMITS.questions, null);
// Hybrid runtime options (`anvi.hybrid`), stored only when the admin sent them. conversationalSectionIds
// are checked against the sections by normalizeDefinition.
function normalizeHybrid(input) {
  const hybrid = field("anvi.hybrid", () => object(input));
  return {
    allowLiveWarmup: field("anvi.hybrid.allowLiveWarmup", () => bool(hybrid.allowLiveWarmup, false)),
    conversationalSectionIds: field("anvi.hybrid.conversationalSectionIds", () => [
      ...new Set(list(hybrid.conversationalSectionIds ?? [], LIMITS.sections).map((value) => text(value, 80)).filter(Boolean)),
    ]),
    allowStudentLiveMode: field("anvi.hybrid.allowStudentLiveMode", () => bool(hybrid.allowStudentLiveMode, false)),
  };
}
// ANVI persona and turn-taking. Missing keys mean defaults; a non-empty introduction or
// closing overrides the interviewer profile's script at runtime. The language is always English
// (DECISIONS #0): language input is still validated, then replaced by the English-only default.
// `language` (the older rules.language default) is accepted for callers and ignored.
export function normalizeAnvi(input = {}, { resumeMode = ANVI_DEFAULTS.resume.mode, language: defaultLanguage = ANVI_DEFAULTS.language.primary } = {}) {
  object(input);
  const persona = object(input.persona ?? {});
  const turns = object(input.turns ?? {});
  const conduct = object(input.conduct ?? {});
  const warmup = object(input.warmup ?? {});
  const resume = object(input.resume ?? {});
  const language = object(input.language ?? {});
  const voice = object(input.voice ?? {});
  const avatar = object(input.avatar ?? {});
  const proctoring = field("anvi.proctoring", () => object(input.proctoring ?? {}));
  const pr = ANVI_DEFAULTS.proctoring;
  // A proctoring field's 422 names its path (the admin settings map it to the control).
  const pf = (key, work) => field(`anvi.proctoring.${key}`, () => work(proctoring[key]));
  const p = ANVI_DEFAULTS.persona,
    t = ANVI_DEFAULTS.turns,
    c = ANVI_DEFAULTS.conduct,
    w = ANVI_DEFAULTS.warmup,
    r = ANVI_DEFAULTS.resume,
    l = ANVI_DEFAULTS.language;
  // Validated only: the stored language is always English (DECISIONS #0).
  choice(language.primary, INTERVIEW_LANGUAGES, INTERVIEW_LANGUAGES.includes(defaultLanguage) ? defaultLanguage : l.primary);
  if (language.studentChoice !== undefined && language.studentChoice !== null)
    list(language.studentChoice, INTERVIEW_LANGUAGES.length).forEach((value) => choice(value, INTERVIEW_LANGUAGES, value));
  bool(language.strict, l.strict);
  choice(language.onOtherLanguage, OTHER_LANGUAGE_ACTIONS, l.onOtherLanguage);
  const termsText = text(conduct.termsText, TERMS_LIMIT);
  const avatarEnabled = bool(avatar.enabled, ANVI_DEFAULTS.avatar.enabled);
  const avatarId = text(avatar.avatarId, 64);
  if (avatarEnabled && !/^[a-f0-9]{24}$/i.test(avatarId)) fail("Choose a ready video avatar when the ANVI video avatar is enabled.");
  const sources =
    resume.sources === undefined || resume.sources === null
      ? [...r.sources]
      : [
          ...new Set(
            list(resume.sources, RESUME_SOURCES.length).map((source) =>
              choice(source, RESUME_SOURCES, source),
            ),
          ),
        ];
  if (!sources.length) fail("Allow at least one resume source.");
  const durationMinutes = input.durationMinutes === undefined || input.durationMinutes === null
    ? null
    : field("anvi.durationMinutes", () => choice(input.durationMinutes, ANVI_DURATIONS, null));
  return {
    liveQuestionCount: liveQuestionCount(input.liveQuestionCount),
    ...(durationMinutes ? { durationMinutes } : {}),
    ...(input.hybrid === undefined || input.hybrid === null ? {} : { hybrid: normalizeHybrid(input.hybrid) }),
    persona: {
      tone: choice(persona.tone, ["warm", "formal", "friendly"], p.tone),
      pace: choice(persona.pace, ["slow", "normal", "brisk"], p.pace),
      acknowledgements: bool(persona.acknowledgements, p.acknowledgements),
      introduction: text(persona.introduction, 2000),
      closing: text(persona.closing, 2000),
    },
    turns: {
      silenceSeconds: clamped(turns.silenceSeconds, 1.5, 4, t.silenceSeconds, 0.5),
      nudgeSeconds: clamped(turns.nudgeSeconds, 15, 120, t.nudgeSeconds),
      maxNudges: clamped(turns.maxNudges, 0, 3, t.maxNudges),
      voiceCommands: bool(turns.voiceCommands, t.voiceCommands),
    },
    conduct: {
      endByVoice: bool(conduct.endByVoice, c.endByVoice),
      finishAllQuestions: bool(conduct.finishAllQuestions, c.finishAllQuestions),
      noPersonalQuestions: bool(conduct.noPersonalQuestions, c.noPersonalQuestions),
      termsText,
      requireTermsAcceptance: termsText ? bool(conduct.requireTermsAcceptance, true) : false,
    },
    warmup: {
      enabled: bool(warmup.enabled, w.enabled),
      icebreakers: clamped(warmup.icebreakers, 0, 3, w.icebreakers),
      tellMeAboutYourself: bool(warmup.tellMeAboutYourself, w.tellMeAboutYourself),
      scored: bool(warmup.scored, w.scored),
    },
    resume: {
      mode: choice(resume.mode, RESUME_MODES, RESUME_MODES.includes(resumeMode) ? resumeMode : r.mode),
      sources,
      questionCount: clamped(resume.questionCount, 0, 5, r.questionCount),
    },
    language: englishOnlyLanguage(),
    voice: {
      name: choice(voice.name || "", ["", ...ANVI_VOICES], ANVI_DEFAULTS.voice.name),
      languageCode: choice(voice.languageCode || "", ANVI_VOICE_LOCALES, ANVI_DEFAULTS.voice.languageCode),
    },
    avatar: {
      enabled: avatarEnabled,
      avatarId,
    },
    // The checks are kept while proctoring is off, so switching it back on restores the admin's choices.
    proctoring: {
      enabled: pf("enabled", (v) => bool(v, pr.enabled)),
      fullscreen: pf("fullscreen", (v) => choice(v, PROCTOR_FULLSCREEN, pr.fullscreen)),
      pauseOutsideFullscreen: pf("pauseOutsideFullscreen", (v) => bool(v, pr.pauseOutsideFullscreen)),
      tabSwitch: pf("tabSwitch", (v) => choice(v, PROCTOR_TAB_SWITCH, pr.tabSwitch)),
      refresh: pf("refresh", (v) => choice(v, PROCTOR_REFRESH, pr.refresh)),
      blockRightClick: pf("blockRightClick", (v) => bool(v, pr.blockRightClick)),
      blockCopyPaste: pf("blockCopyPaste", (v) => bool(v, pr.blockCopyPaste)),
      blockShortcuts: pf("blockShortcuts", (v) => bool(v, pr.blockShortcuts)),
      warnings: pf("warnings", (v) => integer(v, 0, PROCTOR_MAX_WARNINGS, pr.warnings)),
      maxViolations: pf("maxViolations", (v) => integer(v, 0, PROCTOR_MAX_VIOLATIONS, pr.maxViolations)),
      onLimit: pf("onLimit", (v) => choice(v, PROCTOR_ON_LIMIT, pr.onLimit)),
      ai: normalizeAiProctoring(proctoring.ai),
    },
  };
}
/** The one interview language setting (DECISIONS #0): English, no student choice, strict, remind and flag. */
export const englishOnlyLanguage = () => ({ ...ANVI_DEFAULTS.language, primary: ANVI_LANGUAGE, studentChoice: [] });
/** The planned-question ceiling for a duration bucket, or null for a duration outside the table. */
export const durationMaxQuestions = (minutes) => DURATION_MAX_QUESTIONS[minutes] ?? null;
/** The languages a student may start in: the primary language first, then the admin's extra choices. */
export const interviewLanguageChoices = (language) => [language.primary, ...language.studentChoice];
const provenance = (value) => {
  if (!value || typeof value !== "object") return null;
  if (value.libraryQuestionId)
    return {
      libraryQuestionId: text(value.libraryQuestionId, 80),
      importedAt: text(value.importedAt, 80),
    };
  if (value.generated === true)
    return { generated: true, generatedAt: text(value.generatedAt, 80) };
  return null;
};
// Callers saving an edit still pass `{ previous }`; it is no longer read, since the language is fixed (DECISIONS #0).
export function normalizeDefinition(input) {
  object(input);
  if (
    !input ||
    typeof input !== "object" ||
    JSON.stringify(input).length > LIMITS.payload
  )
    fail("Interview configuration is too large or invalid.");
  const ids = new Set();
  const id = (value) => {
    if (
      typeof value !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(value) ||
      ids.has(value)
    )
      fail(
        "Every section, group and question needs a unique valid identifier.",
      );
    ids.add(value);
    return value;
  };
  let count = 0;
  // The live pool counts once towards the question limit, as soon as a topic draws from it.
  const livePool = liveQuestionCount(
    input.anvi && typeof input.anvi === "object" ? input.anvi.liveQuestionCount : undefined,
  );
  let pooledTopics = false;
  const questions = (items) =>
    list(items ?? [], LIMITS.questions).map((q) => {
      object(q);
      count += q.kind === "resume" ? integer(q.resumeCount, 1, LIMITS.plannedQuestionsPerGroup, 1) : 1;
      if (count > LIMITS.questions)
        fail("Too many questions in this interview.");
      return {
        id: id(q.id),
        kind: choice(q.kind, ["specific", "topic", "resume"], "specific"),
        prompt: text(q.prompt),
        resumeCount: integer(q.resumeCount, 1, LIMITS.plannedQuestionsPerGroup, 1),
        maxFollowUps: integer(q.maxFollowUps, 0, LIMITS.followUps, 0),
        context: text(q.context),
        difficulty: difficulty(q.difficulty),
        expectedAnswer: text(q.expectedAnswer),
        marks: integer(q.marks, 1, LIMITS.marks, 10),
        competency: text(q.competency, LIMITS.competency),
        skippable: bool(q.skippable, true),
        tags: words(q.tags),
        ruleOverrides: normalizeRules(q.ruleOverrides, true),
        subquestions: list(q.subquestions ?? [], LIMITS.subquestions).map((s) => ({
          id: id(object(s).id),
          prompt: text(s.prompt),
        })),
        followUps: list(q.followUps ?? [], LIMITS.followUps).map((f) => ({
          id: id(object(f).id),
          prompt: text(f.prompt),
          expectedAnswer: text(f.expectedAnswer),
          ruleOverrides: normalizeRules(f.ruleOverrides, true),
        })),
        provenance: provenance(q.provenance),
      };
    });
  const out = {
    title: text(input.title, 160),
    description: text(input.description),
    role: text(input.role, 120),
    companyId: text(input.companyId, 80),
    companyName: text(input.companyName, 120),
    experience: choice(
      input.experience,
      ["", "fresher", "junior", "mid", "senior"],
      "",
    ),
    difficulty: difficulty(input.difficulty),
    sections: list(input.sections ?? [], LIMITS.sections).map((s) => ({
      id: id(object(s).id),
      name: text(s.name, 120),
      category: choice(
        s.category,
        [
          "Technical",
          "Behavioral",
          "Communication",
          "Domain",
          "Situational",
          "Custom",
        ],
        "Technical",
      ),
      instructions: text(s.instructions),
      weight: weight(s.weight ?? 0),
      ruleOverrides: normalizeRules(s.ruleOverrides, true),
      groups: list(s.groups ?? [], LIMITS.groups).map((g) => {
        object(g);
        const source = choice(g.source, ["manual", "annu"], "manual");
        if (
          (source === "manual" && g.annu != null) ||
          (source === "annu" && g.questions?.length)
        )
          fail("A group can have only one active question source.");
        const base = {
          id: id(g.id),
          name: text(g.name, 120),
          source,
          weight: weight(g.weight ?? 0),
          difficulty: difficulty(g.difficulty),
          shuffle: Boolean(g.shuffle),
          ruleOverrides: normalizeRules(g.ruleOverrides, true),
        };
        if (source === "manual")
          return { ...base, questions: questions(g.questions) };
        const a = object(g.annu ?? {});
        // Without its own count, a topic shares the interview's live pool by priority (when there is one).
        const pooled = livePool !== null && (a.targetCount === undefined || a.targetCount === null);
        const targetCount = pooled
          ? null
          : integer(a.targetCount ?? undefined, 1, LIMITS.plannedQuestionsPerGroup, DEFAULT_LIVE_COUNT);
        if (pooled) pooledTopics = true;
        else count += targetCount;
        if (count + (pooledTopics ? livePool : 0) > LIMITS.questions)
          fail("Too many authored or planned questions.");
        return {
          ...base,
          priority: choice(g.priority, TOPIC_PRIORITIES, DEFAULT_TOPIC_PRIORITY),
          annu: {
            requirements: text(a.requirements),
            skills: words(a.skills),
            exclusions: text(a.exclusions, 2000),
            targetCount,
            maxFollowUps: integer(a.maxFollowUps, 0, LIMITS.followUps, 0),
          },
        };
      }),
    })),
    interviewer: input.interviewer
      ? {
          profileId: text(input.interviewer.profileId, 80),
          profileRevision: integer(
            input.interviewer.profileRevision,
            1,
            Number.MAX_SAFE_INTEGER,
            1,
          ),
          ...normalizeProfile(input.interviewer),
        }
      : null,
    rules: normalizeRules(input.rules),
    rubric: list(input.rubric ?? [], 12).map((r) => ({
      id: id(object(r).id),
      name: text(r.name, 120),
      description: text(r.description, 2000),
      weight: weight(r.weight ?? 0),
    })),
  };
  if (count + (pooledTopics ? livePool : 0) > LIMITS.questions)
    fail("Too many authored or planned questions.");
  // The resume mode defaults from the questions and rules, so it is settled after both.
  // anvi.language is the interview language and rules.language mirrors it for older readers; both are
  // always English (DECISIONS #0), whatever an older editor sends.
  out.anvi = normalizeAnvi(object(input.anvi ?? {}), { resumeMode: derivedResumeMode(out) });
  out.rules.language = out.anvi.language.primary;
  // Conversational (Live) sections must exist in this definition.
  if (out.anvi.hybrid) {
    const sectionIds = new Set(out.sections.map((section) => section.id));
    out.anvi.hybrid.conversationalSectionIds = out.anvi.hybrid.conversationalSectionIds.filter((sectionId) => sectionIds.has(sectionId));
  }
  if (!out.title) fail("Interview title is required.");
  return out;
}
export function inspectDefinition(d) {
  const issues = [];
  const add = (path, message) => issues.push({ path, message });
  const weights = (items, path) => {
    if (
      items.length &&
      Math.abs(items.reduce((n, x) => n + x.weight, 0) - 100) > 0.001
    )
      add(path, "Weights must total 100%.");
  };
  const timing = (rules, path, label = "") => {
    if (
      rules.responseSeconds !== null &&
      (rules.responseSeconds < 1 ||
        rules.minimumSeconds > rules.responseSeconds)
    )
      add(
        path,
        `${label ? `${label}: ` : ""}Response limit must be positive and at least the minimum response time.`,
      );
  };
  if (!d.role) add("basics", "Add a job role.");
  if (!d.experience) add("basics", "Select an experience level.");
  if (!d.difficulty) add("basics", "Select the default difficulty.");
  if (!d.sections.length) add("sections", "Add at least one section.");
  weights(d.sections, "sections");
  const summary = {
    sectionCount: d.sections.length,
    manualCount: 0,
    plannedCount: 0,
    followUpCount: 0,
    budgetSeconds: 0,
    unlimited: false,
    // Generated (ANVI-prompt) questions carry the default 10 marks each.
    totalMarks: 0,
    // Questions each live topic asks per student ({ [groupId]: count }), after the priority split.
    liveTopicCounts: liveTopicCounts(d),
    liveQuestionCount: liveTotalOf(d),
  };
  const budget = (rules, times = 1) => {
    if (rules.preparationSeconds === null || rules.responseSeconds === null)
      summary.unlimited = true;
    else
      summary.budgetSeconds +=
        (rules.preparationSeconds + rules.responseSeconds) * times;
  };
  timing(d.rules, "rules");
  for (const s of d.sections) {
    const path = `sections/${s.id}`;
    if (!s.name) add(path, "Name this section.");
    if (!s.groups.length) add(path, "Add a question group.");
    weights(s.groups, path);
    const sectionRules = { ...d.rules, ...s.ruleOverrides };
    timing(sectionRules, path);
    for (const g of s.groups) {
      const gp = `${path}/groups/${g.id}`;
      if (!g.name) add(gp, "Name this question group.");
      const rules = { ...sectionRules, ...g.ruleOverrides };
      timing(rules, gp);
      if (g.source === "annu") {
        if (!g.annu.requirements) add(gp, "Add requirements for ANVI.");
        const planned = summary.liveTopicCounts[g.id] || 0;
        if (!planned)
          add(gp, "This topic gets no questions: raise the live question total or give it a higher priority.");
        summary.plannedCount += planned;
        summary.totalMarks += planned * 10;
        const followups = planned * g.annu.maxFollowUps;
        summary.followUpCount += followups;
        budget(rules, planned + followups);
      } else {
        if (!g.questions.length) add(gp, "Add at least one question.");
        summary.manualCount += g.questions.reduce((n, q) => n + (q.kind === "resume" ? q.resumeCount : 1), 0);
        for (const [questionIndex, q] of g.questions.entries()) {
          const label = `Question ${questionIndex + 1}`;
          if (!q.prompt && q.kind !== "resume") add(gp, `${label}: Add the main question.`);
          q.subquestions.forEach((part, index) => {
            if (!part.prompt)
              add(gp, `${label}: Question part ${index + 1} is empty.`);
          });
          q.followUps.forEach((followUp, index) => {
            if (!followUp.prompt)
              add(gp, `${label}: Cross-question ${index + 1} is empty.`);
          });
          // The runtime plan caps each question's follow-up budget at LIMITS.followUps.
          if (q.followUps.length + q.maxFollowUps > LIMITS.followUps)
            add(
              gp,
              `${label}: Use at most ${LIMITS.followUps} follow-ups in total (cross-questions plus AI follow-ups).`,
            );
          const qr = { ...rules, ...q.ruleOverrides };
          timing(qr, gp, label);
          const mainCount = q.kind === "resume" ? q.resumeCount : 1;
          summary.totalMarks += (q.marks ?? 10) * mainCount;
          budget(qr, mainCount);
          summary.followUpCount += (q.followUps.length + q.maxFollowUps) * mainCount;
          budget(qr, q.maxFollowUps * mainCount);
          for (const [followUpIndex, f] of q.followUps.entries()) {
            const fr = { ...qr, ...f.ruleOverrides };
            timing(fr, gp, `${label}, cross-question ${followUpIndex + 1}`);
            budget(fr, mainCount);
          }
        }
      }
    }
  }
  const anvi = d.anvi || {};
  if (anvi.resume?.mode === "none" && hasResumeKind(d.sections))
    add(
      "interviewer",
      "Resume questions need a resume: set the resume requirement to optional or required.",
    );
  // A scored "Tell me about yourself" is a planned question; so are the resume questions when a resume is required.
  if (
    anvi.warmup?.enabled &&
    anvi.warmup.tellMeAboutYourself &&
    anvi.warmup.scored
  ) {
    summary.plannedCount += 1;
    summary.totalMarks += 10;
    budget(d.rules, 1);
  }
  if (anvi.resume?.mode === "required" && anvi.resume.questionCount) {
    const extra = anvi.resume.questionCount;
    summary.plannedCount += extra;
    summary.totalMarks += extra * 10;
    summary.followUpCount += extra;
    budget(d.rules, extra * 2);
  }
  // The interview language as students will see it: always "English only" (DECISIONS #0), also for a
  // stored definition from before that decision.
  const language = englishOnlyLanguage();
  summary.language = {
    primary: language.primary,
    choices: interviewLanguageChoices(language),
    strict: language.strict,
    onOtherLanguage: language.onOtherLanguage,
  };
  // An optional duration plans a fixed number of questions in hybrid attempts. A count outside that
  // duration's range is a warning only: the plan is trimmed (too many) or the interview ends early (too few).
  if (ANVI_DURATIONS.includes(anvi.durationMinutes)) {
    const minutes = anvi.durationMinutes;
    const max = durationMaxQuestions(minutes);
    const shorter = ANVI_DURATIONS.filter((value) => value < minutes).at(-1);
    const min = shorter ? durationMaxQuestions(shorter) + 1 : 1;
    const planned = summary.manualCount + summary.plannedCount;
    summary.durationMinutes = minutes;
    summary.durationQuestionRange = { min, max };
    summary.warnings = [];
    if (planned > max)
      summary.warnings.push({ path: "interviewer", code: "DURATION_TOO_MANY_QUESTIONS", message: `${planned} questions are planned, but a ${minutes}-minute interview asks at most ${max}. The later questions will be left out.` });
    else if (planned < min)
      summary.warnings.push({ path: "interviewer", code: "DURATION_TOO_FEW_QUESTIONS", message: `${planned} question${planned === 1 ? " is" : "s are"} planned; a ${minutes}-minute interview usually asks ${min} to ${max}, so it may end early.` });
  }
  // What students are told before they start (older definitions: off).
  summary.proctoring = { ...ANVI_DEFAULTS.proctoring, ...(anvi.proctoring || {}) };
  if (!d.interviewer?.displayName)
    add("interviewer", "Select an interviewer profile.");
  if (!d.rubric.length) add("rules", "Add evaluation criteria.");
  if (d.rubric.some((r) => !r.name))
    add("rules", "Name each evaluation criterion.");
  weights(d.rubric, "rules");
  return { complete: issues.length === 0, issues, summary };
}
export const literalSearch = (value) =>
  cleanText(value ?? "", 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
