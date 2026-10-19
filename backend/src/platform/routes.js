import { Router } from 'express';
import { saveRankSnapshot, readGlobalRank } from './globalRanking.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import Assessment from '../models/Assessment.js';
import QuestionLibrary from '../models/QuestionLibrary.js';
import Semester from '../models/Subject.js';
import Problem from '../models/Problem.js';
import { loadHiddenExecutionTestCases } from '../controllers/problemController.js';
import { University, Publication, PlatformAudit, PlatformSettings, PlatformCoinWallet, PlatformCoinMovement } from './models.js';
import { isControlPlane, isUniversity } from './deployment.js';
import { controlRequest, universityPolicy } from './client.js';
import { signInspection, verifyInspection } from './inspectionAuth.js';
import User from '../models/User.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import { interviewReportOptions, interviewReportSummaries, saveInterviewReport } from './interviewQuestionReports.js';
import { CENTRAL_QUESTION_FILTER } from './centralQuestions.js';
import { publishedQuestDefinitions } from '../services/questService.js';
import { acceptLogoUpload, logoStorage, removeStoredLogo, validateLogoFile } from './universityLogo.js';
import { deploymentRole } from './deployment.js';
import { encryptTenantSecret } from './tenantSecrets.js';
import { getTenant, testTenantConnection, validateTenantMongoUri, invalidateTenantRegistration, ensureTenantIndexes } from './tenantConnections.js';
import { currentTenant, runForTenant } from './tenantContext.js';
import { verifiedSharedInternalRequest } from './internalAuth.js';
import { backfillTenantLoginDirectory } from './loginDirectory.js';
import { seedEmailTemplates } from '../services/emailTemplateService.js';
import { seedDefaultMasterData } from '../services/masterDataService.js';
import { serviceDates } from './servicePeriod.js';
import { coinAmount, coinRequestId, creditPlatformUser, PLATFORM_WALLET_SCOPE, topUpUniversity } from './coins.js';
import { accountLimit, withAccountCreationLocks } from './accountLimits.js';
import { buildOverview, universitySnapshot } from '../services/overviewInsights.js';
import { platformCentralSummary } from './platformInsights.js';

const router = Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const keyHash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-z0-9][a-z0-9-]{1,62}$/;
const moduleNames = ['learning', 'assessments', 'questions', 'events', 'interviews', 'resumes'];
const sourceNames = ['learning', 'questions'];
const clean = (doc) => {
  const value = doc.toObject ? doc.toObject() : { ...doc };
  value.dbConfigured = Boolean(value.dbUriEncrypted || doc.dbUriEncrypted);
  value.judgeConfigured = Boolean(value.judge0UrlEncrypted || doc.judge0UrlEncrypted);
  value.judgeAuthConfigured = Boolean((value.judge0AuthHeaderEncrypted || doc.judge0AuthHeaderEncrypted)
    && (value.judge0AuthTokenEncrypted || doc.judge0AuthTokenEncrypted));
  value.interviewConfigured = Boolean((value.interviewUrlEncrypted || doc.interviewUrlEncrypted)
    && (value.interviewSecretEncrypted || doc.interviewSecretEncrypted));
  delete value.apiKeyHash;
  delete value.dbUriEncrypted;
  delete value.judge0UrlEncrypted;
  delete value.judge0AuthHeaderEncrypted;
  delete value.judge0AuthTokenEncrypted;
  delete value.interviewUrlEncrypted;
  delete value.interviewSecretEncrypted;
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function contactEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email && (email.length > 254 || !emailPattern.test(email))) throw new HttpError(400, 'Enter a valid contact email');
  return email;
}

function frontendUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new HttpError(400, 'Frontend URL must be a full http(s) URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || text.length > 2048) throw new HttpError(400, 'Frontend URL must be a full http(s) URL');
  return text;
}

