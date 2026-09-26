import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import { evaluatedAssessmentExpression, evaluatedScoreExpression } from '../services/assessmentReportSummaryService.js';
import { acquireAssessmentReportSlot, createBoundedReportAggregate, assertAssessmentExportSize, MAX_ASSESSMENT_EXPORT_ROWS } from '../services/assessmentReportLimits.js';
import AssessmentAttemptArchive from '../models/AssessmentAttemptArchive.js';
import AssessmentEvent from '../models/AssessmentEvent.js';
import { deleteAssessmentAttemptData } from '../services/assessmentDataCleanupService.js';
import { loadAssessmentDefinition } from '../services/assessmentDefinitionService.js';
import { readPresenceCheckpoint, writePresenceCheckpoint } from '../services/assessmentPresenceService.js';
import { networkPauseCreditFields } from '../services/assessmentHeartbeatPolicy.js';
import { createAssessmentEvidenceUpload, verifyAssessmentEvidenceUpload, normalizeLegacyEvidence, signAssessmentEvidenceRead } from '../services/assessmentEvidenceService.js';
import Problem from '../models/Problem.js';
import Submission from '../models/Submission.js';
import User from '../models/User.js';
import StudentUploadBatch from '../models/StudentUploadBatch.js';
import { createNotification, createNotifications } from '../services/notificationService.js';
import { removeAssessmentQuestionsFromLibrary, syncAssessmentQuestionsToLibrary } from '../services/questionLibraryService.js';
import { logActivity } from './adminActivityController.js';
import { enqueueMailJobs } from '../services/mailQueueService.js';
import { decryptAssessmentPassword, encryptAssessmentPassword } from '../services/assessmentPasswordService.js';
import { getAssessmentInvitationTemplate, renderAssessmentInvitationEmail, sendAssessmentInvitationEmail } from '../utils/mailer.js';
import { validateAssessmentInvitationTemplate } from '../services/assessmentInvitationTemplate.js';
import { reconcileExpiredAssessmentSubmissions } from '../services/assessmentExpiryService.js';
import { hasCoordinatorPermission } from '../services/coordinatorPermissions.js';
import {
  getCodingQuestionScore,
  scoreAssessmentWithTestCases,
} from '../services/assessmentScoringService.js';
import { mergeAssessmentAnswers } from '../services/assessmentAnswerService.js';
import {
  AssessmentWriteError, mutateAssessmentSubmission, finishAssessmentSubmission,
  isTerminalAssessmentSubmission, assertAssessmentSession, assessmentWriteAcknowledgement,
  normalizeAssessmentAnswerChanges, acceptAssessmentBatch, assessmentBatchMatches, assertAssessmentWriteProtocol,
} from '../services/assessmentPersistenceService.js';
import { getAssessmentAttemptDeadline } from '../services/assessmentExpiryPolicy.js';
import crypto from 'crypto';
import {
  AI_PROCTORING_VIOLATION_TYPES,
  applyAiProctoringViolationToSummary,
  getAiProctoringDefaultWeight,
  isAiProctoringViolation,
} from '../modules/assessment/proctoring/proctoring.rules.js';

function buildSimpleChanges(before = {}, after = {}, keys = []) {
  const changes = {};
  keys.forEach((k) => {
    const from = before?.[k] ?? null;
    const to = after?.[k] ?? null;
    const fromStr = from instanceof Date ? from.toISOString() : String(from);
    const toStr = to instanceof Date ? to.toISOString() : String(to);
    if (fromStr !== toStr) changes[k] = { from, to };
  });
  return Object.keys(changes).length ? changes : null;
}

function generateRandomPassword() {
  const length = Math.random() < 0.5 ? 7 : 8;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

async function syncAssessmentCandidateBatch(assessment) {
  const existingBatch = await StudentUploadBatch.findOne({ sourceAssessmentId: assessment._id });
  const assignedIds = (assessment.assignedStudents || []).map(String);
  const hasAssessmentOnlyStudents = assignedIds.length > 0 && Boolean(await User.exists({
    _id: { $in: assignedIds },
    accessScope: 'assessment_only',
  }));
  const shouldKeep = assessment.lifecycleStatus !== 'draft'
    && assessment.targetType === 'selected'
    && (assessment.audienceType === 'assessment_candidates' || hasAssessmentOnlyStudents);

  if (!shouldKeep) {
    if (existingBatch) {
      await User.updateMany({ uploadBatchIds: existingBatch._id }, { $pull: { uploadBatchIds: existingBatch._id } });
      await existingBatch.deleteOne();
    }
    return;
  }

  const studentIds = [...new Set(assignedIds)];
  const previousIds = (existingBatch?.studentIds || []).map(String);
  const batch = await StudentUploadBatch.findOneAndUpdate(
    { sourceAssessmentId: assessment._id },
    {
      $set: {
        name: `Assessment: ${String(assessment.title || 'Untitled assessment').slice(0, 108)}`,
        originalFileName: 'assessment-candidates.csv',
        uploadedBy: assessment.createdBy,
        studentIds,
        recordIds: studentIds,
        // An assessment candidate list groups existing accounts; it does not
        // claim ownership of those accounts for cascade deletion.
        createdRecordIds: [],
        updatedRecordIds: studentIds,
        totalRows: studentIds.length,
        createdCount: 0,
        updatedCount: studentIds.length,
        failedCount: 0,
        sourceType: 'assessment',
        sourceAssessmentId: assessment._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const removedIds = previousIds.filter((id) => !studentIds.includes(id));
  if (removedIds.length) {
    await User.updateMany({ _id: { $in: removedIds } }, { $pull: { uploadBatchIds: batch._id } });
  }
  if (studentIds.length) {
    await User.updateMany({ _id: { $in: studentIds } }, { $addToSet: { uploadBatchIds: batch._id } });
  }
}

function parseTeacherIds(teacheridField) {
  if (!teacheridField) return [];
  return teacheridField
    .toString()
    .split(/[,;|]/)
    .map(id => id.trim())
    .filter(Boolean);
}

function normalizeStudentRow(row) {
  if (!row) return {};
  const map = {};
  for (const [k, v] of Object.entries(row)) {
    map[k.trim().toLowerCase()] = (v ?? '').toString().trim();
  }
  return {
    _id: row._id || row.id,
    name: row.name || map.name,
    email: row.email || map.email,
    studentid: row.studentid || row.studentId || map.studentid || map.student_id || map.sid,
    accessScope: row.accessScope || map.accessscope,
    branch: row.branch || map.branch,
    teacherid: row.teacherid || row.teacherId || map.teacherid || map.teacher_id,
    semester: row.semester || map.semester,
    course: row.course || map.course,
    college: row.college || map.college,
    group: row.group || map.group,
    assessmentSet: row.assessmentSet || row.assessmentset || map.assessmentset || map.set,
    assessmentSetSource: row.assessmentSetSource || row.assessmentsetsource || map.assessmentsetsource,
  };
}

function parseDate(input) {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeStatus(now, assessment) {
  if (assessment.lifecycleStatus === 'draft') return 'Draft';
  if (assessment.manuallyCompletedAt) return 'Completed';
  if (now < assessment.startTime) return 'Upcoming';
  if (now > assessment.endTime) return 'Completed';
  return 'Active';
}

function isAssessmentClosedForStudents(assessment = {}, now = new Date()) {
  if (assessment.manuallyCompletedAt) return true;
  const end = assessment.endTime ? new Date(assessment.endTime) : null;
  return Boolean(end && now > end);
}

function getPausedDurationMs(value) {
  const duration = Number(value || 0);
  return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0;
}

function computeAllowedEnd(assessment, startedAt, pausedDurationMs = 0) {
  const durationMs = (assessment.duration || 0) * 60 * 1000;
  const parsedStartDate = startedAt instanceof Date ? startedAt : new Date(startedAt || Date.now());
  const startDate = Number.isNaN(parsedStartDate.getTime()) ? new Date() : parsedStartDate;
  const byDuration = new Date(startDate.getTime() + durationMs);
  const parsedEndDate = assessment.endTime instanceof Date ? assessment.endTime : new Date(assessment.endTime || byDuration);
  const endDate = Number.isNaN(parsedEndDate.getTime()) ? byDuration : parsedEndDate;
  const baseEnd = byDuration < endDate ? byDuration : endDate;
  return new Date(baseEnd.getTime() + getPausedDurationMs(pausedDurationMs));
}

function getSecurityRecheckTimeoutSec(settings = {}) {
  return clampSettingNumber(settings.securityRecheckTimeoutSec, 180, { min: 30, max: 1800 });
}

function getSecurityRecheckTimeoutMs(settings = {}) {
  return getSecurityRecheckTimeoutSec(settings) * 1000;
}

function getActivePauseElapsedMs(submission = {}, now = new Date()) {
  if (!submission?.pauseStartedAt) return 0;
  const startedAt = new Date(submission.pauseStartedAt).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(current) || current <= startedAt) return 0;
  return current - startedAt;
}

function isSecurityPauseWithinLimit(submission = {}, settings = {}, now = new Date()) {
  if (!submission?.pauseStartedAt || submission.status === 'submitted') return false;
  return getActivePauseElapsedMs(submission, now) <= getSecurityRecheckTimeoutMs(settings);
}

function hasSecurityPauseExpired(submission = {}, settings = {}, now = new Date()) {
  if (!submission?.pauseStartedAt || submission.status === 'submitted') return false;
  return getActivePauseElapsedMs(submission, now) > getSecurityRecheckTimeoutMs(settings);
}

function startSubmissionSecurityPause(submission, now = new Date(), reason = '') {
  if (!submission) return;
  if (reason !== 'tab_switch') return;
  if (!submission.pauseStartedAt) {
    submission.pauseCount = (submission.pauseCount || 0) + 1;
    submission.pauseStartedAt = now;
  }
  submission.securityPauseReason = reason;
  submission.lastPauseAt = now;
}

function finishSubmissionSecurityPause(submission, now = new Date()) {
  if (!submission?.pauseStartedAt) return;
  submission.pausedDurationMs = getPausedDurationMs(submission.pausedDurationMs) + getActivePauseElapsedMs(submission, now);
  submission.pauseStartedAt = undefined;
  submission.securityPauseReason = undefined;
}

function computeEffectiveTimeTakenSec(submission = {}, endTime = new Date()) {
  const startedAt = submission.startedAt ? new Date(submission.startedAt).getTime() : null;
  const endedAt = endTime instanceof Date ? endTime.getTime() : new Date(endTime).getTime();
  if (!startedAt || !Number.isFinite(endedAt) || endedAt < startedAt) return 0;
  const pausedMs = getPausedDurationMs(submission.pausedDurationMs) + getActivePauseElapsedMs(submission, endTime);
  return Math.max(0, Math.floor((endedAt - startedAt - pausedMs) / 1000));
}

function assessmentRouteQuery(id) {
  const value = String(id || '').trim();
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) return { _id: value };
  return { assessmentId: value };
}

async function findAssessmentForStudentRoute(id, { lean = false, select = '' } = {}) {
  const query = assessmentRouteQuery(id);
  if (!query) return null;
  if (lean && !select) return loadAssessmentDefinition(query);
  let request = Assessment.findOne(query);
  if (select) request = request.select(select);
  if (lean) request = request.lean();
  return request;
}

function isStudentAssignedToAssessment(assessment = {}, student = {}) {
  const studentObjectId = String(student?._id || '');
  const studentCode = String(student?.studentId || '').trim().toLowerCase();
  if (assessment.targetType === 'all' && (!Array.isArray(assessment.assignedStudents) || assessment.assignedStudents.length === 0)) {
    return student?.accessScope !== 'assessment_only';
  }
  return (assessment.assignedStudents || []).some((entry) => {
    const rawId = String(entry?._id || entry || '');
    const rawStudentCode = String(entry?.studentId || '').trim().toLowerCase();
    return rawId === studentObjectId || Boolean(studentCode && (rawId.toLowerCase() === studentCode || rawStudentCode === studentCode));
  });
}

function stableDeliveryHash(value = '') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectDeliveryQuestions(pool = [], count = 0, seed = '') {
  if (count <= 0) return [];
  if (count >= pool.length) return [...pool];
  return [...pool]
    .map((item, index) => ({
      item,
      rank: stableDeliveryHash(`${seed}:${item.question?.questionId || item.question?.problemId || index}:${item.sectionIndex}:${item.questionIndex}`),
    }))
    .sort((left, right) => left.rank - right.rank
      || left.item.sectionIndex - right.item.sectionIndex
      || left.item.questionIndex - right.item.questionIndex)
    .slice(0, count)
    .map(({ item }) => item);
}

function stableShuffle(items = [], seed = '', identity = (_item, index) => index) {
  return [...items]
    .map((item, index) => ({
      item,
      index,
      rank: stableDeliveryHash(`${seed}:${identity(item, index)}:${index}`),
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ item }) => item);
}

function shuffleDeliveryQuestionOptions(question = {}, seed = '') {
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length < 2) return question;

  const shuffled = stableShuffle(
    options.map((option, originalIndex) => ({
      option,
      image: question.optionImages?.[originalIndex] ?? null,
      originalIndex,
    })),
    seed,
    (entry) => entry.originalIndex,
  );
  const displayedIndexByOriginal = new Map(
    shuffled.map((entry, displayedIndex) => [entry.originalIndex, displayedIndex]),
  );
  const mapCorrectIndex = (value) => {
    const originalIndex = Number(value);
    return Number.isInteger(originalIndex) && displayedIndexByOriginal.has(originalIndex)
      ? displayedIndexByOriginal.get(originalIndex)
      : undefined;
  };
  const correctOptionIndex = mapCorrectIndex(question.correctOptionIndex);
  const correctOptionIndexes = [...new Set((question.correctOptionIndexes || [])
    .map(mapCorrectIndex)
    .filter(Number.isInteger))]
    .sort((left, right) => left - right);

  return {
    ...question,
    options: shuffled.map((entry) => entry.option),
    optionImages: shuffled.map((entry) => entry.image),
    ...(correctOptionIndex === undefined ? {} : { correctOptionIndex }),
    correctOptionIndexes,
  };
}

function applyServerDeliveryShuffle(sections = [], settings = {}, seed = '') {
  return sections.map((section, sectionIndex) => {
    const sectionSeed = `${seed}:section-${sectionIndex}`;
    let questions = (section.questions || []).map((question, questionIndex) => {
      const questionSeed = `${sectionSeed}:question-${question.questionId || question.problemId || questionIndex}`;
      const shouldShuffleOptions = (settings.shuffleOptions || question.shuffleOptions)
        && (question.type || section.type) === 'mcq';
      return shouldShuffleOptions
        ? shuffleDeliveryQuestionOptions(question, `${questionSeed}:options`)
        : question;
    });

    if (settings.randomShuffle) {
      questions = stableShuffle(
        questions,
        `${sectionSeed}:questions`,
        (question, questionIndex) => question.questionId || question.problemId || questionIndex,
      );
    }
    return { ...section, questions };
  });
}

export function buildDeliverySections(assessment = {}, studentId = '') {
  const source = typeof assessment.toObject === 'function' ? assessment.toObject() : assessment;
  const settings = source.settings || {};
  const assignment = (source.candidateSetAssignments || []).find((entry) => (
    String(entry?.student?._id || entry?.student || '') === String(studentId || '')
  ));
  const assignedSetNumber = Math.max(1, Number(assignment?.setNumber) || 1);
  const selectedSet = settings.questionSetEnabled
    ? (source.questionSets || []).find((entry) => Number(entry?.setNumber) === assignedSetNumber)
    : null;
  const deliverySource = selectedSet
    ? { ...source, sections: selectedSet.sections || [] }
    : source;
  const requirements = (settings.questionSelectionEnabled ? settings.questionRequirements : {}) || {};
  const fallbackDistributionMode = ['random_per_student', 'same_for_all'].includes(settings.questionDistributionMode)
    ? settings.questionDistributionMode
    : 'random_per_student';
  const selectedByType = new Map();
  Object.keys(requirements).forEach((type) => {
    const pool = [];
    (deliverySource.sections || []).forEach((section, sectionIndex) => {
      if (section.type !== type) return;
      (section.questions || []).forEach((question, questionIndex) => pool.push({ sectionIndex, questionIndex, question }));
    });
    const required = Math.min(pool.length, Math.max(0, Number(requirements[type]) || 0));
    const distributionMode = ['random_per_student', 'same_for_all'].includes(settings.questionDistributionModes?.[type])
      ? settings.questionDistributionModes[type]
      : fallbackDistributionMode;
    const distributionKey = distributionMode === 'same_for_all'
      ? 'all-candidates'
      : `student:${studentId || 'anonymous'}`;
    const selected = selectDeliveryQuestions(pool, required, `${source._id || source.assessmentId || 'assessment'}:set-${assignedSetNumber}:${distributionKey}:${type}`);
    selectedByType.set(type, new Set(selected.map((item) => `${item.sectionIndex}:${item.questionIndex}`)));
  });
  const selectedSections = (deliverySource.sections || []).map((section, sectionIndex) => ({
    ...section,
    questions: (section.questions || []).filter((_, questionIndex) => (
      !selectedByType.has(section.type) || selectedByType.get(section.type).has(`${sectionIndex}:${questionIndex}`)
    )),
  })).filter((section) => section.questions.length > 0);
  const deliverySeed = `${source._id || source.assessmentId || 'assessment'}:set-${assignedSetNumber}:student-${studentId || 'anonymous'}`;
  const sections = applyServerDeliveryShuffle(selectedSections, settings, deliverySeed);
  return { sections, assignedSetNumber };
}

function assessmentForSubmission(assessment = {}, submission = {}) {
  const source = typeof assessment.toObject === 'function' ? assessment.toObject() : assessment;
  const stored = submission.deliveryPreparedAt && Array.isArray(submission.deliverySections)
    ? submission.deliverySections
    : buildDeliverySections(assessment, submission.studentId).sections;
  const delivery = applyMarksAndTotals(stored);
  return {
    ...source,
    questionSets: undefined,
    candidateSetAssignments: undefined,
    sections: delivery.sections,
    totalMarks: delivery.totalMarks,
    assessmentType: delivery.assessmentType,
    settings: {
      ...(source.settings || {}),
      questionAttemptRequirements: source.settings?.questionSelectionEnabled
        ? source.settings?.questionAttemptRequirements || {}
        : {},
    },
  };
}

function canManageAssessmentForRequest(assessment = {}, user = {}) {
  if (!assessment || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'coordinator') return user.coordinatorDataScope === 'all' || String(assessment.createdBy || '') === String(user._id || '');
  return false;
}

async function resolveEligibleAssessmentStudents(assessment = {}) {
  const selectedIds = (assessment.assignedStudents || []).map((id) => String(id));
  const query = assessment.targetType === 'all' && selectedIds.length === 0
    ? { role: 'student', accessScope: { $ne: 'assessment_only' } }
    : { _id: { $in: selectedIds }, role: 'student' };
  return User.find(query)
    .select('_id name email studentId accessScope +temporaryPasswordEncrypted course branch college semester group teacherIds phone isActive createdAt')
    .sort({ name: 1, studentId: 1 })
    .lean();
}

function buildCandidateIdentity(student = {}) {
  return {
    name: String(student?.name || '').trim(),
    email: String(student?.email || '').trim(),
    studentId: String(student?.studentId || '').trim(),
  };
}

function getRequiredSecuritySteps(settings = {}, submission = null) {
  const isSecurityRecheck = Boolean(submission?.pauseStartedAt && submission?.startedAt);
  if (isSecurityRecheck) {
    const recheckSteps = [];
    if (settings.cameraMonitoring || settings.aiProctoring?.enabled) recheckSteps.push('camera');
    if (settings.enableFullscreen) recheckSteps.push('fullscreen');
    recheckSteps.push('final');
    return recheckSteps;
  }

  const steps = settings.environmentCheck === false ? [] : ['environment'];
  if (settings.cameraMonitoring || settings.aiProctoring?.enabled) steps.push('camera');
  if (settings.locationTracking !== false) steps.push('location');
  if (settings.enableFullscreen) steps.push('fullscreen');
  steps.push('final');
  return steps;
}

function getCompletedSecuritySteps(submission = {}) {
  const progress = submission.securitySetup || {};
  return ['environment', 'camera', 'fullscreen', 'location', 'final'].filter((step) => Boolean(progress[`${step}At`]));
}

function hasCompletedRequiredSecuritySteps(submission = {}, requiredSteps = []) {
  const completed = new Set(getCompletedSecuritySteps(submission));
  return requiredSteps.every((step) => completed.has(step));
}

function canRecordSecurityStep(step, submission = {}, requiredSteps = []) {
  if (!requiredSteps.includes(step)) return false;
  const completed = new Set(getCompletedSecuritySteps(submission));
  if (completed.has(step)) return true;
  const targetIndex = requiredSteps.indexOf(step);
  if (targetIndex <= 0) return true;
  for (let index = 0; index < targetIndex; index += 1) {
    if (!completed.has(requiredSteps[index])) return false;
  }
  return true;
}

function resetSubmissionSecuritySetup(submission) {
  if (!submission) return;
  submission.securitySetup = {};
  submission.markModified?.('securitySetup');
  submission.securityCompletedAt = undefined;
}

const ASSESSMENT_EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000;
const ACTIVE_SESSION_FRESH_MS = Math.max(30000, Number(process.env.ASSESSMENT_ACTIVE_SESSION_FRESH_MS || 45000));

function sanitizeAssessmentForResponse(assessment) {
  if (!assessment) return assessment;
  const source = typeof assessment.toObject === 'function' ? assessment.toObject() : { ...assessment };
  delete source.passwordHash;
  delete source.passwordEncrypted;
  delete source.shifts;
  delete source.candidateSetAssignments;
  source.settings = normalizeAssessmentSettings(source.settings || {});
  return source;
}

function redactCodingAnswerData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const redacted = { ...value };
  if (Array.isArray(redacted.testCases)) {
    redacted.testCases = redacted.testCases.filter((testCase) => !testCase?.hidden);
  }
  if (redacted.problemData && typeof redacted.problemData === 'object') {
    redacted.problemData = redactCodingAnswerData(redacted.problemData);
  }
  return redacted;
}

export function sanitizeStudentAssessmentForResponse(assessment) {
  const source = sanitizeAssessmentForResponse(assessment);
  if (!source) return source;
  return {
    ...source,
    sections: (source.sections || []).map((section) => ({
      ...section,
      questions: (section.questions || []).map((question) => {
        const redacted = { ...question };
        delete redacted.correctOptionIndex;
        delete redacted.correctOptionIndexes;
        delete redacted.expectedAnswer;
        delete redacted.keywords;
        delete redacted.answerExplanation;
        delete redacted.explanation;
        delete redacted.correctAnswer;
        redacted.coding = redactCodingAnswerData(redacted.coding);
        redacted.problemData = redactCodingAnswerData(redacted.problemData);
        redacted.problemDataSnapshot = redactCodingAnswerData(redacted.problemDataSnapshot);
        return redacted;
      }),
    })),
  };
}

function sanitizeStudentSubmissionForResponse(submission) {
  if (!submission) return submission;
  const source = typeof submission.toObject === 'function' ? submission.toObject() : { ...submission };
  delete source.deliverySections;
  delete source.pendingWork;
  delete source.proctoringSnapshots;
  delete source.monitoringEvents;
  Object.assign(source, assessmentWriteAcknowledgement(submission));
  return source;
}

function mapToPlainObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  return {};
}

async function hydrateAssessmentCodingRuntime(assessment) {
  if (!assessment) return assessment;
  const source = typeof assessment.toObject === 'function' ? assessment.toObject() : { ...assessment };
  const sections = Array.isArray(source.sections) ? source.sections : [];
  const problemIds = Array.from(new Set(
    sections.flatMap((section) => (section.questions || []).map((question) => (
      question?.problemId
      || question?.coding?.problemId
      || question?.problemDataSnapshot?._id
      || question?.coding?.problemData?._id
      || null
    )))
      .filter((problemId) => mongoose.Types.ObjectId.isValid(problemId))
      .map(String),
  ));

  if (!problemIds.length) return source;

  const problems = await Problem.find({ _id: { $in: problemIds } })
    .select('_id supportedLanguages codeTemplates category sqlConfig')
    .lean();
  const problemsById = new Map(problems.map((problem) => [String(problem._id), problem]));

  return {
    ...source,
    sections: sections.map((section) => ({
      ...section,
      questions: (section.questions || []).map((question) => {
        if ((question?.type || section.type) !== 'coding') return question;
        const problemId = question?.problemId
          || question?.coding?.problemId
          || question?.problemDataSnapshot?._id
          || question?.coding?.problemData?._id;
        const liveProblem = problemsById.get(String(problemId || ''));
        if (!liveProblem) return question;

        const supportedLanguages = Array.isArray(liveProblem.supportedLanguages)
          ? liveProblem.supportedLanguages.filter(Boolean)
          : [];
        const codeTemplates = mapToPlainObject(liveProblem.codeTemplates);
        const existingSnapshot = question.problemDataSnapshot
          || question?.coding?.problemData
          || question?.coding
          || {};
        const problemDataSnapshot = {
          ...existingSnapshot,
          _id: liveProblem._id,
          supportedLanguages,
          codeTemplates,
          category: liveProblem.category || existingSnapshot.category || 'DSA',
          sqlConfig: liveProblem.sqlConfig || existingSnapshot.sqlConfig,
        };

        return {
          ...question,
          problemId: liveProblem._id,
          problemDataSnapshot,
          coding: question.coding ? {
            ...question.coding,
            problemId: liveProblem._id,
            supportedLanguages,
            starterCode: supportedLanguages.map((language) => ({
              language,
              code: codeTemplates[language] || '',
            })),
            problemData: problemDataSnapshot,
          } : question.coding,
        };
      }),
    })),
  };
}

function clampSettingNumber(value, fallback, { min = null, max = null } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  let next = parsed;
  if (min !== null) next = Math.max(min, next);
  if (max !== null) next = Math.min(max, next);
  return next;
}

function normalizeAiProctoringSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    enabled: Boolean(source.enabled),
    detectMobile: source.detectMobile !== false,
    detectMultiplePersons: source.detectMultiplePersons !== false,
    detectNoFace: source.detectNoFace !== false,
    detectFaceOutOfFrame: source.detectFaceOutOfFrame !== false,
    faceOutOfFrameGraceSec: clampSettingNumber(source.faceOutOfFrameGraceSec, 10, { min: 3, max: 60 }),
    detectLookingAway: source.detectLookingAway !== false,
    detectionIntervalMs: clampSettingNumber(source.detectionIntervalMs, 500, { min: 500, max: 5000 }),
    ignoreLimit: clampSettingNumber(source.ignoreLimit, 5, { min: 0, max: 50 }),
    violationCooldownSec: clampSettingNumber(source.violationCooldownSec, 20, { min: 5, max: 120 }),
    criticalAutoFlag: source.criticalAutoFlag !== false,
  };
}

