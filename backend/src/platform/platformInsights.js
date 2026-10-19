import Problem from '../models/Problem.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import Assessment from '../models/Assessment.js';
import AIInterview from '../models/AIInterview.js';
import Semester from '../models/Subject.js';
import User from '../models/User.js';
import MailJob from '../models/MailJob.js';
import { Quest } from '../models/AdaptiveEngagement.js';
import PrepScorePolicy from '../models/PrepScorePolicy.js';
import { CENTRAL_QUESTION_FILTER } from './centralQuestions.js';
import { Publication, PlatformCoinMovement, PlatformCoinPricing, PlatformCoinCharge } from './models.js';

// Platform-owned numbers for the Master Admin overview. They live on the central database, so they
// are meaningful even before any university database is connected.

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const TIMEZONE = 'Asia/Kolkata';
const QUERY_MS = 8_000;
const COIN_IN = ['initial', 'topup', 'superadmin_to_coordinator', 'superadmin_to_student'];
const COIN_SHARED = ['admin_to_coordinator', 'coordinator_to_student'];

const countBy = async (Model, match, field) => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]).option({ maxTimeMS: QUERY_MS });
  return Object.fromEntries(rows.map((row) => [String(row._id ?? 'none').toLowerCase(), row.n]));
};

const settle = async (work, fallback) => {
  try { return await work(); } catch (error) {
    console.warn('[PlatformInsights] central source failed', error?.message);
    return fallback;
  }
};

export function coinDays(now = new Date(), days = 30) {
  const today = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS;
  return Array.from({ length: days }, (_, index) => new Date(today - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10));
}

// Daily coin movements grouped into issued / passed on / spent / refunded, plus totals per kind.
export async function coinFlow(now = new Date(), days = 30, match = {}) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = await PlatformCoinMovement.aggregate([
    { $match: { ...match, createdAt: { $gte: since } } },
    { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIMEZONE } }, kind: '$kind' }, amount: { $sum: '$amount' }, n: { $sum: 1 } } },
  ]).option({ maxTimeMS: QUERY_MS });
  const trend = coinDays(now, days).map((date) => {
    const today = rows.filter((row) => row._id.day === date);
    const total = (kinds) => today.filter((row) => kinds.includes(row._id.kind)).reduce((sum, row) => sum + row.amount, 0);
    return { date, issued: total(COIN_IN), shared: total(COIN_SHARED), spent: total(['student_spend']), refunded: total(['student_refund']) };
  });
  const kindTotals = {};
  for (const row of rows) {
    kindTotals[row._id.kind] ??= { amount: 0, count: 0 };
    kindTotals[row._id.kind].amount += row.amount;
    kindTotals[row._id.kind].count += row.n;
  }
  return { trend, byKind: Object.entries(kindTotals).map(([kind, value]) => ({ kind, ...value })).sort((a, b) => b.amount - a.amount) };
}

export async function platformCentralSummary(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [problems, problemDifficulty, questions, quests, assessments, publications, aiInterviews, semesters, accounts, mail, policy, pricing, flow, charges] = await Promise.all([
    settle(() => countBy(Problem, {}, 'status'), {}),
    settle(() => countBy(Problem, { status: 'published' }, 'difficulty'), {}),
    settle(() => countBy(QuestionLibrary, CENTRAL_QUESTION_FILTER, 'questionType'), {}),
    settle(() => countBy(Quest, {}, 'status'), {}),
    settle(() => countBy(Assessment, {}, 'lifecycleStatus'), {}),
    settle(() => Publication.aggregate([
      { $group: { _id: '$kind', items: { $sum: 1 }, shared: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$universityIds', []] } }, 0] }, 1, 0] } }, assignments: { $sum: { $size: { $ifNull: ['$universityIds', []] } } } } },
    ]).option({ maxTimeMS: QUERY_MS }), []),
    settle(() => AIInterview.countDocuments().maxTimeMS(QUERY_MS), 0),
    settle(() => Semester.countDocuments().maxTimeMS(QUERY_MS), 0),
    settle(() => countBy(User, {}, 'role'), {}),
    settle(() => countBy(MailJob, { createdAt: { $gte: since } }, 'status'), {}),
    settle(() => PrepScorePolicy.find({ status: { $in: ['active', 'calculating', 'draft'] } }).select('version status publishedAt updatedAt changeReason').sort({ version: -1 }).limit(5).lean(), []),
    settle(() => PlatformCoinPricing.findById('current').lean(), null),
    settle(() => coinFlow(now), { trend: coinDays(now).map((date) => ({ date, issued: 0, shared: 0, spent: 0, refunded: 0 })), byKind: [] }),
    settle(() => countBy(PlatformCoinCharge, { createdAt: { $gte: since } }, 'status'), {}),
  ]);

  const active = policy.find((row) => row.status === 'active');
  const features = Object.entries(pricing?.features || {});
  const publication = (kind) => publications.find((row) => row._id === kind) || { items: 0, shared: 0, assignments: 0 };

  return {
    content: {
      problems: { published: problems.published || 0, draft: problems.draft || 0, byDifficulty: ['easy', 'medium', 'hard'].map((level) => ({ difficulty: level, count: problemDifficulty[level] || 0 })) },
      questions: { total: Object.values(questions).reduce((sum, n) => sum + n, 0), byType: Object.entries(questions).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count) },
      quickPreps: { published: quests.published || 0, draft: quests.draft || 0, total: Object.values(quests).reduce((sum, n) => sum + n, 0) },
      assessments: { published: (assessments.published || 0) + (assessments.none || 0), draft: assessments.draft || 0, shared: publication('assessment').shared, assignments: publication('assessment').assignments },
      sharedQuestions: { shared: publication('question').shared, assignments: publication('question').assignments },
      aiInterviews,
      learningSemesters: semesters,
    },
    accounts: { admins: accounts.admin || 0, coordinators: accounts.coordinator || 0, students: accounts.student || 0 },
    mail: { queued: (mail.queued || 0) + (mail.processing || 0), sent: mail.sent || 0, failed: mail.failed || 0 },
    prepScore: {
      version: active?.version ?? null,
      publishedAt: active?.publishedAt || null,
      calculating: policy.some((row) => row.status === 'calculating'),
      draftPending: policy.some((row) => row.status === 'draft' && (!active || row.version > active.version)),
    },
    coins: {
      trend: flow.trend,
      byKind: flow.byKind,
      pricedFeatures: features.filter(([, value]) => Number(value?.price) > 0).length,
      features: features.length,
      pricingVersion: pricing?.version ?? null,
      charges: { captured: charges.captured || 0, refunded: charges.refunded || 0, pending: charges.pending || 0 },
    },
  };
}
