import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import process from "node:process";

// A browser far from India: every scheduled time must still read in IST.
process.env.TZ = "America/New_York";

let dom, server, root, createRoot, api, schedule, dashboardUtils, kinds, InterviewBoard, listModel, BookingSheet, AnviInterviewsPage;
let AuthContext, UniversityPolicyProvider, ThemeProvider, socketService;
const globals = ["window", "document", "navigator", "HTMLElement", "localStorage", "ResizeObserver", "IS_REACT_ACT_ENVIRONMENT"];
const previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const previousFetch = globalThis.fetch;
const tick = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const MIN = 60_000;

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/u/test-university/student/ai-interviews", pretendToBeVisual: true });
  const values = { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } };
  for (const name of globals) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name in values ? values[name] : dom.window[name] });
  globalThis.fetch = async () => { throw new Error("Unexpected live request in scheduling test"); };
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  api = (await server.ssrLoadModule("/src/utils/api.js")).api;
  schedule = await server.ssrLoadModule("/src/student/anvi/anviSchedule.js");
  dashboardUtils = await server.ssrLoadModule("/src/student/dashboard/dashboardUtils.js");
  kinds = await server.ssrLoadModule("/src/components/notificationKinds.js");
  InterviewBoard = (await server.ssrLoadModule("/src/student/anvi/list/InterviewBoard.jsx")).default;
  listModel = await server.ssrLoadModule("/src/student/anvi/list/listModel.js");
  BookingSheet = (await server.ssrLoadModule("/src/student/anvi/BookingSheet.jsx")).default;
  AnviInterviewsPage = (await server.ssrLoadModule("/src/student/anvi/AnviInterviewsPage.jsx")).default;
  AuthContext = (await server.ssrLoadModule("/src/context/AuthContext.jsx")).default;
  ({ UniversityPolicyProvider } = await server.ssrLoadModule("/src/platform/UniversityPolicyContext.jsx"));
  ({ ThemeProvider } = await server.ssrLoadModule("/src/context/ThemeContext.jsx"));
  socketService = (await server.ssrLoadModule("/src/utils/socket.js")).default;
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
after(async () => {
  await server?.close();
  dom?.window.close();
  globalThis.fetch = previousFetch;
  for (const name of globals) {
    if (previous.get(name)) Object.defineProperty(globalThis, name, previous.get(name));
    else delete globalThis[name];
  }
});

