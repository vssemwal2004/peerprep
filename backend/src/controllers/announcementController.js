import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import multer from 'multer';
import Announcement from '../models/Announcement.js';
import { announcementFields, categoryFor } from '../services/announcementContent.js';
import { isCloudinaryConfigured, uploadAnnouncementImage } from '../utils/cloudinary.js';
import { detectedImageType, mapImageStorageError } from './problemAssetController.js';
import { HttpError } from '../utils/errors.js';
import { AUDIENCE_LIMITS, audienceFromBody, audienceStudents, matchAudienceUpload } from '../services/announcementAudience.js';

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

/** An announcement for admin screens: the chosen-student list is replaced by its size. */
export function announcementForAdmin(doc) {
  if (!doc) return doc;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const audienceCount = Array.isArray(plain.studentIds) ? plain.studentIds.length : Number(plain.audienceCount) || 0;
  delete plain.studentIds;
  return { ...plain, audience: plain.audience === 'selected' ? 'selected' : 'all', audienceCount: plain.audience === 'selected' ? audienceCount : 0 };
}

const audienceText = (item) => (item?.audience === 'selected' ? `selected students (${(item.studentIds || []).length})` : 'all students');

export async function createAnnouncement(req, res) {
  const { expiryDate, showAsPopup } = req.body || {};
  const fields = announcementFields(req.body || {});
  const { skipped, ...audience } = await audienceFromBody(req.body || {}, req.user);

  const announcement = await Announcement.create({
    ...fields,
    ...audience,
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
      audience: { from: null, to: audienceText(announcement) },
    },
    metadata: { announcementId: String(announcement._id) },
    req,
  });

  emitAnnouncementUpdate();
  res.status(201).json({ announcement: announcementForAdmin(announcement), skippedStudents: skipped || 0 });
}

export async function listAnnouncementsAdmin(req, res) {
  const { status, type } = req.query || {};
  const filter = {};
  if (['active', 'inactive'].includes(status)) filter.status = status;
  if (['motivation', 'info', 'alert'].includes(type)) filter.type = type;

  // The chosen-student lists can be long: only their sizes are sent.
  const announcements = await Announcement.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $addFields: { audienceCount: { $size: { $ifNull: ['$studentIds', []] } } } },
    { $project: { studentIds: 0 } },
  ]);

  res.json({ announcements: announcements.map(announcementForAdmin) });
}

/** The chosen students of one announcement (for editing), within the user's rights. */
export async function getAnnouncementAudience(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(String(id || ''))) throw new HttpError(400, 'Announcement ID is required');
  const announcement = await Announcement.findById(id).select('audience studentIds').lean();
  if (!announcement) throw new HttpError(404, 'Announcement not found');
  res.json(await audienceStudents(announcement, req.user));
}

const audienceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AUDIENCE_LIMITS.maxUploadBytes, files: 1, fields: 0 } });

/** Parses one CSV/Excel file from the `file` field into req.file. */
export function acceptAudienceFile(req, res, next) {
  audienceUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const tooBig = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'The file must be 2 MB or smaller.' : 'Upload one CSV or Excel (.xlsx) file in the "file" field.' });
  });
}

/** Uploaded list → rows matched to registered students (nothing is saved). */
export async function uploadAnnouncementAudience(req, res) {
  res.json(await matchAudienceUpload(req.file, req.user));
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
  const { skipped, ...audience } = await audienceFromBody(body, req.user, { existing: before });
  Object.assign(updates, audience);

  const announcement = await Announcement.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!announcement) throw new HttpError(404, 'Announcement not found');

  const changes = {};
  Object.keys(updates).filter((k) => k !== 'studentIds' && k !== 'audience').forEach((k) => {
    const from = before?.[k] ?? null;
    const to = announcement?.[k] ?? null;
    if (String(from) !== String(to)) changes[k] = { from, to };
  });
  if (updates.audience && audienceText(before) !== audienceText(announcement)) changes.audience = { from: audienceText(before), to: audienceText(announcement) };

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
  res.json({ announcement: announcementForAdmin(announcement), skippedStudents: skipped || 0 });
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
  // Announcements for everyone, plus those this student was chosen for. Who else was chosen is
  // never sent to students.
  const audience = [{ audience: { $ne: 'selected' } }];
  if (req.user?._id && mongoose.isValidObjectId(String(req.user._id))) audience.push({ studentIds: new mongoose.Types.ObjectId(String(req.user._id)) });
  const announcements = await Announcement.find({
    status: 'active',
    $and: [
      { $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gte: startOfToday } }] },
      { $or: audience },
    ],
  }).select('-studentIds -audience').lean();

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
