import multer from 'multer';
import { HttpError } from '../utils/errors.js';
import { destroyCloudinaryImage, isCloudinaryConfigured, uploadUniversityLogo } from '../utils/cloudinary.js';

// University logos: PNG, JPEG or WebP only. SVG (scriptable) and GIF (animated) are refused.
export const LOGO_LIMITS = Object.freeze({ maxBytes: 2 * 1024 * 1024, minSide: 64, maxSide: 4096 });
const MIME_BY_TYPE = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Identifies the image by its magic bytes; the client-declared MIME type is never trusted alone. */
export function detectLogoType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return '';
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer) {
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    // Markers without a length segment.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (offset + 9 > buffer.length) return null;
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buffer) {
  if (buffer.length < 30) return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (buffer[20] !== 0x2f) return null;
    const [b0, b1, b2, b3] = [buffer[21], buffer[22], buffer[23], buffer[24]];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  return null;
}

export function readLogoSize(buffer, type) {
  try {
    if (type === 'png') return pngSize(buffer);
    if (type === 'jpeg') return jpegSize(buffer);
    if (type === 'webp') return webpSize(buffer);
  } catch { /* A truncated header reads past the end; treat it as unreadable. */ }
  return null;
}

/** Throws an HttpError describing the first problem with the uploaded file, or returns its detected type and size. */
export function validateLogoFile(file) {
  if (!file?.buffer?.length) throw new HttpError(400, 'Choose a PNG, JPEG or WebP logo to upload.');
  if (file.size > LOGO_LIMITS.maxBytes || file.buffer.length > LOGO_LIMITS.maxBytes) throw new HttpError(413, 'Logo must be 2 MB or smaller.');
  const type = detectLogoType(file.buffer);
  if (!type || MIME_BY_TYPE[type] !== String(file.mimetype || '').toLowerCase()) {
    throw new HttpError(415, 'Logo must be a real PNG, JPEG or WebP image. SVG and GIF files are not accepted.');
  }
  const size = readLogoSize(file.buffer, type);
  if (!size || !size.width || !size.height) throw new HttpError(415, 'The logo image could not be read. Export it again as PNG, JPEG or WebP.');
  if (size.width < LOGO_LIMITS.minSide || size.height < LOGO_LIMITS.minSide) {
    throw new HttpError(422, `Logo must be at least ${LOGO_LIMITS.minSide}×${LOGO_LIMITS.minSide} pixels (this one is ${size.width}×${size.height}).`);
  }
  if (size.width > LOGO_LIMITS.maxSide || size.height > LOGO_LIMITS.maxSide) {
    throw new HttpError(422, `Logo must be at most ${LOGO_LIMITS.maxSide}×${LOGO_LIMITS.maxSide} pixels (this one is ${size.width}×${size.height}).`);
  }
  return { type, mimeType: MIME_BY_TYPE[type], ...size };
}

// Indirection so tests can replace the storage provider without network access.
export const logoStorage = {
  isConfigured: () => isCloudinaryConfigured(),
  upload: (buffer, options) => uploadUniversityLogo(buffer, options),
  destroy: (publicId) => destroyCloudinaryImage(publicId),
};

/** Deletes a stored logo without ever failing the caller. */
export async function removeStoredLogo(publicId, context = '') {
  if (!publicId) return;
  try { await logoStorage.destroy(publicId); }
  catch (error) { console.warn('[UniversityLogo] Could not delete old logo', { publicId, context, error: error?.message }); }
}

const logoUpload = multer({
  storage: multer.memoryStorage(),
  // files/fields cap the input; parts leaves room for busboy counting the closing boundary.
  limits: { fileSize: LOGO_LIMITS.maxBytes, files: 1, fields: 0, parts: 2 },
});

/** Parses exactly one multipart file named "logo" into req.file. */
export function acceptLogoUpload(req, res, next) {
  logoUpload.single('logo')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Logo must be 2 MB or smaller.'));
    return next(new HttpError(400, 'Upload one PNG, JPEG or WebP file in the "logo" field.'));
  });
}
