import assert from "node:assert/strict";
import test from "node:test";
import { newDefinition, newGroup, newQuestion, newSection } from "../src/admin/ai-interviews/definition.js";
import {
  addLiveTopic,
  addQuestions,
  duplicateQuestion,
  estimate,
  isSimple,
  moveQuestion,
  primaryLive,
  questionEntries,
  removeLiveTopic,
  removeQuestion,
  restoreQuestion,
} from "../src/admin/ai-interviews/wizard/structure.js";
import { describeIssue, resolveStep, rubricTotal, stepErrors, voiceAccent } from "../src/admin/ai-interviews/wizard/steps.js";
import { englishOnly } from "../src/admin/ai-interviews/wizard/settings/model.js";
import { renderScript } from "../src/admin/ai-interviews/wizard/defaults.js";
import {
  SETTINGS_TABS,
  resolveSettingsTab,
  settingsTabStatus,
  tabForField,
  tabForFields,
} from "../src/admin/ai-interviews/wizard/settings/tabs.js";

const question = (prompt, extra = {}) => ({ ...newQuestion(), prompt, ...extra });

test("the first question creates one hidden section and group with full weights", () => {
  const { data } = addQuestions(newDefinition(), [question("Explain REST.")]);
  assert.equal(data.sections.length, 1);
  const [section] = data.sections;
  assert.equal(section.name, "Interview");
  assert.equal(section.weight, 100);
  assert.equal(section.groups.length, 1);
  assert.equal(section.groups[0].name, "Questions");
  assert.equal(section.groups[0].source, "manual");
  assert.equal(section.groups[0].weight, 100);
  assert.equal(isSimple(data), true);
  assert.deepEqual(questionEntries(data).map((e) => [e.number, e.question.prompt]), [[1, "Explain REST."]]);
});

test("move, duplicate, delete and undo keep the flat order", () => {
  let { data } = addQuestions(newDefinition(), [question("A"), question("B"), question("C")]);
  const groupId = data.sections[0].groups[0].id;
  data = moveQuestion(data, groupId, 2, -1);
  assert.deepEqual(questionEntries(data).map((e) => e.question.prompt), ["A", "C", "B"]);
  assert.deepEqual(
    questionEntries(moveQuestion(data, groupId, 0, -1)).map((e) => e.question.prompt),
    ["A", "C", "B"],
    "moving the first question up is a no-op",
  );
  const first = data.sections[0].groups[0].questions[0];
  data = duplicateQuestion(data, groupId, first.id);
  const copy = data.sections[0].groups[0].questions[1];
  assert.equal(copy.prompt, "A");
  assert.notEqual(copy.id, first.id);
  const { data: removed, removed: undo } = removeQuestion(data, groupId, first.id);
  assert.deepEqual(questionEntries(removed).map((e) => e.question.prompt), ["A", "C", "B"]);
  const restored = restoreQuestion(removed, undo);
  assert.deepEqual(questionEntries(restored).map((e) => e.question.id)[0], first.id);
});

test("live questions share weights with written ones and an emptied hidden group is dropped", () => {
  let { data } = addQuestions(newDefinition(), [question("A")]);
  let topicId;
  ({ data, groupId: topicId } = addLiveTopic(data, { name: "APIs", annu: { requirements: "Ask about APIs", targetCount: 3 } }));
  assert.deepEqual(data.sections[0].groups.map((g) => [g.source, g.weight]), [["manual", 50], ["annu", 50]]);
  assert.equal(primaryLive(data).annu.targetCount, 3);
  assert.equal(primaryLive(data).questions, undefined, "a live group never carries a questions list");
  const groupId = data.sections[0].groups[0].id;
  const { data: liveOnly } = removeQuestion(data, groupId, data.sections[0].groups[0].questions[0].id);
  assert.deepEqual(liveOnly.sections[0].groups.map((g) => [g.source, g.weight]), [["annu", 100]]);
  const off = removeLiveTopic(liveOnly, topicId);
  assert.equal(off.sections[0].groups.length, 0);
});

