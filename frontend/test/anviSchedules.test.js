import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h, useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// ANVI Phase 3 admin scheduling: IST helpers, slot preview, the five-step wizard, the detail page
// operations and the DateTimePicker inline-error fix, rendered in jsdom through Vite's SSR loader.
let dom, server, root, createRoot, model, students, AnviSchedulesRoutes, DateTimePicker, ThemeProvider;
let scheduleApi, realScheduleApi, interviewApi, api;
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
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  model = await server.ssrLoadModule("/src/admin/ai-interviews/schedules/scheduleModel.js");
  students = await server.ssrLoadModule("/src/admin/ai-interviews/schedules/scheduleStudents.js");
  ({ AnviSchedulesRoutes } = await server.ssrLoadModule("/src/admin/ai-interviews/schedules/index.jsx"));
  ({ default: DateTimePicker } = await server.ssrLoadModule("/src/components/DateTimePicker.jsx"));
  ({ scheduleApi } = await server.ssrLoadModule("/src/admin/ai-interviews/schedules/schedulesApi.js"));
  realScheduleApi = { ...scheduleApi };
  ({ interviewApi } = await server.ssrLoadModule("/src/admin/ai-interviews/api.js"));
  ({ api } = await server.ssrLoadModule("/src/utils/api.js"));
  ({ ThemeProvider } = await server.ssrLoadModule("/src/context/ThemeContext.jsx"));
  // Warm the lazily loaded report chunk so the tab test does not time out on the first transform.
  await server.ssrLoadModule("/src/admin/ai-interviews/schedules/ScheduleCohortReport.jsx");
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
// Shapes follow anviInterview.scheduling.service.js (assignmentView, getAssignmentDetail, listAdminSlots).
const detail = (overrides = {}) => ({
  assignment: {
    id: "a1", title: "Backend mock", role: "Backend engineer", mode: "mock", status: "open", revision: 3, interviewId: "i1", snapshotRevision: 4,
    audience: { source: "selected", studentCount: 3 },
    window: { opensAt: "2026-11-02T03:30:00Z", closesAt: "2026-11-06T12:30:00Z" },
    slotPolicy: { mode: "slots", slotMinutes: 45, capacityPerSlot: 10, dailyStart: "09:00", dailyEnd: "17:00", weekdays: [1, 2, 3, 4, 5], blackoutDates: [] },
    bookingPolicy: { rescheduleLimit: 2, cutoffMinutes: 60, earlyJoinMinutes: 10, lateGraceMinutes: 10, attemptsAllowed: 1 },
    reportVisibility: "manual", blockPractice: true, notes: "Lab B",
    ...overrides,
  },
  kpis: { assigned: 3, pending: 0, booked: 1, inProgress: 0, completed: 1, noShow: 0, missed: 1 },
  slots: { count: 40, capacity: 400, booked: 1 },
  roster: [
    { studentId: "s1", name: "Asha Rao", email: "asha@example.edu", studentCode: "GE1", status: "assigned", outcome: "booked", attemptsUsed: 0,
      booking: { id: "b1", slotId: "slot1", startsAt: "2026-11-02T04:15:00Z", endsAt: "2026-11-02T05:00:00Z", status: "booked", active: true, rescheduleCount: 1 }, attempt: null },
    { studentId: "s2", name: "Bilal Khan", email: "bilal@example.edu", studentCode: "GE2", status: "assigned", outcome: "completed", attemptsUsed: 1,
      booking: { id: "b2", slotId: "slot0", startsAt: "2026-11-02T03:30:00Z", endsAt: "2026-11-02T04:15:00Z", status: "completed", active: false, rescheduleCount: 0 }, attempt: { id: "t2", status: "ready", percent: 72 } },
    { studentId: "s3", name: "Chen Li", email: "chen@example.edu", studentCode: "GE3", status: "assigned", outcome: "missed", attemptsUsed: 0, booking: null, attempt: null },
  ],
  pagination: { page: 1, limit: 25, total: 3, pages: 1 },
});