function validInterviewServiceUrl(value) {
  const raw = String(value || '').trim();
  let parsed;
  try { parsed = new URL(raw); } catch { throw new HttpError(400, 'Invalid interview service URL'); }
  if (raw.length > 2048 || parsed.username || parsed.password || parsed.search || parsed.hash
    || !['/', ''].includes(parsed.pathname) || !['http:', 'https:'].includes(parsed.protocol)
    || (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) {
    throw new HttpError(400, 'Interview service URL must be an HTTPS origin');
  }
  return parsed.origin;
}

function universityName(value) {
  const name = String(value ?? '').trim();
  if (name.length < 2 || name.length > 160) throw new HttpError(400, 'Name must be 2 to 160 characters');
  return name;
}

const editableFields = { name: universityName, contactEmail, deploymentUrl: frontendUrl, apiUrl: inspectionOrigin };

async function inspectUniversity(req, university, path) {
  if (deploymentRole() === 'shared') {
    const tenant = await getTenant(university.universityId);
    return runForTenant(tenant, async () => {
      if (path.startsWith('/students?')) {
        const query = new URL(path, 'http://localhost').searchParams;
        const page = Math.max(1, Math.min(100000, Number.parseInt(query.get('page'), 10) || 1));
        const search = String(query.get('search') || '').trim().slice(0, 80);
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const filter = { role: 'student', ...(search ? { $or: ['name', 'studentId', 'email'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } })) } : {}) };
        const [students, total] = await Promise.all([
          User.find(filter).select('name email studentId course branch college semester group isActive createdAt').sort({ _id: -1 }).skip((page - 1) * 25).limit(25).lean(),
          User.countDocuments(filter),
        ]);
        return { students, total, page, pageSize: 25 };
      }
      const studentId = path.split('/')[2];
      if (!mongoose.isValidObjectId(studentId)) throw new HttpError(400, 'Invalid student ID');
      const student = await User.findOne({ _id: studentId, role: 'student' })
        .select('name email studentId course branch college semester group isActive createdAt').lean();
      if (!student) throw new HttpError(404, 'Student not found');
      const submissions = await AssessmentSubmission.find({ studentId: student._id })
        .select('assessmentId score maxMarks status startedAt submittedAt evaluationStatus').sort({ updatedAt: -1 }).limit(20).lean();
      const localAssessments = await Assessment.find({ _id: { $in: submissions.map((row) => row.assessmentId) } }).select('title').lean();
      const names = new Map(localAssessments.map((row) => [String(row._id), row.title]));
      const references = [student._id, String(student._id)];
      const interviewSessions = await tenant.connection.collection('aiinterviewsessions')
        .find({ $or: ['studentId', 'student_id', 'userId', 'user_id', 'candidateId', 'candidate_id']
          .map((field) => ({ [field]: { $in: references } })) },
        { projection: { _id: 1, interviewId: 1, status: 1, state: 1, createdAt: 1, updatedAt: 1 } })
        .sort({ _id: -1 }).limit(20).toArray();
      return { student, assessments: submissions.map((row) => ({ ...row, title: names.get(String(row.assessmentId)) || 'Shared or removed assessment' })),
        interviewSessions: interviewSessions.map(({ state, ...row }) => ({ ...row, status: typeof row.status === 'string' ? row.status : typeof state === 'string' ? state : 'Status unavailable' })) };
    });
  }
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
  if (!isControlPlane() || currentTenant()) return next(new HttpError(404, 'Not found'));
  return requireAuth(req, res, (error) => error ? next(error) : requireAdmin(req, res, next));
}

async function tenantOnly(req, res, next) {
  try {
    if (!isControlPlane()) throw new HttpError(404, 'Not found');
    const id = String(req.get('X-PeerPrep-University') || '');
    const supplied = String(req.get('X-PeerPrep-Key') || '');
    if (!idPattern.test(id)) throw new HttpError(401, 'Invalid university credentials');
    const sharedInternal = verifiedSharedInternalRequest(req);
    if (deploymentRole() === 'shared' && !sharedInternal) throw new HttpError(401, 'Invalid university credentials');
    if (req.get('X-PeerPrep-Internal-Signature') && !sharedInternal) throw new HttpError(401, 'Invalid university credentials');
    if (!sharedInternal && (supplied.length < 32 || supplied.length > 512)) throw new HttpError(401, 'Invalid university credentials');
    const tenant = await University.findOne({ universityId: id, active: true, deletedAt: null }).select('+apiKeyHash');
    if (!tenant) throw new HttpError(401, 'Invalid university credentials');
    if (!sharedInternal) {
      const actual = Buffer.from(keyHash(supplied), 'hex');
      const expected = Buffer.from(tenant.apiKeyHash, 'hex');
      if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) throw new HttpError(401, 'Invalid university credentials');
    }
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
    University.find({ deletedAt: null }).select('+dbUriEncrypted +judge0UrlEncrypted +judge0AuthHeaderEncrypted +judge0AuthTokenEncrypted +interviewUrlEncrypted +interviewSecretEncrypted').sort({ createdAt: -1 }).lean(),
    PlatformAudit.find().sort({ createdAt: -1 }).limit(30).lean(),
    Assessment.countDocuments(), QuestionLibrary.countDocuments({ status: 'published', visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' } }),
    loadDefaults(),
  ]);
  res.json({ universities: universities.map(clean), audit: auditRows, assessmentCount, questionCount, defaults: defaults.toObject() });
}));

