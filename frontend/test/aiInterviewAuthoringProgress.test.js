import assert from "node:assert/strict";
import test from "node:test";
import { getAuthoringProgress } from "../src/admin/ai-interviews/authoringProgress.js";

const definition = () => ({
  title: "Backend interview",
  role: "Engineer",
  experience: "junior",
  difficulty: "medium",
  rules: { responseSeconds: 120, preparationSeconds: 15, minimumSeconds: 0 },
  interviewer: { displayName: "ANNU" },
  rubric: [{ name: "Clarity", weight: 100 }],
  sections: [
    {
      id: "s1",
      name: "Technical",
      weight: 100,
      groups: [
        {
          id: "g1",
          name: "APIs",
          weight: 100,
          source: "manual",
          questions: [
            {
              id: "q1",
              prompt: "Explain REST.",
              subquestions: [],
              followUps: [],
            },
          ],
        },
      ],
    },
  ],
});

test("progress exposes only three primary authoring steps and never a validation result", () => {
  const progress = getAuthoringProgress(definition());
  assert.deepEqual(
    progress.steps.map((step) => step.id),
    ["basics", "sections", "review"],
  );
  assert.equal(
    progress.steps.every((step) => step.ready),
    true,
  );
  assert.equal(progress.ready, true);
  assert.deepEqual(progress.issues, []);
  assert.equal(progress.complete, undefined);
});
test("missing required basics are actionable without requiring company or description", () => {
  const data = definition();
  Object.assign(data, { title: " ", role: "", experience: "", difficulty: "" });
  const progress = getAuthoringProgress(data);
  assert.equal(progress.issues.length, 4);
  assert.ok(progress.issues.every((issue) => issue.path === "basics"));
  assert.equal(progress.steps[0].ready, false);
  assert.equal(progress.steps[1].ready, true);
  assert.equal(progress.steps[2].ready, false);
});
test("empty sections, unnamed topics, and empty manual questions are not ready", () => {
  const data = definition();
  data.sections = [];
  assert.equal(getAuthoringProgress(data).steps[1].ready, false);
  data.sections = definition().sections;
  data.sections[0].groups[0].name = "";
  data.sections[0].groups[0].questions = [];
  const progress = getAuthoringProgress(data);
  assert.equal(progress.issues.length, 2);
  assert.ok(
    progress.issues.every((issue) => issue.path === "sections/s1/groups/g1"),
  );
});
test("ANNU requires instructions but never generated questions for setup readiness", () => {
  const data = definition();
  const group = data.sections[0].groups[0];
  delete group.questions;
  group.source = "annu";
  group.annu = { requirements: "", targetCount: 3, maxFollowUps: 1 };
  assert.match(getAuthoringProgress(data).issues[0].message, /Tell ANNU/);
  group.annu.requirements = "Ask about REST API design and authentication.";
  assert.equal(getAuthoringProgress(data).ready, true);
});
test("blank main, sub-, and cross-questions provide topic edit paths", () => {
  const data = definition();
  const question = data.sections[0].groups[0].questions[0];
  question.prompt = "";
  question.subquestions = [{ prompt: " " }];
  question.followUps = [{ prompt: "" }];
  const progress = getAuthoringProgress(data);
  assert.equal(progress.issues.length, 3);
  assert.ok(
    progress.issues.every((issue) => issue.path === "sections/s1/groups/g1"),
  );
});
test("interviewer, rubric names and rubric weights are review requirements", () => {
  const data = definition();
  data.interviewer = null;
  data.rubric = [{ name: "", weight: 50 }];
  const progress = getAuthoringProgress(data);
  assert.equal(progress.steps[0].ready, true);
  assert.equal(progress.steps[1].ready, true);
  assert.equal(progress.steps[2].ready, false);
  assert.deepEqual(
    progress.issues.map((issue) => issue.path),
    ["interviewer", "rules", "rules"],
  );
  data.rubric = [];
  assert.ok(
    getAuthoringProgress(data).issues.some(
      (issue) => issue.message === "Add evaluation criteria.",
    ),
  );
});
test("local readiness checks inherited timings including cross-question overrides", () => {
  const data = definition();
  const section = data.sections[0];
  section.ruleOverrides = { minimumSeconds: 100 };
  const question = section.groups[0].questions[0];
  question.followUps = [
    { prompt: "Give an example.", ruleOverrides: { responseSeconds: 30 } },
  ];
  let progress = getAuthoringProgress(data);
  assert.equal(progress.issues.length, 1);
  assert.match(progress.issues[0].message, /cross-question 1/);
  question.followUps[0].ruleOverrides.responseSeconds = null;
  assert.equal(getAuthoringProgress(data).ready, true);
  data.rules.responseSeconds = 0;
  progress = getAuthoringProgress(data);
  assert.equal(progress.ready, false);
  assert.ok(progress.issues.some((issue) => issue.path === "rules"));
});
test("section and topic weights are checked independently with rounding tolerance", () => {
  const data = definition();
  data.sections[0].weight = 50;
  data.sections[0].groups[0].weight = 99;
  assert.deepEqual(
    getAuthoringProgress(data).issues.map((issue) => issue.path),
    ["sections", "sections/s1"],
  );
  data.sections[0].weight = 100;
  data.sections[0].groups[0].weight = 99.9999;
  assert.equal(getAuthoringProgress(data).ready, true);
});
