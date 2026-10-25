import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANVI_DEFAULTS,
  CAPABILITIES,
  LIMITS,
  liveTopicCounts,
  normalizeAnvi,
  normalizeDefinition,
  priorityCounts,
  normalizeRules,
  normalizedName,
  inspectDefinition,
  literalSearch,
} from "../src/services/aiInterviewDefinition.js";

export const definition = () => ({
  title: "Backend mock",
  role: "Developer",
  experience: "junior",
  difficulty: "easy",
  sections: [
    {
      id: "section1",
      name: "Technical",
      weight: 100,
      groups: [
        {
          id: "group1",
          name: "Fundamentals",
          weight: 100,
          source: "manual",
          questions: [
            {
              id: "question1",
              prompt: "Explain REST.",
              subquestions: [],
              followUps: [],
            },
          ],
        },
      ],
    },
  ],
  interviewer: {
    profileId: "507f1f77bcf86cd799439099",
    displayName: "ANNU",
    name: "ANNU",
  },
  rubric: [{ id: "criterion1", name: "Correctness", weight: 100 }],
});
test("complete manual configuration is valid without any AI provider", () => {
  const checked = inspectDefinition(normalizeDefinition(definition()));
  assert.equal(checked.complete, true);
  assert.equal(checked.summary.manualCount, 1);
  assert.equal(checked.summary.budgetSeconds, 135);
  assert.equal(CAPABILITIES.questionGeneration, true);
  assert.equal(CAPABILITIES.liveConversation, true);
  assert.equal(CAPABILITIES.candidateAssignment, false);
  assert.equal(CAPABILITIES.evaluation, true);
});
test("ANNU saves specifications and counts planned questions separately", () => {
  const d = definition();
  d.sections[0].groups = [
    {
      id: "group2",
      name: "Debugging",
      source: "annu",
      weight: 100,
      annu: { requirements: "Focus on REST", targetCount: 3, maxFollowUps: 2 },
    },
  ];
  const result = inspectDefinition(normalizeDefinition(d));
  assert.equal(result.complete, true);
  assert.equal(result.summary.manualCount, 0);
  assert.equal(result.summary.plannedCount, 3);
  assert.equal(result.summary.followUpCount, 6);
  assert.equal(result.summary.budgetSeconds, 1215);
});
test("draft saving allows incompleteness but completion identifies exact divisions", () => {
  const result = inspectDefinition(normalizeDefinition({ title: "Draft" }));
  assert.equal(result.complete, false);
  for (const path of ["basics", "sections", "interviewer", "rules"])
    assert.ok(result.issues.some((i) => i.path === path));
});
test("weights, inherited timing and unlimited values are validated consistently", () => {
  const d = definition();
  d.sections[0].weight = 90;
  d.rules = { responseSeconds: 30, minimumSeconds: 40 };
  assert.ok(
    inspectDefinition(normalizeDefinition(d)).issues.some((i) =>
      i.message.includes("Weights"),
    ),
  );
  assert.ok(
    inspectDefinition(normalizeDefinition(d)).issues.some((i) =>
      i.message.includes("minimum"),
    ),
  );
  d.sections[0].weight = 100;
  d.rules = { responseSeconds: null };
  d.sections[0].groups[0].ruleOverrides = { responseSeconds: 20 };
  const result = inspectDefinition(normalizeDefinition(d));
  assert.equal(result.summary.unlimited, false);
  assert.equal(result.summary.budgetSeconds, 35);
  assert.deepEqual(normalizeRules({}, true), {});
  assert.equal(
    normalizeRules({ responseSeconds: null }, true).responseSeconds,
    null,
  );
});
test("duplicate nested IDs, invalid sources and oversized inputs are rejected", () => {
  const d = definition();
  d.sections[0].groups[0].id = "section1";
  assert.throws(() => normalizeDefinition(d), /unique/);
  const mixed = definition();
  mixed.sections[0].groups[0].annu = {};
  assert.throws(() => normalizeDefinition(mixed), /one active/);
  assert.throws(() => normalizeDefinition({ title: "x".repeat(161) }), /160/);
  assert.throws(
    () => normalizeDefinition({ title: "Valid", difficulty: "impossible" }),
    /Invalid option/,
  );
});
test("company names normalize and searches remain literal", () => {
  assert.equal(
    normalizedName("  Trilok   STEEL "),
    normalizedName("trilok steel"),
  );
  assert.equal(normalizedName("Ｔｅｓｔ"), "test");
  assert.equal(literalSearch("a.*[x]"), "a\\.\\*\\[x\\]");
  const d = definition();
  d.title = "<script>alert(1)</script>Safe";
  assert.equal(normalizeDefinition(d).title, "Safe");
});

