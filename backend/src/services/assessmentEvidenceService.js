import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { AssessmentWriteError } from './assessmentPersistenceService.js';
import { currentTenant } from '../platform/tenantContext.js';
import { deploymentRole } from '../platform/deployment.js';
import {
  cloudinaryImageUploadUrl,
  isCloudinaryConfigured,
  isCloudinaryUploadResponse,
  privateCloudinaryImageUrl,
  signCloudinaryUpload,
} from '../utils/cloudinary.js';

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

// Cloudinary object keys carry this marker; keys without it are Supabase paths.
const CLOUDINARY_KEY_PREFIX = 'cld:';
const CLOUDINARY_EVIDENCE_ROOT = 'peerprep/assessment-evidence';
const tenantSegment = () => currentTenant()?.universityId || 'platform';

/**
 * Where new evidence goes: ASSESSMENT_EVIDENCE_STORAGE (cloudinary, supabase or none)
 * when set, otherwise Cloudinary when configured, then a Supabase bucket. 'none'
 * falls back to storing the image in MongoDB and is meant for local development.
 */
export function evidenceProvider() {
  const configured = String(process.env.ASSESSMENT_EVIDENCE_STORAGE || '').trim().toLowerCase();
  const supabaseReady = Boolean(supabase && bucketName());
  if (configured === 'none') return 'none';
  if (configured === 'supabase') return supabaseReady ? 'supabase' : 'none';
  if (configured === 'cloudinary') return isCloudinaryConfigured() ? 'cloudinary' : 'none';
  if (isCloudinaryConfigured()) return 'cloudinary';
  return supabaseReady ? 'supabase' : 'none';
}
export function evidenceStorageEnabled() { return evidenceProvider() !== 'none'; }

/**
 * Cloudinary public-ID prefix for all evidence of one assessment in the current
 * tenant, or of one attempt when submissionId is given. Ends with a slash so one
 * ID can never match another that merely starts with the same characters.
 */
export function cloudinaryEvidencePrefix(assessmentId, submissionId) {
  return `${[CLOUDINARY_EVIDENCE_ROOT, tenantSegment(), String(assessmentId), submissionId && String(submissionId)].filter(Boolean).join('/')}/`;
}

/** Public ID for one evidence image of an attempt. */
export function cloudinaryEvidencePublicId(doc, name) {
  return `${cloudinaryEvidencePrefix(doc.assessmentId, doc._id)}${doc.attemptGeneration || 1}/${name}`;
}
export const cloudinaryEvidenceObjectKey = (publicId) => `${CLOUDINARY_KEY_PREFIX}${publicId}`;

function signUploadToken(doc, { universityId, objectKey, sizeBytes, contentType }) {
  return jwt.sign({ kind: 'assessment-evidence', universityId, objectKey, submissionId: String(doc._id), studentId: String(doc.studentId), generation: doc.attemptGeneration || 1, sizeBytes, contentType }, requireSecret(), { algorithm: 'HS256', expiresIn: '10m', audience: 'assessment-evidence' });
}

export async function createAssessmentEvidenceUpload(doc, { contentType, sizeBytes }) {
  const provider = evidenceProvider();
  if (provider === 'none') return { enabled: false };
  if (!types[contentType] || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes()) {
    throw new AssessmentWriteError(400, 'INVALID_EVIDENCE', 'Use a supported image within the evidence size limit.');
  }
  const universityId = currentTenant()?.universityId || 'platform';
  if (provider === 'cloudinary') {
    // The browser posts the bytes straight to Cloudinary; the API only signs the request.
    const publicId = cloudinaryEvidencePublicId(doc, randomUUID());
    const objectKey = cloudinaryEvidenceObjectKey(publicId);
    const fields = signCloudinaryUpload({
      public_id: publicId,
      timestamp: Math.floor(Date.now() / 1000),
      allowed_formats: 'jpg,png,webp',
      // Bounds the stored size even if a client sends a larger frame than ours.
      transformation: 'c_limit,h_1280,w_1280',
    });
    return {
      enabled: true, provider, objectKey, uploadUrl: cloudinaryImageUploadUrl(), method: 'POST', fields, maxBytes: maxBytes(),
      uploadToken: signUploadToken(doc, { universityId, objectKey, sizeBytes, contentType }),
    };
  }
  const tenantPrefix = deploymentRole() === 'shared' ? `${universityId}/` : '';
  const objectKey = `${tenantPrefix}${doc.assessmentId}/${doc._id}/${doc.attemptGeneration || 1}/${randomUUID()}.${types[contentType]}`;
  const { data, error } = await supabase.storage.from(bucketName()).createSignedUploadUrl(objectKey, { upsert: false });
  if (error) throw new AssessmentWriteError(503, 'EVIDENCE_UPLOAD_UNAVAILABLE', 'Evidence storage is temporarily unavailable.');
  const uploadToken = signUploadToken(doc, { universityId, objectKey, sizeBytes, contentType });
  return { enabled: true, provider, objectKey, uploadToken, uploadUrl: data.signedUrl, method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, maxBytes: maxBytes() };
}

