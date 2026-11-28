// Prep Analysis v2 (2026-11-28): pure helpers for the Prep Score, quota, coins and overview views.
// No React, no network: the pages and the tests share them.

import { GAIN_KINDS, LOSS_KINDS, POINT_KINDS } from "../prepScore/pointKinds.js";

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;

/** The Prep Score history range for an analysis period ({ period } or custom { from }). */
export function scoreRangeFor(range = {}) {
  if (range.period === "custom" && range.from) return { range: "custom", from: range.from };
  return { range: ["7d", "30d", "90d", "180d", "365d", "all"].includes(range.period) ? range.period : "30d", from: "" };
}

/** Milliseconds until the next IST midnight (when every topic quota resets). */
export function msUntilIstMidnight(now = Date.now()) {
  const ist = now + IST_MS;
  return DAY_MS - (ist % DAY_MS);
}

/** "7h 12m", "45m". */
export function durationText(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** "+0.24", "−0.05", "0". */
export const signedScore = (value) => {
  const number = round2(value);
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${Math.abs(number).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

/**
 * Waterfall steps from a score history: the start total, each kind that moved the score (gains
 * first, then losses) and the end total. Each step: { key, label, value, from, to, kind: total|gain|loss }.
 */
export function waterfallSteps(history) {
  if (!history) return [];
  const byKind = history.byKind || {};
  const start = round2(history.startTotal);
  const steps = [{ key: "start", label: "Start", value: start, from: 0, to: start, kind: "total" }];
  let running = start;
  for (const kind of [...GAIN_KINDS, ...LOSS_KINDS]) {
    const value = round2(byKind[kind]);
    if (!value) continue;
    steps.push({ key: kind, label: POINT_KINDS[kind]?.short || kind, value, from: running, to: running + value, kind: value > 0 ? "gain" : "loss" });
    running += value;
  }
  steps.push({ key: "now", label: "Now", value: round2(history.total), from: 0, to: round2(history.total), kind: "total" });
  return steps;
}

/** The axis for waterfall bars: a little room below the lowest bar top and above the highest. */
export function waterfallScale(steps) {
  const tops = steps.flatMap((step) => (step.kind === "total" ? [step.to] : [step.from, step.to]));
  if (!tops.length) return { min: 0, max: 1 };
  const low = Math.min(...tops), high = Math.max(...tops);
  const pad = Math.max(0.05, (high - low) * 0.25);
  return { min: Math.max(0, low - pad), max: high + pad };
}

/**
 * Circle packing for the topic bubbles: largest first, each placed touching an earlier circle as
 * close to the middle as it fits. Returns [{ ...item, x, y, r }] inside width × height; items that
 * cannot fit even when shrunk are left out (they stay in the list view).
 */
export function packBubbles(items = [], { width = 560, height = 280, minR = 20, maxR = 66, gap = 4 } = {}) {
  const values = items.map((item) => Number(item.value) || 0).filter((value) => value > 0);
  if (!values.length) return [];
  const max = Math.max(...values);
  const sorted = [...items].filter((item) => Number(item.value) > 0).sort((a, b) => b.value - a.value);
  const placed = [];
  const cx = width / 2, cy = height / 2;
  const fits = (x, y, r) => x - r >= 2 && x + r <= width - 2 && y - r >= 2 && y + r <= height - 2
    && placed.every((other) => Math.hypot(other.x - x, other.y - y) >= other.r + r + gap);
  for (const item of sorted) {
    let r = minR + (maxR - minR) * Math.sqrt(item.value / max);
    let spot = null;
    for (let attempt = 0; attempt < 6 && !spot; attempt += 1) {
      if (!placed.length) { spot = { x: cx, y: cy }; break; }
      let best = null;
      for (const other of placed) {
        for (let angle = 0; angle < 360; angle += 10) {
          const radians = (angle * Math.PI) / 180;
          const distance = other.r + r + gap + 0.5;
          const x = other.x + Math.cos(radians) * distance;
          const y = other.y + Math.sin(radians) * distance;
          if (!fits(x, y, r)) continue;
          // Wide boxes: distance from the middle measured with the box's proportions.
          const score = ((x - cx) / width) ** 2 + ((y - cy) / height) ** 2;
          if (!best || score < best.score) best = { x, y, score };
        }
      }
      if (best) spot = best; else r *= 0.85;
    }
    if (spot) placed.push({ ...item, x: round2(spot.x), y: round2(spot.y), r: round2(r) });
  }
  return placed;
}

/** One ledger change in words: { title, detail, tone: up|down|flat }. */
export function eventText(event) {
  const tone = event.delta > 0 ? "up" : event.delta < 0 ? "down" : "flat";
  switch (event.kind) {
    case "solve": {
      const topics = event.topics || [];
      const counted = topics.filter((topic) => topic.counted).map((topic) => topic.topic);
      const closed = topics.filter((topic) => !topic.counted).map((topic) => topic.topic);
      const detail = [counted.length ? counted.join(" · ") : "", closed.length ? `${closed.join(", ")} quota was full` : ""].filter(Boolean).join(" · ");
      const level = event.difficulty || "new";
      return { title: `Solved ${/^[aeiou]/i.test(level) ? "an" : "a"} ${level} problem`, detail: detail || "Shared across its topics", tone };
    }
    case "challenge": return { title: "Daily challenge done", detail: "Keeps your Prep Streak going", tone };
    case "login": return { title: "Daily login", detail: "First visit of the day", tone };
    case "sheet": return { title: "Quick Prep sheet finished", detail: "Every question in the sheet", tone };
    case "badge": return { title: `Monthly badge level${event.level ? ` ${event.level}` : ""}`, detail: "Reached a new badge level", tone };
    case "milestone": return { title: "Lifetime badge", detail: "An all-time milestone", tone };
    case "wrong": return { title: `${event.count || 1} wrong answer${event.count === 1 ? "" : "s"}`, detail: "Given back if you solve that problem the same day", tone };
    case "inactive": return { title: "No practice", detail: `${event.gap || "Several"} days without a submission`, tone };
    default: return { title: POINT_KINDS[event.kind]?.label || "Change", detail: "", tone };
  }
}

const dayName = (day, today) => {
  if (day === today) return "Today";
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  if (day === yesterday) return "Yesterday";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
};

/** Events grouped by day, newest first: [{ day, label, net, items }]. */
export function groupEvents(events = [], today = "") {
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.day)) groups.set(event.day, { day: event.day, label: dayName(event.day, today), net: 0, items: [] });
    const group = groups.get(event.day);
    group.items.push({ ...event, ...eventText(event) });
    group.net = round2(group.net + event.delta);
  }
  return [...groups.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * Up and down segments of a score series for the trend chart: points [{ x, y, day, total }] and
 * two SVG paths (rises and falls), drawn in a width × height box.
 */
export function trendGeometry(days = [], { width = 600, height = 180, pad = 10 } = {}) {
  if (!days.length) return { points: [], up: "", down: "", area: "", min: 0, max: 0 };
  const totals = days.map((day) => day.total);
  const low = Math.min(...totals), high = Math.max(...totals);
  const span = high - low || Math.max(0.5, high * 0.05);
  const min = Math.max(0, low - span * 0.15), max = high + span * 0.15;
  const x = (index) => (days.length === 1 ? width / 2 : (index / (days.length - 1)) * width);
  const y = (value) => pad + (1 - (value - min) / (max - min)) * (height - pad * 2);
  const points = days.map((day, index) => ({ x: round2(x(index)), y: round2(y(day.total)), day: day.day, total: day.total, gained: day.gained, lost: day.lost, byKind: day.byKind }));
  let up = "", down = "";
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1], b = points[index];
    const segment = `M${a.x} ${a.y} L${b.x} ${b.y} `;
    if (b.total < a.total) down += segment; else up += segment;
  }
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  return { points, up: up.trim(), down: down.trim(), area: `${line} L${width} ${height} L0 ${height} Z`, min: round2(min), max: round2(max) };
}

