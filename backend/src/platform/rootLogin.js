import { HttpError } from '../utils/errors.js';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { login, requestPasswordReset } from '../controllers/authController.js';
import { deploymentRole } from './deployment.js';
import { currentTenant, runForTenant } from './tenantContext.js';
import { getTenant } from './tenantConnections.js';
import { findLiveLoginCandidates, findLiveStudentIdCandidates, normalizedLoginEmail, normalizedLoginStudentId } from './loginDirectory.js';
import { servicePeriodStatus, servicePeriodMessage } from './servicePeriod.js';
import { exactEmailPattern } from '../utils/emailIdentity.js';

// Student IDs are not unique across universities: sign in only when exactly
// one student account has this ID and the password matches it.
async function routeStudentIdLogin(req, res, studentId, password) {
  const matches = [];
  const platformStudent = await User.findOne({ role: 'student', studentId }).select('passwordHash').lean();
  if (platformStudent?.passwordHash && await bcrypt.compare(password, platformStudent.passwordHash)) {
    matches.push({ platform: true });
  }
  for (const candidate of await findLiveStudentIdCandidates(studentId)) {
    const tenant = await getTenant(candidate.universityId);
    const user = await runForTenant(tenant, () => User.findById(candidate.userId).select('passwordHash').lean());
    if (user?.passwordHash && await bcrypt.compare(password, user.passwordHash)) matches.push({ tenant });
  }
  if (!matches.length) throw new HttpError(401, 'Invalid credentials');
  if (matches.length > 1) {
    throw new HttpError(409, 'This student ID is used at more than one university. Sign in with your email or use the login link from your university.');
  }
  const [{ platform, tenant }] = matches;
  if (platform) return login(req, res);
  const period = servicePeriodStatus(tenant);
  if (period !== 'active') throw new HttpError(403, servicePeriodMessage(tenant, period));
  return runForTenant(tenant, () => login(req, res));
}

export async function routeLogin(req, res) {
  if (deploymentRole() !== 'shared' || currentTenant()) return login(req, res);
  const identifier = req.body?.identifier || req.body?.email;
  const email = normalizedLoginEmail(identifier);
  const password = req.body?.password;
  if (!password) throw new HttpError(400, 'Enter your email or student ID and password');
  if (!email) {
    const studentId = normalizedLoginStudentId(identifier);
    if (!studentId) throw new HttpError(400, 'Enter your email or student ID and password');
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
      const user = await runForTenant(tenant, () => User.findById(match.userId).select('passwordHash').lean());
      if (user?.passwordHash && await bcrypt.compare(password, user.passwordHash)) passwordMatches = true;
    }
    if (!passwordMatches) throw new HttpError(401, 'Invalid credentials');
    throw new HttpError(409, 'This email is used at more than one university. Use the login link from your university.');
  }
  if (!matches.length) throw new HttpError(401, 'Invalid credentials');
  const tenant = await getTenant(matches[0].universityId);
  const user = await runForTenant(tenant, () => User.findById(matches[0].userId).select('passwordHash').lean());
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Invalid credentials');
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
