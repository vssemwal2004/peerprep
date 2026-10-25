import assert from "node:assert/strict";
import fs from "node:fs";
import { after, afterEach, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// The ANVI report: content model (every number straight from the server, new v2 fields, missing-field hiding), the
// on-screen report (header card, Summary · Question-wise feedback · Analysis · Action items, Proctoring details), the
// react-pdf download with its print fallback, and the completion states.
// Rendered in jsdom through Vite's SSR loader.
let dom, server, root, createRoot, AnviReport, AnviCompletion, ThemeProvider, model, printModule, downloadModule;
const globals = ["window", "document", "navigator", "HTMLElement", "localStorage", "ResizeObserver", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const FRONTEND = fileURLToPath(new URL("..", import.meta.url));

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/student/ai-interviews/room/a1", pretendToBeVisual: true });
  const values = { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name in values ? values[name] : dom.window[name] });
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: FRONTEND,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  AnviReport = (await server.ssrLoadModule("/src/student/anvi/AnviReport.jsx")).default;
  AnviCompletion = (await server.ssrLoadModule("/src/student/anvi/AnviCompletion.jsx")).default;
  ({ ThemeProvider } = await server.ssrLoadModule("/src/context/ThemeContext.jsx"));
  model = await server.ssrLoadModule("/src/student/anvi/report/reportModel.js");
  printModule = await server.ssrLoadModule("/src/student/anvi/report/print.js");
  downloadModule = await server.ssrLoadModule("/src/student/anvi/report/download.js");
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
after(async () => {
  await server?.close();
  dom?.window.close();
  for (const name of globals) {
    if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name));
    else delete globalThis[name];
  }
});

const render = async (element) => {
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, null, h(ThemeProvider, null, element))));
  await tick();
};
const tabs = () => [...document.querySelectorAll('[role="tab"]')];
const tabNamed = (pattern) => tabs().find((tab) => pattern.test(tab.textContent));
const click = (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
const key = (element, name) => act(async () => { element.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true })); });
const app = () => document.getElementById("app");
const printRoot = () => document.querySelector("body > [data-anvi-print]");
const waitFor = async (check, label) => {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await tick(10);
  }
  assert.fail(`timed out: ${label}`);
};

// The student view of GET /student/ai-interviews/attempts/:id (no flags, expected answers or event log).
const report = {
  id: "a1", status: "ready", report: "ready", partial: true, endReason: "ended_by_student", title: "Backend practice", role: "Backend engineer", companyName: "Acme", mode: "practice",
  language: "English", startedAt: "2026-10-22T10:00:00Z", endedAt: "2026-10-22T10:20:00Z", scoredAt: "2026-10-22T10:21:00Z",
  terms: { text: "No notes.", acceptedAt: "2026-10-22T09:59:00Z" }, resumeSource: "upload",
  overall: { score: 12.5, max: 30, percent: 42, band: "Needs work", partial: true, answered: 2, total: 3, strengths: ["Clear definition of REST"], improvements: ["Give a concrete example"] },
  bySection: [{ sectionId: "s1", name: "Technical", score: 12.5, max: 20, percent: 63 }, { sectionId: "s2", name: "Behavioral", score: 0, max: 10, percent: 0 }],
  byCompetency: [{ name: "APIs", percent: 75 }, { name: "Teamwork", percent: 0 }],
  byRubric: [{ id: "r1", name: "Clarity", weight: 100, percent: 63 }, { id: "r2", name: "Depth", weight: 0, percent: null }],
  actionItems: ["Explain how a cache TTL is chosen, with one example.", "Practise answering the conflict prompt out loud.", "Structure each answer with an example."],
  items: [
    { n: 1, sectionName: "Technical", competency: "APIs", questionText: "Explain REST.", answerText: "REST is stateless and resource based.", status: "answered", marks: 7.5, maxMarks: 10, percentCorrect: 75,
      feedback: "You defined REST well.", expectedKeyPoints: ["Stateless", "Resources", "Caching"], matched: ["Stateless"], partial: ["Resources"], missed: ["Caching"],
      metrics: { words: 6, wpm: 120, fillerCount: 1 } },
    { n: 2, sectionName: "Technical", competency: "APIs", questionText: "Explain caching.", answerText: "Use a TTL.", status: "answered", marks: 5, maxMarks: 10, percentCorrect: 50,
      feedback: "Add detail.", expectedKeyPoints: [], matched: [], partial: [], missed: [], metrics: { words: 3, wpm: 90, fillerCount: 2 } },
    { n: 3, sectionName: "Behavioral", competency: "Teamwork", questionText: "Tell me about a conflict.", answerText: "", status: "not_attempted", marks: 0, maxMarks: 10, percentCorrect: 0,
      feedback: "Not attempted.", expectedKeyPoints: ["Situation"], matched: [], partial: [], missed: ["Situation"], metrics: { words: 0, wpm: null, fillerCount: 0 } },
  ],
};

const proctoringSettings = {
  enabled: true, fullscreen: "required", pauseOutsideFullscreen: true, tabSwitch: "warn", refresh: "record",
  blockRightClick: true, blockCopyPaste: true, blockShortcuts: false, warnings: 3, maxViolations: 4, onLimit: "flag",
  ai: { enabled: true, detectMobile: true, detectMultiplePersons: true, detectNoFace: true, detectFaceOutOfFrame: false, detectLookingAway: false },
};
const adminProctoring = {
  settings: proctoringSettings,
  events: [
    { type: "fullscreen_exit", at: "2026-10-22T10:05:10Z", questionN: 2 },
    { type: "right_click", at: "2026-10-22T10:05:20Z", questionN: 2 },
    { type: "fullscreen_enter", at: "2026-10-22T10:05:40Z", questionN: 2 },
    { type: "ai_mobile_detected", at: "2026-10-22T10:07:00Z", questionN: 2, severity: "high", confidence: 0.87 },
    { type: "rejoin", at: "2026-10-22T10:09:00Z", questionN: 3 },
    { type: "ai_no_face", at: "2026-10-22T10:11:00Z", questionN: 3, severity: "medium", confidence: 0.6 },
  ],
  counts: { fullscreen_exit: 1, tab_hidden: 0, window_blur: 0, rejoin: 1, right_click: 1, copy_paste: 0, shortcut: 0, ai_mobile_detected: 1, ai_no_face: 1 },
  violations: 4,
  endedForViolations: false,
};
// The admin view of GET /ai-interviews/reports/attempts/:id, as AnviReportsPanel passes it (scoredAt from eval).
const adminReport = {
  ...report, student: { name: "Asha Verma", email: "asha@example.edu", studentId: "S-101" }, warmup: "ANVI: Hello!\nStudent: Hi.", proctoring: adminProctoring,
  termsAcceptedAt: "2026-10-22T09:59:00Z", terms: undefined, flags: ["wellbeing_concern"],
  items: report.items.map((item, index) => ({ ...item, qid: `q${index + 1}`, expectedAnswer: index === 0 ? "AUTHORED answer" : "", flags: index === 0 ? ["other_language", "off_topic_request"] : [] })),
};
const studentReport = { ...report, proctoring: { enabled: true, counts: { fullscreen_exit: 1, tab_hidden: 2, window_blur: 0, rejoin: 0 }, violations: 3, endedForViolations: false } };

