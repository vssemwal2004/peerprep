// Prep Score v6: a points ledger replayed from the student's own history. Pure (no database), so
// the stored score, the profile history graph and the result popup after a solve all agree.
//
// Up:   first accepted solve (difficulty points split equally across the problem's topics; a topic's
//       share counts only while that topic has fewer than `dailyTopicLimit` credited solves that IST
//       day), daily login, daily challenge, Quick Prep sheet completed, monthly badge level, lifetime
//       milestone badge.
// Down: wrong answer / time limit / runtime error on a problem not yet solved (capped per day,
//       refunded when the problem is solved the same day), and inactivity (days without any practice
//       submission after a grace period, capped per month).
// The raw total never goes below 0, and losses never take it below `lossFloorShare` of the points
// earned by solving. The Prep Score is a growth curve of the raw total (scale × points^exponent,
// the old formula's shape): quick at first, slower as it grows, and a gain never lowers it.
import { DEFAULT_POINTS_CONFIG, DEFAULT_PREP_SCORE_CONFIG, normalizePointsConfig, normalizePrepScoreConfig } from './policy.js';
import { allocateSolve } from './quotaRules.js';

export const GENERAL_TOPIC = 'General';
export const POINT_KINDS = Object.freeze(['solve', 'login', 'challenge', 'sheet', 'badge', 'milestone', 'wrong', 'inactive']);
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** IST calendar day (YYYY-MM-DD) of a moment. */
export function istDay(date = new Date()) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const dayNumber = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;
const dayFromNumber = (number) => new Date(number * DAY_MS).toISOString().slice(0, 10);
const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};
const positive = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

export function cleanTopics(tags) {
  const seen = new Set();
  const list = (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag ?? '').trim())
    .filter((tag) => tag && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()));
  return list.length ? list : [GENERAL_TOPIC];
}

const levelOf = (difficulty) => {
  const key = String(difficulty ?? '').trim().toLowerCase();
  return key === 'hard' ? 'Hard' : key === 'medium' ? 'Medium' : key === 'easy' ? 'Easy' : null;
};

/**
 * Points of one solve given today's per-topic usage. Mutates `used` (Map topic -> credited solves
 * that day) for the topics it credits. Returns { points, parts: [{ topic, share, counted, used }] }.
 */
export function splitSolve({ difficulty, topics }, used, { solvePoints, limit, limited }) {
  const list = cleanTopics(topics);
  const base = positive(solvePoints[levelOf(difficulty) || 'Easy']);
  const share = base / list.length;
  let points = 0;
  const parts = list.map((topic) => {
    const key = topic.toLowerCase();
    const before = used.get(key) || 0;
    const counted = !limited || !limit || before < limit;
    if (counted) {
      used.set(key, before + 1);
      points += share;
    }
    return { topic, share, counted, used: counted ? before + 1 : before };
  });
  return { points, parts };
}

/**
 * facts: {
 *   solves:   [{ key, at, difficulty, topics }]   first accepted solve per problem
 *   wrong:    [{ key, day, count }]                wrong submissions per problem per IST day
 *   activeDays: ['YYYY-MM-DD']                     days with any practice submission
 *   logins:   ['YYYY-MM-DD'],  challenges: ['YYYY-MM-DD'],
 *   sheets:   [{ key, at }],  badgeLevels: [{ key, at, level }],  milestones: [{ key, at, tier }]
 * }
 * Returns { total, events } with events in replay order: { day, kind, delta (applied), raw, key?, meta? }.
 */
