import Announcement from '../models/Announcement.js';
import { HttpError } from '../utils/errors.js';
import { getIo } from '../utils/io.js';

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

function emitAnnouncementUpdate() {
  const io = getIo();
  if (io) {
    io.emit('announcement_update');
  }
}

export async function createAnnouncement(req, res) {
  const { title, message, type, status, priority, expiryDate } = req.body || {};
  if (!title || !message) throw new HttpError(400, 'Title and message are required');

  const announcement = await Announcement.create({
    title: String(title).trim(),
    message: String(message).trim(),
    type: type || 'motivation',
    status: status || 'inactive',
    priority: priority || 'normal',
    createdBy: req.user?._id,
    expiryDate: expiryDate ? new Date(expiryDate) : undefined
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

  const updates = {};
  const fields = ['title', 'message', 'type', 'status', 'priority', 'expiryDate'];
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      updates[field] = req.body[field];
    }
  });

  if (Object.prototype.hasOwnProperty.call(updates, 'title')) {
    updates.title = String(updates.title).trim();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'message')) {
    updates.message = String(updates.message).trim();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'expiryDate')) {
    updates.expiryDate = updates.expiryDate ? new Date(updates.expiryDate) : null;
  }

  const announcement = await Announcement.findByIdAndUpdate(id, updates, { new: true });
  if (!announcement) throw new HttpError(404, 'Announcement not found');

  emitAnnouncementUpdate();
  res.json({ announcement });
}

export async function deleteAnnouncement(req, res) {
  const { id } = req.params;
  if (!id) throw new HttpError(400, 'Announcement ID is required');

  const announcement = await Announcement.findByIdAndDelete(id);
  if (!announcement) throw new HttpError(404, 'Announcement not found');

  emitAnnouncementUpdate();
  res.json({ message: 'Announcement deleted' });
}

export async function listAnnouncementsStudent(req, res) {
  const now = new Date();
  const announcements = await Announcement.find({
    status: 'active',
    $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gte: now } }]
  }).lean();

  const sorted = announcements.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json({ announcements: sorted });
}
