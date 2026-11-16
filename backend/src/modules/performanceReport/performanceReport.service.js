// Builds performance reports from the data the existing report screens use:
// the assessment live roster (canonical attempt counts) and the Quick Prep
// "View" insights (questService.questInsights). Nothing is counted differently here.
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { buildAssessmentRoster, rosterAssessmentInfo, ROSTER_ROW_LIMIT } from '../../controllers/assessmentLiveReportController.js';
import { authorizeAssessmentReportAccess } from '../../services/assessmentReportAccess.js';
import { ATTEMPT_BUCKETS, attemptBucketOf } from '../../services/assessmentAttemptCounts.js';
import { questInsights } from '../../services/questService.js';
import { studentFeatureQuery } from '../../services/studentFeatureAccess.js';
import { isControlPlane } from '../../platform/deployment.js';
import { currentTenant } from '../../platform/tenantContext.js';
import { University } from '../../platform/models.js';
import { HttpError } from '../../utils/errors.js';
import { STATUS, buildPerformanceReport, formatDateTime } from './performanceReport.model.js';

const EDGE_NOTE = 'Band upper edges are inclusive: exactly 25% is in 0–25%, 25.5% in 26–50%.';
// Quick Prep "not started" rows listed in the student table (the count itself is never capped).
export const NOT_STARTED_ROW_LIMIT = 5000;

// Short qualifiers shown as "Completed (expired)"; a plain submission needs none.
const STATUS_DETAILS = { expired: 'expired', violation: 'violation', incomplete: 'incomplete' };
const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

function windowText(start, end) {
  if (!start && !end) return '';
  if (start && end) return `${formatDateTime(start)} – ${formatDateTime(end)} IST`;
  return start ? `From ${formatDateTime(start)} IST` : `Until ${formatDateTime(end)} IST`;
}

/** Assessment report from a live roster ({ assessment: rosterAssessmentInfo, rows, counts, truncated }). */
export function assessmentPerformanceReport({ assessment, rows = [], counts, truncated = false, university = '', generatedAt = new Date() }) {
  const totalMarks = finite(assessment.totalMarks) ? Number(assessment.totalMarks) : null;
  const students = rows.map((row) => {
    const bucket = attemptBucketOf(row.status);
    const status = bucket === ATTEMPT_BUCKETS.FINISHED ? STATUS.COMPLETED : bucket === ATTEMPT_BUCKETS.IN_PROGRESS ? STATUS.ONGOING : STATUS.NOT_STARTED;
    let statusDetail = status === STATUS.COMPLETED ? STATUS_DETAILS[row.status] || '' : '';
    if (status === STATUS.COMPLETED && row.evaluationStatus === 'processing') statusDetail = 'evaluating';
    if (status === STATUS.COMPLETED && row.evaluationStatus === 'failed') statusDetail = 'evaluation failed';
    const max = finite(row.maxMarks) ? Number(row.maxMarks) : totalMarks;
    return {
      name: row.name || 'Former student', studentId: row.rollNo || '', email: row.email || '',
      group: row.group || '', branch: row.branch || '', semester: row.semester ?? '',
      status, statusDetail,
      // "x of y", never "x/y": spreadsheets read 3/4 as a date.
      scoreText: finite(row.score) ? `${Number(row.score)}${max !== null ? ` of ${max}` : ''}` : '',
      percent: finite(row.percentage) ? Number(row.percentage) : null,
      banded: status === STATUS.COMPLETED && finite(row.percentage),
      startedAt: row.startedAt || null,
      finishedAt: status === STATUS.COMPLETED ? row.submittedAt || null : null,
    };
  });
  const banded = students.filter((student) => student.banded).length;
  const completed = counts?.finished ?? students.filter((student) => student.status === STATUS.COMPLETED).length;
  const ungraded = Math.max(0, completed - banded);
  return buildPerformanceReport({
    kind: 'assessment',
    title: assessment.title,
    university,
    windowLabel: windowText(assessment.startTime, assessment.endTime),
    generatedAt,
    counts: {
      total: counts?.candidates ?? students.length,
      completed,
      ongoing: counts?.inProgress ?? students.filter((student) => student.status === STATUS.ONGOING).length,
    },
    students,
    scoreLabel: 'Marks',
    finishedLabel: 'Submitted',
    meta: [
      ['Total marks', totalMarks ?? '—'],
      ['Pass mark', `${assessment.passPercentage}%`],
      ['Status', assessment.status || '—'],
    ],
    bandNote: `Marks bands, averages and the median are over the ${banded} completed students with a graded score, as % of the assessment's total marks${ungraded ? ` (${ungraded} completed ${ungraded === 1 ? 'attempt is' : 'attempts are'} not graded yet)` : ''}. ${EDGE_NOTE}`,
    notes: truncated ? [`This assessment has more than ${ROSTER_ROW_LIMIT} attempts; the report covers the first ${ROSTER_ROW_LIMIT}, as the live report does.`] : [],
  });
}

/**
 * Quick Prep report from questInsights output plus academic details by student id
 * (`people`) and the audience students who never started (`notStartedPeople`).
 */
