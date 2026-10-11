import { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { useUniversityPolicy } from '../../platform/UniversityPolicyContext';
import { scopeEngagement } from '../engagement/scopeEngagement';

const REFRESH_AFTER_MS = 60000;

// Verified challenge activity uses the IST coding day (rolls over at 2 AM); the older activity log uses UTC days.
export const istDayKey = (date = new Date()) => new Date(date.getTime() + 3.5 * 3600000).toISOString().slice(0, 10);
export const utcDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/**
 * Practice history for the calendar. Prefers verified completions and daily plans from the
 * challenge engine; falls back to the general activity log when that is unavailable. Also loads
 * today's daily problem. Refreshes when the tab regains focus after a minute.
 */
export default function usePracticeCalendar() {
  const { allowsModule } = useUniversityPolicy();
  const allowsRef = useRef(allowsModule);
  allowsRef.current = allowsModule;
  const [state, setState] = useState({ loading: true, verified: false, activity: {}, breakdown: {}, plans: {}, todayPlan: null, daily: null, error: false });

  useEffect(() => {
    let alive = true;
    let loadedAt = 0;
    const load = async () => {
      loadedAt = Date.now();
      const [engagement, daily] = await Promise.allSettled([api.refreshStudentEngagement(), api.getDailyCodingChallenge()]);
      const next = { loading: false, verified: false, activity: {}, breakdown: {}, plans: {}, todayPlan: null, daily: daily.status === 'fulfilled' ? daily.value : null, error: false };
      if (engagement.status === 'fulfilled' && engagement.value?.version === 2) {
        const scoped = scopeEngagement(engagement.value, allowsRef.current);
        next.verified = true;
        next.activity = scoped.activity?.activityByDate || {};
        next.breakdown = scoped.activity?.breakdownByDate || {};
        next.plans = Object.fromEntries((scoped.month?.dailyPlans || []).map((plan) => [plan.dayKey, Boolean(plan.completed)]));
        next.todayPlan = scoped.daily || null;
      } else {
        try {
          next.activity = (await api.getStudentActivity())?.activityByDate || {};
        } catch {
          next.error = true;
        }
      }
      if (alive) setState(next);
    };
    load();
    const onFocus = () => { if (Date.now() - loadedAt > REFRESH_AFTER_MS) load(); };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; window.removeEventListener('focus', onFocus); };
  }, []);

  return state;
}