// ---- Content model ------------------------------------------------------------

test("model: every score is the server's value; counts and fluency come from the saved answers", () => {
  const m = model.buildReportModel(report, { studentName: "Asha Verma" });
  assert.equal(m.audience, "student");
  assert.deepEqual(m.score && { percent: m.score.percent, marks: m.score.marks, band: m.score.band, tone: m.score.tone }, { percent: 42, marks: { score: 12.5, max: 30 }, band: "Needs work", tone: "critical" });
  assert.equal(m.score.summary, "2 responses evaluated. Strongest in Technical (63%), most room to grow in Behavioral (0%).");
  assert.deepEqual(m.kpis.map((kpi) => [kpi.key, kpi.value, kpi.detail]), [
    ["keyPoints", "1 of 4", "1 partly · 2 missed"],
    ["length", "5 words", "9 words in total"],
    ["pace", "105 wpm", "A little slow"],
    ["fillers", "3", "um, uh, like, basically…"],
  ], "fluency of answered items only (the unanswered item's metrics are left out)");
  assert.deepEqual(m.meta.map((item) => [item.key, item.value, item.detail || ""]), [
    ["candidate", "Asha Verma", ""], ["date", "22 Oct 2026, 3:30 pm IST", ""], ["duration", "20 min", ""], ["status", "Ended early", "Ended by the student"],
  ]);
  assert.equal(m.subtitle, "Backend engineer · Acme");
  assert.equal(m.kind, "Practice");
  assert.deepEqual(m.sections.map((row) => [row.name, row.percent, row.detail]), [["Technical", 63, "12.5 / 20"], ["Behavioral", 0, "0 / 10"]]);
  assert.deepEqual(m.competencies.map((row) => [row.name, row.percent]), [["APIs", 75], ["Teamwork", 0]]);
  assert.deepEqual(m.criteria.map((row) => [row.name, row.percent, row.detail]), [["Clarity", 63, "100% weight"]], "an unscored criterion (null) is left out, never shown as 0");
  const [first, second, third] = m.responses;
  assert.deepEqual(first.marks, { score: 7.5, max: 10 });
  assert.equal(first.percent, 75);
  assert.deepEqual(first.keyPoints, [{ text: "Stateless", verdict: "matched" }, { text: "Resources", verdict: "partial" }, { text: "Caching", verdict: "missed" }]);
  assert.deepEqual(first.keyPointCounts, { matched: 1, partial: 1, missed: 1 });
  assert.deepEqual(first.metrics.map((metric) => metric.label), ["6 words", "120 words / min", "1 filler"]);
  assert.equal(second.keyPoints.length, 0);
  assert.equal(third.answered, false);
  assert.equal(third.statusLabel, "Not attempted");
  assert.equal(third.feedback, "", "the evaluator's 'Not attempted.' is not repeated as feedback");
  assert.deepEqual(third.metrics, [], "no fluency for an unanswered item");
  assert.deepEqual(m.setup.map((row) => [row.key, row.value]), [["terms", "22 Oct 2026, 3:29 pm IST"], ["resume", "Uploaded file"]], "English is the only interview language, so no language row");
  assert.equal(m.warmup, "", "the student copy carries no warm-up");
  assert.equal(m.integrity, null);
  assert.equal(model.reportPdfFileName(report, "Asha / Verma"), "ANVI-Report-Asha-Verma-Backend-practice-2026-10-22.pdf");
  assert.equal(model.reportPdfFileName({ title: "Round 1" }, ""), "ANVI-Report-Round-1.pdf", "unknown candidate and date are left out");
  assert.equal(model.durationLabel("2026-10-22T10:00:00Z", "2026-10-22T11:05:00Z"), "1 h 5 min");
  assert.deepEqual(model.setupRows({ language: "Hinglish" }).map((row) => row.key), ["resume", "language"]);
});

test("model: missing data is left out instead of showing 0 or dashes", () => {
  const m = model.buildReportModel({ title: "Round 1", items: [{ qid: "q1", questionText: "Explain REST.", answerText: "Stateless.", status: "answered", marks: null, maxMarks: 10, percentCorrect: null }] });
  assert.equal(m.score, null, "no overall: no score panel");
  assert.deepEqual(m.kpis, [], "no key points or metrics: no tiles");
  assert.deepEqual(m.meta.map((item) => item.key), ["status"], "no candidate, date or duration");
  assert.equal(m.responses[0].marks, null);
  assert.equal(m.responses[0].percent, null);
  assert.deepEqual([m.sections, m.competencies, m.criteria, m.strengths, m.actions], [[], [], [], [], []]);
  assert.deepEqual(model.buildReportModel({ overall: { score: 3 } }).score, null, "an overall without a percent is not a score");
});

test("model: the admin copy adds candidate ids, flags, the warm-up and the expected answer", () => {
  const m = model.buildReportModel(adminReport, { audience: "admin", showExpectedAnswer: true });
  assert.deepEqual(m.candidate, { name: "Asha Verma", ids: "S-101 · asha@example.edu" });
  assert.equal(m.meta[0].detail, "S-101 · asha@example.edu");
  assert.deepEqual(m.flags, [{ key: "wellbeing_concern", label: "Wellbeing concern raised", tone: "caution" }]);
  assert.deepEqual(m.responses[0].flags.map((flag) => flag.label), ["Answered in another language", "Off-topic request"]);
  assert.equal(m.responses[0].expectedAnswer, "AUTHORED answer");
  assert.equal(m.warmup, "ANVI: Hello!\nStudent: Hi.");
  assert.equal(m.integrityFull, true);
  assert.equal(m.integrity.violations, 4);
  assert.equal(model.buildReportModel(adminReport, { audience: "admin" }).responses[0].expectedAnswer, "", "only with showExpectedAnswer");
  assert.equal(model.buildReportModel(adminReport, { audience: "student", showExpectedAnswer: true }).responses[0].expectedAnswer, "", "never for students");
  assert.deepEqual(model.flagList(["prompt_injection", "silent", "prompt_injection", "new_flag"]).map((flag) => [flag.label, flag.tone]),
    [["Tried to redirect the interviewer", "critical"], ["No answer heard", "neutral"], ["New flag", "neutral"]]);
});

