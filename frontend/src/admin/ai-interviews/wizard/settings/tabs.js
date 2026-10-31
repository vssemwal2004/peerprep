import { rubricTotal, stepErrors } from "../steps.js";
import { hasResumeQuestions, proctoringIsEmpty, readConduct, readProctoring, readResume } from "./model.js";
import { readDuration } from "./hybrid.js";

// The ANVI settings step is split into these sub-tabs. The selected one is kept in ?tab=. How ANVI runs the
// conversation (the intro and closing lines, pauses, nudges, voice commands, the ground rules) is fixed.
export const SETTINGS_TABS = Object.freeze([
  { id: "voice", short: "Voice & speed", label: "Voice & speed", description: "ANVI speaks in one voice, in Indian English. Choose how fast she speaks and preview it." },
  { id: "candidate", short: "Candidate", label: "Candidate setup", description: "What students share and accept before the interview starts." },
  { id: "proctoring", short: "Proctoring", label: "Proctoring", description: "Browser and camera checks while students take the interview." },
  { id: "scoring", short: "Scoring", label: "Scoring", description: "The criteria ANVI rates each answer against in the report." },
  { id: "advanced", short: "Advanced", label: "Advanced", description: "Interview length, question audio and the default answer time." },
]);
export const DEFAULT_SETTINGS_TAB = "voice";
export const settingsTabId = (id) => `anvi-settings-tab-${id}`;
export const settingsPanelId = (id) => `anvi-settings-panel-${id}`;

// data-field keys (and Fix-link fields from describeIssue) and the tab that renders them.
const FIELD_TABS = Object.freeze({
  voice: "voice",
  voiceLanguage: "voice",
  language: "voice",
  avatar: "voice",
  persona: "voice",
  speechRate: "voice",
  introduction: "voice",
  closing: "voice",
  turns: "voice",
  warmup: "voice",
  conduct: "candidate",
  resume: "candidate",
  resumeSources: "candidate",
  resumeFollowUps: "candidate",
  terms: "candidate",
  proctoring: "proctoring",
  rubric: "scoring",
  interviewer: "advanced",
  answerTime: "advanced",
  followUps: "advanced",
  duration: "advanced",
  durationMinutes: "advanced",
  hybrid: "advanced",
  audio: "advanced",
});

// Old links: Personality was merged into Voice & speed; the Conversation settings are fixed now.
const TAB_ALIASES = Object.freeze({ personality: "voice", conversation: "voice" });
export const resolveSettingsTab = (value) =>
  SETTINGS_TABS.some((tab) => tab.id === value) ? value : TAB_ALIASES[value] || null;
export const tabForField = (field) =>
  FIELD_TABS[field] || (typeof field === "string" && field.startsWith("proctoring") ? "proctoring" : null);
// The tab of the first listed field that belongs to a tab, or null.
export const tabForFields = (fields = []) => (fields || []).map(tabForField).find(Boolean) || null;

// "Normal speed", "1.10× speed".
export const speechRateLabel = (value) => {
  const rate = Number(value);
  return !Number.isFinite(rate) || Math.abs(rate - 1) < 0.001 ? "Normal speed" : `${rate.toFixed(2)}× speed`;
};

/**
 * Per-tab status: { summary: string, badge: { text, tone: "on" | "warn" } | null, error: boolean }.
 * `error` marks a tab holding something that blocks Continue or publishing.
 */
export function settingsTabStatus(data = {}, { errors = {}, interviewer } = {}) {
  const errorTabs = new Set(
    [...Object.keys(errors || {}), ...Object.keys(stepErrors("anvi", data))].map(tabForField).filter(Boolean),
  );
  const resume = readResume(data);
  if (resume.mode === "none" && hasResumeQuestions(data)) errorTabs.add("candidate");
  if (!data.interviewer && interviewer?.error) errorTabs.add("advanced");

  const conduct = readConduct(data);
  const proctoring = readProctoring(data);
  const rubric = data.rubric || [];
  const hasTerms = Boolean(conduct.termsText.trim());
  const rubricOk = rubric.length > 0 && Math.abs(rubricTotal(rubric) - 100) <= 0.001;
  const resumeText = { required: "Resume required", optional: "Resume optional", none: "No resume" }[resume.mode];
  const minutes = readDuration(data);
  // A one-line summary for each tab (its tooltip).
  const summaries = {
    voice: `ANVI's voice · ${speechRateLabel(data.anvi?.persona?.speechRate)}`,
    candidate: `${resumeText} · ${hasTerms ? "terms shown" : "no terms"}`,
    proctoring: !proctoring.enabled
      ? "AI proctoring off"
      : proctoringIsEmpty(proctoring)
        ? "AI proctoring on, but every check is off"
        : `AI proctoring on${proctoring.ai.enabled ? " with camera checks" : ""}`,
    scoring: rubricOk
      ? `${rubric.length} ${rubric.length === 1 ? "criterion" : "criteria"}`
      : "Rubric weights must total 100%",
    advanced: minutes ? `${minutes}-minute interview` : "No fixed length",
  };
  // A visible badge only where on/off matters at a glance.
  const badges = {
    proctoring: !proctoring.enabled
      ? null
      : proctoringIsEmpty(proctoring)
        ? { text: "No checks", tone: "warn" }
        : { text: "On", tone: "on" },
  };
  return Object.fromEntries(
    SETTINGS_TABS.map(({ id }) => [id, { summary: summaries[id], badge: badges[id] || null, error: errorTabs.has(id) }]),
  );
}
