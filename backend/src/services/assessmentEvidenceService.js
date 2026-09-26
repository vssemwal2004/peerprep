import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { AssessmentWriteError } from './assessmentPersistenceService.js';

const bucketName = () => String(process.env.ASSESSMENT_EVIDENCE_BUCKET || '').trim();
const evidenceStorageUrl = process.env.SUPABASE_URL;
const evidenceStorageKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const supabase = evidenceStorageUrl && evidenceStorageKey ? createClient(evidenceStorageUrl, evidenceStorageKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, options = {}) => fetch(url, { ...options,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
  }) },
}) : null;
const maxBytes = () => {
  const configured = Number(process.env.ASSESSMENT_EVIDENCE_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? Math.min(5 * 1024 * 1024, Math.max(16384, configured)) : 1024 * 1024;
};
const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const requireSecret = () => {
  const secret = process.env.ASSESSMENT_EVIDENCE_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new AssessmentWriteError(503, 'EVIDENCE_NOT_CONFIGURED', 'Evidence signing is not configured.');
  return secret;
};
export function evidenceStorageEnabled() { return Boolean(supabase && bucketName()); }

export async function createAssessmentEvidenceUpload(doc, { contentType, sizeBytes }) {
  if (!evidenceStorageEnabled()) return { enabled: false };
  if (!types[contentType] || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes()) {
    throw new AssessmentWriteError(400, 'INVALID_EVIDENCE', 'Use a supported image within the evidence size limit.');
  }
  const objectKey = `${doc.assessmentId}/${doc._id}/${doc.attemptGeneration || 1}/${randomUUID()}.${types[contentType]}`;
  const { data, error } = await supabase.storage.from(bucketName()).createSignedUploadUrl(objectKey, { upsert: false });
  if (error) throw new AssessmentWriteError(503, 'EVIDENCE_UPLOAD_UNAVAILABLE', 'Evidence storage is temporarily unavailable.');
  const uploadToken = jwt.sign({ kind: 'assessment-evidence', objectKey, submissionId: String(doc._id), studentId: String(doc.studentId), generation: doc.attemptGeneration || 1, sizeBytes, contentType }, requireSecret(), { algorithm: 'HS256', expiresIn: '10m', audience: 'assessment-evidence' });
  return { enabled: true, objectKey, uploadToken, uploadUrl: data.signedUrl, method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, maxBytes: maxBytes() };
}

export async function verifyAssessmentEvidenceUpload(doc, snapshot) {
  let claims;
  try { claims = jwt.verify(snapshot.uploadToken, requireSecret(), { algorithms: ['HS256'], audience: 'assessment-evidence' }); }
  catch { throw new AssessmentWriteError(400, 'INVALID_EVIDENCE_TOKEN', 'Invalid or expired evidence upload token.'); }
  if (claims.kind !== 'assessment-evidence' || claims.objectKey !== snapshot.objectKey
    || claims.submissionId !== String(doc._id) || claims.studentId !== String(doc.studentId)
    || claims.generation !== Number(doc.attemptGeneration || 1)) {
    throw new AssessmentWriteError(403, 'INVALID_EVIDENCE_OWNER', 'Evidence does not belong to this attempt.');
  }
  if (!evidenceStorageEnabled()) throw new AssessmentWriteError(503, 'EVIDENCE_NOT_CONFIGURED', 'Evidence storage is not configured.');
  // Verify metadata via the storage service; never fetch arbitrary client URLs.
  const slash = claims.objectKey.lastIndexOf('/');
  const { data, error } = await supabase.storage.from(bucketName()).list(claims.objectKey.slice(0, slash), { search: claims.objectKey.slice(slash + 1), limit: 2 });
  const file = data?.find((item) => item.name === claims.objectKey.slice(slash + 1));
  if (error || !file) throw new AssessmentWriteError(409, 'EVIDENCE_NOT_UPLOADED', 'Evidence upload is not complete.');
  if (Number(file.metadata?.size) > maxBytes() || Number(file.metadata?.size) !== claims.sizeBytes || file.metadata?.mimetype !== claims.contentType) {
    throw new AssessmentWriteError(400, 'INVALID_EVIDENCE_SIZE', 'Uploaded evidence does not match the approved size or type.');
  }
  return claims.objectKey;
}

export function normalizeLegacyEvidence(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(maxBytes() * 4 / 3) + 128
    || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new AssessmentWriteError(400, 'INVALID_EVIDENCE', 'Invalid or oversized evidence image.');
  }
  return dataUrl;
}

export async function signAssessmentEvidenceRead(objectKey) {
  if (!objectKey || !evidenceStorageEnabled()) return null;
  const { data, error } = await supabase.storage.from(bucketName()).createSignedUrl(objectKey, 120);
  if (error) throw new AssessmentWriteError(503, 'EVIDENCE_UNAVAILABLE', 'Evidence storage is temporarily unavailable.');
  return data.signedUrl;
}
