import mongoose from 'mongoose';
import StudentChallenge from '../models/StudentChallenge.js';
import { MissionAssignment, EngagementReward, EngagementActivity, StudentProgression, StudentBadge, AchievementEvent, MonthlyProgressSnapshot, QuestEnrollment } from '../models/AdaptiveEngagement.js';
import { engagementTenant, engagementPermissions, getEngagementPolicy } from './engagementPolicyService.js';
import { loadEvidenceAndCandidates } from './engagementEvidenceService.js';
import { BADGES, LEVELS, DOMAIN_ACCESS, dayKey, periodsAt, enabledDomains, abilityFrom, selectDailyMissions, evaluateGoals, assignmentComplete, assignmentCompletedAt, assignmentPaused, progressionView, bestStreak, badgeCategoryAllowed } from './adaptiveEngagementRules.js';
import { invalidateChallengeRanking, getStudentUniversityRanking } from './studentDashboardService.js';
import { requireEngagementUniqueIndex } from '../utils/engagementIndexes.js';
import { notifyOnce } from './notificationService.js';
import { HttpError } from '../utils/errors.js';

const pending = new Map();
export const engagementScope = (student) => ({ tenantKey: engagementTenant(student), studentId: new mongoose.Types.ObjectId(String(student._id)) });
async function insertOnce(model, filter, data) {
  try { return await model.findOneAndUpdate(filter, { $setOnInsert: data }, { upsert: true, new: true, setDefaultsOnInsert: true }).maxTimeMS(8000).lean(); }
  catch (error) { if (error.code !== 11000) throw error; return model.findOne(filter).maxTimeMS(8000).lean(); }
}
async function awardXp(scope, key, points, kind, now) {
  try {
    const result = await EngagementReward.updateOne({ ...scope, key }, { $setOnInsert: { points, kind, earnedAt: now } }, { upsert: true }).maxTimeMS(8000);
    if (result.upsertedCount) invalidateChallengeRanking();
    return Boolean(result.upsertedCount);
  } catch (error) { if (error.code !== 11000) throw error; return false; }
}
export async function createAchievement(scope, key, payload, deliveredAt = null) {
  return insertOnce(AchievementEvent, { ...scope, key }, { payload, deliveredAt });
}
const pct = (goals) => Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / Math.max(1, goals.length));

const PERIOD_NAMES = { daily: 'Daily plan', weekly: 'Weekly target', monthly: 'Monthly target' };

/**
 * Milestones become bell notifications. Each notice has a stable key, so repeated or concurrent
 * refreshes deliver it once. Delivery is best effort: it never blocks or fails the refresh.
 */
async function deliverNotices(scope, notices, now) {
  if (!notices.length) return;
  const results = await Promise.allSettled(notices.map(({ key, ...notice }) => notifyOnce({
    ...notice, userId: scope.studentId, dedupeKey: `engagement:${scope.tenantKey}:${key}`, now,
  })));
  for (const result of results) if (result.status === 'rejected') console.warn('[engagement] notification failed:', result.reason?.message || result.reason);
}