export function buildPointLedger(facts = {}, pointsConfig = DEFAULT_POINTS_CONFIG, { now = new Date(), limit = 3, coding = true } = {}) {
  const config = normalizePointsConfig(pointsConfig);
  const today = istDay(now);
  const raw = [];
  const solveDay = new Map();

  // Solves, grouped per IST day in time order so the topic buckets fill in the order they happened.
  if (coding) {
    const solves = [...(facts.solves || [])]
      .filter((solve) => solve?.at)
      .map((solve) => ({ ...solve, at: new Date(solve.at), day: istDay(solve.at) }))
      .sort((a, b) => a.at - b.at || String(a.key).localeCompare(String(b.key)));
    const buckets = new Map();
    // Canonical problems already paid (a local and a shared copy of one problem pay once).
    const paid = new Set();
    const receipts = facts.allocations instanceof Map ? facts.allocations : new Map();
    for (const solve of solves) {
      if (solveDay.has(solve.key)) continue;
      solveDay.set(solve.key, solve.day);
      if (!buckets.has(solve.day)) buckets.set(solve.day, new Map());
      const used = buckets.get(solve.day);
      const limited = solve.day >= config.topicLimitFrom;
      const canonical = solve.problemKey || solve.key;
      const difficulty = levelOf(solve.difficulty) || 'Easy';
      if (solve.day >= config.allocationFrom) {
        // Allocation rules (quotaRules.js): the stored receipt is the decision; without one the
        // same rule is replayed. A second copy of an already-paid problem pays nothing.
        if (paid.has(canonical)) continue;
        paid.add(canonical);
        const receipt = receipts.get(canonical);
        let points; let parts;
        if (receipt) {
          points = positive(receipt.points);
          parts = (receipt.parts || []).map((part) => ({ topic: part.label || part.topic, key: part.topic, share: positive(part.points), counted: true, used: 0 }))
            .concat((receipt.fullTags || []).map((label) => ({ topic: label, key: null, share: 0, counted: false, used: limit })));
          for (const part of parts) if (part.counted && part.key) { part.used = (used.get(part.key) || 0) + 1; used.set(part.key, part.used); }
        } else {
          ({ points, parts } = allocateSolve({ base: positive(config.solve[difficulty]), tags: solve.topics, used, limit, limited }));
        }
        raw.push({ day: solve.day, at: solve.at.getTime(), kind: 'solve', raw: points, key: solve.key, meta: { difficulty, parts, limited, problemKey: canonical, rule: 'allocation', receipt: Boolean(receipt) } });
        continue;
      }
      paid.add(canonical);
      const { points, parts } = splitSolve(solve, used, { solvePoints: config.solve, limit, limited });
      raw.push({ day: solve.day, at: solve.at.getTime(), kind: 'solve', raw: points, key: solve.key, meta: { difficulty, parts, limited, problemKey: canonical } });
    }

    // Wrong submissions: only before the problem's solve day; same-day ones are refunded by the solve.
    const wrongByDay = new Map();
    for (const row of facts.wrong || []) {
      if (!row?.day || !(Number(row.count) > 0)) continue;
      const solved = solveDay.get(row.key);
      if (solved && (solved < row.day || (solved === row.day && config.refundSameDay))) continue;
      wrongByDay.set(row.day, (wrongByDay.get(row.day) || 0) + Number(row.count));
    }
    for (const [day, total] of wrongByDay) {
      const loss = Math.min(config.wrongDailyCap, total * config.wrongSubmission);
      if (loss > 0) raw.push({ day, at: dayNumber(day) * DAY_MS + DAY_MS - 2, kind: 'wrong', raw: -loss, meta: { count: total } });
    }

    // Inactivity: from the first active day up to yesterday (today is not over yet).
    const active = [...new Set((facts.activeDays || []).filter(Boolean))].sort();
    const { graceDays, perDay, monthlyCap } = config.inactivity;
    if (active.length && perDay > 0) {
      const activeSet = new Set(active);
      const last = dayNumber(today) - 1;
      let gap = 0;
      const spent = new Map();
      for (let number = dayNumber(active[0]) + 1; number <= last; number += 1) {
        const day = dayFromNumber(number);
        if (activeSet.has(day)) { gap = 0; continue; }
        gap += 1;
        if (gap <= graceDays) continue;
        const month = day.slice(0, 7);
        const room = monthlyCap - (spent.get(month) || 0);
        const loss = Math.min(perDay, Math.max(0, room));
        if (loss <= 0) continue;
        spent.set(month, (spent.get(month) || 0) + loss);
        raw.push({ day, at: number * DAY_MS + DAY_MS - 1, kind: 'inactive', raw: -loss, meta: { gap } });
      }
    }
  }

  for (const day of new Set((facts.logins || []).filter(Boolean))) {
    if (config.login > 0) raw.push({ day, at: dayNumber(day) * DAY_MS, kind: 'login', raw: config.login });
  }
  if (coding) {
    for (const day of new Set((facts.challenges || []).filter(Boolean))) {
      if (config.dailyChallenge > 0) raw.push({ day, at: dayNumber(day) * DAY_MS + 1, kind: 'challenge', raw: config.dailyChallenge });
    }
  }
  for (const sheet of facts.sheets || []) {
    if (sheet?.at && config.sheetCompleted > 0) raw.push({ day: istDay(sheet.at), at: new Date(sheet.at).getTime(), kind: 'sheet', raw: config.sheetCompleted, key: sheet.key });
  }
  for (const award of facts.badgeLevels || []) {
    if (award?.at && config.monthlyBadgeLevel > 0) raw.push({ day: istDay(award.at), at: new Date(award.at).getTime(), kind: 'badge', raw: config.monthlyBadgeLevel, key: award.key, meta: { level: award.level } });
  }
  for (const award of facts.milestones || []) {
    const amount = positive(config.lifetimeBadge[Math.min(config.lifetimeBadge.length, Math.max(1, Number(award?.tier) || 1)) - 1]);
    if (award?.at && amount > 0) raw.push({ day: istDay(award.at), at: new Date(award.at).getTime(), kind: 'milestone', raw: amount, key: award.key, meta: { tier: award.tier } });
  }

  // Replay: by day; within a day gains before losses (kinder when a score is near 0), then by time.
  // Points run on a raw (activity point) total. Losses can never take it below the protected share
  // of the points earned by solving, so a quiet month cannot wipe out real work.
  raw.sort((a, b) => a.day.localeCompare(b.day) || (b.raw > 0) - (a.raw > 0) || a.at - b.at);
  let total = 0;
  let solvePoints = 0;
  let shown = 0;
  const events = [];
  for (const event of raw) {
    if (event.kind === 'solve') solvePoints += event.raw;
    const floor = event.raw < 0 ? solvePoints * config.lossFloorShare : 0;
    const next = event.raw < 0 ? Math.max(Math.min(total, floor), total + event.raw, 0) : total + event.raw;
    const rawDelta = next - total;
    total = next;
    // The Prep Score is the growth curve of the raw total (old-formula shape: fast at first, then
    // slower). Each event's change is the curve's step, so changes always add up to the score.
    const after = curveValue(total, config);
    events.push({ ...event, rawDelta, delta: after - shown });
    shown = after;
  }
  return { total: round(shown, config.decimalPlaces), rawTotal: round(total, 2), events, config };
}

