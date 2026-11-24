import { randomUUID } from 'node:crypto';
import multer from 'multer';
import Announcement from '../models/Announcement.js';
import { announcementFields, categoryFor } from '../services/announcementContent.js';
import { isCloudinaryConfigured, uploadAnnouncementImage } from '../utils/cloudinary.js';
import { detectedImageType, mapImageStorageError } from './problemAssetController.js';
import { HttpError } from '../utils/errors.js';

const MAX_ANNOUNCEMENT_IMAGE_BYTES = 2 * 1024 * 1024;
import { getIo } from '../utils/io.js';
import { logActivity } from './adminActivityController.js';

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

function parseExpiryDate(value) {
  if (!value) return undefined;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return undefined;

  // Date inputs arrive as YYYY-MM-DD. Treat that as the full selected day,
  // otherwise an announcement expires at midnight before students see it.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    expiry.setHours(23, 59, 59, 999);
  }

  return expiry;
}

/** The "show as popup at login" switch from a form or JSON body. */
export function parseShowAsPopup(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
}

function emitAnnouncementUpdate() {
  const io = getIo();
  if (io) {
    io.emit('announcement_update');
  }
}

export async function createAnnouncement(req, res) {
  const { expiryDate, showAsPopup } = req.body || {};
  const fields = announcementFields(req.body || {});

  const announcement = await Announcement.create({
    ...fields,
    showAsPopup: parseShowAsPopup(showAsPopup),
    createdBy: req.user?._id,
    expiryDate: parseExpiryDate(expiryDate)
  });

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'CREATE',
    targetType: 'ANNOUNCEMENT',
    targetId: String(announcement._id),
    description: `Created announcement: ${announcement.title}`,
    changes: {
      title: { from: null, to: announcement.title },
      status: { from: null, to: announcement.status },
      priority: { from: null, to: announcement.priority },
      type: { from: null, to: announcement.type },
      showAsPopup: { from: null, to: announcement.showAsPopup },
    },
    metadata: { announcementId: String(announcement._id) },
    req,
  });

  emitAnnouncementUpdate();
  res.status(201).json({ announcement });
}

export async function listAnnouncementsAdmin(req, res) {
  const { status, type } = req.query || {};
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;

  const announcements = await Announcement.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  res.json({ announcements });
}

export async function updateAnnouncement(req, res) {
  const { id } = req.params;
  if (!id) throw new HttpError(400, 'Announcement ID is required');

  const before = await Announcement.findById(id).lean();
  if (!before) throw new HttpError(404, 'Announcement not found');

  const body = req.body || {};
  const updates = announcementFields(body, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'expiryDate')) {
    updates.expiryDate = parseExpiryDate(body.expiryDate) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'showAsPopup')) {
    updates.showAsPopup = parseShowAsPopup(body.showAsPopup);
  }

  const announcement = await Announcement.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!announcement) throw new HttpError(404, 'Announcement not found');

  const changes = {};
  Object.keys(updates).forEach((k) => {
    const from = before?.[k] ?? null;
    const to = announcement?.[k] ?? null;
    if (String(from) !== String(to)) changes[k] = { from, to };
  });

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'UPDATE',
    targetType: 'ANNOUNCEMENT',
    targetId: String(announcement._id),
    description: `Updated announcement: ${announcement.title}`,
    changes: Object.keys(changes).length ? changes : null,
    metadata: { announcementId: String(announcement._id) },
    req,
  });

  emitAnnouncementUpdate();
  res.json({ announcement });
}

export async function deleteAnnouncement(req, res) {
  const { id } = req.params;
  if (!id) throw new HttpError(400, 'Announcement ID is required');

  const announcement = await Announcement.findByIdAndDelete(id);
  if (!announcement) throw new HttpError(404, 'Announcement not found');

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'DELETE',
    targetType: 'ANNOUNCEMENT',
    targetId: String(announcement._id),
    description: `Deleted announcement: ${announcement.title}`,
    metadata: { announcementId: String(announcement._id) },
    req,
  });

  emitAnnouncementUpdate();
  res.json({ message: 'Announcement deleted' });
}

export async function listAnnouncementsStudent(req, res) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const announcements = await Announcement.find({
    status: 'active',
    $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gte: startOfToday } }]
  }).lean();

  const sorted = announcements.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Announcements saved before categories existed get theirs from the old type.
  res.json({ announcements: sorted.map((item) => ({ ...item, category: categoryFor(item) })) });
}

const announcementImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ANNOUNCEMENT_IMAGE_BYTES, files: 1, fields: 0 } });

/** Parses one multipart image from the `image` field into req.file, with specific messages. */
export function acceptAnnouncementImage(req, res, next) {
  announcementImageUpload.single('image')(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 2 MB or smaller.' : 'Upload one JPG, PNG, WebP or GIF image up to 2 MB in the "image" field.';
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message });
  });
}

/** Stores an announcement image (popup banner / side image) and returns its https URL. */
export async function uploadAnnouncementImageHandler(req, res) {
  if (!req.file) throw new HttpError(400, 'Select an image to upload.');
  const detected = detectedImageType(req.file.buffer);
  if (!detected || detected !== req.file.mimetype) throw new HttpError(415, 'Use a valid JPG, PNG, WebP or GIF image.');
  if (!isCloudinaryConfigured()) throw new HttpError(503, 'Image storage is not configured.');
  try {
    const uploaded = await uploadAnnouncementImage(req.file.buffer, { publicId: `announcement-${Date.now()}-${randomUUID()}` });
    res.status(201).json({ image: { url: uploaded.url, width: uploaded.width, height: uploaded.height } });
  } catch (error) {
    console.error('Announcement image upload failed:', error?.message || error);
    const mapped = mapImageStorageError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}