beforeEach(() => {
  calls = [];
  interviewApi.list = async (values) => { calls.push(["interviews", values]); return { items: [interview], pagination: { page: 1, limit: 100, total: 1, pages: 1 } }; };
  interviewApi.get = async (id) => { calls.push(["interview", id]); return { ...interview, data: {} }; };
  api.getAllSemestersForStudent = async () => [];
  api.listStudentUploadBatches = async () => ({ batches: [] });
  api.listAllStudents = async (options = {}) => {
    calls.push(["students", options]);
    const total = options.semester === "5" ? 40 : options.branch ? 12 : 120;
    return { students: [], count: 0, total, pagination: { page: 1, limit: 1, total, pages: total },
      facets: { semesters: [{ value: 5, label: "Semester 5", count: 40 }], branches: [{ value: "CSE", label: "CSE", count: 12 }], courses: [], colleges: [], groups: [] } };
  };
  api.checkInterviewParticipantCsv = async (file) => {
    const text = await file.text();
    const rows = text.trim().split(/\r?\n/).slice(1);
    calls.push(["check", rows.length]);
    return { results: rows.map((row, index) => ({ row: index + 1, status: row.includes("blocked") ? "student_not_registered" : "ready" })) };
  };
  scheduleApi.list = async (values) => { calls.push(["list", values]); return { assignments: [{ ...detail().assignment, kpis: detail().kpis }], pagination: { page: 1, limit: 25, total: 1, pages: 1 } }; };
  scheduleApi.get = async (id, values) => { calls.push(["get", id, values]); return detail(); };
  scheduleApi.create = async (body, key) => {
    calls.push(["create", body, key]);
    return { assignment: { ...detail().assignment, id: "a9", audience: { source: "filters", studentCount: 38 } }, created: true,
      warnings: [{ code: "CAPACITY_BELOW_COHORT", message: "20 seats for 38 students." }], preview: { studentCount: 38, slotCount: 20 } };
  };
  scheduleApi.transition = async (...args) => { calls.push(["transition", ...args]); return {}; };
  scheduleApi.cancelBooking = async (...args) => { calls.push(["cancelBooking", ...args]); return {}; };
  scheduleApi.removeTarget = async (...args) => { calls.push(["removeTarget", ...args]); return {}; };
  scheduleApi.moveBooking = async (...args) => { calls.push(["moveBooking", ...args]); return {}; };
  scheduleApi.slots = async () => ({ assignmentId: "a1", slots: [
    { id: "slot1", startsAt: "2027-01-04T03:30:00Z", endsAt: "2027-01-04T04:15:00Z", capacity: 10, bookedCount: 3, seatsLeft: 7, status: "open" },
    { id: "slot2", startsAt: "2027-01-04T04:15:00Z", endsAt: "2027-01-04T05:00:00Z", capacity: 10, bookedCount: 9, seatsLeft: 1, status: "open" },
    { id: "slot3", startsAt: "2027-01-04T05:00:00Z", endsAt: "2027-01-04T05:45:00Z", capacity: 10, bookedCount: 10, seatsLeft: 0, status: "open" },
  ] });
  scheduleApi.summary = async () => ({ kpis: { assigned: 3, started: 2, scored: 0, averagePercent: null, medianPercent: null }, distribution: [], competencies: [], weakestKeyPoints: [] });
});

