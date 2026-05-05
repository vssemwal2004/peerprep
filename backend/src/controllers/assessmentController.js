import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Problem from '../models/Problem.js';
import User from '../models/User.js';
import { sendOnboardingEmail, sendAssessmentNotificationEmail } from '../utils/mailer.js';
import { createNotification, createNotifications } from '../services/notificationService.js';
import { enqueueAssessmentCodingEvaluationJobs } from '../services/compilerExecutionWorkflowService.js';
import { removeAssessmentQuestionsFromLibrary, syncAssessmentQuestionsToLibrary } from '../services/questionLibraryService.js';
import { logActivity } from './adminActivityController.js';

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
    branch: row.branch || map.branch,
    teacherid: row.teacherid || row.teacherId || map.teacherid || map.teacher_id,
    semester: row.semester || map.semester,
    course: row.course || map.course,
    college: row.college || map.college,
    group: row.group || map.group,
  };
}

function parseDate(input) {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeStatus(now, assessment) {
  if (assessment.lifecycleStatus === 'draft') return 'Draft';
  if (now < assessment.startTime) return 'Upcoming';
  if (now > assessment.endTime) return 'Completed';
  return 'Active';
}

function computeAllowedEnd(assessment, startedAt) {
  const durationMs = (assessment.duration || 0) * 60 * 1000;
  const byDuration = new Date(startedAt.getTime() + durationMs);
  return byDuration < assessment.endTime ? byDuration : assessment.endTime;
}

function getRequiredSecuritySteps(settings = {}) {
  const steps = ['environment'];
  if (settings.cameraMonitoring) steps.push('camera');
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

function sanitizeAssessmentForResponse(assessment) {
  if (!assessment) return assessment;
  const source = typeof assessment.toObject === 'function' ? assessment.toObject() : { ...assessment };
  delete source.passwordHash;
  return source;
}

async function applyAssessmentPassword(assessment, { passwordEnabled, password } = {}) {
  if (passwordEnabled === undefined && password === undefined) return;

  if (passwordEnabled !== undefined) {
    assessment.passwordEnabled = Boolean(passwordEnabled);
    if (!assessment.passwordEnabled) {
      assessment.passwordHash = undefined;
      return;
    }
  }

  if (!assessment.passwordEnabled) return;

  const nextPassword = typeof password === 'string' ? password.trim() : '';
  if (nextPassword) {
    assessment.passwordHash = await User.hashPassword(nextPassword);
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

async function verifyAssessmentPassword(assessment, password) {
  if (!assessment.passwordEnabled) return { ok: true };
  if (!assessment.passwordHash) return { ok: false, status: 403, error: 'Assessment password is not set. Please contact your admin.' };
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

function evaluateQuestionResponse(question = {}, section = {}, answer = null) {
  const type = question.type || section.type;

  if (type === 'mcq') {
    if (!hasMeaningfulValue(answer?.answer)) return 'skipped';
    return Number(answer.answer) === Number(question.correctOptionIndex) ? 'correct' : 'wrong';
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
    return hasCode ? 'pending' : 'skipped';
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
  return Math.round((endedAt - startedAt) / 1000);
}

function formatStudentSubmissionStatus(submission = {}) {
  return submission.status === 'submitted' ? 'Completed' : 'Partial';
}

function buildStudentReportRow(assessment = {}, submission = {}) {
  const analytics = buildAssessmentAttemptAnalytics(assessment, submission);
  const totalMarks = Number(assessment.totalMarks || computeTotalMarksFromSections(assessment.sections || []));
  const score = Number(submission.score || 0);
  const accuracy = Number.isFinite(Number(submission.accuracy))
    ? Number(submission.accuracy)
    : totalMarks > 0
      ? Number(((score / totalMarks) * 100).toFixed(2))
      : 0;

  return {
    id: submission._id,
    assessmentId: assessment._id,
    assessmentName: assessment.title || 'Untitled Assessment',
    assessmentType: assessment.assessmentType || 'mixed',
    dateAttempted: submission.submittedAt || submission.startedAt || submission.updatedAt || submission.createdAt,
    status: formatStudentSubmissionStatus(submission),
    score,
    totalMarks,
    totalQuestions: analytics.totalQuestions,
    correctAnswers: analytics.correctAnswers,
    wrongAnswers: analytics.wrongAnswers,
    skippedQuestions: analytics.skippedQuestions,
    pendingEvaluationQuestions: analytics.pendingEvaluationQuestions,
    accuracy,
    timeTakenSec: computeSubmissionTimeTakenSec(submission),
    submittedAt: submission.submittedAt,
    startedAt: submission.startedAt,
    sectionBreakdown: analytics.sectionBreakdown,
  };
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
      return {
        ...question,
        type: 'coding',
        problemId: resolvedProblemId || undefined,
        problemDataSnapshot: snapshot || undefined,
      };
    });
    return {
      ...section,
      questions: normalizedQuestions,
    };
  });
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
    const questions = (section?.questions || []).map((question) => {
      const points = Number(question?.points ?? question?.marks ?? marksPerQuestion) || 1;
      return {
        ...question,
        points,
        marks: points,
      };
    });
    const totalMarks = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
    return {
      ...section,
      marksPerQuestion,
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
  const answerMap = new Map();
  (answers || []).forEach((ans) => {
    answerMap.set(`${ans.sectionIndex}-${ans.questionIndex}`, ans);
  });

  let score = 0;
  let maxMarks = 0;
  (assessment.sections || []).forEach((section, sIdx) => {
    const questions = section.questions || [];
    questions.forEach((question, qIdx) => {
      const questionType = question.type || section.type;
      const points = Number(question.points || question.marks || 0);
      maxMarks += points;
      const answer = answerMap.get(`${sIdx}-${qIdx}`);
      if (!answer) return;
      if (questionType === 'mcq') {
        if (Number(answer.answer) === Number(question.correctOptionIndex)) {
          score += points;
        }
      } else if (questionType === 'short' || questionType === 'one_line') {
        const expected = (question.expectedAnswer || '').trim().toLowerCase();
        const actual = (answer.answer || '').toString().trim().toLowerCase();
        if (!expected) return;
        if (actual === expected) {
          score += points;
        } else if (Array.isArray(question.keywords) && question.keywords.length > 0) {
          const matched = question.keywords.every((k) => actual.includes(String(k).toLowerCase()));
          if (matched) score += points;
        }
      } else if (questionType === 'coding') {
        if (String(answer.executionVerdict || '').toUpperCase() === 'AC') {
          score += points;
        }
      }
    });
  });
  const accuracy = maxMarks > 0 ? Math.round((score / maxMarks) * 10000) / 100 : 0;
  return { score, maxMarks, accuracy };
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

function computeTotalMarksFromSections(sections = []) {
  return (sections || []).reduce((sum, section) => {
    const sectionSum = (section?.questions || []).reduce((qSum, question) => qSum + (Number(question?.points || question?.marks || 0)), 0);
    return sum + sectionSum;
  }, 0);
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

async function resolveAssignedStudents({ targetType, assignedStudents }) {
  if (targetType === 'all') {
    const students = await User.find({ role: 'student' }).select('_id email name studentId').lean();
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
  }).select('_id email name studentId').lean();

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

  for (const row of normalizedRows) {
    if (row._id && existingById.has(row._id.toString())) {
      assignedIds.push(existingById.get(row._id.toString())._id);
      continue;
    }

    const byEmail = row.email ? existingByEmail.get(row.email.toLowerCase()) : null;
    const byStudentId = row.studentid ? existingByStudentId.get(row.studentid.toString()) : null;
    const existingUser = byEmail || byStudentId;

    if (existingUser) {
      assignedIds.push(existingUser._id);
      continue;
    }

    const required = ['name', 'email', 'studentid', 'branch', 'teacherid', 'semester', 'course', 'college'];
    const missing = required.filter((k) => !row[k] || row[k].toString().trim() === '');
    if (missing.length > 0) {
      throw new Error(`Missing required fields for new student (${missing.join(', ')}). Use the onboarding CSV template.`);
    }

    const teacherIds = parseTeacherIds(row.teacherid);
    if (teacherIds.length === 0) {
      throw new Error('Teacher ID / Coordinator code is required for new students.');
    }

    const invalidIds = teacherIds.filter(id => !validCoordinatorIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`Teacher ID / Coordinator code(s) "${invalidIds.join(', ')}" do not match any existing coordinator.`);
    }

    const semesterNum = parseInt(row.semester, 10);
    if (Number.isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      throw new Error('Semester must be between 1 and 8 for new students.');
    }

    const generatedPassword = generateRandomPassword();
    const passwordHash = await User.hashPassword(generatedPassword);

    const user = await User.create({
      role: 'student',
      name: row.name,
      email: row.email,
      studentId: row.studentid,
      branch: row.branch,
      course: row.course,
      college: row.college,
      teacherIds,
      semester: semesterNum,
      group: row.group,
      passwordHash,
      mustChangePassword: true,
    });

    assignedIds.push(user._id);

    created.push({
      id: user._id,
      email: user.email,
      studentId: user.studentId,
      password: generatedPassword,
    });
  }

  const users = await User.find({ _id: { $in: assignedIds } }).select('_id email name studentId').lean();
  return { ids: assignedIds, users, created };
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
    } = req.body || {};

    const normalizedSections = normalizeAssessmentSections(sections);
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
      await validatePublishedAssessmentSections(normalizedSections);
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
      draftTargetMode: isDraft ? normalizedDraftTarget : 'all',
      draftAssignedStudents: isDraft ? draftAssigned : [],
      sections: marksPayload.sections,
      totalMarks: marksPayload.totalMarks,
      assessmentType: marksPayload.assessmentType,
      lifecycleStatus: normalizedLifecycle,
      allowLateSubmission: Boolean(allowLateSubmission),
      attemptLimit: attemptLimitNum || 1,
      assessmentId: assessmentId || '',
      testType: testType || '',
      isVisible: isVisible !== false,
      customInstructions: Array.isArray(customInstructions) ? customInstructions : [],
      settings: settings && typeof settings === 'object' ? settings : {},
      version: 1,
      versionUpdatedAt: new Date(),
    });

    await applyAssessmentPassword(assessment, { passwordEnabled, password });
    if (!isDraft && assessment.passwordEnabled && !assessment.passwordHash) {
      return res.status(400).json({ error: 'Password is required when password protection is enabled.' });
    }

    await assessment.save();

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
        if (normalizedLifecycle === 'published' && created.length > 0 && process.env.EMAIL_ON_ONBOARD === 'true') {
          await Promise.allSettled(
            created.map(student =>
              sendOnboardingEmail({
                to: student.email,
                studentId: student.studentId,
                password: student.password,
              })
            )
          );
        }

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

        if (normalizedLifecycle === 'published' && sendEmail !== false && process.env.EMAIL_ON_ASSESSMENT === 'true') {
          const emailJobs = users
            .filter(u => u.email)
            .map(u => sendAssessmentNotificationEmail({
              to: u.email,
              assessment,
              student: u,
            }));
          await Promise.allSettled(emailJobs);
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
    if (req.user?.role === 'coordinator') {
      query.createdBy = req.user._id;
    }
    const assessments = await Assessment.find(query).sort({ createdAt: -1 }).lean();
    const submissionCounts = await AssessmentSubmission.aggregate([
      {
        $group: {
          _id: '$assessmentId',
          count: { $sum: 1 },
          submitted: {
            $sum: {
              $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0],
            },
          },
        },
      },
    ]);
    const countsByAssessment = new Map(submissionCounts.map((c) => [String(c._id), c]));
    const now = new Date();
    const data = assessments.map((a) => {
      const status = computeStatus(now, a);
      const assignedCount = a.targetType === 'all'
        ? 'All Students'
        : (a.lifecycleStatus === 'draft'
          ? (a.draftAssignedStudents?.length || 0)
          : (a.assignedStudents?.length || 0));

      return {
        ...sanitizeAssessmentForResponse(a),
        status,
        assignedCount,
        attempts: countsByAssessment.get(String(a._id))?.count || 0,
        submissions: countsByAssessment.get(String(a._id))?.submitted || 0,
      };
    });
    res.json({ count: data.length, assessments: data });
  } catch (err) {
    console.error('Error listing assessments:', err);
    res.status(500).json({ error: 'Failed to load assessments' });
  }
}

