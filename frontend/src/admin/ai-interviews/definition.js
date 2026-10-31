import { liveTopicCounts } from "./wizard/livetopics/counts.js";

export const ROOT = "/admin/ai-interviews";
// The four wizard steps, in order. Server issue paths map onto them:
// basics -> basics, sections* -> questions, interviewer and rules -> anvi.
export const divisions = [
  { id: "basics", label: "Basics", title: "What is this interview for?" },
  { id: "questions", label: "Questions", title: "What should ANVI ask?" },
  { id: "anvi", label: "ANVI settings", title: "How should ANVI conduct it?" },
  { id: "review", label: "Review & publish", title: "Review and publish" },
];
// Older links used the five-step builder ids; they open the matching wizard step.
export const STEP_ALIASES = Object.freeze({
  sections: "questions",
  interviewer: "anvi",
  rules: "anvi",
  preview: "review",
});
// Mirrors backend LIMITS, used until /capabilities has loaded.
export const DEFAULT_LIMITS = Object.freeze({
  sections: 20,
  groups: 10,
  questions: 200,
  subquestions: 10,
  plannedQuestionsPerGroup: 50,
  followUps: 5,
  marks: 100,
  competency: 60,
  generateQuestions: 50,
  followUpLimit: 3,
});
// Mirrors backend LIMITS: authored cross-questions plus AI follow-ups per question.
export const FOLLOW_UP_LIMIT = 5;
// Mirrors backend LIMITS.followUpLimit: follow-ups ANVI may ask on one question (prepared ones first).
export const FOLLOW_UP_ASK_LIMIT = 3;
export const QUESTION_CATEGORIES = Object.freeze(["Technical", "Behavioral", "Communication"]);
export const MARKS_LIMIT = 100;
export const ANVI_DEFAULTS = Object.freeze({
  persona: Object.freeze({
    tone: "warm",
    pace: "normal",
    acknowledgements: true,
    introduction: "",
    closing: "",
    // Mirrors the backend: ANVI's speaking speed (a playback rate; the pitch is kept).
    speechRate: 1,
  }),
  turns: Object.freeze({
    silenceSeconds: 2,
    nudgeSeconds: 45,
    maxNudges: 2,
    voiceCommands: true,
  }),
  // The Gemini Live voice and its locale. languageCode "" follows the interview language
  // (English -> en-IN, Hindi -> hi-IN, Hinglish -> no fixed locale).
  voice: Object.freeze({
    name: "Aoede",
    languageCode: "",
  }),
  avatar: Object.freeze({ enabled: false, avatarId: "" }),
});
// Saved interviews from before ANVI settings existed have no `anvi`; missing keys mean defaults.
// Keys this editor does not show (conduct, warm-up, resume) are kept as they are.
export const anviSettings = (anvi) => ({
  ...(anvi || {}),
  persona: { ...ANVI_DEFAULTS.persona, ...(anvi?.persona || {}) },
  turns: { ...ANVI_DEFAULTS.turns, ...(anvi?.turns || {}) },
  voice: { ...ANVI_DEFAULTS.voice, ...(anvi?.voice || {}) },
  avatar: { ...ANVI_DEFAULTS.avatar, ...(anvi?.avatar || {}) },
});
export const categories = [
  "Technical",
  "Behavioral",
  "Communication",
  "Domain",
  "Situational",
  "Custom",
];
export const uid = () => crypto.randomUUID();
export const questionSlots = (question) => question.kind === "resume" ? question.resumeCount || 1 : 1;
export const equalWeights = (items) =>
  items.map((item, index) => ({
    ...item,
    weight:
      index === items.length - 1
        ? Math.round(
            (100 -
              (Math.floor(10000 / items.length) / 100) * (items.length - 1)) *
              100,
          ) / 100
        : Math.floor(10000 / items.length) / 100,
  }));
export const newQuestion = () => ({
  id: uid(),
  kind: "specific",
  prompt: "",
  resumeCount: 1,
  maxFollowUps: 0,
  // Follow-ups ANVI may ask (0-3); null on older questions (cross-questions plus maxFollowUps).
  followUpLimit: null,
  category: "",
  context: "",
  expectedAnswer: "",
  marks: 10,
  competency: "",
  skippable: true,
  difficulty: "",
  tags: [],
  subquestions: [],
  followUps: [],
  ruleOverrides: {},
});
export const newGroup = () => ({
  id: uid(),
  name: "New question group",
  source: "manual",
  weight: 100,
  difficulty: "",
  shuffle: false,
  // Questions each student gets from this group (null = all) and whether they come topic by topic.
  pick: null,
  byTopic: false,
  questions: [],
  ruleOverrides: {},
});
export const newSection = (category = "Technical") => ({
  id: uid(),
  name: category,
  category,
  instructions: "",
  weight: 100,
  groups: [],
  ruleOverrides: {},
});
export const newDefinition = () => ({
  title: "",
  role: "",
  description: "",
  companyId: "",
  companyName: "",
  experience: "",
  difficulty: "",
  sections: [],
  interviewer: null,
  rules: {
    preparationSeconds: 15,
    responseSeconds: 120,
    minimumSeconds: 0,
    replays: 1,
    mode: "mock",
    language: "English",
    resume: "none",
    documents: "none",
  },
  anvi: anviSettings(),
  rubric: defaultRubric(),
});
export const defaultRubric = () => [
  {
    id: uid(),
    name: "Knowledge",
    description: "Accurate, relevant understanding of the topic.",
    weight: 40,
  },
  {
    id: uid(),
    name: "Communication",
    description: "Clear, well-structured explanations.",
    weight: 30,
  },
  {
    id: uid(),
    name: "Problem solving",
    description: "A sound approach and reasoning about trade-offs.",
    weight: 30,
  },
];
export function summarize(data) {
  let manual = 0,
    planned = 0,
    followUps = 0,
    marks = 0;
  // Live topics without their own count share the interview pool by priority.
  const liveCounts = liveTopicCounts(data);
  for (const s of data.sections)
    for (const g of s.groups) {
      if (g.source === "manual") {
        manual += g.questions.reduce((n, q) => n + questionSlots(q), 0);
        followUps += g.questions.reduce((n, q) => n + (q.followUps.length + (q.maxFollowUps || 0)) * questionSlots(q), 0);
        marks += g.questions.reduce((n, q) => n + (Number(q.marks) || 10) * questionSlots(q), 0);
      } else {
        const count = liveCounts[g.id] ?? 0;
        planned += count;
        followUps += count * g.annu.maxFollowUps;
        // Planned (live) questions use the default 10 marks each.
        marks += count * 10;
      }
    }
  return { manual, planned, followUps, marks };
}
export function rekeySection(section) {
  const clone = structuredClone(section);
  clone.id = uid();
  clone.name = `${clone.name} (copy)`;
  for (const g of clone.groups) {
    g.id = uid();
    for (const q of g.questions ?? []) {
      q.id = uid();
      q.subquestions.forEach((x) => {
        x.id = uid();
      });
      q.followUps.forEach((x) => {
        x.id = uid();
      });
    }
  }
  return clone;
}