export function normalizeAssessmentSettings(settings = {}) {
  const plainSettings = settings && typeof settings?.toObject === 'function'
    ? settings.toObject({ getters: false, virtuals: false })
    : settings;
  const source = plainSettings && typeof plainSettings === 'object' ? { ...plainSettings } : {};
  delete source.negativeMarking;
  delete source.negativeMarkValue;
  delete source.negativeCoding;

  return {
    environmentCheck: source.environmentCheck !== false,
    enableFullscreen: Boolean(source.enableFullscreen),
    fullscreenTimeoutSec: clampSettingNumber(source.fullscreenTimeoutSec, 15, { min: 0, max: 120 }),
    fullscreenAction: actionSetting(source, ['fullscreenAction'], 'pause'),
    tabSwitchDetection: Boolean(source.tabSwitchDetection),
    tabSwitchLimit: clampSettingNumber(source.tabSwitchLimit, 3, { min: 1, max: 50 }),
    tabSwitchWarnAt: clampSettingNumber(source.tabSwitchWarnAt, 1, { min: 1, max: 50 }),
    tabSwitchAction: actionSetting(source, ['tabSwitchAction'], 'warn'),
    disableCopyPaste: Boolean(source.disableCopyPaste),
    blockRightClick: source.blockRightClick !== false,
    copyPasteAction: actionSetting(source, ['copyPasteAction'], 'warn'),
    blockScreenshots: Boolean(source.blockScreenshots),
    questionWatermark: Boolean(source.questionWatermark),
    watermarkOpacity: clampSettingNumber(source.watermarkOpacity, 12, { min: 5, max: 40 }),
    watermarkColor: String(source.watermarkColor || '#cbd5e1'),
    watermarkAngle: clampSettingNumber(source.watermarkAngle, -45, { min: -75, max: 75 }),
    watermarkSpacing: clampSettingNumber(source.watermarkSpacing, 220, { min: 120, max: 360 }),
    watermarkFontSize: clampSettingNumber(source.watermarkFontSize, 24, { min: 14, max: 42 }),
    watermarkTextType: String(source.watermarkTextType || 'platform'),
    watermarkCustomText: String(source.watermarkCustomText || '').trim(),
    randomShuffle: Boolean(source.randomShuffle),
    shuffleOptions: Boolean(source.shuffleOptions),
    questionSetEnabled: Boolean(source.questionSetEnabled),
    questionSetCount: Math.min(8, Math.max(1, Number(source.questionSetCount) || 1)),
    automaticSetAssignment: source.automaticSetAssignment !== false,
    setAssignmentStrategy: 'modulo',
    setAllocationSortBy: source.setAllocationSortBy === 'name' ? 'name' : 'student_id',
    setAllocationSortDirection: source.setAllocationSortDirection === 'desc' ? 'desc' : 'asc',
    setStartingNumber: Math.min(8, Math.max(1, Number(source.setStartingNumber) || 1)),
    candidateCredentialMode: source.candidateCredentialMode === 'student_id' ? 'student_id' : 'secure_generated',
    cameraMonitoring: Boolean(source.cameraMonitoring),
    cameraSnapshotInterval: clampSettingNumber(source.cameraSnapshotInterval, 120, { min: 15, max: 600 }),
    cameraFaceAlert: Boolean(source.cameraFaceAlert),
    cameraAction: actionSetting(source, ['cameraAction'], 'warn'),
    audioMonitoring: Boolean(source.audioMonitoring),
    audioNoiseThreshold: clampSettingNumber(source.audioNoiseThreshold, 65, { min: 10, max: 100 }),
    audioEventCooldownSec: clampSettingNumber(source.audioEventCooldownSec, 20, { min: 5, max: 120 }),
    autoSubmitOnEnd: source.autoSubmitOnEnd !== false,
    autoSubmitWarnMin: clampSettingNumber(source.autoSubmitWarnMin, 5, { min: 1, max: 60 }),
    securityRecheckTimeoutSec: getSecurityRecheckTimeoutSec(source),
    preventMultipleTabs: Boolean(source.preventMultipleTabs),
    duplicateTabAction: actionSetting(source, ['duplicateTabAction'], 'pause'),
    restrictNavigation: Boolean(source.restrictNavigation),
    allowSectionReview: source.allowSectionReview !== false,
    sectionWiseLock: Boolean(source.sectionWiseLock),
    sectionGraceSec: clampSettingNumber(source.sectionGraceSec, 10, { min: 0, max: 300 }),
    idleDetection: Boolean(source.idleDetection),
    idleThresholdMin: clampSettingNumber(source.idleThresholdMin, 5, { min: 1, max: 60 }),
    idleAction: actionSetting(source, ['idleAction'], 'warn'),
    showResultsAfterSubmit: Boolean(source.showResultsAfterSubmit),
    showCorrectAnswers: Boolean(source.showCorrectAnswers),
    showSectionBreakdown: Boolean(source.showSectionBreakdown),
    showPercentile: Boolean(source.showPercentile),
    resultDelayHours: clampSettingNumber(source.resultDelayHours, 24, { min: 0, max: 24 * 30 }),
    allowRetake: Boolean(source.allowRetake),
    retakeGapHours: clampSettingNumber(source.retakeGapHours, 0, { min: 0, max: 24 * 30 }),
    questionSelectionEnabled: Boolean(source.questionSelectionEnabled),
    questionRequirements: Object.fromEntries(['mcq', 'one_line', 'short', 'coding']
      .filter((type) => Object.prototype.hasOwnProperty.call(source.questionRequirements || {}, type))
      .map((type) => [type, Math.max(0, Number(source.questionRequirements[type]) || 0)])),
    questionAttemptRequirements: Object.fromEntries(['mcq', 'one_line', 'short', 'coding']
      .filter((type) => Object.prototype.hasOwnProperty.call(source.questionAttemptRequirements || {}, type))
      .map((type) => [type, Math.max(0, Number(source.questionAttemptRequirements[type]) || 0)])),
    questionDistributionMode: ['random_per_student', 'same_for_all'].includes(source.questionDistributionMode)
      ? source.questionDistributionMode
      : 'random_per_student',
    questionDistributionModes: Object.fromEntries(['mcq', 'one_line', 'short', 'coding']
      .filter((type) => Object.prototype.hasOwnProperty.call(source.questionDistributionModes || {}, type))
      .map((type) => [
        type,
        ['random_per_student', 'same_for_all'].includes(source.questionDistributionModes[type])
          ? source.questionDistributionModes[type]
          : 'random_per_student',
      ])),
    perMcqTimingEnabled: Boolean(source.perMcqTimingEnabled),
    perMcqTimeSec: clampSettingNumber(source.perMcqTimeSec, 60, { min: 10, max: 3600 }),
    locationTracking: source.locationTracking !== false,
    autoSubmitOnViolation: Boolean(source.autoSubmitOnViolation),
    maxWarnings: clampSettingNumber(source.maxWarnings, 0, { min: 0, max: 100 }),
    violationWarnScore: clampSettingNumber(source.violationWarnScore, 0, { min: 0, max: 1000 }),
    violationPauseScore: clampSettingNumber(source.violationPauseScore, 0, { min: 0, max: 1000 }),
    violationAutoSubmitScore: clampSettingNumber(source.violationAutoSubmitScore, 0, { min: 0, max: 1000 }),
    violationWeights: source.violationWeights && typeof source.violationWeights === 'object' ? source.violationWeights : {},
    aiProctoring: normalizeAiProctoringSettings(source.aiProctoring),
  };
}

async function applyAssessmentPassword(assessment, { passwordEnabled, password } = {}) {
  if (passwordEnabled === undefined && password === undefined) return;

  if (passwordEnabled !== undefined) {
    assessment.passwordEnabled = Boolean(passwordEnabled);
    if (!assessment.passwordEnabled) {
      assessment.passwordHash = undefined;
      assessment.passwordEncrypted = undefined;
      return;
    }
  }

  if (!assessment.passwordEnabled) return;

  const nextPassword = typeof password === 'string' ? password.trim() : '';
  if (nextPassword) {
    assessment.passwordHash = await User.hashPassword(nextPassword);
    assessment.passwordEncrypted = encryptAssessmentPassword(nextPassword);
  }
}

async function ensureAssessmentPasswordUnlocked(assessment, submission, password) {
  if (!assessment.passwordEnabled) return { ok: true };
  if (!assessment.passwordHash) return { ok: false, status: 403, error: 'Assessment password is not set. Please contact your admin.' };
  if (submission?.passwordVerifiedAt) return { ok: true };

  const providedPassword = typeof password === 'string' ? password : '';
  if (!providedPassword) return { ok: false, status: 401, error: 'Assessment password is required.' };

  const matched = await bcrypt.compare(providedPassword, assessment.passwordHash);
  if (!matched) return { ok: false, status: 401, error: 'Incorrect assessment password.' };
  return { ok: true };
}

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function getCodingAnswerVerdict(answer = {}) {
  const resultStatus = String(answer?.executionResult?.status || '').trim();
  const verdict = String(answer?.executionVerdict || resultStatus || '').trim().toUpperCase();
  if (verdict === 'AC' || verdict === 'ACCEPTED' || resultStatus === 'Accepted') return 'AC';
  if (['WA', 'WRONG ANSWER'].includes(verdict)) return 'WA';
  if (['TLE', 'TIME LIMIT EXCEEDED'].includes(verdict)) return 'TLE';
  if (['RE', 'RUNTIME ERROR'].includes(verdict)) return 'RE';
  if (['CE', 'COMPILATION ERROR'].includes(verdict)) return 'CE';
  if (verdict === 'FAILED') return 'FAILED';
  return verdict || 'PENDING';
}

function evaluateQuestionResponse(question = {}, section = {}, answer = null) {
  const type = question.type || section.type;

  if (type === 'mcq') {
    if (!hasMeaningfulValue(answer?.answer)) return 'skipped';
    const expected = [...new Set(
      (question.allowMultipleAnswers ? question.correctOptionIndexes : [question.correctOptionIndex])
        .filter((value) => value !== null && value !== undefined)
        .map(Number)
        .filter(Number.isInteger),
    )].sort((a, b) => a - b);
    const actual = [...new Set(
      (Array.isArray(answer.answer) ? answer.answer : [answer.answer])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isInteger),
    )].sort((a, b) => a - b);
    if (expected.length === actual.length && expected.every((value, index) => value === actual[index])) return 'correct';
    if (question.allowMultipleAnswers && question.partialScoring && actual.some((value) => expected.includes(value))) return 'partial';
    return 'wrong';
  }

  if (type === 'short' || type === 'one_line') {
    const actual = String(answer?.answer || '').trim().toLowerCase();
    if (!actual) return 'skipped';

    const expected = String(question.expectedAnswer || '').trim().toLowerCase();
    if (expected && actual === expected) return 'correct';

    if (Array.isArray(question.keywords) && question.keywords.length > 0) {
      const matched = question.keywords.every((keyword) => actual.includes(String(keyword).toLowerCase()));
      return matched ? 'correct' : 'wrong';
    }

    return expected ? 'wrong' : 'pending';
  }

  if (type === 'coding') {
    const hasCode = String(answer?.code || '').trim().length > 0;
    if (!hasCode) return 'skipped';

    const verdict = getCodingAnswerVerdict(answer);
    const status = String(answer?.executionStatus || '').trim().toLowerCase();
    const codingScore = getCodingQuestionScore(question, answer, section);
    if (codingScore.fullyCorrect) return 'correct';
    if (codingScore.hasEvaluation && codingScore.earnedMarks > 0) return 'partial';
    if (['WA', 'TLE', 'RE', 'CE', 'FAILED'].includes(verdict)) return 'wrong';
    if (status === 'completed' || status === 'failed') return 'wrong';
    return 'pending';
  }

  if (!hasMeaningfulValue(answer?.answer)) return 'skipped';
  return 'pending';
}

function buildAssessmentAttemptAnalytics(assessment = {}, submission = {}) {
  const answerMap = new Map();
  (submission.answers || []).forEach((answer) => {
    answerMap.set(`${answer.sectionIndex}-${answer.questionIndex}`, answer);
  });

  const summary = {
    totalQuestions: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    partialAnswers: 0,
    skippedQuestions: 0,
    pendingEvaluationQuestions: 0,
    sectionBreakdown: [],
  };

  (assessment.sections || []).forEach((section, sectionIndex) => {
    const sectionStats = {
      sectionName: section.sectionName || `Section ${sectionIndex + 1}`,
      type: section.type || 'mixed',
      totalQuestions: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      partialAnswers: 0,
      skippedQuestions: 0,
      pendingEvaluationQuestions: 0,
    };

    (section.questions || []).forEach((question, questionIndex) => {
      sectionStats.totalQuestions += 1;
      summary.totalQuestions += 1;

      const result = evaluateQuestionResponse(
        question,
        section,
        answerMap.get(`${sectionIndex}-${questionIndex}`),
      );

      if (result === 'correct') {
        sectionStats.correctAnswers += 1;
        summary.correctAnswers += 1;
      } else if (result === 'wrong') {
        sectionStats.wrongAnswers += 1;
        summary.wrongAnswers += 1;
      } else if (result === 'partial') {
        sectionStats.partialAnswers += 1;
        summary.partialAnswers += 1;
      } else if (result === 'pending') {
        sectionStats.pendingEvaluationQuestions += 1;
        summary.pendingEvaluationQuestions += 1;
      } else {
        sectionStats.skippedQuestions += 1;
        summary.skippedQuestions += 1;
      }
    });

    summary.sectionBreakdown.push(sectionStats);
  });

  return summary;
}

function buildSectionBreakdownWithScores(assessment = {}, submission = {}) {
  const answerMap = new Map();
  (submission.answers || []).forEach((answer) => {
    answerMap.set(`${answer.sectionIndex}-${answer.questionIndex}`, answer);
  });

  return (assessment.sections || []).map((section, sectionIndex) => {
    const questions = Array.isArray(section.questions) ? section.questions : [];
    let score = 0;
    let totalMarks = 0;
    let correctAnswers = 0;
    let wrongAnswers = 0;
    let partialAnswers = 0;
    let skippedQuestions = 0;
    let pendingEvaluationQuestions = 0;

    questions.forEach((question, questionIndex) => {
      const marks = Number(question?.points ?? question?.marks ?? section.marksPerQuestion ?? 1);
      totalMarks += marks;
      const result = evaluateQuestionResponse(question, section, answerMap.get(`${sectionIndex}-${questionIndex}`));
      if (result === 'correct') {
        score += marks;
        correctAnswers += 1;
      } else if (result === 'partial') {
        const codingScore = getCodingQuestionScore(question, answerMap.get(`${sectionIndex}-${questionIndex}`), section);
        score += codingScore.earnedMarks;
        partialAnswers += 1;
      } else if (result === 'wrong') {
        wrongAnswers += 1;
      } else if (result === 'pending') {
        pendingEvaluationQuestions += 1;
      } else {
        skippedQuestions += 1;
      }
    });

    return {
      sectionIndex,
      sectionName: section.sectionName || `Section ${sectionIndex + 1}`,
      type: section.type || 'mixed',
      totalQuestions: questions.length,
      totalMarks,
      score,
      correctAnswers,
      wrongAnswers,
      partialAnswers,
      skippedQuestions,
      pendingEvaluationQuestions,
    };
  });
}

function getQuestionExplanation(question = {}) {
  if (question?.explanation) return question.explanation;
  const visibleCases = question?.coding?.testCases || question?.problemDataSnapshot?.testCases || [];
  const explainedCase = Array.isArray(visibleCases)
    ? visibleCases.find((testCase) => testCase?.explanation && !testCase?.hidden)
    : null;
  return explainedCase?.explanation || '';
}

function getAssessmentQuestionProblemId(question = {}) {
  return question?.problemId
    || question?.coding?.problemId
    || question?.problemDataSnapshot?._id
    || question?.coding?.problemData?._id
    || question?.problemData?._id
    || null;
}

async function reconcileAssessmentCodingAnswers(assessment = {}, submission = {}) {
  // Modern attempts are graded only by their versioned evaluation workers.
  // Legacy report reconstruction below is read-only and never rewrites answers.
  if (submission.schemaVersion >= 2 || submission.evaluationVersion > 0 || submission.pendingWork?.version) return submission;
  const codingQuestions = [];
  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section.questions || []).forEach((question, questionIndex) => {
      if ((question?.type || section?.type) !== 'coding') return;
      const problemId = getAssessmentQuestionProblemId(question);
      if (problemId) codingQuestions.push({ sectionIndex, questionIndex, problemId: String(problemId) });
    });
  });

  if (!codingQuestions.length || !submission?.studentId || !assessment?._id) return submission;

  const verifiedSubmissions = await Submission.find({
    assessmentId: assessment._id,
    user: submission.studentId,
    problem: { $in: codingQuestions.map((item) => item.problemId) },
    mode: 'submit',
    status: { $in: ['AC', 'WA', 'TLE', 'RE', 'CE'] },
  }).sort({ createdAt: -1, completedAt: -1 }).limit(1000).maxTimeMS(2000).lean();

  const latestByProblem = new Map();
  verifiedSubmissions.forEach((entry) => {
    const key = String(entry.problem);
    if (!latestByProblem.has(key)) latestByProblem.set(key, entry);
  });

  const answers = (submission.answers || []).map((answer) => ({ ...answer }));
  let changed = false;

  codingQuestions.forEach(({ sectionIndex, questionIndex, problemId }) => {
    const verified = latestByProblem.get(problemId);
    if (!verified) return;

    const answerIndex = answers.findIndex((answer) => (
      Number(answer.sectionIndex) === sectionIndex && Number(answer.questionIndex) === questionIndex
    ));
    if (answerIndex < 0) return;

    const answer = answers[answerIndex];
    if (String(answer.code || '') !== String(verified.sourceCode || '')
      || String(answer.language || '') !== String(verified.language || '')) return;
    if (answer?.submissionId && String(answer.submissionId) !== String(verified._id)) return;
    if (!answer?.submissionId && answer?.jobId && String(answer.jobId) !== String(verified.jobId || '')) return;
    const currentVerdict = getCodingAnswerVerdict(answer);
    const verifiedAt = new Date(verified.completedAt || verified.updatedAt || verified.createdAt || 0).getTime();
    const evaluatedAt = new Date(answer.lastEvaluatedAt || 0).getTime();
    const shouldReconcile = ['PENDING', ''].includes(currentVerdict) || verifiedAt > evaluatedAt;
    if (!shouldReconcile) return;

    answers[answerIndex] = {
      ...answer,
      language: verified.language || answer.language,
      code: verified.sourceCode || answer.code,
      executionStatus: 'completed',
      executionVerdict: verified.status,
      executionResult: {
        status: verified.status === 'AC' ? 'Accepted' : verified.status,
        passed: Number(verified.passedTestCases || 0),
        total: Number(verified.totalTestCases || 0),
        passedTestCaseMarks: Number(verified.passedTestCaseMarks || 0),
        totalTestCaseMarks: Number(verified.totalTestCaseMarks || 0),
        time: Number(((verified.executionTimeMs || 0) / 1000).toFixed(3)),
        memory: Number(verified.memoryUsedKb || 0),
        error: verified.compileOutput || verified.stderr || '',
        failedTestCase: verified.failedCase || undefined,
      },
      submissionId: verified._id,
      lastEvaluatedAt: verified.completedAt || verified.updatedAt || verified.createdAt,
    };
    changed = true;
  });

  if (!changed) return submission;

  const scoring = scoreAssessment(assessment, answers);
  return { ...submission, answers, ...scoring };
}

function buildStudentResultPermissions(assessment = {}, submission = {}, now = new Date()) {
  const settings = normalizeAssessmentSettings(assessment.settings || {});
  const submittedAt = submission?.submittedAt ? new Date(submission.submittedAt) : null;
  const delayHours = Number(settings.resultDelayHours || 0);
  const immediateRelease = Boolean(settings.showResultsAfterSubmit);
  const delayedReleaseAt = !immediateRelease && submittedAt && delayHours > 0
    ? new Date(submittedAt.getTime() + delayHours * 60 * 60 * 1000)
    : null;
  const resultReleased = immediateRelease
    || Boolean(delayedReleaseAt && delayedReleaseAt.getTime() <= now.getTime());

  return {
    resultReleased,
    releaseAt: delayedReleaseAt,
    canViewScore: resultReleased,
    canViewPercentage: resultReleased,
    canViewQuestionReview: resultReleased,
    canViewStudentAnswers: resultReleased,
    canViewCorrectAnswers: resultReleased && Boolean(settings.showCorrectAnswers),
    canViewExplanations: resultReleased && Boolean(settings.showCorrectAnswers),
    canViewSectionAnalytics: resultReleased && Boolean(settings.showSectionBreakdown),
    canViewTimeAnalysis: resultReleased,
    canViewRank: resultReleased && Boolean(settings.showPercentile),
    canViewLeaderboard: resultReleased && Boolean(settings.showPercentile),
    hasNegativeMarking: (assessment.sections || []).some((section) => (
      Number(section?.negativeMarksPerQuestion || 0) > 0
      || (section.questions || []).some((question) => Number(question?.negativePoints || 0) > 0)
    )),
  };
}

function buildQuestionWiseReport(assessment = {}, submission = {}, permissions = {
  canViewScore: true,
  canViewStudentAnswers: true,
  canViewCorrectAnswers: true,
  canViewExplanations: true,
}) {
  const answerMap = new Map();
  (submission.answers || []).forEach((answer) => {
    answerMap.set(`${answer.sectionIndex}-${answer.questionIndex}`, answer);
  });

  const rows = [];
  (assessment.sections || []).forEach((section, sectionIndex) => {
    (section.questions || []).forEach((question, questionIndex) => {
      const answer = answerMap.get(`${sectionIndex}-${questionIndex}`);
      const result = evaluateQuestionResponse(question, section, answer);
      const marks = Number(question?.points ?? question?.marks ?? section.marksPerQuestion ?? 1);
      const negativeMarks = Number(question?.negativePoints ?? section?.negativeMarksPerQuestion ?? 0);
      const codingScore = (question?.type || section?.type) === 'coding'
        ? getCodingQuestionScore(question, answer, section)
        : null;
      const selectedIndex = answer?.answer !== undefined && answer?.answer !== null ? Number(answer.answer) : null;
      const correctIndex = question?.correctOptionIndex !== undefined && question?.correctOptionIndex !== null
        ? Number(question.correctOptionIndex)
        : null;
      const row = {
        sectionIndex,
        questionIndex,
        sectionName: section.sectionName || `Section ${sectionIndex + 1}`,
        questionText: question?.questionText || question?.problemDataSnapshot?.title || question?.coding?.problemData?.title || `Question ${questionIndex + 1}`,
        difficulty: question?.difficulty || question?.problemDataSnapshot?.difficulty || question?.coding?.problemData?.difficulty || '',
        type: question?.type || section?.type || 'mcq',
        timeSpentSec: 0,
        status: result === 'wrong' ? 'incorrect' : result,
        isCorrect: permissions.canViewScore ? result === 'correct' : null,
        isSkipped: result === 'skipped',
        marksObtained: permissions.canViewScore
          ? (codingScore
            ? (codingScore.earnedMarks || (result === 'wrong' && codingScore.hasEvaluation ? -negativeMarks : 0))
            : (result === 'correct' ? marks : result === 'wrong' ? -negativeMarks : 0))
          : null,
        maxMarks: permissions.canViewScore ? marks : null,
        negativeMarks: permissions.canViewScore && negativeMarks > 0 ? negativeMarks : null,
        options: Array.isArray(question?.options) ? question.options : [],
      };
      if (permissions.canViewStudentAnswers) {
        row.studentAnswer = answer?.answer ?? answer?.code ?? '';
        row.selectedOptionIndex = Number.isFinite(selectedIndex) ? selectedIndex : null;
        if ((question?.type || section?.type) === 'coding') {
          const executionResult = answer?.executionResult || {};
          row.language = answer?.language || '';
          row.sourceCode = answer?.code || '';
          row.executionStatus = answer?.executionStatus || '';
          row.executionVerdict = getCodingAnswerVerdict(answer);
          row.lastEvaluatedAt = answer?.lastEvaluatedAt || null;
          row.testSummary = {
            passed: Number(executionResult.passed ?? executionResult.passedTestCases ?? 0),
            total: Number(executionResult.total ?? executionResult.totalTestCases ?? 0),
            passedMarks: Number(executionResult.passedTestCaseMarks ?? 0),
            totalMarks: Number(executionResult.totalTestCaseMarks ?? 0),
            marksObtained: permissions.canViewScore ? Number(codingScore?.earnedMarks || 0) : null,
            questionMarks: permissions.canViewScore ? marks : null,
            time: Number(executionResult.time ?? 0),
            memory: Number(executionResult.memory ?? executionResult.memoryUsedKb ?? 0),
            error: executionResult.error || executionResult.compileOutput || executionResult.stderr || '',
            failedTestCase: executionResult.failedTestCase || executionResult.failedCase || null,
          };
        }
      }
      if (permissions.canViewCorrectAnswers) {
        row.correctAnswer = question?.expectedAnswer || (Number.isFinite(correctIndex) ? question.options?.[correctIndex] : '');
        row.correctOptionIndex = Number.isFinite(correctIndex) ? correctIndex : null;
      }
      if (permissions.canViewExplanations) {
        row.explanation = getQuestionExplanation(question);
      }
      rows.push(row);
    });
  });
  return rows;
}

function parseUserAgentDetails(userAgent = '') {
  const ua = String(userAgent || '');
  let browser = 'Unknown';
  let os = 'Unknown';

  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) browser = 'Safari';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';

  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { browser, os };
}

function stringifyLocation(location = null) {
  if (!location || typeof location !== 'object') return '';
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  const parts = [];
  if (Number.isFinite(latitude)) parts.push(`Lat ${latitude.toFixed(4)}`);
  if (Number.isFinite(longitude)) parts.push(`Lng ${longitude.toFixed(4)}`);
  if (Number.isFinite(accuracy)) parts.push(`±${Math.round(accuracy)}m`);
  return parts.join(', ');
}

function stringifySecurityHeartbeat(heartbeat = {}) {
  if (!heartbeat || typeof heartbeat !== 'object') return '';
  return Object.entries(heartbeat)
    .map(([key, value]) => `${key}:${value ? 'ok' : 'flagged'}`)
    .join(', ');
}

function buildProctoringFlags(submission = {}) {
  const flags = [];
  if (submission.tabSwitches) flags.push(`Tab switches: ${submission.tabSwitches}`);
  if (submission.fullscreenExits) flags.push(`Fullscreen exits: ${submission.fullscreenExits}`);
  if (submission.cameraFlags) flags.push(`Camera flags: ${submission.cameraFlags}`);
  if (submission.copyPasteCount) flags.push(`Copy/Paste blocks: ${submission.copyPasteCount}`);
  if (submission.pauseCount) flags.push(`Pause events: ${submission.pauseCount}`);
  return flags.join(' | ');
}

function buildMonitoringTimeline(submission = {}) {
  const normalizeEvent = (event = {}, source = 'monitoring') => ({
    eventId: event.eventId || String(event._id || ''),
    type: event.type || event.eventType || event.kind || 'activity',
    message: event.message || event.reason || event.label || 'Monitoring event recorded.',
    at: event.at || event.capturedAt || event.timestamp || event.createdAt || event.time || null,
    severity: event.severity || event.level || event.meta?.severity || 'medium',
    source,
    meta: { ...(event.meta || event.details || {}), ...(event.evidenceId ? { evidenceId: event.evidenceId } : {}) },
  });

  const events = [
    ...(Array.isArray(submission.violationLog) ? submission.violationLog.map((event) => normalizeEvent(event, 'violation')) : []),
    ...(Array.isArray(submission.violations) ? submission.violations.map((event) => normalizeEvent(event, 'violation')) : []),
    ...(Array.isArray(submission.monitoringEvents) ? submission.monitoringEvents.map((event) => normalizeEvent(event, 'monitoring')) : []),
    ...(Array.isArray(submission.proctoringSnapshots) ? submission.proctoringSnapshots.map((event) => normalizeEvent(event, 'snapshot')) : []),
  ].filter((event) => event.at);

  const seen = new Set();
  return events.filter((event) => {
    if (!event.eventId) return true;
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  }).sort((a, b) => new Date(a.at) - new Date(b.at));
}

const AI_PROCTORING_SUMMARY_DEFAULTS = Object.freeze({
  totalViolations: 0,
  noFace: 0,
  faceOutOfFrame: 0,
  multipleFaces: 0,
  multiplePersons: 0,
  mobileDetected: 0,
  lookingAway: 0,
  cameraBlocked: 0,
  riskLevel: 'clean',
  lastViolationAt: null,
});

function normalizeAiProctoringSummaryForReport(summary = {}) {
  const source = summary && typeof summary === 'object' ? summary : {};
  const numberValue = (key) => Math.max(0, Number(source[key] || 0));
  const riskLevel = ['clean', 'low', 'medium', 'high', 'critical'].includes(source.riskLevel)
    ? source.riskLevel
    : AI_PROCTORING_SUMMARY_DEFAULTS.riskLevel;

  return {
    totalViolations: numberValue('totalViolations'),
    noFace: numberValue('noFace'),
    faceOutOfFrame: numberValue('faceOutOfFrame'),
    multipleFaces: numberValue('multipleFaces'),
    multiplePersons: numberValue('multiplePersons'),
    mobileDetected: numberValue('mobileDetected'),
    lookingAway: numberValue('lookingAway'),
    cameraBlocked: numberValue('cameraBlocked'),
    riskLevel,
    lastViolationAt: source.lastViolationAt || null,
  };
}

function getAiViolationLogEntries(violationLog = []) {
  if (!Array.isArray(violationLog)) return [];
  return violationLog.filter((entry) => isAiProctoringViolation(entry?.type));
}

function buildAssessmentWindowMatch(windowName, now = new Date()) {
  const normalized = String(windowName || 'all').toLowerCase();
  if (normalized === 'current' || normalized === 'active') {
    return {
      'assessment.startTime': { $lte: now },
      'assessment.endTime': { $gte: now },
    };
  }
  if (normalized === 'upcoming') return { 'assessment.startTime': { $gt: now } };
  if (normalized === 'completed') return { 'assessment.endTime': { $lt: now } };
  return {};
}

function buildAssessmentCollectionWindowMatch(windowName, now = new Date()) {
  const normalized = String(windowName || 'all').toLowerCase();
  if (normalized === 'current' || normalized === 'active') return { startTime: { $lte: now }, endTime: { $gte: now } };
  if (normalized === 'upcoming') return { startTime: { $gt: now } };
  if (normalized === 'completed') return { endTime: { $lt: now } };
  return {};
}

function lifecycleBucketForAssessment(assessment = {}, now = new Date()) {
  const start = assessment.startTime ? new Date(assessment.startTime) : null;
  const end = assessment.endTime ? new Date(assessment.endTime) : null;
  if (assessment.lifecycleStatus === 'draft') return 'draft';
  if (assessment.manuallyCompletedAt) return 'completed';
  if (start && start > now) return 'upcoming';
  if (end && end < now) return 'completed';
  return 'current';
}

function computeSubmissionTimeTakenSec(submission = {}) {
  if (Number.isFinite(Number(submission.timeTakenSec)) && Number(submission.timeTakenSec) > 0) {
    return Number(submission.timeTakenSec);
  }

  const startedAt = submission.startedAt ? new Date(submission.startedAt).getTime() : null;
  const endedAt = submission.submittedAt
    ? new Date(submission.submittedAt).getTime()
    : submission.lastSavedAt
      ? new Date(submission.lastSavedAt).getTime()
      : null;

  if (!startedAt || !endedAt || endedAt < startedAt) return 0;
  return computeEffectiveTimeTakenSec(submission, new Date(endedAt));
}

function formatStudentSubmissionStatus(submission = {}) {
  return submission.status === 'submitted' ? 'Completed' : 'Partial';
}

function buildStudentReportRow(assessment = {}, submission = {}, { rankInfo = null, now = new Date() } = {}) {
  const evaluationUnavailable = ['processing', 'failed'].includes(submission.evaluationStatus);
  const deliveredAssessment = assessmentForSubmission(assessment, submission);
  const analytics = buildAssessmentAttemptAnalytics(deliveredAssessment, submission);
  const totalMarks = Number(deliveredAssessment.totalMarks || computeTotalMarksFromSections(deliveredAssessment.sections || []));
  const score = evaluationUnavailable ? null : Number(submission.score || 0);
  const accuracy = evaluationUnavailable ? null : Number.isFinite(Number(submission.accuracy))
    ? Number(submission.accuracy)
    : totalMarks > 0
      ? Number(((score / totalMarks) * 100).toFixed(2))
      : 0;
  const permissions = buildStudentResultPermissions(assessment, submission, now);
  const sectionBreakdown = permissions.canViewSectionAnalytics && !evaluationUnavailable ? analytics.sectionBreakdown : [];
  const questionWise = permissions.canViewQuestionReview && !evaluationUnavailable
    ? buildQuestionWiseReport(deliveredAssessment, submission, permissions)
    : [];

  return {
    id: submission._id,
    assessmentId: assessment._id,
    assessmentName: assessment.title || 'Untitled Assessment',
    assessmentType: assessment.assessmentType || 'mixed',
    duration: assessment.duration || 0,
    dateAttempted: submission.submittedAt || submission.startedAt || submission.updatedAt || submission.createdAt,
    status: formatStudentSubmissionStatus(submission),
    evaluationStatus: submission.evaluationStatus || 'completed',
    score: permissions.canViewScore ? score : null,
    totalMarks: permissions.canViewScore ? totalMarks : null,
    rawScore: permissions.canViewScore ? score : null,
    totalQuestions: analytics.totalQuestions,
    correctAnswers: permissions.canViewScore && !evaluationUnavailable ? analytics.correctAnswers : null,
    wrongAnswers: permissions.canViewScore && !evaluationUnavailable ? analytics.wrongAnswers : null,
    partialAnswers: permissions.canViewScore && !evaluationUnavailable ? analytics.partialAnswers : null,
    skippedQuestions: permissions.canViewScore ? analytics.skippedQuestions : null,
    pendingEvaluationQuestions: permissions.canViewScore ? analytics.pendingEvaluationQuestions : null,
    accuracy: permissions.canViewPercentage ? accuracy : null,
    timeTakenSec: permissions.canViewTimeAnalysis ? computeSubmissionTimeTakenSec(submission) : null,
    submittedAt: submission.submittedAt,
    startedAt: submission.startedAt,
    sectionBreakdown,
    questionWise,
    permissions,
    rank: permissions.canViewRank && !evaluationUnavailable ? rankInfo?.rank || null : null,
    percentile: permissions.canViewRank && !evaluationUnavailable ? rankInfo?.percentile || null : null,
    participants: permissions.canViewRank ? rankInfo?.participants || null : null,
  };
}