test("a multi-section interview is not simple and numbers questions across sections", () => {
  const a = newSection("Technical"), b = newSection("Behavioral");
  a.groups = [{ ...newGroup(), questions: [question("A1"), question("A2")] }];
  b.groups = [{ ...newGroup(), questions: [question("B1")] }];
  const data = { ...newDefinition(), sections: [a, b] };
  assert.equal(isSimple(data), false);
  assert.deepEqual(questionEntries(data).map((e) => [e.number, e.sectionId === b.id]), [[1, false], [2, false], [3, true]]);
  const { data: added } = addQuestions(data, [question("New")]);
  assert.equal(added.sections[0].groups[0].questions.at(-1).prompt, "New", "new questions join the first written group");
});

test("estimate mirrors the server budget and marks", () => {
  let { data } = addQuestions(newDefinition(), [question("A", { marks: 20, maxFollowUps: 1 }), question("B")]);
  ({ data } = addLiveTopic(data, { name: "X", annu: { requirements: "x", targetCount: 2, maxFollowUps: 0 } }));
  const result = estimate(data);
  assert.equal(result.questions, 2);
  assert.equal(result.live, 2);
  assert.equal(result.marks, 20 + 10 + 20);
  // (15 + 120) seconds per turn: A + its follow-up + B + two live questions.
  assert.equal(result.seconds, 135 * 5);
  assert.equal(result.minutes, 12);
  data.rules.responseSeconds = null;
  assert.equal(estimate(data).unlimited, true);
});

test("step checks flag the exact fields to focus", () => {
  const data = newDefinition();
  assert.deepEqual(Object.keys(stepErrors("basics", data)), ["title", "role", "experience", "difficulty"]);
  assert.ok(stepErrors("questions", data).questions);
  const { data: withBlank } = addQuestions(data, [question("")]);
  const groupId = withBlank.sections[0].groups[0].id;
  assert.ok(stepErrors("questions", withBlank)[`question:${groupId}:0`]);
  assert.deepEqual(stepErrors("anvi", data), {}, "the default rubric totals 100");
  assert.equal(rubricTotal(data.rubric), 100);
  data.rubric[0].weight = 30;
  assert.match(stepErrors("anvi", data).rubric, /add up to 90%/);
});

test("server issues map to friendly messages and the step and field to fix", () => {
  const { data } = addQuestions(newDefinition(), [question("A"), question("")]);
  const section = data.sections[0], group = section.groups[0];
  assert.deepEqual(describeIssue({ path: "basics", message: "Add a job role." }, data), {
    step: "basics",
    field: "role",
    message: "Add the job role this interview is for.",
  });
  assert.deepEqual(
    describeIssue({ path: `sections/${section.id}/groups/${group.id}`, message: "Question 2: Add the main question." }, data),
    { step: "questions", field: `question:${group.id}:1`, message: "Question 2 is empty. Write it, or delete the card." },
  );
  assert.equal(describeIssue({ path: "rules", message: "Weights must total 100%." }, data).field, "rubric");
  assert.equal(describeIssue({ path: "interviewer", message: "Select an interviewer profile." }, data).step, "anvi");
  assert.equal(describeIssue({ path: "sections", message: "Weights must total 100%." }, data).advanced, true);
});

test("every ANVI settings field a Fix link names maps to the sub-tab that renders it", () => {
  const { data } = addQuestions(newDefinition(), [question("A")]);
  const anviIssues = [
    { path: "interviewer", message: "Resume questions need a resume. Set resume to optional or required." },
    { path: "interviewer", message: "Select an interviewer profile." },
    { path: "rules", message: "Response limit must be positive." },
    { path: "rules", message: "Weights must total 100%." },
  ].map((issue) => describeIssue(issue, data));
  assert.deepEqual(anviIssues.map((issue) => [issue.field, tabForField(issue.field)]), [
    ["resume", "candidate"],
    ["interviewer", "advanced"],
    ["answerTime", "advanced"],
    ["rubric", "scoring"],
  ]);
  for (const [field, tab] of [["voice", "voice"], ["voiceLanguage", "voice"], ["language", "voice"], ["persona", "voice"], ["introduction", "voice"], ["avatar", "voice"], ["turns", "conversation"], ["warmup", "conversation"], ["conduct", "conversation"], ["terms", "candidate"], ["resumeSources", "candidate"], ["proctoring", "proctoring"], ["proctoringCamera", "proctoring"]])
    assert.equal(tabForField(field), tab, field);
  assert.equal(tabForField("title"), null);
  assert.equal(tabForFields(["title", "rubric"]), "scoring", "the first field with a tab wins");
  assert.equal(tabForFields([]), null);
  assert.equal(resolveSettingsTab("proctoring"), "proctoring");
  assert.equal(resolveSettingsTab("nope"), null);
  assert.equal(resolveSettingsTab("personality"), "voice", "old Personality links open Voice & personality");
  assert.deepEqual(SETTINGS_TABS.map((t) => t.id), ["voice", "conversation", "candidate", "proctoring", "scoring", "advanced"]);
});