test("model: proctoring shape, blocked actions, pauses and onLimit", () => {
  assert.equal(model.proctoringOf(report), null, "no record: not proctored");
  assert.equal(model.proctoringOf({ proctoring: { enabled: false, counts: {} } }), null, "the student view of an unproctored attempt");
  assert.equal(model.proctoringOf({ proctoring: { settings: { enabled: false }, counts: {} } }), null, "disabled: hidden");
  const admin = model.proctoringOf(adminReport);
  assert.equal(admin.violations, 4);
  assert.equal(admin.ai.total, 2);
  assert.equal(admin.ai.counts.ai_mobile_detected, 1);
  assert.deepEqual(admin.ai.events.map((event) => [event.type, event.questionN, model.confidenceLabel(event.confidence)]), [["ai_mobile_detected", 2, "87%"], ["ai_no_face", 3, "60%"]]);
  assert.equal(model.proctoringOf(studentReport).ai, null, "no camera data: no camera block");
  assert.ok(model.proctoringRules(proctoringSettings).includes("Camera AI checks: phone, other persons, no face"));
  assert.deepEqual(admin.blocked, { right_click: 1, copy_paste: 0, shortcut: 0 });
  assert.equal(admin.onLimit, "flag");
  assert.equal(admin.pauses.length, 1, "fullscreen exit to re-entry is one pause");
  assert.equal(admin.pauses[0].seconds, 30);
  const student = model.proctoringOf(studentReport);
  assert.equal(student.events, null, "the student copy has no event log");
  assert.equal(student.counts.tab_hidden, 2);
  const explicit = model.proctoringOf({ proctoring: { settings: { enabled: true }, events: [{ type: "paused", at: "2026-10-22T10:00:00Z" }, { type: "resumed", at: "2026-10-22T10:01:05Z" }] } });
  assert.equal(model.secondsLabel(explicit.pauses[0].seconds), "1 min 5 s");
  const stored = model.proctoringOf({ proctoring: { pauses: [{ from: "2026-10-22T10:00:00Z", to: null }] } });
  assert.equal(stored.pauses[0].to, null, "an unresumed pause stays open");
  assert.ok(model.proctoringOf({ endReason: "proctoring_limit" }).endedForViolations);
  assert.ok(model.proctoringRules(proctoringSettings).includes("Limit 4 violations · then flagged only"));
});

test("model: camera restored is information, not a detection; camera pauses are labelled", () => {
  const camera = model.proctoringOf({ proctoring: {
    settings: { ...proctoringSettings },
    events: [
      { type: "ai_camera_blocked", at: "2026-10-22T10:01:00Z", questionN: 1 },
      { type: "ai_camera_restored", at: "2026-10-22T10:01:30Z", questionN: 1 },
    ],
    pauses: [{ from: "2026-10-22T10:01:00Z", to: "2026-10-22T10:01:30Z", reason: "camera_blocked", questionN: 1 }],
    violations: 1,
  } });
  assert.deepEqual(camera.ai.events.map((event) => event.type), ["ai_camera_blocked"], "only detections are in the camera timeline");
  assert.equal(camera.ai.total, 1);
  assert.equal(model.proctorEventLabel("ai_camera_restored"), "Camera restored");
  assert.equal(model.PROCTOR_EVENTS.ai_camera_restored.violation, false);
  assert.equal(model.proctorEventLabel(camera.pauses[0].reason), "Camera blocked");
  assert.equal(model.isAiDetection("ai_camera_restored"), false);
  assert.equal(model.isAiDetection("ai_no_face"), true);
});

// ---- Report v2: new evaluation fields ----------------------------------------------

// An attempt scored with the v2 evaluation: per-item dimensions, functional / non-functional, answer times,
// per-item strengths / improvements, an overall narrative and dimensions, skills and a cohort comparison.
const dims = (knowledge, articulation, fluency, confidence, professionalism) => ({ knowledge, articulation, fluency, confidence, professionalism });
const v2Report = {
  ...report, id: "a2", partial: false, endReason: "completed", mode: "mock", difficulty: "medium",
  overall: {
    ...report.overall, percent: 69, band: "Fair", partial: false,
    functional: 68, nonFunctional: 74, dimensions: dims(68, 74, 70, 66, 88),
    summary: "You explained REST clearly. Your caching answer was short. Practise the conflict story.",
  },
  skills: [{ name: "APIs", score: 75, stars: 4, note: "Clear definitions." }, { name: "Caching", score: 50, note: "Add detail." }, { name: "Teamwork", score: 0, stars: 0 }],
  cohort: { count: 7, percent: 61, functional: 60, nonFunctional: 70, dimensions: dims(60, 70, 66, 62, 80) },
  items: [
    { ...report.items[0], qid: "q1", answerSeconds: 75, functional: 75, nonFunctional: 80, dimensions: dims(80, 82, 78, 76, 90), strengths: ["Defined REST precisely"], improvements: [] },
    { ...report.items[1], qid: "q2", answerSeconds: 30, functional: 50, nonFunctional: 60, dimensions: dims(50, 62, 55, 52, 84), strengths: [], improvements: ["Explain how the TTL is chosen"],
      metrics: { words: 3, wpm: 170, fillerCount: 2 } },
    { ...report.items[2], qid: "q3", dimensions: dims(10, 10, 10, 10, 10), answerSeconds: 0 },
  ],
};

test("model v2: dimensions, split, skills, cohort and per-question fields come from the stored evaluation", () => {
  const m = model.buildReportModel(v2Report, { studentName: "Asha Verma" });
  assert.equal(m.narrative, "You explained REST clearly. Your caching answer was short. Practise the conflict story.");
  assert.deepEqual(m.split, { functional: 68, nonFunctional: 74, cohortFunctional: 60, cohortNonFunctional: 70 });
  assert.deepEqual(m.metrics.map((metric) => [metric.key, metric.percent, metric.band, metric.cohort]), [
    ["knowledge", 68, "Fair", 60], ["articulation", 74, "Good", 70], ["fluency", 70, "Good", 66], ["confidence", 66, "Fair", 62], ["professionalism", 88, "Excellent", 80],
  ]);
  const knowledge = m.metrics[0];
  assert.deepEqual(knowledge.wentWell, [{ text: "Defined REST precisely", question: "Q1" }], "strengths of the answers that scored 70+ on the metric, tagged");
  assert.deepEqual(knowledge.improve, [{ text: "Explain how the TTL is chosen", question: "Q2" }]);
  assert.match(knowledge.facts[0], /Highest in Q1 \(80%\), lowest in Q2 \(50%\)/);
  assert.ok(m.metrics.every((metric) => /transcript/i.test(metric.basis)), "every metric says it was judged from the transcript");
  assert.deepEqual(m.skills.map((skill) => [skill.name, skill.percent, skill.stars]), [["APIs", 75, 4], ["Caching", 50, 2.5], ["Teamwork", 0, 0]], "stars as stored, else round(score / 20 * 2) / 2");
  assert.equal(m.cohort.count, 7);
  assert.deepEqual(m.chips.map((chip) => [chip.key, chip.label]), [["role", "Backend engineer"], ["company", "Acme"], ["type", "Mock interview"], ["difficulty", "Medium"], ["duration", "20 min"]]);
  const [first, second, third] = m.responses;
  assert.deepEqual([first.n, first.label, first.functional, first.nonFunctional, first.time, first.wpm, first.pace.label, first.fillers], [1, "Q1", 75, 80, "1 min 15 s", 120, "Good pace", 1]);
  assert.deepEqual(first.dimensions.map((dimension) => dimension.percent), [80, 82, 78, 76, 90]);
  assert.equal(second.pace.label, "Too fast");
  assert.equal(second.fillerRate, 66.7);
  assert.deepEqual([third.dimensions, third.functional, third.time, third.pace], [[], null, "", null], "an unanswered item shows no metrics");
  const { analysis } = m;
  assert.equal(analysis.dimensionRadar.cohort, true);
  assert.deepEqual(analysis.dimensionRadar.rows[0], { key: "knowledge", label: "Knowledge", you: 68, cohort: 60 });
  assert.equal(analysis.skillRadar.title, "Skills");
  assert.deepEqual(analysis.questions.map((row) => [row.label, row.percent, row.index]), [["Overall", 69, -1], ["Q1", 75, 0], ["Q2", 50, 1], ["Q3", 0, 2]]);
  assert.equal(analysis.cohortPercent, 61);
  assert.deepEqual(analysis.pace.map((row) => [row.label, row.wpm]), [["Q1", 120], ["Q2", 170]]);
  assert.deepEqual([analysis.fillers.total, analysis.fillers.perHundred], [3, 33.3]);
  assert.deepEqual(model.reportTabs(m).map((tab) => tab.id), ["summary", "questions", "analysis", "actions"]);
});