function Location() {
  const location = useLocation();
  return h("output", { id: "location" }, location.pathname + location.search);
}
const render = async (path) => {
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [path] }, h(ThemeProvider, null,
    h(Routes, null, h(Route, { path: "/admin/ai-interviews/schedules/*", element: h(AnviSchedulesRoutes) })), h(Location)))));
  await tick(10);
};
const text = () => document.body.textContent;
const buttons = () => [...document.querySelectorAll("button")];
const button = (pattern) => buttons().find((node) => pattern.test(node.textContent) || pattern.test(node.getAttribute("aria-label") || ""));
const click = async (node) => {
  assert.ok(node, "click target exists");
  await act(async () => { node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await tick();
};
const setValue = async (node, value) => {
  assert.ok(node, "input exists");
  const proto = node.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  await tick();
};
const inputLabelled = (pattern) => {
  const label = [...document.querySelectorAll("label")].find((node) => pattern.test(node.textContent));
  assert.ok(label, `label ${pattern} exists`);
  return label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector("input, select, textarea");
};
const waitFor = async (check, label, attempts = 250) => {
  for (let i = 0; i < attempts; i += 1) { if (check()) return; await tick(20); }
  assert.fail(`timed out waiting for ${label}`);
};

test("IST inputs become +05:30 ISO strings, and every display says IST", () => {
  assert.equal(model.istInputToIso("2026-11-02T09:00"), "2026-11-02T09:00:00+05:30");
  assert.equal(model.istInputToIso("2026-02-31T09:00"), "", "rolled-over dates are rejected");
  assert.equal(model.istInputToIso("2026-11-02 09:00"), "");
  assert.equal(model.istInputToIso(""), "");
  assert.equal(new Date(model.istInputToIso("2026-11-02T09:00")).toISOString(), "2026-11-02T03:30:00.000Z");
  assert.equal(model.toIstInput("2026-11-02T20:00:00Z"), "2026-11-03T01:30", "UTC evening is the next IST morning");
  assert.equal(model.toIstInput(model.istInputToIso("2026-12-31T23:45")), "2026-12-31T23:45", "round trip");
  assert.match(model.formatIst("2026-11-02T03:30:00Z"), /9:00\s?am IST$/i);
  assert.equal(model.formatIst(null), "—");
});

test("slot preview mirrors server generation: weekdays, blackouts, window edges, past slots and the cap", () => {
  const slotPolicy = { slotMinutes: 60, capacityPerSlot: 5, dailyStart: "09:00", dailyEnd: "12:00", weekdays: [1, 2], blackoutDates: [] };
  const now = Date.parse("2026-10-22T00:00:00Z");
  // Mon 2 Nov to Wed 4 Nov: Mon and Tue have three one-hour slots, Wed is not a slot day.
  let preview = model.previewSlots({ opensAt: "2026-11-02T00:00", closesAt: "2026-11-04T23:00", slotPolicy, now });
  assert.equal(preview.count, 6);
  assert.equal(preview.seats, 30);
  assert.deepEqual(preview.days.map((day) => [day.date, day.count]), [["2026-11-02", 3], ["2026-11-03", 3]]);
  assert.equal(new Date(preview.first).toISOString(), "2026-11-02T03:30:00.000Z", "09:00 IST");
  preview = model.previewSlots({ opensAt: "2026-11-02T10:00", closesAt: "2026-11-03T11:00", slotPolicy: { ...slotPolicy, blackoutDates: [] }, now });
  assert.equal(preview.count, 4, "10:00 and 11:00 on Monday, 09:00 and 10:00 on Tuesday");
  preview = model.previewSlots({ opensAt: "2026-11-02T00:00", closesAt: "2026-11-04T23:00", slotPolicy: { ...slotPolicy, blackoutDates: ["2026-11-03"] }, now });
  assert.equal(preview.count, 3);
  preview = model.previewSlots({ opensAt: "2026-11-02T00:00", closesAt: "2026-11-04T23:00", slotPolicy, now: Date.parse("2026-11-02T04:00:00Z") });
  assert.equal(preview.count, 5, "the 09:00 IST Monday slot has already started");
  preview = model.previewSlots({ opensAt: "2026-11-02T00:00", closesAt: "2027-12-31T23:00", slotPolicy: { ...slotPolicy, slotMinutes: 15, dailyStart: "00:00", dailyEnd: "23:45", weekdays: [0, 1, 2, 3, 4, 5, 6] }, now });
  assert.equal(preview.capped, true);
  assert.equal(model.previewSlots({ opensAt: "bad", closesAt: "2026-11-04T23:00", slotPolicy, now }).count, 0);
});

test("step validation, capacity warnings and the create payload", () => {
  const now = Date.parse("2026-10-22T00:00:00Z");
  const draft = { ...model.newScheduleDraft("i1"), opensAt: "2026-11-02T09:00", closesAt: "2026-11-06T18:00" };
  assert.equal(model.validateInterviewStep({ ...draft, interviewId: "" }), "Choose a published interview to schedule.");
  assert.match(model.validateInterviewStep(draft, { publishedAt: null }), /Only published interviews/);
  assert.equal(model.validateStudentStep(draft, { selected: [] }), "Add at least one registered student.");
  assert.match(model.validateStudentStep(draft, { selected: Array.from({ length: 2001 }, (_, i) => ({ _id: `s${i}` })) }), /up to 2,000/);
  assert.equal(model.validateStudentStep({ ...draft, source: "filters" }, {}), "Choose at least one student filter.");
  assert.equal(model.validateStudentStep({ ...draft, source: "filters", filters: { ...draft.filters, semester: "5" } }, { filterCount: 0 }), "No students match these filters.");
  assert.equal(model.validateStudentStep(draft, { selected: [{ _id: "s1" }], pending: true }).startsWith("Finish adding"), true);
  assert.equal(model.validateWindowStep(draft, { now }), "");
  assert.equal(model.validateWindowStep({ ...draft, closesAt: "2026-11-02T08:00" }, { now }), "The window must close after it opens.");
  assert.match(model.validateWindowStep({ ...draft, opensAt: "2026-10-01T09:00" }, { now }), /in the past/);
  assert.equal(model.validateWindowStep({ ...draft, opensAt: "2026-10-01T09:00" }, { now, allowPastOpen: true }), "", "an open schedule keeps its past opening time");
  assert.match(model.validateWindowStep({ ...draft, slotPolicy: { ...draft.slotPolicy, slotMinutes: 10 } }, { now }), /15 to 120/);
  assert.match(model.validateWindowStep({ ...draft, slotPolicy: { ...draft.slotPolicy, weekdays: [] } }, { now }), /weekday/);
  assert.match(model.validateWindowStep({ ...draft, slotPolicy: { ...draft.slotPolicy, weekdays: [0] } }, { now }), /no future slots/);
  assert.equal(model.validateWindowStep({ ...draft, timing: "window" }, { now }), "");
  assert.equal(model.validatePolicyStep(draft), "");
  assert.match(model.validatePolicyStep({ ...draft, bookingPolicy: { ...draft.bookingPolicy, attemptsAllowed: 0 } }), /Attempts allowed/);
  assert.equal(model.validatePolicyStep({ ...draft, timing: "window", bookingPolicy: { ...draft.bookingPolicy, cutoffMinutes: "" } }), "", "slot rules are ignored in window mode");

  const warnings = model.capacityWarnings({ preview: { seats: 30 }, cohortSize: 40, slotMinutes: 20, estimatedMinutes: 30 });
  assert.match(warnings[0], /Only 30 seats for 40 students\. 10 students/);
  assert.match(warnings[1], /up to 30 minutes/);
  assert.match(model.capacityWarnings({ preview: { seats: 42 }, cohortSize: 40 })[0], /spare capacity/);
  assert.deepEqual(model.capacityWarnings({ preview: { seats: 80 }, cohortSize: 40 }), []);

  const payload = model.buildSchedulePayload({ ...draft, slotPolicy: { ...draft.slotPolicy, weekdays: [5, 1, 1], blackoutDates: ["2026-11-04", "2026-11-03"] } }, { selected: [{ _id: "s1" }, { _id: "s2" }, { _id: "s1" }] });
  assert.deepEqual(payload.window, { opensAt: "2026-11-02T09:00:00+05:30", closesAt: "2026-11-06T18:00:00+05:30" });
  assert.deepEqual(payload.audience, { source: "selected", studentIds: ["s1", "s2"] });
  assert.deepEqual(payload.slotPolicy.weekdays, [1, 5]);
  assert.deepEqual(payload.slotPolicy.blackoutDates, ["2026-11-03", "2026-11-04"]);
  assert.deepEqual(payload.bookingPolicy, { rescheduleLimit: 2, cutoffMinutes: 60, earlyJoinMinutes: 10, lateGraceMinutes: 10, attemptsAllowed: 1 });
  assert.equal(payload.reportVisibility, "after_close");
  assert.equal(payload.blockPractice, true);
  const filtered = model.buildSchedulePayload({ ...draft, source: "filters", timing: "window", filters: { semester: "5", branch: " CSE ", course: "", college: "", group: "" } });
  assert.deepEqual(filtered.audience, { source: "filters", filters: { semester: 5, branch: "CSE" } });
  assert.deepEqual(filtered.slotPolicy, { mode: "window" });
  assert.equal(model.buildSchedulePayload({ ...draft, source: "csv" }, { selected: [{ _id: "s9" }] }).audience.source, "csv");
});

test("the edit patch carries only what changed, and lifecycle actions follow status", () => {
  const assignment = detail().assignment;
  const edit = model.draftFromAssignment(assignment);
  assert.equal(edit.opensAt, "2026-11-02T09:00");
  assert.deepEqual(model.buildSchedulePatch(assignment, edit), {});
  const patch = model.buildSchedulePatch(assignment, { ...edit, closesAt: "2026-11-07T18:00", notes: "Lab C", bookingPolicy: { ...edit.bookingPolicy, rescheduleLimit: 1 } });
  assert.deepEqual(Object.keys(patch).sort(), ["bookingPolicy", "notes", "window"]);
  assert.equal(patch.window.closesAt, "2026-11-07T18:00:00+05:30");
  assert.equal(patch.bookingPolicy.rescheduleLimit, 1);
  assert.deepEqual(model.actionsFor({ status: "open", reportVisibility: "manual" }), ["release", "pause", "close", "cancel"]);
  assert.deepEqual(model.actionsFor({ status: "paused", reportVisibility: "after_close" }), ["resume", "close", "cancel"]);
  assert.deepEqual(model.actionsFor({ status: "closed", reportVisibility: "manual", releasedAt: "2026-11-07T00:00:00Z" }), ["archive"]);
  assert.deepEqual(model.actionsFor({ status: "scheduled" }), ["pause", "cancel"]);
  assert.equal(model.isLiveBooking({ status: "booked", active: true }), true);
  assert.equal(model.isLiveBooking({ status: "needs_reschedule", active: true }), true);
  assert.equal(model.isLiveBooking({ status: "cancelled", active: false }), false);
  assert.equal(model.rosterRows({ roster: [{ studentId: "s1" }] }).length, 1, "the server sends the roster as an array");
  assert.equal(model.kpiValue({ inProgress: 4 }, "in_progress"), 4);
  assert.equal(model.kpiValue({}, "no_show"), 0);
  const summary = model.normaliseSummary({ distribution: [{ band: "0-20", count: 2 }], competencyAverages: [{ competency: "APIs", averagePercent: 61 }, { name: "Bad" }], weakestKeyPoints: [{ point: "Caching", missRate: 80, missed: 8, total: 10 }] });
  assert.deepEqual(summary.distribution, [{ label: "0-20", value: 2 }]);
  assert.deepEqual(summary.competencies, [{ label: "APIs", value: 61 }]);
  assert.equal(summary.weakest[0].text, "Caching");
});

test("the API client uses the scheduling routes, request shapes and an Idempotency-Key", async () => {
  const sent = [];
  const original = api.aiInterviewRequest;
  api.aiInterviewRequest = async (path, options = {}) => { sent.push([path, options.method || "GET", options.body, options.headers]); return {}; };
  try {
    await realScheduleApi.list({ status: "open", interviewId: "", page: 2 });
    await realScheduleApi.create({ interviewId: "i1" }, "key-1");
    await realScheduleApi.get("a1", { outcome: "booked", search: "" });
    await realScheduleApi.update("a1", 3, { notes: "x" });
    await realScheduleApi.transition("a1", "release");
    await realScheduleApi.addTargets("a1", ["s1"]);
    await realScheduleApi.removeTarget("a1", "s1");
    await realScheduleApi.slots("a1");
    await realScheduleApi.moveBooking("b1", "slot2");
    await realScheduleApi.cancelBooking("b1", "Lab");
    await realScheduleApi.summary("a1");
  } finally { api.aiInterviewRequest = original; }
  assert.deepEqual(sent, [
    ["/schedules?status=open&page=2", "GET", undefined, undefined],
    ["/schedules", "POST", { interviewId: "i1" }, { "Idempotency-Key": "key-1" }],
    ["/schedules/a1?outcome=booked", "GET", undefined, undefined],
    ["/schedules/a1", "PATCH", { notes: "x", revision: 3 }, undefined],
    ["/schedules/a1/release", "POST", {}, undefined],
    ["/schedules/a1/targets", "POST", { studentIds: ["s1"] }, undefined],
    ["/schedules/a1/targets/s1", "DELETE", undefined, undefined],
    ["/schedules/a1/slots", "GET", undefined, undefined],
    ["/schedules/bookings/b1/move", "POST", { slotId: "slot2" }, undefined],
    ["/schedules/bookings/b1/cancel", "POST", { reason: "Lab" }, undefined],
    ["/reports/assignments/a1/summary", "GET", undefined, undefined],
  ]);
});

test("roster recheck uses the check-csv validator in batches of 1,000 and numbers rows across batches", async () => {
  const roster = Array.from({ length: 1500 }, (_, i) => ({ _id: `s${i}`, name: i === 1200 ? "blocked student" : `Student ${i}`, email: `s${i}@example.edu`, studentId: `GE${i}` }));
  const invalid = await students.recheckStudents(roster);
  assert.deepEqual(calls.filter(([name]) => name === "check").map(([, count]) => count), [1000, 500]);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].row, 1201);
  assert.equal(invalid[0].status, "student_not_registered");
});