function compareSubmittedAssessmentRows(a = {}, b = {}) {
  const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const aTime = Number.isFinite(Number(a.timeTakenSec)) ? Number(a.timeTakenSec) : computeSubmissionTimeTakenSec(a) || Number.MAX_SAFE_INTEGER;
  const bTime = Number.isFinite(Number(b.timeTakenSec)) ? Number(b.timeTakenSec) : computeSubmissionTimeTakenSec(b) || Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;

  const aSubmittedAt = new Date(a.submittedAt || a.updatedAt || a.createdAt || 0).getTime();
  const bSubmittedAt = new Date(b.submittedAt || b.updatedAt || b.createdAt || 0).getTime();
  return aSubmittedAt - bSubmittedAt;
}

function rankSignature(row = {}) {
  const score = Number(row.score || 0);
  const timeTaken = Number.isFinite(Number(row.timeTakenSec)) ? Number(row.timeTakenSec) : computeSubmissionTimeTakenSec(row) || Number.MAX_SAFE_INTEGER;
  const submittedAt = new Date(row.submittedAt || row.updatedAt || row.createdAt || 0).getTime();
  return `${score}:${timeTaken}:${submittedAt}`;
}

async function buildStudentRankInfoByAssessment(assessmentIds = [], studentId) {
  const uniqueAssessmentIds = [...new Set(assessmentIds.map((id) => String(id || '')).filter(Boolean))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const rankInfoByAssessment = new Map();
  if (!uniqueAssessmentIds.length) return rankInfoByAssessment;

  const submittedRows = await AssessmentSubmission.find({
    status: 'submitted',
    evaluationStatus: { $nin: ['processing', 'failed'] },
    score: { $type: 'number' },
    assessmentId: { $in: uniqueAssessmentIds },
  })
    .select('assessmentId studentId score timeTakenSec submittedAt startedAt updatedAt createdAt')
    .maxTimeMS(3000)
    .lean();

  const rowsByAssessment = new Map();
  submittedRows.forEach((row) => {
    const key = String(row.assessmentId);
    if (!rowsByAssessment.has(key)) rowsByAssessment.set(key, []);
    rowsByAssessment.get(key).push(row);
  });

  rowsByAssessment.forEach((rows, assessmentId) => {
    const sortedRows = [...rows].sort(compareSubmittedAssessmentRows);
    let previousSignature = '';
    let previousRank = 0;

    sortedRows.forEach((row, index) => {
      const signature = rankSignature(row);
      const rank = signature === previousSignature ? previousRank : index + 1;
      previousSignature = signature;
      previousRank = rank;

      if (String(row.studentId) !== String(studentId)) return;
      const participants = sortedRows.length;
      rankInfoByAssessment.set(assessmentId, {
        rank,
        participants,
        percentile: participants ? Number((((participants - rank) / participants) * 100).toFixed(2)) : null,
      });
    });
  });

  return rankInfoByAssessment;
}

function decodeLegacyCodeEntities(value) {
  let decoded = String(value ?? '');
  if (!decoded.includes('&')) return decoded;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&#x27;', "'")
      .replaceAll('&amp;', '&');
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function normalizeAssessmentCodeMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([language, code]) => [language, decodeLegacyCodeEntities(code)]),
  );
}

function normalizeAssessmentSections(sections = []) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => {
    const sectionType = section?.type;
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    const normalizedQuestions = questions.map((question) => {
      const questionType = question?.type || sectionType;
      if (questionType !== 'coding') {
        return { ...question, type: questionType };
      }
      const snapshot = question?.problemDataSnapshot
        || question?.problemData
        || question?.coding?.problemData
        || question?.coding
        || null;
      const resolvedProblemId = question?.problemId
        || question?.coding?.problemId
        || snapshot?._id
        || null;
      const normalizedSnapshot = snapshot ? {
        ...snapshot,
        codeTemplates: normalizeAssessmentCodeMap(snapshot.codeTemplates || snapshot.templates),
      } : undefined;
      const normalizedCoding = question.coding ? {
        ...question.coding,
        starterCode: Array.isArray(question.coding.starterCode)
          ? question.coding.starterCode.map((entry) => ({
            ...entry,
            code: decodeLegacyCodeEntities(entry?.code),
          }))
          : question.coding.starterCode,
        problemData: question.coding.problemData ? {
          ...question.coding.problemData,
          codeTemplates: normalizeAssessmentCodeMap(
            question.coding.problemData.codeTemplates || question.coding.problemData.templates,
          ),
        } : question.coding.problemData,
      } : question.coding;
      return {
        ...question,
        type: 'coding',
        problemId: resolvedProblemId || undefined,
        problemDataSnapshot: normalizedSnapshot,
        coding: normalizedCoding,
      };
    });
    return {
      ...section,
      questions: normalizedQuestions,
    };
  });
}

function normalizeAssessmentQuestionSets(questionSets = [], fallbackSections = []) {
  const source = Array.isArray(questionSets) && questionSets.length
    ? questionSets
    : [{ setNumber: 1, label: 'Set 1', sections: fallbackSections }];
  return source.slice(0, 8).map((entry, index) => {
    const setNumber = index + 1;
    const marksPayload = applyMarksAndTotals(normalizeAssessmentSections(entry?.sections || []));
    return {
      setNumber,
      label: String(entry?.label || `Set ${setNumber}`).trim() || `Set ${setNumber}`,
      sections: marksPayload.sections,
      totalMarks: marksPayload.totalMarks,
    };
  });
}

function naturalValueCompare(left = '', right = '') {
  return String(left || '').localeCompare(String(right || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function compareCandidatesForSetAllocation(left = {}, right = {}, settings = {}) {
  const sortBy = settings.setAllocationSortBy === 'name' ? 'name' : 'student_id';
  const direction = settings.setAllocationSortDirection === 'desc' ? -1 : 1;
  const primary = sortBy === 'name'
    ? naturalValueCompare(left?.name, right?.name)
    : naturalValueCompare(left?.studentId, right?.studentId);
  if (primary !== 0) return primary * direction;
  return naturalValueCompare(left?.studentId, right?.studentId) || naturalValueCompare(left?.email, right?.email);
}

export function buildCandidateSetAssignments({ users = [], inputRows = [], settings = {} } = {}) {
  if (!settings.questionSetEnabled) return [];
  const setCount = Math.min(8, Math.max(2, Number(settings.questionSetCount) || 2));
  const startingSet = Math.min(setCount, Math.max(1, Number(settings.setStartingNumber) || 1));
  const rows = Array.isArray(inputRows) ? inputRows.map(normalizeStudentRow) : [];
  const rowById = new Map();
  rows.forEach((row) => {
    if (row._id) rowById.set(`id:${String(row._id)}`, row);
    if (row.studentid) rowById.set(`student:${String(row.studentid).toLowerCase()}`, row);
  });
  const ordered = [...users].sort((left, right) => compareCandidatesForSetAllocation(left, right, settings));
  return ordered.map((student, index) => {
    const row = rowById.get(`id:${String(student._id)}`)
      || rowById.get(`student:${String(student.studentId || '').toLowerCase()}`)
      || {};
    const requested = Number(row.assessmentSet);
    const requestedSource = String(row.assessmentSetSource || '').toLowerCase();
    const overrideSource = ['manual', 'csv'].includes(requestedSource)
      ? requestedSource
      : settings.automaticSetAssignment === false && !requestedSource
        ? 'manual'
        : '';
    const hasOverride = Boolean(overrideSource) && Number.isInteger(requested) && requested >= 1 && requested <= setCount;
    if (!hasOverride && settings.automaticSetAssignment === false) return null;
    const automaticNumber = ((startingSet - 1 + index) % setCount) + 1;
    return {
      student: student._id,
      studentIdSnapshot: String(student.studentId || ''),
      setNumber: hasOverride ? requested : automaticNumber,
      source: hasOverride ? overrideSource : 'automatic',
      frozenAt: new Date(),
    };
  }).filter(Boolean);
}

export function appendCandidateSetAssignments({ existingAssignments = [], newUsers = [], settings = {} } = {}) {
  if (!settings.questionSetEnabled) return [];
  const setCount = Math.min(8, Math.max(2, Number(settings.questionSetCount) || 2));
  const startingSet = Math.min(setCount, Math.max(1, Number(settings.setStartingNumber) || 1));
  const orderedNewUsers = [...newUsers].sort((left, right) => compareCandidatesForSetAllocation(left, right, settings));
  const appended = orderedNewUsers.map((student, index) => ({
    student: student._id,
    studentIdSnapshot: student.studentId || '',
    setNumber: ((startingSet - 1 + existingAssignments.length + index) % setCount) + 1,
    source: 'automatic',
    frozenAt: new Date(),
  }));
  return [...existingAssignments, ...appended];
}

function computeAssessmentType(sections = []) {
  const types = new Set();
  (sections || []).forEach((section) => {
    if (section?.type) types.add(section.type);
  });
  if (types.size === 1) return Array.from(types)[0];
  if (types.size === 0) return 'mixed';
  return 'mixed';
}

function applyMarksAndTotals(sections = []) {
  const normalizedSections = (sections || []).map((section) => {
    const marksPerQuestion = Number(section?.marksPerQuestion || 1) || 1;
    const negativeMarksPerQuestion = Math.max(0, Number(section?.negativeMarksPerQuestion || 0) || 0);
    const questions = (section?.questions || []).map((question) => {
      const points = Number(question?.points ?? question?.marks ?? marksPerQuestion) || 1;
      const negativePoints = Math.max(0, Number(question?.negativePoints ?? question?.negativeMarks ?? negativeMarksPerQuestion) || 0);
      return {
        ...question,
        points,
        negativePoints,
        marks: points,
      };
    });
    const totalMarks = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
    return {
      ...section,
      marksPerQuestion,
      negativeMarksPerQuestion,
      questions,
      totalMarks,
    };
  });
  const totalMarks = normalizedSections.reduce((sum, section) => sum + (Number(section.totalMarks) || 0), 0);
  const weightedSections = normalizedSections.map((section) => ({
    ...section,
    questions: (section.questions || []).map((question) => ({
      ...question,
      weight: totalMarks > 0 ? (Number(question.points) || 0) / totalMarks : 0,
    })),
  }));
  return { sections: weightedSections, totalMarks, assessmentType: computeAssessmentType(weightedSections) };
}

function scoreAssessment(assessment, answers = []) {
  return scoreAssessmentWithTestCases(assessment, answers);
}

function isAssessmentAnswerAttempted(answer = {}, question = {}, type = '') {
  if (!answer || typeof answer !== 'object') return false;
  if (type === 'mcq') {
    return Array.isArray(answer.answer)
      ? answer.answer.length > 0
      : answer.answer !== undefined && answer.answer !== null && answer.answer !== '';
  }
  if (type === 'coding') {
    const sourceCode = String(answer.code || '').trim();
    if (!sourceCode) return false;
    if (answer.submissionId || answer.jobId || answer.lastEvaluatedAt || answer.executionVerdict) return true;
    const codingData = question.coding || question.problemDataSnapshot || {};
    const starterEntries = Array.isArray(codingData.starterCode) ? codingData.starterCode : [];
    const starter = starterEntries.find((entry) => entry?.language === answer.language)?.code
      ?? starterEntries[0]?.code
      ?? '';
    return sourceCode !== String(starter || '').trim();
  }
  return String(answer.answer ?? '').trim().length > 0;
}

function validateQuestionAttemptCounts(assessment = {}, answers = [], requireConfiguredCount = false) {
  const limits = assessment.settings?.questionAttemptRequirements || {};
  const attemptedByType = { mcq: 0, one_line: 0, short: 0, coding: 0 };
  (answers || []).forEach((answer) => {
    const section = assessment.sections?.[Number(answer?.sectionIndex)];
    const question = section?.questions?.[Number(answer?.questionIndex)];
    const type = question?.type || section?.type;
    if (!type || !Object.prototype.hasOwnProperty.call(attemptedByType, type)) return;
    if (isAssessmentAnswerAttempted(answer, question, type)) attemptedByType[type] += 1;
  });
  for (const [type, rawLimit] of Object.entries(limits)) {
    const limit = Math.max(0, Number(rawLimit) || 0);
    if (limit > 0 && attemptedByType[type] > limit) {
      return `You can attempt a maximum of ${limit} ${type.replace('_', ' ')} question${limit === 1 ? '' : 's'}.`;
    }
    if (requireConfiguredCount && limit > 0 && attemptedByType[type] < limit) {
      return `You must attempt ${limit} ${type.replace('_', ' ')} question${limit === 1 ? '' : 's'} before submitting.`;
    }
  }
  return '';
}

function collectCodingProblemIds(sections = []) {
  const ids = new Set();
  (sections || []).forEach((section) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    questions.forEach((question) => {
      const questionType = question?.type || section?.type;
      if (questionType !== 'coding') return;
      if (question?.problemId) {
        ids.add(String(question.problemId));
      }
    });
  });
  return Array.from(ids);
}

function countQuestions(sections = []) {
  return (sections || []).reduce((total, section) => total + (section?.questions?.length || 0), 0);
}

function validateUniqueAssessmentQuestions(sections = []) {
  const seen = new Set();
  for (const section of sections || []) {
    for (const question of section?.questions || []) {
      const type = question?.type || section?.type || 'other';
      const problemId = question?.problemId
        || question?.coding?.problemId
        || question?.problemDataSnapshot?._id
        || question?.coding?.problemData?._id;
      const questionText = String(
        question?.questionText
        || question?.problemDataSnapshot?.title
        || question?.coding?.title
        || question?.coding?.problemData?.title
        || '',
      ).trim().toLowerCase().replace(/\s+/g, ' ');
      const identities = [
        question?.librarySourceId && `library:${question.librarySourceId}:${question.librarySourceChildId || question.questionId || ''}`,
        problemId && `problem:${problemId}`,
        question?.librarySourceQuestionId && !question?.librarySourceId && `source-question:${question.librarySourceQuestionId}`,
        questionText && `content:${type}:${questionText}`,
      ].filter(Boolean);
      if (identities.some((identity) => seen.has(identity))) {
        return 'The same question cannot be added to an assessment more than once.';
      }
      identities.forEach((identity) => seen.add(identity));
    }
  }
  return '';
}

function validateQuestionDeliverySettings(assessment = {}) {
  const settings = assessment.settings || {};
  if (!settings.questionSelectionEnabled) return '';
  const typeCounts = (assessment.sections || []).reduce((counts, section) => {
    const type = section?.type;
    if (type) counts[type] = (counts[type] || 0) + (section?.questions?.length || 0);
    return counts;
  }, {});
  for (const [type, available] of Object.entries(typeCounts)) {
    const delivered = Number(settings.questionRequirements?.[type] ?? available);
    const attempted = Number(settings.questionAttemptRequirements?.[type] ?? delivered);
    if (!Number.isInteger(delivered) || delivered < 1 || delivered > available) {
      return `Delivered ${type.replace('_', ' ')} questions must be between 1 and ${available}.`;
    }
    if (!Number.isInteger(attempted) || attempted < 1 || attempted > delivered) {
      return `Required ${type.replace('_', ' ')} attempts must be between 1 and ${delivered}.`;
    }
  }
  return '';
}

function computeTotalMarksFromSections(sections = []) {
  return (sections || []).reduce((sum, section) => {
    const sectionSum = (section?.questions || []).reduce((qSum, question) => qSum + (Number(question?.points || question?.marks || 0)), 0);
    return sum + sectionSum;
  }, 0);
}

function buildStudentSectionSummary(sections = []) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section, index) => {
    const questionCount = Array.isArray(section?.questions) ? section.questions.length : 0;
    const marksPerQuestion = Number(section?.marksPerQuestion || 0)
      || Number(section?.questions?.[0]?.points || section?.questions?.[0]?.marks || 0)
      || 0;
    return {
      sectionName: section?.sectionName || section?.title || `Section ${index + 1}`,
      title: section?.title || section?.sectionName || `Section ${index + 1}`,
      type: section?.type || 'mixed',
      marksPerQuestion,
      totalQuestions: questionCount,
      totalMarks: Number(section?.totalMarks || 0) || (questionCount * marksPerQuestion),
    };
  });
}

async function validatePublishedAssessmentSections(sections = []) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('At least one section is required for publishing.');
  }
  const totalQuestions = countQuestions(sections);
  if (totalQuestions === 0) {
    throw new Error('At least one question is required for publishing.');
  }
  const emptySection = sections.find((section) => !Array.isArray(section?.questions) || section.questions.length === 0);
  if (emptySection) {
    throw new Error('Sections cannot be empty for publishing.');
  }

  const missingProblemId = sections.some((section) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    return questions.some((question) => {
      const questionType = question?.type || section?.type;
      return questionType === 'coding' && !question?.problemId;
    });
  });
  if (missingProblemId) {
    throw new Error('Coding questions must have a valid problemId before publishing.');
  }

  const codingProblemIds = collectCodingProblemIds(sections);
  if (codingProblemIds.length === 0) return;

  const problems = await Problem.find({ _id: { $in: codingProblemIds } })
    .select('_id status previewValidated previewTested')
    .lean();
  const problemMap = new Map(problems.map((problem) => [String(problem._id), problem]));

  const invalidProblem = codingProblemIds.find((id) => {
    const problem = problemMap.get(String(id));
    const previewValidated = problem?.previewValidated ?? problem?.previewTested ?? false;
    const normalizedStatus = String(problem?.status || '').toLowerCase();
    const isPublished = normalizedStatus === 'published' || normalizedStatus === 'active';
    return !problem || !isPublished || !previewValidated;
  });

  if (invalidProblem) {
    throw new Error('All coding questions must reference published and validated problems before publishing.');
  }
}

export async function previewAssessmentStudents(req, res) {
  const rows = Array.isArray(req.body?.students) ? req.body.students : [];
  if (!rows.length || rows.length > 1000) return res.status(400).json({ error: 'Provide between 1 and 1000 students.' });
  const normalized = rows.map(normalizeStudentRow);
  const emails = normalized.map(row => String(row.email || '').toLowerCase()).filter(Boolean);
  const studentIds = normalized.map(row => String(row.studentid || '')).filter(Boolean);
  const existing = await User.find({ $or: [{ email: { $in: emails } }, { studentId: { $in: studentIds } }] })
    .select('_id name email studentId role accessScope').lean();
  const byEmail = new Map(existing.filter(user => user.email).map(user => [user.email.toLowerCase(), user]));
  const byStudentId = new Map(existing.filter(user => user.studentId).map(user => [String(user.studentId), user]));
  const seenEmails = new Set();
  const seenIds = new Set();
  const preview = normalized.map((row, index) => {
    const email = String(row.email || '').trim().toLowerCase();
    const studentId = String(row.studentid || '').trim();
    const errors = [];
    if (!row.name?.trim()) errors.push('Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required');
    if (!studentId) errors.push('Student ID is required');
    else if (!/^[A-Za-z0-9_-]{1,64}$/.test(studentId)) errors.push('Student ID may use letters, numbers, underscores or hyphens');
    if (email && seenEmails.has(email)) errors.push('Duplicate email in this file');
    if (studentId && seenIds.has(studentId)) errors.push('Duplicate student ID in this file');
    seenEmails.add(email);
    seenIds.add(studentId);
    const emailUser = byEmail.get(email);
    const idUser = byStudentId.get(studentId);
    if (emailUser && idUser && String(emailUser._id) !== String(idUser._id)) errors.push('Email and student ID belong to different accounts');
    const user = emailUser || idUser;
    if (user && user.role !== 'student') errors.push('This email or ID belongs to a non-student account');
    if (user && emailUser && studentId !== String(user.studentId || '')) errors.push('Student ID does not match the existing account');
    if (user && idUser && email !== String(user.email || '').toLowerCase()) errors.push('Email does not match the existing account');
    const assessmentSet = row.assessmentSet ? Number(row.assessmentSet) : '';
    if (assessmentSet !== '' && (!Number.isInteger(assessmentSet) || assessmentSet < 1 || assessmentSet > 8)) {
      errors.push('Assessment Set must be a whole number between 1 and 8');
    }
    return { row: index + 1, name: row.name, email, studentid: studentId, assessmentSet,
      status: errors.length ? 'error' : user ? 'existing' : 'new', errors,
      existingStudent: user && !errors.length ? { _id: user._id, name: user.name, email: user.email, studentId: user.studentId, accessScope: user.accessScope } : null };
  });
  return res.json({ preview });
}