async function refresh(student, now) {
  const scope = engagementScope(student);
  const [permissions, policy] = await Promise.all([engagementPermissions(student), getEngagementPolicy(scope.tenantKey, student.semester)]);
  const domains = enabledDomains(permissions, policy);
  const enabled = policy.enabled && (!policy.pauseUntil || new Date(policy.pauseUntil) <= now);
  // These guards fail closed when a deployment has not installed the unique receipt indexes.
  await Promise.all([
    requireEngagementUniqueIndex(MissionAssignment, { tenantKey: 1, studentId: 1, kind: 1, periodKey: 1 }),
    requireEngagementUniqueIndex(EngagementReward, { tenantKey: 1, studentId: 1, key: 1 }),
    requireEngagementUniqueIndex(StudentBadge, { tenantKey: 1, studentId: 1, badgeId: 1 }),
    requireEngagementUniqueIndex(AchievementEvent, { tenantKey: 1, studentId: 1, key: 1 }),
    requireEngagementUniqueIndex(StudentProgression, { tenantKey: 1, studentId: 1 }),
    requireEngagementUniqueIndex(EngagementActivity, { tenantKey: 1, studentId: 1, sourceKey: 1 }),
  ]);
  let progression = await StudentProgression.findOne(scope).lean();
  if (!progression) {
    const previous = await getStudentUniversityRanking(student, permissions, now);
    const baseline = Math.max(1, Math.min(6, previous.level?.level || 1));
    progression = await insertOnce(StudentProgression, scope, { joinedAt: now, level: baseline,
      levelHistory: baseline > 1 ? [{ level: baseline, title: previous.level.title, achievedAt: now, imported: true }] : [] });
  }
  if (!progression.legacyImportedAt) {
    const editions = await StudentChallenge.find({ studentId: student._id, kind: { $in: ['weekly', 'monthly'] }, earnedAt: { $ne: null } }).select('kind periodKey rewardPoints earnedAt').lean();
    for (const edition of editions) {
      const definition = { id: `legacy-${edition.kind}-${edition.periodKey}`, title: `${edition.kind === 'monthly' ? 'Monthly Explorer' : 'Weekly Momentum'} · ${edition.periodKey}`,
        category: 'momentum', rarity: edition.kind === 'monthly' ? 'Epic' : 'Rare', metric: 'edition', target: 1, minimumLevel: 1, rewardXp: edition.rewardPoints,
        description: 'An earned edition from your original PeerPrep challenge history.' };
      await insertOnce(StudentBadge, { ...scope, badgeId: definition.id }, { definition, earnedAt: edition.earnedAt, evidence: { imported: true, periodKey: edition.periodKey } });
    }
    // Legacy acknowledgement records are client-reported cosmetics. Preserve only badges proven by server metrics.
    const verified = (await getStudentUniversityRanking(student, permissions, now)).badgeMetrics;
    for (const [id, title, metric, target, category] of [
      ['first-accept', 'First Accept', 'solved', 1, 'coding'], ['solver-10', 'Problem Solver', 'solved', 10, 'coding'],
      ['solver-50', 'Half Century', 'solved', 50, 'coding'], ['hard-1', 'Hard Hitter', 'hardSolved', 1, 'coding'],
      ['streak-7', 'On Fire', 'bestStreak', 7, 'momentum'], ['streak-30', 'Unstoppable', 'bestStreak', 30, 'momentum'],
      ['active-30', 'Regular', 'activeDays', 30, 'momentum'], ['polyglot', 'Polyglot', 'languages', 3, 'coding'],
      ['assessment-1', 'Test Taker', 'assessments', 1, 'assessments'], ['interview-1', 'Interview Ready', 'interviews', 1, 'events'],
    ]) {
      if ((verified?.[metric] || 0) < target) continue;
      const definition = { id: `legacy-${id}`, title, category, metric: 'legacy', target, minimumLevel: 1, rarity: 'Legacy', description: `Preserved achievement: ${target} ${metric}.`, rewardXp: 0 };
      await insertOnce(StudentBadge, { ...scope, badgeId: definition.id }, { definition, earnedAt: now, evidence: { imported: true, metric, value: verified[metric] } });
    }
    await StudentProgression.updateOne(scope, { $set: { legacyImportedAt: now } });
  }
  const evidence = await loadEvidenceAndCandidates(scope, student, domains, now, progression);
  const { events, candidates, availableKeys } = evidence;
  const ability = abilityFrom(events, now);
  const periods = periodsAt(now);
  const latest = events.reduce((max, e) => Math.max(max, new Date(e.occurredAt).getTime()), 0);
  const returning = latest > 0 && now.getTime() - latest > 7 * 86400000;
  const current = [], notices = [];
  // Only the daily challenge is assigned now. Weekly and monthly rows from before stay readable
  // below so any unsettled reward is still paid, but no new ones are created.
  if (enabled) {
    const period = periods.daily;
    const seed = `${scope.tenantKey}:${scope.studentId}:daily:${period.periodKey}:${policy.revision}`;
    const goals = selectDailyMissions(candidates, ability, policy, seed, returning);
    let row = await MissionAssignment.findOne({ ...scope, kind: 'daily', periodKey: period.periodKey }).maxTimeMS(8000).lean();
    if (!row && goals.length) row = await insertOnce(MissionAssignment, { ...scope, kind: 'daily', periodKey: period.periodKey }, {
      ...period, assignedAt: now, policyRevision: policy.revision, goals, rewardPoints: policy.dailyXp,
    });
    if (row) current.push(row);
  }
  const older = enabled ? await MissionAssignment.find({ ...scope, $or: [{ earnedAt: null }, { settledAt: null }, { endsAt: { $gte: new Date(now.getTime() - 7 * 86400000) } }], endsAt: { $lte: now }, closedAt: null }).sort({ endsAt: 1 }).limit(100).maxTimeMS(8000).lean() : [];
  const cards = [], newAwards = [];
  for (const row of [...current, ...older]) {
    const goals = evaluateGoals(row, events, domains, availableKeys, now);
    const paused = assignmentPaused(row, goals);
    if (row.earnedAt || assignmentComplete(row, goals)) {
      const earnedAt = row.earnedAt || assignmentCompletedAt(row, goals);
      await MissionAssignment.updateOne({ _id: row._id, earnedAt: null }, { $set: { earnedAt } }).maxTimeMS(8000);
      row.earnedAt = earnedAt;
      if (await awardXp(scope, `${row.kind}:${row.periodKey}`, row.rewardPoints, row.kind, earnedAt)) {
        newAwards.push({ kind: row.kind, periodKey: row.periodKey, rewardPoints: row.rewardPoints });
        notices.push({ key: `done:${row.kind}:${row.periodKey}`, type: 'CHALLENGE', actionUrl: '/student/quests',
          title: row.kind === 'daily' ? 'Daily challenge complete' : `${PERIOD_NAMES[row.kind]} reached`,
          message: row.kind === 'daily'
            ? `+${row.rewardPoints} XP earned. A new challenge arrives at 2 AM.`
            : `+${row.rewardPoints} XP and the ${row.kind === 'weekly' ? 'Weekly Momentum' : 'Monthly Explorer'} badge for ${row.periodKey}.` });
      }
      if (row.kind !== 'daily') {
        const definition = { id: `edition-${row.kind}-${row.periodKey}`, title: `${row.kind === 'weekly' ? 'Weekly Momentum' : 'Monthly Explorer'} · ${row.periodKey}`,
          category: 'momentum', rarity: row.kind === 'monthly' ? 'Epic' : 'Rare', metric: 'edition', target: 1, minimumLevel: 1, rewardXp: row.rewardPoints,
          description: `Complete every requirement in the ${row.periodKey} ${row.kind} journey.` };
        await insertOnce(StudentBadge, { ...scope, badgeId: definition.id }, { definition, earnedAt, evidence: { periodKey: row.periodKey, goals: row.goals.map((g) => ({ domain: g.domain, target: g.target })) } });
        await createAchievement(scope, `badge:${definition.id}`, { type: 'badge', award: { ...definition, earned: true } });
      }
    }
    for (const goal of goals.filter((g) => g.slot === 'stretch' && g.completed)) {
      if (await awardXp(scope, `stretch:${row.periodKey}`, goal.rewardXp || 0, 'stretch', goal.completedAt)) newAwards.push({ kind: 'stretch', rewardPoints: goal.rewardXp || 0 });
    }
    // Written last: an interrupted award resumes even after the period rolls over.
    if (row.earnedAt) await MissionAssignment.updateOne({ _id: row._id, settledAt: null }, { $set: { settledAt: now } }).maxTimeMS(8000);
    if (new Date(row.endsAt).getTime() < now.getTime() - 7 * 86400000) await MissionAssignment.updateOne({ _id: row._id }, { $set: { closedAt: now } });
    if (current.some((item) => String(item._id) === String(row._id))) cards.push({
      kind: row.kind, periodKey: row.periodKey, title: 'Daily challenge',
      endsAt: row.endsAt, startsAt: row.startsAt, acceptedAt: row.acceptedAt || null, rewardPoints: row.rewardPoints, earned: Boolean(row.earnedAt), completed: Boolean(row.earnedAt), earnedAt: row.earnedAt,
      goals: goals.map(({ contentKeys, priority, ...goal }) => goal), progress: row.earnedAt ? 100 : pct(goals.filter((g) => g.slot !== 'stretch')),
      paused, enabled: true,
    });
  }
  const [rewards, legacy, savedBadges, earnedMonths, questsCompleted] = await Promise.all([
    EngagementReward.find(scope).select('points kind earnedAt').maxTimeMS(8000).lean(),
    StudentChallenge.aggregate([{ $match: { studentId: scope.studentId, earnedAt: { $ne: null } } }, { $group: { _id: null, points: { $sum: '$rewardPoints' }, badges: { $sum: { $cond: [{ $in: ['$kind', ['weekly', 'monthly']] }, 1, 0] } } } }]).option({ maxTimeMS: 8000 }),
    StudentBadge.find(scope).maxTimeMS(8000).lean(),
    MissionAssignment.countDocuments({ ...scope, kind: 'monthly', earnedAt: { $ne: null } }).maxTimeMS(8000),
    domains.includes('coding') ? QuestEnrollment.countDocuments({ ...scope, completedAt: { $ne: null } }).maxTimeMS(8000) : 0,
  ]);
  const xp = (legacy[0]?.points || 0) + rewards.reduce((sum, reward) => sum + reward.points, 0);
  const days = new Set(events.map((event) => event.dayKey));
  const weekDays = new Set(events.filter((event) => new Date(event.occurredAt) >= periods.weekly.startsAt).map((event) => event.dayKey)).size;
  const monthDays = new Set(events.filter((event) => new Date(event.occurredAt) >= periods.monthly.startsAt).map((event) => event.dayKey)).size;
  const sampled = domains.filter((domain) => ability[domain]?.samples > 0);
  const mastery = sampled.length ? Math.round(sampled.reduce((sum, domain) => sum + ability[domain].mastery, 0) / sampled.length) : 0;
  const eligible = enabled ? [...LEVELS].reverse().find((level) => xp >= level.xp && mastery >= level.mastery && days.size >= level.days) : null;
  if (eligible && eligible.level > progression.level) {
    const updated = await StudentProgression.findOneAndUpdate({ ...scope, level: { $lt: eligible.level } }, { $set: { level: eligible.level }, $push: { levelHistory: { level: eligible.level, title: eligible.title, achievedAt: now, mastery, xp } } }, { new: true }).lean();
    if (updated) {
      progression = updated;
      notices.push({ key: `level:${eligible.level}`, type: 'LEVEL', actionUrl: '/student/profile#badges',
        title: `Level ${eligible.level} unlocked: ${eligible.title}`, message: `${xp} XP and ${mastery}% demonstrated mastery got you here.` });
    }
  }
  // The unique event key repairs a crash between promoting and publishing the celebration.
  for (const entry of progression.levelHistory || []) if (!entry.imported) await createAchievement(scope, `level:${entry.level}`, { type: 'level', level: { ...LEVELS[entry.level - 1], helper: `${entry.xp} XP and ${entry.mastery}% demonstrated mastery.` } });
  const metrics = { activities: events.length, activeDays: days.size, weeklyDays: weekDays, domainsUsed: new Set(events.map((e) => e.domain)).size,
    dailyCompleted: rewards.filter((r) => r.kind === 'daily').length, monthlyCompleted: earnedMonths,
    hardSolved: events.filter((e) => e.domain === 'coding' && e.difficulty === 'Hard').length,
    highAssessments: events.filter((e) => e.domain === 'assessments' && e.score >= 80).length,
    activeStreak: bestStreak(events.map((e) => e.dayKey)),
    codingStreak: bestStreak(events.filter((e) => e.domain === 'coding').map((e) => e.dayKey)),
    learningStreak: bestStreak(events.filter((e) => e.domain === 'learning').map((e) => e.dayKey)),
    questsCompleted,
    ...Object.fromEntries(domains.map((domain) => [domain, new Set(events.filter((e) => e.domain === domain).map((e) => e.contentKey)).size])),
  };
  const definitions = [...BADGES, ...(policy.customBadges || [])].filter((b) => badgeCategoryAllowed(b.category, domains) && (b.metric !== 'domainsUsed' || domains.length >= b.target));
  const badgeMap = new Map(savedBadges.map((b) => [b.badgeId, b]));
  for (const def of definitions) {
    if (!enabled || (metrics[def.metric] || 0) < def.target || progression.level < def.minimumLevel) continue;
    let earned = badgeMap.get(def.id);
    if (!earned) {
      const relevant = events.filter((e) => !DOMAIN_ACCESS[def.category] || e.domain === def.category);
      const historical = relevant.length && relevant.every((e) => new Date(e.occurredAt) < new Date(progression.joinedAt));
      earned = await insertOnce(StudentBadge, { ...scope, badgeId: def.id }, { definition: def, earnedAt: now, evidence: { metric: def.metric, value: metrics[def.metric], imported: Boolean(historical) } });
      badgeMap.set(def.id, earned);
      // Badges recognised from work done before joining are added quietly, like their celebrations.
      if (!earned.evidence?.imported) notices.push({ key: `badge:${def.id}`, type: 'BADGE', actionUrl: '/student/profile#badges',
        title: `Badge earned: ${earned.definition?.title || def.title}`, message: earned.definition?.description || def.description || 'A new badge was added to your collection.' });
    }
    await createAchievement(scope, `badge:${def.id}`, { type: 'badge', award: { ...earned.definition, earned: true } }, earned.evidence?.imported ? now : null);
  }
  // Retired definitions remain in the collection; disabled feature definitions stay out of this university's UI.
  for (const saved of badgeMap.values()) if (!definitions.some((b) => b.id === saved.badgeId) && badgeCategoryAllowed(saved.definition.category, domains)) definitions.push(saved.definition);
  const badges = definitions.map((def) => ({ ...def, ...(badgeMap.get(def.id)?.definition || {}), value: badgeMap.has(def.id) ? (badgeMap.get(def.id)?.definition.target || def.target) : Math.min(def.target, metrics[def.metric] || 0), progress: badgeMap.has(def.id) ? 100 : Math.min(100, Math.round((metrics[def.metric] || 0) / def.target * 100)),
    earned: badgeMap.has(def.id), earnedAt: badgeMap.get(def.id)?.earnedAt || null, evidence: badgeMap.get(def.id)?.evidence || null }));
  const activityByDate = {}, breakdownByDate = {};
  const yearStart = new Date(now.getTime() - 365 * 86400000);
  for (const event of events.filter((e) => new Date(e.occurredAt) >= yearStart)) {
    activityByDate[event.dayKey] = (activityByDate[event.dayKey] || 0) + 1;
    breakdownByDate[event.dayKey] ||= {};
    breakdownByDate[event.dayKey][event.domain] = (breakdownByDate[event.dayKey][event.domain] || 0) + 1;
  }
  // Challenge milestones (plans and targets completed, badges, level-ups) are their own heatmap
  // category. Imported history and edition badges (already counted as a completed target) are left
  // out, and nothing is added once every feature is switched off.
  const milestoneDates = domains.length ? [
    ...rewards.filter((reward) => ['daily', 'weekly', 'monthly'].includes(reward.kind)).map((reward) => reward.earnedAt),
    ...[...badgeMap.values()].filter((badge) => !badge.evidence?.imported && !String(badge.badgeId).startsWith('edition-')
      && badgeCategoryAllowed(badge.definition?.category, domains)).map((badge) => badge.earnedAt),
    ...(progression.levelHistory || []).filter((entry) => !entry.imported).map((entry) => entry.achievedAt),
  ] : [];
  for (const date of milestoneDates) {
    if (!date || new Date(date) < yearStart) continue;
    const key = dayKey(date);
    activityByDate[key] = (activityByDate[key] || 0) + 1;
    breakdownByDate[key] ||= {};
    breakdownByDate[key].challenges = (breakdownByDate[key].challenges || 0) + 1;
  }
  const month = periods.monthly.periodKey;
  if (progression.lastMonth && progression.lastMonth !== month) {
    const monthEvents = events.filter((e) => e.dayKey.startsWith(progression.lastMonth));
    const levelAtClose = Math.max(1, ...(progression.levelHistory || []).filter((entry) => dayKey(entry.achievedAt).slice(0, 7) <= progression.lastMonth).map((entry) => entry.level));
    await insertOnce(MonthlyProgressSnapshot, { ...scope, month: progression.lastMonth }, { summary: { activeDays: new Set(monthEvents.map((e) => e.dayKey)).size, verifiedActivities: monthEvents.length, level: levelAtClose,
      xp: rewards.filter((r) => dayKey(r.earnedAt).startsWith(progression.lastMonth)).reduce((sum, r) => sum + r.points, 0) } });
  }
  await StudentProgression.updateOne(scope, { $set: { ability, syncedAt: now, lastMonth: month,
    ...Object.fromEntries(Object.entries(evidence.domainSyncedAt).map(([domain, date]) => [`domainSyncedAt.${domain}`, date])) } });
  const level = progressionView(progression.level, xp, mastery, days.size);
  const monthPlans = await MissionAssignment.find({ ...scope, kind: 'daily', periodKey: { $gte: `${month}-01`, $lte: `${month}-31` }, 'goals.domain': { $in: domains } })
    .select('periodKey acceptedAt earnedAt rewardPoints').sort({ periodKey: 1 }).limit(31).maxTimeMS(8000).lean();
  const daily = cards.find((card) => card.kind === 'daily') || { enabled, completed: false, goals: [], endsAt: periods.daily.endsAt, rewardPoints: policy.dailyXp };
  await deliverNotices(scope, notices, now);
  return { version: 2, enabled, domains, timezone: 'Asia/Kolkata', rolloverHour: 2, daily, periods: cards.filter((card) => card.kind !== 'daily'),
    lifetime: { points: xp, badges: badgeMap.size, dailyCompleted: metrics.dailyCompleted },
    month: { key: month, dailyPlans: monthPlans.map((plan) => ({ dayKey: plan.periodKey, acceptedAt: plan.acceptedAt || null, completed: Boolean(plan.earnedAt), rewardPoints: plan.rewardPoints })) },
    level, ladder: LEVELS, ability: Object.fromEntries(domains.map((domain) => [domain, ability[domain]])), badges,
    awards: { awards: badges, earnedCount: badges.filter((b) => b.earned).length, nextAward: badges.filter((b) => !b.earned).sort((a, b) => b.progress - a.progress)[0] || null },
    learnerProgress: { levelHistory: progression.levelHistory, awards: badges.filter((b) => b.earned).map((b) => ({ id: b.id, earnedAt: b.earnedAt })) },
    momentum: { weekDays, weeklyTarget: policy.weeklyDays, monthDays, monthlyTarget: policy.monthlyDays, activeToday: days.has(dayKey(now)), returning },
    activity: { activityByDate, breakdownByDate, stats: { totalActiveDays: Object.keys(activityByDate).length } },
    newAwards, generatedAt: now.toISOString(),
    rules: 'Only verified, distinct completions count. Each day brings one personal challenge; solving it earns XP once. Quests award XP and a badge when every question is solved. Every level requires XP, demonstrated mastery and active days. Missing a day never removes XP or an earned level. Goals reset at 2 AM IST. Access changes pause existing requirements. Grades, logins, views and code runs cannot be submitted as rewards by your browser.',
  };
}