export async function verifyAssessmentEvidenceUpload(doc, snapshot) {
  let claims;
  try { claims = jwt.verify(snapshot.uploadToken, requireSecret(), { algorithms: ['HS256'], audience: 'assessment-evidence' }); }
  catch { throw new AssessmentWriteError(400, 'INVALID_EVIDENCE_TOKEN', 'Invalid or expired evidence upload token.'); }
  if (claims.kind !== 'assessment-evidence' || claims.objectKey !== snapshot.objectKey
    || (deploymentRole() === 'shared' && claims.universityId !== (currentTenant()?.universityId || 'platform'))
    || claims.submissionId !== String(doc._id) || claims.studentId !== String(doc.studentId)
    || claims.generation !== Number(doc.attemptGeneration || 1)) {
    throw new AssessmentWriteError(403, 'INVALID_EVIDENCE_OWNER', 'Evidence does not belong to this attempt.');
  }
  if (claims.objectKey.startsWith(CLOUDINARY_KEY_PREFIX)) {
    if (!isCloudinaryConfigured()) throw new AssessmentWriteError(503, 'EVIDENCE_NOT_CONFIGURED', 'Evidence storage is not configured.');
    // Cloudinary signs public_id + version in its upload response; no Admin API call per image.
    const publicId = claims.objectKey.slice(CLOUDINARY_KEY_PREFIX.length);
    if (!isCloudinaryUploadResponse({ publicId, version: snapshot.version, signature: snapshot.signature })) {
      throw new AssessmentWriteError(409, 'EVIDENCE_NOT_UPLOADED', 'Evidence upload is not complete.');
    }
    return claims.objectKey;
  }
  if (!supabase || !bucketName()) throw new AssessmentWriteError(503, 'EVIDENCE_NOT_CONFIGURED', 'Evidence storage is not configured.');
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
  if (!objectKey) return null;
  if (String(objectKey).startsWith(CLOUDINARY_KEY_PREFIX)) {
    if (!isCloudinaryConfigured()) return null;
    const publicId = objectKey.slice(CLOUDINARY_KEY_PREFIX.length);
    if (deploymentRole() === 'shared' && !publicId.startsWith(`${CLOUDINARY_EVIDENCE_ROOT}/${tenantSegment()}/`)) {
      throw new AssessmentWriteError(403, 'EVIDENCE_OWNER_MISMATCH', 'Evidence belongs to another university.');
    }
    return privateCloudinaryImageUrl(publicId, { expiresInSec: 120 });
  }
  if (!supabase || !bucketName()) return null;
  if (deploymentRole() === 'shared' && !String(objectKey).startsWith(`${currentTenant()?.universityId || 'platform'}/`)) {
    throw new AssessmentWriteError(403, 'EVIDENCE_OWNER_MISMATCH', 'Evidence belongs to another university.');
  }
  const { data, error } = await supabase.storage.from(bucketName()).createSignedUrl(objectKey, 120);
  if (error) throw new AssessmentWriteError(503, 'EVIDENCE_UNAVAILABLE', 'Evidence storage is temporarily unavailable.');
  return data.signedUrl;
}