test("capabilities expose the enforced question-part and ANNU planning limits", () => {
  assert.equal(CAPABILITIES.limits.subquestions, 10);
  assert.equal(CAPABILITIES.limits.plannedQuestionsPerGroup, 50);
  const d = definition();
  d.sections[0].groups[0].questions[0].subquestions = Array.from(
    { length: LIMITS.subquestions },
    (_, index) => ({ id: `part${index}`, prompt: "Explain this part." }),
  );
  assert.doesNotThrow(() => normalizeDefinition(d));
  d.sections[0].groups[0].questions[0].subquestions.push({
    id: "extraPart",
    prompt: "One too many.",
  });
  assert.throws(() => normalizeDefinition(d), /at most 10/);
  d.sections[0].groups = [
    {
      id: "annuGroup",
      source: "annu",
      annu: { requirements: "Test REST", targetCount: 51 },
    },
  ];
  assert.throws(() => normalizeDefinition(d), /between 1 and 50/);
});

test("empty question parts and cross-questions identify their position without changing issue paths", () => {
  const d = definition();
  d.sections[0].groups[0].questions.push({
    id: "question2",
    prompt: " ",
    subquestions: [{ id: "part1", prompt: " " }],
    followUps: [
      { id: "cross1", prompt: "Explain your reasoning." },
      { id: "cross2", prompt: " " },
    ],
  });
  const result = inspectDefinition(normalizeDefinition(d));
  assert.equal(result.complete, false);
  assert.deepEqual(result.issues, [
    {
      path: "sections/section1/groups/group1",
      message: "Question 2: Add the main question.",
    },
    {
      path: "sections/section1/groups/group1",
      message: "Question 2: Question part 1 is empty.",
    },
    {
      path: "sections/section1/groups/group1",
      message: "Question 2: Cross-question 2 is empty.",
    },
  ]);
});

test("question parts share their parent's response budget while cross-questions have separate inherited timing", () => {
  const d = definition();
  const q = d.sections[0].groups[0].questions[0];
  q.ruleOverrides = { preparationSeconds: 5, responseSeconds: 60 };
  q.subquestions = [
    { id: "part1", prompt: "Name a status code." },
    { id: "part2", prompt: "Explain when you use it." },
  ];
  q.followUps = [
    { id: "cross1", prompt: "How would you handle errors?" },
    {
      id: "cross2",
      prompt: "Give an example.",
      ruleOverrides: { responseSeconds: 30 },
    },
  ];
  const result = inspectDefinition(normalizeDefinition(d));
  assert.equal(result.complete, true);
  assert.equal(result.summary.manualCount, 1);
  assert.equal(result.summary.followUpCount, 2);
  assert.equal(result.summary.budgetSeconds, 65 + 65 + 35);

  q.followUps[1].ruleOverrides.minimumSeconds = 40;
  assert.deepEqual(inspectDefinition(normalizeDefinition(d)).issues, [
    {
      path: "sections/section1/groups/group1",
      message:
        "Question 1, cross-question 2: Response limit must be positive and at least the minimum response time.",
    },
  ]);
});

test("manual and ANNU planned main questions share one interview-wide limit in either order", () => {
  const d = definition();
  const manualGroup = d.sections[0].groups[0];
  manualGroup.weight = 50;
  manualGroup.questions = Array.from({ length: 150 }, (_, index) => ({
    id: `question${index}`,
    prompt: "Explain a REST concept.",
  }));
  const annuGroup = {
    id: "annuGroup",
    name: "Scenario discussion",
    source: "annu",
    weight: 50,
    annu: { requirements: "Discuss REST scenarios.", targetCount: 50 },
  };
  d.sections[0].groups = [manualGroup, annuGroup];
  const result = inspectDefinition(normalizeDefinition(d));
  assert.equal(result.complete, true);
  assert.equal(result.summary.manualCount, 150);
  assert.equal(result.summary.plannedCount, 50);

  manualGroup.questions.push({ id: "extraQuestion", prompt: "Exceeds budget." });
  assert.throws(() => normalizeDefinition(d), /Too many authored or planned/);
  d.sections[0].groups.reverse();
  assert.throws(() => normalizeDefinition(d), /Too many questions/);
});