test("the wizard schedules a filtered cohort with IST times, a slot preview and one idempotency key", async () => {
  await render("/admin/ai-interviews/schedules/new?interviewId=i1");
  assert.match(text(), /Interview & mode/);
  // A preset interview is one summary card, not the picker.
  await waitFor(() => /Backend mock/.test(document.querySelector("[data-interview-summary]")?.textContent || ""), "preset interview summary");
  await click(button(/Continue to students/));

  await click([...document.querySelectorAll('[role="tab"]')].find((node) => /Filter by batch/.test(node.textContent)));
  await setValue(document.querySelector('select[aria-label="Semester"]'), "5");
  await tick(400);
  await waitFor(() => /40 students match now/.test(text()), "filter count");
  assert.ok(calls.some(([name, options]) => name === "students" && options.semester === "5" && options.limit === 1));
  await click(button(/Continue to window/));

  assert.match(text(), /India Standard Time/);
  await click(button(/Continue to policies/));
  assert.match(document.querySelector('[role="alert"]').textContent, /window opens/);
  await setValue(inputLabelled(/^Opens/), "2027-01-04T09:00");
  await setValue(inputLabelled(/^Closes/), "2027-01-05T18:00");
  assert.match(text(), /4 Jan 2027, 9:00\s?am IST/i);
  const preview = document.querySelector('[aria-label="Slot preview"]').textContent;
  assert.match(preview, /Slots20/, "ten 45-minute slots on each of two weekdays");
  assert.match(preview, /Seats200/);
  await click(button(/Continue to policies/));

  assert.match(text(), /When students see their report/);
  await click(button(/When I release them/));
  await click(button(/Continue to review/));
  assert.match(text(), /Everyone matching filters|Student filters/);
  assert.match(text(), /20 slots · 200 seats/);
  await click(button(/^Schedule interview$/));
  await waitFor(() => calls.some(([name]) => name === "get"), "detail load");

  const create = calls.find(([name]) => name === "create");
  assert.ok(create, "create was called");
  const [, body, key] = create;
  assert.ok(key && typeof key === "string", "an Idempotency-Key is sent");
  assert.equal(body.interviewId, "i1");
  assert.equal(body.mode, "mock");
  assert.deepEqual(body.audience, { source: "filters", filters: { semester: 5 } });
  assert.deepEqual(body.window, { opensAt: "2027-01-04T09:00:00+05:30", closesAt: "2027-01-05T18:00:00+05:30" });
  assert.equal(body.slotPolicy.mode, "slots");
  assert.equal(body.reportVisibility, "manual");
  assert.equal(document.getElementById("location").textContent, "/admin/ai-interviews/schedules/a9");
  await waitFor(() => /Scheduled for 38 students across 20 slots/.test(text()), "created notice");
  assert.match(text(), /Note: 20 seats for 38 students\./);
});

