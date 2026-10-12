import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';

/** Published quests with this student's progress. Refreshes when the tab regains focus. */
export default function useQuests({ enabled = true } = {}) {
  const [state, setState] = useState({ quests: [], loading: enabled, error: '' });
  const loadRef = useRef(() => {});
  useEffect(() => {
    if (!enabled) { setState({ quests: [], loading: false, error: '' }); return undefined; }
    let active = true;
    const load = async () => {
      setState((previous) => ({ ...previous, loading: true, error: '' }));
      try {
        const result = await api.listQuests();
        if (active) setState({ quests: result?.quests || [], loading: false, error: '' });
      } catch (error) {
        if (active) setState((previous) => ({ ...previous, loading: false, error: error?.message || 'Quests could not load.' }));
      }
    };
    loadRef.current = load;
    void load();
    const onFocus = () => { if (document.visibilityState !== 'hidden') void load(); };
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener('focus', onFocus); };
  }, [enabled]);
  const reload = useCallback(() => loadRef.current(), []);
  return { ...state, reload };
}