test("question marks, competency and skippable default and validate", () => {
  const d = definition();
  let q = normalizeDefinition(d).sections[0].groups[0].questions[0];
  assert.equal(q.marks, 10);
  assert.equal(q.competency, "");
  assert.equal(q.skippable, true);
  Object.assign(d.sections[0].groups[0].questions[0], {
    marks: 25,
    competency: " <b>API design</b> ",
    skippable: false,
  });
  q = normalizeDefinition(d).sections[0].groups[0].questions[0];
  assert.equal(q.marks, 25);
  assert.equal(q.competency, "API design");
  assert.equal(q.skippable, false);
  for (const marks of [0, 101, 2.5, "10"]) {
    d.sections[0].groups[0].questions[0].marks = marks;
    assert.throws(() => normalizeDefinition(d), /between 1 and 100/);
  }
  d.sections[0].groups[0].questions[0].marks = 10;
  d.sections[0].groups[0].questions[0].competency = "x".repeat(61);
  assert.throws(() => normalizeDefinition(d), /60 characters/);
  d.sections[0].groups[0].questions[0].competency = "";
  d.sections[0].groups[0].questions[0].skippable = "no";
  assert.throws(() => normalizeDefinition(d), /true or false/);
});

test("follow-up limit is five for AI follow-ups, cross-questions and their combined budget", () => {
  assert.equal(LIMITS.followUps, 5);
  assert.equal(CAPABILITIES.limits.followUps, 5);
  const d = definition();
  const q = d.sections[0].groups[0].questions[0];
  q.maxFollowUps = 5;
  assert.equal(
    normalizeDefinition(d).sections[0].groups[0].questions[0].maxFollowUps,
    5,
  );
  q.maxFollowUps = 6;
  assert.throws(() => normalizeDefinition(d), /between 0 and 5/);
  q.maxFollowUps = 0;
  q.followUps = Array.from({ length: 5 }, (_, i) => ({
    id: `cross${i}`,
    prompt: "Why?",
  }));
  assert.equal(inspectDefinition(normalizeDefinition(d)).complete, true);
  q.followUps.push({ id: "cross5", prompt: "One too many." });
  assert.throws(() => normalizeDefinition(d), /at most 5/);
  q.followUps.pop();
  q.maxFollowUps = 1;
  const checked = inspectDefinition(normalizeDefinition(d));
  assert.equal(checked.complete, false);
  assert.match(checked.issues[0].message, /at most 5 follow-ups in total/);
  d.sections[0].groups = [
    {
      id: "annuGroup",
      name: "ANVI",
      weight: 100,
      source: "annu",
      annu: { requirements: "REST", targetCount: 2, maxFollowUps: 5 },
    },
  ];
  assert.equal(normalizeDefinition(d).sections[0].groups[0].annu.maxFollowUps, 5);
});

test("anvi settings default when missing and clamp turn settings into range", () => {
  const normalized = normalizeDefinition(definition());
  assert.deepEqual(normalized.anvi, {
    liveQuestionCount: null,
    persona: { ...ANVI_DEFAULTS.persona },
    turns: { ...ANVI_DEFAULTS.turns },
    conduct: { ...ANVI_DEFAULTS.conduct },
    warmup: { ...ANVI_DEFAULTS.warmup },
    resume: { ...ANVI_DEFAULTS.resume, sources: [...ANVI_DEFAULTS.resume.sources] },
    language: { ...ANVI_DEFAULTS.language, studentChoice: [] },
    voice: { ...ANVI_DEFAULTS.voice },
    avatar: { enabled: false, avatarId: "" },
    proctoring: { ...ANVI_DEFAULTS.proctoring, ai: { ...ANVI_DEFAULTS.proctoring.ai } },
  });
  assert.deepEqual(normalizeAnvi({ voice: { name: "Kore", languageCode: "hi-IN" } }).voice, { name: "Kore", languageCode: "hi-IN" });
  assert.deepEqual(normalizeAnvi({ voice: { name: null } }).voice, { name: "", languageCode: "" });
  assert.throws(() => normalizeAnvi({ voice: { name: "Siri" } }), /Invalid option/);
  assert.throws(() => normalizeAnvi({ voice: { languageCode: "en-US" } }), /Invalid option/);
  assert.deepEqual(normalized.anvi.persona, {
    tone: "warm",
    pace: "normal",
    acknowledgements: true,
    introduction: "",
    closing: "",
  });
  assert.deepEqual(normalized.anvi.turns, {
    silenceSeconds: 2,
    nudgeSeconds: 45,
    maxNudges: 2,
    voiceCommands: true,
  });
  assert.deepEqual(normalizeAnvi({ persona: { pace: "brisk" } }).persona.pace, "brisk");
  assert.equal(normalizeAnvi({ persona: { pace: "brisk" } }).turns.maxNudges, 2);
  const custom = normalizeAnvi({
    persona: {
      tone: "formal",
      pace: "slow",
      acknowledgements: false,
      introduction: "Hello {name}, welcome to the {role} interview.",
      closing: "<i>Thanks</i> {name}.",
    },
    turns: { silenceSeconds: 3.5, nudgeSeconds: 60, maxNudges: 0, voiceCommands: false },
  });
  assert.equal(custom.persona.tone, "formal");
  assert.equal(custom.persona.acknowledgements, false);
  assert.equal(custom.persona.closing, "Thanks {name}.");
  assert.deepEqual(custom.turns, {
    silenceSeconds: 3.5,
    nudgeSeconds: 60,
    maxNudges: 0,
    voiceCommands: false,
  });
  const clamped = normalizeAnvi({
    turns: { silenceSeconds: 9, nudgeSeconds: 2, maxNudges: 7.6 },
  }).turns;
  assert.equal(clamped.silenceSeconds, 4);
  assert.equal(clamped.nudgeSeconds, 15);
  assert.equal(clamped.maxNudges, 3);
  assert.equal(normalizeAnvi({ turns: { silenceSeconds: 1 } }).turns.silenceSeconds, 1.5);
  assert.equal(normalizeAnvi({ turns: { silenceSeconds: 2.7 } }).turns.silenceSeconds, 2.5);
  assert.equal(normalizeAnvi({ turns: { nudgeSeconds: 200.4 } }).turns.nudgeSeconds, 120);
  assert.throws(() => normalizeAnvi({ turns: { silenceSeconds: "3" } }), /number between/);
  assert.throws(() => normalizeAnvi({ persona: { tone: "rude" } }), /Invalid option/);
  assert.throws(() => normalizeAnvi({ persona: { introduction: "x".repeat(2001) } }), /2000/);
  assert.throws(() => normalizeDefinition({ title: "Bad", anvi: [] }), /objects/);
  assert.throws(() => normalizeDefinition({ title: "Bad", anvi: { turns: [] } }), /objects/);
  assert.deepEqual(normalizeDefinition({ title: "Old", anvi: null }).anvi.turns, { ...ANVI_DEFAULTS.turns });
});