test("the wizard requires a cohort before it rechecks or moves on", async () => {
  await render("/admin/ai-interviews/schedules/new");
  await waitFor(() => document.querySelector('[role="radio"]'), "interviews listed");
  await click(document.querySelector('[role="radio"]'));
  await click(button(/Continue to students/));
  await click(button(/Continue to window/));
  assert.match(document.querySelector('[role="alert"]').textContent, /Add at least one registered student/);
  assert.ok(!calls.some(([name]) => name === "check"), "no recheck without students");
});

test("the list shows status, IST window and progress, and links to the detail", async () => {
  await render("/admin/ai-interviews/schedules");
  await waitFor(() => /Backend mock/.test(text()), "list rows");
  assert.match(text(), /Open/);
  assert.match(text(), /1 of 3 completed/);
  assert.match(text(), /45 min slots · 10 per slot/);
  assert.ok([...document.querySelectorAll("a")].some((link) => link.getAttribute("href") === "/admin/ai-interviews/schedules/a1"));
  assert.ok([...document.querySelectorAll("a")].some((link) => link.getAttribute("href") === "/admin/ai-interviews/schedules/new"));
});

test("the detail page shows KPIs and roster, and runs lifecycle and booking operations", async () => {
  // An open schedule whose window has opened (close is not offered before opensAt).
  scheduleApi.get = async (id, values) => { calls.push(["get", id, values]); return detail({ window: { opensAt: "2026-10-01T03:30:00Z", closesAt: "2026-11-06T12:30:00Z" } }); };
  await render("/admin/ai-interviews/schedules/a1");
  await waitFor(() => /Asha Rao/.test(text()), "roster");
  const kpis = document.querySelector('[aria-label="Cohort progress"]').textContent;
  for (const label of ["Assigned3", "Booked1", "In progress0", "Completed1", "No-show0", "Missed1"]) assert.match(kpis, new RegExp(label));
  assert.match(text(), /IST/);
  assert.match(text(), /Rescheduled 1×/);
  assert.match(text(), /Published version 4/);
  assert.match(text(), /3 students/);
  assert.match(text(), /Selected individually/);
  assert.equal(document.querySelector("table").hasAttribute("data-no-serial"), true, "no spreadsheet serial column");
  assert.match(text(), /40 slots · 1 of 400 seats booked/);
  assert.equal(button(/Cancel booking for Bilal Khan/), undefined, "a completed booking cannot be cancelled");
  // Release reports and Edit stay in the header; the rest live in the More menu, destructive last.
  for (const label of [/^Release reports$/, /^Edit$/]) assert.ok(button(label), `${label} is offered`);
  assert.equal(button(/^Pause$/), undefined, "secondary actions start hidden in the menu");
  await click(button(/^More schedule actions$/));
  const menuItems = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((node) => node.textContent);
  assert.deepEqual(menuItems, ["View assigned students", "Edit students", "Export CSV", "Pause", "Close now", "Cancel schedule"]);

  await click(button(/^Pause$/));
  assert.match(document.querySelector("dialog").textContent, /In-progress|in progress continue/i);
  await click([...document.querySelectorAll("dialog button")].find((node) => node.textContent === "Pause"));
  assert.deepEqual(calls.find(([name]) => name === "transition"), ["transition", "a1", "pause"]);
  await waitFor(() => /Schedule paused/.test(text()), "pause notice");

  await click(button(/Cancel booking for Asha Rao/));
  await setValue(document.querySelector("dialog input"), "Lab unavailable");
  await click([...document.querySelectorAll("dialog button")].find((node) => node.textContent === "Cancel booking"));
  assert.deepEqual(calls.find(([name]) => name === "cancelBooking"), ["cancelBooking", "b1", "Lab unavailable"]);

  await click(button(/^Remove Chen Li$/));
  await click([...document.querySelectorAll("dialog button")].find((node) => node.textContent === "Remove student"));
  assert.deepEqual(calls.find(([name]) => name === "removeTarget"), ["removeTarget", "a1", "s3"]);
  assert.equal(button(/^Remove Bilal Khan$/), undefined, "a completed student cannot be removed");

  await click(button(/Move booking for Asha Rao/));
  await waitFor(() => document.querySelectorAll('dialog [role="radio"]').length > 0, "slots listed");
  const radios = [...document.querySelectorAll('dialog [role="radio"]')];
  assert.equal(radios.length, 2, "the current slot is not offered");
  assert.match(radios[0].textContent, /1 seat left/);
  assert.equal(radios[1].disabled, true, "a full slot cannot be chosen");
  await click(radios[0]);
  await click([...document.querySelectorAll("dialog button")].find((node) => node.textContent === "Move booking"));
  assert.deepEqual(calls.find(([name]) => name === "moveBooking"), ["moveBooking", "b1", "slot2"]);
});