test("model v2: an older attempt without the new fields hides those blocks; a small cohort is never shown", () => {
  const m = model.buildReportModel(report);
  assert.deepEqual([m.narrative, m.split, m.metrics, m.skills, m.cohort], ["", null, [], [], null]);
  assert.equal(m.analysis.dimensionRadar, null);
  assert.equal(m.analysis.skillRadar, null, "two competencies are too few for a radar");
  assert.equal(m.analysis.questions.length, 4, "the question chart still works from percentCorrect");
  assert.ok(m.responses.every((response) => response.dimensions.length === 0 && response.functional === null && response.time === ""));
  const few = model.buildReportModel({ ...v2Report, cohort: { count: 4, percent: 50, dimensions: dims(1, 1, 1, 1, 1) } });
  assert.equal(few.cohort, null, "fewer than 5 attempts: no comparison");
  assert.equal(few.analysis.dimensionRadar.cohort, false);
  assert.ok(few.metrics.every((metric) => metric.cohort === null));
  assert.equal(model.cohortOf({ cohort: null }), null);
  const competencies = model.buildReportModel({ ...report, byCompetency: [{ name: "A", percent: 10 }, { name: "B", percent: 20 }, { name: "C", percent: 30 }] });
  assert.equal(competencies.analysis.skillRadar.title, "Competencies", "older attempts chart their competencies instead");
  assert.deepEqual(model.reportTabs(model.buildReportModel({ title: "x", items: [] })).map((tab) => tab.id), ["summary", "questions"], "no charts or actions: no tabs for them");
  assert.deepEqual(model.dimensionsOf({ knowledge: "x", fluency: 140, confidence: null }), { fluency: 100 });
  assert.equal(model.starsOf(undefined, 73), 3.5);
});

// ---- Rendered report ----------------------------------------------------------

test("header: logo, score ring and band, title chips, candidate and date, Download PDF", async () => {
  await render(h(AnviReport, { attempt: report }));
  const header = app().querySelector("[data-report-header]");
  assert.ok(header.querySelector('[data-report-logo] img[alt="PeerPrep"]'), "PeerPrep logo");
  assert.match(header.textContent, /AI Interview Report/);
  assert.equal(app().querySelector("h1").textContent, "Backend practice");
  assert.deepEqual([...header.querySelectorAll("[data-report-chips] li")].map((chip) => chip.textContent), ["Backend engineer", "Acme", "Practice", "20 min"]);
  const meta = header.querySelector("[data-report-meta]").textContent;
  assert.ok(meta.includes("22 Oct 2026, 3:30 pm IST") && meta.includes("Ended early") && meta.includes("Ended by the student") && meta.includes("Asha") === false, meta);
  const score = header.querySelector("[data-report-score]");
  assert.ok(score.querySelector('[role="img"][aria-label="Score 42 percent, Needs work"]'));
  assert.match(score.textContent, /12\.5 \/ 30 marks/);
  assert.match(score.textContent, /Needs work/);
  assert.match(header.querySelector("[data-report-flags]").textContent, /Ended early — only the saved responses were evaluated/);
  assert.match(app().querySelector("[data-report-summary]").textContent, /^2 responses evaluated\. Strongest in Technical \(63%\)/);
  assert.match(header.querySelector("[data-report-download]").textContent, /Download PDF/);
  assert.equal(app().querySelector("[data-report-integrity-chip]"), null, "no Proctoring details without proctoring");
});

test("summary of an older attempt: key figures, breakdowns, strengths and setup; new blocks are hidden", async () => {
  await render(h(AnviReport, { attempt: report }));
  const panel = app().querySelector('[role="tabpanel"]');
  const kpis = panel.querySelector("[data-report-kpis]").textContent;
  for (const part of ["Key points covered", "1 of 4", "5 words", "105 wpm", "Filler words"]) assert.ok(kpis.includes(part), `${part} in ${kpis}`);
  assert.ok(panel.querySelector('[aria-label="Score by section"]').textContent.includes("12.5 / 20"));
  assert.ok(panel.querySelector('[aria-label="Score by competency"]'), "competencies stand in for skills");
  assert.ok(panel.querySelector('[aria-label="Score by criterion"]').textContent.includes("Clarity"));
  assert.match(panel.textContent, /Clear definition of REST/);
  assert.match(panel.textContent, /Give a concrete example/);
  for (const selector of ["[data-report-overall]", "[data-report-metrics]", "[data-report-skills]", "[data-report-split]"]) assert.equal(panel.querySelector(selector), null, selector);
  assert.match(panel.querySelector("[data-report-setup]").textContent, /Interview setup.*Uploaded file/);
  assert.match(app().querySelector("[data-report-footer]").textContent, /AI-generated — may contain mistakes\..*review the responses before making any decision/);
  assert.doesNotMatch(app().textContent, /volume|decibel|pitch|eye contact/i, "audio and video traits are never shown");
});

test("summary v2: narrative, functional / non-functional pills, success metrics that expand, skills with stars", async () => {
  await render(h(AnviReport, { attempt: v2Report }));
  const panel = app().querySelector('[role="tabpanel"]');
  assert.match(panel.querySelector("[data-report-narrative]").textContent, /^You explained REST clearly\./);
  assert.match(panel.querySelector('[data-split="functional"]').textContent, /Functional68%.*Cohort average 60%/);
  assert.match(panel.querySelector('[data-split="nonFunctional"]').textContent, /Non-functional74%/);
  const rows = [...panel.querySelectorAll("[data-metric]")];
  assert.deepEqual(rows.map((row) => row.getAttribute("data-metric")), ["knowledge", "articulation", "fluency", "confidence", "professionalism"]);
  assert.match(rows[0].textContent, /KnowledgeFair.*68%/);
  const toggle = rows[0].querySelector("button");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.ok(rows[0].querySelector("[data-metric-details]").hidden);
  await click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const details = rows[0].querySelector("[data-metric-details]").textContent;
  assert.match(details, /What went well.*Defined REST preciselyQ1/);
  assert.match(details, /Areas of improvement.*Explain how the TTL is chosenQ2/);
  assert.match(details, /Judged from the transcript · Cohort average 60%/);
  const skills = [...panel.querySelectorAll("[data-skill]")];
  assert.equal(skills.length, 3);
  assert.equal(skills[1].querySelector("[data-stars]").getAttribute("data-stars"), "2.5");
  assert.match(skills[1].textContent, /Caching.*50%/);
  assert.equal(panel.querySelector('[aria-label="Score by competency"]'), null, "skills replace the competency bars");
  assert.doesNotMatch(app().textContent, /volume|decibel|pitch|eye contact/i);
});

