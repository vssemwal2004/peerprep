import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUniversityPolicy } from '../../platform/UniversityPolicyContext';
import { api } from '../../utils/api';
import socket from '../../utils/socket';
import { scopeEngagement } from './scopeEngagement';

export default function useChallengeHub({ includeRanking = true } = {}) {
  const { user } = useAuth();
  const { allowsModule } = useUniversityPolicy();
  const accessKey = ['questions', 'learning', 'assessments', 'interviews', 'events'].filter(allowsModule).join(',');
  const [section, setSection] = useState({ data: null, loading: true, error: '' });
  const [ranking, setRanking] = useState(null);
  const [rankingError, setRankingError] = useState(false);
  const refreshRef = useRef(() => {});
  const studentId = user?._id || user?.id;
  useEffect(() => {
    let active = true, busy = false;
    setSection({ data: null, loading: Boolean(accessKey), error: '' });
    setRanking(null); setRankingError(false);
    const refresh = async () => {
      if (!active || busy || !accessKey || !studentId) return;
      busy = true;
      setSection(previous => ({ ...previous, loading: true, error: '' }));
      try {
        const data = await api.refreshStudentEngagement();
        if (data?.version !== 2) throw new Error('The challenge service needs an update. Restart the latest backend and retry.');
        if (!active) return;
        setSection({ data, loading: false, error: '' });
        // Rewards settle first; the following rank read must bypass the browser cache.
        if (includeRanking) try {
          const result = await api.getStudentRanking(true);
          if (active) { setRanking(result?.ranking || null); setRankingError(false); }
        } catch { if (active) { setRanking(null); setRankingError(true); } }
      } catch (error) {
        if (active) setSection(previous => ({ ...previous, loading: false, error: error?.response?.status === 404
          ? 'The challenge API is unavailable. Restart the latest backend, then retry.'
          : error?.message || 'Challenges could not load. Please retry.' }));
      } finally { busy = false; }
    };
    refreshRef.current = refresh;
    void refresh();
    const onFocus = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    let refreshTimer;
    const onProgress = event => {
      if (event?.userId && String(event.userId) !== String(studentId)) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(onFocus, 2000);
    };
    const events = ['learning-updated', 'compiler-submission-updated'];
    events.forEach(name => socket.on(name, onProgress));
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(onFocus, 60000);
    return () => {
      active = false; clearInterval(timer); clearTimeout(refreshTimer);
      events.forEach(name => socket.off(name, onProgress));
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [studentId, accessKey, includeRanking]);
  const data = useMemo(() => scopeEngagement(section.data, allowsModule), [section.data, allowsModule]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { section: { ...section, data }, ranking, rankingError, refresh, hasAccess: Boolean(accessKey) };
}
