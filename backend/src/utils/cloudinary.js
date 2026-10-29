import { timingSafeEqual } from 'node:crypto';
import { currentTenant } from '../platform/tenantContext.js';
import { deploymentRole } from '../platform/deployment.js';
import { v2 as cloudinary } from 'cloudinary';

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Configure Cloudinary
if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
  console.log('[Cloudinary] Configured successfully');
} else if (process.env.NODE_ENV === 'production') {
  // Production without storage breaks problem images, avatars, and university logos.
  console.error('[Cloudinary] NOT CONFIGURED in production - set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET. Image uploads will fail.');
} else {
  console.warn('[Cloudinary] Not configured - missing environment variables');
}

/**
 * Upload avatar to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} folder - The folder name (student_profile or teacher_profile)
 * @param {string} userId - User ID for unique naming
 * @returns {Promise<string>} - The secure URL of the uploaded image
 */
export async function uploadAvatar(fileBuffer, folder, userId) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary not configured');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: `avatar_${deploymentRole() === 'shared' ? `${currentTenant()?.universityId || 'platform'}_` : ''}${userId}_${Date.now()}`,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ],
        overwrite: true,
        invalidate: true
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
}

export async function uploadProblemAsset(fileBuffer, { ownerId = 'admin', publicId }) {
  if (!isCloudinaryConfigured()) throw new Error('Cloudinary not configured');

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `peerprep/problem-assets/authored/${deploymentRole() === 'shared' ? `${currentTenant()?.universityId || 'platform'}/` : ''}${String(ownerId)}`,
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        unique_filename: false,
        use_filename: false,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );
    uploadStream.end(fileBuffer);
  });
}

/** Uploads a validated university logo under its own folder. The caller supplies a unique public ID. */
export async function uploadUniversityLogo(fileBuffer, { universityId, publicId }) {
  if (!isCloudinaryConfigured()) throw new Error('Cloudinary not configured');

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `peerprep/universities/${String(universityId)}`,
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        unique_filename: false,
        use_filename: false,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );
    uploadStream.end(fileBuffer);
  });
}

/** Removes one image by its Cloudinary public ID. Callers treat failures as best-effort. */
export async function destroyCloudinaryImage(publicId) {
  if (!publicId || !isCloudinaryConfigured()) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
}

/**
 * Delete avatar from Cloudinary
 * @param {string} imageUrl - The URL of the image to delete
 * @returns {Promise<void>}
 */
export async function deleteAvatar(imageUrl) {
  if (!imageUrl || !CLOUDINARY_CLOUD_NAME) return;

  try {
    // Extract public_id from URL
    const urlParts = imageUrl.split('/');
    const fileWithExt = urlParts[urlParts.length - 1];
    const folder = urlParts[urlParts.length - 2];
    const publicId = `${folder}/${fileWithExt.split('.')[0]}`;
    
    await cloudinary.uploader.destroy(publicId);
    console.log('[Cloudinary] Deleted image:', publicId);
  } catch (error) {
    console.error('[Cloudinary] Error deleting image:', error.message);
  }
}

export const isCloudinaryConfigured = () => {
  return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
};

// Private ("authenticated") images are never reachable by a plain URL; reads need
// a short-lived signed download link from privateCloudinaryImageUrl.
const PRIVATE_TYPE = 'authenticated';

export const cloudinaryImageUploadUrl = () => `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/** Signs the form fields a browser posts for one direct, private image upload. */
export function signCloudinaryUpload(params) {
  const fields = { ...params, type: PRIVATE_TYPE };
  return { ...fields, api_key: CLOUDINARY_API_KEY, signature: cloudinary.utils.api_sign_request(fields, CLOUDINARY_API_SECRET) };
}

/**
 * True when an upload response (public_id, version, signature) was issued by
 * Cloudinary for this account, so the browser cannot claim an upload it never made.
 */
export function isCloudinaryUploadResponse({ publicId, version, signature }) {
  if (!isCloudinaryConfigured() || !publicId || !version || typeof signature !== 'string') return false;
  const expected = Buffer.from(cloudinary.utils.api_sign_request({ public_id: publicId, version }, CLOUDINARY_API_SECRET));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Signed download link for a private image that stops working after expiresInSec. */
export function privateCloudinaryImageUrl(publicId, { format = 'jpg', expiresInSec = 120 } = {}) {
  return cloudinary.utils.private_download_url(publicId, format, {
    type: PRIVATE_TYPE,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSec,
  });
}

/** Server-side upload of a private image under an exact public ID (used by migrations). */
export async function uploadPrivateImage(fileBuffer, { publicId }) {
  if (!isCloudinaryConfigured()) throw new Error('Cloudinary not configured');
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { public_id: publicId, type: PRIVATE_TYPE, resource_type: 'image', overwrite: true },
      (error, result) => (error ? reject(error) : resolve({ publicId: result.public_id, bytes: result.bytes })),
    );
    uploadStream.end(fileBuffer);
  });
}

/**
 * Deletes private images whose public ID starts with prefix, at most one Admin API
 * page (1000 images) per call. Returns true once nothing is left under the prefix.
 */
export async function deletePrivateImagesByPrefix(prefix) {
  if (!isCloudinaryConfigured()) throw new Error('Cloudinary not configured');
  const result = await cloudinary.api.delete_resources_by_prefix(prefix, { type: PRIVATE_TYPE, resource_type: 'image' });
  return !result?.partial;
}
