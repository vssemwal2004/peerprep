import sanitizeHtml from "sanitize-html";

export const LIMITS = Object.freeze({
  sections: 20,
  groups: 10,
  questions: 200,
  subquestions: 10,
  plannedQuestionsPerGroup: 50,
  followUps: 3,
  text: 12000,
  payload: 750000,
});
export const CAPABILITIES = Object.freeze({
  authoring: true,
  manualQuestions: true,
  annuSpecification: true,
  staticProfiles: true,
  questionGeneration: false,
  liveConversation: false,
  candidateAssignment: false,
  evaluation: false,
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
    out.language = choice(
      input.language,
      ["English", "Hindi", "Hinglish"],
      "English",
    );
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
    language: choice(
      input.language,
      ["English", "Hindi", "Hinglish"],
      "English",
    ),
    introduction: text(input.introduction, 2000),
    closing: text(input.closing, 2000),
  };
}
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
  const questions = (items) =>
    list(items ?? [], LIMITS.questions).map((q) => {
      object(q);
      count++;
      if (count > LIMITS.questions)
        fail("Too many questions in this interview.");
      return {
        id: id(q.id),
        prompt: text(q.prompt),
        context: text(q.context),
        difficulty: difficulty(q.difficulty),
        expectedAnswer: text(q.expectedAnswer),
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
        provenance: q.provenance?.libraryQuestionId
          ? {
              libraryQuestionId: text(q.provenance.libraryQuestionId, 80),
              importedAt: text(q.provenance.importedAt, 80),
            }
          : null,
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
        const targetCount = integer(
          a.targetCount,
          1,
          LIMITS.plannedQuestionsPerGroup,
          3,
        );
        count += targetCount;
        if (count > LIMITS.questions)
          fail("Too many authored or planned questions.");
        return {
          ...base,
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
        if (!g.annu.requirements) add(gp, "Add requirements for ANNU.");
        summary.plannedCount += g.annu.targetCount;
        const followups = g.annu.targetCount * g.annu.maxFollowUps;
        summary.followUpCount += followups;
        budget(rules, g.annu.targetCount + followups);
      } else {
        if (!g.questions.length) add(gp, "Add at least one question.");
        summary.manualCount += g.questions.length;
        for (const [questionIndex, q] of g.questions.entries()) {
          const label = `Question ${questionIndex + 1}`;
          if (!q.prompt) add(gp, `${label}: Add the main question.`);
          q.subquestions.forEach((part, index) => {
            if (!part.prompt)
              add(gp, `${label}: Question part ${index + 1} is empty.`);
          });
          q.followUps.forEach((followUp, index) => {
            if (!followUp.prompt)
              add(gp, `${label}: Cross-question ${index + 1} is empty.`);
          });
          const qr = { ...rules, ...q.ruleOverrides };
          timing(qr, gp, label);
          budget(qr);
          summary.followUpCount += q.followUps.length;
          for (const [followUpIndex, f] of q.followUps.entries()) {
            const fr = { ...qr, ...f.ruleOverrides };
            timing(fr, gp, `${label}, cross-question ${followUpIndex + 1}`);
            budget(fr);
          }
        }
      }
    }
  }
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
