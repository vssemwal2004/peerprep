import jwt from "jsonwebtoken";

// PeerPrep only signs short-lived student claims. The separate interview
// workspace verifies these claims and owns all interview session writes.
export function createInterviewServiceToken(studentId) {
  const secret = process.env.INTERVIEW_SERVICE_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("INTERVIEW_SERVICE_SECRET must contain at least 32 characters.");
  return jwt.sign({ sub: String(studentId), role: "student" }, secret, {
    algorithm: "HS256",
    audience: "peerprep-interview-runtime",
    issuer: "peerprep-api",
    expiresIn: "30s",
  });
}
