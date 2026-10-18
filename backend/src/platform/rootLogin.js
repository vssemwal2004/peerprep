import { HttpError } from '../utils/errors.js';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { login, requestPasswordReset } from '../controllers/authController.js';
import { deploymentRole } from './deployment.js';
import { currentTenant, runForTenant } from './tenantContext.js';
import { getTenant } from './tenantConnections.js';
import { findLiveLoginCandidates, normalizedLoginEmail } from './loginDirectory.js';

export async function routeLogin(req, res) {
  if (deploymentRole() !== 'shared' || currentTenant()) return login(req, res);
  const email = normalizedLoginEmail(req.body?.identifier || req.body?.email);
  const password = req.body?.password;
  if (!email || !password) throw new HttpError(400, 'Enter your email and password');

  // Platform admins remain in the main database. All university accounts use
  // their own database and carry a university claim in the resulting session.
  const platformAdmin = await User.findOne({ role: 'admin', email });
  if (platformAdmin && await platformAdmin.verifyPassword(password)) return login(req, res);

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
  return runForTenant(tenant, () => login(req, res));
}

export async function routePasswordResetRequest(req, res) {
  if (deploymentRole() !== 'shared' || currentTenant()) return requestPasswordReset(req, res);
  const email = normalizedLoginEmail(req.body?.email);
  const generic = { message: 'If an account exists with this email, a password reset link has been sent.' };
  if (!email) return res.json(generic);
  const matches = await findLiveLoginCandidates(email);
  if (matches.length !== 1) return res.json(generic);
  const tenant = await getTenant(matches[0].universityId);
  return runForTenant(tenant, () => requestPasswordReset(req, res));
}
