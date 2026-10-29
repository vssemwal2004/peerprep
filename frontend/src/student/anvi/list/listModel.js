// Pure helpers for the student AI Interviews page: which tab each interview belongs to, the order inside
// a tab, and compact IST labels. Scheduled-interview rules (join window, cutoff) live in ../anviSchedule.
import { IST_ZONE, assignmentIdOf, cardStateOf, changeStateOf, formatISTDay, formatISTTime, istDayKey, joinStateOf } from "../anviSchedule";
import { languageLabel } from "../anviStartSetup";

export const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "ongoing", label: "Ongoing" },
  { id: "completed", label: "Completed" },
];
export const TAB_IDS = TABS.map((tab) => tab.id);

const timeOf = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
};
const orInfinity = (value) => (Number.isFinite(value) ? value : Infinity);

/**
 * One scheduled (assigned) interview with its derived state. It is "ongoing" while an attempt runs or its
 * join window is open now; finished, missed and cancelled ones are "completed"; the rest are "upcoming".
 */
export function scheduledEntry(item, now = Date.now()) {
  const state = cardStateOf(item, now);
  const join = joinStateOf(item, now);
  const change = changeStateOf(item, now);
  let tab = "upcoming";
  if (state === "in_progress" || ((state === "booked" || state === "window") && join.phase === "open")) tab = "ongoing";
  else if (state === "completed" || state === "missed" || state === "cancelled") tab = "completed";
  return { kind: "scheduled", key: `as-${assignmentIdOf(item)}`, id: assignmentIdOf(item), item, state, join, change, tab };
}

/** One practice interview: active ones are ongoing, completed ones completed, the rest "practice anytime". */
export function practiceEntry(item) {
  const blocked = Boolean(item?.practiceBlocked) && item?.status !== "active" && item?.status !== "completed";
  const tab = item?.status === "active" ? "ongoing" : item?.status === "completed" ? "completed" : "upcoming";
  return { kind: "practice", key: `pr-${item?.id}`, id: String(item?.id || ""), item, blocked, tab };
}

/** The moment a scheduled entry is about: its slot, else its window (opening if ahead, closing otherwise). */
function scheduledWhen(entry, now) {
  const { item } = entry;
  const start = timeOf(item?.booking?.startsAt);
  if (Number.isFinite(start)) return start;
  const opens = timeOf(item?.window?.opensAt);
  if (Number.isFinite(opens) && opens > now) return opens;
  return timeOf(item?.window?.closesAt);
}

/** When a finished entry ended, for "most recent first" (NaN when unknown). */
export function finishedAt(entry) {
  const { item } = entry;
  if (entry.kind === "practice") return timeOf(item?.lastAttempt?.endedAt);
  return timeOf(item?.endedAt) || timeOf(item?.booking?.endsAt) || timeOf(item?.booking?.startsAt) || timeOf(item?.window?.closesAt);
}

/**
 * Every interview sorted into the three tabs:
 * { upcoming: { scheduled, practice, blocked }, ongoing, completed, counts, defaultTab }.
 * `blocked` is practice closed by an institution schedule; it is shown as a note and not counted.
 */
export function buildTabs({ assignments = [], practice = [], now = Date.now() } = {}) {
  const scheduled = (Array.isArray(assignments) ? assignments : []).map((item) => scheduledEntry(item, now));
  const practiceEntries = (Array.isArray(practice) ? practice : []).map(practiceEntry);

  const upcomingScheduled = scheduled.filter((entry) => entry.tab === "upcoming")
    .sort((a, b) => orInfinity(scheduledWhen(a, now)) - orInfinity(scheduledWhen(b, now)));
  // Practice closed by a schedule is not startable, so it is kept apart (one note, not counted).
  const anytime = practiceEntries.filter((entry) => entry.tab === "upcoming" && !entry.blocked);
  const blocked = practiceEntries.filter((entry) => entry.tab === "upcoming" && entry.blocked);

  // A running attempt first (it has a deadline), then join windows closing soonest.
  const ongoingRank = (entry) => (entry.kind === "practice" || entry.state === "in_progress" ? 0 : 1);
  const closesOf = (entry) => (entry.kind === "scheduled" ? orInfinity(entry.join.window?.to ?? timeOf(entry.item?.window?.closesAt)) : Infinity);
  const ongoing = [...scheduled.filter((entry) => entry.tab === "ongoing"), ...practiceEntries.filter((entry) => entry.tab === "ongoing")]
    .sort((a, b) => ongoingRank(a) - ongoingRank(b) || closesOf(a) - closesOf(b));

  const completed = [...scheduled.filter((entry) => entry.tab === "completed"), ...practiceEntries.filter((entry) => entry.tab === "completed")]
    .sort((a, b) => (finishedAt(b) || 0) - (finishedAt(a) || 0));

  const counts = { upcoming: upcomingScheduled.length + anytime.length, ongoing: ongoing.length, completed: completed.length };
  return { upcoming: { scheduled: upcomingScheduled, practice: anytime, blocked }, ongoing, completed, counts, defaultTab: ongoing.length ? "ongoing" : "upcoming" };
}

/** "Thu, 22 Oct · 4:30 pm – 5:15 pm IST", or across days "Thu, 22 Oct, 4:30 pm – Sat, 24 Oct, 11:00 am IST". */
export function formatISTRange(from, to) {
  const start = timeOf(from);
  if (!Number.isFinite(start)) return "Time to be confirmed";
  const end = timeOf(to);
  if (!Number.isFinite(end)) return `${formatISTDay(start)} · ${formatISTTime(start)} IST`;
  if (istDayKey(start) === istDayKey(end)) return `${formatISTDay(start)} · ${formatISTTime(start)} – ${formatISTTime(end)} IST`;
  return `${formatISTDay(start)}, ${formatISTTime(start)} – ${formatISTDay(end)}, ${formatISTTime(end)} IST`;
}

/** "Sat, 24 Oct, 11:00 am IST". */
export const formatISTShort = (value) => {
  const time = timeOf(value);
  return Number.isFinite(time) ? `${formatISTDay(time)}, ${formatISTTime(time)} IST` : "Time to be confirmed";
};

/** Month, day and weekday of a moment in IST, for the date tile. */
export function istDateParts(value) {
  const time = timeOf(value);
  if (!Number.isFinite(time)) return null;
  const part = (options) => new Date(time).toLocaleDateString("en-IN", { ...options, timeZone: IST_ZONE });
  return { month: part({ month: "short" }), day: part({ day: "numeric" }), weekday: part({ weekday: "short" }) };
}

/** "Hinglish", "30 min", "6 questions": the facts line of a row. */
export function factsOf(facts) {
  if (!facts) return [];
  return [
    languageLabel(facts.language),
    facts.estimatedMinutes > 0 ? `${Math.round(facts.estimatedMinutes)} min` : "",
  ].filter(Boolean);
}

/** A report score when the server sends one (0-100), with a band label and tone; null otherwise. */
export function scoreOf(item) {
  const raw = item?.score ?? item?.overallScore ?? item?.report?.overallScore ?? item?.lastAttempt?.score ?? item?.lastAttempt?.overallScore;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const score = Math.max(0, Math.min(100, Math.round(value)));
  const band = item?.band || item?.lastAttempt?.band
    || (score >= 80 ? "Strong" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs work");
  const tone = score >= 80 ? "emerald" : score >= 60 ? "sky" : score >= 40 ? "amber" : "rose";
  return { score, band, tone };
}