test("the roster filters reach the detail request, and the report tab handles an empty cohort", async () => {
  await render("/admin/ai-interviews/schedules/a1");
  await waitFor(() => /Asha Rao/.test(text()), "roster");
  await setValue(document.querySelector('select[aria-label="Filter by outcome"]'), "no_show");
  await waitFor(() => calls.some(([name, , values]) => name === "get" && values.outcome === "no_show"), "outcome filter");
  await click([...document.querySelectorAll('[role="tab"]')].find((node) => /Cohort report/.test(node.textContent)));
  await waitFor(() => /No evaluated attempts yet/.test(text()), "report empty state");
  assert.match(text(), /Attempted2/);
});

test("lifecycle actions, eligibility, counting, edit checks and seat copy match the server rules", () => {
  const before = Date.parse("2026-11-01T00:00:00Z");
  const opened = { window: { opensAt: "2026-11-02T03:30:00Z", closesAt: "2026-11-06T12:30:00Z" } };
  assert.deepEqual(model.actionsFor({ ...opened, status: "paused", reportVisibility: "after_close" }, before), ["resume", "cancel"], "close is refused before the window opens");
  assert.deepEqual(model.actionsFor({ ...opened, status: "paused", reportVisibility: "after_close" }, Date.parse("2026-11-03T00:00:00Z")), ["resume", "close", "cancel"]);
  assert.deepEqual(model.actionsFor({ status: "cancelled", reportVisibility: "manual" }), ["release", "archive"], "manual reports of a cancelled schedule stay releasable");
  assert.deepEqual(model.actionsFor({ status: "archived", reportVisibility: "manual" }), ["release"]);
  assert.deepEqual(model.actionsFor({ status: "draft" }), ["cancel"], "an unfinished create can be cleared");

  const draft = { ...model.newScheduleDraft("i1"), source: "filters", filters: { ...model.newScheduleDraft().filters, branch: "CSE" } };
  assert.match(model.validateStudentStep(draft, { filterCount: 1500, counting: true }), /Wait for the student count/, "a stale count never passes");
  assert.equal(model.validateStudentStep(draft, { filterCount: 1500 }), "");
  const late = { ...model.newScheduleDraft("i1"), opensAt: "2026-11-02T09:00", closesAt: "2026-11-02T17:30" };
  const afterLastSlot = Date.parse("2026-11-02T11:20:00Z");
  assert.match(model.validateWindowStep(late, { now: afterLastSlot, allowPastOpen: true }), /no future slots/);
  assert.equal(model.validateWindowStep(late, { now: afterLastSlot, allowPastOpen: true, checkSchedule: false }), "", "a notes-only edit is not blocked");

  const [seatWarning] = model.capacityWarnings({ preview: { seats: 50 }, cohortSize: 40, attemptsAllowed: 2 }).filter((row) => /attempt/.test(row));
  assert.match(seatWarning, /Each attempt needs its own booked seat/);
  assert.doesNotMatch(seatWarning, /same booking/);

  assert.equal(model.isRebookable({ status: "assigned", booking: { status: "no_show", active: false }, attempt: null }), true);
  assert.equal(model.isRebookable({ status: "assigned", booking: { status: "cancelled", cancelledBy: "student" }, attempt: null }), true);
  assert.equal(model.isRebookable({ status: "assigned", booking: { status: "cancelled", cancelledBy: "admin" }, attempt: null }), false);
  assert.equal(model.isRebookable({ status: "assigned", booking: { status: "no_show" }, attempt: { id: "t1" } }), false);

  const summary = model.normaliseSummary({ kpis: { completionRate: 50 }, bands: [{ band: "Excellent", count: 1 }, { band: "Good", count: 0 }] });
  assert.equal(summary.completionRate, 50);
  assert.deepEqual(summary.bands, [{ label: "Excellent", value: 1 }, { label: "Good", value: 0 }]);
});