test("anvi proctoring settings normalise with defaults, validation and back-compat", () => {
  const off = { ...ANVI_DEFAULTS.proctoring, ai: { ...ANVI_DEFAULTS.proctoring.ai } };
  assert.deepEqual(off, {
    enabled: false, fullscreen: "off", pauseOutsideFullscreen: true, tabSwitch: "off", refresh: "off",
    blockRightClick: true, blockCopyPaste: true, blockShortcuts: true, warnings: 3, maxViolations: 0, onLimit: "end",
    ai: {
      enabled: false, detectMobile: true, detectMultiplePersons: true, detectNoFace: true, detectFaceOutOfFrame: true,
      faceOutOfFrameGraceSec: 10, detectLookingAway: true, detectionIntervalMs: 500, ignoreLimit: 5, violationCooldownSec: 20,
      criticalAutoFlag: true,
    },
  });
  // Older definitions (no proctoring, or null) are unproctored.
  assert.deepEqual(normalizeAnvi({}).proctoring, off);
  assert.deepEqual(normalizeAnvi({ proctoring: null }).proctoring, off);
  const custom = normalizeAnvi({ proctoring: {
    enabled: true, fullscreen: "required", pauseOutsideFullscreen: false, tabSwitch: "warn", refresh: "record",
    blockRightClick: false, warnings: 0, maxViolations: 20, onLimit: "flag",
    ai: { enabled: true, detectMobile: false, faceOutOfFrameGraceSec: 3, detectionIntervalMs: 5000, ignoreLimit: 0, violationCooldownSec: 120 },
  } }).proctoring;
  assert.deepEqual(custom, {
    ...off, enabled: true, fullscreen: "required", pauseOutsideFullscreen: false, tabSwitch: "warn", refresh: "record",
    blockRightClick: false, warnings: 0, maxViolations: 20, onLimit: "flag",
    ai: { ...off.ai, enabled: true, detectMobile: false, faceOutOfFrameGraceSec: 3, detectionIntervalMs: 5000, ignoreLimit: 0, violationCooldownSec: 120 },
  });
  for (const proctoring of [
    { fullscreen: "maybe" }, { tabSwitch: "block" }, { refresh: "warn" }, { maxViolations: 21 }, { maxViolations: -1 }, { maxViolations: 1.5 },
    { warnings: 11 }, { onLimit: "pause" }, { enabled: "yes" }, { blockShortcuts: 1 }, [],
    { ai: { detectionIntervalMs: 100 } }, { ai: { faceOutOfFrameGraceSec: 61 } }, { ai: { ignoreLimit: "5" } }, { ai: { violationCooldownSec: 4 } },
    { ai: { enabled: "true" } }, { ai: [] },
  ]) {
    assert.throws(() => normalizeDefinition({ ...definition(), anvi: { proctoring } }), (error) => error.status === 422, JSON.stringify(proctoring));
  }
  // A proctoring 422 names the field path (message and details.field), so the admin can find the control.
  for (const [proctoring, path, message] of [
    [{ ai: { detectionIntervalMs: 100 } }, "anvi.proctoring.ai.detectionIntervalMs", "Expected a number between 500 and 5000."],
    [{ ai: { violationCooldownSec: 4 } }, "anvi.proctoring.ai.violationCooldownSec", "Expected a number between 5 and 120."],
    [{ ai: { enabled: "true" } }, "anvi.proctoring.ai.enabled", "Expected true or false."],
    [{ ai: [] }, "anvi.proctoring.ai", "Configuration fields must be objects."],
    [{ maxViolations: 21 }, "anvi.proctoring.maxViolations", "Expected a whole number between 0 and 20."],
    [{ fullscreen: "maybe" }, "anvi.proctoring.fullscreen", "Invalid option: maybe"],
    [[], "anvi.proctoring", "Configuration fields must be objects."],
  ]) {
    assert.throws(() => normalizeDefinition({ ...definition(), anvi: { proctoring } }), (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.message, `${path}: ${message}`);
      assert.equal(error.details.field, path);
      return true;
    }, path);
  }
  // The admin's checks are kept while proctoring is off; the summary shows the settings students will see.
  const saved = normalizeDefinition({ ...definition(), anvi: { proctoring: { enabled: false, tabSwitch: "record" } } });
  assert.equal(saved.anvi.proctoring.tabSwitch, "record");
  assert.deepEqual(inspectDefinition(saved).summary.proctoring, saved.anvi.proctoring);
  assert.deepEqual(inspectDefinition({ ...saved, anvi: {} }).summary.proctoring.enabled, false);
});

