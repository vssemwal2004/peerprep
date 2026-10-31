import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// Admin "assign students": step 1 with a preset interview, the edit wizard (prefilled students, delta save,
// no duplicate), the assigned-students table (one schedule and per interview) and its row actions.
let dom, server, root, createRoot, model, AnviSchedulesRoutes, ThemeProvider, scheduleApi, realScheduleApi, interviewApi, api;
let calls = [];
const globals = ["window", "document", "navigator", "HTMLElement", "localStorage", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/admin/ai-interviews/schedules", pretendToBeVisual: true });
  const values = { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name in values ? values[name] : dom.window[name] });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  Object.defineProperty(dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async (value) => { calls.push(["copy", value]); } } });
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  model = await server.ssrLoadModule("/src/admin/ai-interviews/schedules/scheduleModel.js");
  ({ AnviSchedulesRoutes } = await server.ssrLoadModule("/src/admin/ai-interviews/schedules/index.jsx"));
  ({ scheduleApi } = await server.ssrLoadModule("/src/admin/ai-interviews/schedules/schedulesApi.js"));
  realScheduleApi = { ...scheduleApi };
  ({ interviewApi } = await server.ssrLoadModule("/src/admin/ai-interviews/api.js"));
  ({ api } = await server.ssrLoadModule("/src/utils/api.js"));
  ({ ThemeProvider } = await server.ssrLoadModule("/src/context/ThemeContext.jsx"));
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

const interview = { _id: "i1", title: "Backend mock", role: "Backend engineer", companyName: "Acme", publishedAt: "2026-10-01T00:00:00Z", summary: { budgetSeconds: 1800 } };
const assignment = {
  id: "a1", title: "Backend mock", role: "Backend engineer", mode: "mock", status: "open", revision: 3, interviewId: "i1", snapshotRevision: 4,
  audience: { source: "selected", studentCount: 3 },
  window: { opensAt: "2027-01-04T03:30:00Z", closesAt: "2027-01-08T12:30:00Z" },
  slotPolicy: { mode: "slots", slotMinutes: 45, capacityPerSlot: 10, dailyStart: "09:00", dailyEnd: "17:00", weekdays: [1, 2, 3, 4, 5], blackoutDates: [] },
  bookingPolicy: { rescheduleLimit: 2, cutoffMinutes: 60, earlyJoinMinutes: 10, lateGraceMinutes: 10, attemptsAllowed: 1 },
  reportVisibility: "after_close", blockPractice: true, notes: "",
};
const person = (id, name, code, extra = {}) => ({ _id: id, name, email: `${name.split(" ")[0].toLowerCase()}@example.edu`, studentId: code, branch: "CSE", course: "B.Tech", semester: 5, ...extra });
const STUDENTS = [person("s1", "Asha Rao", "GE1"), person("s2", "Bilal Khan", "GE2"), person("s3", "Chen Li", "GE3", { branch: "ECE" }), person("s4", "Dev Patel", "GE4")];
// Rows in the GET /schedules/:id/targets shape (anviInterview.scheduling.service.js targetRows).
const target = (student, extra = {}) => ({
  id: `a1:${student._id}`, assignmentId: extra.assignmentId || "a1", studentId: student._id,
  schedule: { id: extra.assignmentId || "a1", title: extra.scheduleTitle || "Backend mock", status: "open", slotMode: "slots" },
  student: { name: student.name, email: student.email, studentCode: student.studentId, branch: student.branch, course: student.course, semester: student.semester, group: "", college: "" },
  status: "assigned", outcome: "pending", partial: false, source: "selected", attemptsUsed: 0, attemptsAllowed: 1, booking: null, attempt: null, ...extra,
});
const ROWS = [
  target(STUDENTS[0], { outcome: "booked", booking: { id: "b1", slotId: "slot1", startsAt: "2027-01-04T04:15:00Z", endsAt: "2027-01-04T05:00:00Z", status: "booked", active: true, rescheduleCount: 0 } }),
  target(STUDENTS[1], { outcome: "completed", attemptsUsed: 1, attempt: { id: "t2", status: "ready", percent: 72, reportReady: true } }),
  target(STUDENTS[2]),
];
const listing = (rows = ROWS, extra = {}) => ({
  assignment, schedules: [{ id: "a1", title: "Backend mock", status: "open", slotMode: "slots" }], rows,
  counts: { all: rows.length, removed: 0, pending: 1, booked: 1, in_progress: 0, completed: 1, no_show: 0, missed: 0, cancelled: 0 },
  pagination: { page: 1, limit: 25, total: rows.length, pages: 1 }, sort: { key: "name", order: "asc" }, truncated: false, ...extra,
});

