import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITIES,
  LIMITS,
  normalizeDefinition,
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
  for (const key of [
    "questionGeneration",
    "liveConversation",
    "candidateAssignment",
    "evaluation",
  ])
    assert.equal(CAPABILITIES[key], false);
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
