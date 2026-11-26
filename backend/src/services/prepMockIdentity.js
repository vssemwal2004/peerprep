import User from '../models/User.js';
import bcrypt from 'bcrypt';
import { currentTenant, runForPlatform, runForTenant } from '../platform/tenantContext.js';
import { getTenant } from '../platform/tenantConnections.js';
import { findLiveLoginCandidates } from '../platform/loginDirectory.js';
import { exactEmailPattern } from '../utils/emailIdentity.js';
import { HttpError } from '../utils/errors.js';

async function inSource(identity, work) {
  if (identity.universityId === 'platform') return runForPlatform(work);
  return runForTenant(await getTenant(identity.universityId), work);
}

// A membership in another university uses the password of the original account.
// This also keeps the membership working after that student changes their password.
export async function verifyPrepMockStudentPassword(student, password, depth = 0) {
  if (!student.prepMockIdentity?.userId) return Boolean(student.passwordHash) && bcrypt.compare(password, student.passwordHash);
  if (depth > 2) return false;
  const source = await inSource(student.prepMockIdentity, () => User.findOne({
    _id: student.prepMockIdentity.userId, role: 'student', email: exactEmailPattern(student.email),
  }));
  if (!source || source.isActive === false) return false;
  return verifyPrepMockStudentPassword(source, password, depth + 1);
}

export async function linkedPrepMockSessionActive(student, startedAt) {
  if (!student.prepMockIdentity?.userId) return true;
  const source = await inSource(student.prepMockIdentity, () => User.findOne({
    _id: student.prepMockIdentity.userId, role: 'student', email: exactEmailPattern(student.email),
  }).select('isActive passwordChangedAt').lean());
  if (!source || source.isActive === false) return false;
  return !source.passwordChangedAt || (startedAt && new Date(source.passwordChangedAt) <= new Date(startedAt));
}

export async function findPrepMockStudentSource(email) {
  const platformStudent = await runForPlatform(() => User.findOne({ role: 'student', email: exactEmailPattern(email) }).lean());
  if (platformStudent) return { identity: { universityId: 'platform', userId: platformStudent._id }, student: platformStudent };
  const here = currentTenant()?.universityId;
  const matches = [];
  for (const candidate of await findLiveLoginCandidates(email)) {
    if (candidate.universityId === here) continue;
    const student = await inSource({ universityId: candidate.universityId }, () => User.findOne({
      _id: candidate.userId, role: 'student', email: exactEmailPattern(email),
    }).lean());
    if (student) matches.push({ identity: student.prepMockIdentity?.userId ? student.prepMockIdentity : { universityId: candidate.universityId, userId: student._id }, student });
  }
  const distinct = [...new Map(matches.map((match) => [`${match.identity.universityId}:${match.identity.userId}`, match])).values()];
  if (distinct.length > 1) throw new HttpError(409, 'This email belongs to multiple PeerPrep students. Use the university-specific account first.');
  return distinct[0] || null;
}