beforeEach(() => {
  calls = [];
  interviewApi.list = async (values) => { calls.push(["interviews", values]); return { items: [interview, { ...interview, _id: "i2", title: "Data analyst screen" }], pagination: { page: 1, limit: 100, total: 2, pages: 1 } }; };
  interviewApi.get = async (id) => { calls.push(["interview", id]); return { ...interview, data: {} }; };
  api.getAllSemestersForStudent = async () => [];
  api.listStudentUploadBatches = async () => ({ batches: [] });
  api.listAllStudents = async (options = {}) => {
    calls.push(["students", options]);
    return { students: STUDENTS, pagination: { page: 1, limit: options.limit || 25, total: STUDENTS.length, pages: 1 }, facets: { semesters: [{ value: 5, label: "Semester 5", count: 4 }], branches: [{ value: "CSE", label: "CSE", count: 3 }] } };
  };
  api.checkInterviewParticipantCsv = async (file) => {
    const rows = (await file.text()).trim().split(/\r?\n/).slice(1);
    calls.push(["check", rows.length]);
    return { results: rows.map((_, index) => ({ row: index + 1, status: "ready" })) };
  };
  scheduleApi.get = async (id, values) => { calls.push(["get", id, values]); return { assignment, kpis: { assigned: 3 }, roster: [], pagination: { page: 1, limit: 25, total: 0, pages: 1 } }; };
  scheduleApi.targets = async (id, values) => { calls.push(["targets", id, values]); return listing(); };
  scheduleApi.interviewTargets = async (id, values) => {
    calls.push(["interviewTargets", id, values]);
    const rows = [...ROWS, target(STUDENTS[3], { assignmentId: "a2", scheduleTitle: "Backend mock — round 2", id: "a2:s4" })];
    return { ...listing(rows), assignment: undefined, interview: { id: "i1", title: "Backend mock" },
      schedules: [{ id: "a1", title: "Backend mock", status: "open", slotMode: "slots" }, { id: "a2", title: "Backend mock — round 2", status: "scheduled", slotMode: "slots" }] };
  };
  scheduleApi.create = async (...args) => { calls.push(["create", ...args]); return { assignment: { ...assignment, id: "a9" } }; };
  scheduleApi.update = async (...args) => { calls.push(["update", ...args]); return { assignment }; };
  scheduleApi.addTargets = async (...args) => { calls.push(["addTargets", ...args]); return { added: args[1].length, alreadyAssigned: 0, skipped: 0 }; };
  scheduleApi.removeTargets = async (...args) => { calls.push(["removeTargets", ...args]); return { removed: args[1].length }; };
  scheduleApi.resetTarget = async (...args) => { calls.push(["resetTarget", ...args]); return { reset: 1 }; };
  scheduleApi.notifyTargets = async (...args) => { calls.push(["notifyTargets", ...args]); return { sent: args[1].length, recentlyNotified: 0 }; };
  scheduleApi.cancelBooking = async (...args) => { calls.push(["cancelBooking", ...args]); return {}; };
  scheduleApi.summary = async () => ({ kpis: {}, distribution: [], competencies: [], weakestKeyPoints: [] });
});

