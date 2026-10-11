import mongoose from 'mongoose';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import Progress from '../models/Progress.js';
import Semester from '../models/Subject.js';
import QuestionPracticeAttempt from '../models/QuestionPracticeAttempt.js';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Feedback from '../models/Feedback.js';
import Pair from '../models/Pair.js';
import { EngagementActivity } from '../models/AdaptiveEngagement.js';
import { buildCurriculumTopicMap, getSharedCodingCatalog, publicProblemMatch, publicCodingProblemStages, learningResumeItem } from './studentDashboardService.js';
import { learningSemesters, sharedAssessments } from '../platform/sharedContent.js';
import { interviewServiceConfigured } from './interviewServiceClient.js';
import { createInterviewServiceToken } from './interviewServiceAuth.js';
import { dayKey } from './adaptiveEngagementRules.js';

const aggregate = (model, pipeline) => model.aggregate(pipeline).option({ maxTimeMS: 8000 });
const id = (value) => new mongoose.Types.ObjectId(String(value));
const scoreFor = (difficulty) => ({ Easy: 35, Medium: 65, Hard: 95 })[difficulty] || 35;

export async function writeVerifiedActivities(scope, entries) {
  if (!entries.length) return;
  const ops = entries.filter((entry) => Number.isFinite(new Date(entry.occurredAt).getTime())).map((entry) => ({ updateOne: {
    filter: { ...scope, sourceKey: entry.sourceKey },
    update: { $setOnInsert: { ...scope, ...entry, dayKey: dayKey(entry.occurredAt) } }, upsert: true,
  } }));
  if (!ops.length) return;
  try { await EngagementActivity.bulkWrite(ops, { ordered: false }); }
  catch (error) { if (!error.writeErrors?.length || error.writeErrors.some((item) => item.code !== 11000)) throw error; }
}