export function quickPrepPerformanceReport({ insights, people = new Map(), notStartedPeople = [], notStartedTruncated = false, university = '', generatedAt = new Date() }) {
  const { quest, summary = {}, students: enrolled = [] } = insights;
  const academic = (id, fallback = {}) => {
    const person = people.get(String(id)) || fallback;
    return { email: person.email || '', group: person.group || '', branch: person.branch || '', semester: person.semester ?? '' };
  };
  const students = [
    ...enrolled.map((student) => {
      const percent = student.total > 0 ? Math.round((student.solved / student.total) * 10000) / 100 : 0;
      return {
        name: student.name, studentId: student.rollNumber || '', ...academic(student.id, { semester: student.semester }),
        status: student.completedAt ? STATUS.COMPLETED : STATUS.ONGOING,
        statusDetail: '',
        scoreText: `${student.solved} of ${student.total}`,
        percent,
        banded: true,
        startedAt: student.startedAt || null,
        finishedAt: student.completedAt || null,
      };
    }),
    ...notStartedPeople.map((person) => ({
      name: person.name || '', studentId: person.studentId || '', ...academic(person._id, person),
      status: STATUS.NOT_STARTED, statusDetail: '', scoreText: '', percent: null, banded: false, startedAt: null, finishedAt: null,
    })),
  ];
  const started = Number(summary.started ?? enrolled.length) || 0;
  const audience = finite(summary.audience) ? Number(summary.audience) : null;
  const notes = [];
  if (audience === null) notes.push('The audience size is not known here, so Total counts only the students who started.');
  if (notStartedTruncated) notes.push(`Only the first ${NOT_STARTED_ROW_LIMIT} students who have not started are listed; the counts include all of them.`);
  const windowStart = quest.startsAt || quest.publishedAt || null;
  const windowEnd = quest.endsAt || null;
  return buildPerformanceReport({
    kind: 'quickprep',
    title: quest.title,
    university,
    windowLabel: quest.startsAt || quest.endsAt ? windowText(windowStart, windowEnd)
      : quest.publishedAt ? `Published ${formatDateTime(quest.publishedAt, { withTime: false })} – ongoing` : 'Not published',
    generatedAt,
    counts: { total: Math.max(audience ?? started, started), completed: Number(summary.completed) || 0, ongoing: Number(summary.inProgress) || 0 },
    students,
    scoreLabel: 'Solved',
    finishedLabel: 'Completed',
    meta: [
      ['Questions', quest.questionCount ?? '—'],
      ['Audience', quest.semesters?.length ? `Semester ${quest.semesters.join(', ')}` : 'All semesters'],
    ],
    bandNote: `Marks bands, averages and the median are over the ${started} students who started, as % of the sheet's questions solved. ${EDGE_NOTE}`,
    notes,
  });
}

/** The university the report belongs to (tenant registration name, else the deployment's own name). */
async function universityLabel(user) {
  const tenant = currentTenant();
  if (tenant?.universityId) {
    try {
      const row = await University.findOne({ universityId: tenant.universityId }).select('name').maxTimeMS(3000).lean();
      if (row?.name) return row.name;
    } catch { /* the label is cosmetic */ }
    return tenant.universityId;
  }
  return process.env.PEERPREP_UNIVERSITY_NAME || user?.college || 'PeerPrep';
}

export async function buildAssessmentPerformance(user, assessmentId) {
  const { assessmentId: id } = await authorizeAssessmentReportAccess(user, assessmentId);
  const roster = await buildAssessmentRoster(id);
  if (!roster) throw new HttpError(404, 'Assessment not found.');
  const now = new Date();
  return assessmentPerformanceReport({
    assessment: rosterAssessmentInfo(roster.assessment, roster.passPercentage, now),
    rows: roster.rows, counts: roster.counts, truncated: roster.truncated,
    university: await universityLabel(user), generatedAt: now,
  });
}

// Mirrors questService's audience (full-access, active students of the sheet's semesters).
const audienceMatch = (quest) => ({
  role: 'student', isActive: { $ne: false }, accessScope: { $ne: 'assessment_only' }, ...studentFeatureQuery('quickprep'),
  ...(quest.semesters?.length ? { semester: { $in: quest.semesters.map(Number) } } : {}),
});

export async function buildQuickPrepPerformance(user, questId) {
  if (isControlPlane()) throw new HttpError(409, 'Each university keeps its own students’ progress, so there is no student report on the central platform.');
  const insights = await questInsights(user, questId);
  const enrolledIds = insights.students.map((student) => student.id).filter((id) => mongoose.isValidObjectId(id));
  const [people, waiting] = await Promise.all([
    enrolledIds.length ? User.find({ _id: { $in: enrolledIds } }).select('email group branch semester').maxTimeMS(8000).lean() : [],
    insights.summary.audience
      ? User.find({ ...audienceMatch(insights.quest), _id: { $nin: enrolledIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select('name email studentId group branch semester').sort({ name: 1, _id: 1 }).limit(NOT_STARTED_ROW_LIMIT + 1).maxTimeMS(8000).lean()
      : [],
  ]);
  return quickPrepPerformanceReport({
    insights,
    people: new Map(people.map((person) => [String(person._id), person])),
    notStartedPeople: waiting.slice(0, NOT_STARTED_ROW_LIMIT),
    notStartedTruncated: waiting.length > NOT_STARTED_ROW_LIMIT,
    university: await universityLabel(user),
  });
}
