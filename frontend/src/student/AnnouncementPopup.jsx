import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../utils/api';
import { useOptionalAuth } from '../context/AuthContext';
import AnnouncementDialog from '../components/announcements/AnnouncementDialog';
import { popupAllowedOn, popupQueue, readSeen, writeSeen } from './announcementPopupModel';

/**
 * Shows the announcements marked "show as popup" once after a student logs in, each in the
 * design and colour the admin chose. Several popups are one dialog with Previous / Next; closing
 * it marks all of them as seen.
 */
export default function AnnouncementPopup() {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const { pathname } = useLocation();
  const [queue, setQueue] = useState([]);
  const userId = user?.role === 'student' ? String(user._id || user.id || '') : '';
  const allowed = popupAllowedOn(pathname);

  useEffect(() => {
    if (!userId || !allowed) return undefined;
    let cancelled = false;
    api.listStudentAnnouncements()
      .then((data) => { if (!cancelled) setQueue(popupQueue(data?.announcements, readSeen(window.localStorage, userId))); })
      .catch(() => {});
    return () => { cancelled = true; };
    // Only once per student per page area: a fresh login or a full page load checks again.
  }, [userId, allowed]);

  const close = useCallback(() => {
    const seen = readSeen(window.localStorage, userId);
    queue.forEach((item) => seen.add(String(item._id)));
    writeSeen(window.localStorage, userId, seen);
    setQueue([]);
  }, [queue, userId]);

  if (!userId || !allowed || !queue.length) return null;
  return <AnnouncementDialog items={queue} onClose={close} />;
}