export async function getAssessment(req, res) {
  try {
    const { id } = req.params;
    const assessment = await Assessment.findById(id).populate('assignedStudents', 'name email studentId').lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const status = computeStatus(new Date(), assessment);
    res.json({ assessment: { ...sanitizeAssessmentForResponse(assessment), status } });
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
    } = req.body || {};

    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
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
    if (isVisible !== undefined) assessment.isVisible = isVisible !== false;
    if (customInstructions !== undefined) {
      assessment.customInstructions = Array.isArray(customInstructions) ? customInstructions : [];
    }
    if (settings !== undefined) {
      assessment.settings = settings && typeof settings === 'object' ? settings : {};
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

    if (!isDraft) {
      await validatePublishedAssessmentSections(assessment.sections || []);
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

    if (sections) {
      const normalized = normalizeAssessmentSections(sections);
      const marksPayload = applyMarksAndTotals(normalized);
      assessment.sections = marksPayload.sections;
      assessment.totalMarks = marksPayload.totalMarks;
      assessment.assessmentType = marksPayload.assessmentType;
    }

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
        const { ids } = await resolveAssignedStudents({
          targetType: normalizedTarget,
          assignedStudents,
        });
        assessment.assignedStudents = ids;
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

    assessment.version = (assessment.version || 1) + 1;
    assessment.versionUpdatedAt = new Date();

    await assessment.save();
    if ((assessment.passwordHash || '') !== previousPasswordHash) {
      await AssessmentSubmission.updateMany(
        {
          assessmentId: assessment._id,
          status: { $in: ['not_started', 'incomplete'] },
        },
        { $unset: { passwordVerifiedAt: '' } },
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

    res.json({ message: 'Assessment updated', assessmentId: assessment._id });

    if (assessment.lifecycleStatus === 'published' && sendEmail !== false && process.env.EMAIL_ON_ASSESSMENT === 'true') {
      const assignedUsers = await User.find({ _id: { $in: assessment.assignedStudents || [] } }).select('_id email name studentId').lean();
      setImmediate(async () => {
        try {
          const emailJobs = assignedUsers
            .filter(u => u.email)
            .map(u => sendAssessmentNotificationEmail({
              to: u.email,
              assessment,
              student: u,
            }));
          await Promise.allSettled(emailJobs);
        } catch (err) {
          console.error('[Assessment] Email send failed:', err.message);
        }
      });
    }

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

    await AssessmentSubmission.deleteMany({ assessmentId: id });

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
    const data = assessments.map((a) => {
      const submission = submissionsByAssessment.get(a._id.toString());
      let status = 'Not Started';
      if (submission?.status === 'submitted') status = 'Completed';
      else if (submission?.status === 'violation') status = 'Violation';
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
        totalMarks: a.totalMarks || computeTotalMarksFromSections(a.sections || []),
        totalQuestions: countQuestions(a.sections || []),
        assessmentType: a.assessmentType || 'mixed',
        attemptLimit: a.attemptLimit,
        passwordEnabled: Boolean(a.passwordEnabled),
        settings: a.settings || {},
        status,
        submittedAt: submission?.submittedAt,
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

    const [assessments, studentSubmissions, leaderboardRows] = await Promise.all([
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
      AssessmentSubmission.aggregate([
        { $match: { status: 'submitted' } },
        {
          $group: {
            _id: '$studentId',
            totalScore: { $sum: { $ifNull: ['$score', 0] } },
            assessmentsCompleted: { $sum: 1 },
            averageAccuracy: { $avg: '$accuracy' },
            averageTimeTakenSec: { $avg: '$timeTakenSec' },
            latestSubmittedAt: { $max: '$submittedAt' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'student',
          },
        },
        { $unwind: '$student' },
        {
          $project: {
            studentId: '$_id',
            name: '$student.name',
            avatarUrl: '$student.avatarUrl',
            collegeId: '$student.studentId',
            totalScore: { $round: ['$totalScore', 2] },
            assessmentsCompleted: 1,
            averageAccuracy: { $round: [{ $ifNull: ['$averageAccuracy', 0] }, 2] },
            averageTimeTakenSec: { $round: [{ $ifNull: ['$averageTimeTakenSec', 0] }, 0] },
            latestSubmittedAt: 1,
          },
        },
      ]),
    ]);

    const submissionsByAssessment = new Map(
      studentSubmissions.map((submission) => [String(submission.assessmentId), submission]),
    );

    const ongoingAssessments = [];
    const upcomingAssessments = [];
    const reportRows = [];

    assessments.forEach((assessment) => {
      const assessmentId = String(assessment._id);
      const submission = submissionsByAssessment.get(assessmentId);
      const totalMarks = Number(assessment.totalMarks || computeTotalMarksFromSections(assessment.sections || []));
      const totalQuestions = countQuestions(assessment.sections || []);
      const startsAt = assessment.startTime ? new Date(assessment.startTime) : null;
      const endsAt = assessment.endTime ? new Date(assessment.endTime) : null;
      const isUpcoming = startsAt && now < startsAt;
      const isLive = startsAt && endsAt && now >= startsAt && now <= endsAt;
      const hasExpiredLongEnough = endsAt ? (now.getTime() - endsAt.getTime()) > ASSESSMENT_EXPIRY_GRACE_MS : false;

      if ((isUpcoming || isLive) && !hasExpiredLongEnough) {
        const status = isLive ? 'Live' : 'Upcoming';
        const card = {
          _id: assessment._id,
          title: assessment.title || 'Untitled Assessment',
          description: assessment.description || '',
          instructions: assessment.instructions || '',
          customInstructions: assessment.customInstructions || [],
          startTime: assessment.startTime,
          endTime: assessment.endTime,
          duration: assessment.duration || 0,
          totalMarks,
          totalQuestions,
          assessmentType: assessment.assessmentType || 'mixed',
          passwordEnabled: Boolean(assessment.passwordEnabled),
          settings: assessment.settings || {},
          status,
          actionLabel: submission?.status === 'in_progress' ? 'Continue' : 'Start',
          hasSubmissionInProgress: submission?.status === 'in_progress',
        };

        if (status === 'Live') ongoingAssessments.push(card);
        else upcomingAssessments.push(card);
      }

      if (submission && (submission.startedAt || submission.submittedAt || submission.updatedAt)) {
        reportRows.push(buildStudentReportRow(assessment, submission));
      }
    });

    const sortedReports = reportRows.sort(
      (a, b) => new Date(b.dateAttempted || 0).getTime() - new Date(a.dateAttempted || 0).getTime(),
    );

    const historyRows = sortedReports.filter((row) => {
      const assessment = assessments.find((item) => String(item._id) === String(row.assessmentId));
      const ended = assessment?.endTime ? new Date(assessment.endTime).getTime() < now.getTime() : false;
      return row.status === 'Completed' && ended;
    });

    const leaderboard = [...leaderboardRows]
      .sort((left, right) => {
        if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
        if (right.averageAccuracy !== left.averageAccuracy) return right.averageAccuracy - left.averageAccuracy;
        if (right.assessmentsCompleted !== left.assessmentsCompleted) return right.assessmentsCompleted - left.assessmentsCompleted;
        return String(left.name || '').localeCompare(String(right.name || ''));
      })
      .map((entry, index) => ({
        rank: index + 1,
        studentId: entry.studentId,
        name: entry.name || 'Student',
        avatarUrl: entry.avatarUrl || '',
        collegeId: entry.collegeId || '',
        score: Number(entry.totalScore || 0),
        assessmentsCompleted: Number(entry.assessmentsCompleted || 0),
        averageAccuracy: Number(entry.averageAccuracy || 0),
        averageTimeTakenSec: Number(entry.averageTimeTakenSec || 0),
        latestSubmittedAt: entry.latestSubmittedAt,
        isCurrentStudent: String(entry.studentId) === studentId,
      }));

    const currentStudentRank = leaderboard.find((entry) => entry.isCurrentStudent) || null;
    const completedReports = sortedReports.filter((row) => row.status === 'Completed');
    const averageScore = completedReports.length
      ? Number((completedReports.reduce((sum, row) => sum + Number(row.score || 0), 0) / completedReports.length).toFixed(2))
      : 0;
    const bestScore = completedReports.length
      ? Math.max(...completedReports.map((row) => Number(row.score || 0)))
      : 0;

    res.json({
      serverTime: now,
      currentStudent: {
        id: studentId,
        rank: currentStudentRank?.rank || null,
      },
      overview: {
        upcomingCount: upcomingAssessments.length,
        liveCount: ongoingAssessments.length,
        reportsCount: sortedReports.length,
        historyCount: historyRows.length,
        averageScore,
        bestScore,
      },
      upcomingAssessments,
      ongoingAssessments,
      reports: sortedReports,
      history: historyRows,
      leaderboard,
    });
  } catch (err) {
    console.error('Error loading student assessment dashboard:', err);
    res.status(500).json({ error: 'Failed to load assessment dashboard' });
  }
}

export async function getStudentAssessment(req, res) {
  try {
    const { id } = req.params;
    const studentId = req.user._id;

    const assessment = await Assessment.findById(id).lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (assessment.lifecycleStatus === 'draft') {
      return res.status(403).json({ error: 'Assessment is not published yet.' });
    }
    if (!assessment.startTime || !assessment.endTime || !assessment.duration) {
      return res.status(400).json({ error: 'Assessment schedule is incomplete.' });
    }

    const isAssigned = assessment.targetType === 'all' || (assessment.assignedStudents || []).some(s => s.toString() === studentId.toString());
    if (!isAssigned) return res.status(403).json({ error: 'Not assigned to this assessment.' });

    const now = new Date();
    if (now < assessment.startTime) {
      return res.status(403).json({ error: 'Assessment has not started yet.', serverTime: now, startTime: assessment.startTime });
    }

    let submission = await AssessmentSubmission.findOne({ assessmentId: id, studentId });

    const passwordCheck = await ensureAssessmentPasswordUnlocked(assessment, submission);
    if (!passwordCheck.ok) {
      return res.status(passwordCheck.status).json({ error: passwordCheck.error });
    }

    if (now > assessment.endTime && !submission) {
      return res.status(403).json({ error: 'Assessment window has closed.', serverTime: now, endTime: assessment.endTime });
    }

    const attemptLimit = assessment.attemptLimit || 1;
    if (submission?.status === 'submitted' && submission.attemptCount >= attemptLimit) {
      return res.status(403).json({ error: 'No attempts remaining for this assessment.' });
    }

    if (!submission) {
      submission = await AssessmentSubmission.create({
        assessmentId: id,
        studentId,
        status: 'not_started',
        attemptCount: 0,
      });
    }

    const allowedEnd = computeAllowedEnd(assessment, submission.startedAt || now);
    if (now > allowedEnd && submission.status !== 'submitted') {
      submission.status = 'submitted';
      submission.submittedAt = now;
      submission.attemptCount = Math.max(submission.attemptCount || 0, 1);
      submission.isLate = assessment.allowLateSubmission ? false : true;
      await submission.save();
    }

    res.json({
      assessment: sanitizeAssessmentForResponse(assessment),
      submission,
      serverTime: now,
      allowedEnd,
      requiresSecuritySetup: Boolean(submission && submission.status !== 'submitted' && !submission.securityCompletedAt),
      requiredSecuritySteps: getRequiredSecuritySteps(assessment.settings || {}),
      completedSecuritySteps: getCompletedSecuritySteps(submission),
    });
  } catch (err) {
    console.error('Error fetching student assessment:', err);
    res.status(500).json({ error: 'Failed to load assessment' });
  }
}

export async function startStudentAssessment(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    const studentId = req.user._id;

    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (assessment.lifecycleStatus === 'draft') {
      return res.status(403).json({ error: 'Assessment is not published yet.' });
    }
    if (!assessment.startTime || !assessment.endTime || !assessment.duration) {
      return res.status(400).json({ error: 'Assessment schedule is incomplete.' });
    }

    const isAssigned = assessment.targetType === 'all' || (assessment.assignedStudents || []).some(s => s.toString() === studentId.toString());
    if (!isAssigned) return res.status(403).json({ error: 'Not assigned to this assessment.' });

    const now = new Date();
    if (now < assessment.startTime) {
      return res.status(403).json({ error: 'Assessment has not started yet.', serverTime: now, startTime: assessment.startTime });
    }
    if (now > assessment.endTime) {
      return res.status(403).json({ error: 'Assessment window has closed.', serverTime: now, endTime: assessment.endTime });
    }

    let submission = await AssessmentSubmission.findOne({ assessmentId: id, studentId });
    const attemptLimit = assessment.attemptLimit || 1;
    if (submission?.status === 'submitted' && submission.attemptCount >= attemptLimit) {
      return res.status(403).json({ error: 'No attempts remaining for this assessment.' });
    }

    const passwordCheck = await verifyAssessmentPassword(assessment, password);
    if (!passwordCheck.ok) {
      return res.status(passwordCheck.status).json({ error: passwordCheck.error });
    }

    if (!submission) {
      submission = await AssessmentSubmission.create({
        assessmentId: id,
        studentId,
        passwordVerifiedAt: assessment.passwordEnabled ? now : undefined,
        securitySetup: {},
        status: 'not_started',
        attemptCount: 0,
      });
    } else if (assessment.passwordEnabled && !submission.passwordVerifiedAt) {
      submission.passwordVerifiedAt = now;
    }
    if (!(submission.status === 'in_progress' && submission.startedAt && submission.securityCompletedAt)) {
      submission.securitySetup = {};
      submission.securityCompletedAt = undefined;
    }
    await submission.save();

    res.json({
      message: 'Assessment unlocked',
      assessment: sanitizeAssessmentForResponse(assessment),
      submission,
      serverTime: now,
      allowedEnd: computeAllowedEnd(assessment, submission.startedAt || now),
    });
  } catch (err) {
    console.error('Error starting student assessment:', err);
    res.status(500).json({ error: 'Failed to start assessment' });
  }
}

export async function beginStudentAssessment(req, res) {
  try {
    const { id } = req.params;
    const studentId = req.user._id;
    const now = new Date();

    const assessment = await Assessment.findById(id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (assessment.lifecycleStatus === 'draft') return res.status(403).json({ error: 'Assessment is not published yet.' });
    if (!assessment.startTime || !assessment.endTime || !assessment.duration) {
      return res.status(400).json({ error: 'Assessment schedule is incomplete.' });
    }
    const isAssigned = assessment.targetType === 'all' || (assessment.assignedStudents || []).some(s => s.toString() === studentId.toString());
    if (!isAssigned) return res.status(403).json({ error: 'Not assigned to this assessment.' });
    if (now < assessment.startTime) return res.status(403).json({ error: 'Assessment has not started yet.', serverTime: now, startTime: assessment.startTime });
    if (now > assessment.endTime) return res.status(403).json({ error: 'Assessment window has closed.', serverTime: now, endTime: assessment.endTime });

    let submission = await AssessmentSubmission.findOne({ assessmentId: id, studentId });
    const passwordCheck = await ensureAssessmentPasswordUnlocked(assessment, submission);
    if (!passwordCheck.ok) return res.status(passwordCheck.status).json({ error: passwordCheck.error });
    const requiredSecuritySteps = getRequiredSecuritySteps(assessment.settings || {});
    if (!hasCompletedRequiredSecuritySteps(submission, requiredSecuritySteps)) {
      return res.status(403).json({
        error: 'Complete all required security setup steps before starting the assessment.',
        requiredSecuritySteps,
        completedSecuritySteps: getCompletedSecuritySteps(submission),
      });
    }

    if (!submission) {
      submission = await AssessmentSubmission.create({
        assessmentId: id,
        studentId,
        startedAt: now,
        securityCompletedAt: now,
        status: 'in_progress',
        attemptCount: 0,
      });
    } else if (!submission.startedAt || submission.status === 'not_started') {
      submission.startedAt = now;
      submission.securityCompletedAt = submission.securityCompletedAt || now;
      submission.status = 'in_progress';
      await submission.save();
    } else if (!submission.securityCompletedAt) {
      submission.securityCompletedAt = now;
      await submission.save();
    }

    const allowedEnd = computeAllowedEnd(assessment, submission.startedAt || now);
    return res.json({
      message: 'Assessment started',
      submission,
      serverTime: now,
      allowedEnd,
    });
  } catch (err) {
    console.error('Error beginning student assessment:', err);
    return res.status(500).json({ error: 'Failed to begin assessment' });
  }
}

export async function submitAssessment(req, res) {
  try {
    const studentId = req.user._id;
    const {
      assessmentId,
      answers,
      status,
      tabSwitches,
      fullscreenExits,
      copyPasteCount,
      cameraFlags,
      violationScore,
      pauseCount,
      lastPauseAt,
      securityHeartbeat,
      violations,
    } = req.body || {};

    if (!assessmentId) return res.status(400).json({ error: 'assessmentId is required.' });

    const assessment = await Assessment.findById(assessmentId).lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (assessment.lifecycleStatus === 'draft') {
      return res.status(403).json({ error: 'Assessment is not published yet.' });
    }
    if (!assessment.startTime || !assessment.endTime || !assessment.duration) {
      return res.status(400).json({ error: 'Assessment schedule is incomplete.' });
    }

    const isAssigned = assessment.targetType === 'all' || (assessment.assignedStudents || []).some(s => s.toString() === studentId.toString());
    if (!isAssigned) return res.status(403).json({ error: 'Not assigned to this assessment.' });

    const now = new Date();
    if (now < assessment.startTime) {
      return res.status(403).json({ error: 'Assessment has not started yet.' });
    }

    let submission = await AssessmentSubmission.findOne({ assessmentId, studentId });

    const passwordCheck = await ensureAssessmentPasswordUnlocked(assessment, submission);
    if (!passwordCheck.ok) {
      return res.status(passwordCheck.status).json({ error: passwordCheck.error });
    }

    if (now > assessment.endTime && !submission) {
      return res.status(403).json({ error: 'Assessment window has closed.' });
    }

    const attemptLimit = assessment.attemptLimit || 1;
    if (submission?.status === 'submitted' && submission.attemptCount >= attemptLimit) {
      return res.status(403).json({ error: 'No attempts remaining for this assessment.' });
    }

    if (!submission) {
      submission = await AssessmentSubmission.create({
        assessmentId,
        studentId,
        startedAt: now,
        status: 'in_progress',
        attemptCount: 0,
      });
    }

    const allowedEnd = computeAllowedEnd(assessment, submission.startedAt || now);

    const isExpired = now > allowedEnd;
    if (isExpired && !assessment.allowLateSubmission && status !== 'submitted') {
      submission.status = 'submitted';
      submission.submittedAt = now;
      submission.attemptCount = Math.max(submission.attemptCount || 0, 1);
      submission.isLate = false;
      await submission.save();
      return res.json({ message: 'Saved', status: submission.status, submittedAt: submission.submittedAt, allowedEnd, serverTime: now });
    }

    let finalStatus = isExpired && !assessment.allowLateSubmission
      ? 'submitted'
      : (status === 'submitted' ? 'submitted' : 'in_progress');

    if (status === 'violation') {
      finalStatus = 'violation';
    }

    submission.answers = Array.isArray(answers) ? answers : submission.answers;
    submission.status = finalStatus;
    submission.lastSavedAt = now;
    submission.tabSwitches = typeof tabSwitches === 'number' ? tabSwitches : submission.tabSwitches;
    submission.fullscreenExits = typeof fullscreenExits === 'number' ? fullscreenExits : submission.fullscreenExits;
    submission.copyPasteCount = typeof copyPasteCount === 'number' ? copyPasteCount : submission.copyPasteCount;
    submission.cameraFlags = typeof cameraFlags === 'number' ? cameraFlags : submission.cameraFlags;
    submission.violationScore = typeof violationScore === 'number' ? Math.max(submission.violationScore || 0, violationScore) : submission.violationScore;
    submission.pauseCount = typeof pauseCount === 'number' ? Math.max(submission.pauseCount || 0, pauseCount) : submission.pauseCount;
    if (lastPauseAt) {
      const parsedLastPauseAt = new Date(lastPauseAt);
      if (!Number.isNaN(parsedLastPauseAt.getTime())) submission.lastPauseAt = parsedLastPauseAt;
    }
    if (securityHeartbeat && typeof securityHeartbeat === 'object') {
      submission.securityHeartbeat = securityHeartbeat;
    }
    if (Array.isArray(violations) && violations.length > 0) {
      submission.violations = violations;
    }
    submission.lastIp = req.ip;
    submission.lastUserAgent = req.headers['user-agent'];

    if (finalStatus === 'submitted' && !submission.submittedAt) {
      submission.submittedAt = now;
      submission.attemptCount = (submission.attemptCount || 0) + 1;
      submission.isLate = isExpired && assessment.allowLateSubmission;
    }

    if (finalStatus === 'submitted' || finalStatus === 'violation') {
      const scoring = scoreAssessment(assessment, submission.answers);
      submission.score = scoring.score;
      submission.maxMarks = scoring.maxMarks;
      submission.accuracy = scoring.accuracy;
      const endTime = submission.submittedAt || now;
      const startedAt = submission.startedAt || now;
      submission.timeTakenSec = Math.max(0, Math.floor((endTime.getTime() - startedAt.getTime()) / 1000));
    }

    await submission.save();

    let queuedCodingJobIds = [];
    if (finalStatus === 'submitted') {
      queuedCodingJobIds = await enqueueAssessmentCodingEvaluationJobs({
        assessment,
        submission,
        studentId,
      });
    }

    if (finalStatus === 'submitted') {
      try {
        await createNotification({
          userId: studentId,
          title: 'Assessment Submitted',
          message: 'Assessment submitted successfully',
          type: 'ASSESSMENT',
          referenceId: assessment._id,
          actionUrl: '/student/assessments',
          dedupeKey: `assessment-submitted:${assessment._id}:${studentId}`
        });
      } catch (e) {
        console.error('[Assessment] Submit notification failed:', e.message);
      }
    }

    res.json({
      message: 'Saved',
      status: submission.status,
      submittedAt: submission.submittedAt,
      allowedEnd,
      serverTime: now,
      evaluationStatus: submission.evaluationStatus,
      queuedCodingJobIds,
    });
  } catch (err) {
    console.error('Error submitting assessment:', err);
    res.status(500).json({ error: 'Failed to submit assessment' });
  }
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

export async function getAssessmentReports(req, res) {
  try {
    const {
      assessmentId,
      assessmentType,
      studentId,
      status,
      from,
      to,
      scoreMin,
      scoreMax,
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

    const baseLookup = [
      { $match: match },
      { $lookup: { from: 'assessments', localField: 'assessmentId', foreignField: '_id', as: 'assessment' } },
      { $unwind: '$assessment' },
      { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
    ];

    const postMatch = {};
    if (assessmentType) postMatch['assessment.assessmentType'] = assessmentType;
    if (studentId) postMatch['student._id'] = new mongoose.Types.ObjectId(studentId);
    if (req.user?.role === 'coordinator') {
      postMatch['assessment.createdBy'] = req.user._id;
    }
    if (Object.keys(postMatch).length) {
      baseLookup.push({ $match: postMatch });
    }

    const totalStudents = await AssessmentSubmission.aggregate([
      ...baseLookup,
      { $count: 'count' },
    ]);
    const totalCount = totalStudents?.[0]?.count || 0;
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 25));
    const pageNum = Math.max(1, Number(page) || 1);
    const skip = (pageNum - 1) * limitNum;

    const studentRows = await AssessmentSubmission.aggregate([
      ...baseLookup,
      { $sort: { submittedAt: -1, startedAt: -1 } },
      { $skip: skip },
      { $limit: limitNum },
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
          score: '$score',
          accuracy: '$accuracy',
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
    ]);

    const summaryRows = await AssessmentSubmission.aggregate([
      ...baseLookup,
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          maxScore: { $max: '$score' },
          minScore: { $min: '$score' },
          total: { $sum: 1 },
          passCount: {
            $sum: {
              $cond: [
                { $gte: ['$score', { $multiply: [{ $ifNull: ['$maxMarks', '$assessment.totalMarks'] }, Number(passMark) || 0.4] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const summary = summaryRows?.[0] || { avgScore: 0, maxScore: 0, minScore: 0, total: 0, passCount: 0 };
    const failCount = Math.max(0, (summary.total || 0) - (summary.passCount || 0));

    const assessmentSummariesMatch = {};
    if (assessmentType) assessmentSummariesMatch.assessmentType = assessmentType;
    if (req.user?.role === 'coordinator') assessmentSummariesMatch.createdBy = req.user._id;

    const assessmentSummaries = await Assessment.aggregate([
      { $match: assessmentSummariesMatch },
      {
        $lookup: {
          from: 'assessmentsubmissions',
          localField: '_id',
          foreignField: 'assessmentId',
          as: 'submissions',
        },
      },
      {
        $project: {
          title: 1,
          assessmentType: 1,
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
          attempted: { $size: { $ifNull: ['$submissions', []] } },
          lastAttemptAt: { $max: '$submissions.startedAt' },
          avgScore: { $avg: '$submissions.score' },
          maxScore: { $max: '$submissions.score' },
          minScore: { $min: '$submissions.score' },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    res.json({
      assessments: assessmentSummaries,
      students: studentRows,
      summary: {
        avgScore: summary.avgScore || 0,
        maxScore: summary.maxScore || 0,
        minScore: summary.minScore || 0,
        passCount: summary.passCount || 0,
        failCount,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
      },
    });
  } catch (err) {
    console.error('Error generating assessment reports:', err);
    res.status(500).json({ error: 'Failed to generate reports' });
  }
}

export async function exportAssessmentReports(req, res) {
  try {
    const { students = [], summary } = await (async () => {
      const mockReq = { ...req, query: { ...req.query, page: 1, limit: 10000 } };
      const mockRes = {};
      const payload = await new Promise((resolve, reject) => {
        getAssessmentReports(mockReq, {
          json: (data) => resolve(data),
          status: () => ({ json: (data) => reject(data) }),
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
      row.assessmentTitle || '',
      row.assessmentType || '',
      row.studentName || '',
      row.studentId || '',
      row.attemptDate ? new Date(row.attemptDate).toISOString() : '',
      row.attempts || 0,
      row.score ?? '',
      row.accuracy ?? '',
      row.timeTakenSec ?? '',
      row.violationCount ?? 0,
      row.status || '',
    ]));

    const csv = [header, ...rows].map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="assessment-report.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error exporting assessment reports:', err);
    res.status(500).json({ error: 'Failed to export reports' });
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
  return 1;
}

function decideViolationAction({ settings = {}, type, meta = {}, submission }) {
  const totalWarnings = (submission.tabSwitches || 0)
    + (submission.fullscreenExits || 0)
    + (submission.cameraFlags || 0)
    + (submission.copyPasteCount || 0);
  const score = submission.violationScore || 0;
  const maxWarnings = numberSetting(settings, ['maxWarnings'], null);
  const warnScore = numberSetting(settings, ['violationWarnScore', 'warningScore', 'warnScore'], null);
  const pauseScore = numberSetting(settings, ['violationPauseScore', 'pauseScore'], null);
  const autoScore = numberSetting(settings, ['violationAutoSubmitScore', 'autoSubmitScore'], null);
  const autoSubmitEnabled = settings.autoSubmitOnViolation === true;

  if (autoSubmitEnabled && maxWarnings !== null && totalWarnings >= maxWarnings) return 'autosubmit';
  if (!autoSubmitEnabled && maxWarnings !== null && totalWarnings >= maxWarnings) return 'pause';
  if (autoScore !== null && score >= autoScore) return 'autosubmit';
  if (pauseScore !== null && score >= pauseScore) return 'pause';
  if (warnScore !== null && score >= warnScore) return 'warn';

  if (type === 'tab_switch') {
    const tabLimit = numberSetting(settings, ['tabSwitchLimit'], null);
    if (tabLimit !== null && submission.tabSwitches >= tabLimit) {
      return actionSetting(settings, ['tabSwitchAction'], autoSubmitEnabled ? 'autosubmit' : 'pause');
    }
    const tabWarnAt = numberSetting(settings, ['tabSwitchWarnAt'], null);
    if (tabWarnAt !== null && submission.tabSwitches >= tabWarnAt) return 'warn';
  }

  if (type === 'idle') {
    return actionSetting(settings, ['idleAction'], 'warn');
  }

  if (type === 'copy_paste' || type === 'context_menu') {
    return actionSetting(settings, ['copyPasteAction'], 'warn');
  }

  if (type === 'fullscreen_exit' && meta?.escalated) {
    return actionSetting(settings, ['fullscreenAction'], autoSubmitEnabled ? 'autosubmit' : 'pause');
  }

  if (['camera_loss', 'camera_no_face', 'multiple_faces', 'face_out_of_frame'].includes(type) && meta?.persistent) {
    return actionSetting(settings, ['cameraAction'], autoSubmitEnabled ? 'autosubmit' : 'pause');
  }

  if (type === 'duplicate_tab') {
    return actionSetting(settings, ['duplicateTabAction'], autoSubmitEnabled ? 'autosubmit' : 'pause');
  }

  if (type === 'heartbeat_failure') {
    return actionSetting(settings, ['heartbeatAction'], 'pause');
  }

  return 'warn';
}

export async function logStudentViolation(req, res) {
  try {
    const { id } = req.params;
    const studentId = req.user._id;
    const { type, message, meta } = req.body || {};
    const VALID = [
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
    ];
    if (!type || !VALID.includes(type)) return res.status(400).json({ error: 'Valid violation type required.' });
    const submission = await AssessmentSubmission.findOne({ assessmentId: id, studentId });
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    if (submission.status === 'submitted') return res.json({ ok: true });
    const assessment = await Assessment.findById(id).select('settings').lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    const settings = assessment.settings || {};
    const now = new Date();
    const weight = violationWeight(settings, type);
    submission.violationLog = submission.violationLog || [];
    submission.violationLog.push({ type, message: message || '', at: now, meta: { ...(meta || {}), weight } });
    if (type === 'tab_switch') submission.tabSwitches = (submission.tabSwitches || 0) + 1;
    if (type === 'fullscreen_exit') submission.fullscreenExits = (submission.fullscreenExits || 0) + 1;
    if (['camera_loss', 'camera_no_face', 'multiple_faces', 'face_out_of_frame'].includes(type)) submission.cameraFlags = (submission.cameraFlags || 0) + 1;
    if (type === 'copy_paste' || type === 'context_menu') submission.copyPasteCount = (submission.copyPasteCount || 0) + 1;
    submission.violationScore = (submission.violationScore || 0) + weight;
    const action = decideViolationAction({ settings, type, meta: meta || {}, submission });
    if (action === 'pause') {
      submission.pauseCount = (submission.pauseCount || 0) + 1;
      submission.lastPauseAt = now;
      resetSubmissionSecuritySetup(submission);
    }
    if (action === 'autosubmit') {
      submission.violationLog.push({
        type: 'auto_submit',
        message: 'Assessment auto-submitted after violation limit was reached.',
        at: now,
        meta: { trigger: type, score: submission.violationScore },
      });
    }
    await submission.save();
    return res.json({
      ok: true,
      tabSwitches: submission.tabSwitches,
      fullscreenExits: submission.fullscreenExits,
      cameraFlags: submission.cameraFlags,
      copyPasteCount: submission.copyPasteCount,
      violationScore: submission.violationScore,
      pauseCount: submission.pauseCount,
      lastPauseAt: submission.lastPauseAt,
      action,
      autoSubmit: action === 'autosubmit',
    });
  } catch (err) {
    console.error('Error logging violation:', err);
    return res.status(500).json({ error: 'Failed to log violation.' });
  }
}

export async function logStudentHeartbeat(req, res) {
  try {
    const { id } = req.params;
    const studentId = req.user._id;
    const { status = {}, violationScore, pauseCount, cameraFlags } = req.body || {};
    const submission = await AssessmentSubmission.findOne({ assessmentId: id, studentId });
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    if (submission.status === 'submitted') return res.json({ ok: true, action: 'warn' });

    const assessment = await Assessment.findById(id).select('settings').lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    const settings = assessment.settings || {};
    const now = new Date();
    const normalizedStatus = {
      fullscreen: Boolean(status.fullscreen),
      tabActive: Boolean(status.tabActive),
      cameraActive: Boolean(status.cameraActive),
      idle: Boolean(status.idle),
      duplicateTab: Boolean(status.duplicateTab),
      at: now,
    };

    submission.securityHeartbeat = normalizedStatus;
    if (typeof violationScore === 'number') submission.violationScore = Math.max(submission.violationScore || 0, violationScore);
    if (typeof pauseCount === 'number') submission.pauseCount = Math.max(submission.pauseCount || 0, pauseCount);
    if (typeof cameraFlags === 'number') submission.cameraFlags = cameraFlags;

    let action = 'warn';
    let inconsistent = false;
    if (settings.enableFullscreen && !normalizedStatus.fullscreen) inconsistent = true;
    if (settings.tabSwitchDetection && !normalizedStatus.tabActive) inconsistent = true;
    if (settings.cameraMonitoring && !normalizedStatus.cameraActive) inconsistent = true;
    if (settings.idleDetection && normalizedStatus.idle) inconsistent = true;
    if (settings.preventMultipleTabs && normalizedStatus.duplicateTab) inconsistent = true;

    if (inconsistent) {
      action = decideViolationAction({
        settings,
        type: 'heartbeat_failure',
        meta: { source: 'heartbeat_inconsistent', status: normalizedStatus },
        submission,
      });
      if (action === 'pause') {
        submission.lastPauseAt = now;
        resetSubmissionSecuritySetup(submission);
      }
    }

    await submission.save();
    return res.json({
      ok: true,
      action,
      inconsistent,
      violationScore: submission.violationScore || 0,
      pauseCount: submission.pauseCount || 0,
      lastPauseAt: submission.lastPauseAt,
    });
  } catch (err) {
    console.error('Error logging heartbeat:', err);
    return res.status(500).json({ error: 'Failed to log heartbeat.' });
  }
}

export async function markStudentAssessmentSetupStep(req, res) {
  try {
    const { id } = req.params;
    const studentId = req.user._id;
    const { step, meta } = req.body || {};
    const allowedSteps = new Set(['environment', 'camera', 'fullscreen', 'location', 'final']);
    if (!step || !allowedSteps.has(step)) {
      return res.status(400).json({ error: 'Valid setup step is required.' });
    }

    const assessment = await Assessment.findById(id).select('lifecycleStatus startTime endTime duration settings targetType assignedStudents').lean();
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (assessment.lifecycleStatus === 'draft') return res.status(403).json({ error: 'Assessment is not published yet.' });
    if (!assessment.startTime || !assessment.endTime || !assessment.duration) {
      return res.status(400).json({ error: 'Assessment schedule is incomplete.' });
    }
    const now = new Date();
    if (now < assessment.startTime || now > assessment.endTime) {
      return res.status(403).json({ error: 'Assessment is outside the active time window.' });
    }
    const isAssigned = assessment.targetType === 'all'
      || (assessment.assignedStudents || []).some((entry) => String(entry) === String(studentId));
    if (!isAssigned) return res.status(403).json({ error: 'Not assigned to this assessment.' });

    const submission = await AssessmentSubmission.findOne({ assessmentId: id, studentId });
    if (!submission) return res.status(404).json({ error: 'Submission not found. Unlock assessment first.' });
    const passwordCheck = await ensureAssessmentPasswordUnlocked(assessment, submission);
    if (!passwordCheck.ok) return res.status(passwordCheck.status).json({ error: passwordCheck.error });

    const requiredSecuritySteps = getRequiredSecuritySteps(assessment.settings || {});
    if (!canRecordSecurityStep(step, submission, requiredSecuritySteps)) {
      return res.status(409).json({
        error: 'Complete previous setup steps before continuing.',
        requiredSecuritySteps,
        completedSecuritySteps: getCompletedSecuritySteps(submission),
      });
    }

    const currentSetup = {
      ...(submission.securitySetup && typeof submission.securitySetup === 'object' ? submission.securitySetup : {}),
    };
    currentSetup[`${step}At`] = currentSetup[`${step}At`] || now;
    if (step === 'location' && meta && typeof meta === 'object') {
      currentSetup.location = {
        latitude: Number(meta.latitude),
        longitude: Number(meta.longitude),
        accuracy: Number(meta.accuracy),
        capturedAt: now,
      };
    }
    submission.set('securitySetup', currentSetup);
    submission.markModified('securitySetup');

    if (step === 'final' && hasCompletedRequiredSecuritySteps(submission, requiredSecuritySteps)) {
      submission.securityCompletedAt = submission.securityCompletedAt || now;
    }
    await submission.save();

    return res.json({
      ok: true,
      requiredSecuritySteps,
      completedSecuritySteps: getCompletedSecuritySteps(submission),
      canBeginAssessment: hasCompletedRequiredSecuritySteps(submission, requiredSecuritySteps),
      location: submission.securitySetup?.location || null,
    });
  } catch (err) {
    console.error('Error marking setup step:', err);
    return res.status(500).json({ error: 'Failed to mark setup step.' });
  }
}

export async function getSubmissionViolations(req, res) {
  try {
    const { submissionId } = req.params;
    const submission = await AssessmentSubmission.findById(submissionId)
      .populate('studentId', 'name email studentId')
      .select('violationLog tabSwitches fullscreenExits copyPasteCount cameraFlags violationScore pauseCount lastPauseAt status startedAt submittedAt studentId assessmentId securitySetup securityHeartbeat')
      .lean();
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    if (req.user && req.user.role === 'coordinator') {
      const assessment = await Assessment.findById(submission.assessmentId).select('createdBy').lean();
      if (!assessment || String(assessment.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }
    const timeline = (submission.violationLog || [])
      .map((e) => ({ ...e, source: 'log' }))
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    return res.json({
      submission: {
        studentName: (submission.studentId && submission.studentId.name) || 'Unknown',
        studentEmail: (submission.studentId && submission.studentId.email) || '',
        studentRollNo: (submission.studentId && submission.studentId.studentId) || '',
        status: submission.status,
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
      },
      counters: {
        tabSwitches: submission.tabSwitches || 0,
        fullscreenExits: submission.fullscreenExits || 0,
        copyPasteCount: submission.copyPasteCount || 0,
        cameraFlags: submission.cameraFlags || 0,
        violationScore: submission.violationScore || 0,
        pauseCount: submission.pauseCount || 0,
        lastPauseAt: submission.lastPauseAt,
        totalViolations: (submission.tabSwitches || 0) + (submission.fullscreenExits || 0) + (submission.cameraFlags || 0) + (submission.copyPasteCount || 0),
      },
      timeline,
      securitySetup: submission.securitySetup || {},
      securityHeartbeat: submission.securityHeartbeat || {},
    });
  } catch (err) {
    console.error('Error fetching violations:', err);
    return res.status(500).json({ error: 'Failed to fetch violations.' });
  }
}