function Location() {
  return h("output", { id: "location" }, useLocation().pathname);
}
const render = async (element, url = "/student/ai-interviews") => {
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [url] }, element, h(Location))));
  await tick();
};
const text = () => document.getElementById("app").textContent;
const buttonNamed = (pattern, scope = document) => [...scope.querySelectorAll("button")].find((button) => pattern.test(button.textContent));
const click = (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
const cardFor = (id) => document.querySelector(`[data-assignment="${id}"]`);
const board = (props) => h(InterviewBoard, { now: NOW, onReload: async () => {}, ...props });
const pageTab = (pattern) => [...document.querySelectorAll('[aria-label="Interviews"] [role="tab"]')].find((tab) => pattern.test(tab.textContent));
// Secondary actions live in each row's "More actions" menu.
const openMenu = (card) => click(card.querySelector('[aria-haspopup="menu"]'));
const menuItem = (pattern) => [...document.querySelectorAll('[role="menuitem"]')].find((item) => pattern.test(item.textContent));

// 22 Oct 2026, 10:00 UTC = 3:30 pm IST.
const NOW = Date.parse("2026-10-22T10:00:00Z");
const iso = (offsetMinutes) => new Date(NOW + offsetMinutes * MIN).toISOString();
const windowOf = { opensAt: iso(-24 * 60), closesAt: iso(5 * 24 * 60) };
const bookedItem = (startOffset, extra = {}) => ({
  assignmentId: "as-booked", interviewId: "int-1", title: "Placement mock", role: "SDE", mode: "mock", window: windowOf, slotMode: "slots",
  booking: { id: "bk-1", slotId: "sl-1", startsAt: iso(startOffset), endsAt: iso(startOffset + 30), status: "booked", rescheduleLeft: 2 },
  joinWindow: { from: iso(startOffset - 10), to: iso(startOffset + 10) },
  canStart: startOffset - 10 <= 0 && startOffset + 10 >= 0, startBlockedReason: startOffset - 10 > 0 ? "NOT_YET_OPEN" : null,
  outcome: "booked", attemptId: null, reportVisible: false, ...extra,
});

// ---- Pure helpers ----

test("IST formatting is explicit and does not follow the browser's time zone", () => {
  assert.match(schedule.formatIST("2026-10-22T10:00:00Z"), /^22 Oct 2026, 3:30\s?pm IST$/i);
  assert.match(schedule.formatISTTime("2026-10-22T10:00:00Z"), /^3:30\s?pm$/i);
  assert.equal(schedule.istDayKey("2026-10-22T19:00:00Z"), "2026-10-23", "00:30 IST belongs to the next IST day");
  assert.equal(schedule.istDayKey("2026-10-22T18:00:00Z"), "2026-10-22");
  assert.equal(schedule.formatIST(null), "Time to be confirmed");
  assert.match(dashboardUtils.formatSchedule("2026-10-22T10:00:00Z", { ist: true }), /Oct.*3:30\s?pm IST$/i);
});

test("Join is enabled only inside the join window, with the reason shown otherwise", () => {
  const early = schedule.joinStateOf(bookedItem(60), NOW);
  assert.equal(early.enabled, false);
  assert.equal(early.phase, "before");
  assert.match(early.reason, /Join opens at 4:20\s?pm IST on Thu, 22 Oct \(in 50 min\)/i);

  const open = schedule.joinStateOf(bookedItem(5), NOW);
  assert.equal(open.enabled, true);
  assert.equal(open.reason, "");

  const late = schedule.joinStateOf(bookedItem(-30), NOW);
  assert.equal(late.enabled, false);
  assert.match(late.reason, /join window closed at 3:10\s?pm IST/i);

  // The list was loaded before the window opened: the clock, not the stale time code, decides.
  const stale = schedule.joinStateOf({ ...bookedItem(5), canStart: false, startBlockedReason: "NOT_YET_OPEN" }, NOW);
  assert.equal(stale.enabled, true);

  // A non-time block is respected even inside the window.
  const paused = schedule.joinStateOf({ ...bookedItem(5), canStart: false, startBlockedReason: "PAUSED" }, NOW);
  assert.equal(paused.enabled, false);
  assert.match(paused.reason, /paused/);
  assert.equal(schedule.joinStateOf({ ...bookedItem(5), canStart: false, startBlockedReason: "Attempts are used up for this interview." }, NOW).reason, "Attempts are used up for this interview.");

  // Window mode without a server join window: [opensAt, closesAt - 5 min].
  const windowMode = { assignmentId: "as-w", slotMode: "window", window: { opensAt: iso(-60), closesAt: iso(4) }, canStart: true, outcome: "pending" };
  assert.equal(schedule.joinStateOf(windowMode, NOW).enabled, false, "the last five minutes are closed to new starts");
  assert.equal(schedule.joinStateOf({ ...windowMode, window: { ...windowMode.window, closesAt: iso(30) } }, NOW).enabled, true);
});

test("card states follow the outcome, booking and window", () => {
  assert.equal(schedule.cardStateOf(bookedItem(60), NOW), "booked");
  assert.equal(schedule.cardStateOf({ ...bookedItem(60), booking: null, outcome: "pending" }, NOW), "book");
  assert.equal(schedule.cardStateOf({ ...bookedItem(60), booking: { ...bookedItem(60).booking, status: "needs_reschedule" }, outcome: "pending" }, NOW), "needs_reschedule");
  assert.equal(schedule.cardStateOf({ ...bookedItem(0), outcome: "in_progress", attemptId: "at-1" }, NOW), "in_progress");
  assert.equal(schedule.cardStateOf({ ...bookedItem(-90), outcome: "completed", attemptId: "at-1" }, NOW), "completed");
  assert.equal(schedule.cardStateOf({ ...bookedItem(-90), outcome: "no_show" }, NOW), "missed");
  assert.equal(schedule.cardStateOf({ ...bookedItem(-90) }, NOW), "missed", "a booked slot whose join window passed is missed");
  assert.equal(schedule.cardStateOf({ slotMode: "window", window: { opensAt: iso(-60), closesAt: iso(60) }, outcome: "pending" }, NOW), "window");
  assert.equal(schedule.cardStateOf({ slotMode: "window", window: { opensAt: iso(-120), closesAt: iso(-60) }, outcome: "pending" }, NOW), "missed");
  assert.equal(schedule.cardStateOf({ ...bookedItem(60), outcome: "cancelled" }, NOW), "cancelled");
});

test("reschedule and cancel close at the cutoff; the reschedule allowance is enforced", () => {
  const open = schedule.changeStateOf(bookedItem(120), NOW);
  assert.deepEqual([open.canCancel, open.canReschedule, open.rescheduleLeft], [true, true, 2]);
  const late = schedule.changeStateOf(bookedItem(45), NOW);
  assert.equal(late.canCancel, false);
  assert.equal(late.canReschedule, false);
  assert.match(late.cancelReason, /Changes close 60 min before your slot starts/);
  const usedUp = schedule.changeStateOf({ ...bookedItem(120), booking: { ...bookedItem(120).booking, rescheduleLeft: 0 } }, NOW);
  assert.equal(usedUp.canReschedule, false);
  assert.equal(usedUp.canCancel, true);
  assert.match(usedUp.rescheduleReason, /used every reschedule/);
  const custom = schedule.changeStateOf({ ...bookedItem(45), policy: { cutoffMinutes: 30 } }, NOW);
  assert.equal(custom.canCancel, true, "the assignment's own cutoff is used when the server sends it");
  const serverLocked = schedule.changeStateOf({ ...bookedItem(180), booking: { ...bookedItem(180).booking, canChange: false } }, NOW);
  assert.deepEqual([serverLocked.canCancel, serverLocked.canReschedule], [false, false]);
  assert.match(serverLocked.cancelReason, /can no longer be changed/);
  const paused = schedule.changeStateOf({ ...bookedItem(180), status: "paused" }, NOW);
  assert.equal(paused.canReschedule, false);
  assert.match(paused.rescheduleReason, /paused/);
});

test("the server's block message is preferred, and slots it marks unbookable stay disabled", () => {
  const item = { ...bookedItem(5), canStart: false, startBlockedReason: "ATTEMPTS_EXHAUSTED", startBlockedMessage: "You have used every attempt for this interview." };
  assert.equal(schedule.joinStateOf(item, NOW).reason, "You have used every attempt for this interview.");
  assert.equal(schedule.joinStateOf({ ...item, startBlockedMessage: null }, NOW).reason, "You have used every attempt allowed for this interview.");
  assert.equal(schedule.slotBookable({ startsAt: iso(240), seatsLeft: 3, bookable: false }, schedule.policyOf({}), NOW), false);
  assert.equal(schedule.cardStateOf({ ...bookedItem(240), status: "cancelled" }, NOW), "cancelled");
});

test("slots group into IST days with seats left and the cutoff applied", () => {
  const slots = schedule.normalizeSlots({ slots: [
    { _id: "s3", startsAt: "2026-10-22T19:00:00Z", endsAt: "2026-10-22T19:30:00Z", capacity: 4, bookedCount: 1 },
    { id: "s1", startsAt: iso(30), endsAt: iso(60), capacity: 2, bookedCount: 0 },
    { id: "s2", startsAt: iso(120), endsAt: iso(150), seatsLeft: 0 },
  ] });
  assert.deepEqual(slots.map((slot) => [slot.id, slot.seatsLeft]), [["s1", 2], ["s2", 0], ["s3", 3]]);
  const days = schedule.groupSlotsByDay(slots);
  assert.deepEqual(days.map((day) => [day.key, day.slots.length]), [["2026-10-22", 2], ["2026-10-23", 1]]);
  const policy = schedule.policyOf({});
  assert.equal(schedule.slotBookable(slots[0], policy, NOW), false, "inside the 60 min cutoff");
  assert.equal(schedule.slotBookable(slots[1], policy, NOW), false, "full");
  assert.equal(schedule.slotBookable(slots[2], policy, NOW), true);
});

test("Coming up lists booked and bookable ANVI interviews in IST, available only inside the join window", () => {
  const items = dashboardUtils.getUpcomingItems([], [], new Date(NOW), [
    bookedItem(5, { assignmentId: "now" }),
    bookedItem(24 * 60, { assignmentId: "tomorrow" }),
    { ...bookedItem(60), assignmentId: "unbooked", booking: null, joinWindow: null, outcome: "pending" },
    { ...bookedItem(-90), assignmentId: "done", outcome: "completed" },
    { ...bookedItem(-90), assignmentId: "missed", outcome: "no_show" },
  ]);
  assert.deepEqual(items.map((item) => [item.id, item.label, item.available]), [
    ["anvi-now", "Join now", true],
    ["anvi-tomorrow", "AI interview booked", false],
    ["anvi-unbooked", "Book a slot", false],
  ]);
  assert.ok(items.every((item) => item.ist && item.href === "/student/ai-interviews"));
});

test("ANVI notifications have their own kind, icon and route", () => {
  const kind = kinds.notificationKind({ type: "AI_INTERVIEW" });
  assert.equal(kind.label, "AI interview");
  assert.ok(kind.icon);
  assert.equal(kinds.notificationKind({ type: "anvi" }).label, "AI interview");
  assert.equal(kinds.notificationRoute({ type: "AI_INTERVIEW" }), "/student/ai-interviews");
  assert.equal(kinds.notificationRoute({ type: "AI_INTERVIEW", actionUrl: "/student/ai-interviews/room/a1" }), "/student/ai-interviews/room/a1");
  assert.equal(kinds.notificationRoute({ type: "SYSTEM" }), null);
  assert.equal(kinds.isProgressNotification({ type: "AI_INTERVIEW" }), false);
});

// ---- Scheduled cards ----

test("tabs: interviews sort into Upcoming, Ongoing and Completed, with counts and a live default", () => {
  const model = listModel.buildTabs({ now: NOW, assignments: [
    bookedItem(90, { assignmentId: "later" }),
    bookedItem(5, { assignmentId: "live" }),
    { ...bookedItem(0), assignmentId: "running", outcome: "in_progress", attemptId: "at-3" },
    { ...bookedItem(-90), assignmentId: "done", outcome: "completed", attemptId: "at-1" },
    { ...bookedItem(-90), assignmentId: "missed", outcome: "no_show" },
    { ...bookedItem(60), assignmentId: "unbooked", booking: null, joinWindow: null, outcome: "pending" },
  ], practice: [
    { id: "p-new", status: "not_started" }, { id: "p-blocked", status: "not_started", practiceBlocked: true },
    { id: "p-active", status: "active" }, { id: "p-done", status: "completed", lastAttempt: { id: "a", status: "ready" } },
  ] });
  assert.deepEqual(model.upcoming.scheduled.map((entry) => entry.id), ["later", "unbooked"], "chronological: the slot in 90 min before the book-by deadline in 5 days");
  assert.deepEqual(model.upcoming.practice.map((entry) => entry.id), ["p-new"], "practice closed by a schedule is not offered");
  assert.deepEqual(model.upcoming.blocked.map((entry) => entry.id), ["p-blocked"]);
  assert.deepEqual(model.ongoing.map((entry) => entry.id), ["running", "p-active", "live"], "running attempts before open join windows");
  assert.deepEqual(new Set(model.completed.map((entry) => entry.id)), new Set(["done", "missed", "p-done"]));
  assert.deepEqual(model.counts, { upcoming: 3, ongoing: 3, completed: 3 }, "blocked practice is not counted");
  assert.equal(model.defaultTab, "ongoing");
  assert.equal(listModel.buildTabs({ now: NOW, assignments: [bookedItem(90)] }).defaultTab, "upcoming");
  assert.match(listModel.formatISTRange(iso(0), iso(45)), /^Thu, 22 Oct · 3:30\s?pm – 4:15\s?pm IST$/i);
  assert.equal(listModel.scoreOf({ reportVisible: true }), null, "no score is shown unless the server sends one");
  assert.deepEqual(listModel.scoreOf({ score: 82.4 }), { score: 82, band: "Strong", tone: "emerald" });
});

test("the board opens the live tab by default, follows ?tab= and switches tabs", async () => {
  await render(board({ assignments: [bookedItem(5), { ...bookedItem(-90), assignmentId: "done", outcome: "completed", attemptId: "at-1", reportVisible: true }] }));
  assert.equal(pageTab(/^Ongoing/).getAttribute("aria-selected"), "true");
  assert.match(pageTab(/^Ongoing/).textContent, /Ongoing1/);
  assert.ok(cardFor("as-booked"));
  assert.equal(cardFor("done"), null, "other tabs are not rendered");
  await click(pageTab(/^Completed/));
  assert.equal(pageTab(/^Completed/).getAttribute("aria-selected"), "true");
  assert.ok(cardFor("done"));
  await click(pageTab(/^Upcoming/));
  assert.match(text(), /No interviews available/, "an empty tab explains itself");
  if (root) await act(async () => root.unmount());
  await render(board({ assignments: [bookedItem(5)] }), "/student/ai-interviews?tab=upcoming");
  assert.equal(pageTab(/^Upcoming/).getAttribute("aria-selected"), "true");
});

test("a booked card shows the IST time and countdown; before the window it says when Join opens, without a dead button", async () => {
  await render(board({ assignments: [bookedItem(90)] }));
  const card = cardFor("as-booked");
  assert.match(text(), /Scheduled interviews1/);
  assert.match(card.textContent, /Thu, 22 Oct · 5:00\s?pm – 5:30\s?pm IST/i);
  assert.match(card.textContent, /Mock interview/);
  assert.equal(buttonNamed(/Join/, card), undefined, "no disabled Join button before the window");
  assert.match(card.textContent, /Opens in 1 h 20 min/);
  assert.match(card.textContent, /Join opens at 4:50\s?pm IST/i, "the exact opening time is still stated");
  await openMenu(card);
  assert.equal(menuItem(/Reschedule/).disabled, false);
  assert.match(menuItem(/Reschedule/).textContent, /2 reschedules left/);
  assert.equal(menuItem(/Cancel booking/).disabled, false);
  assert.ok(menuItem(/Add to calendar/));
});

test("inside the join window Join opens the pre-start phases; Join now starts the assigned attempt without a coin dialog and opens the room", async () => {
  const calls = [];
  api.startAnviAssignment = async (id, body) => { calls.push([id, body]); return { id: "attempt-9", status: "active" }; };
  const track = { label: "Mic", stop() {} };
  navigator.mediaDevices = { getUserMedia: async () => ({ active: true, getTracks: () => [track], getAudioTracks: () => [track] }) };
  await render(board({ assignments: [bookedItem(5)], support: { ok: true, reason: "" } }));
  const card = cardFor("as-booked");
  assert.match(card.textContent, /Closes in 15 min/);
  assert.match(card.textContent, /Live now/);
  const joinButton = buttonNamed(/Join now/, card);
  assert.equal(joinButton.disabled, false);
  assert.equal(joinButton.getAttribute("aria-describedby"), null);
  await click(joinButton);
  assert.deepEqual(calls, [], "a new attempt is set up in the lobby first");
  const lobby = document.querySelector('[data-anvi-lobby="prestart"]');
  assert.ok(lobby, "the pre-start flow opens");
  assert.equal(lobby.dataset.phase, "background");
  assert.match(lobby.textContent, /About this interview/);
  assert.match(lobby.textContent, /Your institution scheduled this interview/);
  const next = async () => { await click(lobby.querySelector("[data-next]")); await tick(); };
  await next();
  assert.equal(lobby.dataset.phase, "system");
  await next();
  assert.equal(lobby.dataset.phase, "instructions", "no proctoring phase when proctoring is off");
  assert.match(lobby.textContent, /English onlyAnswer in EnglishThe interview and your responses stay in English\./);
  assert.equal(lobby.querySelector("[data-next]"), null, "Review & join is the last phase: Join replaces Next");
  await click(lobby.querySelector('input[type="checkbox"]'));
  await click(buttonNamed(/Join now/, lobby));
  await tick();
  assert.deepEqual(calls, [["as-booked", { termsAccepted: false, resumeConsent: false, language: "English" }]]);
  assert.equal(document.getElementById("location").textContent, "/student/ai-interviews/room/attempt-9");
  assert.equal(document.querySelector('[role="dialog"]'), null, "no Prep Coin checkout for an assigned start, and the lobby closed");
});

test("an attempt that can be rejoined opens its room directly, without the setup steps", async () => {
  const calls = [];
  api.startAnviAssignment = async (id, body) => { calls.push([id, body]); return { id: "attempt-r", status: "active", resumed: true }; };
  await render(board({ assignments: [{ ...bookedItem(5), resume: true }], support: { ok: true, reason: "" } }));
  await click(buttonNamed(/Join now/, cardFor("as-booked")));
  await tick();
  assert.equal(document.querySelector('[data-anvi-lobby="prestart"]'), null);
  assert.deepEqual(calls, [["as-booked", { termsAccepted: false, resumeConsent: false }]]);
  assert.equal(document.getElementById("location").textContent, "/student/ai-interviews/room/attempt-r");
});

test("a scheduled card shows the resume and language checklist, and the chip opens the resume sheet", async () => {
  api.getAnviResume = async () => { throw Object.assign(new Error("No resume"), { response: { status: 404, data: { code: "RESUME_NOT_PROVIDED" } } }); };
  const resumeSetup = { mode: "required", sources: ["upload"], questionCount: 2, provided: false, source: null, providedAt: null };
  await render(board({ assignments: [{ ...bookedItem(90), resumeSetup, language: { primary: "English", choices: ["English"], strict: true } }] }));
  const checklist = cardFor("as-booked").querySelector("[data-checklist]");
  assert.match(checklist.textContent, /Add required resume/);
  assert.match(checklist.textContent, /English only/);
  assert.equal(cardFor("as-booked").querySelector('input[type="checkbox"]'), null, "no consent box on the card any more");
  await click(buttonNamed(/Add required resume/, checklist));
  const sheet = document.querySelector("[data-resume-sheet]");
  assert.ok(sheet);
  assert.match(sheet.textContent, /Upload a file/);
  assert.equal(sheet.querySelector('[data-resume-source="builder"]'), null, "only the sources the interview allows");
  await act(async () => root.unmount());
  await render(board({ assignments: [{ ...bookedItem(90), resumeSetup: { ...resumeSetup, provided: true, source: "upload" } }] }));
  assert.match(cardFor("as-booked").querySelector("[data-checklist]").textContent, /Resume added/);
});

test("past the cutoff, reschedule and cancel are disabled with the cutoff copy", async () => {
  await render(board({ assignments: [bookedItem(40)] }));
  await openMenu(cardFor("as-booked"));
  assert.equal(menuItem(/Reschedule/).disabled, true);
  assert.equal(menuItem(/Cancel booking/).disabled, true);
  assert.match(menuItem(/Cancel booking/).textContent, /Changes close 60 min before your slot starts\./);
  assert.equal(menuItem(/Add to calendar/).disabled, false);
});

test("cancel asks for confirmation, calls the API and reloads", async () => {
  const cancelled = [];
  let reloads = 0;
  api.cancelAnviBooking = async (id) => { cancelled.push(id); return { ok: true }; };
  await render(board({ assignments: [bookedItem(180)], onReload: async () => { reloads += 1; } }));
  const card = cardFor("as-booked");
  await openMenu(card);
  await click(menuItem(/Cancel booking/));
  assert.equal(document.querySelector('[role="menu"]'), null, "the menu closes on choice");
  assert.match(card.textContent, /Cancel this booking\?/);
  await click(buttonNamed(/Keep booking/, card));
  assert.doesNotMatch(card.textContent, /Cancel this booking\?/);
  await openMenu(card);
  await click(menuItem(/Cancel booking/));
  await click(buttonNamed(/Yes, cancel/, card));
  await tick();
  assert.deepEqual(cancelled, ["bk-1"]);
  assert.equal(reloads, 1);
  assert.match(text(), /Your booking was cancelled/);
});

test("Add to calendar downloads the booking's ICS", async () => {
  const downloads = [];
  api.downloadAnviBookingCalendar = async (id) => { downloads.push(id); };
  await render(board({ assignments: [bookedItem(180)] }));
  await openMenu(cardFor("as-booked"));
  await click(menuItem(/Add to calendar/));
  await tick();
  assert.deepEqual(downloads, ["bk-1"]);
  assert.match(api.anviBookingCalendarUrl("bk-1"), /\/student\/ai-interviews\/bookings\/bk-1\/calendar\.ics$/);
});

test("completed, in-progress, missed and window cards show their states", async () => {
  await render(board({ assignments: [
    { ...bookedItem(-90), assignmentId: "hidden", outcome: "completed", attemptId: "at-1", reportVisible: false },
    { ...bookedItem(-90), assignmentId: "visible", outcome: "completed", attemptId: "at-2", reportVisible: true },
    { ...bookedItem(0), assignmentId: "running", outcome: "in_progress", attemptId: "at-3" },
    { ...bookedItem(-90), assignmentId: "missed", outcome: "no_show" },
    { assignmentId: "window", title: "Open window", mode: "adaptive", slotMode: "window", window: { opensAt: iso(60), closesAt: iso(3 * 60) }, joinWindow: { from: iso(60), to: iso(175) }, canStart: false, startBlockedReason: "NOT_YET_OPEN", outcome: "pending" },
  ] }));
  // Ongoing (the default while an attempt runs).
  assert.ok(buttonNamed(/Continue/, cardFor("running")));
  // Upcoming.
  await click(pageTab(/^Upcoming/));
  const windowCard = cardFor("window");
  assert.match(windowCard.textContent, /Adaptive interview/);
  assert.match(windowCard.textContent, /Start any time · Thu, 22 Oct · 4:30\s?pm – 6:30\s?pm IST/i);
  assert.equal(buttonNamed(/Join/, windowCard), undefined);
  assert.match(windowCard.textContent, /Opens in 1 h/);
  assert.match(windowCard.textContent, /Join opens at 4:30\s?pm IST/i);
  // Completed.
  await click(pageTab(/^Completed/));
  assert.match(cardFor("hidden").textContent, /Report pending/);
  assert.match(cardFor("hidden").textContent, /Report will be released by your institution\./);
  assert.equal(buttonNamed(/View report/, cardFor("hidden")), undefined);
  assert.match(cardFor("visible").textContent, /Report ready/);
  assert.ok(buttonNamed(/View report/, cardFor("visible")));
  assert.match(cardFor("missed").textContent, /Missed/);
  assert.equal(buttonNamed(/Join/, cardFor("missed")), undefined);
  await click(buttonNamed(/View report/, cardFor("visible")));
  assert.equal(document.getElementById("location").textContent, "/student/ai-interviews/room/at-2");
});

test("booking: day tabs, seats left, a confirm step with the policy copy, then book and reload", async () => {
  const booked = [];
  let reloads = 0;
  api.listAnviAssignmentSlots = async () => ({ cutoffMinutes: 60, rescheduleLimit: 2, slots: [
    { id: "s-soon", startsAt: iso(30), endsAt: iso(60), capacity: 4, bookedCount: 0 },
    { id: "s-full", startsAt: iso(120), endsAt: iso(150), capacity: 2, bookedCount: 2 },
    { id: "s-open", startsAt: iso(180), endsAt: iso(210), capacity: 5, bookedCount: 4 },
    { id: "s-next", startsAt: "2026-10-23T05:30:00Z", endsAt: "2026-10-23T06:00:00Z", capacity: 3, bookedCount: 0 },
  ] });
  api.bookAnviSlot = async (aid, slotId) => { booked.push([aid, slotId]); return { id: "bk-new" }; };
  const item = { ...bookedItem(0), assignmentId: "as-book", booking: null, joinWindow: null, outcome: "pending" };
  await render(board({ assignments: [item], onReload: async () => { reloads += 1; } }));
  await click(buttonNamed(/Book a slot/, cardFor("as-book")));
  await tick();
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.match(dialog.textContent, /All times are India Standard Time \(IST\)/);
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map((tab) => tab.getAttribute("aria-label")), ["Thu, 22 Oct, 1 open", "Fri, 23 Oct, 1 open"]);
  assert.match(tabs[0].textContent, /Thu\s*22\s*Oct\s*1 open/i);
  assert.equal(buttonNamed(/Confirm booking/, dialog).disabled, true, "nothing to confirm before a slot is picked");
  const slotButtons = [...dialog.querySelectorAll('[role="tabpanel"] button')];
  assert.deepEqual(slotButtons.map((button) => button.disabled), [true, true, false]);
  assert.match(slotButtons[0].textContent, /4:00\s?pm\s*Closed/i, "inside the cutoff");
  assert.match(slotButtons[2].textContent, /6:30\s?pm/i);
  assert.match(slotButtons[2].textContent, /1 seat left/);
  assert.match(slotButtons[1].textContent, /Full/);
  assert.match(dialog.textContent, /Slots starting within 60 min cannot be booked/);

  await click(slotButtons[2]);
  assert.equal(slotButtons[2].getAttribute("aria-pressed"), "true");
  assert.match(dialog.textContent, /Thu, 22 Oct, 6:30\s?pm – 7:00\s?pm IST/i);
  assert.match(dialog.textContent, /You can reschedule up to 2 times\./);
  assert.match(dialog.textContent, /close 60 min before the slot starts/);
  await click(buttonNamed(/Confirm booking/, dialog));
  await tick();
  assert.deepEqual(booked, [["as-book", "s-open"]]);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(reloads, 1);
  assert.match(text(), /Booked for Thu, 22 Oct, 6:30\s?pm IST\./i);

  // The second day tab shows its own slots.
  await click(buttonNamed(/Book a slot/, cardFor("as-book")));
  await tick();
  const reopened = document.querySelector('[role="dialog"]');
  await click(reopened.querySelectorAll('[role="tab"]')[1]);
  assert.match(reopened.querySelector('[role="tabpanel"]').textContent, /11:00\s?am/i);
});

