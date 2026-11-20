import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { collectMocks, groupMocks, nextChangeAt } from './prepMockModel';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const STALE_AFTER = 60 * 1000;

/**
 * Prep Mock data: companies -> roles -> mocks, plus the student's report rows (for "View result").
 * `disabled` is true when the server answers 403 (Prep Mock not turned on for this student).
 * Refreshes by itself when an upcoming mock opens or a scheduled one closes, and when the tab comes
 * back into view after a minute or more (e.g. after finishing a mock in the same tab).
 */
export function usePrepMocks() {
  const [state, setState] = useState({ loading: true, error: '', disabled: false, data: null });
  const [reloadKey, setReloadKey] = useState(0);
  const loadedAt = useRef(0);
  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let active = true;
    // A refresh keeps what is on screen; only the first load shows skeletons.
    setState((current) => ({ ...current, loading: !current.data, error: '' }));
    api.getStudentPrepMocks()
      .then((data) => {
        if (!active) return;
        loadedAt.current = Date.now();
        setState({ loading: false, error: '', disabled: false, data: data || {} });
      })
      .catch((error) => {
        if (!active) return;
        const status = error?.response?.status;
        setState((current) => ({
          loading: false,
          data: status === 403 ? null : current.data,
          disabled: status === 403,
          error: status === 403 ? '' : (error?.message || 'Could not load your mocks.'),
        }));
      });
    return () => { active = false; };
  }, [reloadKey]);

  const mocks = useMemo(() => collectMocks(state.data), [state.data]);
  const companies = useMemo(() => groupMocks(mocks), [mocks]);
  const reports = useMemo(() => {
    const byId = new Map();
    for (const report of Array.isArray(state.data?.reports) ? state.data.reports : []) {
      const id = String(report?.assessmentId ?? '');
      if (id && !byId.has(id)) byId.set(id, report);
    }
    return byId;
  }, [state.data]);

  useEffect(() => {
    const at = nextChangeAt(mocks, Date.now());
    if (!at) return undefined;
    const delay = at - Date.now() + 1500;
    if (delay > SIX_HOURS) return undefined;
    const timer = setTimeout(refresh, Math.max(1000, delay));
    return () => clearTimeout(timer);
  }, [mocks, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && loadedAt.current && Date.now() - loadedAt.current > STALE_AFTER) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { ...state, mocks, companies, reports, refresh };
}