test("server-refused students are named and removable, and long requests wait as long as the server", async () => {
  const selected = [{ _id: "s1", name: "Asha" }, { _id: "s2", name: "Inactive Ravi", email: "ravi@example.edu" }, { _id: "s3", name: "Chen" }];
  const rows = students.ineligibleRows(selected, ["s2", "unknown"]);
  assert.deepEqual(rows.map((row) => [row.row, row._id, row.name]), [[2, "s2", "Inactive Ravi"]]);
  assert.match(rows[0].message, /inactive or assessment-only/);

  const sent = [];
  const original = api.aiInterviewRequest;
  api.aiInterviewRequest = async (path, options = {}) => { sent.push([path, options.timeoutMs, options.skipQueue]); return {}; };
  try {
    await realScheduleApi.create({ interviewId: "i1" }, "key-1");
    await realScheduleApi.addTargets("a1", ["s1"]);
    await realScheduleApi.transition("a1", "close");
    await realScheduleApi.update("a1", 3, { notes: "x" });
  } finally { api.aiInterviewRequest = original; }
  assert.deepEqual(sent, [
    ["/schedules", 120_000, true], ["/schedules/a1/targets", 120_000, true], ["/schedules/a1/close", 120_000, true], ["/schedules/a1", undefined, undefined],
  ]);
});

