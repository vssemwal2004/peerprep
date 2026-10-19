import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';

/** The platform overview (universities, defaults, recent activity) with a reload for after changes. */
export function useUniversities() {
  const [state, setState] = useState({ overview: null, loading: true, error: '' });
  const reload = useCallback(async () => {
    try {
      const overview = await api.platformOverview();
      setState({ overview, loading: false, error: '' });
      return overview;
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: error.message || 'Universities could not be loaded.' }));
      return null;
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return {
    ...state,
    universities: state.overview?.universities || [],
    defaults: state.overview?.defaults || null,
    reload,
  };
}

/** Runs one change with a shared busy flag and a plain-language result message. */
export function useAction(onDone) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const run = useCallback(async (key, work, success) => {
    setBusy(key); setMessage(null);
    try {
      const result = await work();
      if (success) setMessage({ tone: 'success', text: success });
      await onDone?.(result);
      return result;
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message || 'That change could not be saved.' });
      return undefined;
    } finally { setBusy(''); }
  }, [onDone]);
  return { busy, message, setMessage, run };
}