test("ANVI settings tab status chips and error dots", () => {
  const data = newDefinition();
  let status = settingsTabStatus(data);
  assert.deepEqual(
    Object.fromEntries(Object.entries(status).map(([id, s]) => [id, s.summary])),
    { voice: "Aoede voice · warm tone", conversation: "2 conduct rules on · warm-up on", candidate: "No resume · no terms", proctoring: "AI proctoring off", scoring: "3 criteria", advanced: "No interviewer profile yet" },
  );
  assert.deepEqual(
    Object.entries(status).filter(([, s]) => s.badge).map(([id]) => id),
    [],
    "no badges while everything optional is off",
  );
  assert.ok(Object.values(status).every((s) => !s.error), "a new interview has nothing to fix");
  data.rubric[0].weight += 10;
  data.anvi = { ...data.anvi, proctoring: { enabled: true, fullscreen: "off", tabSwitch: "off", refresh: "off", blockRightClick: false, blockCopyPaste: false, blockShortcuts: false } };
  status = settingsTabStatus(data, { interviewer: { error: "Network down" } });
  assert.equal(status.scoring.error, true);
  assert.equal(status.scoring.summary, "Rubric weights must total 100%");
  assert.deepEqual(status.proctoring.badge, { text: "No checks", tone: "warn" });
  data.anvi.proctoring.blockCopyPaste = true;
  assert.deepEqual(settingsTabStatus(data).proctoring.badge, { text: "On", tone: "on" });
  assert.equal(status.advanced.error, true, "a failed default profile marks Advanced");
  assert.equal(settingsTabStatus(newDefinition(), { errors: { resume: "x" } }).candidate.error, true, "passed errors mark their tab");
});

test("ANVI interviews are English only: every edit saves the English language settings", () => {
  const english = { primary: "English", studentChoice: [], strict: true, onOtherLanguage: "remind_and_flag" };
  const old = {
    ...newDefinition(),
    rules: { ...newDefinition().rules, language: "Hinglish" },
    anvi: { voice: { name: "Kore", languageCode: "hi-IN" }, language: { primary: "Hindi", studentChoice: ["English"], strict: false, onOtherLanguage: "ignore" }, persona: { tone: "formal" } },
  };
  const next = englishOnly(old);
  assert.equal(next.rules.language, "English");
  assert.deepEqual(next.anvi.language, english);
  assert.deepEqual(next.anvi.voice, { name: "Kore", languageCode: "en-IN" }, "the Hindi locale becomes Indian English");
  assert.deepEqual(next.anvi.persona, { tone: "formal" }, "other settings are kept");
  assert.equal(englishOnly(next), next, "a conforming draft is returned unchanged, so nothing is re-saved");
  assert.equal(voiceAccent(old), "Indian English");
  assert.equal(englishOnly(null), null);
});

test("old builder step ids open the matching wizard step", () => {
  assert.equal(resolveStep("sections"), "questions");
  assert.equal(resolveStep("interviewer"), "anvi");
  assert.equal(resolveStep("rules"), "anvi");
  assert.equal(resolveStep("preview"), "review");
  assert.equal(resolveStep("nope"), null);
});

test("script preview fills variables like the runtime", () => {
  const { data } = addQuestions({ ...newDefinition(), role: "Backend developer", companyName: "Acme" }, [question("A")]);
  assert.equal(
    renderScript("Hi {name}, a {role} interview at {company}: {count} questions, about {duration}.", data),
    "Hi Priya, a Backend developer interview at Acme: 1 questions, about 3 minutes.",
  );
});
