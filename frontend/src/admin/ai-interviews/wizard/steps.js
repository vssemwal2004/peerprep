import { STEP_ALIASES, divisions } from "../definition.js";
import { isSimple, primaryLive, questionEntries } from "./structure.js";

export const STEPS = divisions;
export const stepIndex = (id) => STEPS.findIndex((step) => step.id === id);
export const resolveStep = (id) =>
  STEPS.some((step) => step.id === id) ? id : STEP_ALIASES[id] || null;

export const EXPERIENCE = [
  { value: "fresher", label: "Fresher" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
];
export const DIFFICULTY = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
export const LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Hindi", label: "Hindi" },
  { value: "Hinglish", label: "Hinglish" },
];
export const MODES = [
  {
    value: "guided",
    label: "Practice",
    detail: "Feedback and a report right after the interview.",
  },
  {
    value: "mock",
    label: "Mock interview",
    detail: "Realistic, with no hints during the interview.",
  },
];
export const TONES = [
  { value: "warm", label: "Warm" },
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
];
export const PACES = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "brisk", label: "Brisk" },
];
// Gemini Live prebuilt voices offered for ANVI (style words are Google's own descriptions).
export const VOICES = [
  { value: "Aoede", label: "Aoede", gender: "Female", style: "Breezy, natural", note: "Default" },
  { value: "Kore", label: "Kore", gender: "Female", style: "Firm, confident" },
  { value: "Leda", label: "Leda", gender: "Female", style: "Youthful, light" },
  { value: "Zephyr", label: "Zephyr", gender: "Female", style: "Bright, energetic" },
  { value: "Puck", label: "Puck", gender: "Male", style: "Upbeat, friendly" },
  { value: "Charon", label: "Charon", gender: "Male", style: "Informative, calm" },
];
// ANVI interviews are English only, spoken with an Indian accent (locale en-IN); nothing to choose.
export const voiceAccent = () => "Indian English";
// "Aoede · Indian English"
export const voiceSummary = (data = {}) =>
  `${labelOf(VOICES, data.anvi?.voice?.name, "Aoede")} · ${voiceAccent(data)}`;
// Answer-time presets in seconds; null is unlimited.
export const ANSWER_TIMES = [
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 180, label: "3 min" },
  { value: 300, label: "5 min" },
  { value: null, label: "Unlimited" },
];
export const labelOf = (options, value, fallback = "Not set") =>
  options.find((option) => option.value === value)?.label || fallback;
