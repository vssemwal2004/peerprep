import jwt from "jsonwebtoken";
import { interviewServiceSecret } from './interviewServiceConfig.js';
import { currentTenant } from '../platform/tenantContext.js';

// PeerPrep only signs short-lived student claims. The separate interview
// workspace verifies these claims and owns all interview session writes.
export function createInterviewServiceToken(studentId) {
  const secret = interviewServiceSecret();
  if (!secret || secret.length < 32)
    throw new Error("INTERVIEW_SERVICE_SECRET must contain at least 32 characters.");
  return jwt.sign({ sub: String(studentId), role: "student", ...(currentTenant() ? { tenantId: currentTenant().universityId } : {}) }, secret, {
    algorithm: "HS256",
    audience: "peerprep-interview-runtime",
    issuer: "peerprep-api",
    expiresIn: "30s",
  });
}
