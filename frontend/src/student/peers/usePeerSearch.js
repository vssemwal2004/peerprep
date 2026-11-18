import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { errorMessage } from './peerNetwork';

export const PEER_SEARCH_MIN_CHARS = 2;
export const PEER_SEARCH_DEBOUNCE_MS = 250;

/** Debounced same-university classmate search; superseded requests are cancelled. */
export function usePeerSearch(query, { enabled = true } = {}) {
  const [state, setState] = useState({ results: [], loading: false, error: '' });
  const term = String(query || '').trim();

  useEffect(() => {
    if (!enabled || term.length < PEER_SEARCH_MIN_CHARS) {
      setState({ results: [], loading: false, error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    const timer = setTimeout(() => {
      api.searchPeers(term, controller.signal)
        .then((data) => setState({ results: Array.isArray(data?.results) ? data.results : [], loading: false, error: '' }))
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          setState({ results: [], loading: false, error: errorMessage(error, 'Search is unavailable right now.') });
        });
    }, PEER_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, term]);

  const patch = useCallback((peerId, relation) => {
    setState((prev) => ({ ...prev, results: prev.results.map((item) => (item.id === peerId ? { ...item, relation } : item)) }));
  }, []);

  return { ...state, patch };
}