test("a slot that fills during confirm reloads the grid with a clear message", async () => {
  let loads = 0;
  api.listAnviAssignmentSlots = async () => { loads += 1; return [{ id: "s1", startsAt: iso(180), endsAt: iso(210), capacity: 1, bookedCount: loads > 1 ? 1 : 0 }]; };
  api.bookAnviSlot = async () => { throw Object.assign(new Error("Slot is full."), { response: { status: 409, data: { code: "SLOT_FULL" } } }); };
  await render(h(BookingSheet, { item: { assignmentId: "as-x", title: "X", slotMode: "slots" }, now: NOW, onClose: () => {}, onDone: () => {} }));
  await click([...document.querySelectorAll('[role="tabpanel"] button')][0]);
  await click(buttonNamed(/Confirm booking/));
  await tick();
  assert.match(document.body.textContent, /That slot just filled up\. Pick another one\./, "the sheet is portalled to <body>");
  assert.equal(loads, 2);
  assert.match(document.querySelector('[role="tabpanel"]').textContent, /Full/);
});

test("rescheduling moves the existing booking and states the remaining allowance", async () => {
  const moved = [];
  api.listAnviAssignmentSlots = async () => [
    { id: "sl-1", startsAt: iso(180), endsAt: iso(210), capacity: 3, bookedCount: 1 },
    { id: "sl-2", startsAt: iso(240), endsAt: iso(270), capacity: 3, bookedCount: 0 },
  ];
  api.rescheduleAnviBooking = async (bid, slotId) => { moved.push([bid, slotId]); return { id: bid }; };
  await render(board({ assignments: [bookedItem(180)] }));
  await openMenu(cardFor("as-booked"));
  await click(menuItem(/Reschedule/));
  await tick();
  const dialog = document.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /Reschedule your slot/);
  const [current, other] = [...dialog.querySelectorAll('[role="tabpanel"] button')];
  assert.equal(current.disabled, true);
  assert.match(current.textContent, /Your current slot/);
  await click(other);
  assert.match(dialog.textContent, /This uses 1 of your 2 remaining reschedules/);
  await click(buttonNamed(/Confirm new slot/, dialog));
  await tick();
  assert.deepEqual(moved, [["bk-1", "sl-2"]]);
  assert.match(text(), /Moved to Thu, 22 Oct, 7:30\s?pm IST\./i);
});

