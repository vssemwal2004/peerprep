import { createHash } from 'node:crypto';
import Notification from '../models/Notification.js';
import { getIo } from '../utils/io.js';

/**
 * Create a notification exactly once per user and dedupe key, even under concurrent callers.
 * The _id is derived from the key, so the database enforces idempotency; only the call that
 * actually inserts pushes the realtime event. Resolves true when a notification was created.
 */
export async function notifyOnce({ userId, dedupeKey, title, message, type, actionUrl, referenceId, now = new Date() }) {
  if (!userId || !dedupeKey) return false;
  const _id = createHash('sha256').update(`${userId}:${dedupeKey}`).digest('hex').slice(0, 24);
  const fields = { userId, title, message, type, actionUrl, referenceId, dedupeKey, isRead: false, createdAt: now, updatedAt: now };
  try {
    const result = await Notification.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true, timestamps: false });
    if (!result.upsertedCount) return false;
    getIo()?.to(String(userId)).emit('new_notification', { _id, ...fields });
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

export async function createNotification({
  userId,
  title,
  message,
  type,
  referenceId,
  actionUrl,
  dedupeKey
}) {
  if (!userId) return null;

  if (dedupeKey) {
    const existing = await Notification.findOne({ userId, dedupeKey }).lean();
    if (existing) return existing;
  }

  const notification = await Notification.create({
    userId,
    title,
    message,
    type,
    referenceId,
    actionUrl,
    dedupeKey,
    isRead: false
  });

  const io = getIo();
  if (io) {
    io.to(String(userId)).emit('new_notification', notification.toObject());
  }

  return notification;
}

export async function createNotifications(notifications = []) {
  const filtered = notifications.filter(n => n && n.userId);
  if (!filtered.length) return [];

  const withDedupe = filtered.filter(n => n.dedupeKey);
  const noDedupe = filtered.filter(n => !n.dedupeKey);

  const existingMap = new Set();
  if (withDedupe.length) {
    const dedupeKeys = [...new Set(withDedupe.map(n => n.dedupeKey))];
    const userIds = [...new Set(withDedupe.map(n => String(n.userId)))];
    const existing = await Notification.find({
      userId: { $in: userIds },
      dedupeKey: { $in: dedupeKeys }
    }).select('userId dedupeKey').lean();
    existing.forEach(e => existingMap.add(`${e.userId}:${e.dedupeKey}`));
  }

  const toCreate = [
    ...noDedupe,
    ...withDedupe.filter(n => !existingMap.has(`${n.userId}:${n.dedupeKey}`))
  ];

  if (!toCreate.length) return [];

  const created = await Notification.insertMany(
    toCreate.map(n => ({
      userId: n.userId,
      title: n.title,
      message: n.message,
      type: n.type,
      referenceId: n.referenceId,
      actionUrl: n.actionUrl,
      dedupeKey: n.dedupeKey,
      isRead: false
    }))
  );

  const io = getIo();
  if (io) {
    created.forEach(notif => {
      io.to(String(notif.userId)).emit('new_notification', notif.toObject());
    });
  }

  return created;
}