// Cross-university numbers for the Master Admin overview. Each university is read in its own tenant
// context; one unreachable database marks only that row as unavailable. Cached briefly because it fans out.
let insightsCache = null;
const INSIGHTS_TTL_MS = 60_000;
router.get('/admin/insights', masterOnly, asyncRoute(async (req, res) => {
  if (!insightsCache || insightsCache.expires < Date.now() || req.query.refresh === '1') {
    const universities = await University.find({ deletedAt: null }).select('+dbUriEncrypted universityId name active logo permissions coinBalance serviceStartDate serviceEndDate studentLimit coordinatorLimit').sort({ name: 1 }).lean();
    const rows = [];
    for (let index = 0; index < universities.length; index += 4) {
      rows.push(...await Promise.all(universities.slice(index, index + 4).map(async (university) => {
        const base = { universityId: university.universityId, name: university.name, active: university.active !== false, logo: university.logo?.url || '', modules: university.permissions || {}, coinBalance: university.coinBalance || 0, studentLimit: university.studentLimit ?? null, coordinatorLimit: university.coordinatorLimit ?? null };
        // Without a stored database there is nothing to read; say so instead of reporting a failure.
        if (!university.dbUriEncrypted) return { ...base, reachable: false, reason: 'no_database' };
        try {
          const tenant = await getTenant(university.universityId, { includeInactive: true });
          const snapshot = await runForTenant(tenant, () => universitySnapshot());
          return { ...base, reachable: true, ...snapshot };
        } catch (error) {
          console.warn('[PlatformInsights] university unavailable', { universityId: university.universityId, error: error?.message });
          return { ...base, reachable: false, reason: 'unreachable' };
        }
      })));
    }
    insightsCache = {
      expires: Date.now() + INSIGHTS_TTL_MS,
      // workspace: the main database's own students and activity, counted like a university overview.
      body: { generatedAt: new Date().toISOString(), universities: rows, central: await platformCentralSummary(), workspace: await buildOverview(req.user) },
    };
  }
  res.set('Cache-Control', 'private, no-store').json(insightsCache.body);
}));

// Platform activity log, newest first: optional university and action-prefix filters, cursor paging.
router.get('/admin/audit', masterOnly, asyncRoute(async (req, res) => {
  const filter = {};
  const universityId = String(req.query.universityId || '').trim();
  if (universityId) {
    if (!idPattern.test(universityId)) throw new HttpError(400, 'Invalid university ID');
    filter.universityId = universityId;
  }
  const action = String(req.query.action || '').trim();
  if (action) {
    if (!/^[a-z_]+(\.[a-z_]*)?$/.test(action)) throw new HttpError(400, 'Invalid action filter');
    filter.action = { $regex: `^${action.replace('.', '\\.')}` };
  }
  if (req.query.before) {
    const before = new Date(String(req.query.before));
    if (Number.isNaN(before.getTime())) throw new HttpError(400, 'Invalid cursor');
    filter.createdAt = { $lt: before };
  }
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const rows = await PlatformAudit.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const actorIds = [...new Set(page.map((row) => row.actor).filter((value) => mongoose.isValidObjectId(value)))];
  const actors = actorIds.length ? await User.find({ _id: { $in: actorIds } }).select('name email').lean() : [];
  const names = new Map(actors.map((person) => [String(person._id), person.name || person.email]));
  res.set('Cache-Control', 'private, no-store').json({
    entries: page.map((row) => ({ id: row._id, action: row.action, universityId: row.universityId || '', createdAt: row.createdAt, actorName: names.get(String(row.actor)) || 'System', details: row.details || {} })),
    nextCursor: rows.length > limit ? page.at(-1).createdAt : null,
  });
}));