// ---------------------------------------------------------------- coins

export const COIN_SOURCES = Object.freeze({
  earn_login: "Daily login", earn_challenge: "Daily challenge", earn_sheet: "Sheets finished", earn_badge: "Badge levels",
  earn_milestone: "Lifetime badges", earn_level: "Learner levels", earn_solve: "Problems solved",
  coordinator_to_student: "From your university", superadmin_to_student: "From PeerPrep", student_refund: "Refunds",
});

/**
 * Where coins came from and went: { sources: [{ key, label, amount }], spends: [{ label, amount }],
 * earnedIn, spentOut, today: Set of earn kinds already earned today (IST) }.
 */
export function coinFlow(movements = [], { since = null, now = Date.now() } = {}) {
  const todayIst = new Date(now + IST_MS).toISOString().slice(0, 10);
  const sources = new Map();
  const spends = new Map();
  const today = new Set();
  let earnedIn = 0, spentOut = 0;
  for (const row of movements) {
    const at = new Date(row.createdAt).getTime();
    const amount = Math.abs(Number(row.amount) || 0);
    if (!amount) continue;
    if (row.kind?.startsWith("earn_") && new Date(at + IST_MS).toISOString().slice(0, 10) === todayIst) today.add(row.kind);
    if (since && at < since) continue;
    if (row.direction === "out") {
      const label = row.feature || "Other";
      spends.set(label, (spends.get(label) || 0) + amount);
      spentOut += amount;
    } else {
      const label = COIN_SOURCES[row.kind] || "Other";
      sources.set(label, (sources.get(label) || 0) + amount);
      earnedIn += amount;
    }
  }
  const list = (map) => [...map.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  return { sources: list(sources), spends: list(spends), earnedIn, spentOut, today };
}

/**
 * A simple two-column flow (sources → where they went) as SVG ribbons in a width × height box.
 * Returns { left: [{ label, amount, y, h }], right: [...], ribbons: [{ d, from, to }] }.
 */
export function flowGeometry(sources = [], sinks = [], { width = 520, height = 220, node = 14, gap = 8 } = {}) {
  const total = Math.max(1, sources.reduce((sum, item) => sum + item.amount, 0), sinks.reduce((sum, item) => sum + item.amount, 0));
  const lay = (list) => {
    const usable = height - gap * Math.max(0, list.length - 1);
    let y = 0;
    return list.map((item) => { const h = Math.max(3, (item.amount / total) * usable); const row = { ...item, y: round2(y), h: round2(h) }; y += h + gap; return row; });
  };
  const left = lay(sources), right = lay(sinks);
  // Ribbons: each source split across sinks in proportion, stacked in order on both sides.
  const ribbons = [];
  const rightUsed = right.map(() => 0);
  const leftX = node, rightX = width - node, mid = (leftX + rightX) / 2;
  left.forEach((source, si) => {
    let offset = 0;
    right.forEach((sink, ki) => {
      const share = (source.amount / total) * (sink.amount / Math.max(1, sinks.reduce((sum, item) => sum + item.amount, 0)));
      const h = share * (height - gap * Math.max(0, Math.max(left.length, right.length) - 1));
      if (h < 0.5) return;
      const y0 = source.y + offset, y1 = sink.y + rightUsed[ki];
      offset += h; rightUsed[ki] += h;
      ribbons.push({ from: si, to: ki, d: `M${leftX} ${round2(y0)} C${mid} ${round2(y0)} ${mid} ${round2(y1)} ${rightX} ${round2(y1)} L${rightX} ${round2(y1 + h)} C${mid} ${round2(y1 + h)} ${mid} ${round2(y0 + h)} ${leftX} ${round2(y0 + h)} Z` });
    });
  });
  return { left, right, ribbons };
}

// ---------------------------------------------------------------- overview

/**
 * "Do next" for the overview: a closed-topic hint first (when today's quota closed a topic), then
 * the coach's own steps. Each: { id, title, reason, to, label }. Deterministic; never writes content.
 */
export function nextSteps({ coach = [], today = null, limit = 3 } = {}) {
  const steps = [];
  const closed = (today?.topics || []).filter((topic) => topic.full);
  if (closed.length && today?.limit) {
    steps.push({
      id: "quota", title: `Switch topic: ${closed.slice(0, 2).map((topic) => topic.topic).join(" and ")} ${closed.length === 1 ? "is" : "are"} full today`,
      reason: `Only ${today.limit} solves per topic add to your score each day. Other topics still count.`, to: "/problems", label: "Pick another topic",
    });
  }
  for (const step of coach) {
    if (steps.length >= limit) break;
    steps.push({ id: step.id, title: step.title, reason: step.reason, to: step.action?.to || "", label: step.action?.label || "Open" });
  }
  return steps.slice(0, limit);
}