test("a no-show can be rebooked by the admin, and the cohort report shows bands and completion", async () => {
  scheduleApi.get = async (id, values) => {
    calls.push(["get", id, values]);
    const base = detail();
    return { ...base, roster: [{ studentId: "s4", name: "Dev Patel", email: "dev@example.edu", studentCode: "GE4", status: "assigned", outcome: "no_show", attemptsUsed: 0,
      booking: { id: "b4", slotId: "slot0", startsAt: "2026-11-02T03:30:00Z", endsAt: "2026-11-02T04:15:00Z", status: "no_show", active: false, rescheduleCount: 0 }, attempt: null }] };
  };
  scheduleApi.summary = async () => ({
    kpis: { assigned: 3, started: 2, scored: 2, averagePercent: 65, medianPercent: 65, completionRate: 67 },
    distribution: [{ label: "60–69", count: 2 }], bands: [{ band: "Excellent", count: 0 }, { band: "Good", count: 2 }], competencies: [], weakestKeyPoints: [],
  });
  await render("/admin/ai-interviews/schedules/a1");
  await waitFor(() => /Dev Patel/.test(text()), "roster");
  assert.equal(button(/Move booking for Dev Patel/), undefined);
  await click(button(/^Rebook Dev Patel$/));
  await waitFor(() => document.querySelectorAll('dialog [role="radio"]').length > 0, "slots listed");
  assert.match(document.querySelector("dialog").textContent, /no-show/);
  await click(document.querySelector('dialog [role="radio"]'));
  await click([...document.querySelectorAll("dialog button")].find((node) => node.textContent === "Book slot"));
  assert.deepEqual(calls.find(([name]) => name === "moveBooking"), ["moveBooking", "b4", "slot1"]);

  await click([...document.querySelectorAll('[role="tab"]')].find((node) => /Cohort report/.test(node.textContent)));
  await waitFor(() => /Completion rate/.test(text()), "report tiles");
  assert.match(text(), /Completion rate67%/);
  assert.match(document.querySelector('[aria-label="Students per score band"]').textContent, /Good2\s?students/);
  assert.match(text(), /No key point was missed\./);
});

test("DateTimePicker passes out-of-range edits through and explains them inline", async () => {
  const received = [];
  function Harness() {
    const [value, setValue] = useState("2027-01-04T10:00");
    const [start, setStart] = useState("");
    return h("div", null,
      h(DateTimePicker, { value, min: "2027-01-04T09:00", max: "2027-01-05T09:00", onChange: (next) => { received.push(next); setValue(next); }, placeholder: "Ends" }),
      h(DateTimePicker, { value: start, onChange: (next) => { received.push(next); setStart(next); }, placeholder: "Starts" }));
  }
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(Harness)));
  const input = document.querySelector('input[aria-label="Ends"]');
  assert.equal(document.querySelector('[role="alert"]'), null, "a saved value is not flagged");
  await setValue(input, "2027-01-04T08:00");
  assert.deepEqual(received, ["2027-01-04T08:00"], "the edit is not dropped");
  assert.equal(input.value, "2027-01-04T08:00");
  assert.match(document.querySelector('[role="alert"]').textContent, /on or after/);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  await setValue(input, "2027-01-05T10:00");
  assert.match(document.querySelector('[role="alert"]').textContent, /on or before/);
  await setValue(input, "2027-01-04T11:00");
  assert.equal(document.querySelector('[role="alert"]'), null);
  await setValue(document.querySelector('input[aria-label="Starts"]'), "2020-01-01T10:00");
  assert.equal(received.at(-1), "2020-01-01T10:00");
  assert.equal(document.querySelector('[role="alert"]').textContent, "Choose a time in the future.");
});