router.get('/admin/wallets', masterOnly, asyncRoute(async (req, res) => {
  const [universities, movements] = await Promise.all([
    University.find({ deletedAt: null })
      .select('universityId name coinBalance active serviceStartDate serviceEndDate')
      .sort({ name: 1 }).lean(),
    PlatformCoinMovement.find({ universityId: PLATFORM_WALLET_SCOPE })
      .sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const ids = [...new Set(movements.flatMap((row) => [row.fromUserId, row.toUserId]).filter(Boolean).map(String))];
  const people = ids.length ? await User.find({ _id: { $in: ids } }).select('name').lean() : [];
  const names = new Map(people.map((person) => [String(person._id), person.name]));
  res.set('Cache-Control', 'no-store');
  res.json({ universities, movements: movements.map((row) => ({
    id: row._id, kind: row.kind, amount: row.amount, createdAt: row.createdAt,
    fromName: row.fromUserId ? names.get(String(row.fromUserId)) || 'Former user' : 'PeerPrep',
    toName: row.toUserId ? names.get(String(row.toUserId)) || 'Former user' : '',
  })) });
}));

router.get('/admin/wallet-recipients', masterOnly, asyncRoute(async (req, res) => {
  const role = String(req.query.role || '');
  if (!['coordinator', 'student'].includes(role)) throw new HttpError(400, 'Choose coordinators or students');
  const search = String(req.query.search || '').trim().slice(0, 80);
  if (search.length < 2) throw new HttpError(400, 'Enter at least two characters to search');
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const users = await User.find({ role, isActive: { $ne: false },
    $or: ['name', 'email', role === 'student' ? 'studentId' : 'coordinatorId']
      .map((field) => ({ [field]: { $regex: escaped, $options: 'i' } })) })
    .select('name email studentId coordinatorId role').sort({ name: 1 }).limit(25).lean();
  const wallets = users.length ? await PlatformCoinWallet.find({ universityId: PLATFORM_WALLET_SCOPE,
    userId: { $in: users.map((user) => user._id) } }).select('userId balance').lean() : [];
  const balances = new Map(wallets.map((wallet) => [String(wallet.userId), wallet.balance]));
  res.set('Cache-Control', 'private, no-store');
  res.json({ recipients: users.map((user) => ({
    id: user._id, name: user.name, email: user.email,
    accountId: user.studentId || user.coordinatorId || '', balance: balances.get(String(user._id)) || 0,
  })) });
}));

router.post('/admin/wallet-recipients/credit', masterOnly, asyncRoute(async (req, res) => {
  const toRole = req.body?.targetRole;
  const toUserId = String(req.body?.targetUserId || '');
  const amount = coinAmount(req.body?.amount);
  const requestId = coinRequestId(req.body?.requestId);
  const result = await creditPlatformUser({ actorId: req.user._id, toUserId, toRole, amount, requestId });
  if (!result.alreadyProcessed) await audit(req, `platform.coins_to_${toRole}`, null, { targetUserId: toUserId, amount, requestId });
  const wallet = await PlatformCoinWallet.findOne({ universityId: PLATFORM_WALLET_SCOPE, userId: toUserId }).select('balance').lean();
  res.set('Cache-Control', 'private, no-store');
  res.json({ ...result, balance: wallet?.balance || 0 });
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

router.post('/admin/universities/test-database', masterOnly, asyncRoute(async (req, res) => {
  const universityId = String(req.body?.universityId || '').trim().toLowerCase();
  if (!idPattern.test(universityId)) throw new HttpError(400, 'Enter a valid university ID first');
  await testTenantConnection(req.body?.dbUri, universityId, { allowUnclaimed: true });
  res.set('Cache-Control', 'no-store');
  res.json({ connected: true, message: 'MongoDB connection and university database identity verified' });
}));

router.post('/admin/universities', masterOnly, asyncRoute(async (req, res) => {
  const universityId = String(req.body?.universityId || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  if (!idPattern.test(universityId) || name.length < 2 || name.length > 160) throw new HttpError(400, 'Valid university ID and name are required');
  const period = serviceDates(req.body?.serviceStartDate, req.body?.serviceEndDate);
  const initialCoins = req.body?.initialCoins === '' || req.body?.initialCoins == null ? 0 : coinAmount(req.body.initialCoins);
  const coordinatorLimit = accountLimit(req.body?.coordinatorLimit, 'coordinator limit');
  const studentLimit = accountLimit(req.body?.studentLimit, 'student limit');
  // Validate every field before touching an archived registration with the same ID.
  const details = deploymentRole() === 'shared'
    ? { contactEmail: contactEmail(req.body?.contactEmail) }
    : { contactEmail: contactEmail(req.body?.contactEmail), deploymentUrl: frontendUrl(req.body?.deploymentUrl), apiUrl: inspectionOrigin(req.body?.apiUrl) };
  const previous = await University.findOne({ universityId });
  if (previous && !previous.deletedAt) throw new HttpError(409, 'University ID already exists');
  let sharedSetup = null;
  if (deploymentRole() === 'shared') {
    const dbUri = validateTenantMongoUri(req.body?.dbUri);
    const judge0Url = String(req.body?.judge0Url || '').trim();
    if (!/^https?:\/\//.test(judge0Url) || judge0Url.length > 2048) throw new HttpError(400, 'Valid Judge0 URL is required');
    const judge0AuthHeader = String(req.body?.judge0AuthHeader || '').trim();
    const judge0AuthToken = String(req.body?.judge0AuthToken || '').trim();
    if (Boolean(judge0AuthHeader) !== Boolean(judge0AuthToken)
      || (judge0AuthHeader && (!/^[A-Za-z0-9-]{1,64}$/.test(judge0AuthHeader) || judge0AuthToken.length > 512))) {
      throw new HttpError(400, 'Judge0 auth header and token must be provided together');
    }
    const adminEmail = contactEmail(req.body?.adminEmail);
    const adminPassword = String(req.body?.adminPassword || '');
    if (!adminEmail || adminPassword.length < 12) throw new HttpError(400, 'Admin email and a password of at least 12 characters are required');
    const interviewServiceUrl = String(req.body?.interviewServiceUrl || '').trim();
    const interviewServiceSecret = String(req.body?.interviewServiceSecret || '').trim();
    if (Boolean(interviewServiceUrl) !== Boolean(interviewServiceSecret)) throw new HttpError(400, 'Interview URL and secret must be provided together');
    if (interviewServiceUrl) validInterviewServiceUrl(interviewServiceUrl);
    if (interviewServiceUrl && interviewServiceSecret.length < 32) throw new HttpError(400, 'Invalid interview service secret');
    await testTenantConnection(dbUri, universityId, { claim: true });
    sharedSetup = { dbUri, judge0Url, judge0AuthHeader, judge0AuthToken, adminEmail, adminPassword, interviewServiceUrl, interviewServiceSecret };
  }
  if (previous) {
    // Older deployments archived registrations instead of removing them.
    await clearUniversityAssignments(universityId);
    await University.deleteOne({ _id: previous._id, deletedAt: { $ne: null } });
  }
  const defaults = await loadDefaults();
  const apiKey = deploymentRole() === 'shared' ? null : crypto.randomBytes(32).toString('base64url');
  const defaultValues = defaults.toObject();
  const university = await University.create({ universityId, name, ...details, ...period, coordinatorLimit, studentLimit, coinBalance: 0,
    ...(apiKey ? { apiKeyHash: keyHash(apiKey) } : {}), permissions: defaultValues.permissions, sources: defaultValues.sources,
    ...(sharedSetup ? { dbUriEncrypted: encryptTenantSecret(sharedSetup.dbUri), judge0UrlEncrypted: encryptTenantSecret(sharedSetup.judge0Url),
      ...(sharedSetup.judge0AuthHeader ? { judge0AuthHeaderEncrypted: encryptTenantSecret(sharedSetup.judge0AuthHeader),
        judge0AuthTokenEncrypted: encryptTenantSecret(sharedSetup.judge0AuthToken) } : {}),
      ...(sharedSetup.interviewServiceUrl ? { interviewUrlEncrypted: encryptTenantSecret(sharedSetup.interviewServiceUrl),
        interviewSecretEncrypted: encryptTenantSecret(sharedSetup.interviewServiceSecret) } : {}) } : {}),
  });
  invalidateTenantRegistration(universityId);
  if (sharedSetup) {
    try {
      const tenant = await getTenant(universityId);
      await ensureTenantIndexes(tenant);
      await runForTenant(tenant, async () => {
        await seedEmailTemplates();
        await seedDefaultMasterData();
        const [existingCoordinators, existingStudents] = await Promise.all([
          User.countDocuments({ role: 'coordinator' }), User.countDocuments({ role: 'student' }),
        ]);
        if (existingCoordinators > coordinatorLimit || existingStudents > studentLimit) {
          throw new HttpError(409, `The university database already has ${existingCoordinators} coordinators and ${existingStudents} students. Increase the account limits before registration.`);
        }
        const existingAccount = await User.findOne({ email: sharedSetup.adminEmail });
        if (existingAccount && existingAccount.role !== 'admin') {
          throw new HttpError(409, 'The initial admin email belongs to a different university role');
        }
        if (!existingAccount) {
          const passwordHash = await User.hashPassword(sharedSetup.adminPassword);
          await User.create({ role: 'admin', email: sharedSetup.adminEmail, name: `${name} Admin`, passwordHash, mustChangePassword: true });
        }
      });
      await backfillTenantLoginDirectory(tenant);
    } catch (error) {
      await University.deleteOne({ _id: university._id });
      throw error;
    }
  }
  if (initialCoins) {
    try {
      await topUpUniversity({ universityId, amount: initialCoins, actorId: req.user._id, requestId: crypto.randomUUID(), kind: 'initial' });
      university.coinBalance = initialCoins;
    } catch (error) {
      await University.deleteOne({ _id: university._id });
      throw error;
    }
  }
  await audit(req, 'university.created', universityId);
  if (initialCoins) await audit(req, 'university.coins_initial', universityId, { amount: initialCoins });
  res.status(201).json({ university: clean(university), ...(sharedSetup ? {} : { apiKey }) });
}));

router.patch('/admin/universities/:id', masterOnly, asyncRoute(async (req, res) => {
  const university = await University.findOne({ universityId: req.params.id, deletedAt: null })
    .select('+dbUriEncrypted +judge0UrlEncrypted +judge0AuthHeaderEncrypted +judge0AuthTokenEncrypted +interviewUrlEncrypted +interviewSecretEncrypted');
  if (!university) throw new HttpError(404, 'University not found');
  const limitUpdates = {};
  if (req.body?.coordinatorLimit !== undefined) limitUpdates.coordinatorLimit = accountLimit(req.body.coordinatorLimit, 'coordinator limit');
  if (req.body?.studentLimit !== undefined) limitUpdates.studentLimit = accountLimit(req.body.studentLimit, 'student limit');
  if (Object.keys(limitUpdates).length && req.body?.dbUri) throw new HttpError(400, 'Save the database connection and account limits separately');
  if (req.body?.serviceStartDate !== undefined || req.body?.serviceEndDate !== undefined) {
    const period = serviceDates(req.body?.serviceStartDate ?? university.serviceStartDate, req.body?.serviceEndDate ?? university.serviceEndDate);
    university.set(period);
  }
  if (deploymentRole() === 'shared' && req.body?.dbUri) {
    const uri = validateTenantMongoUri(req.body.dbUri);
    await testTenantConnection(uri, university.universityId, { claim: true });
    university.dbUriEncrypted = encryptTenantSecret(uri);
  }
  if (deploymentRole() === 'shared' && req.body?.judge0Url !== undefined) {
    const url = String(req.body.judge0Url).trim();
    if (!/^https?:\/\//.test(url) || url.length > 2048) throw new HttpError(400, 'Valid Judge0 URL is required');
    university.judge0UrlEncrypted = encryptTenantSecret(url);
  }
  if (deploymentRole() === 'shared' && (req.body?.judge0AuthHeader !== undefined || req.body?.judge0AuthToken !== undefined)) {
    const header = String(req.body.judge0AuthHeader || '').trim();
    const token = String(req.body.judge0AuthToken || '').trim();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(header) || !token || token.length > 512) throw new HttpError(400, 'Judge0 auth header and token must be provided together');
    university.judge0AuthHeaderEncrypted = encryptTenantSecret(header);
    university.judge0AuthTokenEncrypted = encryptTenantSecret(token);
  }
  if (deploymentRole() === 'shared' && (req.body?.interviewServiceUrl !== undefined || req.body?.interviewServiceSecret !== undefined)) {
    const url = String(req.body.interviewServiceUrl || '').trim();
    const secret = String(req.body.interviewServiceSecret || '').trim();
    if (secret.length < 32) throw new HttpError(400, 'Interview URL and secret must be provided together');
    university.interviewUrlEncrypted = encryptTenantSecret(validInterviewServiceUrl(url));
    university.interviewSecretEncrypted = encryptTenantSecret(secret);
  }
  for (const [key, normalize] of Object.entries(editableFields)) {
    if (deploymentRole() === 'shared' && ['deploymentUrl', 'apiUrl'].includes(key)) continue;
    if (req.body?.[key] !== undefined) university[key] = normalize(req.body[key]);
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
  const changedRoles = Object.keys(limitUpdates).map((key) => key === 'studentLimit' ? 'student' : 'coordinator');
  const save = async () => {
    if (changedRoles.length) {
      const tenant = await getTenant(university.universityId, { includeInactive: true });
      const counts = await runForTenant(tenant, async () => Object.fromEntries(await Promise.all(changedRoles.map(async (role) => [
        role, await User.countDocuments({ role }),
      ]))));
      for (const role of changedRoles) {
        const limit = limitUpdates[role === 'student' ? 'studentLimit' : 'coordinatorLimit'];
        if (limit < counts[role]) throw new HttpError(409, `Cannot set ${role} limit below the ${counts[role]} existing accounts`);
      }
      university.set(limitUpdates);
    }
    await university.save();
  };
  if (changedRoles.length) await withAccountCreationLocks(university.universityId, changedRoles, save);
  else await save();
  invalidateTenantRegistration(university.universityId);
  await audit(req, 'university.updated', university.universityId, { permissions: university.permissions, sources: university.sources, active: university.active,
    fields: [...Object.keys(editableFields).filter((key) => req.body?.[key] !== undefined), ...Object.keys(limitUpdates)] });
  res.json({ university: clean(university) });
}));

router.post('/admin/universities/:id/coins/top-up', masterOnly, asyncRoute(async (req, res) => {
  const universityId = req.params.id;
  const amount = coinAmount(req.body?.amount);
  const requestId = coinRequestId(req.body?.requestId);
  const result = await topUpUniversity({ universityId, amount, actorId: req.user._id, requestId });
  if (!result.alreadyProcessed) await audit(req, 'university.coins_topup', universityId, { amount, requestId });
  const university = await University.findOne({ universityId, deletedAt: null }).select('coinBalance').lean();
  res.json({ ...result, balance: university?.coinBalance || 0 });
}));

router.get('/admin/universities/:id/account-counts', masterOnly, asyncRoute(async (req, res) => {
  const tenant = await getTenant(req.params.id, { includeInactive: true });
  const counts = await runForTenant(tenant, async () => {
    const [coordinators, students] = await Promise.all([
      User.countDocuments({ role: 'coordinator' }), User.countDocuments({ role: 'student' }),
    ]);
    return { coordinators, students };
  });
  res.set('Cache-Control', 'private, no-store').json(counts);
}));

router.post('/admin/universities/:id/rotate-key', masterOnly, asyncRoute(async (req, res) => {
  if (deploymentRole() === 'shared') throw new HttpError(404, 'Not found');
  const apiKey = crypto.randomBytes(32).toString('base64url');
  const university = await University.findOneAndUpdate({ universityId: req.params.id, deletedAt: null }, { $set: { apiKeyHash: keyHash(apiKey) } });
  if (!university) throw new HttpError(404, 'University not found');
  await audit(req, 'university.key_rotated', req.params.id);
  res.json({ apiKey });
}));

// Logo upload: validated by magic bytes and dimensions, stored on Cloudinary, old image removed best-effort.
router.post('/admin/universities/:id/logo', masterOnly, acceptLogoUpload, asyncRoute(async (req, res) => {
  const existing = await University.findOne({ universityId: req.params.id, deletedAt: null }).select('universityId logo').lean();
  if (!existing) throw new HttpError(404, 'University not found');
  validateLogoFile(req.file);
  if (!logoStorage.isConfigured()) throw new HttpError(503, 'Logo storage is not configured on this server.');
  let stored;
  try {
    stored = await logoStorage.upload(req.file.buffer, { universityId: existing.universityId, publicId: `logo-${Date.now()}` });
  } catch (error) {
    console.error('[UniversityLogo] Upload failed', { universityId: existing.universityId, error: error?.message });
    throw new HttpError(502, 'The logo could not be uploaded. Try again.');
  }
  const logo = { url: stored.url, publicId: stored.publicId, width: stored.width, height: stored.height, bytes: stored.bytes ?? req.file.size, format: stored.format, uploadedAt: new Date() };
  // The pre-update document names exactly the logo this write replaced, even under concurrent uploads.
  const previous = await University.findOneAndUpdate({ universityId: existing.universityId, deletedAt: null }, { $set: { logo } }, { new: false });
  if (!previous) {
    await removeStoredLogo(stored.publicId, 'university removed during upload');
    throw new HttpError(404, 'University not found');
  }
  if (previous.logo?.publicId && previous.logo.publicId !== stored.publicId) await removeStoredLogo(previous.logo.publicId, 'replaced');
  await audit(req, 'university.logo_updated', previous.universityId, { publicId: logo.publicId, replaced: previous.logo?.publicId || null, width: logo.width, height: logo.height, bytes: logo.bytes });
  const university = await University.findById(previous._id);
  if (!university) throw new HttpError(404, 'University not found');
  res.json({ university: clean(university) });
}));

router.delete('/admin/universities/:id/logo', masterOnly, asyncRoute(async (req, res) => {
  const previous = await University.findOneAndUpdate({ universityId: req.params.id, deletedAt: null }, { $unset: { logo: 1 } }, { new: false });
  if (!previous) throw new HttpError(404, 'University not found');
  await removeStoredLogo(previous.logo?.publicId, 'removed');
  const university = await University.findById(previous._id);
  if (!university) throw new HttpError(404, 'University not found');
  if (previous.logo?.publicId) await audit(req, 'university.logo_removed', previous.universityId, { publicId: previous.logo.publicId });
  res.json({ university: clean(university) });
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
    { $set: { active: false, deletedAt: new Date() } },
    { new: true },
  );
  if (!university) throw new HttpError(404, 'University not found');
  await clearUniversityAssignments(university.universityId);
  await University.deleteOne({ _id: university._id });
  invalidateTenantRegistration(university.universityId);
  await removeStoredLogo(university.logo?.publicId, 'university deleted');
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
router.post('/tenant/rankings/snapshot', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await saveRankSnapshot(req.platformUniversity, req.body));
}));
router.get('/tenant/rankings/self', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await readGlobalRank(req.platformUniversity, req.query));
}));
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
  const questions = await QuestionLibrary.find(CENTRAL_QUESTION_FILTER).lean();
  res.json({ questions });
}));
// QuickPreps are designed only by the super admin and reach every university with coding enabled.
// Definitions only: each university keeps its own students' progress.
router.get('/tenant/quests', requireModule('questions'), asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ quests: await publishedQuestDefinitions() });
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
router.get('/tenant/question-interviews/summaries', requireModule('questions'), asyncRoute(async (req, res) => {
  // ?questionId= narrows the aggregation to one question for the per-problem companies panel.
  res.json({ summaries: await interviewReportSummaries(['control', `university:${req.platformUniversity.universityId}`],
    req.query.questionId === undefined ? null : String(req.query.questionId)) });
}));
router.get('/tenant/question-interviews/options', requireModule('questions'), asyncRoute(async (req, res) => {
  res.json(await interviewReportOptions());
}));
router.post('/tenant/question-interviews', requireModule('questions'), asyncRoute(async (req, res) => {
  const scopeKey = String(req.body?.scopeKey || '');
  if (!['control', `university:${req.platformUniversity.universityId}`].includes(scopeKey)) throw new HttpError(403, 'Question is not available');
  if (!mongoose.isValidObjectId(req.body?.questionId)) throw new HttpError(400, 'Invalid question report');
  if (scopeKey === 'control' && !(await QuestionLibrary.exists({ _id: req.body?.questionId, status: 'published',
    visibility: { $ne: 'private' }, sourceType: { $ne: 'assessment' } }))) throw new HttpError(404, 'Question not found');
  res.status(201).json(await saveInterviewReport({ scopeKey, questionId: req.body?.questionId,
    reporter: req.body?.reporterKey, body: req.body, origin: `university:${req.platformUniversity.universityId}` }));
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
  res.json(await universityPolicy());
}));
router.get('/university/account-limits', requireAuth, asyncRoute(async (req, res) => {
  if (!isUniversity() || !['admin', 'coordinator'].includes(req.user.role)) throw new HttpError(403, 'Not available for this account');
  const universityId = currentTenant().universityId;
  const [university, coordinators, students] = await Promise.all([
    University.findOne({ universityId, deletedAt: null }).select('coordinatorLimit studentLimit').lean(),
    User.countDocuments({ role: 'coordinator' }), User.countDocuments({ role: 'student' }),
  ]);
  if (!university) throw new HttpError(404, 'University not found');
  res.set('Cache-Control', 'private, no-store').json({
    coordinatorLimit: university.coordinatorLimit, studentLimit: university.studentLimit,
    coordinators, students,
  });
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
