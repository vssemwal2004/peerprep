import { useEffect, useRef, useState } from "react";
import { api } from "../../utils/api";
import { useUniversityPolicy } from "../../platform/UniversityPolicyContext";
import { scopeEngagement } from "../engagement/scopeEngagement";
import { computeAwards } from "../profile/achievements";

const cache = { key: "", value: null, at: 0 };
const FRESH_MS = 60_000;

/**
 * The student's level and badges, from the same sources as the dashboard and profile: the
 * adaptive badges (with QuickPrep) or the classic awards from the ranking (with Rankings).
 * Returns { loading, level, awards: [all, earned first], earned, total, nextAward } or null.
 */
export function useBadges(access) {
  const { allowsModule: allowsNow, permissions } = useUniversityPolicy();
  // The policy hands out a new function on every render; follow the permissions' value instead.
  const allowsRef = useRef(allowsNow);
  allowsRef.current = allowsNow;
  const permissionsKey = JSON.stringify(permissions || null);
  const source = access?.quickprep ? "engagement" : access?.rankings ? "ranking" : "";
  const [state, setState] = useState(() => (cache.key === source && cache.value ? { loading: false, data: cache.value } : { loading: Boolean(source), data: null }));

  useEffect(() => {
    if (!source) { setState({ loading: false, data: null }); return undefined; }
    if (cache.key === source && cache.value && Date.now() - cache.at < FRESH_MS) { setState({ loading: false, data: cache.value }); return undefined; }
    let alive = true;
    const request = source === "engagement" ? api.refreshStudentEngagement() : api.getStudentRanking(false);
    request.then((result) => {
      let value = null;
      if (source === "engagement") {
        const engagement = scopeEngagement(result, (name) => allowsRef.current(name));
        if (engagement?.version === 2 && Array.isArray(engagement.awards?.awards)) {
          const awards = engagement.awards.awards;
          value = { level: engagement.level || null, awards, nextAward: engagement.awards.nextAward || null };
        }
      }
      const ranking = source === "ranking" ? result?.ranking : null;
      if (!value && ranking?.badgeMetrics) {
        const { awards, nextAward } = computeAwards(ranking.badgeMetrics);
        value = { level: ranking.level || null, awards, nextAward };
      }
      if (value) {
        const earned = value.awards.filter((award) => award.earned).sort((left, right) => new Date(right.earnedAt || 0) - new Date(left.earnedAt || 0));
        const locked = value.awards.filter((award) => !award.earned).sort((left, right) => (right.progress || 0) - (left.progress || 0));
        value = { ...value, earned, locked, total: value.awards.length };
      }
      Object.assign(cache, { key: source, value, at: Date.now() });
      if (alive) setState({ loading: false, data: value });
    }).catch(() => { if (alive) setState({ loading: false, data: null }); });
    return () => { alive = false; };
  }, [source, permissionsKey]);

  return state;
}
