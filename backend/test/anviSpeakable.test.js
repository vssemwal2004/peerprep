import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDefinition } from "../src/services/aiInterviewDefinition.js";
import { buildPlan, genericResumeQuestions, WARMUP_QID } from "../src/modules/anviInterview/anviInterview.plan.js";
import { staticSpeakableItems, textHashOf } from "../src/modules/anviInterview/anviInterview.speakable.js";

const definition = (sections, anvi = {}) => normalizeDefinition({
  title: "Speakable", role: "Backend Intern", experience: "fresher", difficulty: "medium",
  rules: { language: "English", responseSeconds: 90 },
  interviewer: { profileId: "p1", displayName: "ANVI" },
  sections, anvi,
});

const sections = [
  { id: "s1", name: "Core", groups: [
    { id: "g1", name: "APIs", questions: [
      { id: "q1", kind: "specific", prompt: "Question 1: Explain REST.", subquestions: [{ id: "a1", prompt: "Q2. How do you version it?" }],
        followUps: [{ id: "f1", prompt: "Why stateless?" }, { id: "f2", prompt: "  " }, { id: "f3", prompt: "What about question 3: caching?" }] },
      { id: "q2", kind: "topic", prompt: "caching strategies", followUps: [{ id: "f4", prompt: "When would you not cache?" }] },
      { id: "q3", kind: "resume", prompt: "Final-year project", followUps: [{ id: "f5", prompt: "What would you change?" }] },
      { id: "q4", kind: "specific", prompt: "", subquestions: [{ id: "a2", prompt: "Orphan part" }] },
    ] },
    { id: "g2", name: "SQL", source: "annu", annu: { targetCount: 2, requirements: "Joins." } },
  ] },
];

test("static speakable items: manual questions with parts, authored follow-ups, scored warm-up and resume fallbacks", async () => {
  const data = definition(sections, { warmup: { enabled: true, tellMeAboutYourself: true, scored: true }, resume: { mode: "optional" } });
  const items = staticSpeakableItems(data, ["English"], "Aoede");
  assert.deepEqual(items.map((item) => [item.id, item.kind]), [
    [WARMUP_QID, "warmup"],
    ["q1", "question"],
    ["q1:f0", "follow_up"],
    ["q1:f1", "follow_up"],
    ["q2:f0", "follow_up"],
    ...genericResumeQuestions().map((_, i) => [`resume-fallback-${i + 1}`, "resume_fallback"]),
  ]);
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  // "Question n:" labels are stripped, exactly as the plan speaks the item.
  assert.equal(byId.q1.text, "Explain REST. (a) How do you version it?");
  assert.equal(byId["q1:f1"].text, "What about question number 3: caching?");
  assert.ok(items.every((item) => item.language === "English" && item.voice === "Aoede" && item.textHash === textHashOf(item.text)));
  // Annu, topic and resume questions are per student: never listed. Neither is a part without its question.
  assert.ok(!items.some((item) => ["q2", "q3", "q3:f0", "q4"].includes(item.id) || item.id.startsWith("g2")));
  assert.ok(!items.some((item) => /Orphan part/.test(item.text)));

  // The hashes match the plan items they voice, so a plan item finds its pre-generated audio.
  const { plan } = await buildPlan(data, { runtimeMode: "hybrid", seed: "a1" });
  const planned = plan.find((item) => item.qid === "q1");
  assert.equal(planned.textHash, byId.q1.textHash);
  assert.deepEqual(planned.authoredFollowUps.map(textHashOf), [byId["q1:f0"].textHash, byId["q1:f1"].textHash]);
  assert.equal(plan.find((item) => item.qid === WARMUP_QID).textHash, byId[WARMUP_QID].textHash);
});

test("static speakable items are English only and skip warm-up or resume lines the interview does not use", () => {
  const data = definition(sections.map((section) => ({ ...section, groups: section.groups.map((group) => ({
    ...group, questions: group.questions?.filter((q) => q.kind !== "resume"),
  })) })), { warmup: { enabled: true, tellMeAboutYourself: true, scored: false } });
  const items = staticSpeakableItems(data, ["Hindi", "English", "English"]);
  assert.deepEqual(items.map((item) => item.id), ["q1", "q1:f0", "q1:f1", "q2:f0"]);
  assert.ok(items.every((item) => item.language === "English" && item.voice === ""));
  // DECISIONS #0: another language alone still gives the English lines once.
  assert.deepEqual(staticSpeakableItems(data, ["Hinglish"]).map((item) => item.language), ["English", "English", "English", "English"]);
  assert.deepEqual(staticSpeakableItems(null), []);
});
