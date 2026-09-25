import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITIES,
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