function Location() {
  const location = useLocation();
  return h("output", { id: "location" }, location.pathname + location.search);
}
const render = async (entry) => {
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [entry] }, h(ThemeProvider, null,
    h(Routes, null, h(Route, { path: "/admin/ai-interviews/schedules/*", element: h(AnviSchedulesRoutes) })), h(Location)))));
  await tick(10);
};
const text = () => document.body.textContent;
const button = (pattern, scope = document) => [...scope.querySelectorAll("button")].find((node) => pattern.test(node.textContent) || pattern.test(node.getAttribute("aria-label") || ""));
const click = async (node) => {
  assert.ok(node, "click target exists");
  await act(async () => { node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await tick();
};
const setValue = async (node, value) => {
  assert.ok(node, "input exists");
  const proto = node.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  await tick();
};
const waitFor = async (check, label, attempts = 250) => {
  for (let i = 0; i < attempts; i += 1) { if (check()) return; await tick(20); }
  assert.fail(`timed out waiting for ${label}`);
};
const checkbox = (name) => document.querySelector(`input[type="checkbox"][aria-label="Select ${name}"]`);
const menuItem = (label) => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((node) => node.textContent === label);

test("model: the edit delta, removable targets and the CSV export", () => {
  assert.deepEqual(model.targetDelta(["s1", "s2", "s3"], [{ _id: "s1" }, { _id: "s3" }, { _id: "s4" }]), { add: ["s4"], remove: ["s2"] });
  assert.deepEqual(model.targetDelta(["s1"], [{ _id: "s1" }, { _id: "s1" }]), { add: [], remove: [] }, "the same list back changes nothing");
  assert.equal(model.isRemovableTarget({ status: "assigned", outcome: "booked" }), true);
  assert.equal(model.isRemovableTarget({ status: "assigned", outcome: "completed" }), true);
  assert.equal(model.isRemovableTarget({ status: "assigned", outcome: "in_progress" }), false);
  assert.equal(model.isRemovableTarget({ status: "removed", outcome: "cancelled" }), false);
  assert.equal(model.yearLabel(5), "Year 3 · Sem 5");
  const csv = model.targetsCsv([target({ ...STUDENTS[0], name: "=cmd()" })]);
  assert.ok(csv.startsWith("﻿\"Name\""));
  assert.match(csv, /"'=cmd\(\)"/, "formula cells are neutralised");
  // Only this schedule and other active schedules lock a student; cancelled, closed or past-close ones do not.
  const soon = new Date(Date.now() + 86_400_000).toISOString(), past = new Date(Date.now() - 86_400_000).toISOString();
  const blocking = model.blockingTargets({
    schedules: [
      { id: "a1", status: "closed", window: { closesAt: past } }, { id: "a2", status: "open", window: { closesAt: soon } },
      { id: "a3", status: "cancelled", window: { closesAt: soon } }, { id: "a4", status: "scheduled", window: { closesAt: past } },
    ],
    rows: [
      { studentId: "s1", assignmentId: "a1", status: "assigned" }, { studentId: "s2", assignmentId: "a2", status: "assigned" },
      { studentId: "s3", assignmentId: "a3", status: "assigned" }, { studentId: "s4", assignmentId: "a4", status: "assigned" },
      { studentId: "s5", assignmentId: "a2", status: "removed" },
    ],
  });
  assert.deepEqual([...blocking.keys()], ["s2"]);
  assert.deepEqual([...model.blockingTargets({ schedules: [{ id: "a1", status: "closed" }], rows: [{ studentId: "s1", assignmentId: "a1", status: "assigned" }] }, { scheduleId: "a1" }).keys()], ["s1"], "students on this schedule stay locked");
  assert.deepEqual(model.conflictOf({ response: { data: { code: "ALREADY_ASSIGNED", conflictCount: 2, conflicts: [{ studentId: "s1" }] } } }), { count: 2, conflicts: [{ studentId: "s1" }] });
});

test("the API client reaches the assigned-student routes", async () => {
  const sent = [];
  const original = api.aiInterviewRequest;
  api.aiInterviewRequest = async (path, options = {}) => { sent.push([path, options.method || "GET", options.body]); return {}; };
  try {
    await realScheduleApi.targets("a1", { search: "asha", status: "", page: 2 });
    await realScheduleApi.interviewTargets("i1", { assignmentId: "a2" });
    await realScheduleApi.addTargets("a1", ["s4"], { source: "csv", duplicates: "skip" });
    await realScheduleApi.removeTargets("a1", ["s3"]);
    await realScheduleApi.resetTarget("a1", "s2");
    await realScheduleApi.notifyTargets("a1", ["s1"]);
  } finally { api.aiInterviewRequest = original; }
  assert.deepEqual(sent, [
    ["/schedules/a1/targets?search=asha&page=2", "GET", undefined],
    ["/schedules/by-interview/i1/targets?assignmentId=a2", "GET", undefined],
    ["/schedules/a1/targets", "POST", { studentIds: ["s4"], source: "csv", duplicates: "skip" }],
    ["/schedules/a1/targets/remove", "POST", { studentIds: ["s3"] }],
    ["/schedules/a1/targets/s2/reset", "POST", {}],
    ["/schedules/a1/targets/notify", "POST", { studentIds: ["s1"] }],
  ]);
});

test("step 1 with an interview chosen from its menu shows one summary card, no search, list or note", async () => {
  await render("/admin/ai-interviews/schedules/new?interviewId=i1");
  await waitFor(() => /Backend mock/.test(document.querySelector("[data-interview-summary]")?.textContent || ""), "summary card");
  const card = document.querySelector("[data-interview-summary]").textContent;
  assert.match(card, /Backend engineer · Acme · 30 min/);
  assert.equal(document.querySelector('input[type="search"]'), null, "no search box");
  assert.equal(document.querySelector('[role="radiogroup"][aria-label="Published interviews"]'), null, "no interview list");
  assert.doesNotMatch(text(), /Only published interviews can be scheduled/);
  assert.equal(button(/^Change$/), undefined, "opened from the interview menu: no Change");
  assert.ok(button(/Mock interview/), "the mode choice stays");
  assert.ok(!calls.some(([name]) => name === "interviews"), "the published list is not even loaded");
});

test("step 1 opened from the Schedules page offers Change, and without an interview shows the picker", async () => {
  await render({ pathname: "/admin/ai-interviews/schedules/new", search: "?interviewId=i1", state: { from: "schedules" } });
  await waitFor(() => button(/^Change$/), "Change link");
  await click(button(/^Change$/));
  await waitFor(() => document.querySelectorAll('[role="radio"]').length === 2, "picker");
  await click([...document.querySelectorAll('[role="radio"]')].find((node) => /Data analyst/.test(node.textContent)));
  assert.match(document.querySelector("[data-interview-summary]").textContent, /Data analyst screen/, "choosing collapses back to the card");
  await act(async () => root.unmount()); root = null;

  await render("/admin/ai-interviews/schedules/new");
  await waitFor(() => document.querySelectorAll('[role="radio"]').length === 2, "picker without preset");
  assert.ok(document.querySelector('input[type="search"]'));
  assert.doesNotMatch(text(), /Only published interviews can be scheduled/);
  assert.equal(document.querySelector("[data-interview-summary]"), null);
});

test("a new schedule marks students who already have the interview as Already added", async () => {
  await render("/admin/ai-interviews/schedules/new?interviewId=i1");
  await waitFor(() => document.querySelector("[data-interview-summary]"), "interview card");
  await click(button(/Continue to students/));
  await waitFor(() => checkbox("Asha Rao"), "student picker");
  assert.equal(checkbox("Asha Rao").checked, true);
  assert.equal(checkbox("Asha Rao").disabled, true);
  assert.match(checkbox("Asha Rao").closest("tr").textContent, /Already added.*Backend mock/);
  assert.equal(checkbox("Dev Patel").disabled, true, "students from another schedule of the interview are also locked");
});

test("editing prefills assigned students, asks before removing one, and saves only the change", async () => {
  await render("/admin/ai-interviews/schedules/a1/edit?step=students");
  await waitFor(() => checkbox("Asha Rao"), "picker rows");
  assert.deepEqual(calls.find(([name]) => name === "targets").slice(1), ["a1", { limit: 2000 }], "every assigned student is loaded");
  assert.equal(checkbox("Asha Rao").checked, true);
  assert.equal(checkbox("Chen Li").checked, true);
  assert.equal(checkbox("Dev Patel").checked, false);
  assert.equal(checkbox("Bilal Khan").disabled, false, "a completed student can now be removed from the roster");
  assert.equal([...document.querySelectorAll("tbody")].map((node) => node.textContent).join("").match(/Already added/g).length, 3);
  assert.match(text(), /Booked · /, "the booking status is shown");
  assert.match(document.querySelector("[data-selection-bar]").textContent, /3 on this schedule/);

  await click(checkbox("Dev Patel"));
  await click(checkbox("Chen Li"));
  const dialog = document.querySelector("dialog[open]");
  assert.match(dialog.textContent, /Remove Chen Li when you save/);
  await click(button(/^Remove student$/, dialog));
  assert.equal(checkbox("Chen Li").checked, false);
  assert.match(document.querySelector("[data-selection-bar]").textContent, /3 on this schedule · 1 new · 1 to remove/);

  await click(button(/^Review$/));
  assert.match(text(), /Review & save/);
  assert.match(document.querySelector('[aria-label="Schedule summary"]').textContent, /Add 1 student.*Remove 1 student/);
  await click(button(/^Save changes$/));
  await waitFor(() => /\/schedules\/a1$/.test(document.getElementById("location").textContent), "back on the schedule");
  assert.deepEqual(calls.find(([name]) => name === "removeTargets").slice(1), ["a1", ["s3"]]);
  assert.deepEqual(calls.find(([name]) => name === "addTargets").slice(1), ["a1", ["s4"], { source: "selected" }], "only the new student is sent");
  assert.ok(!calls.some(([name]) => name === "create"), "an edit never creates a second schedule");
  assert.ok(!calls.some(([name]) => name === "update"), "settings were not changed");
  assert.deepEqual(calls.filter(([name]) => name === "check").map(([, count]) => count), [1], "only the new student is rechecked");
  await waitFor(() => /Schedule saved: 1 student added, 1 student removed/.test(text()), "saved notice");
});

test("a 409 ALREADY_ASSIGNED on create names the students and can skip them", async () => {
  scheduleApi.interviewTargets = async () => ({ ...listing([]), rows: [], counts: { all: 0 }, pagination: { page: 1, limit: 2000, total: 0, pages: 1 } });
  let attempt = 0;
  scheduleApi.create = async (body, key) => {
    calls.push(["create", body, key]);
    attempt += 1;
    if (attempt === 1) {
      const error = new Error("1 student is already assigned this interview in another active schedule.");
      error.response = { status: 409, data: { code: "ALREADY_ASSIGNED", conflictCount: 1, conflicts: [{ studentId: "s1", name: "Asha Rao", title: "Backend mock" }] } };
      throw error;
    }
    return { assignment: { ...assignment, id: "a9" }, warnings: [] };
  };
  await render("/admin/ai-interviews/schedules/new?interviewId=i1");
  await waitFor(() => document.querySelector("[data-interview-summary]"), "card");
  await click(button(/Continue to students/));
  await waitFor(() => checkbox("Asha Rao"), "rows");
  await click(checkbox("Asha Rao"));
  await click(button(/Continue to window/));
  await setValue(document.getElementById([...document.querySelectorAll("label")].find((node) => /^Opens/.test(node.textContent)).htmlFor), "2027-01-04T09:00");
  await setValue(document.getElementById([...document.querySelectorAll("label")].find((node) => /^Closes/.test(node.textContent)).htmlFor), "2027-01-05T18:00");
  await click(button(/Continue to policies/));
  await click(button(/Continue to review/));
  await click(button(/^Schedule interview$/));
  await waitFor(() => /already assigned this interview/.test(text()), "conflict panel");
  assert.match(text(), /Asha Rao · in “Backend mock”/);
  await click(button(/Skip them and continue/));
  await waitFor(() => /\/schedules\/a9$/.test(document.getElementById("location").textContent), "created");
  const creates = calls.filter(([name]) => name === "create");
  assert.equal(creates.length, 2);
  assert.equal(creates[0][1].duplicates, undefined);
  assert.equal(creates[1][1].duplicates, "skip");
  assert.notEqual(creates[0][2], creates[1][2], "a refused create gets a fresh idempotency key");
});

test("the assigned-students page searches, filters, sorts and runs row actions", async () => {
  await render("/admin/ai-interviews/schedules/a1/students");
  await waitFor(() => /Asha Rao/.test(text()), "rows");
  assert.equal(document.querySelector('select[aria-label="Filter by schedule"]'), null, "one schedule: no schedule filter");
  assert.ok(![...document.querySelectorAll("th")].some((node) => node.textContent === "Schedule"));
  for (const label of ["Student", "Roll / ID", "Email", "Department", "Slot (IST)", "Booking", "Attempt", "Score"]) {
    assert.ok([...document.querySelectorAll("th")].some((node) => node.textContent.includes(label)), `${label} column`);
  }
  assert.match(text(), /72%/);
  await setValue(document.querySelector('input[type="search"]'), "asha");
  await waitFor(() => calls.some(([name, , values]) => name === "targets" && values.search === "asha"), "search request");
  await click([...document.querySelectorAll('[role="tab"]')].find((node) => /^Booked/.test(node.textContent)));
  await waitFor(() => calls.some(([name, , values]) => name === "targets" && values.status === "booked"), "status request");
  await click(button(/^Roll \/ ID/));
  await waitFor(() => calls.some(([name, , values]) => name === "targets" && values.sort === "studentCode" && values.order === "asc"), "sort request");
  assert.equal(document.querySelector('th[aria-sort="ascending"]').textContent.includes("Roll / ID"), true);

  await click(button(/^Actions for Asha Rao$/));
  const labels = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((node) => node.textContent);
  assert.deepEqual(labels, ["View student details", "View attempt", "Move booking", "Cancel booking", "Resend invite", "Copy email", "Remove student"]);
  assert.equal(menuItem("View attempt").disabled, true, "no attempt yet");
  await click(menuItem("Copy email"));
  assert.deepEqual(calls.find(([name]) => name === "copy"), ["copy", "asha@example.edu"]);

  await click(button(/^Actions for Asha Rao$/));
  await click(menuItem("Remove student"));
  assert.match(document.querySelector("dialog[open]").textContent, /Their booking on .* is cancelled/);
  await click(button(/^Remove student$/, document.querySelector("dialog[open]")));
  assert.deepEqual(calls.find(([name]) => name === "removeTargets").slice(1), ["a1", ["s1"], { endInProgress: false }]);
  await waitFor(() => /1 student removed/.test(text()), "removed notice");

  await click(button(/^Actions for Chen Li$/));
  await click(menuItem("Resend invite"));
  await click(button(/^Send reminder$/, document.querySelector("dialog[open]")));
  assert.deepEqual(calls.find(([name]) => name === "notifyTargets").slice(1), ["a1", ["s3"]]);

  await click(button(/^Actions for Bilal Khan$/));
  assert.ok(menuItem("Reset interview"), "a completed attempt can be reset");
  assert.ok(menuItem("Remove student"), "a completed student can be removed while history is kept");
  await click(menuItem("Reset interview"));
  assert.match(document.querySelector("dialog[open]").textContent, /previous attempt and report are permanently cleared/i);
  await click(button(/^Reset interview$/, document.querySelector("dialog[open]")));
  assert.deepEqual(calls.find(([name]) => name === "resetTarget").slice(1), ["a1", "s2", { endInProgress: false }]);
  await click(button(/^Actions for Bilal Khan$/));
  await click(menuItem("View report"));
  assert.match(document.getElementById("location").textContent, /\/admin\/ai-interviews\/reports\?assignmentId=a1&attemptId=t2/);
});

test("bulk selection reminds and removes across the page", async () => {
  await render("/admin/ai-interviews/schedules/a1/students");
  await waitFor(() => /Asha Rao/.test(text()), "rows");
  await click(document.querySelector('input[aria-label="Select every student on this page"]'));
  assert.match(document.querySelector('[aria-label="Bulk actions"]').textContent, /3 students selected/);
  await click(button(/^Remove$/));
  await click(button(/^Remove 3 students$/, document.querySelector("dialog[open]")));
  assert.deepEqual(calls.find(([name]) => name === "removeTargets").slice(1), ["a1", ["s1", "s2", "s3"], { endInProgress: false }], "completed students can be removed too");
});

test("the interview's assigned students span its schedules, with a schedule column and filter", async () => {
  await render("/admin/ai-interviews/schedules/interview/i1/students");
  await waitFor(() => /Dev Patel/.test(text()), "rows");
  assert.equal(calls.find(([name]) => name === "interviewTargets")[1], "i1");
  assert.ok([...document.querySelectorAll("th")].some((node) => node.textContent.includes("Schedule")), "schedule column");
  assert.match(text(), /Backend mock — round 2/);
  await setValue(document.querySelector('select[aria-label="Filter by schedule"]'), "a2");
  await waitFor(() => calls.some(([name, , values]) => name === "interviewTargets" && values.assignmentId === "a2"), "schedule filter");
  assert.ok(button(/^Add students$/));
  assert.ok(button(/^Export CSV$/));
});