test("anvi conduct, warm-up and resume settings normalise with defaults and validation", () => {
  const custom = normalizeAnvi({
    conduct: { endByVoice: true, finishAllQuestions: false, noPersonalQuestions: false, termsText: "<b>No notes</b> allowed.\nCamera on." },
    warmup: { enabled: false, icebreakers: 5, tellMeAboutYourself: false, scored: true },
    resume: { mode: "optional", sources: ["upload", "upload"], questionCount: 4.4 },
  });
  assert.deepEqual(custom.conduct, {
    endByVoice: true, finishAllQuestions: false, noPersonalQuestions: false,
    termsText: "No notes allowed.\nCamera on.", requireTermsAcceptance: true,
  });
  assert.deepEqual(custom.warmup, { enabled: false, icebreakers: 3, tellMeAboutYourself: false, scored: true });
  assert.deepEqual(custom.resume, { mode: "optional", sources: ["upload"], questionCount: 4 });
  assert.equal(normalizeAnvi({ conduct: { termsText: "Rules", requireTermsAcceptance: false } }).conduct.requireTermsAcceptance, false);
  assert.equal(normalizeAnvi({ conduct: { requireTermsAcceptance: true } }).conduct.requireTermsAcceptance, false, "no terms, nothing to accept");
  assert.throws(() => normalizeAnvi({ conduct: { termsText: "x".repeat(4001) } }), /4000/);
  assert.throws(() => normalizeAnvi({ resume: { sources: [] } }), /at least one resume source/);
  assert.throws(() => normalizeAnvi({ resume: { sources: ["email"] } }), /Invalid option/);
  assert.throws(() => normalizeAnvi({ resume: { mode: "sometimes" } }), /Invalid option/);
  assert.throws(() => normalizeAnvi({ warmup: { scored: "yes" } }), /true or false/);
  assert.throws(() => normalizeAnvi({ warmup: [] }), /objects/);

  // The resume mode defaults from resume questions and rules.resume; an explicit choice wins.
  const d = definition();
  d.sections[0].groups[0].questions.push({ id: "resumeQ", kind: "resume", resumeCount: 1 });
  assert.equal(normalizeDefinition(d).anvi.resume.mode, "required");
  assert.equal(normalizeDefinition({ ...definition(), rules: { resume: "optional" } }).anvi.resume.mode, "optional");
  assert.equal(normalizeDefinition({ ...definition(), rules: { resume: "required" } }).anvi.resume.mode, "required");
  assert.equal(normalizeDefinition(definition()).anvi.resume.mode, "none");
  const chosen = normalizeDefinition({ ...d, anvi: { resume: { mode: "none" } } });
  assert.equal(chosen.anvi.resume.mode, "none");
  const checked = inspectDefinition(chosen);
  assert.equal(checked.complete, false);
  assert.ok(checked.issues.some((issue) => issue.path === "interviewer" && /Resume questions need a resume/.test(issue.message)));
});

