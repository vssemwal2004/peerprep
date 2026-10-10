import { Router } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import Assessment from '../models/Assessment.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import Semester from '../models/Subject.js';
import Problem from '../models/Problem.js';
import { loadHiddenExecutionTestCases } from '../controllers/problemController.js';
import { University, Publication, PlatformAudit, PlatformSettings } from './models.js';
import { isControlPlane, isUniversity } from './deployment.js';
import { controlRequest } from './client.js';
import { signInspection, verifyInspection } from './inspectionAuth.js';
import User from '../models/User.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';

const router = Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const keyHash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-z0-9][a-z0-9-]{1,62}$/;
const moduleNames = ['learning', 'assessments', 'questions', 'events', 'interviews', 'resumes'];
const sourceNames = ['learning', 'questions'];
const clean = (doc) => {
  const value = doc.toObject ? doc.toObject() : { ...doc };
  delete value.apiKeyHash;
  return value;
};
const audit = (req, action, universityId, details = {}) => PlatformAudit.create({ actor: String(req.user?._id || universityId), action, universityId, details });
const loadDefaults = async () => await PlatformSettings.findById('defaults') || new PlatformSettings({ _id: 'defaults' });

async function clearUniversityAssignments(universityId) {
  await Publication.updateMany(
    { $or: [{ universityIds: universityId }, { everUniversityIds: universityId }] },
    { $pull: { universityIds: universityId, everUniversityIds: universityId } },
  );
}

function inspectionOrigin(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, 'Invalid university API URL'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new HttpError(400, 'University API URL must be an HTTPS origin (localhost HTTP is allowed)');
  }
  return url.origin;
}

