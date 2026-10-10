import { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import socketService from '../../utils/socket';

const initialSection = () => ({ data: null, loading: true, error: false });
const unwrap = (value, key) => Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];

export default function useStudentDashboardData({ userId, canQuestions, canLearning, canEvents, canAssessments }) {
  const [sections, setSections] = useState(() => ({ dashboard: initialSection(), engagement: initialSection(), events: initialSection(), assessments: initialSection(), announcements: initialSection() }));
  const [revision, setRevision] = useState(0);
  const refreshedAt = useRef(0);
  const previousUser = useRef(userId);
  const challengePoints = useRef(null);

  useEffect(() => {
    let alive = true;
    const requests = new Map();
    const load = async (key, request, normalize = (value) => value) => {
      if (requests.has(key)) return requests.get(key);
      const pending = Promise.resolve().then(request).then((value) => {
        if (alive) setSections((previous) => ({ ...previous, [key]: { data: normalize(value), loading: false, error: false } }));
      }).catch(() => {
        if (alive) setSections((previous) => ({ ...previous, [key]: { ...previous[key], loading: false, error: true } }));
      }).finally(() => requests.delete(key));
      requests.set(key, pending);
      return pending;
    };
    const loadDashboard = () => load('dashboard', () => api.getStudentDashboard(true));
    let nextChallengeReset = Infinity;
    const loadEngagement = () => load('engagement', async () => {
      const value = canQuestions || canLearning ? await api.refreshStudentEngagement() : { periods: [], badges: [], lifetime: { points: 0, badges: 0 } };
      nextChallengeReset = Math.min(...[value.daily?.endsAt, ...(value.periods || []).map((period) => period.endsAt)].filter(Boolean).map((date) => new Date(date).getTime()).filter(Number.isFinite));
      if (alive && value.lifetime?.points > 0 && (value.lifetime.points !== challengePoints.current || value.newAwards?.length)) {
        // Wait out a potentially older in-flight snapshot, then reload verified rank and level.
        await (requests.get('dashboard') || Promise.resolve());
        if (alive) await loadDashboard();
      }
      if (alive) challengePoints.current = value.lifetime?.points || 0;
      return value;
    });
    const loadAnnouncements = () => load('announcements', () => api.listStudentAnnouncements(), (data) => unwrap(data, 'announcements'));
    const loadAll = () => {
      refreshedAt.current = Date.now();
      return Promise.allSettled([
        loadDashboard(), loadEngagement(), loadAnnouncements(),
        load('events', () => canEvents ? api.listEvents() : [], (data) => unwrap(data, 'events')),
        load('assessments', () => canAssessments ? api.listStudentAssessments() : [], (data) => unwrap(data, 'assessments')),
      ]);
    };
    const differentUser = previousUser.current !== userId;
    previousUser.current = userId;
    if (differentUser) challengePoints.current = null;
    setSections((previous) => differentUser
      ? { dashboard: initialSection(), engagement: initialSection(), events: initialSection(), assessments: initialSection(), announcements: initialSection() }
      : Object.fromEntries(Object.entries(previous).map(([key, section]) => [key, { ...section, loading: section.data === null }])));
    void loadAll();
    socketService.connect();
    const updates = [
      ['announcement_update', loadAnnouncements],
      ['compiler-submission-updated', () => Promise.allSettled([loadDashboard(), loadEngagement()])],
      ['learning-updated', () => Promise.allSettled([loadDashboard(), loadEngagement()])],
      ['new_notification', (notification) => { if (notification?.type === 'STREAK') void Promise.allSettled([loadDashboard(), loadEngagement()]); }],
    ];
    updates.forEach(([event, handler]) => socketService.on(event, handler));
    const onFocus = () => { if (Date.now() - refreshedAt.current > 30000) void loadAll(); };
    window.addEventListener('focus', onFocus);
    const rollover = setInterval(() => { if (Date.now() >= nextChallengeReset) { nextChallengeReset = Infinity; void loadAll(); } }, 60000);
    return () => {
      alive = false;
      updates.forEach(([event, handler]) => socketService.off(event, handler));
      window.removeEventListener('focus', onFocus);
      clearInterval(rollover);
    };
  }, [userId, canQuestions, canLearning, canEvents, canAssessments, revision]);

  return { ...sections, refresh: () => setRevision((value) => value + 1) };
}
