import Notification from '../models/Notification.js';
import { HttpError } from '../utils/errors.js';

export async function listNotifications(req, res) {
  const userId = req.user?._id;
  if (!userId) throw new HttpError(401, 'Unauthorized');
  const notifications = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const unreadCount = notifications.filter(n => !n.isRead).length;
  res.json({ notifications, unreadCount });
}

export async function markNotificationRead(req, res) {
  const userId = req.user?._id;
  if (!userId) throw new HttpError(401, 'Unauthorized');
  const { id } = req.params;
  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true },
    { new: true }
  );
  if (!notification) throw new HttpError(404, 'Notification not found');
  res.json({ notification });
}

export async function markAllRead(req, res) {
  const userId = req.user?._id;
  if (!userId) throw new HttpError(401, 'Unauthorized');
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  res.json({ message: 'All notifications marked as read' });
}

export async function clearAllNotifications(req, res) {
  const userId = req.user?._id;
  if (!userId) throw new HttpError(401, 'Unauthorized');
  await Notification.deleteMany({ userId });
  res.json({ message: 'All notifications cleared' });
}