test("follows the app theme in light and dark, with no forced wrapper; the print layout is always light", async () => {
  for (const theme of ["light", "dark"]) {
    localStorage.setItem("theme", theme);
    await render(h(AnviReport, { attempt: report }));
    assert.equal(document.documentElement.classList.contains("dark"), theme === "dark");
    assert.equal(app().querySelector(".dark"), null, "no element forces the dark theme");
    const header = app().querySelector("[data-report-header]");
    assert.match(header.className, /bg-white/);
    assert.match(header.className, /dark:bg-/);
    assert.ok(printRoot(), "the print layout is mounted in <body>");
    assert.equal([...printRoot().querySelectorAll("[class]")].filter((node) => /dark:/.test(node.getAttribute("class"))).length, 0);
    await act(async () => root.unmount());
    root = null;
  }
  localStorage.removeItem("theme");
});

test("tabs are accessible: one tab stop, arrow keys move selection and focus", async () => {
  await render(h(AnviReport, { attempt: report }));
  assert.deepEqual(tabs().map((tab) => tab.getAttribute("data-tab")), ["summary", "questions", "analysis", "actions"]);
  assert.match(tabNamed(/Question-wise feedback/).textContent, /Questions/, "a short label for phones");
  assert.deepEqual(tabs().map((tab) => tab.getAttribute("aria-selected")), ["true", "false", "false", "false"]);
  assert.deepEqual(tabs().map((tab) => tab.tabIndex), [0, -1, -1, -1]);
  const panel = document.querySelector('[role="tabpanel"]');
  assert.equal(panel.getAttribute("aria-labelledby"), tabs()[0].id);
  await key(tabs()[0], "ArrowRight");
  assert.equal(tabNamed(/Question-wise/).getAttribute("aria-selected"), "true");
  assert.equal(document.activeElement, tabNamed(/Question-wise/));
  await key(tabs()[1], "ArrowLeft");
  await key(tabs()[0], "ArrowLeft");
  assert.equal(tabNamed(/Action items/).getAttribute("aria-selected"), "true", "arrows wrap around");
  await key(tabs()[3], "Home");
  assert.equal(tabNamed(/Summary/).getAttribute("aria-selected"), "true");
  await key(tabs()[0], "End");
  assert.equal(tabNamed(/Action items/).getAttribute("aria-selected"), "true");
});

test("missing data hides its blocks on screen", async () => {
  const bare = { title: "Round 1", status: "ready", items: [{ qid: "q1", questionText: "Explain REST.", answerText: "Stateless.", status: "answered", marks: null, maxMarks: 10, percentCorrect: null }] };
  await render(h(AnviReport, { attempt: bare, readOnly: true }));
  assert.equal(app().querySelector("[data-report-score]"), null);
  assert.equal(app().querySelector("[data-report-kpis]"), null);
  assert.deepEqual([...app().querySelectorAll("[data-report-meta] dt")].map((node) => node.textContent), ["Status"]);
  assert.match(app().querySelector('[role="tabpanel"]').textContent, /No score breakdown was recorded/);
  assert.deepEqual(tabs().map((tab) => tab.getAttribute("data-tab")), ["summary", "questions"], "nothing to chart and no action plan");
  await click(tabNamed(/Question-wise/));
  assert.equal(app().querySelector("[data-response-score]"), null, "no ring for an unscored answer");
  assert.equal(app().querySelector("[data-response-metrics]"), null);
  assert.equal(app().querySelector("[data-response-dimensions]"), null);
  assert.equal(app().querySelector("[data-response-split]"), null);
  assert.doesNotMatch(app().querySelector('[role="tabpanel"]').textContent, /—|\b0%/, "no placeholder dashes or invented zeros");
});