test("a scored introduction and required resume questions count in the summary", () => {
  const base = inspectDefinition(normalizeDefinition(definition())).summary;
  const scored = inspectDefinition(normalizeDefinition({ ...definition(), anvi: { warmup: { scored: true } } })).summary;
  assert.equal(scored.plannedCount, base.plannedCount + 1);
  assert.equal(scored.totalMarks, base.totalMarks + 10);
  const resume = inspectDefinition(normalizeDefinition({ ...definition(), anvi: { resume: { mode: "required", questionCount: 3 } } })).summary;
  assert.equal(resume.plannedCount, base.plannedCount + 3);
  assert.equal(resume.totalMarks, base.totalMarks + 30);
  const optional = inspectDefinition(normalizeDefinition({ ...definition(), anvi: { resume: { mode: "optional", questionCount: 3 } } })).summary;
  assert.equal(optional.plannedCount, base.plannedCount, "optional resume questions are not guaranteed");
});

test("generated provenance is kept alongside Library provenance and unknown shapes are dropped", () => {
  const d = definition();
  const q = d.sections[0].groups[0].questions[0];
  q.provenance = { generated: true, generatedAt: "2026-10-21T10:00:00.000Z", extra: "x" };
  assert.deepEqual(normalizeDefinition(d).sections[0].groups[0].questions[0].provenance, {
    generated: true,
    generatedAt: "2026-10-21T10:00:00.000Z",
  });
  q.provenance = { libraryQuestionId: "507f1f77bcf86cd799439011", importedAt: "now" };
  assert.deepEqual(normalizeDefinition(d).sections[0].groups[0].questions[0].provenance, {
    libraryQuestionId: "507f1f77bcf86cd799439011",
    importedAt: "now",
  });
  q.provenance = { generated: "yes" };
  assert.equal(normalizeDefinition(d).sections[0].groups[0].questions[0].provenance, null);
});

test("summary totals marks for authored and planned questions", () => {
  const d = definition();
  d.sections[0].groups[0].questions[0].marks = 20;
  d.sections[0].groups[0].weight = 50;
  d.sections[0].groups.push({
    id: "annuMarks",
    name: "Planned",
    weight: 50,
    source: "annu",
    annu: { requirements: "REST", targetCount: 2 },
  });
  assert.equal(inspectDefinition(normalizeDefinition(d)).summary.totalMarks, 40);
  // Stored definitions saved before marks existed count each question as 10.
  const legacy = normalizeDefinition(d);
  delete legacy.sections[0].groups[0].questions[0].marks;
  assert.equal(inspectDefinition(legacy).summary.totalMarks, 30);
});

test("priorityCounts splits a total 3:2:1 by priority with largest remainders and one per topic", () => {
  assert.deepEqual(priorityCounts(["high", "low"], 4), [3, 1]);
  assert.deepEqual(priorityCounts(["high", "medium", "low"], 6), [3, 2, 1]);
  assert.deepEqual(priorityCounts(["high", "medium", "low"], 5), [2, 2, 1]);
  assert.deepEqual(priorityCounts(["medium", "medium"], 5), [3, 2], "ties go to the earlier topic");
  assert.deepEqual(priorityCounts(["low", "high"], 3), [1, 2]);
  // Every topic gets one when there are enough questions, taken from the topic furthest over its quota.
  assert.deepEqual(priorityCounts(["high", "low", "low", "low"], 4), [1, 1, 1, 1]);
  assert.deepEqual(priorityCounts(["high", "high", "high", "low"], 5), [2, 1, 1, 1]);
  // Fewer questions than topics: the lowest priorities go without.
  assert.deepEqual(priorityCounts(["low", "high", "medium"], 2), [0, 1, 1]);
  assert.deepEqual(priorityCounts(["high", "low"], 1), [1, 0]);
  // Unknown or missing priorities count as medium; nothing to split gives zeros.
  assert.deepEqual(priorityCounts([undefined, "urgent", "high"], 7), [2, 2, 3]);
  assert.deepEqual(priorityCounts(["high"], 0), [0]);
  assert.deepEqual(priorityCounts([], 5), []);
  for (const total of [3, 7, 10, 23]) {
    const counts = priorityCounts(["high", "medium", "low"], total);
    assert.equal(counts.reduce((n, c) => n + c, 0), total);
  }
});