/** Prep Score for a raw activity point total: scale × points^exponent (exponent 1 = no curve). */
export function curveValue(points, config = DEFAULT_POINTS_CONFIG) {
  const value = Math.max(0, Number(points) || 0);
  if (!value) return 0;
  const { scale = 1, exponent = 1 } = config.curve || {};
  return scale * value ** exponent;
}

/** The ledger for one student's facts under a published policy (its points and topic limit). */
export function ledgerFor(facts, policy = {}, { now = new Date(), features = null } = {}) {
  const config = normalizePrepScoreConfig(policy.config || DEFAULT_PREP_SCORE_CONFIG);
  return buildPointLedger(facts, config.points, { now, limit: config.modules.coding.dailyTopicLimit, coding: features?.coding !== false });
}

/**
 * Per-day history for the graph: [{ day, gained, lost, net, total, byKind }], plus totals by kind
 * and the points each topic earned. `from` (YYYY-MM-DD) trims the series but keeps the running total.
 */
export function summarizeLedger(ledger, { from = null, places = 2 } = {}) {
  const days = new Map();
  const byKind = Object.fromEntries(POINT_KINDS.map((kind) => [kind, 0]));
  const topics = new Map();
  let running = 0;
  for (const event of ledger.events || []) {
    running += event.delta;
    if (!days.has(event.day)) days.set(event.day, { day: event.day, gained: 0, lost: 0, net: 0, total: 0, byKind: {} });
    const row = days.get(event.day);
    if (event.delta > 0) row.gained += event.delta; else row.lost += -event.delta;
    row.net += event.delta;
    row.total = running;
    row.byKind[event.kind] = (row.byKind[event.kind] || 0) + event.delta;
    if (from && event.day < from) continue;
    byKind[event.kind] += event.delta;
    if (event.kind === 'solve' && event.delta > 0) {
      // Topic shares are raw points; turn them into this event's share of the Prep Score change.
      const scale = event.raw > 0 ? event.delta / event.raw : 0;
      for (const part of event.meta?.parts || []) {
        if (!part.counted) continue;
        topics.set(part.topic, (topics.get(part.topic) || 0) + part.share * scale);
      }
    }
  }
  const tidy = (row) => ({
    ...row, gained: round(row.gained, places), lost: round(row.lost, places), net: round(row.net, places), total: round(row.total, places),
    byKind: Object.fromEntries(Object.entries(row.byKind).map(([kind, value]) => [kind, round(value, places)])),
  });
  const series = [...days.values()].filter((row) => !from || row.day >= from).map(tidy);
  const before = from ? [...days.values()].filter((row) => row.day < from).at(-1)?.total || 0 : 0;
  return {
    startTotal: round(before, places),
    total: round(running, places),
    series,
    byKind: Object.fromEntries(Object.entries(byKind).map(([kind, value]) => [kind, round(value, places)])),
    topics: [...topics.entries()].map(([topic, points]) => ({ topic, points: round(points, places) })).sort((a, b) => b.points - a.points || a.topic.localeCompare(b.topic)),
  };
}

/** Credited solves per topic on one IST day (for the problem page's topic chip). */
export function topicUsageOn(ledger, day) {
  const used = new Map();
  for (const event of ledger.events || []) {
    if (event.kind !== 'solve' || event.day !== day) continue;
    for (const part of event.meta?.parts || []) {
      if (!part.counted) continue;
      // Allocation-era parts carry the canonical quota key; older parts the raw tag.
      const key = part.key || part.topic.toLowerCase();
      used.set(key, (used.get(key) || 0) + 1);
    }
  }
  return used;
}
