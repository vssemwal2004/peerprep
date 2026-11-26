import { HttpError } from '../utils/errors.js';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { login, requestPasswordReset } from '../controllers/authController.js';
import { deploymentRole } from './deployment.js';
import { currentTenant, runForTenant } from './tenantContext.js';
import { getTenant } from './tenantConnections.js';
import { findLiveLoginCandidates, normalizedLoginEmail, normalizedLoginStudentId } from './loginDirectory.js';
import { University } from './models.js';
import { studentIdFromUniversityLogin } from './studentLoginId.js';
import { servicePeriodStatus, servicePeriodMessage } from './servicePeriod.js';
import { exactEmailPattern } from '../utils/emailIdentity.js';
import { verifyPrepMockStudentPassword } from '../services/prepMockIdentity.js';

// The university code points directly to candidate tenant databases. Existing
// academic student IDs stay unchanged; only the login identifier is prefixed.
async function routeStudentIdLogin(req, res, studentId, password) {
  const matches = [];
  const platformStudent = await User.findOne({ role: 'student', studentId }).select('passwordHash').lean();
  if (platformStudent?.passwordHash && await bcrypt.compare(password, platformStudent.passwordHash)) {
    return login(req, res);
  }
  const universities = await University.find({ active: true, deletedAt: null }).select('universityId').lean();
  for (const university of universities) {
    const academicId = studentIdFromUniversityLogin(studentId, university.universityId);
    if (!academicId) continue;
    const tenant = await getTenant(university.universityId);
    const user = await runForTenant(tenant, () => User.findOne({ role: 'student', studentId: academicId })
      .select('passwordHash prepMockIdentity email role').lean());
    if (user?.role === 'student' && await verifyPrepMockStudentPassword(user, password)) matches.push({ tenant });
  }
  if (!matches.length) throw new HttpError(401, 'Invalid credentials');
  if (matches.length > 1) {
    throw new HttpError(409, 'This login ID matches more than one account. Use your university login link.');
  }
  const [{ tenant }] = matches;
  const period = servicePeriodStatus(tenant);
  if (period !== 'active') throw new HttpError(403, servicePeriodMessage(tenant, period));
  return runForTenant(tenant, () => login(req, res));
}

export async function routeLogin(req, res) {
  if (deploymentRole() !== 'shared' || currentTenant()) return login(req, res);
  const identifier = req.body?.identifier || req.body?.email;
  const email = normalizedLoginEmail(identifier);
  const password = req.body?.password;
  if (!password) throw new HttpError(400, 'Enter your login ID or staff email and password');
  if (!email) {
    const studentId = normalizedLoginStudentId(identifier);
    if (!studentId) throw new HttpError(400, 'Enter your login ID or staff email and password');
    return routeStudentIdLogin(req, res, studentId, password);
  }

  // PeerPrep's own admins, coordinators and students stay in the main DB.
  // University accounts use their own DB and carry a university session claim.
  const platformUser = await User.exists({ email: exactEmailPattern(email) });
  if (platformUser) return login(req, res);

  const matches = await findLiveLoginCandidates(email);
  if (matches.length > 1) {
    let passwordMatches = false;
    for (const match of matches) {
      const tenant = await getTenant(match.universityId);
      const user = await runForTenant(tenant, () => User.findById(match.userId).select('passwordHash prepMockIdentity email role').lean());
      if (user?.role !== 'student' && user?.passwordHash && await bcrypt.compare(password, user.passwordHash)) passwordMatches = true;
    }
    if (!passwordMatches) throw new HttpError(401, 'Invalid credentials');
    throw new HttpError(409, 'This email is used at more than one university. Use the login link from your university.');
  }
  if (!matches.length) throw new HttpError(401, 'Invalid credentials');
  const tenant = await getTenant(matches[0].universityId);
  const user = await runForTenant(tenant, () => User.findById(matches[0].userId).select('passwordHash prepMockIdentity email role').lean());
  if (!user || user.role === 'student' || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) throw new HttpError(401, 'Invalid credentials');
  const period = servicePeriodStatus(tenant);
  if (period !== 'active') throw new HttpError(403, servicePeriodMessage(tenant, period));
  return runForTenant(tenant, () => login(req, res));
}

export async function routePasswordResetRequest(req, res) {
  if (deploymentRole() !== 'shared' || currentTenant()) return requestPasswordReset(req, res);
  const email = normalizedLoginEmail(req.body?.email);
  const generic = { message: 'If an account exists with this email, a password reset link has been sent.' };
  if (!email) return res.json(generic);
  if (await User.exists({ email: exactEmailPattern(email), role: { $in: ['student', 'coordinator'] } })) return requestPasswordReset(req, res);
  const matches = await findLiveLoginCandidates(email);
  if (matches.length !== 1) return res.json(generic);
  const tenant = await getTenant(matches[0].universityId);
  return runForTenant(tenant, () => requestPasswordReset(req, res));
}
