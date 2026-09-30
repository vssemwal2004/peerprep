import { randomUUID } from 'node:crypto';
import { isCloudinaryConfigured, uploadProblemAsset } from '../utils/cloudinary.js';

const ONE_MB = 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function detectedImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return 'image/gif';
  return '';
}

export async function uploadCodingProblemAsset(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Select an image to upload.' });
    if (req.file.size > ONE_MB) return res.status(413).json({ error: 'Image must be 1 MB or smaller.' });
    const detectedType = detectedImageType(req.file.buffer);
    if (!SUPPORTED_TYPES.has(req.file.mimetype) || detectedType !== req.file.mimetype) {
      return res.status(415).json({ error: 'Use a valid JPG, PNG, WebP, or GIF image.' });
    }
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'Problem image storage is not configured.' });
    }

    const ownerId = String(req.user?._id || req.admin?._id || 'admin');
    const uploaded = await uploadProblemAsset(req.file.buffer, {
      ownerId,
      publicId: `problem-${Date.now()}-${randomUUID()}`,
    });

    return res.status(201).json({
      asset: {
        url: uploaded.url,
        publicId: uploaded.publicId,
        sourceUrl: '',
        alt: '',
        caption: '',
        width: uploaded.width,
        height: uploaded.height,
        mimeType: detectedType,
        size: uploaded.bytes || req.file.size,
      },
    });
  } catch (error) {
    console.error('Error uploading coding problem image:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload problem image.' });
  }
}