test("live topics take a priority and share the interview's live pool unless they set their own count", () => {
  const live = (id, priority, extra = {}) => ({ id, name: id, weight: 0, source: "annu", priority, annu: { requirements: `Ask about ${id}.`, ...extra } });
  const d = definition();
  d.sections[0].groups = [
    { ...live("sql", "high"), weight: 40 },
    { ...live("os", "low"), weight: 30 },
    { ...live("fixed", undefined, { targetCount: 2 }), weight: 30 },
  ];
  d.anvi = { liveQuestionCount: 4 };
  const normalized = normalizeDefinition(d);
  const groups = normalized.sections[0].groups;
  assert.deepEqual(groups.map((g) => [g.id, g.priority, g.annu.targetCount]), [["sql", "high", null], ["os", "low", null], ["fixed", "medium", 2]]);
  assert.equal(normalized.anvi.liveQuestionCount, 4);
  assert.deepEqual(liveTopicCounts(normalized), { sql: 3, os: 1, fixed: 2 });
  const { summary, complete } = inspectDefinition(normalized);
  assert.equal(complete, true);
  assert.deepEqual(summary.liveTopicCounts, { sql: 3, os: 1, fixed: 2 });
  assert.equal(summary.liveQuestionCount, 4);
  assert.equal(summary.plannedCount, 6);
  assert.equal(summary.totalMarks, 60);

  // A pool smaller than its topics leaves the low-priority topic empty, which the checklist reports.
  d.anvi = { liveQuestionCount: 1 };
  const short = inspectDefinition(normalizeDefinition(d));
  assert.deepEqual(short.summary.liveTopicCounts, { sql: 1, os: 0, fixed: 2 });
  assert.ok(short.issues.some((issue) => issue.path.endsWith("/groups/os") && /gets no questions/.test(issue.message)));

  // Without a pool (older definitions) a topic without a count keeps the old default of 3.
  delete d.anvi;
  const legacy = normalizeDefinition(d);
  assert.equal(legacy.anvi.liveQuestionCount, null);
  assert.deepEqual(legacy.sections[0].groups.map((g) => g.annu.targetCount), [3, 3, 2]);
  assert.deepEqual(liveTopicCounts(legacy), { sql: 3, os: 3, fixed: 2 });
  // A raw stored snapshot without priority still plans.
  assert.deepEqual(liveTopicCounts({ sections: [{ groups: [{ id: "g", source: "annu", annu: { targetCount: 2 } }, { id: "m", questions: [] }] }] }), { g: 2 });

  assert.throws(() => normalizeDefinition({ ...definition(), sections: [{ id: "s", groups: [live("x", "urgent")] }] }), /Invalid option/);
  assert.throws(() => normalizeDefinition({ ...definition(), anvi: { liveQuestionCount: 0 } }), /whole number/);
  assert.throws(() => normalizeDefinition({ ...definition(), anvi: { liveQuestionCount: LIMITS.questions + 1 } }), /whole number/);
  const crowded = definition();
  crowded.anvi = { liveQuestionCount: LIMITS.questions };
  crowded.sections[0].groups.push(live("pooled", "high"));
  assert.throws(() => normalizeDefinition(crowded), /Too many/);
});
test("anvi.language is the one interview language: always English (DECISIONS #0), input still validated", () => {
  // Older definitions with another rules.language are read as English: fixed and strict.
  const english = { primary: "English", studentChoice: [], strict: true, onOtherLanguage: "remind_and_flag" };
  const legacy = normalizeDefinition({ ...definition(), rules: { language: "Hindi" } });
  assert.deepEqual(legacy.anvi.language, english);
  assert.equal(legacy.rules.language, "English");
  assert.deepEqual(normalizeDefinition(definition()).anvi.language.primary, "English");
  assert.deepEqual(ANVI_DEFAULTS.language, english);

  // A language choice, another primary or policy from an older editor is saved as English only.
  const chosen = normalizeDefinition({
    ...definition(), rules: { language: "Hinglish" },
    interviewer: { ...definition().interviewer, language: "Hinglish" },
    anvi: { language: { primary: "English", studentChoice: ["Hindi", "English", "Hindi"], strict: false, onOtherLanguage: "remind" } },
  });
  assert.deepEqual(chosen.anvi.language, english);
  assert.equal(chosen.rules.language, "English");
  assert.equal(chosen.interviewer.language, "Hinglish", "the profile language stays a default only");
  assert.deepEqual(inspectDefinition(chosen).summary.language, { primary: "English", choices: ["English"], strict: true, onOtherLanguage: "remind_and_flag" });

  const edited = normalizeDefinition({ ...chosen, rules: { ...chosen.rules, language: "Hindi" } }, { previous: chosen });
  assert.equal(edited.anvi.language.primary, "English");
  assert.equal(edited.rules.language, "English");
  const both = normalizeDefinition({ ...chosen, rules: { ...chosen.rules, language: "Hindi" }, anvi: { ...chosen.anvi, language: { ...chosen.anvi.language, primary: "Hinglish" } } }, { previous: chosen });
  assert.equal(both.anvi.language.primary, "English");
  assert.equal(both.rules.language, "English");

  assert.equal(normalizeAnvi({}, { language: "Hinglish" }).language.primary, "English");
  assert.throws(() => normalizeAnvi({ language: { primary: "Tamil" } }), /Invalid option/);
  assert.throws(() => normalizeAnvi({ language: { studentChoice: ["Tamil"] } }), /Invalid option/);
  assert.throws(() => normalizeAnvi({ language: { studentChoice: "Hindi" } }), /list of at most 3/);
  assert.throws(() => normalizeAnvi({ language: { strict: "yes" } }), /true or false/);
  assert.throws(() => normalizeAnvi({ language: { onOtherLanguage: "punish" } }), /Invalid option/);
  assert.throws(() => normalizeAnvi({ language: "English" }), /objects/);
  // A stored definition from before anvi.language still summarises its language.
  assert.deepEqual(inspectDefinition({ ...legacy, rules: { ...legacy.rules, language: "Hindi" }, anvi: {} }).summary.language, { primary: "English", choices: ["English"], strict: true, onOtherLanguage: "remind_and_flag" });
});
test("anvi.durationMinutes and anvi.hybrid are optional; a question count outside the duration range only warns", () => {
  const plain = normalizeDefinition(definition());
  assert.equal("durationMinutes" in plain.anvi, false, "older definitions keep no duration");
  assert.equal("hybrid" in plain.anvi, false);
  assert.equal(inspectDefinition(plain).summary.warnings, undefined);
  assert.equal(normalizeAnvi({ durationMinutes: 30 }).durationMinutes, 30);
  assert.equal("durationMinutes" in normalizeAnvi({ durationMinutes: null }), false);
  assert.throws(() => normalizeAnvi({ durationMinutes: 20 }), /anvi\.durationMinutes: Invalid option/);
  assert.throws(() => normalizeAnvi({ durationMinutes: "30" }), /Invalid option/);

  const hybrid = normalizeDefinition({ ...definition(), anvi: { hybrid: { allowLiveWarmup: true, conversationalSectionIds: ["section1", "gone", "section1"] } } });
  assert.deepEqual(hybrid.anvi.hybrid, { allowLiveWarmup: true, conversationalSectionIds: ["section1"], allowStudentLiveMode: false });
  assert.deepEqual(normalizeAnvi({ hybrid: {} }).hybrid, { allowLiveWarmup: false, conversationalSectionIds: [], allowStudentLiveMode: false });
  assert.throws(() => normalizeAnvi({ hybrid: { allowStudentLiveMode: "yes" } }), /anvi\.hybrid\.allowStudentLiveMode: Expected true or false/);
  assert.throws(() => normalizeAnvi({ hybrid: [] }), /anvi\.hybrid: Configuration fields must be objects/);

  // One question in a 30-minute interview (8 or fewer, more than the 15-minute 5): too few, not blocking.
  const short = normalizeDefinition({ ...definition(), anvi: { durationMinutes: 30 } });
  const checked = inspectDefinition(short);
  assert.equal(checked.summary.durationMinutes, 30);
  assert.deepEqual(checked.summary.durationQuestionRange, { min: 6, max: 8 });
  assert.deepEqual(checked.summary.warnings.map((warning) => warning.code), ["DURATION_TOO_FEW_QUESTIONS"]);
  assert.ok(!checked.issues.some((issue) => /minute/.test(issue.message)), "a warning, never an issue");
  // Ten questions in a 10-minute interview (at most 4): too many.
  const crowded = definition();
  crowded.sections[0].groups[0].questions = Array.from({ length: 10 }, (_, i) => ({ id: `question${i}`, prompt: `Explain topic ${i}.`, subquestions: [], followUps: [] }));
  const many = inspectDefinition(normalizeDefinition({ ...crowded, anvi: { durationMinutes: 10 } }));
  assert.deepEqual(many.summary.durationQuestionRange, { min: 1, max: 4 });
  assert.deepEqual(many.summary.warnings.map((warning) => warning.code), ["DURATION_TOO_MANY_QUESTIONS"]);
  assert.match(many.summary.warnings[0].message, /10 questions are planned, but a 10-minute interview asks at most 4/);
  assert.deepEqual(inspectDefinition(normalizeDefinition({ ...crowded, anvi: { durationMinutes: 60 } })).summary.warnings.map((warning) => warning.code), ["DURATION_TOO_FEW_QUESTIONS"]);
  assert.deepEqual(inspectDefinition(normalizeDefinition({ ...crowded, anvi: { durationMinutes: 45 } })).summary.warnings, []);
});