test("question-wise feedback: selector with Previous / Next, the answer, key points, feedback; the authored answer only for admins", async () => {
  await render(h(AnviReport, { attempt: report }));
  await click(tabNamed(/Question-wise/));
  const select = app().querySelector("[data-question-select]");
  assert.deepEqual([...select.options].map((option) => option.textContent), ["1. Explain REST.", "2. Explain caching.", "3. Tell me about a conflict."]);
  const detail = () => app().querySelector("[data-question-detail]");
  assert.equal(detail().getAttribute("data-question-detail"), "1");
  assert.match(detail().textContent, /^Q1Technical · APIs/i);
  assert.ok(detail().querySelector('[data-response-score] [role="img"][aria-label="Question score 75 percent, Good"]'));
  assert.match(detail().querySelector("[data-response-score]").textContent, /7\.5 \/ 10 marks/);
  assert.match(detail().textContent, /Your answer/);
  assert.match(detail().textContent, /REST is stateless and resource based\./);
  assert.match(detail().textContent, /Covered: Stateless/);
  assert.match(detail().textContent, /Partly covered: Resources/);
  assert.match(detail().textContent, /Missed: Caching/);
  assert.match(detail().textContent, /1 covered · 1 partly · 1 missed/);
  assert.match(detail().querySelector("[data-response-feedback]").textContent, /ANVI feedback.*You defined REST well\./);
  assert.match(detail().querySelector("[data-response-metrics]").textContent, /Pace120 wpmGood pace.*Filler words1.*Answer length6 words/);
  assert.equal(app().querySelector("[data-question-prev]").disabled, true);
  await click(app().querySelector("[data-question-next]"));
  assert.equal(detail().getAttribute("data-question-detail"), "2");
  assert.equal(select.value, "1");
  assert.match(detail().querySelector("[data-response-metrics]").textContent, /90 wpmToo slow/);
  await act(async () => {
    select.value = "2";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  assert.equal(detail().getAttribute("data-question-detail"), "3");
  assert.match(detail().textContent, /Not attempted/);
  assert.equal(detail().querySelector("[data-response-feedback]"), null);
  assert.equal(app().querySelector("[data-question-next]").disabled, true);
  await click(app().querySelector("[data-question-prev]"));
  assert.equal(detail().getAttribute("data-question-detail"), "2");
  await click(app().querySelector('[aria-label="All questions"] li:first-child button'));
  assert.equal(detail().getAttribute("data-question-detail"), "1");
  assert.equal(app().querySelector("[data-question-flags]"), null, "the student copy carries no flags");
  assert.doesNotMatch(app().textContent, /AUTHORED answer/);
  await act(async () => root.unmount());
  await render(h(AnviReport, { attempt: adminReport, readOnly: true, showExpectedAnswer: true }));
  await click(tabNamed(/Question-wise/));
  assert.match(app().textContent, /Expected answer \(admins only\)/);
  assert.match(app().textContent, /AUTHORED answer/);
  assert.match(app().querySelector("[data-response-detail], [data-question-detail]").textContent, /Answer/);
  assert.deepEqual([...app().querySelectorAll("[data-question-flags]")].map((node) => node.textContent), ["Answered in another languageOff-topic request"]);
  assert.match(app().querySelector("[data-report-flags]").textContent, /Wellbeing concern raised/);
});

test("question-wise v2: functional / non-functional bars, time spent and the five metrics of the answer", async () => {
  await render(h(AnviReport, { attempt: v2Report }));
  await click(tabNamed(/Question-wise/));
  const detail = app().querySelector("[data-question-detail]");
  assert.match(detail.querySelector("[data-response-split]").textContent, /Functional75%Non-functional80%/);
  assert.match(detail.querySelector("[data-response-metrics]").textContent, /Time spent1 min 15 s/);
  assert.deepEqual([...detail.querySelectorAll("[data-response-dimensions] li")].map((row) => row.textContent), ["Knowledge80%", "Articulation82%", "Fluency78%", "Confidence76%", "Professionalism90%"]);
  assert.match(detail.querySelector("[data-response-notes]").textContent, /What went well.*Defined REST precisely/);
});

test("analysis: the question chart opens that question; radar and pace charts load with the tab", async () => {
  await render(h(AnviReport, { attempt: v2Report }));
  await click(tabNamed(/Analysis/));
  const chart = app().querySelector("[data-question-chart]");
  const bars = [...chart.querySelectorAll("[data-question-bar]")];
  assert.deepEqual(bars.map((bar) => bar.getAttribute("aria-label")), [
    "Overall 69%, Fair",
    "Q1: 75%, Good. Open this question",
    "Q2: 50%, Fair. Open this question",
    "Q3: 0%, Needs work, Not attempted. Open this question",
  ]);
  assert.equal(bars[0].disabled, true, "the overall bar is not a question");
  assert.match(app().querySelector('[data-chart="questions"]').textContent, /Cohort average 61%/);
  assert.match(app().querySelector('[data-chart="dimensions"]').textContent, /Your score.*Cohort average · 7 students/, "the cohort counts students (their latest attempt each)");
  assert.ok(app().querySelector('[data-chart="skills"]'));
  assert.match(app().querySelector("[data-pace-summary]").textContent, /Q2 fast \(170\)/);
  assert.match(app().querySelector("[data-filler-summary]").textContent, /In total3.*Per 100 words33\.3/);
  await waitFor(() => app().querySelector('[data-chart="dimensions"] [role="img"]'), "the lazy radar chart");
  assert.match(app().querySelector('[data-chart="dimensions"] [role="img"]').getAttribute("aria-label"), /Knowledge 68% \(cohort 60%\)/);
  await click(bars[2]);
  assert.equal(tabNamed(/Question-wise/).getAttribute("aria-selected"), "true", "the bar opens the Question-wise tab");
  assert.equal(app().querySelector("[data-question-detail]").getAttribute("data-question-detail"), "2");
  await act(async () => root.unmount());
  await render(h(AnviReport, { attempt: report }));
  await click(tabNamed(/Analysis/));
  assert.equal(app().querySelector('[data-chart="dimensions"]'), null, "older attempts: no metrics radar");
  assert.equal(app().querySelector('[data-chart="questions"]').textContent.includes("Cohort"), false, "no cohort line without a cohort");
});

/** A localStorage stand-in; `fail` makes every access throw (private mode, blocked site data). */
function memoryStorage({ fail = false } = {}) {
  const values = new Map();
  const guard = (fn) => (...args) => { if (fail) throw new Error("SecurityError"); return fn(...args); };
  return { values, getItem: guard((name) => (values.has(name) ? values.get(name) : null)), setItem: guard((name, value) => values.set(name, String(value))), removeItem: guard((name) => values.delete(name)) };
}

test("action items: numbered plan with a personal Mark done saved per attempt; blocked storage falls back to the visit", async () => {
  const storage = memoryStorage();
  await render(h(AnviReport, { attempt: report, actionStorage: storage }));
  await click(tabNamed(/Action items/));
  const items = () => [...app().querySelectorAll("[data-action]")];
  assert.equal(items().length, 3);
  assert.match(items()[0].textContent, /^1Explain how a cache TTL is chosen/);
  assert.match(app().querySelector("[data-actions-note]").textContent, /personal checklist.*this browser only/i);
  assert.equal(app().querySelector("[data-actions-progress]").textContent, "0 of 3 done");
  await click(items()[1].querySelector("[data-action-toggle]"));
  assert.equal(items()[1].getAttribute("data-done"), "true");
  assert.equal(app().querySelector("[data-actions-progress]").textContent, "1 of 3 done");
  assert.deepEqual(JSON.parse(storage.values.get("peerprep:anvi-actions:a1")), ["Practise answering the conflict prompt out loud."]);
  await act(async () => root.unmount());
  await render(h(AnviReport, { attempt: report, actionStorage: storage }));
  await click(tabNamed(/Action items/));
  assert.equal(items()[1].querySelector("[data-action-toggle]").checked, true, "kept across visits");
  await click(items()[1].querySelector("[data-action-toggle]"));
  assert.equal(storage.values.has("peerprep:anvi-actions:a1"), false, "unticking everything clears the entry");
  await act(async () => root.unmount());

  const blocked = memoryStorage({ fail: true });
  await render(h(AnviReport, { attempt: report, actionStorage: blocked }));
  await click(tabNamed(/Action items/));
  await click(items()[0].querySelector("[data-action-toggle]"));
  assert.equal(items()[0].getAttribute("data-done"), "true", "ticks still work without storage");
  assert.match(app().querySelector("[data-actions-note]").textContent, /for this visit only/);
  await act(async () => root.unmount());

  await render(h(AnviReport, { attempt: { ...report, student: { name: "Asha" } }, readOnly: true, actionStorage: storage }));
  await click(tabNamed(/Action items/));
  assert.equal(app().querySelector("[data-action-toggle]"), null, "admins see the plan without checkboxes");
  assert.match(app().querySelector("[data-report-actions]").textContent, /What the candidate should practise next/);
  const progress = await server.ssrLoadModule("/src/student/anvi/report/actionProgress.js");
  assert.deepEqual(progress.readDoneActions("a1", ["x"], { getItem: () => "{not json" }), [], "bad stored data is ignored");
  assert.deepEqual(progress.readDoneActions("a1", ["x"], null), []);
  assert.equal(progress.writeDoneActions("", ["x"], storage), false, "no attempt id: nothing is stored");
});

test("integrity: camera restored shows as an info event, outside the camera detections", async () => {
  const attempt = { ...adminReport, proctoring: { ...adminProctoring, events: [...adminProctoring.events, { type: "ai_camera_restored", at: "2026-10-22T10:12:00Z", questionN: 3 }] } };
  await render(h(AnviReport, { attempt, readOnly: true }));
  await click(app().querySelector("[data-report-integrity-chip]"));
  const section = document.querySelector("[data-proctoring-drawer] [data-report-integrity]");
  const aiRows = [...section.querySelectorAll("[data-integrity-ai-events] li")].map((row) => row.textContent);
  assert.equal(aiRows.length, 2, "no 'camera restored' detection");
  assert.ok(!aiRows.some((row) => /restored/i.test(row)));
  const rows = [...section.querySelectorAll("[data-integrity-events] tbody tr")].map((row) => row.textContent);
  const restored = rows.find((row) => row.includes("Camera restored"));
  assert.ok(restored, rows.join("\n"));
  assert.doesNotMatch(restored, /violation/);
  const print = printRoot().textContent;
  assert.match(print, /Camera restored.*Info/);
  assert.doesNotMatch(print, /ai camera restored/i);
});

test("integrity for admins: Proctoring details opens the full record (rules, counts, pauses, timeline) in a drawer", async () => {
  await render(h(AnviReport, { attempt: adminReport, readOnly: true, showExpectedAnswer: true }));
  assert.equal(app().querySelector("h1"), null, "inside the admin drawer the title is not the page heading");
  const meta = app().querySelector("[data-report-meta]").textContent;
  assert.ok(meta.includes("Asha Verma") && meta.includes("S-101 · asha@example.edu"), meta);
  const chip = app().querySelector("[data-report-integrity-chip]");
  assert.match(chip.textContent, /Proctoring details4 violations/);
  const summaryCard = app().querySelector('[role="tabpanel"] [data-report-setup]').textContent;
  assert.match(summaryCard, /Integrity & setup.*Violations4 of 4 allowed.*Camera checks2 detections/);
  assert.ok(app().querySelector("[data-warmup-transcript]"), "admins see the warm-up");
  const drawer = document.querySelector("[data-proctoring-drawer]");
  assert.equal(drawer.open, false);
  await click(chip);
  assert.equal(drawer.open, true);
  const section = drawer.querySelector("[data-report-integrity]");
  const counts = section.querySelector("[data-integrity-counts]").textContent;
  assert.ok(counts.includes("Total (limit 4)4") && counts.includes("Fullscreen exits1") && counts.includes("Reloads / rejoins1"), counts);
  const camera = section.querySelector("[data-integrity-ai]");
  assert.match(camera.textContent, /Camera AI checks · 2 detections/);
  const aiRows = [...camera.querySelectorAll("[data-integrity-ai-events] li")].map((row) => row.textContent);
  assert.match(aiRows[0], /^Mobile phone detected3:37:00\s?pmhighConfidence 87%$/i);
  assert.match(aiRows[1], /No face detected.*Confidence 60%/);
  assert.match(camera.textContent, /No video is recorded\./);
  assert.ok(section.querySelector("[data-integrity-blocked]").textContent.includes("Right-clicks1"));
  assert.match(section.textContent, /At the limit: Only flag in report/);
  assert.match(section.textContent, /The violation limit was reached; the interview continued and this report is flagged\./);
  assert.ok(section.querySelector('[aria-label="Proctoring rules"]').textContent.includes("Fullscreen required, paused outside it"));
  assert.match(section.querySelector("[data-integrity-pauses]").textContent, /Pauses · 1 · 30 s in total/);
  const rows = [...section.querySelectorAll("[data-integrity-events] tbody tr")].map((row) => row.textContent);
  assert.equal(rows.length, 4, "camera detections are listed in their own timeline");
  assert.match(rows[0], /3:35:10\s?pm.*Left fullscreen \(violation\)$/i);
  assert.match(rows[3], /Reloaded or rejoined the interview \(violation\)$/);
  assert.ok(drawer.querySelector("[data-report-setup]").textContent.includes("Uploaded file"));
  await click(drawer.querySelector("[data-proctoring-close]"));
  assert.equal(drawer.open, false);
  await click(app().querySelector("[data-report-proctoring-open]"));
  assert.equal(drawer.open, true, "the Summary card opens the same drawer");
});

test("integrity for students: counts only, no timeline or rules", async () => {
  await render(h(AnviReport, { attempt: studentReport }));
  await click(app().querySelector("[data-report-integrity-chip]"));
  const section = document.querySelector("[data-proctoring-drawer] [data-report-integrity]");
  assert.ok(section.querySelector("[data-integrity-counts]").textContent.includes("Tab switches2"));
  assert.equal(section.querySelector("[data-integrity-events]"), null);
  assert.equal(section.querySelector('[aria-label="Proctoring rules"]'), null);
  assert.match(section.textContent, /Your institution can review them/);
  assert.equal(section.querySelector("[data-integrity-ai]"), null, "no camera block without camera data");
  assert.equal(app().querySelector("[data-warmup-transcript]"), null);
  await act(async () => root.unmount());
  const withCamera = { ...report, proctoring: { enabled: true, counts: { fullscreen_exit: 0, tab_hidden: 0, window_blur: 0, rejoin: 0, ai_multiple_persons: 2 }, violations: 2 } };
  await render(h(AnviReport, { attempt: withCamera }));
  await click(app().querySelector("[data-report-integrity-chip]"));
  const camera = document.querySelector("[data-proctoring-drawer] [data-integrity-ai]");
  assert.ok(camera.querySelector("[data-integrity-ai-counts]").textContent.includes("Multiple persons2"));
  assert.equal(camera.querySelector("[data-integrity-ai-events]"), null, "students get camera counts only");
  assert.match(camera.textContent, /No video is recorded/);
});

// ---- Download PDF ---------------------------------------------------------------

/** Captures the download anchor (file name) without letting jsdom navigate. */
function captureDownloads() {
  const files = [];
  const onClick = (event) => {
    if (event.target?.tagName === "A" && event.target.download) { files.push(event.target.download); event.preventDefault(); }
  };
  document.addEventListener("click", onClick, true);
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  URL.createObjectURL = () => "blob:anvi-report";
  URL.revokeObjectURL = () => {};
  return { files, restore: () => { document.removeEventListener("click", onClick, true); URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; } };
}

test("Download PDF builds the PDF from the content model and saves it under the report file name", async () => {
  const built = [];
  const pdfLoader = async () => ({ buildReportPdf: async (content) => { built.push(content); return new Blob(["%PDF-1.4 test"], { type: "application/pdf" }); } });
  const capture = captureDownloads();
  const originalPrint = window.print;
  let printed = 0;
  window.print = () => { printed += 1; };
  try {
    await render(h(AnviReport, { attempt: adminReport, readOnly: true, showExpectedAnswer: true, pdfLoader }));
    const button = app().querySelector("[data-report-download]");
    assert.match(button.textContent, /Download PDF/);
    await click(button);
    await waitFor(() => capture.files.length === 1, "the download");
    assert.deepEqual(capture.files, ["ANVI-Report-Asha-Verma-Backend-practice-2026-10-22.pdf"]);
    assert.equal(built.length, 1);
    const content = built[0];
    assert.equal(content.audience, "admin");
    assert.deepEqual(content.score.marks, { score: 12.5, max: 30 });
    assert.equal(content.score.percent, 42);
    assert.equal(content.responses.length, 3);
    assert.equal(content.responses[0].expectedAnswer, "AUTHORED answer");
    assert.equal(content.integrity.violations, 4);
    assert.equal(content.integrityFull, true);
    assert.equal(content.footer, "Generated by PeerPrep ANVI · AI-generated, review before decisions");
    assert.equal(printed, 0, "no print dialog when the PDF is built");
    assert.equal(app().querySelector("[data-report-notice]"), null);
    assert.match(app().querySelector("[data-report-download]").textContent, /Download PDF/, "back to idle");
  } finally {
    capture.restore();
    window.print = originalPrint;
  }
});

test("Download PDF falls back to the print layout when the PDF cannot be built", async () => {
  const calls = [];
  const originalPrint = window.print;
  window.print = () => calls.push(document.title);
  document.title = "PeerPrep";
  const originalWarn = console.warn;
  try {
    await render(h(AnviReport, { attempt: adminReport, readOnly: true, pdfLoader: async () => { throw new Error("chunk failed"); } }));
    await click(app().querySelector("[data-report-download]"));
    await waitFor(() => calls.length === 1, "the print fallback");
    assert.deepEqual(calls, ["ANVI report - Asha Verma - Backend practice - 2026-10-22"]);
    assert.ok(document.querySelector("style[data-anvi-print-pages]"), "page numbers are added while printing");
    window.dispatchEvent(new window.Event("afterprint"));
    assert.equal(document.title, "PeerPrep");
    assert.equal(document.querySelector("style[data-anvi-print-pages]"), null, "and removed afterwards");
    assert.match(app().querySelector("[data-report-notice]").textContent, /print view opened instead/);
    const print = printRoot();
    assert.ok(print.querySelector("style").textContent.includes("@page"));
    const text = print.textContent;
    assert.match(text, /AI Interview Report · Asha Verma · Backend practice/, "running header");
    assert.match(text, /Generated by PeerPrep ANVI · AI-generated, review before decisions/, "running footer");
    assert.match(text, /Question-wise feedback/);
    assert.match(text, /✓ Stateless/);
    assert.match(text, /Answered in another language/);
    assert.match(text, /Browser event timeline/);
    assert.match(text, /Camera AI checks · 2 detections · no video is recorded/);
    assert.match(text, /Mobile phone detected.*high.*87%/i);
    assert.match(text, /Pauses/);
    assert.match(text, /Warm-up conversation/);
    assert.ok(print.querySelector("tr.apr-break"), "responses start on a new page");
    await act(async () => root.unmount());
    await render(h(AnviReport, { attempt: studentReport }));
    assert.doesNotMatch(printRoot().textContent, /event timeline/i, "students get counts only");
    assert.match(printRoot().textContent, /Tab switches/);
  } finally {
    window.print = originalPrint;
    console.warn = originalWarn;
  }
  assert.equal(printModule.printReport("x", { win: {} }), false, "no print support: nothing happens");
  const empty = await downloadModule.downloadReportPdf({ model: {}, fileName: "x.pdf", load: async () => ({ buildReportPdf: async () => new Blob([]) }), save: () => assert.fail("nothing is saved") });
  assert.equal(empty.ok, false, "an empty PDF counts as a failure");
});

test("the print footer shows the time of printing, not of the first render", async () => {
  const RealDate = globalThis.Date;
  let now = RealDate.parse("2026-10-22T04:30:00Z"); // 10:00 am IST
  class FakeDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const original = window.print;
  let footerDuringPrint = "";
  const footer = () => printRoot().querySelector(".apr-foot").textContent;
  window.print = () => { footerDuringPrint = footer(); };
  globalThis.Date = FakeDate;
  try {
    await render(h(AnviReport, { attempt: adminReport, readOnly: true, pdfLoader: async () => { throw new Error("offline"); } }));
    assert.match(footer(), /Printed .*10:00/i);
    now = RealDate.parse("2026-10-22T09:00:00Z"); // 2:30 pm IST
    await click(app().querySelector("[data-report-download]"));
    await waitFor(() => footerDuringPrint, "the print fallback");
    assert.match(footerDuringPrint, /Printed .*2:30\s?pm/i, footerDuringPrint);
    window.dispatchEvent(new window.Event("afterprint"));
    now = RealDate.parse("2026-10-22T10:15:00Z"); // 3:45 pm IST: the browser's own print (Ctrl+P)
    await act(async () => { window.dispatchEvent(new window.Event("beforeprint")); });
    assert.match(footer(), /Printed .*3:45\s?pm/i);
  } finally {
    globalThis.Date = RealDate;
    window.print = original;
  }
});

test("the react-pdf document renders a real multi-page A4 PDF from the content model", async () => {
  const { ReportPdfDocument } = await server.ssrLoadModule("/src/student/anvi/report/pdf/ReportPdf.jsx");
  const { registerReportFonts } = await server.ssrLoadModule("/src/student/anvi/report/pdf/registerFonts.js");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const fonts = `${FRONTEND}src/student/anvi/report/pdf/fonts`;
  registerReportFonts({ regular: `${fonts}/Inter-Regular.ttf`, medium: `${fonts}/Inter-Medium.ttf`, semibold: `${fonts}/Inter-SemiBold.ttf`, bold: `${fonts}/Inter-Bold.ttf` });
  const png = (file) => ({ data: fs.readFileSync(`${FRONTEND}src/student/anvi/report/assets/${file}`), format: "png" });
  const content = model.buildReportModel(adminReport, { audience: "admin", showExpectedAnswer: true });
  const buffer = await renderToBuffer(h(ReportPdfDocument, { model: content, logo: { light: png("peerprep-logo-light.png"), dark: png("peerprep-logo-dark.png") } }));
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  assert.ok(pages >= 2, `${pages} pages`);
  assert.match(buffer.toString("latin1"), /\/MediaBox\s*\[\s*0 0 595\.2\d* 841\.8\d*/, "A4");
  // Report v2: cover, summary, analysis (radar + question chart), one page section per question, action plan.
  const v2 = model.buildReportModel(v2Report, { studentName: "Asha Verma" });
  assert.ok(v2.metrics.length === 5 && v2.skills.length === 3 && v2.analysis.dimensionRadar && v2.analysis.questions.length === 4, "the PDF reads the same content model");
  const v2Buffer = await renderToBuffer(h(ReportPdfDocument, { model: v2, logo: { light: png("peerprep-logo-light.png"), dark: png("peerprep-logo-dark.png") } }));
  const v2Pages = (v2Buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  assert.ok(v2Pages >= v2.responses.length + 2, `${v2Pages} pages: each question starts its own page`);
  assert.equal(model.reportPdfFileName(v2Report, "Asha Verma"), "ANVI-Report-Asha-Verma-Backend-practice-2026-10-22.pdf");
});

test("completion shows the report when ready, a status while preparing and a clear failure", async () => {
  await render(h(AnviCompletion, { attempt: report }));
  assert.match(app().textContent, /AI Interview Report/);
  assert.ok(app().querySelector('[role="tablist"]'));
  assert.ok([...app().querySelectorAll("a")].some((link) => /Back to interviews/.test(link.textContent)));
  await act(async () => root.unmount());

  const answers = [{ n: 1, questionText: "Explain REST.", answerText: "Stateless.", status: "answered" }];
  let checked = 0;
  await render(h(AnviCompletion, { attempt: { id: "a1", status: "evaluating", report: "preparing", title: "Backend practice", items: answers }, pollExpired: true, onCheckAgain: () => { checked += 1; } }));
  assert.match(app().textContent, /ANVI is preparing your report…/);
  assert.match(app().textContent, /taking longer than usual/);
  await click([...app().querySelectorAll("button")].find((button) => /Check again/.test(button.textContent)));
  assert.equal(checked, 1);
  assert.match(app().textContent, /Stateless\./);
  await act(async () => root.unmount());

  await render(h(AnviCompletion, { attempt: { id: "a1", status: "failed", report: "failed", title: "Backend practice", items: answers } }));
  assert.match(app().querySelector('[role="alert"]').textContent, /Report could not be generated/);
  assert.equal(app().querySelector('[role="tablist"]'), null);
});
