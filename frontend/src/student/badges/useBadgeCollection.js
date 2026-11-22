import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { BADGE_LEVEL_EARNED } from '../rewards/rewardEvents';
import { fromAward, fromLifetimeTracks, fromMonthly, orderBadges } from './badgeModel';

/**
 * Every badge the student can see, in one list: achievements (passed in, already loaded by the
 * page), lifetime milestones and monthly badges (loaded here when `milestones` is on).
 * Returns { items, earned, locked, total, loading }; refreshes when a badge is earned.
 */
export function useBadgeCollection({ awards = [], milestones = false } = {}) {
  const [extra, setExtra] = useState({ loading: milestones, lifetime: [], monthly: null });
  const timer = useRef(null);

  const load = useCallback(() => {
    if (!milestones) { setExtra({ loading: false, lifetime: [], monthly: null }); return; }
    Promise.allSettled([api.lifetimeBadges(), api.monthlyBadges()]).then(([lifetime, monthly]) => {
      setExtra({
        loading: false,
        lifetime: lifetime.status === 'fulfilled' ? lifetime.value?.tracks || [] : [],
        monthly: monthly.status === 'fulfilled' ? monthly.value || null : null,
      });
    });
  }, [milestones]);

  useEffect(() => {
    load();
    if (!milestones) return undefined;
    const refresh = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 900); };
    window.addEventListener(BADGE_LEVEL_EARNED, refresh);
    return () => { clearTimeout(timer.current); window.removeEventListener(BADGE_LEVEL_EARNED, refresh); };
  }, [load, milestones]);

  return useMemo(() => {
    const items = [
      ...(awards || []).map(fromAward),
      ...fromLifetimeTracks(extra.lifetime),
      ...fromMonthly(extra.monthly),
    ];
    const { earned, locked } = orderBadges(items);
    return { items, earned, locked, total: items.length, loading: extra.loading };
  }, [awards, extra]);
}