async function resolveAssignedStudents({ targetType, assignedStudents, audienceType = 'platform_students', candidateCredentialMode = 'secure_generated' }) {
  if (targetType === 'all') {
    const students = await User.find({ role: 'student', accessScope: { $ne: 'assessment_only' } }).select('_id email name studentId accessScope').lean();
    return { ids: students.map(s => s._id), users: students, created: [] };
  }

  const inputRows = Array.isArray(assignedStudents) ? assignedStudents : [];
  if (inputRows.length === 0) {
    throw new Error('Assigned students list is required for selected target.');
  }

  const normalizedRows = inputRows.map(normalizeStudentRow);
  const emails = normalizedRows.map(r => r.email).filter(Boolean);
  const studentIds = normalizedRows.map(r => r.studentid).filter(Boolean);

  const existing = await User.find({
    $or: [
      { email: { $in: emails } },
      { studentId: { $in: studentIds } },
      { _id: { $in: normalizedRows.map(r => r._id).filter(Boolean) } },
    ],
  }).select('_id email name studentId role accessScope').lean();

  const existingByEmail = new Map(existing.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
  const existingByStudentId = new Map(existing.filter(u => u.studentId).map(u => [u.studentId.toString(), u]));
  const existingById = new Map(existing.map(u => [u._id.toString(), u]));

  const coordinators = await User.find({ role: 'coordinator' }).select('coordinatorId').lean();
  const validCoordinatorIds = new Set(
    coordinators
      .map(c => (c.coordinatorId || '').toString().trim())
      .filter(Boolean)
  );

  const created = [];
  const assignedIds = [];
  const seenEmails = new Set();
  const seenStudentIds = new Set();

  for (const row of normalizedRows) {
    const emailKey = String(row.email || '').toLowerCase();
    const studentIdKey = String(row.studentid || '');
    if ((emailKey && seenEmails.has(emailKey)) || (studentIdKey && seenStudentIds.has(studentIdKey))) {
      throw new Error('Duplicate email or student ID in the selected students.');
    }
    if (emailKey) seenEmails.add(emailKey);
    if (studentIdKey) seenStudentIds.add(studentIdKey);
    if (row._id && existingById.has(row._id.toString())) {
      const matchedUser = existingById.get(row._id.toString());
      if (matchedUser.role && matchedUser.role !== 'student') throw new Error('Only student accounts can take assessments.');
      assignedIds.push(matchedUser._id);
      continue;
    }

    const byEmail = row.email ? existingByEmail.get(row.email.toLowerCase()) : null;
    const byStudentId = row.studentid ? existingByStudentId.get(row.studentid.toString()) : null;
    if (byEmail && byStudentId && String(byEmail._id) !== String(byStudentId._id)) {
      throw new Error(`Email and student ID belong to different accounts for ${row.email}.`);
    }
    const existingUser = byEmail || byStudentId;

    if (existingUser) {
      if (existingUser.role && existingUser.role !== 'student') throw new Error('Only student accounts can take assessments.');
      if (existingUser.email?.toLowerCase() !== row.email?.toLowerCase() || String(existingUser.studentId || '') !== String(row.studentid || '')) {
        throw new Error(`Email and student ID must match the existing account for ${row.email}.`);
      }
      assignedIds.push(existingUser._id);
      continue;
    }

    const assessmentOnly = audienceType === 'assessment_candidates' || row.accessScope === 'assessment_only';
    if (assessmentOnly && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email || '')) {
      throw new Error('A valid email is required for each new student.');
    }
    if (assessmentOnly && !/^[A-Za-z0-9_-]{1,64}$/.test(row.studentid || '')) {
      throw new Error('Student ID must use letters, numbers, underscores or hyphens.');
    }
    const required = assessmentOnly
      ? ['name', 'email', 'studentid']
      : ['name', 'email', 'studentid', 'branch', 'teacherid', 'semester', 'course', 'college'];
    const missing = required.filter((k) => !row[k] || row[k].toString().trim() === '');
    if (missing.length > 0) {
      throw new Error(`Missing required fields for new student (${missing.join(', ')}). Use the onboarding CSV template.`);
    }

    const teacherIds = parseTeacherIds(row.teacherid);
    if (!assessmentOnly && teacherIds.length === 0) {
      throw new Error('Teacher ID / Coordinator code is required for new students.');
    }

    const invalidIds = assessmentOnly ? [] : teacherIds.filter(id => !validCoordinatorIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`Teacher ID / Coordinator code(s) "${invalidIds.join(', ')}" do not match any existing coordinator.`);
    }

    const semesterNum = assessmentOnly ? undefined : parseInt(row.semester, 10);
    if (!assessmentOnly && (Number.isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8)) {
      throw new Error('Semester must be between 1 and 8 for new students.');
    }

    const generatedPassword = candidateCredentialMode === 'student_id'
      ? String(row.studentid || '')
      : generateRandomPassword();
    const passwordHash = await User.hashPassword(generatedPassword);

    const user = await User.create({
      role: 'student',
      accessScope: assessmentOnly ? 'assessment_only' : 'full',
      name: row.name,
      email: row.email,
      studentId: row.studentid || `AC${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      branch: assessmentOnly ? undefined : row.branch,
      course: assessmentOnly ? undefined : row.course,
      college: assessmentOnly ? undefined : row.college,
      teacherIds,
      semester: semesterNum,
      group: row.group,
      passwordHash,
      temporaryPasswordEncrypted: assessmentOnly ? encryptAssessmentPassword(generatedPassword) : undefined,
      mustChangePassword: !assessmentOnly,
    });

    assignedIds.push(user._id);

    created.push({
      id: user._id,
      email: user.email,
      studentId: user.studentId,
      password: generatedPassword,
    });
  }

  const users = await User.find({ _id: { $in: assignedIds } }).select('_id email name studentId accessScope +temporaryPasswordEncrypted').lean();
  return { ids: assignedIds, users, created };
}

async function queueAssessmentAudienceEmails({ assessment, users = [], created = [], requestedBy, newOnly = false }) {
  if (!users.length) return { queued: 0 };
  let assessmentPassword = '';
  if (assessment.passwordEnabled && assessment.passwordEncrypted) {
    assessmentPassword = decryptAssessmentPassword(assessment.passwordEncrypted);
  }
  const credentialsByUser = new Map(created.map((entry) => [String(entry.id), entry]));
  const invitationTemplate = await getAssessmentInvitationTemplate(assessment);
  const batchId = crypto.randomUUID();
  const jobs = users.filter((user) => user.email && (!newOnly || credentialsByUser.has(String(user._id)))).map((user) => {
    const credentials = credentialsByUser.get(String(user._id));
    let accountPassword = credentials?.password || '';
    if (!accountPassword && user.accessScope === 'assessment_only' && user.temporaryPasswordEncrypted) {
      accountPassword = decryptAssessmentPassword(user.temporaryPasswordEncrypted);
    }
    return {
      type: 'assessment_invitation',
      to: user.email,
      recipientId: user._id,
      targetType: 'ASSESSMENT',
      targetId: assessment._id,
      idempotencyKey: `assessment-publish:${assessment._id}:${user._id}:${batchId}`,
      payload: {
        to: user.email,
        assessment: assessment.toObject ? assessment.toObject() : assessment,
        student: user,
        password: assessmentPassword,
        accountPassword,
        assessmentOnly: user.accessScope === 'assessment_only',
        renderedEmail: renderAssessmentInvitationEmail({
          to: user.email, assessment, student: user, password: assessmentPassword,
          accountPassword, assessmentOnly: user.accessScope === 'assessment_only', template: invitationTemplate,
        }),
      },
    };
  });
  return enqueueMailJobs(jobs, {
    batchId,
    requestedBy: requestedBy?._id,
    requestedByEmail: requestedBy?.email,
  });
}

export async function sendAssessmentTestEmail(req, res) {
  try {
    const assessment = req.body?.assessment || {};
    if (
      assessment.audienceType === 'assessment_candidates'
      && req.user?.role === 'coordinator'
      && !hasCoordinatorPermission(req.user, 'coordinator.assessment.candidates')
    ) {
      return res.status(403).json({ error: 'Assessment-only candidate access has not been enabled for this coordinator.' });
    }
    if (!req.user?.email) return res.status(400).json({ error: 'Your administrator account has no email address.' });
    await sendAssessmentInvitationEmail({
      to: req.user.email,
      assessment: {
        ...assessment,
        _id: assessment._id || 'preview',
        passwordEnabled: Boolean(assessment.passwordEnabled),
      },
      student: { name: req.user.name || 'Administrator' },
      password: assessment.passwordEnabled ? (assessment.password || 'ASSESSMENT-PASSWORD') : '',
      accountPassword: assessment.audienceType === 'assessment_candidates' ? 'TemporaryPass123' : '',
      assessmentOnly: assessment.audienceType === 'assessment_candidates',
    });
    return res.json({ message: `Test email sent to ${req.user.email}.` });
  } catch (err) {
    console.error('Error sending assessment test email:', err);
    return res.status(500).json({ error: err.message || 'Failed to send assessment test email.' });
  }
}

export async function createAssessment(req, res) {
  try {
    const {
      title,
      description,
      instructions,
      startTime,
      endTime,
      duration,
      targetType,
      assignedStudents,
      sections,
      questionSets,
      lifecycleStatus,
      draftTargetMode,
      allowLateSubmission,
      attemptLimit,
      sendEmail,
      assessmentId,
      testType,
      isVisible,
      customInstructions,
      settings,
      passwordEnabled,
      password,
      audienceType,
    } = req.body || {};

    if (req.user?.role === 'coordinator'
      && !hasCoordinatorPermission(req.user, 'coordinator.assessment.candidates')
      && (audienceType === 'assessment_candidates' || (Array.isArray(assignedStudents)
        && assignedStudents.some(row => row?.accessScope === 'assessment_only' && !row?._id)))) {
      return res.status(403).json({ error: 'Adding new assessment students is not enabled for this coordinator.' });
    }

    const normalizedSettings = normalizeAssessmentSettings(settings);
    const normalizedSections = normalizeAssessmentSections(sections);
    const normalizedQuestionSets = normalizeAssessmentQuestionSets(questionSets, normalizedSections);
    if (lifecycleStatus !== 'draft' && normalizedSettings.questionSetEnabled && normalizedQuestionSets.length < normalizedSettings.questionSetCount) {
      return res.status(400).json({ error: `Configure all ${normalizedSettings.questionSetCount} question sets before publishing.` });
    }
    const effectiveQuestionSets = normalizedSettings.questionSetEnabled
      ? normalizedQuestionSets.slice(0, normalizedSettings.questionSetCount)
      : normalizedQuestionSets.slice(0, 1);
    if (lifecycleStatus !== 'draft' && normalizedSettings.questionSetEnabled) {
      const totals = effectiveQuestionSets.map((entry) => Number(entry.totalMarks) || 0);
      if (!totals.length || totals.some((total) => total <= 0 || total !== totals[0])) {
        return res.status(400).json({ error: 'All question sets must have the same total marks.' });
      }
    }
    const duplicateQuestionError = effectiveQuestionSets
      .map((entry) => validateUniqueAssessmentQuestions(entry.sections))
      .find(Boolean);
    if (duplicateQuestionError) return res.status(400).json({ error: duplicateQuestionError });
    const marksPayload = applyMarksAndTotals(normalizedSections);
    const normalizedLifecycle = lifecycleStatus === 'draft' ? 'draft' : 'published';
    const isDraft = normalizedLifecycle === 'draft';

    let start = null;
    let end = null;
    let durationNum = null;

    if (!isDraft) {
      if (!title || !startTime || !endTime || !duration) {
        return res.status(400).json({ error: 'Title, startTime, endTime, and duration are required.' });
      }
      start = parseDate(startTime);
      end = parseDate(endTime);
      if (!start || !end) {
        return res.status(400).json({ error: 'Invalid startTime or endTime.' });
      }
      if (end <= start) {
        return res.status(400).json({ error: 'End time must be after start time.' });
      }
      if (start.getTime() < Date.now() - (60 * 1000)) {
        return res.status(400).json({ error: 'Start time must be the current time or a future time.' });
      }

      durationNum = Number(duration);
      if (Number.isNaN(durationNum) || durationNum <= 0) {
        return res.status(400).json({ error: 'Duration must be a positive number of minutes.' });
      }
      const windowMinutes = (end.getTime() - start.getTime()) / (60 * 1000);
      if (durationNum > windowMinutes) {
        return res.status(400).json({ error: 'Duration cannot exceed the assessment time window.' });
      }
    } else {
      start = startTime ? parseDate(startTime) : null;
      end = endTime ? parseDate(endTime) : null;
      durationNum = duration !== undefined ? Number(duration) : null;
    }

    const normalizedTarget = targetType === 'selected' ? 'selected' : 'all';
    const normalizedDraftTarget = normalizedTarget === 'all'
      ? 'all'
      : (draftTargetMode || 'individual');
    let ids = [];
    let users = [];
    let created = [];
    const draftAssigned = normalizedTarget === 'all'
      ? []
      : (Array.isArray(assignedStudents) ? assignedStudents : []);

    if (!isDraft) {
      const resolved = await resolveAssignedStudents({
        targetType: normalizedTarget,
        assignedStudents,
        audienceType,
        candidateCredentialMode: normalizedSettings.candidateCredentialMode,
      });
      ids = resolved.ids;
      users = resolved.users;
      created = resolved.created;
    }

    const attemptLimitNum = attemptLimit !== undefined ? Number(attemptLimit) : 1;
    if (attemptLimitNum !== null && (Number.isNaN(attemptLimitNum) || attemptLimitNum < 1)) {
      return res.status(400).json({ error: 'Attempt limit must be a positive number.' });
    }

    if (!isDraft) {
      for (const questionSet of effectiveQuestionSets) {
        await validatePublishedAssessmentSections(questionSet.sections);
      }
    }

    const assessment = new Assessment({
      title: title || '',
      description: description || '',
      instructions: instructions || '',
      startTime: start || null,
      endTime: end || null,
      duration: durationNum,
      createdBy: req.user._id,
      targetType: normalizedTarget,
      assignedStudents: ids,
      audienceType: audienceType === 'assessment_candidates' ? 'assessment_candidates' : 'platform_students',
      draftTargetMode: isDraft ? normalizedDraftTarget : 'all',
      draftAssignedStudents: isDraft ? draftAssigned : [],
      sections: effectiveQuestionSets[0]?.sections || marksPayload.sections,
      questionSets: effectiveQuestionSets,
      totalMarks: effectiveQuestionSets[0]?.totalMarks ?? marksPayload.totalMarks,
      assessmentType: computeAssessmentType(effectiveQuestionSets[0]?.sections || marksPayload.sections),
      lifecycleStatus: normalizedLifecycle,
      allowLateSubmission: Boolean(allowLateSubmission),
      attemptLimit: attemptLimitNum || 1,
      assessmentId: assessmentId || '',
      testType: testType || '',
      isVisible: isVisible !== false,
      customInstructions: Array.isArray(customInstructions) ? customInstructions : [],
      settings: normalizedSettings,
      version: 1,
      versionUpdatedAt: new Date(),
    });

    await applyAssessmentPassword(assessment, { passwordEnabled, password });
    if (!isDraft) {
      const candidateSetAssignments = buildCandidateSetAssignments({
        users,
        inputRows: assignedStudents,
        settings: normalizedSettings,
      });
      if (normalizedSettings.questionSetEnabled && candidateSetAssignments.length !== users.length) {
        return res.status(400).json({ error: 'Assign every candidate to a question set or enable automatic set assignment.' });
      }
      assessment.candidateSetAssignments = candidateSetAssignments;
    }
    if (!isDraft && assessment.passwordEnabled && !assessment.passwordHash) {
      return res.status(400).json({ error: 'Password is required when password protection is enabled.' });
    }
    if (!isDraft) {
      const deliveryError = validateQuestionDeliverySettings(assessment);
      if (deliveryError) return res.status(400).json({ error: deliveryError });
    }

    await assessment.save();
    await syncAssessmentCandidateBatch(assessment);

    if (!isDraft && (sendEmail || created.length)) {
      await queueAssessmentAudienceEmails({ assessment, users, created, requestedBy: req.user, newOnly: !sendEmail });
    }

    await syncAssessmentQuestionsToLibrary(assessment);

    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: 'CREATE',
      targetType: 'ASSESSMENT',
      targetId: String(assessment._id),
      description: `Created assessment: ${assessment.title || 'Untitled'}`,
      changes: {
        title: { from: null, to: assessment.title || '' },
        lifecycleStatus: { from: null, to: assessment.lifecycleStatus },
        targetType: { from: null, to: assessment.targetType },
        assignedCount: { from: null, to: Array.isArray(assessment.assignedStudents) ? assessment.assignedStudents.length : 0 },
      },
      metadata: {
        assessmentId: String(assessment._id),
        lifecycleStatus: assessment.lifecycleStatus,
        targetType: assessment.targetType,
      },
      req,
    });

    res.status(201).json({ assessmentId: assessment._id, assignedCount: ids.length });

    setImmediate(async () => {
      try {
        if (normalizedLifecycle === 'published' && created.length > 0) {
          const accountNotifs = created.map(student => ({
            userId: student.id,
            title: 'Account Created',
            message: 'Your account has been created',
            type: 'SYSTEM',
            referenceId: student.id,
            actionUrl: '/student/dashboard',
            dedupeKey: `account-created:${student.id}`
          }));
          await createNotifications(accountNotifs);
        }

        if (normalizedLifecycle === 'published' && users.length > 0) {
          const notifs = users.map(u => ({
            userId: u._id,
            title: 'Assessment Assigned',
            message: 'A new assessment has been assigned',
            type: 'ASSESSMENT',
            referenceId: assessment._id,
            actionUrl: `/student/assessment/${assessment._id}`,
            dedupeKey: `assessment-assigned:${assessment._id}:${u._id}`
          }));
          await createNotifications(notifs);
        }
      } catch (err) {
        console.error('[Assessment] Email send failed:', err.message);
      }
    });
  } catch (err) {
    console.error('Error creating assessment:', err);
    res.status(500).json({ error: err.message || 'Failed to create assessment' });
  }
}

export async function listAssessments(req, res) {
  try {
    const query = {};
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') {
      query.createdBy = req.user._id;
    }
    const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedLimit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const paginated = req.query.page !== undefined || req.query.limit !== undefined;
    const dashboardView = req.query.view === 'dashboard';
    const assessmentsQuery = Assessment.find(query)
      .sort({ createdAt: -1 });
    if (dashboardView) {
      assessmentsQuery.select('_id title assessmentType lifecycleStatus isVisible startTime endTime manuallyCompletedAt createdAt updatedAt');
    } else {
      assessmentsQuery.populate('createdBy', 'name email role coordinatorId');
    }
    if (paginated) assessmentsQuery.skip((requestedPage - 1) * requestedLimit).limit(requestedLimit);
    const [assessments, total] = await Promise.all([
      assessmentsQuery.lean(),
      paginated ? Assessment.countDocuments(query) : Promise.resolve(null),
    ]);
    const assessmentIds = assessments.map((assessment) => assessment._id);
    if (dashboardView) {
      const now = new Date();
      const data = assessments.map((assessment) => ({
        ...assessment,
        status: computeStatus(now, assessment),
        lifecycleBucket: lifecycleBucketForAssessment(assessment, now),
      }));
      return res.json({
        count: paginated ? total : data.length,
        total: paginated ? total : data.length,
        assessments: data,
        ...(paginated ? {
          pagination: {
            page: requestedPage,
            limit: requestedLimit,
            total,
            pages: Math.max(1, Math.ceil(total / requestedLimit)),
          },
        } : {}),
      });
    }
    const submissionCounts = await AssessmentSubmission.aggregate([
      {
        $match: {
          assessmentId: { $in: assessmentIds },
        },
      },
      {
        $group: {
          _id: '$assessmentId',
          count: { $sum: 1 },
          submitted: {
            $sum: {
              $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0],
            },
          },
          avgScore: { $avg: { $ifNull: ['$score', 0] } },
          maxScore: { $max: { $ifNull: ['$score', 0] } },
          minScore: { $min: { $ifNull: ['$score', 0] } },
          tabSwitches: { $sum: { $ifNull: ['$tabSwitches', 0] } },
          fullscreenExits: { $sum: { $ifNull: ['$fullscreenExits', 0] } },
          cameraFlags: { $sum: { $ifNull: ['$cameraFlags', 0] } },
          copyPasteCount: { $sum: { $ifNull: ['$copyPasteCount', 0] } },
        },
      },
    ]);
    const countsByAssessment = new Map(submissionCounts.map((c) => [String(c._id), c]));
    const now = new Date();
    const data = assessments.map((a) => {
      const status = computeStatus(now, a);
      const lifecycleBucket = lifecycleBucketForAssessment(a, now);
      const assignedCount = a.targetType === 'all'
        ? 'All Students'
        : (a.lifecycleStatus === 'draft'
          ? (a.draftAssignedStudents?.length || 0)
          : (a.assignedStudents?.length || 0));

      return {
        ...sanitizeAssessmentForResponse(a),
        status,
        lifecycleBucket,
        totalQuestions: countQuestions(a.sections || []),
        totalMarks: Number(a.totalMarks || computeTotalMarksFromSections(a.sections || [])) || 0,
        assignedCount,
        attempts: countsByAssessment.get(String(a._id))?.count || 0,
        submissionCount: countsByAssessment.get(String(a._id))?.count || 0,
        submissions: countsByAssessment.get(String(a._id))?.submitted || 0,
        completedCount: countsByAssessment.get(String(a._id))?.submitted || 0,
        avgScore: countsByAssessment.get(String(a._id))?.avgScore || 0,
        maxScore: countsByAssessment.get(String(a._id))?.maxScore || 0,
        minScore: countsByAssessment.get(String(a._id))?.minScore || 0,
        violationCount: (
          (countsByAssessment.get(String(a._id))?.tabSwitches || 0)
          + (countsByAssessment.get(String(a._id))?.fullscreenExits || 0)
          + (countsByAssessment.get(String(a._id))?.cameraFlags || 0)
          + (countsByAssessment.get(String(a._id))?.copyPasteCount || 0)
        ),
      };
    });
    res.json({
      count: paginated ? total : data.length,
      total: paginated ? total : data.length,
      assessments: data,
      ...(paginated ? {
        pagination: {
          page: requestedPage,
          limit: requestedLimit,
          total,
          pages: Math.max(1, Math.ceil(total / requestedLimit)),
        },
      } : {}),
    });
  } catch (err) {
    console.error('Error listing assessments:', err);
    res.status(500).json({ error: 'Failed to load assessments' });
  }
}

export async function getAssessment(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id).populate('assignedStudents', 'name email studentId accessScope').lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const status = computeStatus(new Date(), assessment);
    const assignmentByStudent = new Map((assessment.candidateSetAssignments || []).map((entry) => [
      String(entry?.student?._id || entry?.student || ''),
      entry,
    ]));
    const sanitized = sanitizeAssessmentForResponse(assessment);
    sanitized.assignedStudents = (assessment.assignedStudents || []).map((student) => {
      const assignment = assignmentByStudent.get(String(student?._id || student || ''));
      return {
        ...student,
        ...(assignment ? {
          assessmentSet: assignment.setNumber,
          assessmentSetSource: assignment.source,
        } : {}),
      };
    });
    res.json({ assessment: { ...sanitized, status } });
  } catch (err) {
    console.error('Error fetching assessment:', err);
    res.status(500).json({ error: 'Failed to load assessment' });
  }
}

export async function updateAssessment(req, res) {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      instructions,
      startTime,
      endTime,
      duration,
      targetType,
      assignedStudents,
      sections,
      questionSets,
      lifecycleStatus,
      draftTargetMode,
      allowLateSubmission,
      attemptLimit,
      sendEmail,
      assessmentId,
      testType,
      isVisible,
      customInstructions,
      settings,
      passwordEnabled,
      password,
      audienceType,
    } = req.body || {};

    if (req.user?.role === 'coordinator'
      && !hasCoordinatorPermission(req.user, 'coordinator.assessment.candidates')
      && Array.isArray(assignedStudents)
      && assignedStudents.some(row => row?.accessScope === 'assessment_only' && !row?._id)) {
      return res.status(403).json({ error: 'Adding new assessment students is not enabled for this coordinator.' });
    }
    if (
      audienceType === 'assessment_candidates'
      && req.user?.role === 'coordinator'
      && !hasCoordinatorPermission(req.user, 'coordinator.assessment.candidates')
    ) {
      return res.status(403).json({ error: 'Assessment-only candidate access has not been enabled for this coordinator.' });
    }

    const assessment = await Assessment.findById(id).select('+passwordEncrypted');
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (
      (audienceType === 'assessment_candidates' || assessment.audienceType === 'assessment_candidates')
      && req.user?.role === 'coordinator'
      && !hasCoordinatorPermission(req.user, 'coordinator.assessment.candidates')
    ) {
      return res.status(403).json({ error: 'Assessment-only candidate access has not been enabled for this coordinator.' });
    }
    const previousPasswordHash = assessment.passwordHash || '';

    const beforeSnapshot = {
      title: assessment.title,
      description: assessment.description,
      instructions: assessment.instructions,
      lifecycleStatus: assessment.lifecycleStatus,
      startTime: assessment.startTime,
      endTime: assessment.endTime,
      duration: assessment.duration,
      targetType: assessment.targetType,
      assignedStudentsCount: Array.isArray(assessment.assignedStudents) ? assessment.assignedStudents.length : 0,
      allowLateSubmission: assessment.allowLateSubmission,
      attemptLimit: assessment.attemptLimit,
      version: assessment.version,
    };

    if (title !== undefined) assessment.title = title;
    if (description !== undefined) assessment.description = description;
    if (instructions !== undefined) assessment.instructions = instructions;
    if (lifecycleStatus) {
      assessment.lifecycleStatus = lifecycleStatus === 'draft' ? 'draft' : 'published';
    }
    if (allowLateSubmission !== undefined) {
      assessment.allowLateSubmission = Boolean(allowLateSubmission);
    }
    if (attemptLimit !== undefined) {
      const attemptLimitNum = Number(attemptLimit);
      if (Number.isNaN(attemptLimitNum) || attemptLimitNum < 1) {
        return res.status(400).json({ error: 'Attempt limit must be a positive number.' });
      }
      assessment.attemptLimit = attemptLimitNum;
    }
    if (assessmentId !== undefined) assessment.assessmentId = assessmentId || '';
    if (testType !== undefined) assessment.testType = testType || '';
    if (audienceType !== undefined) {
      assessment.audienceType = audienceType === 'assessment_candidates' ? 'assessment_candidates' : 'platform_students';
    }
    if (isVisible !== undefined) assessment.isVisible = isVisible !== false;
    if (customInstructions !== undefined) {
      assessment.customInstructions = Array.isArray(customInstructions) ? customInstructions : [];
    }
    if (settings !== undefined) {
      assessment.settings = normalizeAssessmentSettings(settings);
    }
    await applyAssessmentPassword(assessment, { passwordEnabled, password });

    if (startTime) {
      const start = parseDate(startTime);
      if (!start) return res.status(400).json({ error: 'Invalid startTime.' });
      assessment.startTime = start;
    }
    if (endTime) {
      const end = parseDate(endTime);
      if (!end) return res.status(400).json({ error: 'Invalid endTime.' });
      assessment.endTime = end;
    }

    const isDraft = assessment.lifecycleStatus === 'draft';

    if (!isDraft && assessment.passwordEnabled && !assessment.passwordHash) {
      return res.status(400).json({ error: 'Password is required when password protection is enabled.' });
    }

    if (!isDraft && (!assessment.title || !assessment.startTime || !assessment.endTime || !assessment.duration)) {
      return res.status(400).json({ error: 'Title, startTime, endTime, and duration are required.' });
    }

    if (!isDraft && assessment.endTime <= assessment.startTime) {
      return res.status(400).json({ error: 'End time must be after start time.' });
    }

    if (duration !== undefined) {
      const durationNum = Number(duration);
      if (Number.isNaN(durationNum) || durationNum <= 0) {
        return res.status(400).json({ error: 'Duration must be a positive number of minutes.' });
      }
      if (!isDraft && assessment.startTime && assessment.endTime) {
        const windowMinutes = (assessment.endTime.getTime() - assessment.startTime.getTime()) / (60 * 1000);
        if (durationNum > windowMinutes) {
          return res.status(400).json({ error: 'Duration cannot exceed the assessment time window.' });
        }
      }
      assessment.duration = durationNum;
    }

    if (sections || questionSets) {
      const normalized = normalizeAssessmentSections(sections || assessment.sections || []);
      const normalizedSets = normalizeAssessmentQuestionSets(questionSets || assessment.questionSets, normalized);
      const setCount = assessment.settings?.questionSetEnabled
        ? Math.min(normalizedSets.length, Number(assessment.settings.questionSetCount) || normalizedSets.length)
        : 1;
      const effectiveSets = normalizedSets.slice(0, Math.max(1, setCount));
      assessment.questionSets = effectiveSets;
      assessment.sections = effectiveSets[0]?.sections || normalized;
      assessment.totalMarks = effectiveSets[0]?.totalMarks || 0;
      assessment.assessmentType = computeAssessmentType(assessment.sections);
    }
    const assessmentQuestionSets = assessment.settings?.questionSetEnabled
      ? (assessment.questionSets || [])
      : [{ setNumber: 1, sections: assessment.sections || [] }];
    if (!isDraft && assessment.settings?.questionSetEnabled
      && assessmentQuestionSets.length < Number(assessment.settings.questionSetCount || 1)) {
      return res.status(400).json({ error: `Configure all ${assessment.settings.questionSetCount} question sets before publishing.` });
    }
    if (!isDraft && assessment.settings?.questionSetEnabled) {
      const totals = assessmentQuestionSets.map((entry) => Number(entry.totalMarks) || computeTotalMarksFromSections(entry.sections));
      if (!totals.length || totals.some((total) => total <= 0 || total !== totals[0])) {
        return res.status(400).json({ error: 'All question sets must have the same total marks.' });
      }
    }
    const duplicateQuestionError = assessmentQuestionSets
      .map((entry) => validateUniqueAssessmentQuestions(entry.sections || []))
      .find(Boolean);
    if (duplicateQuestionError) return res.status(400).json({ error: duplicateQuestionError });
    if (!isDraft) {
      for (const questionSet of assessmentQuestionSets) {
        await validatePublishedAssessmentSections(questionSet.sections || []);
      }
    }

    let resolvedAudienceUsers = [];
    let newlyCreatedAudienceUsers = [];
    if (targetType) {
      const normalizedTarget = targetType === 'selected' ? 'selected' : 'all';
      assessment.targetType = normalizedTarget;

      if (isDraft) {
        assessment.draftTargetMode = draftTargetMode || assessment.draftTargetMode || (normalizedTarget === 'all' ? 'all' : 'individual');
        if (normalizedTarget === 'all') {
          assessment.draftAssignedStudents = [];
        } else if (assignedStudents !== undefined) {
          assessment.draftAssignedStudents = Array.isArray(assignedStudents) ? assignedStudents : assessment.draftAssignedStudents;
        }
        assessment.assignedStudents = [];
      } else {
        const { ids, users, created } = await resolveAssignedStudents({
          targetType: normalizedTarget,
          assignedStudents,
          audienceType: assessment.audienceType,
          candidateCredentialMode: assessment.settings?.candidateCredentialMode,
        });
        assessment.assignedStudents = ids;
        resolvedAudienceUsers = users;
        newlyCreatedAudienceUsers = created;
        const candidateSetAssignments = buildCandidateSetAssignments({
          users,
          inputRows: assignedStudents,
          settings: assessment.settings || {},
        });
        if (assessment.settings?.questionSetEnabled && candidateSetAssignments.length !== users.length) {
          return res.status(400).json({ error: 'Assign every candidate to a question set or enable automatic set assignment.' });
        }
        assessment.candidateSetAssignments = candidateSetAssignments;
        assessment.draftAssignedStudents = [];
        assessment.draftTargetMode = 'all';
      }
    } else if (isDraft) {
      if (draftTargetMode) {
        assessment.draftTargetMode = draftTargetMode;
        if (draftTargetMode === 'all') {
          assessment.draftAssignedStudents = [];
        }
      }
      if (assignedStudents !== undefined && assessment.draftTargetMode !== 'all') {
        assessment.draftAssignedStudents = Array.isArray(assignedStudents) ? assignedStudents : assessment.draftAssignedStudents;
      }
    }

    if (!isDraft) {
      const deliveryError = validateQuestionDeliverySettings(assessment);
      if (deliveryError) return res.status(400).json({ error: deliveryError });
    }

    assessment.version = (assessment.version || 1) + 1;
    assessment.versionUpdatedAt = new Date();

    await assessment.save();
    await syncAssessmentCandidateBatch(assessment);
    if (!isDraft && (sendEmail || newlyCreatedAudienceUsers.length)) {
      const mailUsers = resolvedAudienceUsers.length
        ? resolvedAudienceUsers
        : await User.find({ _id: { $in: assessment.assignedStudents || [] } }).select('_id email name studentId accessScope +temporaryPasswordEncrypted').lean();
      await queueAssessmentAudienceEmails({
        assessment,
        users: mailUsers,
        created: newlyCreatedAudienceUsers,
        requestedBy: req.user,
        newOnly: !sendEmail,
      });
    }
    if ((assessment.passwordHash || '') !== previousPasswordHash) {
      await AssessmentSubmission.updateMany(
        {
          assessmentId: assessment._id,
          status: { $in: ['not_started', 'incomplete'] },
        },
        { $unset: { passwordVerifiedAt: '' }, $inc: { __v: 1 } },
      );
    }
    await syncAssessmentQuestionsToLibrary(assessment);

    const afterSnapshot = {
      title: assessment.title,
      description: assessment.description,
      instructions: assessment.instructions,
      lifecycleStatus: assessment.lifecycleStatus,
      startTime: assessment.startTime,
      endTime: assessment.endTime,
      duration: assessment.duration,
      targetType: assessment.targetType,
      assignedStudentsCount: Array.isArray(assessment.assignedStudents) ? assessment.assignedStudents.length : 0,
      allowLateSubmission: assessment.allowLateSubmission,
      attemptLimit: assessment.attemptLimit,
      version: assessment.version,
    };

    const changes = {
      ...(buildSimpleChanges(beforeSnapshot, afterSnapshot, [
        'title',
        'description',
        'instructions',
        'lifecycleStatus',
        'startTime',
        'endTime',
        'duration',
        'targetType',
        'assignedStudentsCount',
        'allowLateSubmission',
        'attemptLimit',
        'version',
      ]) || {}),
    };

    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: 'UPDATE',
      targetType: 'ASSESSMENT',
      targetId: String(assessment._id),
      description: `Updated assessment: ${assessment.title || 'Untitled'}`,
      changes: Object.keys(changes).length ? changes : null,
      metadata: {
        assessmentId: String(assessment._id),
        lifecycleStatus: assessment.lifecycleStatus,
        targetType: assessment.targetType,
      },
      req,
    });

    res.json({
      message: 'Assessment updated',
      assessmentId: assessment._id,
      version: assessment.version,
      updatedAt: assessment.updatedAt,
    });

    if (assessment.lifecycleStatus === 'published') {
      const assignedUsers = await User.find({ _id: { $in: assessment.assignedStudents || [] } }).select('_id').lean();
      setImmediate(async () => {
        try {
          const notifs = assignedUsers.map(u => ({
            userId: u._id,
            title: 'Assessment Assigned',
            message: 'A new assessment has been assigned',
            type: 'ASSESSMENT',
            referenceId: assessment._id,
            actionUrl: `/student/assessment/${assessment._id}`,
            dedupeKey: `assessment-assigned:${assessment._id}:${u._id}`
          }));
          await createNotifications(notifs);
        } catch (err) {
          console.error('[Assessment] Notification send failed:', err.message);
        }
      });
    }
  } catch (err) {
    console.error('Error updating assessment:', err);
    res.status(500).json({ error: err.message || 'Failed to update assessment' });
  }
}

export async function deleteAssessment(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findByIdAndDelete(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    await removeAssessmentQuestionsFromLibrary(id);

    await deleteAssessmentAttemptData({ assessmentId: id });

    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: 'DELETE',
      targetType: 'ASSESSMENT',
      targetId: String(assessment._id),
      description: `Deleted assessment: ${assessment.title || 'Untitled'}`,
      metadata: { assessmentId: String(assessment._id) },
      req,
    });

    res.json({ message: 'Assessment deleted' });
  } catch (err) {
    console.error('Error deleting assessment:', err);
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
}

export async function resetAssessmentSubmissions(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all' && assessment.createdBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not allowed to reset this assessment.' });
    }

    const result = await deleteAssessmentAttemptData({ assessmentId: assessment._id });
    assessment.manuallyCompletedAt = undefined;
    await assessment.save();

    await logActivity({
      actorId: req.user?._id,
      action: 'assessment.reset_submissions',
      entityType: 'assessment',
      entityId: assessment._id,
      description: `Reset submissions for assessment: ${assessment.title || 'Untitled'}`,
      metadata: { assessmentId: String(assessment._id), deletedSubmissions: result.deletedCount || 0 },
      req,
    });

    return res.json({
      ok: true,
      message: 'Assessment submissions reset. Students can start fresh while the schedule is open.',
      deletedSubmissions: result.deletedCount || 0,
    });
  } catch (err) {
    console.error('Error resetting assessment submissions:', err);
    return res.status(500).json({ error: 'Failed to reset assessment submissions.' });
  }
}

export async function listAssessmentEligibleStudents(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id).lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!canManageAssessmentForRequest(assessment, req.user)) {
      return res.status(403).json({ error: 'Not allowed to view eligible students for this assessment.' });
    }

    await reconcileExpiredAssessmentSubmissions({ assessmentId: assessment._id });

    const students = await resolveEligibleAssessmentStudents(assessment);
    const studentIds = students.map((student) => student._id);
    const submissions = await AssessmentSubmission.find({
      assessmentId: assessment._id,
      studentId: { $in: studentIds },
    }).select('_id studentId status startedAt submittedAt score maxMarks accuracy tabSwitches fullscreenExits copyPasteCount cameraFlags violationScore pauseCount updatedAt createdAt').lean();
    const submissionsByStudent = new Map(submissions.map((submission) => [String(submission.studentId), submission]));
    const assignmentsByStudent = new Map((assessment.candidateSetAssignments || []).map((assignment) => [
      String(assignment.student),
      assignment,
    ]));

    const rows = students.map((student) => {
      const submission = submissionsByStudent.get(String(student._id)) || null;
      const assignment = assignmentsByStudent.get(String(student._id));
      return {
        ...student,
        submission,
        hasSubmission: Boolean(submission),
        assessmentSet: assignment?.setNumber || null,
        assessmentSetSource: assignment?.source || '',
      };
    });

    const summary = rows.reduce((acc, row) => {
      acc.total += 1;
      if (!row.submission) acc.notStarted += 1;
      else if (row.submission.status === 'submitted') acc.submitted += 1;
      else if (row.submission.status === 'in_progress') acc.inProgress += 1;
      else acc.other += 1;
      return acc;
    }, { total: 0, notStarted: 0, inProgress: 0, submitted: 0, other: 0 });

    return res.json({
      assessment: {
        _id: assessment._id,
        title: assessment.title,
        targetType: assessment.targetType,
        lifecycleStatus: assessment.lifecycleStatus,
        questionSetEnabled: Boolean(assessment.settings?.questionSetEnabled),
        questionSetCount: Number(assessment.settings?.questionSetCount) || 1,
      },
      students: rows,
      summary,
    });
  } catch (err) {
    console.error('Error listing assessment eligible students:', err);
    return res.status(500).json({ error: 'Failed to load eligible students.' });
  }
}

export async function addAssessmentEligibleStudents(req, res) {
  try {
    const { id } = req.params;
    const studentIds = Array.isArray(req.body?.studentIds)
      ? [...new Set(req.body.studentIds.map((value) => String(value || '').trim()).filter(Boolean))]
      : [];
    const studentRefs = Array.isArray(req.body?.students) ? req.body.students : [];
    const refObjectIds = [];
    const refStudentIds = [];
    const refEmails = [];

    studentRefs.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const objectId = String(entry._id || entry.id || '').trim();
      const studentCode = String(entry.studentId || '').trim();
      const email = String(entry.email || '').trim().toLowerCase();
      if (objectId) refObjectIds.push(objectId);
      if (studentCode) refStudentIds.push(studentCode);
      if (email) refEmails.push(email);
    });

    const selectedObjectIds = [...new Set([...studentIds, ...refObjectIds].filter((value) => mongoose.Types.ObjectId.isValid(value)))];
    const selectedStudentIds = [...new Set([
      ...studentIds.filter((value) => !mongoose.Types.ObjectId.isValid(value)),
      ...refStudentIds,
    ].filter(Boolean))];
    const selectedEmails = [...new Set(refEmails.filter(Boolean))];

    if (!selectedObjectIds.length && !selectedStudentIds.length && !selectedEmails.length) {
      return res.status(400).json({ error: 'Select at least one student to add.' });
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!canManageAssessmentForRequest(assessment, req.user)) {
      return res.status(403).json({ error: 'Not allowed to add students to this assessment.' });
    }
    if (assessment.lifecycleStatus === 'draft') {
      return res.status(400).json({ error: 'Edit the draft target list before publishing.' });
    }

    const lookup = [];
    if (selectedObjectIds.length) lookup.push({ _id: { $in: selectedObjectIds } });
    if (selectedStudentIds.length) lookup.push({ studentId: { $in: selectedStudentIds } });
    if (selectedEmails.length) lookup.push({ email: { $in: selectedEmails } });

    const students = await User.find({
      role: 'student',
      $or: lookup,
    })
      .select('_id name email studentId')
      .lean();
    if (!students.length) {
      return res.status(404).json({ error: 'No valid students were found.' });
    }

    const currentStudents = await resolveEligibleAssessmentStudents(assessment);
    const currentIdSet = new Set(currentStudents.map((student) => String(student._id)));
    const addIds = students
      .map((student) => String(student._id))
      .filter((studentId) => !currentIdSet.has(studentId));

    if (!addIds.length) {
      return res.status(400).json({ error: 'Selected students are already eligible for this assessment.' });
    }

    assessment.targetType = 'selected';
    assessment.assignedStudents = [...currentIdSet, ...addIds].map((studentId) => new mongoose.Types.ObjectId(studentId));
    if (assessment.settings?.questionSetEnabled) {
      const newUsers = students.filter((student) => addIds.includes(String(student._id)));
      assessment.candidateSetAssignments = appendCandidateSetAssignments({
        existingAssignments: Array.from(assessment.candidateSetAssignments || []),
        newUsers,
        settings: assessment.settings,
      });
    }
    assessment.version = (assessment.version || 1) + 1;
    assessment.versionUpdatedAt = new Date();
    await assessment.save();

    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: 'UPDATE',
      targetType: 'ASSESSMENT',
      targetId: String(assessment._id),
      description: `Added ${addIds.length} student${addIds.length === 1 ? '' : 's'} to assessment: ${assessment.title || 'Untitled'}`,
      metadata: {
        assessmentId: String(assessment._id),
        addedStudentIds: addIds,
        assignedStudentsCount: assessment.assignedStudents.length,
      },
      req,
    });

    return res.json({
      ok: true,
      addedCount: addIds.length,
      assignedStudentsCount: assessment.assignedStudents.length,
    });
  } catch (err) {
    console.error('Error adding assessment eligible students:', err);
    return res.status(500).json({ error: 'Failed to add students to assessment.' });
  }
}

export async function resetAssessmentStudentSubmission(req, res) {
  try {
    const { id, studentId } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!canManageAssessmentForRequest(assessment, req.user)) {
      return res.status(403).json({ error: 'Not allowed to reset this student submission.' });
    }

    const student = await User.findOne({ _id: studentId, role: 'student' }).select('_id name email studentId').lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    if (!isStudentAssignedToAssessment(assessment, student)) {
      return res.status(400).json({ error: 'Student is not eligible for this assessment.' });
    }

    const result = await deleteAssessmentAttemptData({ assessmentId: assessment._id, studentId: student._id });

    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: 'UPDATE',
      targetType: 'ASSESSMENT',
      targetId: String(assessment._id),
      description: `Reset ${student.name || student.email || 'student'} submission for assessment: ${assessment.title || 'Untitled'}`,
      metadata: {
        assessmentId: String(assessment._id),
        studentId: String(student._id),
        deletedSubmissions: result.deletedCount || 0,
      },
      req,
    });

    return res.json({
      ok: true,
      deletedSubmissions: result.deletedCount || 0,
      message: result.deletedCount ? 'Student submission reset.' : 'No submission existed for this student.',
    });
  } catch (err) {
    console.error('Error resetting student assessment submission:', err);
    return res.status(500).json({ error: 'Failed to reset student submission.' });
  }
}

export async function removeAssessmentEligibleStudent(req, res) {
  try {
    const { id, studentId } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!canManageAssessmentForRequest(assessment, req.user)) {
      return res.status(403).json({ error: 'Not allowed to remove students from this assessment.' });
    }
    if (assessment.lifecycleStatus === 'draft') {
      return res.status(400).json({ error: 'Edit the draft target list before publishing.' });
    }

    const student = await User.findOne({ _id: studentId, role: 'student' }).select('_id name email studentId').lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const currentStudents = await resolveEligibleAssessmentStudents(assessment);
    const currentIds = currentStudents.map((item) => String(item._id));
    if (!currentIds.includes(String(student._id))) {
      return res.status(400).json({ error: 'Student is not currently eligible for this assessment.' });
    }

    assessment.targetType = 'selected';
    assessment.assignedStudents = currentIds
      .filter((idValue) => idValue !== String(student._id))
      .map((idValue) => new mongoose.Types.ObjectId(idValue));
    assessment.candidateSetAssignments = (assessment.candidateSetAssignments || [])
      .filter((assignment) => String(assignment.student) !== String(student._id));
    assessment.version = (assessment.version || 1) + 1;
    assessment.versionUpdatedAt = new Date();
    await assessment.save();

    const result = await deleteAssessmentAttemptData({ assessmentId: assessment._id, studentId: student._id });

    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: 'UPDATE',
      targetType: 'ASSESSMENT',
      targetId: String(assessment._id),
      description: `Removed ${student.name || student.email || 'student'} from assessment: ${assessment.title || 'Untitled'}`,
      metadata: {
        assessmentId: String(assessment._id),
        studentId: String(student._id),
        assignedStudentsCount: assessment.assignedStudents.length,
        deletedSubmissions: result.deletedCount || 0,
      },
      req,
    });

    return res.json({
      ok: true,
      removedStudentId: String(student._id),
      deletedSubmissions: result.deletedCount || 0,
      assignedStudentsCount: assessment.assignedStudents.length,
    });
  } catch (err) {
    console.error('Error removing assessment eligible student:', err);
    return res.status(500).json({ error: 'Failed to remove student from assessment.' });
  }
}

export async function updateAssessmentStudentSet(req, res) {
  try {
    const { id, studentId } = req.params;
    const setNumber = Number(req.body?.setNumber);
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!canManageAssessmentForRequest(assessment, req.user)) {
      return res.status(403).json({ error: 'Not allowed to change set allocation for this assessment.' });
    }
    if (!assessment.settings?.questionSetEnabled) {
      return res.status(400).json({ error: 'Question sets are not enabled for this assessment.' });
    }
    const setCount = Math.min(8, Math.max(2, Number(assessment.settings.questionSetCount) || 2));
    if (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > setCount) {
      return res.status(400).json({ error: `Set must be between 1 and ${setCount}.` });
    }
    if (!(assessment.assignedStudents || []).some((entry) => String(entry) === String(studentId))) {
      return res.status(400).json({ error: 'Student is not assigned to this assessment.' });
    }
    const activeSubmission = await AssessmentSubmission.exists({
      assessmentId: assessment._id,
      studentId,
      status: { $in: ['in_progress', 'submitted'] },
    });
    if (activeSubmission) {
      return res.status(409).json({ error: 'Set cannot be changed after the student has started the assessment.' });
    }
    const student = await User.findById(studentId).select('_id studentId').lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const existingIndex = (assessment.candidateSetAssignments || [])
      .findIndex((assignment) => String(assignment.student) === String(studentId));
    const assignment = {
      student: student._id,
      studentIdSnapshot: student.studentId || '',
      setNumber,
      source: 'manual',
      frozenAt: new Date(),
    };
    if (existingIndex >= 0) assessment.candidateSetAssignments[existingIndex] = assignment;
    else assessment.candidateSetAssignments.push(assignment);
    assessment.markModified('candidateSetAssignments');
    assessment.version = (assessment.version || 1) + 1;
    assessment.versionUpdatedAt = new Date();
    await assessment.save();
    return res.json({ ok: true, studentId: String(student._id), setNumber, source: 'manual' });
  } catch (err) {
    console.error('Error updating assessment student set:', err);
    return res.status(500).json({ error: 'Failed to update student set allocation.' });
  }
}

export async function updateAssessmentStudentSets(req, res) {
  try {
    const { id } = req.params;
    const studentIds = [...new Set((req.body?.studentIds || []).map(String).filter(Boolean))];
    const setNumber = Number(req.body?.setNumber);
    if (!studentIds.length) return res.status(400).json({ error: 'Select at least one student.' });
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!canManageAssessmentForRequest(assessment, req.user)) return res.status(403).json({ error: 'Not allowed to change set allocation.' });
    const setCount = Math.min(8, Math.max(2, Number(assessment.settings?.questionSetCount) || 2));
    if (!assessment.settings?.questionSetEnabled || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > setCount) {
      return res.status(400).json({ error: `Set must be between 1 and ${setCount}.` });
    }
    const assignedIds = new Set((assessment.assignedStudents || []).map(String));
    if (studentIds.some((studentId) => !assignedIds.has(studentId))) return res.status(400).json({ error: 'One or more students are not assigned to this assessment.' });
    const activeSubmission = await AssessmentSubmission.exists({ assessmentId: assessment._id, studentId: { $in: studentIds }, status: { $in: ['in_progress', 'submitted'] } });
    if (activeSubmission) return res.status(409).json({ error: 'Students who already started cannot be moved to another set.' });
    const users = await User.find({ _id: { $in: studentIds }, role: 'student' }).select('_id studentId').lean();
    const assignmentByStudent = new Map((assessment.candidateSetAssignments || []).map((entry) => [String(entry.student), entry]));
    users.forEach((student) => assignmentByStudent.set(String(student._id), {
      student: student._id,
      studentIdSnapshot: student.studentId || '',
      setNumber,
      source: 'manual',
      frozenAt: new Date(),
    }));
    assessment.candidateSetAssignments = Array.from(assignmentByStudent.values());
    assessment.markModified('candidateSetAssignments');
    assessment.version = (assessment.version || 1) + 1;
    assessment.versionUpdatedAt = new Date();
    await assessment.save();
    return res.json({ ok: true, updatedCount: users.length, setNumber });
  } catch (err) {
    console.error('Error bulk updating assessment student sets:', err);
    return res.status(500).json({ error: 'Failed to update student set allocations.' });
  }
}

export async function removeAssessmentEligibleStudents(req, res) {
  try {
    const { id } = req.params;
    const studentIds = [...new Set((req.body?.studentIds || []).map(String).filter(Boolean))];
    if (!studentIds.length) return res.status(400).json({ error: 'Select at least one student to remove.' });
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!canManageAssessmentForRequest(assessment, req.user)) return res.status(403).json({ error: 'Not allowed to remove students from this assessment.' });
    if (assessment.lifecycleStatus === 'draft') return res.status(400).json({ error: 'Edit the draft target list before publishing.' });
    const removeIds = new Set(studentIds);
    const eligibleStudents = await resolveEligibleAssessmentStudents(assessment);
    const currentIds = eligibleStudents.map((student) => String(student._id));
    const previousCount = currentIds.length;
    assessment.targetType = 'selected';
    assessment.assignedStudents = currentIds
      .filter((studentId) => !removeIds.has(studentId))
      .map((studentId) => new mongoose.Types.ObjectId(studentId));
    assessment.candidateSetAssignments = (assessment.candidateSetAssignments || []).filter((entry) => !removeIds.has(String(entry.student)));
    assessment.version = (assessment.version || 1) + 1;
    assessment.versionUpdatedAt = new Date();
    await assessment.save();
    const result = await deleteAssessmentAttemptData({ assessmentId: assessment._id, studentId: { $in: studentIds } });
    return res.json({
      ok: true,
      removedCount: previousCount - assessment.assignedStudents.length,
      deletedSubmissions: result.deletedCount || 0,
      assignedStudentsCount: assessment.assignedStudents.length,
    });
  } catch (err) {
    console.error('Error bulk removing assessment students:', err);
    return res.status(500).json({ error: 'Failed to remove selected students.' });
  }
}

export async function markAssessmentComplete(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all' && assessment.createdBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not allowed to complete this assessment.' });
    }
    if (assessment.lifecycleStatus === 'draft') {
      return res.status(400).json({ error: 'Publish the assessment before marking it complete.' });
    }

    const now = new Date();
    assessment.manuallyCompletedAt = now;
    await assessment.save();

    await logActivity({
      actorId: req.user?._id,
      action: 'assessment.mark_complete',
      entityType: 'assessment',
      entityId: assessment._id,
      description: `Marked assessment complete: ${assessment.title || 'Untitled'}`,
      metadata: { assessmentId: String(assessment._id), completedAt: now },
      req,
    });

    return res.json({
      ok: true,
      message: 'Assessment marked as complete.',
      assessment: sanitizeAssessmentForResponse(assessment.toObject()),
      manuallyCompletedAt: now,
    });
  } catch (err) {
    console.error('Error marking assessment complete:', err);
    return res.status(500).json({ error: 'Failed to mark assessment complete.' });
  }
}

export async function releaseAssessmentAnswers(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all' && assessment.createdBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not allowed to release answers for this assessment.' });
    }
    if (assessment.lifecycleStatus === 'draft') {
      return res.status(400).json({ error: 'Publish the assessment before releasing answers.' });
    }

    const nextSettings = normalizeAssessmentSettings({
      ...normalizeAssessmentSettings(assessment.settings),
      showResultsAfterSubmit: true,
      showCorrectAnswers: true,
      showSectionBreakdown: true,
      showPercentile: true,
      resultDelayHours: 0,
    });
    assessment.settings = nextSettings;
    await assessment.save();

    await logActivity({
      actorId: req.user?._id,
      action: 'assessment.release_answers',
      entityType: 'assessment',
      entityId: assessment._id,
      description: `Released report answers for assessment: ${assessment.title || 'Untitled'}`,
      metadata: {
        assessmentId: String(assessment._id),
        releasedSettings: {
          showResultsAfterSubmit: true,
          showCorrectAnswers: true,
          showSectionBreakdown: true,
          showPercentile: true,
          resultDelayHours: 0,
        },
      },
      req,
    });

    return res.json({
      ok: true,
      message: 'Answers and detailed reports released to students.',
      assessment: sanitizeAssessmentForResponse(assessment.toObject()),
    });
  } catch (err) {
    console.error('Error releasing assessment answers:', err);
    return res.status(500).json({ error: 'Failed to release assessment answers.' });
  }
}

async function loadInvitationAssessment(req) {
  const assessment = await Assessment.findById(req.params.id).select('+passwordEncrypted');
  if (!assessment) return null;
  if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all' && String(assessment.createdBy) !== String(req.user._id)) {
    const error = new Error('Not allowed to manage invitations for this assessment.');
    error.status = 403;
    throw error;
  }
  return assessment;
}

function invitationSample(assessment, template, to = 'student@example.com') {
  return renderAssessmentInvitationEmail({
    to, assessment, student: { name: 'Sample Student' },
    password: assessment.passwordEnabled ? 'SAMPLE-ASSESSMENT-PASSWORD' : '',
    accountPassword: 'SAMPLE-LOGIN-PASSWORD', assessmentOnly: true, template,
  });
}

export async function getAssessmentInvitationEditor(req, res) {
  try {
    const assessment = await loadInvitationAssessment(req);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    const defaults = await getAssessmentInvitationTemplate({});
    const template = await getAssessmentInvitationTemplate(assessment);
    return res.json({ subject: template.subject, htmlContent: template.htmlContent,
      isCustom: Boolean(assessment.invitationTemplate?.subject && assessment.invitationTemplate?.htmlContent),
      defaultSubject: defaults.subject, defaultHtmlContent: defaults.htmlContent,
      sample: invitationSample(assessment, template) });
  } catch (err) { return res.status(err.status || 500).json({ error: err.message || 'Could not load invitation.' }); }
}

export async function previewAssessmentInvitation(req, res) {
  try {
    const assessment = await loadInvitationAssessment(req);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    const template = validateAssessmentInvitationTemplate(req.body);
    return res.json({ sample: invitationSample(assessment, template) });
  } catch (err) { return res.status(err.status || 400).json({ error: err.message || 'Could not preview invitation.' }); }
}

export async function updateAssessmentInvitation(req, res) {
  try {
    const assessment = await loadInvitationAssessment(req);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    assessment.invitationTemplate = req.body?.useDefault ? { subject: '', htmlContent: '' } : validateAssessmentInvitationTemplate(req.body);
    await assessment.save();
    return res.json({ ok: true, isCustom: !req.body?.useDefault });
  } catch (err) { return res.status(err.status || 400).json({ error: err.message || 'Could not save invitation.' }); }
}

export async function sendAssessmentInvitationTest(req, res) {
  try {
    const assessment = await loadInvitationAssessment(req);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    const to = String(req.body?.to || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) return res.status(400).json({ error: 'Enter a valid test email address.' });
    const template = validateAssessmentInvitationTemplate(req.body);
    const sample = invitationSample(assessment, template, to);
    await sendAssessmentInvitationEmail({ to, renderedEmail: { subject: `[TEST] ${sample.subject}`, html: sample.html } });
    return res.json({ ok: true, to });
  } catch (err) { return res.status(err.status || 400).json({ error: err.message || 'Could not send test email.' }); }
}

export async function sendAssessmentInvitations(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id).select('+passwordEncrypted');
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all' && String(assessment.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not allowed to send invitations for this assessment.' });
    }
    if (assessment.lifecycleStatus !== 'published') {
      return res.status(400).json({ error: 'Publish the assessment before sending invitations.' });
    }
    let invitationPassword = '';
    if (assessment.passwordEnabled) {
      if (!assessment.passwordEncrypted) {
        return res.status(409).json({ error: 'This older assessment cannot recover its password. Open Edit Assessment and set the password once, then resend invitations.' });
      }
      try {
        invitationPassword = decryptAssessmentPassword(assessment.passwordEncrypted);
      } catch {
        return res.status(500).json({ error: 'The saved assessment password could not be prepared for the invitation.' });
      }
    }

    const students = (await resolveEligibleAssessmentStudents(assessment)).filter((student) => student.email);
    if (!students.length) return res.status(400).json({ error: 'No eligible students with email addresses were found.' });

    const batchId = crypto.randomUUID();
    const invitationTemplate = await getAssessmentInvitationTemplate(assessment);
    const queuedResult = await enqueueMailJobs(students.map((student) => {
      const accountPassword = student.accessScope === 'assessment_only' && student.temporaryPasswordEncrypted
        ? decryptAssessmentPassword(student.temporaryPasswordEncrypted) : '';
      return ({
      type: 'assessment_invitation',
      to: student.email,
      recipientId: student._id,
      targetType: 'ASSESSMENT',
      targetId: assessment._id,
      idempotencyKey: `assessment:${assessment._id}:${student._id}:${batchId}`,
      payload: {
        to: student.email,
        assessment: assessment.toObject(),
        student,
        password: invitationPassword,
        accountPassword,
        assessmentOnly: student.accessScope === 'assessment_only',
        renderedEmail: renderAssessmentInvitationEmail({
          to: student.email, assessment, student, password: invitationPassword,
          accountPassword,
          assessmentOnly: student.accessScope === 'assessment_only', template: invitationTemplate,
        }),
      },
    }); }), {
      batchId,
      requestedBy: req.user._id,
      requestedByEmail: req.user.email,
    });
    logActivity({
      userEmail: req.user?.email,
      userRole: req.user?.role,
      actionType: 'UPDATE',
      targetType: 'ASSESSMENT',
      targetId: String(assessment._id),
      description: `Queued assessment invitations for ${students.length} eligible student${students.length === 1 ? '' : 's'}`,
      metadata: { assessmentId: String(assessment._id), eligible: students.length, batchId },
      req,
    });

    return res.status(202).json({ ok: true, eligible: students.length, ...queuedResult });
  } catch (err) {
    console.error('Error sending assessment invitations:', err);
    return res.status(500).json({ error: 'Failed to send assessment invitations.' });
  }
}

export async function listStudentAssessments(req, res) {
  try {
    const studentId = req.user._id;
    const assessments = await Assessment.find({
      lifecycleStatus: { $ne: 'draft' },
      isVisible: { $ne: false },
      startTime: { $ne: null },
      endTime: { $ne: null },
      $or: [
        { targetType: 'all' },
        { assignedStudents: studentId },
      ],
    }).sort({ startTime: 1 }).lean();

    const submissions = await AssessmentSubmission.find({ studentId }).lean();
    const submissionsByAssessment = new Map(submissions.map(s => [s.assessmentId.toString(), s]));

    const now = new Date();
    const eligibleAssessments = assessments.filter((assessment) => isStudentAssignedToAssessment(assessment, req.user));
    const data = eligibleAssessments.map((a) => {
      const submission = submissionsByAssessment.get(a._id.toString());
      let status = 'Not Started';
      if (submission?.status === 'submitted') status = 'Completed';
      else if (submission?.status === 'violation') status = 'Violation';
      else if (a.manuallyCompletedAt) status = 'Completed';
      else if (now >= a.startTime && now <= a.endTime) status = 'Available';
      else if (now > a.endTime) status = 'Completed';

      return {
        _id: a._id,
        title: a.title,
        description: a.description,
        instructions: a.instructions || '',
        customInstructions: a.customInstructions || [],
        startTime: a.startTime,
        endTime: a.endTime,
        duration: a.duration,
        sections: buildStudentSectionSummary(a.sections || []),
        totalSections: Array.isArray(a.sections) ? a.sections.length : 0,
        totalMarks: a.totalMarks || computeTotalMarksFromSections(a.sections || []),
        totalQuestions: countQuestions(a.sections || []),
        assessmentType: a.assessmentType || 'mixed',
        attemptLimit: a.attemptLimit,
        passwordEnabled: Boolean(a.passwordEnabled),
        settings: a.settings || {},
        status,
        submittedAt: submission?.submittedAt,
        manuallyCompletedAt: a.manuallyCompletedAt || null,
      };
    });

    res.json({ count: data.length, assessments: data, serverTime: now });
  } catch (err) {
    console.error('Error listing student assessments:', err);
    res.status(500).json({ error: 'Failed to load assessments' });
  }
}

export async function getStudentAssessmentDashboard(req, res) {
  try {
    const studentId = String(req.user?._id || '');
    const now = new Date();

    await reconcileExpiredAssessmentSubmissions({ studentId: req.user._id });

    const [assessments, studentSubmissions] = await Promise.all([
      Assessment.find({
        lifecycleStatus: { $ne: 'draft' },
        isVisible: { $ne: false },
        startTime: { $ne: null },
        endTime: { $ne: null },
        $or: [
          { targetType: 'all' },
          { assignedStudents: req.user._id },
        ],
      }).sort({ startTime: -1, createdAt: -1 }).lean(),
      AssessmentSubmission.find({ studentId: req.user._id }).sort({ updatedAt: -1 }).lean(),
    ]);

    const submissionsByAssessment = new Map(
      studentSubmissions.map((submission) => [String(submission.assessmentId), submission]),
    );
    const submittedAssessmentIds = studentSubmissions
      .filter((submission) => submission?.status === 'submitted' && submission.assessmentId)
      .map((submission) => submission.assessmentId);
    const rankInfoByAssessment = await buildStudentRankInfoByAssessment(submittedAssessmentIds, req.user._id);

    const ongoingAssessments = [];
    const upcomingAssessments = [];
    const completedAssessments = [];
    const reportRows = [];

    assessments
      .filter((assessment) => isStudentAssignedToAssessment(assessment, req.user))
      .forEach((assessment) => {
      const assessmentId = String(assessment._id);
      const submission = submissionsByAssessment.get(assessmentId);
      const totalMarks = Number(assessment.totalMarks || computeTotalMarksFromSections(assessment.sections || []));
      const totalQuestions = countQuestions(assessment.sections || []);
      const startsAt = assessment.startTime ? new Date(assessment.startTime) : null;
      const endsAt = assessment.endTime ? new Date(assessment.endTime) : null;
      const isManuallyCompleted = Boolean(assessment.manuallyCompletedAt);
      const isUpcoming = startsAt && now < startsAt;
      const isLive = startsAt && endsAt && now >= startsAt && now <= endsAt && !isManuallyCompleted;
      const isCompletedWindow = isManuallyCompleted || (endsAt && now > endsAt);
      const hasExpiredLongEnough = endsAt ? (now.getTime() - endsAt.getTime()) > ASSESSMENT_EXPIRY_GRACE_MS : false;

      if ((isUpcoming || isLive || isCompletedWindow) && (!hasExpiredLongEnough || isManuallyCompleted || submission?.status === 'submitted')) {
        const hasSubmitted = submission?.status === 'submitted';
        const status = hasSubmitted || isCompletedWindow ? 'Completed' : isLive ? 'Live' : 'Upcoming';
        const card = {
          _id: assessment._id,
          title: assessment.title || 'Untitled Assessment',
          description: assessment.description || '',
          instructions: assessment.instructions || '',
          customInstructions: assessment.customInstructions || [],
          startTime: assessment.startTime,
          endTime: assessment.endTime,
          duration: assessment.duration || 0,
          sections: buildStudentSectionSummary(assessment.sections || []),
          totalSections: Array.isArray(assessment.sections) ? assessment.sections.length : 0,
          totalMarks,
          totalQuestions,
          assessmentType: assessment.assessmentType || 'mixed',
          passwordEnabled: Boolean(assessment.passwordEnabled),
          passwordUnlocked: Boolean(!assessment.passwordEnabled || submission?.passwordVerifiedAt),
          settings: assessment.settings || {},
          status,
          actionLabel: hasSubmitted || isCompletedWindow ? 'Completed' : submission?.status === 'in_progress' ? 'Continue' : 'Start',
          hasSubmitted,
          hasSubmissionInProgress: !isCompletedWindow && submission?.status === 'in_progress',
          submittedAt: submission?.submittedAt || null,
          manuallyCompletedAt: assessment.manuallyCompletedAt || null,
        };

        if (isLive) ongoingAssessments.push(card);
        else if (isUpcoming) upcomingAssessments.push(card);
        else completedAssessments.push(card);
      }

      if (submission && (submission.startedAt || submission.submittedAt || submission.updatedAt)) {
        reportRows.push(buildStudentReportRow(assessment, submission, {
          rankInfo: rankInfoByAssessment.get(assessmentId) || null,
          now,
        }));
      }
    });

    const sortedReports = reportRows.sort(
      (a, b) => new Date(b.dateAttempted || 0).getTime() - new Date(a.dateAttempted || 0).getTime(),
    );

    const historyRows = sortedReports.filter((row) => row.status === 'Completed');

    const completedReports = sortedReports.filter((row) => row.status === 'Completed');
    const visibleScoreReports = completedReports.filter((row) => row.permissions?.canViewScore);
    const averageScore = visibleScoreReports.length
      ? Number((visibleScoreReports.reduce((sum, row) => sum + Number(row.score || 0), 0) / visibleScoreReports.length).toFixed(2))
      : 0;
    const bestScore = visibleScoreReports.length
      ? Math.max(...visibleScoreReports.map((row) => Number(row.score || 0)))
      : 0;

    res.json({
      serverTime: now,
      currentStudent: {
        id: studentId,
      },
      overview: {
        upcomingCount: upcomingAssessments.length,
        liveCount: ongoingAssessments.length,
        completedCount: completedAssessments.length,
        reportsCount: sortedReports.length,
        historyCount: historyRows.length,
        averageScore,
        bestScore,
      },
      upcomingAssessments,
      ongoingAssessments,
      completedAssessments,
      reports: sortedReports,
      history: historyRows,
    });
  } catch (err) {
    console.error('Error loading student assessment dashboard:', err);
    res.status(500).json({ error: 'Failed to load assessment dashboard' });
  }
}

async function requireStudentAssessment(id, student, { metadataOnly = false } = {}) {
  const assessment = await findAssessmentForStudentRoute(id, { lean: true,
    ...(metadataOnly ? { select: 'settings duration startTime endTime lifecycleStatus targetType assignedStudents passwordEnabled passwordHash manuallyCompletedAt' } : {}),
  });
  if (!assessment) throw new AssessmentWriteError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  if (assessment.lifecycleStatus === 'draft') throw new AssessmentWriteError(403, 'ASSESSMENT_DRAFT', 'Assessment is not published yet.');
  if (!assessment.startTime || !assessment.endTime || !assessment.duration) throw new AssessmentWriteError(400, 'INVALID_SCHEDULE', 'Assessment schedule is incomplete.');
  if (!isStudentAssignedToAssessment(assessment, student)) throw new AssessmentWriteError(403, 'NOT_ASSIGNED', 'Not assigned to this assessment.');
  return assessment;
}

async function ensureStudentAttempt(assessment, studentId, { passwordVerified = false } = {}) {
  const filter = { assessmentId: assessment._id, studentId };
  let doc = await AssessmentSubmission.findOne(filter).select('-proctoringSnapshots -monitoringEvents');
  if (doc) return doc;
  const now = new Date();
  if (now > assessment.endTime || assessment.manuallyCompletedAt) throw new AssessmentWriteError(403, 'ASSESSMENT_CLOSED', 'Assessment has closed.');
  const delivery = buildDeliverySections(assessment, studentId);
  try {
    return await AssessmentSubmission.create({
      ...filter,
      deliverySections: delivery.sections,
      deliveryPreparedAt: now,
      assignedSetNumber: delivery.assignedSetNumber,
      passwordVerifiedAt: passwordVerified ? now : undefined,
      status: 'not_started',
      attemptCount: 0,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Two simultaneous unlock requests share the unique student/assessment key.
    doc = await AssessmentSubmission.findOne(filter);
    if (!doc) throw error;
    return doc;
  }
}

function prepareAttemptDelivery(doc, assessment, studentId, now) {
  if (doc.deliveryPreparedAt) return;
  const delivery = buildDeliverySections(assessment, studentId);
  doc.deliverySections = delivery.sections;
  doc.deliveryPreparedAt = now;
  doc.assignedSetNumber = delivery.assignedSetNumber;
}

function finalizeIfDeadlinePassed(doc, assessment, now) {
  if (doc.status !== 'in_progress') return false;
  const delivered = assessmentForSubmission(assessment, doc);
  const settings = normalizeAssessmentSettings(assessment.settings || {});
  const allowedEnd = computeAllowedEnd(delivered, doc.startedAt || now, doc.pausedDurationMs);
  const expired = ((now > allowedEnd || hasSecurityPauseExpired(doc, settings, now))
    && !isSecurityPauseWithinLimit(doc, settings, now)) || Boolean(assessment.manuallyCompletedAt);
  if (!expired) return false;
  const timeTakenSec = computeEffectiveTimeTakenSec(doc, now);
  if (doc.pauseStartedAt) finishSubmissionSecurityPause(doc, now);
  return finishAssessmentSubmission(doc, { now, timeTakenSec });
}

async function studentAttemptResponse(assessment, submission, student, now, message) {
  const delivered = assessmentForSubmission(assessment, submission);
  const attemptAssessment = await hydrateAssessmentCodingRuntime(delivered);
  return {
    ...(message ? { message } : {}),
    assessment: sanitizeStudentAssessmentForResponse(attemptAssessment),
    submission: sanitizeStudentSubmissionForResponse(submission),
    candidate: buildCandidateIdentity(student),
    serverTime: now,
    allowedEnd: computeAllowedEnd(delivered, submission.startedAt || now, submission.pausedDurationMs),
    securityRecheckTimeoutSec: getSecurityRecheckTimeoutSec(assessment.settings || {}),
    requiresSecuritySetup: !isTerminalAssessmentSubmission(submission) && !submission.securityCompletedAt,
    requiredSecuritySteps: getRequiredSecuritySteps(assessment.settings || {}, submission),
    completedSecuritySteps: getCompletedSecuritySteps(submission),
  };
}

export async function getStudentAssessment(req, res) {
  try {
    const assessment = await requireStudentAssessment(req.params.id, req.user);
    const now = new Date();
    if (now < assessment.startTime) throw new AssessmentWriteError(403, 'NOT_STARTED', 'Assessment has not started yet.');
    const existing = await AssessmentSubmission.findOne({ assessmentId: assessment._id, studentId: req.user._id });
    const check = await ensureAssessmentPasswordUnlocked(assessment, existing);
    if (!check.ok) throw new AssessmentWriteError(check.status, 'ASSESSMENT_LOCKED', check.error);
    await ensureStudentAttempt(assessment, req.user._id);
    const { submission } = await mutateAssessmentSubmission({
      filter: { assessmentId: assessment._id, studentId: req.user._id },
      mutate: (doc) => {
        if (isTerminalAssessmentSubmission(doc)) return;
        prepareAttemptDelivery(doc, assessment, req.user._id, now);
        if (doc.pauseStartedAt && doc.securityPauseReason !== 'tab_switch') {
          finishSubmissionSecurityPause(doc, now);
          doc.securityCompletedAt = doc.securityCompletedAt || doc.startedAt || now;
        }
        if (doc.status === 'in_progress' && doc.startedAt && !doc.securityCompletedAt) doc.securityCompletedAt = doc.startedAt;
        finalizeIfDeadlinePassed(doc, assessment, now);
      },
    });
    return res.json(await studentAttemptResponse(assessment, submission, req.user, now));
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

export async function startStudentAssessment(req, res) {
  try {
    const assessment = await requireStudentAssessment(req.params.id, req.user);
    const now = new Date();
    if (now < assessment.startTime || now > assessment.endTime || assessment.manuallyCompletedAt) {
      throw new AssessmentWriteError(403, 'ASSESSMENT_CLOSED', 'Assessment is outside the active time window.');
    }
    let existing = await AssessmentSubmission.findOne({ assessmentId: assessment._id, studentId: req.user._id });
    const check = await ensureAssessmentPasswordUnlocked(assessment, existing, req.body?.password);
    if (!check.ok) throw new AssessmentWriteError(check.status, 'ASSESSMENT_LOCKED', check.error);
    existing = await ensureStudentAttempt(assessment, req.user._id, { passwordVerified: assessment.passwordEnabled });
    let archivedGeneration = null;
    if (isTerminalAssessmentSubmission(existing)) {
      if (existing.attemptCount >= (assessment.attemptLimit || 1)) throw new AssessmentWriteError(403, 'ATTEMPT_LIMIT', 'No attempts remaining for this assessment.');
      if (existing.evaluationStatus === 'processing') throw new AssessmentWriteError(409, 'EVALUATION_PENDING', 'Wait for the previous attempt evaluation before starting a retake.');
      archivedGeneration = Number(existing.attemptGeneration || 1);
      await AssessmentAttemptArchive.updateOne(
        { submissionId: existing._id, attemptGeneration: archivedGeneration },
        { $setOnInsert: { assessmentId: assessment._id, studentId: req.user._id, snapshot: existing.toObject() } },
        { upsert: true },
      );
    }
    const { submission } = await mutateAssessmentSubmission({
      filter: { _id: existing._id, studentId: req.user._id },
      mutate: (doc) => {
        if (isTerminalAssessmentSubmission(doc)) {
          if (archivedGeneration !== Number(doc.attemptGeneration || 1)) throw new AssessmentWriteError(409, 'ATTEMPT_CHANGED', 'Reload the attempt before starting a retake.');
          if (doc.attemptCount >= (assessment.attemptLimit || 1)) throw new AssessmentWriteError(403, 'ATTEMPT_LIMIT', 'No attempts remaining for this assessment.');
          doc.attemptGeneration = archivedGeneration + 1;
          doc.status = 'not_started';
          doc.answers = [];
          doc.answerRevision = 0;
          doc.lastAcceptedBatch = { id: '', sequence: 0, hash: '' };
          doc.submissionReceipt = '';
          doc.startedAt = undefined;
          doc.submittedAt = undefined;
          doc.pendingWork = undefined;
          doc.evaluationStatus = 'completed';
          doc.score = undefined;
          doc.accuracy = undefined;
          doc.pausedDurationMs = 0;
          doc.deadlineAt = undefined;
          doc.lastNetworkPauseAt = undefined;
          doc.lastPauseAt = undefined;
          doc.lastSavedAt = undefined;
          doc.securityHeartbeat = {};
          doc.timeTakenSec = undefined;
          doc.isLate = false;
          doc.codingJobsPending = 0;
          doc.codingJobsCompleted = 0;
          doc.pauseStartedAt = undefined;
          doc.securityPauseReason = undefined;
          doc.activeSessionId = '';
          doc.activeSessionHeartbeatAt = undefined;
          doc.securityCompletedAt = undefined;
          doc.securitySetup = {};
          doc.violationLog = [];
          doc.violations = [];
          doc.aiProctoringSummary = {};
          for (const field of ['tabSwitches', 'fullscreenExits', 'copyPasteCount', 'cameraFlags', 'violationScore', 'pauseCount']) doc[field] = 0;
        }
        if (assessment.passwordEnabled && !doc.passwordVerifiedAt) doc.passwordVerifiedAt = now;
        prepareAttemptDelivery(doc, assessment, req.user._id, now);
        // Repeated start requests cannot clear completed setup or an active exam.
      },
    });
    return res.json(await studentAttemptResponse(assessment, submission, req.user, now, 'Assessment unlocked'));
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

export async function beginStudentAssessment(req, res) {
  try {
    const assessment = await requireStudentAssessment(req.params.id, req.user);
    const now = new Date();
    const sessionId = String(req.body?.sessionId || '').trim().slice(0, 160);
    if (!sessionId) throw new AssessmentWriteError(400, 'SESSION_REQUIRED', 'Assessment session identifier is required.');
    const otherActive = await AssessmentSubmission.findOne({
      studentId: req.user._id, assessmentId: { $ne: assessment._id }, status: 'in_progress',
      activeSessionHeartbeatAt: { $gte: new Date(now.getTime() - ACTIVE_SESSION_FRESH_MS) },
      activeSessionId: { $nin: ['', null] },
    }).select('_id');
    if (otherActive) throw new AssessmentWriteError(409, 'ACTIVE_ASSESSMENT_SESSION', 'This account already has another assessment in progress.');
    const { submission } = await mutateAssessmentSubmission({
      filter: { assessmentId: assessment._id, studentId: req.user._id },
      mutate: async (doc) => {
        if (req.body?.submissionId !== undefined && String(req.body.submissionId) !== String(doc._id)) {
          throw new AssessmentWriteError(409, 'ATTEMPT_IDENTITY_CONFLICT', 'This request belongs to a different assessment attempt.');
        }
        if (isTerminalAssessmentSubmission(doc)) return;
        if (req.body?.attemptGeneration !== undefined && Number(req.body.attemptGeneration) !== Number(doc.attemptGeneration || 1)) {
          throw new AssessmentWriteError(409, 'ATTEMPT_GENERATION_CONFLICT', 'This request belongs to an earlier attempt.');
        }
        const fresh = doc.activeSessionId && now - new Date(doc.activeSessionHeartbeatAt || 0) < ACTIVE_SESSION_FRESH_MS;
        if (fresh && doc.activeSessionId !== sessionId) throw new AssessmentWriteError(409, 'ACTIVE_ASSESSMENT_SESSION', 'This assessment is already active in another tab, browser, or device.');
        if (finalizeIfDeadlinePassed(doc, assessment, now)) return;
        const settings = normalizeAssessmentSettings(assessment.settings || {});
        if (now < assessment.startTime || (now > assessment.endTime && !isSecurityPauseWithinLimit(doc, settings, now)) || assessment.manuallyCompletedAt) {
          throw new AssessmentWriteError(403, 'ASSESSMENT_CLOSED', 'Assessment is outside the active time window.');
        }
        const check = await ensureAssessmentPasswordUnlocked(assessment, doc);
        if (!check.ok) throw new AssessmentWriteError(check.status, 'ASSESSMENT_LOCKED', check.error);
        const required = getRequiredSecuritySteps(assessment.settings || {}, doc);
        if (!hasCompletedRequiredSecuritySteps(doc, required)) throw new AssessmentWriteError(403, 'SETUP_REQUIRED', 'Complete all required security setup steps before starting the assessment.', { requiredSecuritySteps: required, completedSecuritySteps: getCompletedSecuritySteps(doc) });
        prepareAttemptDelivery(doc, assessment, req.user._id, now);
        if (!doc.startedAt || doc.status === 'not_started') {
          doc.startedAt = now;
          doc.status = 'in_progress';
        }
        doc.securityCompletedAt = doc.securityCompletedAt || now;
        if (doc.pauseStartedAt) finishSubmissionSecurityPause(doc, now);
        doc.activeSessionId = sessionId;
        doc.activeSessionHeartbeatAt = now;
        doc.lastIp = req.ip;
        doc.lastUserAgent = String(req.headers['user-agent'] || '').slice(0, 1024);
        doc.deadlineAt = getAssessmentAttemptDeadline(assessmentForSubmission(assessment, doc), doc);
      },
    });
    if (!submission) throw new AssessmentWriteError(404, 'ATTEMPT_NOT_FOUND', 'Unlock the assessment first.');
    return res.json(await studentAttemptResponse(assessment, submission, req.user, now, isTerminalAssessmentSubmission(submission) ? 'Assessment already submitted' : 'Assessment started'));
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

function respondAssessmentWriteError(res, error) {
  if (error.status) return res.status(error.status).json({ error: error.message, code: error.code, ...(error.details || {}) });
  if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid assessment identifier.' });
  console.error('Assessment write failed:', error);
  return res.status(500).json({ error: 'Failed to save assessment. Retry the same request.' });
}

async function persistStudentAnswers(req, res, { autosave = false } = {}) {
  try {
    const input = req.body || {};
    assertAssessmentWriteProtocol(input);
    const assessmentId = autosave ? req.params.id : input.assessmentId;
    if (!assessmentId) return res.status(400).json({ error: 'assessmentId is required.' });
    const assessment = await loadAssessmentDefinition({ _id: assessmentId });
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    if (assessment.lifecycleStatus === 'draft') return res.status(403).json({ error: 'Assessment is not published yet.' });
    if (!assessment.startTime || !assessment.endTime || !assessment.duration) {
      return res.status(400).json({ error: 'Assessment schedule is incomplete.' });
    }
    if (!isStudentAssignedToAssessment(assessment, req.user)) return res.status(403).json({ error: 'Not assigned to this assessment.' });
    // The old POST endpoint remains compatible with existing autosave clients.
    const final = !autosave && ['submitted', 'violation'].includes(input.status);
    const now = new Date();
    if (now < assessment.startTime) return res.status(403).json({ error: 'Assessment has not started yet.' });
    const { submission, result } = await mutateAssessmentSubmission({
      filter: { assessmentId: assessment._id, studentId: req.user._id },
      mutate: async (doc) => {
        assertAssessmentSession(doc, input);
        if (isTerminalAssessmentSubmission(doc)) {
          // A saved terminal attempt is immutable, even if retakes are allowed.
          // Starting a retake is an explicit start transition with a new generation.
          if (!doc.submissionReceipt) doc.submissionReceipt = crypto.randomUUID();
          const incoming = normalizeAssessmentAnswerChanges(input.answers ?? [], assessmentForSubmission(assessment, doc).sections);
          return { alreadySubmitted: true, answersAccepted: doc.lastAcceptedBatch?.answersAccepted !== false
            && assessmentBatchMatches(doc, { mutationId: input.mutationId, saveSequence: input.saveSequence, answers: incoming, final }) };
        }
        if (doc.status !== 'in_progress' || !doc.startedAt || !doc.securityCompletedAt) {
          throw new AssessmentWriteError(409, 'ASSESSMENT_NOT_STARTED', 'Complete setup and begin the assessment before saving.');
        }
        const passwordCheck = await ensureAssessmentPasswordUnlocked(assessment, doc);
        if (!passwordCheck.ok) throw new AssessmentWriteError(passwordCheck.status, 'ASSESSMENT_LOCKED', passwordCheck.error);
        const delivered = assessmentForSubmission(assessment, doc);
        const settings = normalizeAssessmentSettings(assessment.settings || {});
        const allowedEnd = computeAllowedEnd(delivered, doc.startedAt, doc.pausedDurationMs);
        const expired = ((now > allowedEnd && !isSecurityPauseWithinLimit(doc, settings, now))
          || hasSecurityPauseExpired(doc, settings, now) || Boolean(assessment.manuallyCompletedAt));
        const incoming = normalizeAssessmentAnswerChanges(input.answers ?? [], delivered.sections);
        if (!acceptAssessmentBatch(doc, { mutationId: input.mutationId, saveSequence: input.saveSequence, answers: incoming, final })) {
          return { duplicate: true, answersAccepted: doc.lastAcceptedBatch?.answersAccepted !== false };
        }
        // A terminal transition caused by the deadline grades the last accepted
        // answer set. Offline edits do not silently extend the exam deadline.
        const acceptAnswers = !expired || assessment.allowLateSubmission;
        if (input.mutationId && !acceptAnswers) doc.lastAcceptedBatch.answersAccepted = false;
        if (acceptAnswers) {
          const merged = mergeAssessmentAnswers(doc.answers, incoming);
          const error = validateQuestionAttemptCounts(delivered, merged, final && !expired);
          if (error) throw new AssessmentWriteError(400, 'QUESTION_ATTEMPT_LIMIT', error);
          doc.answers = merged;
          doc.answerRevision = Number(doc.answerRevision || 0) + 1;
        }
        // Counters may only increase. Pause timestamps/deadline and grading
        // fields can only be modified by their server-side services.
        for (const field of ['tabSwitches', 'fullscreenExits', 'copyPasteCount', 'cameraFlags', 'violationScore']) {
          const value = input[field];
          if (Number.isFinite(value) && value >= 0 && value <= 1000000) doc[field] = Math.max(Number(doc[field] || 0), value);
        }
        doc.lastSavedAt = now;
        doc.lastIp = req.ip;
        doc.lastUserAgent = String(req.headers['user-agent'] || '').slice(0, 1024);
        if (final || (expired && !assessment.allowLateSubmission)) {
          if (doc.pauseStartedAt) finishSubmissionSecurityPause(doc, now);
          finishAssessmentSubmission(doc, {
            now,
            finalStatus: input.status === 'violation' ? 'violation' : 'submitted',
            isLate: expired && Boolean(assessment.allowLateSubmission),
            timeTakenSec: computeEffectiveTimeTakenSec(doc, now),
          });
        }
        doc.deadlineAt = getAssessmentAttemptDeadline(delivered, doc);
        return { expired, answersAccepted: acceptAnswers };
      },
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found. Start the assessment first.' });
    return res.json({
      message: result?.alreadySubmitted ? 'Assessment already submitted' : 'Saved',
      status: submission.status,
      submittedAt: submission.submittedAt,
      serverTime: now,
      allowedEnd: computeAllowedEnd(assessmentForSubmission(assessment, submission), submission.startedAt || now, submission.pausedDurationMs),
      evaluationStatus: submission.evaluationStatus,
      answersAccepted: result?.answersAccepted !== false,
      ...assessmentWriteAcknowledgement(submission),
    });
  } catch (error) {
    return respondAssessmentWriteError(res, error);
  }
}

export async function submitAssessment(req, res) {
  return persistStudentAnswers(req, res);
}

export async function saveAssessmentProgress(req, res) {
  return persistStudentAnswers(req, res, { autosave: true });
}

function parseReportDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeScore(value) {
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function parseCsvList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseCsvList(item));
  }
  if (value === undefined || value === null) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTextRegex(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return new RegExp(escapeRegex(normalized), 'i');
}

function deriveAssessmentMetadata(assessment = {}) {
  const tags = new Set();
  const categories = new Set();

  (assessment.sections || []).forEach((section) => {
    (section.questions || []).forEach((question) => {
      (question.tags || []).forEach((tag) => {
        const normalized = String(tag || '').trim();
        if (normalized) tags.add(normalized);
      });

      const codingCategory = question?.coding?.category || question?.problemDataSnapshot?.category;
      if (codingCategory) {
        categories.add(String(codingCategory).trim());
      }
    });
  });

  return {
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
  };
}

function matchesDateRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export async function getAssessmentReports(req, res) {
  let releaseReportSlot;
  try {
    releaseReportSlot = acquireAssessmentReportSlot();
    const reportAggregate = createBoundedReportAggregate();
    const {
      assessmentId,
      assessmentType,
      studentId,
      studentQuery,
      status,
      hasViolations,
      assessmentWindow,
      from,
      to,
      scoreMin,
      scoreMax,
      sortKey = 'attemptDate',
      sortDir = 'desc',
      page = 1,
      limit = 25,
      passMark = 0.4,
    } = req.query || {};

    if (assessmentId && !mongoose.Types.ObjectId.isValid(assessmentId)) {
      return res.status(400).json({ error: 'Invalid assessmentId' });
    }
    if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid studentId' });
    }

    // Dashboard callers only need headline metrics and five recent assessments.
    // Keep the full reporting pipeline for the reports workspace.
    if (req.query.view === 'dashboard') {
      const assessmentScope = { lifecycleStatus: { $ne: 'draft' }, ...buildAssessmentCollectionWindowMatch(assessmentWindow) };
      if (assessmentId) assessmentScope._id = new mongoose.Types.ObjectId(assessmentId);
      if (assessmentType) assessmentScope.assessmentType = assessmentType;
      if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') {
        assessmentScope.createdBy = req.user._id;
      }
      const [snapshot = {}] = await reportAggregate(Assessment, [
        { $match: assessmentScope },
        { $lookup: { from: 'assessmentreportsummaries', localField: '_id', foreignField: '_id', as: 'summaryRow' } },
        { $set: { summaryRow: { $first: '$summaryRow' } } },
        { $facet: {
          summary: [{ $group: {
            _id: null,
            total: { $sum: '$summaryRow.submissionCount' },
            gradedCount: { $sum: '$summaryRow.gradedCount' },
            scoreSum: { $sum: '$summaryRow.scoreSum' },
            passCount: { $sum: '$summaryRow.passCount' },
            pendingEvaluationCount: { $sum: '$summaryRow.pendingEvaluationCount' },
            failedEvaluationCount: { $sum: '$summaryRow.failedEvaluationCount' },
            pendingSummaries: { $sum: { $cond: [{ $ifNull: ['$summaryRow.computedAt', false] }, 0, 1] } },
            violations: { $sum: '$summaryRow.violationCount' },
            asOf: { $min: '$summaryRow.computedAt' },
            ...Object.fromEntries([0, 1, 2, 3, 4].map((index) => [`bucket${index}`, { $sum: { $arrayElemAt: ['$summaryRow.scoreDistribution', index] } }])),
          } }],
          recent: [
            { $sort: { createdAt: -1 } }, { $limit: 5 },
            { $project: { title: 1, createdAt: 1, submissionCount: '$summaryRow.submissionCount', avgScore: '$summaryRow.avgScore', summaryAsOf: '$summaryRow.computedAt', pendingEvaluationCount: '$summaryRow.pendingEvaluationCount' } },
          ],
        } },
      ]);
      const row = snapshot.summary?.[0] || {};
      const total = Number(row.total || 0);
      const passCount = Number(row.passCount || 0);
      return res.json({
        assessments: snapshot.recent || [],
        students: [],
        summary: {
          avgScore: row.gradedCount ? row.scoreSum / row.gradedCount : null,
          passCount,
          failCount: Math.max(0, Number(row.gradedCount || 0) - passCount),
          gradedCount: row.gradedCount || 0,
          pendingEvaluationCount: row.pendingEvaluationCount || 0,
          failedEvaluationCount: row.failedEvaluationCount || 0,
          summaryPending: Number(row.pendingSummaries || 0) > 0,
          summaryAsOf: row.asOf || null,
          violationCount: row.violations || 0,
          scoreDistribution: [0, 1, 2, 3, 4].map((index) => row[`bucket${index}`] || 0),
        },
        pagination: { page: 1, limit: 5, total, pages: Math.max(1, Math.ceil(total / 5)) },
      });
    }

    const match = {};
    if (assessmentId) match.assessmentId = new mongoose.Types.ObjectId(assessmentId);
    if (status) match.status = status;
    // Filter for submissions with violations
    if (hasViolations === 'true' || hasViolations === true) {
      match.$expr = {
        $gt: [
          {
            $add: [
              { $ifNull: ['$tabSwitches', 0] },
              { $ifNull: ['$fullscreenExits', 0] },
              { $ifNull: ['$cameraFlags', 0] },
              { $ifNull: ['$copyPasteCount', 0] },
            ],
          },
          0,
        ],
      };
    }

    const fromDate = parseReportDate(from);
    const toDate = parseReportDate(to);
    if (fromDate || toDate) {
      match.startedAt = {};
      if (fromDate) match.startedAt.$gte = fromDate;
      if (toDate) match.startedAt.$lte = toDate;
    }

    const minScore = normalizeScore(scoreMin);
    const maxScore = normalizeScore(scoreMax);
    if (minScore !== null || maxScore !== null) {
      match.score = {};
      if (minScore !== null) match.score.$gte = minScore;
      if (maxScore !== null) match.score.$lte = maxScore;
    }

    const baseLookup = [
      { $match: match },
      { $project: { assessmentId: 1, studentId: 1, status: 1, evaluationStatus: 1, startedAt: 1, attemptCount: 1, score: 1, maxMarks: 1, accuracy: 1, timeTakenSec: 1, tabSwitches: 1, fullscreenExits: 1, cameraFlags: 1, copyPasteCount: 1 } },
      { $lookup: { from: 'assessments', localField: 'assessmentId', foreignField: '_id', as: 'assessment' } },
      { $unwind: '$assessment' },
      { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
    ];

    const now = new Date();
    const postMatch = {
      'assessment.lifecycleStatus': { $ne: 'draft' },
      ...buildAssessmentWindowMatch(assessmentWindow, now),
    };
    if (assessmentType) postMatch['assessment.assessmentType'] = assessmentType;
    if (studentId) postMatch['student._id'] = new mongoose.Types.ObjectId(studentId);
    if (studentQuery) {
      const regex = new RegExp(String(studentQuery).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      postMatch.$or = [
        { 'student.name': regex },
        { 'student.email': regex },
        { 'student.studentId': regex },
      ];
    }
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') {
      postMatch['assessment.createdBy'] = req.user._id;
    }
    if (Object.keys(postMatch).length) {
      baseLookup.push({ $match: postMatch });
    }

    // Create separate base lookup for summary that excludes status filter
    // Summary should show stats from ALL submissions, not filtered by status
    const summaryMatch = { ...match };
    delete summaryMatch.status; // Remove status filter for summary
    const summaryBaseLookup = [
      { $match: summaryMatch },
      { $project: { assessmentId: 1, studentId: 1, status: 1, evaluationStatus: 1, startedAt: 1, score: 1, maxMarks: 1, accuracy: 1, timeTakenSec: 1, tabSwitches: 1, fullscreenExits: 1, cameraFlags: 1, copyPasteCount: 1 } },
      { $set: { isGraded: evaluatedAssessmentExpression, score: evaluatedScoreExpression } },
      { $lookup: { from: 'assessments', localField: 'assessmentId', foreignField: '_id', as: 'assessment' } },
      { $unwind: '$assessment' },
      { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
    ];
    const summaryPostMatch = {
      'assessment.lifecycleStatus': { $ne: 'draft' },
      ...buildAssessmentWindowMatch(assessmentWindow, now),
    };
    if (assessmentType) summaryPostMatch['assessment.assessmentType'] = assessmentType;
    if (studentId) summaryPostMatch['student._id'] = new mongoose.Types.ObjectId(studentId);
    if (studentQuery) {
      const regex = new RegExp(String(studentQuery).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      summaryPostMatch.$or = [
        { 'student.name': regex },
        { 'student.email': regex },
        { 'student.studentId': regex },
      ];
    }
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') {
      summaryPostMatch['assessment.createdBy'] = req.user._id;
    }
    if (Object.keys(summaryPostMatch).length) {
      summaryBaseLookup.push({ $match: summaryPostMatch });
    }

    const totalStudents = await reportAggregate(AssessmentSubmission, [
      ...baseLookup,
      { $count: 'count' },
    ]);
    const totalCount = totalStudents?.[0]?.count || 0;
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 25));
    const pageNum = Math.max(1, Number(page) || 1);
    const skip = (pageNum - 1) * limitNum;
    const sortFieldMap = {
      studentName: 'studentName',
      attemptDate: 'attemptDate',
      attempts: 'attempts',
      score: 'score',
      accuracy: 'accuracy',
      timeTakenSec: 'timeTakenSec',
      violationCount: 'violationCount',
      rank: 'rank',
    };
    const resolvedSortKey = sortFieldMap[sortKey] || 'attemptDate';
    const resolvedSortDir = String(sortDir).toLowerCase() === 'asc' ? 1 : -1;

    const studentRows = await reportAggregate(AssessmentSubmission, [
      ...baseLookup,
      {
        $project: {
          _id: 1,
          assessmentId: 1,
          assessmentTitle: '$assessment.title',
          assessmentType: '$assessment.assessmentType',
          totalQuestions: {
            $sum: {
              $map: {
                input: { $ifNull: ['$assessment.sections', []] },
                as: 'sec',
                in: { $size: { $ifNull: ['$$sec.questions', []] } },
              },
            },
          },
          totalMarks: '$assessment.totalMarks',
          studentName: '$student.name',
          studentId: '$student.studentId',
          attemptDate: '$startedAt',
          attempts: '$attemptCount',
          score: evaluatedScoreExpression,
          accuracy: { $cond: [evaluatedAssessmentExpression, '$accuracy', null] },
          evaluationStatus: { $ifNull: ['$evaluationStatus', 'completed'] },
          timeTakenSec: '$timeTakenSec',
          status: '$status',
          violationCount: {
            $add: [
              { $ifNull: ['$tabSwitches', 0] },
              { $ifNull: ['$fullscreenExits', 0] },
              { $ifNull: ['$cameraFlags', 0] },
              { $ifNull: ['$copyPasteCount', 0] },
            ],
          },
          tabSwitches: { $ifNull: ['$tabSwitches', 0] },
          fullscreenExits: { $ifNull: ['$fullscreenExits', 0] },
          cameraFlags: { $ifNull: ['$cameraFlags', 0] },
          copyPasteCount: { $ifNull: ['$copyPasteCount', 0] },
        },
      },
      { $sort: { [resolvedSortKey]: resolvedSortDir, attemptDate: -1 } },
      { $skip: skip },
      { $limit: limitNum },
    ]);

    const summaryRows = await reportAggregate(AssessmentSubmission, [
      ...summaryBaseLookup,
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          maxScore: { $max: '$score' },
          minScore: { $min: '$score' },
          total: { $sum: 1 },
          gradedCount: { $sum: { $cond: ['$isGraded', 1, 0] } },
          pendingEvaluationCount: { $sum: { $cond: [{ $eq: ['$evaluationStatus', 'processing'] }, 1, 0] } },
          failedEvaluationCount: { $sum: { $cond: [{ $eq: ['$evaluationStatus', 'failed'] }, 1, 0] } },
          passCount: {
            $sum: {
              $cond: [
                { $and: ['$isGraded', { $gte: ['$score', { $multiply: [{ $ifNull: ['$maxMarks', '$assessment.totalMarks'] }, Number(passMark) || 0.4] }] }] },
                1,
                0,
              ],
            },
          },
          avgTimeSec: { $avg: { $ifNull: ['$timeTakenSec', 0] } },
          fastestTime: { $min: { $ifNull: ['$timeTakenSec', 0] } },
          totalViolations: {
            $sum: {
              $add: [
                { $ifNull: ['$tabSwitches', 0] },
                { $ifNull: ['$fullscreenExits', 0] },
                { $ifNull: ['$cameraFlags', 0] },
                { $ifNull: ['$copyPasteCount', 0] },
              ],
            },
          },
          tabSwitches: { $sum: { $ifNull: ['$tabSwitches', 0] } },
          fullscreenExits: { $sum: { $ifNull: ['$fullscreenExits', 0] } },
          cameraFlags: { $sum: { $ifNull: ['$cameraFlags', 0] } },
          copyPasteCount: { $sum: { $ifNull: ['$copyPasteCount', 0] } },
          score0_25: {
            $sum: { $cond: [{ $and: [{ $gte: ['$score', 0] }, { $lt: ['$score', 26] }] }, 1, 0] },
          },
          score26_50: {
            $sum: { $cond: [{ $and: [{ $gte: ['$score', 26] }, { $lt: ['$score', 51] }] }, 1, 0] },
          },
          score51_75: {
            $sum: { $cond: [{ $and: [{ $gte: ['$score', 51] }, { $lt: ['$score', 76] }] }, 1, 0] },
          },
          score76_90: {
            $sum: { $cond: [{ $and: [{ $gte: ['$score', 76] }, { $lt: ['$score', 91] }] }, 1, 0] },
          },
          score91_100: {
            $sum: { $cond: [{ $gte: ['$score', 91] }, 1, 0] },
          },
        },
      },
    ]);

    // Compute top violators separately
    const topViolatorsRows = await reportAggregate(AssessmentSubmission, [
      ...summaryBaseLookup,
      {
        $group: {
          _id: '$studentId',
          studentName: { $first: '$student.name' },
          studentId: { $first: '$student.studentId' },
          violationCount: {
            $sum: {
              $add: [
                { $ifNull: ['$tabSwitches', 0] },
                { $ifNull: ['$fullscreenExits', 0] },
                { $ifNull: ['$cameraFlags', 0] },
                { $ifNull: ['$copyPasteCount', 0] },
              ],
            },
          },
        },
      },
      { $sort: { violationCount: -1 } },
      { $limit: 5 },
    ]);

    // Compute violation trend (last 10 days)
    const violationTrendRows = await reportAggregate(AssessmentSubmission, [
      ...summaryBaseLookup,
      {
        $match: {
          startedAt: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$startedAt' },
          },
          violationCount: {
            $sum: {
              $add: [
                { $ifNull: ['$tabSwitches', 0] },
                { $ifNull: ['$fullscreenExits', 0] },
                { $ifNull: ['$cameraFlags', 0] },
                { $ifNull: ['$copyPasteCount', 0] },
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 10 },
    ]);

    const attemptTrendRows = await reportAggregate(AssessmentSubmission, [
      ...summaryBaseLookup,
      { $match: { startedAt: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
          count: { $sum: 1 },
          avgScore: { $avg: '$score' },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]);

    const monthlyActivityRows = await reportAggregate(AssessmentSubmission, [
      ...summaryBaseLookup,
      { $match: { startedAt: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$startedAt' } },
          attempts: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          violations: {
            $sum: {
              $add: [
                { $ifNull: ['$tabSwitches', 0] },
                { $ifNull: ['$fullscreenExits', 0] },
                { $ifNull: ['$cameraFlags', 0] },
                { $ifNull: ['$copyPasteCount', 0] },
              ],
            },
          },
          avgScore: { $avg: '$score' },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]);

    const activityCalendarRows = await reportAggregate(AssessmentSubmission, [
      ...summaryBaseLookup,
      { $match: { startedAt: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
          attempts: { $sum: 1 },
          violations: {
            $sum: {
              $add: [
                { $ifNull: ['$tabSwitches', 0] },
                { $ifNull: ['$fullscreenExits', 0] },
                { $ifNull: ['$cameraFlags', 0] },
                { $ifNull: ['$copyPasteCount', 0] },
              ],
            },
          },
          avgScore: { $avg: '$score' },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 365 },
    ]);

    const summary = summaryRows?.[0] || { avgScore: 0, maxScore: 0, minScore: 0, total: 0, passCount: 0 };
    const failCount = Math.max(0, (summary.gradedCount || 0) - (summary.passCount || 0));

    const assessmentSummariesMatch = {
      lifecycleStatus: { $ne: 'draft' },
      ...buildAssessmentCollectionWindowMatch(assessmentWindow, now),
    };
    if (assessmentId) assessmentSummariesMatch._id = new mongoose.Types.ObjectId(assessmentId);
    if (assessmentType) assessmentSummariesMatch.assessmentType = assessmentType;
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') assessmentSummariesMatch.createdBy = req.user._id;

    const assessmentCalendarMatch = {
      lifecycleStatus: { $ne: 'draft' },
      ...buildAssessmentCollectionWindowMatch(assessmentWindow, now),
    };
    if (assessmentType) assessmentCalendarMatch.assessmentType = assessmentType;
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') assessmentCalendarMatch.createdBy = req.user._id;

    const assessmentCreatedTrendRows = await reportAggregate(Assessment, [
      { $match: assessmentCalendarMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]);

    const assessmentSubmissionSummaryLookup = {
      $lookup: {
        from: 'assessmentreportsummaries',
        localField: '_id',
        foreignField: '_id',
        as: 'submissionSummary',
      },
    };

    const assessmentSummaries = await reportAggregate(Assessment, [
      { $match: assessmentSummariesMatch },
      assessmentSubmissionSummaryLookup,
      {
        $project: {
          title: 1,
          assessmentType: 1,
          lifecycleStatus: 1,
          startTime: 1,
          endTime: 1,
          duration: 1,
          createdAt: 1,
          updatedAt: 1,
          totalQuestions: {
            $sum: {
              $map: {
                input: { $ifNull: ['$sections', []] },
                as: 'sec',
                in: { $size: { $ifNull: ['$$sec.questions', []] } },
              },
            },
          },
          totalMarks: 1,
          attempted: { $ifNull: [{ $first: '$submissionSummary.submissionCount' }, 0] },
          lastAttemptAt: { $first: '$submissionSummary.lastAttemptAt' },
          avgScore: { $first: '$submissionSummary.avgScore' },
          maxScore: { $first: '$submissionSummary.maxScore' },
          minScore: { $first: '$submissionSummary.minScore' },
          summaryAsOf: { $first: '$submissionSummary.computedAt' },
          summaryPending: { $not: [{ $ifNull: [{ $first: '$submissionSummary.computedAt' }, false] }] },
          pendingEvaluationCount: { $ifNull: [{ $first: '$submissionSummary.pendingEvaluationCount' }, 0] },
          submissionCount: { $ifNull: [{ $first: '$submissionSummary.submissionCount' }, 0] },
          completedCount: { $ifNull: [{ $first: '$submissionSummary.completedCount' }, 0] },
          violationCount: { $ifNull: [{ $first: '$submissionSummary.violationCount' }, 0] },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    const assessmentCalendarSummaries = assessmentId
      ? await reportAggregate(Assessment, [
        { $match: assessmentCalendarMatch },
        assessmentSubmissionSummaryLookup,
        {
          $project: {
            title: 1,
            assessmentType: 1,
            lifecycleStatus: 1,
            startTime: 1,
            endTime: 1,
            duration: 1,
            createdAt: 1,
            totalQuestions: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$sections', []] },
                  as: 'sec',
                  in: { $size: { $ifNull: ['$$sec.questions', []] } },
                },
              },
            },
            totalMarks: 1,
            attempted: { $ifNull: [{ $first: '$submissionSummary.submissionCount' }, 0] },
            avgScore: { $ifNull: [{ $first: '$submissionSummary.avgScore' }, 0] },
            submissionCount: { $ifNull: [{ $first: '$submissionSummary.submissionCount' }, 0] },
            completedCount: { $ifNull: [{ $first: '$submissionSummary.completedCount' }, 0] },
            violationCount: { $ifNull: [{ $first: '$submissionSummary.violationCount' }, 0] },
          },
        },
        { $sort: { createdAt: -1 } },
      ])
      : assessmentSummaries;

    const assessmentBuckets = assessmentSummaries.reduce((acc, assessment) => {
      const bucket = lifecycleBucketForAssessment(assessment, now);
      acc.all += 1;
      if (bucket === 'current') acc.current += 1;
      if (bucket === 'upcoming') acc.upcoming += 1;
      if (bucket === 'completed') acc.completed += 1;
      return acc;
    }, { all: 0, current: 0, upcoming: 0, completed: 0 });

    const assessmentCalendarMap = new Map();
    const monthlyAssessmentMap = new Map();
    assessmentCalendarSummaries.forEach((assessment) => {
      if (!assessment?.createdAt) return;
      const created = new Date(assessment.createdAt);
      if (Number.isNaN(created.getTime())) return;
      const dayKey = created.toISOString().slice(0, 10);
      const monthKey = created.toISOString().slice(0, 7);
      const card = {
        _id: assessment._id,
        title: assessment.title || 'Untitled',
        assessmentType: assessment.assessmentType || 'mixed',
        lifecycleStatus: assessment.lifecycleStatus || 'published',
        lifecycleBucket: lifecycleBucketForAssessment(assessment, now),
        startTime: assessment.startTime || null,
        endTime: assessment.endTime || null,
        duration: assessment.duration || 0,
        totalQuestions: assessment.totalQuestions || 0,
        totalMarks: assessment.totalMarks || 0,
        submissionCount: assessment.submissionCount || assessment.attempted || 0,
        completedCount: assessment.completedCount || 0,
        avgScore: Number(Number(assessment.avgScore || 0).toFixed(2)),
        violationCount: assessment.violationCount || 0,
        createdAt: assessment.createdAt,
      };

      const dayEntry = assessmentCalendarMap.get(dayKey) || {
        date: dayKey,
        count: 0,
        totalQuestions: 0,
        attempts: 0,
        completed: 0,
        violations: 0,
        assessments: [],
      };
      dayEntry.count += 1;
      dayEntry.totalQuestions += Number(card.totalQuestions || 0);
      dayEntry.attempts += Number(card.submissionCount || 0);
      dayEntry.completed += Number(card.completedCount || 0);
      dayEntry.violations += Number(card.violationCount || 0);
      dayEntry.assessments.push(card);
      assessmentCalendarMap.set(dayKey, dayEntry);

      const monthEntry = monthlyAssessmentMap.get(monthKey) || {
        month: monthKey,
        count: 0,
        totalQuestions: 0,
        attempts: 0,
        completed: 0,
        violations: 0,
      };
      monthEntry.count += 1;
      monthEntry.totalQuestions += Number(card.totalQuestions || 0);
      monthEntry.attempts += Number(card.submissionCount || 0);
      monthEntry.completed += Number(card.completedCount || 0);
      monthEntry.violations += Number(card.violationCount || 0);
      monthlyAssessmentMap.set(monthKey, monthEntry);
    });

    const assessmentCalendar = Array.from(assessmentCalendarMap.values())
      .sort((a, b) => a.date.localeCompare(b.date));
    const monthlyAssessments = Array.from(monthlyAssessmentMap.values())
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      assessments: assessmentSummaries,
      students: studentRows,
      summary: {
        avgScore: summary.avgScore ?? null,
        maxScore: summary.maxScore ?? null,
        minScore: summary.minScore ?? null,
        pendingEvaluationCount: summary.pendingEvaluationCount || 0,
        failedEvaluationCount: summary.failedEvaluationCount || 0,
        gradedCount: summary.gradedCount || 0,
        passCount: summary.passCount || 0,
        failCount,
        avgTimeSec: summary.avgTimeSec || 0,
        fastestTime: summary.fastestTime || 0,
        violationCount: summary.totalViolations || 0,
        tabSwitches: summary.tabSwitches || 0,
        fullscreenExits: summary.fullscreenExits || 0,
        cameraFlags: summary.cameraFlags || 0,
        copyPasteCount: summary.copyPasteCount || 0,
        scoreDistribution: [
          summary.score0_25 || 0,
          summary.score26_50 || 0,
          summary.score51_75 || 0,
          summary.score76_90 || 0,
          summary.score91_100 || 0,
        ],
        topViolators: topViolatorsRows || [],
        violationTrend: violationTrendRows.map((row) => row.violationCount) || [],
        attemptTrend: attemptTrendRows.map((row) => row.count) || [],
        scoreTrend: attemptTrendRows.map((row) => Number((row.avgScore || 0).toFixed(2))) || [],
        assessmentTrend: assessmentCreatedTrendRows.map((row) => row.count) || [],
        trendLabels: attemptTrendRows.map((row) => row._id) || [],
        monthlyActivity: monthlyActivityRows.map((row) => ({
          month: row._id,
          attempts: row.attempts || 0,
          completed: row.completed || 0,
          violations: row.violations || 0,
          avgScore: Number((row.avgScore || 0).toFixed(2)),
        })),
        activityCalendar: activityCalendarRows.map((row) => ({
          date: row._id,
          attempts: row.attempts || 0,
          violations: row.violations || 0,
          avgScore: Number((row.avgScore || 0).toFixed(2)),
        })),
        assessmentCalendar,
        monthlyAssessments,
        totalAssessments: assessmentBuckets.all,
        assessmentBuckets,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
      },
    });
  } catch (err) {
    if (err.status === 503 || err.code === 50) {
      res.setHeader?.('Retry-After', '10');
      return res.status(503).json({ error: 'Reports are busy. Select a narrower assessment/date range and retry.', code: err.code || 'REPORT_BUSY' });
    }
    console.error('Error generating assessment reports:', err);
    res.status(500).json({ error: 'Failed to generate reports' });
  } finally {
    releaseReportSlot?.();
  }
}

export async function getStudentAssessmentReport(req, res) {
  try {
    const { submissionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({ error: 'Invalid submissionId' });
    }

    let submission = await AssessmentSubmission.findById(submissionId).select('-proctoringSnapshots -monitoringEvents').lean();
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const assessment = await Assessment.findById(submission.assessmentId).lean();
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all' && String(assessment.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not authorized to view this report.' });
    }

    const deliveredAssessment = assessmentForSubmission(assessment, submission);
    submission = await reconcileAssessmentCodingAnswers(deliveredAssessment, submission);

    const evaluationUnavailable = ['processing', 'failed'].includes(submission.evaluationStatus);

    const analytics = buildAssessmentAttemptAnalytics(deliveredAssessment, submission);
    const sectionBreakdown = buildSectionBreakdownWithScores(deliveredAssessment, submission);
    const questionWise = buildQuestionWiseReport(deliveredAssessment, submission);

    const totalMarks = Number(deliveredAssessment.totalMarks || computeTotalMarksFromSections(deliveredAssessment.sections || []));
    const score = evaluationUnavailable ? null : Number(submission.score || 0);
    const accuracy = evaluationUnavailable ? null : Number.isFinite(Number(submission.accuracy))
      ? Number(submission.accuracy)
      : totalMarks > 0
        ? Number(((score / totalMarks) * 100).toFixed(2))
        : 0;

    return res.json({
      submissionId: submission._id,
      assessmentId: assessment._id,
      assessmentTitle: assessment.title || 'Untitled Assessment',
      evaluationStatus: submission.evaluationStatus || 'completed',
      score,
      totalMarks,
      accuracy,
      timeTakenSec: computeSubmissionTimeTakenSec(submission),
      correctAnswers: evaluationUnavailable ? null : analytics.correctAnswers,
      wrongAnswers: evaluationUnavailable ? null : analytics.wrongAnswers,
      skippedQuestions: analytics.skippedQuestions,
      pendingEvaluationQuestions: analytics.pendingEvaluationQuestions,
      sectionBreakdown: evaluationUnavailable ? [] : sectionBreakdown,
      questionWise: evaluationUnavailable ? [] : questionWise,
      securityInfo: {
        tabSwitches: submission.tabSwitches || 0,
        fullscreenExits: submission.fullscreenExits || 0,
        cameraFlags: submission.cameraFlags || 0,
        copyPasteCount: submission.copyPasteCount || 0,
        location: submission.securitySetup?.location || null,
      },
      aiProctoringSummary: normalizeAiProctoringSummaryForReport(submission.aiProctoringSummary),
      aiViolationLog: getAiViolationLogEntries(submission.violationLog),
    });
  } catch (err) {
    console.error('Error fetching student assessment report:', err);
    return res.status(500).json({ error: 'Failed to fetch student assessment report' });
  }
}

export async function getAssessmentReportsExportData(req, res) {
  let releaseExportSlot;
  try {
    releaseExportSlot = acquireAssessmentReportSlot('export');
    const reportAggregate = createBoundedReportAggregate();
    const {
      assessmentId,
      assessmentType,
      studentQuery,
      status,
      assessmentWindow,
      from,
      to,
      scoreMin,
      scoreMax,
      passMark = 0.4,
      columns,
    } = req.query || {};

    if (assessmentId && !mongoose.Types.ObjectId.isValid(assessmentId)) {
      return res.status(400).json({ error: 'Invalid assessmentId' });
    }

    const match = {};
    if (assessmentId) match.assessmentId = new mongoose.Types.ObjectId(assessmentId);
    if (status) match.status = status;

    const fromDate = parseReportDate(from);
    const toDate = parseReportDate(to);
    if (fromDate || toDate) {
      match.startedAt = {};
      if (fromDate) match.startedAt.$gte = fromDate;
      if (toDate) match.startedAt.$lte = toDate;
    }

    const minScore = normalizeScore(scoreMin);
    const maxScore = normalizeScore(scoreMax);
    if (minScore !== null || maxScore !== null) {
      match.score = {};
      if (minScore !== null) match.score.$gte = minScore;
      if (maxScore !== null) match.score.$lte = maxScore;
    }

    const pipeline = [
      { $match: match },
      { $lookup: { from: 'assessments', localField: 'assessmentId', foreignField: '_id', as: 'assessment' } },
      { $unwind: '$assessment' },
      { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
    ];

    const postMatch = {
      'assessment.lifecycleStatus': { $ne: 'draft' },
      ...buildAssessmentWindowMatch(assessmentWindow, new Date()),
    };
    if (assessmentType) postMatch['assessment.assessmentType'] = assessmentType;
    if (studentQuery) {
      const regex = new RegExp(String(studentQuery).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      postMatch.$or = [
        { 'student.name': regex },
        { 'student.email': regex },
        { 'student.studentId': regex },
      ];
    }
    if (req.user?.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') {
      postMatch['assessment.createdBy'] = req.user._id;
    }
    if (Object.keys(postMatch).length) {
      pipeline.push({ $match: postMatch });
    }

    pipeline.push({
      $project: {
        _id: 1,
        assessmentId: 1,
        studentId: 1,
        answers: 1,
        deliverySections: 1,
        deliveryPreparedAt: 1,
        evaluationStatus: 1,
        score: 1,
        maxMarks: 1,
        accuracy: 1,
        timeTakenSec: 1,
        startedAt: 1,
        submittedAt: 1,
        status: 1,
        tabSwitches: { $ifNull: ['$tabSwitches', 0] },
        fullscreenExits: { $ifNull: ['$fullscreenExits', 0] },
        copyPasteCount: { $ifNull: ['$copyPasteCount', 0] },
        cameraFlags: { $ifNull: ['$cameraFlags', 0] },
        violationScore: { $ifNull: ['$violationScore', 0] },
        pauseCount: { $ifNull: ['$pauseCount', 0] },
        lastPauseAt: 1,
        securityHeartbeat: { $ifNull: ['$securityHeartbeat', {}] },
        securitySetup: { $ifNull: ['$securitySetup', {}] },
        violationLog: { $ifNull: ['$violationLog', []] },
        violations: { $ifNull: ['$violations', []] },
        monitoringEvents: { $ifNull: ['$monitoringEvents', []] },
        // Export/reporting only needs snapshot timing metadata. Pulling Base64
        // image bodies into a cross-assessment aggregation can add gigabytes
        // of avoidable I/O and was a primary report-timeout amplifier.
        proctoringSnapshots: {
          $map: {
            input: { $ifNull: ['$proctoringSnapshots', []] },
            as: 'snapshot',
            in: {
              type: '$$snapshot.type',
              capturedAt: '$$snapshot.capturedAt',
              width: '$$snapshot.width',
              height: '$$snapshot.height',
            },
          },
        },
        attemptCount: { $ifNull: ['$attemptCount', 0] },
        lastIp: 1,
        lastUserAgent: 1,
        createdAt: 1,
        updatedAt: 1,
        assessment: {
          _id: '$assessment._id',
          title: '$assessment.title',
          assessmentType: '$assessment.assessmentType',
          lifecycleStatus: '$assessment.lifecycleStatus',
          assessmentId: '$assessment.assessmentId',
          startTime: '$assessment.startTime',
          endTime: '$assessment.endTime',
          duration: '$assessment.duration',
          totalMarks: '$assessment.totalMarks',
          createdAt: '$assessment.createdAt',
          sections: '$assessment.sections',
        },
        student: {
          _id: '$student._id',
          name: '$student.name',
          email: '$student.email',
          studentId: '$student.studentId',
          course: '$student.course',
          branch: '$student.branch',
          college: '$student.college',
          semester: '$student.semester',
          group: '$student.group',
        },
      },
    });

    const selectedColumnKeys = parseCsvList(columns);
    const rawRows = [];
    let rawBytes = 0;
    const cursor = reportAggregate(AssessmentSubmission, [...pipeline, { $limit: MAX_ASSESSMENT_EXPORT_ROWS + 1 }]).cursor({ batchSize: 10 });
    for await (const row of cursor) {
      rawBytes += Buffer.byteLength(JSON.stringify(row));
      assertAssessmentExportSize(rawRows.length + 1, null, rawBytes);
      rawRows.push(row);
    }
    const groupedByAssessment = new Map();
    rawRows.forEach((row) => {
      const key = String(row.assessment?._id || row.assessmentId);
      const list = groupedByAssessment.get(key) || [];
      list.push(row);
      groupedByAssessment.set(key, list);
    });

    const exportRows = [];
    const sectionRows = [];

    groupedByAssessment.forEach((rows) => {
      const rankedRows = rows.filter((row) => !['processing', 'failed'].includes(row.evaluationStatus) && row.status === 'submitted').sort((a, b) => {
        const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return computeSubmissionTimeTakenSec(a) - computeSubmissionTimeTakenSec(b);
      });
      const rankMap = new Map(rankedRows.map((row, index) => [String(row._id), index + 1]));
      const totalInAssessment = rankedRows.length || 1;

      rows.forEach((row) => {
        const evaluationPending = row.evaluationStatus === 'processing';
        const evaluationUnavailable = evaluationPending || row.evaluationStatus === 'failed';
        const assessmentDoc = row.assessment || {};
        const submissionDoc = {
          ...row,
          assessmentId: row.assessmentId,
          studentId: row.studentId,
        };
        const deliveredAssessment = assessmentForSubmission(assessmentDoc, submissionDoc);
        const analytics = buildAssessmentAttemptAnalytics(deliveredAssessment, submissionDoc);
        const sectionBreakdown = buildSectionBreakdownWithScores(deliveredAssessment, submissionDoc);
        const questionWise = buildQuestionWiseReport(deliveredAssessment, submissionDoc);
        const totalMarks = Number(deliveredAssessment.totalMarks || computeTotalMarksFromSections(deliveredAssessment.sections || []));
        const score = evaluationUnavailable ? null : Number(row.score || 0);
        const accuracy = evaluationUnavailable ? null : Number.isFinite(Number(row.accuracy))
          ? Number(row.accuracy)
          : totalMarks > 0
            ? Number(((score / totalMarks) * 100).toFixed(2))
            : 0;
        const timeTakenSec = computeSubmissionTimeTakenSec(row);
        const rank = rankMap.get(String(row._id)) || null;
        const percentile = totalInAssessment > 0 && rank
          ? Number((((totalInAssessment - rank) / totalInAssessment) * 100).toFixed(2))
          : 0;
        const userAgentDetails = parseUserAgentDetails(row.lastUserAgent);
        const sectionScoresText = sectionBreakdown.map((section) => `${section.sectionName}: ${section.score}/${section.totalMarks}`).join(' | ');
        const sectionPerformanceText = sectionBreakdown.map((section) => `${section.sectionName} (${section.correctAnswers}C/${section.partialAnswers || 0}P/${section.wrongAnswers}W/${section.skippedQuestions}S/${section.pendingEvaluationQuestions}E)`).join(' | ');
        const locationText = stringifyLocation(row.securitySetup?.location || null);
        const securityHeartbeatText = stringifySecurityHeartbeat(row.securityHeartbeat || {});
        const proctoringFlagsText = buildProctoringFlags(row);
        const violationCount = Number(row.tabSwitches || 0) + Number(row.fullscreenExits || 0) + Number(row.cameraFlags || 0) + Number(row.copyPasteCount || 0);

        exportRows.push({
          submissionId: String(row._id),
          assessmentId: String(assessmentDoc._id || row.assessmentId),
          assessmentName: assessmentDoc.title || 'Untitled Assessment',
          assessmentType: assessmentDoc.assessmentType || 'mixed',
          assessmentCode: assessmentDoc.assessmentId || '',
          assessmentStatus: assessmentDoc.lifecycleStatus || 'draft',
          assessmentWindow: lifecycleBucketForAssessment(assessmentDoc),
          assessmentStartTime: assessmentDoc.startTime || null,
          assessmentEndTime: assessmentDoc.endTime || null,
          assessmentDurationMin: assessmentDoc.duration || 0,
          assessmentCreatedAt: assessmentDoc.createdAt || null,
          candidateName: row.student?.name || 'Unknown',
          candidateEmail: row.student?.email || '',
          candidateStudentId: row.student?.studentId || '',
          candidateCourse: row.student?.course || '',
          candidateBranch: row.student?.branch || '',
          candidateCollege: row.student?.college || '',
          candidateSemester: row.student?.semester ?? '',
          candidateGroup: row.student?.group || '',
          attemptDate: row.startedAt || row.createdAt || null,
          submittedAt: row.submittedAt || null,
          completionStatus: evaluationPending ? 'Submitted - evaluation pending' : row.evaluationStatus === 'failed' ? 'Submitted - evaluation failed' : row.status || 'incomplete',
          evaluationStatus: row.evaluationStatus || 'completed',
          attempts: row.attemptCount || 0,
          attemptHistory: row.attemptCount || 0,
          score,
          totalMarks,
          percentage: accuracy,
          accuracy,
          rank,
          percentile,
          totalQuestions: analytics.totalQuestions,
          correctAnswers: evaluationUnavailable ? null : analytics.correctAnswers,
          wrongAnswers: evaluationUnavailable ? null : analytics.wrongAnswers,
          partialAnswers: analytics.partialAnswers,
          skippedQuestions: analytics.skippedQuestions,
          pendingEvaluationQuestions: analytics.pendingEvaluationQuestions,
          completionRate: analytics.totalQuestions > 0
            ? Number((((analytics.correctAnswers + analytics.partialAnswers + analytics.wrongAnswers + analytics.pendingEvaluationQuestions) / analytics.totalQuestions) * 100).toFixed(2))
            : 0,
          timeSpentSec: timeTakenSec,
          violationCount,
          violationScore: Number(row.violationScore || 0),
          tabSwitches: Number(row.tabSwitches || 0),
          fullscreenExits: Number(row.fullscreenExits || 0),
          cameraFlags: Number(row.cameraFlags || 0),
          copyPasteCount: Number(row.copyPasteCount || 0),
          pauseCount: Number(row.pauseCount || 0),
          lastPauseAt: row.lastPauseAt || null,
          sectionScores: evaluationUnavailable ? 'Evaluation pending or unavailable' : sectionScoresText,
          sectionPerformance: evaluationUnavailable ? '' : sectionPerformanceText,
          deviceBrowser: userAgentDetails.browser,
          deviceOs: userAgentDetails.os,
          deviceInfo: `${userAgentDetails.browser} / ${userAgentDetails.os}`,
          ipAddress: row.lastIp || '',
          userAgent: row.lastUserAgent || '',
          securityHeartbeat: securityHeartbeatText,
          location: locationText,
          proctoringFlags: proctoringFlagsText,
          proctoringActivityCount: buildMonitoringTimeline(row).length,
          questionCount: questionWise.length,
        });

        sectionBreakdown.forEach((section) => {
          sectionRows.push({
            submissionId: String(row._id),
            candidateName: row.student?.name || 'Unknown',
            candidateStudentId: row.student?.studentId || '',
            assessmentName: assessmentDoc.title || 'Untitled Assessment',
            sectionName: section.sectionName,
            sectionType: section.type,
            totalQuestions: section.totalQuestions,
            score: evaluationUnavailable ? null : section.score,
            totalMarks: section.totalMarks,
            correctAnswers: section.correctAnswers,
            wrongAnswers: section.wrongAnswers,
            skippedQuestions: section.skippedQuestions,
            pendingEvaluationQuestions: section.pendingEvaluationQuestions,
          });
        });

      });
    });

    const gradedExportRows = exportRows.filter((row) => row.score !== null && row.completionStatus === 'submitted');
    const summary = {
      totalAssessments: new Set(exportRows.map((row) => row.assessmentId)).size,
      totalCandidates: exportRows.length,
      pendingEvaluationCount: exportRows.filter((row) => row.evaluationStatus === 'processing').length,
      failedEvaluationCount: exportRows.filter((row) => row.evaluationStatus === 'failed').length,
      avgScore: gradedExportRows.length ? Number((gradedExportRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / gradedExportRows.length).toFixed(2)) : null,
      maxScore: gradedExportRows.length ? Math.max(...gradedExportRows.map((row) => Number(row.score || 0))) : null,
      minScore: gradedExportRows.length ? Math.min(...gradedExportRows.map((row) => Number(row.score || 0))) : null,
      passCount: gradedExportRows.filter((row) => row.totalMarks > 0 && row.score >= row.totalMarks * (Number(passMark) || 0.4)).length,
      failCount: gradedExportRows.filter((row) => !(row.totalMarks > 0 && row.score >= row.totalMarks * (Number(passMark) || 0.4))).length,
      violationCount: exportRows.reduce((sum, row) => sum + Number(row.violationCount || 0), 0),
    };

    const availableColumns = new Set();
    exportRows.forEach((row) => {
      Object.entries(row || {}).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (typeof value === 'string' && !value.trim()) return;
        availableColumns.add(key);
      });
    });
    if (sectionRows.length) {
      ['sectionScores', 'sectionPerformance'].forEach((key) => availableColumns.add(key));
    }

    let filteredRows = exportRows;
    if (selectedColumnKeys.length) {
      filteredRows = exportRows.map((row) => {
        const next = {};
        selectedColumnKeys.forEach((key) => {
          next[key] = row?.[key];
        });
        return next;
      });
    }

    const exportPayload = {
      generatedAt: new Date().toISOString(),
      filters: req.query || {},
      summary,
      rows: filteredRows,
      sectionRows,
      availableColumns: Array.from(availableColumns),
    };
    assertAssessmentExportSize(filteredRows.length, exportPayload);
    return res.json(exportPayload);
  } catch (err) {
    if (err.status === 503 || err.code === 50 || err.status === 413) {
      res.setHeader?.('Retry-After', '10');
      return res.status(err.status === 413 ? 413 : 503).json({ error: err.status === 413 ? err.message : 'Report export is busy. Narrow filters and retry.', code: err.code || 'REPORT_BUSY' });
    }
    console.error('Error generating assessment report export data:', err);
    return res.status(500).json({ error: 'Failed to generate assessment report export data' });
  } finally {
    releaseExportSlot?.();
  }
}

export async function exportAssessmentReports(req, res) {
  try {
    const { rows: students = [] } = await (async () => {
      const mockReq = { ...req, query: { ...req.query, columns: 'assessmentName,assessmentType,candidateName,candidateStudentId,attemptDate,attempts,score,accuracy,timeSpentSec,violationCount,completionStatus' } };
      const payload = await new Promise((resolve, reject) => {
        getAssessmentReportsExportData(mockReq, {
          json: (data) => resolve(data),
          status: (status) => ({ json: (data) => reject(Object.assign(new Error(data.error), { status, code: data.code })) }),
        });
      });
      return payload || {};
    })();

    const header = [
      'Assessment',
      'Assessment Type',
      'Student Name',
      'Student ID',
      'Attempt Date',
      'Attempts',
      'Score',
      'Accuracy',
      'Time Taken (sec)',
      'Violation Count',
      'Status',
    ];

    const rows = (students || []).map((row) => ([
      row.assessmentName || '',
      row.assessmentType || '',
      row.candidateName || '',
      row.candidateStudentId || '',
      row.attemptDate ? new Date(row.attemptDate).toISOString() : '',
      row.attempts || 0,
      row.score ?? '',
      row.accuracy ?? '',
      row.timeSpentSec ?? '',
      row.violationCount ?? 0,
      row.completionStatus || '',
    ]));

    const csv = [header, ...rows].map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="assessment-report.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error exporting assessment reports:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to export reports', code: err.code });
  }
}



function numberSetting(settings, keys, fallback = null) {
  for (const key of keys) {
    const value = settings?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return fallback;
}

function actionSetting(settings, keys, fallback = 'warn') {
  for (const key of keys) {
    const value = settings?.[key];
    if (['warn', 'pause', 'autosubmit', 'terminate'].includes(value)) {
      return value === 'terminate' ? 'autosubmit' : value;
    }
  }
  return fallback;
}

const EXISTING_VIOLATION_TYPES = Object.freeze([
  'tab_switch',
  'fullscreen_exit',
  'camera_loss',
  'camera_no_face',
  'multiple_faces',
  'face_out_of_frame',
  'copy_paste',
  'context_menu',
  'duplicate_tab',
  'idle',
  'heartbeat_failure',
  'auto_submit',
  'other',
]);

const NON_BLOCKING_CAMERA_VIOLATION_TYPES = Object.freeze([
  'camera_loss',
  'camera_no_face',
  'multiple_faces',
  'face_out_of_frame',
]);

const VALID_VIOLATION_TYPES = Object.freeze([
  ...EXISTING_VIOLATION_TYPES,
  ...AI_PROCTORING_VIOLATION_TYPES,
]);

const VALID_AI_VIOLATION_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

function sanitizeViolationMessage(message) {
  return String(message || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function normalizeViolationMetadata(meta, metadata) {
  const value = metadata !== undefined ? metadata : meta;
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Violation metadata must be an object.' };
  }
  return { ok: true, value };
}

function normalizeViolationSeverity(severity) {
  if (severity === undefined || severity === null || severity === '') return { ok: true, value: undefined };
  const normalized = String(severity).toLowerCase();
  if (!VALID_AI_VIOLATION_SEVERITIES.has(normalized)) {
    return { ok: false, error: 'Violation severity must be low, medium, high, or critical.' };
  }
  return { ok: true, value: normalized };
}

function normalizeViolationConfidence(confidence) {
  if (confidence === undefined || confidence === null || confidence === '') return { ok: true, value: undefined };
  const normalized = Number(confidence);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    return { ok: false, error: 'Violation confidence must be a number between 0 and 1.' };
  }
  return { ok: true, value: normalized };
}

function violationWeight(settings = {}, type = 'other') {
  const weights = settings.violationWeights || settings.violationWeight || {};
  const camelByType = {
    tab_switch: 'tabSwitch',
    fullscreen_exit: 'fullscreen',
    camera_loss: 'camera',
    camera_no_face: 'camera',
    multiple_faces: 'camera',
    face_out_of_frame: 'camera',
    copy_paste: 'copyPaste',
    context_menu: 'copyPaste',
    duplicate_tab: 'duplicateTab',
    idle: 'idle',
    heartbeat_failure: 'heartbeat',
    ai_no_face: 'aiNoFace',
    ai_face_out_of_frame: 'aiFaceOutOfFrame',
    ai_multiple_faces: 'aiMultipleFaces',
    ai_multiple_persons: 'aiMultiplePersons',
    ai_mobile_detected: 'aiMobileDetected',
    ai_looking_away: 'aiLookingAway',
    ai_camera_blocked: 'aiCameraBlocked',
    other: 'other',
  };
  const camel = camelByType[type] || type;
  const configured = numberSetting(settings, [
    `${camel}ViolationWeight`,
    `${camel}Weight`,
    `${type}Weight`,
  ], null);
  const weighted = Number(weights?.[type] ?? weights?.[camel]);
  if (configured !== null) return Math.max(0, configured);
  if (Number.isFinite(weighted)) return Math.max(0, weighted);
  const aiDefault = getAiProctoringDefaultWeight(type);
  if (aiDefault !== null) return aiDefault;
  return 1;
}

function isNonBlockingDetectionViolation(type, meta = {}) {
  return meta?.warningOnly === true
    || type === 'fullscreen_exit'
    || isAiProctoringViolation(type)
    || NON_BLOCKING_CAMERA_VIOLATION_TYPES.includes(type);
}

function decideViolationAction({ settings = {}, type, meta = {}, submission }) {
  if (isNonBlockingDetectionViolation(type, meta)) return 'warn';
  if (type !== 'tab_switch') return 'warn';

  const tabLimit = numberSetting(settings, ['tabSwitchLimit'], null);
  if (tabLimit !== null && submission.tabSwitches >= tabLimit) {
    const configuredAction = actionSetting(settings, ['tabSwitchAction'], 'pause');
    // Reaching the confirmed tab-switch limit is always a high-priority
    // breach. Preserve an explicit auto-submit policy; otherwise require the
    // focused security recheck.
    return configuredAction === 'autosubmit' ? 'autosubmit' : 'pause';
  }
  return 'warn';
}

export async function logStudentViolation(req, res) {
  try {
    const { type, message, meta, metadata, severity, confidence } = req.body || {};
    if (!type || !VALID_VIOLATION_TYPES.includes(type)) throw new AssessmentWriteError(400, 'INVALID_VIOLATION', 'Valid violation type required.');
    const normalizedMeta = normalizeViolationMetadata(meta, metadata);
    const normalizedSeverity = normalizeViolationSeverity(severity);
    const normalizedConfidence = normalizeViolationConfidence(confidence);
    for (const item of [normalizedMeta, normalizedSeverity, normalizedConfidence]) {
      if (!item.ok) throw new AssessmentWriteError(400, 'INVALID_VIOLATION', item.error);
    }
    const assessment = await requireStudentAssessment(req.params.id, req.user);
    const now = new Date();
    const eventId = String(req.body?.eventId || crypto.randomUUID()).slice(0, 160);
    const settings = assessment.settings || {};
    const ai = isAiProctoringViolation(type);
    const detectionOnly = isNonBlockingDetectionViolation(type, normalizedMeta.value);
    const weight = detectionOnly ? 0 : violationWeight(settings, type);
    const cleanMessage = sanitizeViolationMessage(message);
    const logMeta = { ...normalizedMeta.value, weight, ...(normalizedSeverity.value ? { severity: normalizedSeverity.value } : {}),
      ...(normalizedConfidence.value !== undefined ? { confidence: normalizedConfidence.value } : {}) };
    if (ai) logMeta.source = logMeta.source || 'ai_proctoring';
    const { submission, result } = await mutateAssessmentSubmission({
      filter: { assessmentId: assessment._id, studentId: req.user._id },
      mutate: (doc) => {
        assertAssessmentSession(doc, req.body);
        if (isTerminalAssessmentSubmission(doc)) return { action: 'warn', ignored: true };
        const duplicate = (doc.violationLog || []).find((entry) => entry.eventId === eventId);
        if (duplicate) return { action: duplicate.action || 'warn' };
        if (type === 'tab_switch') doc.tabSwitches += 1;
        if (type === 'fullscreen_exit') doc.fullscreenExits += 1;
        if (['camera_loss', 'camera_no_face', 'multiple_faces', 'face_out_of_frame'].includes(type)) doc.cameraFlags += 1;
        if (['copy_paste', 'context_menu'].includes(type)) doc.copyPasteCount += 1;
        if (ai) {
          doc.aiProctoringSummary = applyAiProctoringViolationToSummary(doc.aiProctoringSummary || {}, type, now);
          doc.markModified('aiProctoringSummary');
        }
        doc.violationScore += weight;
        const action = decideViolationAction({ settings, type, meta: logMeta, submission: doc });
        if (action === 'pause') {
          startSubmissionSecurityPause(doc, now, type);
          resetSubmissionSecuritySetup(doc);
        }
        doc.violationLog = [...(doc.violationLog || []), { eventId, type, message: cleanMessage, at: now, meta: logMeta, action }].slice(-250);
        doc.deadlineAt = getAssessmentAttemptDeadline(assessmentForSubmission(assessment, doc), doc);
        if (action === 'autosubmit') {
          const timeTakenSec = computeEffectiveTimeTakenSec(doc, now);
          if (doc.pauseStartedAt) finishSubmissionSecurityPause(doc, now);
          finishAssessmentSubmission(doc, { now, timeTakenSec });
        }
        return { action };
      },
    });
    if (!submission) throw new AssessmentWriteError(404, 'ATTEMPT_NOT_FOUND', 'Submission not found.');
    if (!result?.ignored) await AssessmentEvent.updateOne(
      { submissionId: submission._id, attemptGeneration: submission.attemptGeneration || 1, eventId },
      { $setOnInsert: { assessmentId: assessment._id, studentId: req.user._id, kind: 'violation', type, message: cleanMessage, at: now, meta: logMeta } },
      { upsert: true },
    );
    return res.json({
      ok: true, tabSwitches: submission.tabSwitches, fullscreenExits: submission.fullscreenExits,
      cameraFlags: submission.cameraFlags, copyPasteCount: submission.copyPasteCount,
      violationScore: submission.violationScore, pauseCount: submission.pauseCount,
      lastPauseAt: submission.lastPauseAt, pauseStartedAt: submission.pauseStartedAt,
      securityRecheckTimeoutSec: getSecurityRecheckTimeoutSec(settings),
      action: result?.action || 'warn', autoSubmit: result?.action === 'autosubmit',
      riskLevel: submission.aiProctoringSummary?.riskLevel, aiProctoringSummary: submission.aiProctoringSummary,
      ...assessmentWriteAcknowledgement(submission),
    });
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

export async function logStudentHeartbeat(req, res) {
  try {
    const { id } = req.params;
    const studentId = req.user._id;
    const { status = {}, violationScore, pauseCount, cameraFlags, networkPauseStartedAt, sessionId } = req.body || {};
    if (req.body?.submissionId !== undefined && !mongoose.isValidObjectId(req.body.submissionId)) {
      return res.status(409).json({ error: 'This request belongs to a different assessment attempt.', code: 'ATTEMPT_IDENTITY_CONFLICT' });
    }
    const assessment = await findAssessmentForStudentRoute(id, { lean: true, select: 'settings duration startTime endTime targetType assignedStudents lifecycleStatus manuallyCompletedAt' });
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    if (!isStudentAssignedToAssessment(assessment, req.user)) return res.status(403).json({ error: 'Not assigned to this assessment.' });
    const settings = assessment.settings || {};
    const now = new Date();
    const checkpoint = await readPresenceCheckpoint(studentId, assessment._id, req.body || {});
    if (checkpoint && !assessment.manuallyCompletedAt && new Date(checkpoint.allowedEnd).getTime() > now.getTime()) {
      return res.json({ ok: true, action: 'warn', checkpointOnly: true, serverTime: now });
    }
    const normalizedSessionId = String(sessionId || '').slice(0, 160);
    const normalizedStatus = {
      fullscreen: Boolean(status.fullscreen),
      tabActive: Boolean(status.tabActive),
      cameraActive: Boolean(status.cameraActive),
      idle: Boolean(status.idle),
      duplicateTab: Boolean(status.duplicateTab),
      at: now,
    };

    const heartbeatSet = {
      securityHeartbeat: normalizedStatus,
      activeSessionHeartbeatAt: now,
      updatedAt: now,
      __v: { $add: [{ $ifNull: ['$__v', 0] }, 1] },
    };
    if (normalizedSessionId) heartbeatSet.activeSessionId = { $literal: normalizedSessionId };
    if (Number.isFinite(cameraFlags) && cameraFlags >= 0 && cameraFlags <= 1000000) heartbeatSet.cameraFlags = { $max: [{ $ifNull: ['$cameraFlags', 0] }, cameraFlags] };

    const heartbeatMax = {};
    if (Number.isFinite(violationScore) && violationScore >= 0 && violationScore <= 1000000) heartbeatMax.violationScore = violationScore;
    if (Number.isFinite(pauseCount) && pauseCount >= 0 && pauseCount <= 1000000) heartbeatMax.pauseCount = pauseCount;

    const updatePipeline = [];
    const networkFields = networkPauseCreditFields(assessment, now, networkPauseStartedAt);
    if (Object.keys(networkFields).length) {
      Object.assign(heartbeatSet, networkFields);
      delete heartbeatMax.pauseCount;
    }

    if (Object.keys(heartbeatMax).length > 0) {
      Object.entries(heartbeatMax).forEach(([field, value]) => {
        heartbeatSet[field] = { $max: [{ $ifNull: [`$${field}`, 0] }, value] };
      });
    }
    updatePipeline.push({ $set: heartbeatSet });

    let action = 'warn';
    let inconsistent = false;
    const inconsistentReasons = [];
    if (settings.enableFullscreen && !normalizedStatus.fullscreen) {
      inconsistent = true;
      inconsistentReasons.push('fullscreen');
    }
    if (settings.tabSwitchDetection && !normalizedStatus.tabActive) {
      inconsistent = true;
      inconsistentReasons.push('tab');
    }
    // Camera no-face / soft camera warnings must never force a security re-check via heartbeat.
    // Camera issues are handled separately through non-blocking notices and explicit camera violations.
    if (settings.idleDetection && normalizedStatus.idle) {
      inconsistent = true;
      inconsistentReasons.push('idle');
    }
    if (settings.preventMultipleTabs && normalizedStatus.duplicateTab) {
      inconsistent = true;
      inconsistentReasons.push('duplicate_tab');
    }

    // Heartbeats are an audit signal only. Confirmed tab-switch events are
    // logged through the dedicated violation endpoint and are the only event
    // allowed to create a security recheck pause.

    const sessionFilter = [
      { activeSessionId: { $exists: false } },
      { activeSessionId: '' },
    ];
    if (normalizedSessionId) sessionFilter.push({ activeSessionId: normalizedSessionId });

    const submission = await AssessmentSubmission.findOneAndUpdate(
      {
        assessmentId: assessment._id,
        studentId,
        status: 'in_progress',
        ...(req.body?.submissionId !== undefined ? { _id: req.body.submissionId } : {}),
        ...(req.body?.attemptGeneration !== undefined ? { attemptGeneration: Number(req.body.attemptGeneration) } : {}),
        $or: sessionFilter,
      },
      updatePipeline,
      { new: true },
    ).select('status startedAt pausedDurationMs violationScore pauseCount lastPauseAt pauseStartedAt');

    if (!submission) {
      const existingSubmission = await AssessmentSubmission.findOne({ assessmentId: assessment._id, studentId })
        .select('status activeSessionId')
        .lean();
      if (!existingSubmission) return res.status(404).json({ error: 'Submission not found.' });
      if (req.body?.submissionId !== undefined && String(req.body.submissionId) !== String(existingSubmission._id)) {
        return res.status(409).json({ error: 'This request belongs to a different assessment attempt.', code: 'ATTEMPT_IDENTITY_CONFLICT' });
      }
      if (isTerminalAssessmentSubmission(existingSubmission)) return res.json({ ok: true, action: 'warn', ignored: true });
      return res.status(409).json({
        error: 'This assessment is already active in another tab, browser, or device.',
        code: 'ACTIVE_ASSESSMENT_SESSION',
      });
    }

    const allowedEnd = computeAllowedEnd(assessment, submission.startedAt || now, submission.pausedDurationMs);
    const response = {
      ok: true,
      action,
      inconsistent,
      violationScore: submission.violationScore || 0,
      pauseCount: submission.pauseCount || 0,
      lastPauseAt: submission.lastPauseAt,
      pauseStartedAt: submission.pauseStartedAt,
      securityRecheckTimeoutSec: getSecurityRecheckTimeoutSec(settings),
      allowedEnd,
      serverTime: now,
    };
    await writePresenceCheckpoint(studentId, assessment._id, req.body || {}, response);
    return res.json(response);
  } catch (err) {
    console.error('Error logging heartbeat:', err);
    return res.status(500).json({ error: 'Failed to log heartbeat.' });
  }
}

export async function markStudentAssessmentSetupStep(req, res) {
  try {
    const { step, meta } = req.body || {};
    if (!['environment', 'camera', 'fullscreen', 'location', 'final'].includes(step)) throw new AssessmentWriteError(400, 'INVALID_SETUP_STEP', 'Invalid security setup step.');
    const assessment = await requireStudentAssessment(req.params.id, req.user, { metadataOnly: true });
    const now = new Date();
    const { submission, result } = await mutateAssessmentSubmission({
      filter: { assessmentId: assessment._id, studentId: req.user._id },
      mutate: async (doc) => {
        assertAssessmentSession(doc, req.body);
        if (isTerminalAssessmentSubmission(doc)) return { terminal: true };
        if (finalizeIfDeadlinePassed(doc, assessment, now)) return { terminal: true };
        const settings = normalizeAssessmentSettings(assessment.settings || {});
        if (now < assessment.startTime || (isAssessmentClosedForStudents(assessment, now) && !isSecurityPauseWithinLimit(doc, settings, now))) {
          throw new AssessmentWriteError(403, 'ASSESSMENT_CLOSED', 'Assessment is outside the active time window.');
        }
        const check = await ensureAssessmentPasswordUnlocked(assessment, doc);
        if (!check.ok) throw new AssessmentWriteError(check.status, 'ASSESSMENT_LOCKED', check.error);
        const required = getRequiredSecuritySteps(assessment.settings || {}, doc);
        if (!canRecordSecurityStep(step, doc, required)) throw new AssessmentWriteError(409, 'SETUP_ORDER', 'Complete previous setup steps before continuing.', { requiredSecuritySteps: required, completedSecuritySteps: getCompletedSecuritySteps(doc) });
        const setup = { ...(doc.securitySetup || {}) };
        setup[step + 'At'] = setup[step + 'At'] || now;
        if (step === 'location' && meta && typeof meta === 'object') {
          const latitude = Number(meta.latitude), longitude = Number(meta.longitude), accuracy = Number(meta.accuracy);
          if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0) {
            throw new AssessmentWriteError(400, 'INVALID_LOCATION', 'Invalid location coordinates.');
          }
          setup.location = { latitude, longitude, accuracy, capturedAt: now };
        }
        doc.set('securitySetup', setup);
        doc.markModified('securitySetup');
        if (step === 'final' && hasCompletedRequiredSecuritySteps(doc, required)) doc.securityCompletedAt = doc.securityCompletedAt || now;
        return { required };
      },
    });
    if (!submission) throw new AssessmentWriteError(404, 'ATTEMPT_NOT_FOUND', 'Unlock the assessment first.');
    if (result?.terminal) return res.status(409).json({ error: 'Assessment was already submitted.', status: submission.status, ...assessmentWriteAcknowledgement(submission) });
    const required = result?.required || getRequiredSecuritySteps(assessment.settings || {}, submission);
    return res.json({ ok: true, requiredSecuritySteps: required, completedSecuritySteps: getCompletedSecuritySteps(submission),
      canBeginAssessment: hasCompletedRequiredSecuritySteps(submission, required), location: submission.securitySetup?.location || null,
      securityRecheckTimeoutSec: getSecurityRecheckTimeoutSec(assessment.settings || {}), ...assessmentWriteAcknowledgement(submission) });
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

async function requireMonitoringAttempt(req) {
  const assessment = await requireStudentAssessment(req.params.id, req.user, { metadataOnly: true });
  const doc = await AssessmentSubmission.findOne({ assessmentId: assessment._id, studentId: req.user._id })
    .select('assessmentId studentId status activeSessionId attemptGeneration');
  if (!doc) throw new AssessmentWriteError(404, 'ATTEMPT_NOT_FOUND', 'Submission not found.');
  assertAssessmentSession(doc, req.body);
  return doc;
}

export async function createStudentEvidenceUpload(req, res) {
  try {
    const doc = await requireMonitoringAttempt(req);
    if (isTerminalAssessmentSubmission(doc)) throw new AssessmentWriteError(409, 'ATTEMPT_CLOSED', 'The attempt is already submitted.');
    return res.json(await createAssessmentEvidenceUpload(doc, req.body || {}));
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

export async function logStudentMonitoring(req, res) {
  try {
    const doc = await requireMonitoringAttempt(req);
    if (isTerminalAssessmentSubmission(doc)) return res.json({ ok: true, ignored: true });
    const { snapshot, event } = req.body || {};
    const base = { submissionId: doc._id, assessmentId: doc.assessmentId, studentId: req.user._id, attemptGeneration: doc.attemptGeneration || 1 };
    const rows = [];
    const validEventDate = (value) => {
      const parsed = new Date(value || Date.now());
      if (Number.isNaN(parsed.getTime())) throw new AssessmentWriteError(400, 'INVALID_EVENT_TIME', 'Invalid monitoring timestamp.');
      return parsed;
    };
    if (snapshot && typeof snapshot === 'object') {
      const objectKey = snapshot.objectKey ? await verifyAssessmentEvidenceUpload(doc, snapshot) : '';
      const legacyDataUrl = objectKey ? undefined : normalizeLegacyEvidence(snapshot.dataUrl);
      rows.push({ ...base, eventId: String(snapshot.eventId || objectKey || crypto.randomUUID()).slice(0, 240),
        kind: 'snapshot', type: String(snapshot.type || 'camera').slice(0, 64), at: validEventDate(snapshot.capturedAt),
        objectKey: objectKey || undefined, legacyDataUrl,
        width: Math.min(8192, Math.max(0, Number(snapshot.width) || 0)), height: Math.min(8192, Math.max(0, Number(snapshot.height) || 0)) });
    }
    if (event && typeof event === 'object') {
      const eventMeta = event.meta && typeof event.meta === 'object' ? event.meta : {};
      if (Buffer.byteLength(JSON.stringify(eventMeta)) > 8192) throw new AssessmentWriteError(413, 'EVENT_TOO_LARGE', 'Monitoring metadata is too large.');
      rows.push({ ...base, eventId: String(event.eventId || crypto.randomUUID()).slice(0, 160),
        kind: 'monitoring', type: String(event.type || 'info').slice(0, 64), message: String(event.message || '').slice(0, 1000),
        at: validEventDate(event.at), meta: eventMeta });
    }
    if (rows.length) await AssessmentEvent.bulkWrite(rows.map((row) => ({ updateOne: {
      filter: { submissionId: row.submissionId, attemptGeneration: row.attemptGeneration, eventId: row.eventId },
      update: { $setOnInsert: row }, upsert: true,
    } })));
    return res.json({ ok: true });
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

export async function getAssessmentEvidence(req, res) {
  try {
    const event = await AssessmentEvent.findOne({ _id: req.params.eventId, kind: 'snapshot' }).select('+legacyDataUrl').lean();
    if (!event) throw new AssessmentWriteError(404, 'EVIDENCE_NOT_FOUND', 'Evidence not found.');
    if (req.user.role !== 'admin') {
      const assessment = await Assessment.findById(event.assessmentId).select('createdBy').lean();
      if (!assessment || (req.user.coordinatorDataScope !== 'all' && String(assessment.createdBy) !== String(req.user._id))) {
        throw new AssessmentWriteError(403, 'FORBIDDEN', 'Access denied.');
      }
    }
    res.set('Cache-Control', 'private, no-store');
    return res.json({ url: event.objectKey ? await signAssessmentEvidenceRead(event.objectKey) : event.legacyDataUrl, expiresIn: 120 });
  } catch (error) { return respondAssessmentWriteError(res, error); }
}

export async function getSubmissionViolations(req, res) {
  try {
    const { submissionId } = req.params;
    const submission = await AssessmentSubmission.findById(submissionId)
      .populate('studentId', 'name email studentId')
      .select('attemptGeneration violationLog violations monitoringEvents proctoringSnapshots.type proctoringSnapshots.capturedAt proctoringSnapshots.width proctoringSnapshots.height aiProctoringSummary tabSwitches fullscreenExits copyPasteCount cameraFlags violationScore pauseCount lastPauseAt status startedAt submittedAt studentId assessmentId securitySetup securityHeartbeat lastIp lastUserAgent')
      .lean();
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    if (req.user && req.user.role === 'coordinator' && req.user.coordinatorDataScope !== 'all') {
      const assessment = await Assessment.findById(submission.assessmentId).select('createdBy').lean();
      if (!assessment || String(assessment.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }
    const assessment = await Assessment.findById(submission.assessmentId)
      .select('title startTime endTime duration settings')
      .lean();
    const userAgentDetails = parseUserAgentDetails(submission.lastUserAgent || '');
    const eventFilter = { submissionId: submission._id, attemptGeneration: submission.attemptGeneration || 1 };
    if (req.query.before && mongoose.Types.ObjectId.isValid(req.query.before)) eventFilter._id = { $lt: new mongoose.Types.ObjectId(req.query.before) };
    const records = await AssessmentEvent.find(eventFilter).sort({ _id: -1 }).limit(251).lean();
    const hasMoreEvents = records.length > 250;
    const page = records.slice(0, 250);
    for (const record of page) {
      if (record.kind === 'snapshot') {
        (submission.proctoringSnapshots ||= []).push({ ...record, evidenceId: String(record._id) });
      } else {
        (submission[record.kind === 'violation' ? 'violationLog' : 'monitoringEvents'] ||= []).push(record);
      }
    }
    const timeline = buildMonitoringTimeline(submission);
    const aiProctoringSummary = normalizeAiProctoringSummaryForReport(submission.aiProctoringSummary);
    const aiViolationLog = timeline.filter((entry) => isAiProctoringViolation(entry?.type));
    return res.json({
      submission: {
        id: String(submission._id),
        studentName: (submission.studentId && submission.studentId.name) || 'Unknown',
        studentEmail: (submission.studentId && submission.studentId.email) || '',
        studentRollNo: (submission.studentId && submission.studentId.studentId) || '',
        assessmentTitle: assessment?.title || '',
        status: submission.status,
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
      },
      assessment: assessment || null,
      counters: {
        tabSwitches: submission.tabSwitches || 0,
        fullscreenExits: submission.fullscreenExits || 0,
        copyPasteCount: submission.copyPasteCount || 0,
        cameraFlags: submission.cameraFlags || 0,
        violationScore: submission.violationScore || 0,
        pauseCount: submission.pauseCount || 0,
        lastPauseAt: submission.lastPauseAt,
        totalViolations: (submission.tabSwitches || 0) + (submission.fullscreenExits || 0) + (submission.cameraFlags || 0) + (submission.copyPasteCount || 0),
        aiProctoringSummary,
      },
      aiProctoringSummary,
      aiViolationLog,
      timeline,
      nextEventCursor: hasMoreEvents ? String(page.at(-1)._id) : null,
      securitySetup: submission.securitySetup || {},
      securityHeartbeat: submission.securityHeartbeat || {},
      device: {
        browser: userAgentDetails.browser,
        os: userAgentDetails.os,
        ipAddress: submission.lastIp || '',
        userAgent: submission.lastUserAgent || '',
      },
    });
  } catch (err) {
    console.error('Error fetching violations:', err);
    return res.status(500).json({ error: 'Failed to fetch violations.' });
  }
}
