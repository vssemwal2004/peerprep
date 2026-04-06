import Notification from '../models/Notification.js';
import { getIo } from '../utils/io.js';

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