test("Escape closes the booking sheet", async () => {
  let closed = 0;
  api.listAnviAssignmentSlots = async () => [];
  await render(h(BookingSheet, { item: { assignmentId: "as-x", title: "X" }, now: NOW, onClose: () => { closed += 1; } }));
  assert.match(document.body.textContent, /No open slots are left/);
  const dialog = document.querySelector('[role="dialog"]');
  assert.equal(dialog.parentElement.parentElement, document.body, "portalled to <body>, above the sidebar and header");
  assert.equal(document.activeElement, document.getElementById("anvi-booking-title"), "the title takes focus on open, not the Close button");
  await act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  assert.equal(closed, 1);
});

// ---- The page ----

test("the page puts scheduled interviews before Practice anytime and folds blocked practice into one note", async () => {
  api.universityPolicy = async () => ({ active: true, permissions: { questions: true, coding: true, learning: true, assessments: true, events: true, interviews: true, resumes: true } });
  api.listStudentAIInterviews = async () => [
    { id: "int-1", title: "Placement mock", role: "SDE", status: "not_started", practiceBlocked: true, language: "English", questionCount: 5, estimatedMinutes: 20 },
    { id: "int-2", title: "Open practice", role: "Frontend", status: "not_started", practiceBlocked: false },
  ];
  api.listStudentAnviAssignments = async () => ({ assignments: [bookedItem(24 * 60)] });
  socketService.connect = () => socketService;
  socketService.on = () => {};
  socketService.off = () => {};
  socketService.emit = () => {};
  const user = { _id: "student-1", name: "Aditi", role: "student" };
  root = createRoot(document.getElementById("app"));
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/student/ai-interviews"] },
    h(AuthContext.Provider, { value: { user, authChecked: true, refreshUser: async () => {} } },
      h(UniversityPolicyProvider, null, h(ThemeProvider, null, h(AnviInterviewsPage, { now: NOW })))))));
  await tick(20);
  assert.equal(document.querySelector("h1").textContent, "AI Interviews");
  assert.equal(pageTab(/^Upcoming/).getAttribute("aria-selected"), "true", "nothing is live, so Upcoming opens");
  const headings = [...document.querySelectorAll("h2")].map((node) => node.textContent);
  const scheduledAt = headings.findIndex((value) => value.startsWith("Scheduled interviews"));
  const practiceAt = headings.findIndex((value) => value.startsWith("Practice interviews"));
  assert.ok(scheduledAt >= 0 && scheduledAt < practiceAt, headings.join(" | "));
  assert.equal(document.querySelector('[data-practice="int-1"]'), null, "no disabled card for practice closed by a schedule");
  const note = document.querySelector("[data-practice-blocked]");
  assert.match(note.textContent, /Practice temporarily unavailablePractice will be available after the current institutional schedule ends\./);
  assert.equal(note.querySelector("button"), null);
  // The audio privacy statement now lives in the pre-start consent ("audio is not saved").
  assert.match(text(), /Complete scheduled interviews or practise with ANVI\./);
  const open = document.querySelector('[data-practice="int-2"]');
  assert.doesNotMatch(open.textContent, /unavailable/);
  assert.equal(buttonNamed(/Start/, open).disabled, false);
});