export function refreshAdaptiveEngagement(student, now = new Date()) {
  const scope = engagementScope(student), key = `${scope.tenantKey}:${scope.studentId}`;
  if (pending.has(key)) return pending.get(key);
  const promise = refresh(student, now).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

// Accepting records intent only. Existing automatic completion and immutable XP receipts
// remain authoritative, including work completed before the student explicitly accepts.
export async function acceptChallenge(student, kind, periodKey, now = new Date()) {
  if (kind !== 'daily' || typeof periodKey !== 'string') throw new HttpError(400, 'Invalid challenge period');
  if (periodsAt(now)[kind].periodKey !== periodKey) throw new HttpError(409, 'This challenge has ended. Refresh to see your current plan.');
  const scope = engagementScope(student);
  const [permissions, policy] = await Promise.all([engagementPermissions(student), getEngagementPolicy(scope.tenantKey, student.semester)]);
  if (!policy.enabled || (policy.pauseUntil && new Date(policy.pauseUntil) > now)) throw new HttpError(409, 'Challenges are paused by your university.');
  const domains = enabledDomains(permissions, policy);
  const filter = { ...scope, kind, periodKey, startsAt: { $lte: now }, endsAt: { $gt: now } };
  let assignment = await MissionAssignment.findOne(filter).maxTimeMS(8000).lean();
  if (!assignment) throw new HttpError(404, 'No assigned challenge is available. Refresh your challenges.');
  const goals = assignment.goals.map((goal) => ({ ...goal, paused: goal.domain !== 'momentum' && !domains.includes(goal.domain) }));
  if (!domains.length || assignmentPaused(assignment, goals)) throw new HttpError(409, 'Challenge access has changed. Refresh your challenges.');
  if (!assignment.acceptedAt && !assignment.earnedAt) {
    assignment = await MissionAssignment.findOneAndUpdate({ ...filter, acceptedAt: null, earnedAt: null },
      { $set: { acceptedAt: now } }, { new: true }).maxTimeMS(8000).lean()
      || await MissionAssignment.findOne(filter).maxTimeMS(8000).lean();
  }
  return { kind, periodKey, acceptedAt: assignment.acceptedAt || null, completed: Boolean(assignment.earnedAt) };
}
export async function claimAchievement(student) {
  const scope = engagementScope(student);
  const [permissions, policy] = await Promise.all([engagementPermissions(student), getEngagementPolicy(scope.tenantKey, student.semester)]);
  const domains = enabledDomains(permissions, policy);
  if (!policy.enabled) return { events: [] };
  const events = [];
  for (let i = 0; i < 8; i += 1) {
    // Atomic consume before delivery provides at-most-once automatic display across tabs/devices.
    // A response lost in transit remains in the achievement history, never loops a popup.
    const event = await AchievementEvent.findOneAndUpdate({ ...scope, deliveredAt: null,
      $or: [{ 'payload.type': 'level' }, { 'payload.award.category': { $in: [...domains, 'growth', 'momentum', ...(domains.includes('coding') ? ['quests'] : [])] } }] },
    { $set: { deliveredAt: new Date() } }, { sort: { createdAt: 1 }, new: true }).maxTimeMS(8000).lean();
    if (!event) break;
    events.push({ id: String(event._id), ...event.payload });
  }
  return { events };
}
export async function acknowledgeAchievement(student, ids) {
  if (!Array.isArray(ids) || ids.length > 8 || ids.some((value) => !mongoose.isValidObjectId(value))) throw new HttpError(400, 'Invalid achievement identifiers');
  await AchievementEvent.updateMany({ ...engagementScope(student), _id: { $in: ids }, deliveredAt: { $ne: null }, acknowledgedAt: null }, { $set: { acknowledgedAt: new Date() } });
}