async function inspectUniversity(req, university, path) {
  if (!university.active || !university.apiUrl) throw new HttpError(503, 'University API is not configured or is disabled');
  const origin = inspectionOrigin(university.apiUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${origin}/api/platform/inspection${path}`, {
      headers: { 'X-PeerPrep-Inspection': signInspection(path, university.universityId) },
      redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 502, response.status === 404 ? 'Student not found' : 'University inspection is unavailable');
    return await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'University inspection is unavailable');
  } finally { clearTimeout(timeout); }
}

function inspectionOnly(req, res, next) {
  try {
    if (!isUniversity()) throw new HttpError(404, 'Not found');
    verifyInspection(req.get('X-PeerPrep-Inspection'), req.originalUrl.replace(/^\/api\/platform\/inspection/, ''), process.env.PEERPREP_UNIVERSITY_ID);
    res.set('Cache-Control', 'no-store');
    next();
  } catch (error) { next(error); }
}

function masterOnly(req, res, next) {
  if (!isControlPlane()) return next(new HttpError(404, 'Not found'));
  return requireAuth(req, res, (error) => error ? next(error) : requireAdmin(req, res, next));
}

async function tenantOnly(req, res, next) {
  try {
    if (!isControlPlane()) throw new HttpError(404, 'Not found');
    const id = String(req.get('X-PeerPrep-University') || '');
    const supplied = String(req.get('X-PeerPrep-Key') || '');
    if (!idPattern.test(id) || supplied.length < 32 || supplied.length > 512) throw new HttpError(401, 'Invalid university credentials');
    const tenant = await University.findOne({ universityId: id, active: true, deletedAt: null }).select('+apiKeyHash');
    if (!tenant) throw new HttpError(401, 'Invalid university credentials');
    const actual = Buffer.from(keyHash(supplied), 'hex');
    const expected = Buffer.from(tenant.apiKeyHash, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) throw new HttpError(401, 'Invalid university credentials');
    req.platformUniversity = tenant;
    next();
  } catch (error) { next(error); }
}

function requireModule(moduleName) {
  return (req, res, next) => req.platformUniversity.permissions?.[moduleName] === true
    ? next() : next(new HttpError(403, `${moduleName} is disabled`));
}

router.get('/admin/overview', masterOnly, asyncRoute(async (req, res) => {
  const [universities, auditRows, assessmentCount, questionCount, defaults] = await Promise.all([
    University.find({ deletedAt: null }).sort({ createdAt: -1 }).lean(),
    PlatformAudit.find().sort({ createdAt: -1 }).limit(30).lean(),
    Assessment.countDocuments(), QuestionLibrary.countDocuments({ status: 'published', visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' } }),
    loadDefaults(),
  ]);
  res.json({ universities: universities.map(clean), audit: auditRows, assessmentCount, questionCount, defaults: defaults.toObject() });
}));

router.put('/admin/defaults', masterOnly, asyncRoute(async (req, res) => {
  const defaults = await loadDefaults();
  for (const key of moduleNames) {
    if (req.body?.permissions?.[key] !== undefined) {
      if (typeof req.body.permissions[key] !== 'boolean') throw new HttpError(400, `Invalid permission: ${key}`);
      defaults.permissions[key] = req.body.permissions[key];
    }
  }
  for (const key of sourceNames) {
    if (req.body?.sources?.[key] !== undefined) {
      if (!['university', 'shared'].includes(req.body.sources[key])) throw new HttpError(400, `Invalid source: ${key}`);
      defaults.sources[key] = req.body.sources[key];
    }
  }
  await defaults.save();
  await audit(req, 'university.defaults_updated', '', { permissions: defaults.permissions, sources: defaults.sources });
  res.json({ defaults });
}));

router.post('/admin/universities', masterOnly, asyncRoute(async (req, res) => {
  const universityId = String(req.body?.universityId || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  if (!idPattern.test(universityId) || name.length < 2 || name.length > 160) throw new HttpError(400, 'Valid university ID and name are required');
  const previous = await University.findOne({ universityId });
  if (previous) {
    if (!previous.deletedAt) throw new HttpError(409, 'University ID already exists');
    // Older deployments archived registrations instead of removing them.
    await clearUniversityAssignments(universityId);
    await University.deleteOne({ _id: previous._id, deletedAt: { $ne: null } });
  }
  const defaults = await loadDefaults();
  const apiKey = crypto.randomBytes(32).toString('base64url');
  const defaultValues = defaults.toObject();
  const university = await University.create({ universityId, name, contactEmail: req.body?.contactEmail, deploymentUrl: req.body?.deploymentUrl, apiUrl: inspectionOrigin(req.body?.apiUrl), apiKeyHash: keyHash(apiKey), permissions: defaultValues.permissions, sources: defaultValues.sources });
  await audit(req, 'university.created', universityId);
  res.status(201).json({ university: clean(university), apiKey });
}));

router.patch('/admin/universities/:id', masterOnly, asyncRoute(async (req, res) => {
  const university = await University.findOne({ universityId: req.params.id, deletedAt: null });
  if (!university) throw new HttpError(404, 'University not found');
  for (const key of ['name', 'contactEmail', 'deploymentUrl', 'apiUrl']) {
    if (req.body?.[key] !== undefined) university[key] = key === 'apiUrl' ? inspectionOrigin(req.body[key]) : String(req.body[key]).trim();
  }
  if (req.body?.active !== undefined) {
    if (typeof req.body.active !== 'boolean') throw new HttpError(400, 'active must be boolean');
    university.active = req.body.active;
  }
  for (const key of moduleNames) {
    if (req.body?.permissions?.[key] !== undefined) {
      if (typeof req.body.permissions[key] !== 'boolean') throw new HttpError(400, `Invalid permission: ${key}`);
      university.permissions[key] = req.body.permissions[key];
    }
  }
  for (const key of sourceNames) {
    if (req.body?.sources?.[key] !== undefined) {
      if (!['university', 'shared'].includes(req.body.sources[key])) throw new HttpError(400, `Invalid source: ${key}`);
      university.sources[key] = req.body.sources[key];
    }
  }
  await university.save();
  await audit(req, 'university.updated', university.universityId, { permissions: university.permissions, sources: university.sources, active: university.active });
  res.json({ university: clean(university) });
}));

router.post('/admin/universities/:id/rotate-key', masterOnly, asyncRoute(async (req, res) => {
  const apiKey = crypto.randomBytes(32).toString('base64url');
  const university = await University.findOneAndUpdate({ universityId: req.params.id, deletedAt: null }, { $set: { apiKeyHash: keyHash(apiKey) } });
  if (!university) throw new HttpError(404, 'University not found');
  await audit(req, 'university.key_rotated', req.params.id);
  res.json({ apiKey });
}));

router.get('/admin/universities/:id/students', masterOnly, asyncRoute(async (req, res) => {
  const university = await University.findOne({ universityId: req.params.id, deletedAt: null }).lean();
  if (!university) throw new HttpError(404, 'University not found');
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const search = String(req.query.search || '').trim().slice(0, 80);
  const path = `/students?page=${page}&search=${encodeURIComponent(search)}`;
  const data = await inspectUniversity(req, university, path);
  await audit(req, 'university.students_viewed', university.universityId, { page, searched: Boolean(search) });
  res.set('Cache-Control', 'no-store').json(data);
}));

router.get('/admin/universities/:id/students/:studentId', masterOnly, asyncRoute(async (req, res) => {
  const university = await University.findOne({ universityId: req.params.id, deletedAt: null }).lean();
  if (!university) throw new HttpError(404, 'University not found');
  if (!mongoose.isValidObjectId(req.params.studentId)) throw new HttpError(400, 'Invalid student ID');
  const data = await inspectUniversity(req, university, `/students/${req.params.studentId}`);
  const sharedIds = data.assessments?.filter((item) => item.title === 'Shared or removed assessment').map((item) => item.assessmentId) || [];
  if (sharedIds.length) {
    const shared = await Assessment.find({ _id: { $in: sharedIds } }).select('title').lean();
    const titles = new Map(shared.map((item) => [String(item._id), item.title]));
    data.assessments = data.assessments.map((item) => ({ ...item, title: titles.get(String(item.assessmentId)) || item.title }));
  }
  await audit(req, 'university.student_viewed', university.universityId, { studentId: req.params.studentId });
  res.set('Cache-Control', 'no-store').json(data);
}));

router.delete('/admin/universities/:id', masterOnly, asyncRoute(async (req, res) => {
  const university = await University.findOneAndUpdate(
    { universityId: req.params.id },
    { $set: { active: false, deletedAt: new Date(), apiKeyHash: keyHash(crypto.randomBytes(32).toString('base64url')) } },
    { new: true },
  );
  if (!university) throw new HttpError(404, 'University not found');
  await clearUniversityAssignments(university.universityId);
  await University.deleteOne({ _id: university._id });
  await audit(req, 'university.deleted', university.universityId, { registrationId: String(university._id) });
  res.json({ universityId: university.universityId, deleted: true });
}));

router.get('/admin/publications', masterOnly, asyncRoute(async (req, res) => {
  const [publications, assessments] = await Promise.all([
    Publication.find({ kind: 'assessment' }).lean(),
    Assessment.find().select('_id title lifecycleStatus startTime endTime').sort({ createdAt: -1 }).lean(),
  ]);
  res.json({ publications, assessments });
}));

router.put('/admin/publications/:kind/:id', masterOnly, asyncRoute(async (req, res) => {
  const { kind, id } = req.params;
  if (kind !== 'assessment' || !mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid assessment');
  if (!(await Assessment.exists({ _id: id }))) throw new HttpError(404, 'Assessment not found');
  if (typeof req.body?.published !== 'boolean' || !Array.isArray(req.body?.universityIds)) throw new HttpError(400, 'published and universityIds are required');
  const ids = [...new Set(req.body.universityIds.map(String))];
  if (ids.some((value) => !idPattern.test(value))) throw new HttpError(400, 'Invalid university ID');
  if (await University.countDocuments({ universityId: { $in: ids }, deletedAt: null }) !== ids.length) throw new HttpError(400, 'Unknown university ID');
  const previous = await Publication.findOne({ kind, contentId: id }).lean();
  const everUniversityIds = [...new Set([...(previous?.everUniversityIds || previous?.universityIds || []), ...ids])];
  const publication = await Publication.findOneAndUpdate({ kind, contentId: id }, { $set: { published: req.body.published, universityIds: ids, everUniversityIds, publishedBy: req.user._id } }, { upsert: true, new: true });
  await audit(req, 'publication.updated', '', { kind, contentId: id, published: publication.published, universityIds: ids });
  res.json({ publication });
}));

router.use('/tenant', tenantOnly);
router.get('/tenant/policy', (req, res) => res.json({ universityId: req.platformUniversity.universityId, active: true, permissions: req.platformUniversity.permissions, sources: req.platformUniversity.sources, updatedAt: req.platformUniversity.updatedAt }));
router.post('/tenant/heartbeat', asyncRoute(async (req, res) => {
  const usage = {};
  for (const name of ['students', 'coordinators', 'submissions', 'interviewSessions']) {
    const value = req.body?.usage?.[name];
    if (Number.isSafeInteger(value) && value >= 0) usage[name] = value;
  }
  await University.updateOne({ _id: req.platformUniversity._id }, { $set: { lastHeartbeatAt: new Date(), usage } });
  res.json({ ok: true });
}));

router.get('/tenant/assessments', requireModule('assessments'), asyncRoute(async (req, res) => {
  const ids = await Publication.find({ kind: 'assessment', published: true, universityIds: req.platformUniversity.universityId }).distinct('contentId');
  const assessments = await Assessment.find({ _id: { $in: ids }, lifecycleStatus: { $ne: 'draft' }, isVisible: { $ne: false } }).lean();
  res.json({ assessments: assessments.map((item) => ({ ...item, targetType: 'all', assignedStudents: [], draftAssignedStudents: [] })) });
}));
router.get('/tenant/assessments/:id', requireModule('assessments'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid assessment ID');
  const publication = await Publication.findOne({ kind: 'assessment', contentId: req.params.id,
    $or: [{ universityIds: req.platformUniversity.universityId }, { everUniversityIds: req.platformUniversity.universityId }] }).lean();
  if (!publication) throw new HttpError(404, 'Assessment not available');
  const assessment = await Assessment.findById(req.params.id).lean();
  if (!assessment) throw new HttpError(404, 'Assessment not available');
  res.json({ assessment: { ...assessment, targetType: 'all', assignedStudents: [], draftAssignedStudents: [],
    platformPublished: publication.published && publication.universityIds.includes(req.platformUniversity.universityId)
      && assessment.lifecycleStatus !== 'draft' && assessment.isVisible !== false } });
}));
router.get('/tenant/assessments/:id/problems/:problemId', requireModule('assessments'), asyncRoute(async (req, res) => {
  const { id, problemId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(problemId)) throw new HttpError(400, 'Invalid identifier');
  const access = await Publication.exists({ kind: 'assessment', contentId: id,
    $or: [{ universityIds: req.platformUniversity.universityId }, { everUniversityIds: req.platformUniversity.universityId }] });
  if (!access) throw new HttpError(404, 'Problem not available');
  const assessment = await Assessment.findById(id).lean();
  const included = assessment?.sections?.some((section) => section.questions?.some((question) =>
    [question.problemId, question.coding?.problemId, question.problemDataSnapshot?._id, question.coding?.problemData?._id]
      .some((value) => String(value || '') === problemId)));
  if (!included) throw new HttpError(404, 'Problem not available');
  const problem = await Problem.findById(problemId).select('+executionHarnesses').lean();
  if (!problem) throw new HttpError(404, 'Problem not available');
  res.json({ problem });
}));
router.get('/tenant/questions', requireModule('questions'), asyncRoute(async (req, res) => {
  const questions = await QuestionLibrary.find({
    status: 'published',
    visibility: { $ne: 'private' },
    sourceType: { $ne: 'assessment' },
  }).lean();
  res.json({ questions });
}));
router.get('/tenant/questions/:id/judge-data', requireModule('questions'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Question not found');
  const question = await QuestionLibrary.findOne({ _id: req.params.id, status: 'published',
    visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' }, questionType: 'coding' }).lean();
  if (!question) throw new HttpError(404, 'Question not found');
  const problemId = question.sourceProblemId || question.questionData?.problemId || question.questionData?.coding?.problemId;
  if (!mongoose.isValidObjectId(problemId)) throw new HttpError(404, 'Linked coding problem not found');
  const problem = await Problem.findById(problemId).select('+executionHarnesses').lean();
  if (!problem) throw new HttpError(404, 'Linked coding problem not found');
  res.set('Cache-Control', 'no-store').json({ problem, testCases: await loadHiddenExecutionTestCases(problem) });
}));
router.get('/tenant/learning/semesters', requireModule('learning'), asyncRoute(async (req, res) => {
  if (req.platformUniversity.sources.learning !== 'shared') throw new HttpError(403, 'Shared learning is disabled');
  res.json({ semesters: await Semester.find().sort({ order: 1 }).lean() });
}));

router.get('/inspection/students', inspectionOnly, asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const search = String(req.query.search || '').trim().slice(0, 80);
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { role: 'student', ...(search ? { $or: [
    { name: { $regex: escaped, $options: 'i' } },
    { studentId: { $regex: escaped, $options: 'i' } },
    { email: { $regex: escaped, $options: 'i' } },
  ] } : {}) };
  const [students, total] = await Promise.all([
    User.find(filter).select('name email studentId course branch college semester group isActive createdAt').sort({ _id: -1 }).skip((page - 1) * 25).limit(25).lean(),
    User.countDocuments(filter),
  ]);
  res.json({ students, total, page, pageSize: 25 });
}));

router.get('/inspection/students/:studentId', inspectionOnly, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.studentId)) throw new HttpError(400, 'Invalid student ID');
  const student = await User.findOne({ _id: req.params.studentId, role: 'student' })
    .select('name email studentId course branch college semester group isActive createdAt').lean();
  if (!student) throw new HttpError(404, 'Student not found');
  const submissions = await AssessmentSubmission.find({ studentId: student._id })
    .select('assessmentId score maxMarks status startedAt submittedAt evaluationStatus')
    .sort({ updatedAt: -1 }).limit(20).lean();
  const localIds = submissions.map((row) => row.assessmentId);
  const localAssessments = await Assessment.find({ _id: { $in: localIds } }).select('title').lean();
  const names = new Map(localAssessments.map((row) => [String(row._id), row.title]));
  // Interview sessions belong to the university interview runtime and may use different schema versions.
  const studentReferences = [student._id, String(student._id)];
  const interviewSessions = await mongoose.connection.collection('aiinterviewsessions')
    .find({ $or: ['studentId', 'student_id', 'userId', 'user_id', 'candidateId', 'candidate_id']
      .map((field) => ({ [field]: { $in: studentReferences } })) },
      { projection: { _id: 1, interviewId: 1, status: 1, state: 1, createdAt: 1, updatedAt: 1 } })
    .sort({ _id: -1 }).limit(20).toArray();
  res.json({ student, assessments: submissions.map((row) => ({ ...row, title: names.get(String(row.assessmentId)) || 'Shared or removed assessment' })),
    interviewSessions: interviewSessions.map(({ state, ...row }) => ({ ...row, status: typeof row.status === 'string' ? row.status : typeof state === 'string' ? state : 'Status unavailable' })) });
}));

// University-facing routes never expose the shared API key to the browser.
router.get('/university/policy', requireAuth, asyncRoute(async (req, res) => {
  if (!isUniversity()) throw new HttpError(404, 'Not found');
  res.json(await controlRequest('policy'));
}));
router.get('/public-questions', requireAuth, asyncRoute(async (req, res) => {
  const questions = isUniversity()
    ? (await controlRequest('questions')).questions
    : await QuestionLibrary.find({ status: 'published', visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' } }).lean();
  res.json({ questions: questions.map((question) => ({
    _id: question._id,
    questionText: question.questionText,
    questionType: question.questionType,
    difficulty: question.difficulty,
    tags: question.tags,
    options: Array.isArray(question.questionData?.options)
      ? question.questionData.options.map((option) => typeof option === 'string' ? option : String(option?.text || option?.label || '')).filter(Boolean)
      : [],
  })) });
}));

export default router;