test("the page: cancelling the Prep Coin cost dialog returns the pre-start flow to Join now, nothing started", async () => {
  const win = dom.window;
  const saved = { mediaDevices: win.navigator.mediaDevices, AudioContext: win.AudioContext, AudioWorkletNode: win.AudioWorkletNode, isSecureContext: Object.getOwnPropertyDescriptor(win, "isSecureContext"), Event: Object.getOwnPropertyDescriptor(globalThis, "Event") };
  // A paid start announces the balance change with `new Event` on window: use the DOM's Event.
  Object.defineProperty(globalThis, "Event", { configurable: true, writable: true, value: win.Event });
  const track = { label: "Test microphone", stop() {} };
  win.navigator.mediaDevices = { getUserMedia: async () => ({ active: true, getTracks: () => [track], getAudioTracks: () => [track] }) };
  // Enough Web Audio for anviBrowserSupport; the level meter and call contexts fail softly on it.
  win.AudioContext = class { resume() { return Promise.resolve(); } close() { return Promise.resolve(); } };
  win.AudioWorkletNode = function AudioWorkletNode() {};
  Object.defineProperty(win, "isSecureContext", { configurable: true, value: true });
  const starts = [];
  api.universityPolicy = async () => ({ active: true, permissions: { questions: true, coding: true, learning: true, assessments: true, events: true, interviews: true, resumes: true } });
  api.listStudentAIInterviews = async () => [{ id: "int-2", title: "Open practice", role: "Frontend", status: "not_started", practiceBlocked: false, language: "English", terms: { text: "", required: false }, resumeSetup: { mode: "none" } }];
  api.listStudentAnviAssignments = async () => ({ assignments: [] });
  api.walletPricing = async () => ({ features: [{ featureKey: "ai_interview.start", label: "Start a practice AI interview", cost: 5, price: 5, balance: 40, freeLeft: 0, freePerMonth: 0 }] });
  api.startStudentAIInterview = async (...args) => { starts.push(args); return { id: "att-9" }; };
  for (const name of ["connect", "on", "off", "emit"]) socketService[name] = name === "connect" ? () => socketService : () => {};
  try {
    const user = { _id: "student-1", name: "Aditi", role: "student" };
    root = createRoot(document.getElementById("app"));
    await act(async () => root.render(h(MemoryRouter, { initialEntries: ["/student/ai-interviews"] },
      h(AuthContext.Provider, { value: { user, authChecked: true, refreshUser: async () => {} } },
        h(UniversityPolicyProvider, null, h(ThemeProvider, null, h(AnviInterviewsPage, { now: NOW })))), h(Location))));
    await tick(20);
    await click(buttonNamed(/Start/, document.querySelector('[data-practice="int-2"]')));
    const flow = () => document.querySelector('[data-anvi-lobby="prestart"]');
    assert.ok(flow(), "the pre-start flow opens");
    const consent = () => [...document.querySelectorAll("label")].find((label) => /Google Gemini/.test(label.textContent))?.querySelector('input[type="checkbox"]');
    for (let guard = 0; flow().dataset.phase !== "instructions"; guard += 1) {
      assert.ok(guard < 6, `stuck on ${flow().dataset.phase}: ${document.getElementById("anvi-phase-hint")?.textContent}`);
      await click(document.querySelector("[data-next]"));
      await tick();
    }
    await click(consent());
    const joinButton = () => buttonNamed(/Join now|Starting/, flow());
    await click(joinButton());
    await tick(5);
    const dialog = () => document.querySelector('[aria-labelledby="prep-coin-cost-title"]');
    assert.ok(dialog(), "the cost dialog asks first");
    assert.match(joinButton().textContent, /Starting your interview/);
    await click(buttonNamed(/^Cancel$/, dialog()));
    await tick();
    assert.equal(dialog(), null);
    assert.equal(starts.length, 0, "nothing was started or charged");
    assert.match(joinButton().textContent, /Join now/);
    assert.equal(joinButton().disabled, false, "the student can join again");
    assert.doesNotMatch(flow().textContent, /could not be started/, "a cancel is not an error");
    assert.equal(document.getElementById("location").textContent, "/student/ai-interviews");

    // Joining again asks again; confirming starts the attempt and opens its room.
    await click(joinButton());
    await tick(5);
    await click(buttonNamed(/Use 5 Prep Coins/, dialog()));
    await tick(20);
    assert.equal(starts.length, 1);
    assert.equal(starts[0][2], 5, "the confirmed cost goes to the API");
    assert.equal(document.getElementById("location").textContent, "/student/ai-interviews/room/att-9");
    (await server.ssrLoadModule("/src/student/anvi/anviJoinHandoff.js")).releaseJoinHandoff("att-9");
  } finally {
    win.navigator.mediaDevices = saved.mediaDevices;
    win.AudioContext = saved.AudioContext;
    win.AudioWorkletNode = saved.AudioWorkletNode;
    if (saved.isSecureContext) Object.defineProperty(win, "isSecureContext", saved.isSecureContext);
    else delete win.isSecureContext;
    Object.defineProperty(globalThis, "Event", saved.Event);
  }
});