export const answerTimeLabel = (seconds) =>
  seconds === null
    ? "Unlimited"
    : ANSWER_TIMES.find((option) => option.value === seconds)?.label ||
      (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

const filled = (value) => typeof value === "string" && value.trim().length > 0;
export const rubricTotal = (rubric = []) =>
  Math.round(rubric.reduce((sum, r) => sum + (Number(r.weight) || 0), 0) * 100) /
  100;

// Field-level checks run when the admin presses Continue. Keys match the
// data-field attributes the step renders, so the first invalid one gets focus.
export function stepErrors(step, data) {
  const errors = {};
  if (step === "basics") {
    if (!filled(data.title)) errors.title = "Give this interview a name.";
    if (!filled(data.role)) errors.role = "Enter the job role this interview is for.";
    if (!data.experience) errors.experience = "Choose an experience level.";
    if (!data.difficulty) errors.difficulty = "Choose a difficulty.";
  }
  if (step === "questions") {
    const entries = questionEntries(data);
    const live = primaryLive(data);
    if (!entries.length && !live && isSimple(data))
      errors.questions =
        "Add a topic for ANVI, or add at least one question.";
    for (const entry of entries)
      if (entry.question.kind !== "resume" && !filled(entry.question.prompt))
        errors[`question:${entry.groupId}:${entry.index}`] =
          "Write the question, or delete this card.";
    if (live && isSimple(data) && !filled(live.annu?.requirements))
      errors.live = "Describe what ANVI should ask in the live questions.";
  }
  if (step === "anvi") {
    const rubric = data.rubric || [];
    if (!rubric.length) errors.rubric = "Add at least one scoring criterion.";
    else if (rubric.some((r) => !filled(r.name)))
      errors.rubric = "Name every scoring criterion.";
    else if (Math.abs(rubricTotal(rubric) - 100) > 0.001)
      errors.rubric = `Weights add up to ${rubricTotal(rubric)}%. They must total 100%.`;
  }
  return errors;
}

const BASICS = {
  "Add a job role.": ["role", "Add the job role this interview is for."],
  "Select an experience level.": ["experience", "Choose the experience level."],
  "Select the default difficulty.": ["difficulty", "Choose a difficulty."],
  "Add an interview title.": ["title", "Give the interview a name."],
};
const RULES = {
  "Add evaluation criteria.": "Add at least one scoring criterion.",
  "Name each evaluation criterion.": "Name every scoring criterion.",
  "Weights must total 100%.": "Scoring rubric weights must add up to 100%.",
};
const TIMING = /Response limit must be positive/;

// Turns a server validation issue into a friendly message plus where to fix it.
export function describeIssue(issue, data) {
  const { path = "", message = "" } = issue;
  if (path === "basics") {
    const [field, text] = BASICS[message] || ["title", message];
    return { step: "basics", field, message: text };
  }
  if (path === "interviewer" && /^Resume questions need a resume/.test(message))
    return {
      step: "anvi",
      field: "resume",
      message: "This interview has resume questions. In ANVI settings, set Resume to Optional or Required.",
    };
  if (path === "interviewer")
    return {
      step: "anvi",
      field: "interviewer",
      message: "Choose who conducts the interview: pick an interviewer profile.",
    };
  if (path === "rules") {
    if (TIMING.test(message))
      return {
        step: "anvi",
        field: "answerTime",
        message: "The default answer time must be longer than the minimum answer time.",
      };
    return { step: "anvi", field: "rubric", message: RULES[message] || message };
  }
  if (/^This topic gets no questions/.test(message))
    return {
      step: "questions",
      field: "livePool",
      message: "A topic gets no questions. Raise Questions per student or give that topic a higher priority.",
    };
  if (!path.startsWith("sections"))
    return { step: "review", field: null, message };
  const simple = isSimple(data);
  const [, sectionId, , groupId] = path.split("/");
  const section = data.sections?.find((s) => s.id === sectionId);
  const group = section?.groups?.find((g) => g.id === groupId);
  const advanced = (text) => ({
    step: "questions",
    field: "sections",
    advanced: true,
    message: text,
  });
  if (path === "sections")
    return message === "Add at least one section."
      ? { step: "questions", field: "questions", message: "Add at least one question." }
      : advanced("Section weights must add up to 100%.");
  if (!groupId) {
    if (message === "Add a question group.")
      return simple
        ? { step: "questions", field: "questions", message: "Add at least one question." }
        : advanced(`Add questions to the “${section?.name || "untitled"}” section.`);
    if (message === "Name this section.") return advanced("Name every section.");
    if (message === "Weights must total 100%.")
      return advanced(
        `Question group weights in “${section?.name || "a section"}” must add up to 100%.`,
      );
    return advanced(TIMING.test(message) ? "A section's answer time is shorter than its minimum." : message);
  }
  if (message === "Name this question group.")
    return advanced("Name every question group.");
  if (message === "Add requirements for ANVI.")
    return simple && primaryLive(data)?.id === groupId
      ? {
          step: "questions",
          field: "live",
          advanced: true,
          message: "Describe what ANVI should ask in the live questions.",
        }
      : advanced(`Describe what ANVI should ask in “${group?.name || "a live topic"}”.`);
  if (message === "Add at least one question.")
    return simple
      ? { step: "questions", field: "questions", message: "Add at least one question." }
      : advanced(`Add questions to “${group?.name || "a question group"}”.`);
  const match = /^Question (\d+)(?:, cross-question (\d+))?: (.*)$/.exec(message);
  if (match) {
    const index = Number(match[1]) - 1;
    const entry = questionEntries(data).find(
      (e) => e.groupId === groupId && e.index === index,
    );
    const label = `Question ${entry?.number ?? match[1]}`;
    const detail = match[3];
    const field = `question:${groupId}:${index}`;
    let text = `${label}: ${detail}`;
    if (detail === "Add the main question.")
      text = `${label} is empty. Write it, or delete the card.`;
    else if (/^Question part (\d+) is empty\.$/.test(detail))
      text = `${label} has an empty sub-question.`;
    else if (/^Cross-question (\d+) is empty\.$/.test(detail))
      text = `${label} has an empty cross-question.`;
    else if (/follow-ups in total/.test(detail))
      text = `${label} has more than 5 follow-ups in total.`;
    else if (TIMING.test(detail))
      text = `${label}: the answer time is shorter than the minimum answer time.`;
    return { step: "questions", field, message: text };
  }
  return advanced(message);
}

// Header/directory status: Draft, Ready to publish, Published (possibly with unpublished edits) or Archived.
export function interviewStatus(doc, dirty = false) {
  if (!doc) return { label: "New draft", tone: "slate" };
  if (doc.lifecycle === "archived") return { label: "Archived", tone: "amber" };
  if (doc.publishedAt)
    return doc.publishedRevision === doc.revision && !dirty
      ? { label: "Published", tone: "emerald" }
      : { label: "Published · edits not live", tone: "emerald" };
  if (doc.validation?.complete && doc.validation.validatedRevision === doc.revision && !dirty)
    return { label: "Ready to publish", tone: "sky" };
  return { label: "Draft", tone: "slate" };
}
