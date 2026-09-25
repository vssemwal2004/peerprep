export const ROOT = "/admin/ai-interviews";
export const divisions = [
  { id: "basics", label: "Basics" },
  { id: "sections", label: "Sections & questions" },
  { id: "interviewer", label: "Interviewer" },
  { id: "rules", label: "Rules & rubric" },
  { id: "review", label: "Review" },
];
export const categories = [
  "Technical",
  "Behavioral",
  "Communication",
  "Domain",
  "Situational",
  "Custom",
];
export const uid = () => crypto.randomUUID();
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
  prompt: "",
  context: "",
  expectedAnswer: "",
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
  rubric: [
    {
      id: uid(),
      name: "Correctness",
      description: "Accurate and relevant knowledge.",
      weight: 40,
    },
    {
      id: uid(),
      name: "Reasoning",
      description: "A clear, structured approach.",
      weight: 40,
    },
    {
      id: uid(),
      name: "Clarity",
      description: "Understandable explanations.",
      weight: 20,
    },
  ],
});
export function summarize(data) {
  let manual = 0,
    planned = 0,
    followUps = 0;
  for (const s of data.sections)
    for (const g of s.groups) {
      if (g.source === "manual") {
        manual += g.questions.length;
        followUps += g.questions.reduce((n, q) => n + q.followUps.length, 0);
      } else {
        planned += g.annu.targetCount;
        followUps += g.annu.targetCount * g.annu.maxFollowUps;
      }
    }
  return { manual, planned, followUps };
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