export async function loadEvidenceAndCandidates(scope, student, domains, now, progression) {
  const has = (domain) => domains.includes(domain);
  const [local, shared, semesters, assessments, assessmentResults, pairs, interviewList] = await Promise.all([
    has('coding') ? Problem.find(publicProblemMatch).select('_id title difficulty tags').maxTimeMS(8000).lean() : [],
    has('coding') ? getSharedCodingCatalog() : [],
    has('learning') ? learningSemesters().then((value) => value ?? Semester.find().select('semesterName coordinatorId subjects').maxTimeMS(8000).lean()) : [],
    has('assessments') ? Promise.all([Assessment.find({ lifecycleStatus: { $ne: 'draft' }, isVisible: { $ne: false }, $or: [{ targetType: 'all' }, { assignedStudents: student._id }] }).select('_id title targetType assignedStudents audienceType startTime endTime duration manuallyCompletedAt').maxTimeMS(8000).lean(), sharedAssessments()]).then(([a, b]) => [...a, ...b]) : [],
    has('assessments') ? AssessmentSubmission.find({ studentId: student._id }).select('assessmentId status evaluationStatus submittedAt score maxMarks').maxTimeMS(8000).lean() : [],
    has('events') ? Pair.find({ interviewee: student._id, status: { $in: ['scheduled', 'completed'] } }).select('_id event interviewer status finalConfirmedTime scheduledAt').maxTimeMS(8000).lean() : [],
    has('interviews') && interviewServiceConfigured() ? fetch(new URL('/internal/ai-interviews', process.env.INTERVIEW_SERVICE_URL), {
      headers: { Authorization: `Bearer ${createInterviewServiceToken(student._id)}` }, signal: AbortSignal.timeout(5000),
    }).then(async (response) => response.ok ? await response.json() : []).catch(() => []) : [],
  ]);
  const topics = buildCurriculumTopicMap(semesters, student);
  const sharedMap = new Map(shared.map((row) => [String(row._id), row]));
  const eligibleAssessments = assessments.filter((a) => a.audienceType !== 'assessment_candidates' && (a.targetType === 'all' || (a.assignedStudents || []).some((value) => String(value?._id || value) === String(student._id))));
  const assessmentIds = new Set(eligibleAssessments.map((a) => String(a._id)));
  const pairIds = pairs.map((row) => row._id);
  // Each source is indexed by student. First sync imports history; subsequent syncs overlap to recover delayed writes.
  const since = (domain) => progression?.domainSyncedAt?.[domain] ? new Date(new Date(progression.domainSyncedAt[domain]).getTime() - 2 * 86400000) : null;
  const range = (domain, field) => since(domain) ? { [field]: { $gte: since(domain), $lte: now } } : { [field]: { $lte: now } };
  const [coding, sharedCoding, learning, feedback] = await Promise.all([
    has('coding') ? aggregate(Submission, [
      { $match: { user: id(student._id), mode: 'submit', assessmentId: null, status: { $in: ['AC', 'ACCEPTED', 'ACCEPT'] }, $or: [range('coding', 'updatedAt'), { updatedAt: null, ...range('coding', 'createdAt') }] } },
      ...publicCodingProblemStages(),
      { $group: { _id: '$problem', occurredAt: { $min: { $ifNull: ['$completedAt', '$createdAt'] } }, difficulty: { $first: '$codingProblem.difficulty' }, tags: { $first: '$codingProblem.tags' } } },
    ]) : [],
    has('coding') && shared.length ? aggregate(QuestionPracticeAttempt, [
      { $match: { studentId: id(student._id), source: 'shared', questionType: 'coding', result: 'correct', questionId: { $in: shared.map((r) => id(r._id)) }, ...range('coding', 'createdAt') } },
      { $group: { _id: '$questionId', occurredAt: { $min: '$createdAt' } } },
    ]) : [],
    has('learning') ? Progress.find({ studentId: student._id, topicId: { $in: [...topics.keys()] }, completed: true, ...range('learning', 'completedAt') }).select('topicId completedAt').maxTimeMS(8000).lean() : [],
    has('events') ? Feedback.find({ to: student._id, pair: { $in: pairIds }, from: { $ne: student._id }, ...range('events', 'createdAt') }).select('pair event from marks createdAt').maxTimeMS(8000).lean() : [],
  ]);
  const entries = [
    ...coding.map((row) => ({ domain: 'coding', contentKey: `coding:local:${row._id}`, occurredAt: row.occurredAt, difficulty: row.difficulty, score: scoreFor(row.difficulty), tags: row.tags })),
    ...sharedCoding.map((row) => { const difficulty = sharedMap.get(String(row._id))?.difficulty || 'Easy'; return { domain: 'coding', contentKey: `coding:shared:${row._id}`, occurredAt: row.occurredAt, difficulty, score: scoreFor(difficulty) }; }),
    ...learning.map((row) => ({ domain: 'learning', contentKey: `learning:${row.topicId}`, occurredAt: row.completedAt })),
    ...assessmentResults.filter((row) => row.status === 'submitted' && row.evaluationStatus === 'completed' && row.maxMarks > 0 && Number.isFinite(row.score) && row.submittedAt && new Date(row.submittedAt) <= now && assessmentIds.has(String(row.assessmentId))).map((row) => ({ domain: 'assessments', contentKey: `assessments:${row.assessmentId}`, occurredAt: row.submittedAt, score: Math.max(0, Math.min(100, row.score / row.maxMarks * 100)) })),
    ...feedback.filter((row) => pairs.some((pair) => String(pair._id) === String(row.pair) && String(pair.event) === String(row.event) && String(pair.interviewer) === String(row.from)))
      .map((row) => ({ domain: 'events', contentKey: `events:${row.pair}`, occurredAt: row.createdAt, score: row.marks })),
  ].filter((entry) => new Date(entry.occurredAt) <= now).map((entry) => ({ ...entry, sourceKey: entry.contentKey }));
  await writeVerifiedActivities(scope, entries);
  const allEvents = await EngagementActivity.find({ ...scope, occurredAt: { $lte: now }, domain: { $in: domains } }).select('-__v -createdAt -updatedAt').maxTimeMS(8000).lean();
  const catalogue = [
    ...local.map((p) => ({ key: `coding:local:${p._id}`, domain: 'coding', title: `Solve ${p.title}`, difficulty: p.difficulty, minutes: { Easy: 10, Medium: 20, Hard: 35 }[p.difficulty] || 10, href: `/problems/${p._id}` })),
    ...shared.map((p) => ({ key: `coding:shared:${p._id}`, domain: 'coding', title: `Solve ${p.questionData?.problemDataSnapshot?.title || p.questionText}`, difficulty: p.difficulty || 'Easy', minutes: { Easy: 10, Medium: 20, Hard: 35 }[p.difficulty] || 10, href: `/problems/shared/${p._id}` })),
    ...[...topics.values()].filter((t) => t.hasVideo || t.hasNotes || t.hasQuestions).map((t) => ({ key: `learning:${t.topicId}`, domain: 'learning', title: `Complete ${t.title}`, difficulty: 'Easy', minutes: 10, href: learningResumeItem({}, t).href })),
    ...eligibleAssessments.filter((a) => !a.manuallyCompletedAt && a.startTime && a.endTime && new Date(a.startTime) <= now && new Date(a.endTime) > now).map((a) => ({ key: `assessments:${a._id}`, domain: 'assessments', title: `Complete ${a.title}`, difficulty: 'Easy', minutes: Math.max(10, Number(a.duration) || 20), href: '/student/assessments' })),
    ...pairs.filter((p) => p.status === 'scheduled' && new Date(p.finalConfirmedTime || p.scheduledAt) <= now).map((p) => ({ key: `events:${p._id}`, domain: 'events', title: 'Complete your scheduled peer interview', difficulty: 'Easy', minutes: 20, href: '/student/interview' })),
    ...(Array.isArray(interviewList) ? interviewList : []).filter((p) => ['not_started', 'active'].includes(p.status) && /^[a-zA-Z0-9_-]+$/.test(String(p.id))).map((p) => ({ key: `interviews:${p.id}`, domain: 'interviews', title: `Complete ${p.title}`, difficulty: 'Easy', minutes: 20, href: '/student/ai-interviews' })),
  ];
  const catalogueKeys = new Set(catalogue.map((item) => item.key));
  // Published completed content remains valid evidence even when it is no longer an open task.
  for (const row of eligibleAssessments) catalogueKeys.add(`assessments:${row._id}`);
  for (const row of pairs) catalogueKeys.add(`events:${row._id}`);
  const events = allEvents.filter((event) => event.domain === 'interviews' || catalogueKeys.has(event.contentKey));
  const completed = new Set(events.map((event) => event.contentKey));
  return { events, candidates: catalogue.filter((item) => !completed.has(item.key)), availableKeys: catalogueKeys,
    domainSyncedAt: Object.fromEntries(domains.filter((d) => d !== 'interviews').map((domain) => [domain, now])) };
}
