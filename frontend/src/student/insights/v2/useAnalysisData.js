// Data for the Prep Analysis v2 pages beyond the insights answer: Prep Score history (for the
// period), the coin wallet with earning amounts, and the readiness summary. Answers are cached for
// a minute so moving between tabs (which remounts the page) opens at once.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";
import { READINESS_EVENT } from "../../readiness/readinessModel";
import { scoreRangeFor } from "../analysisModel";
import { PREP_COIN_CHANGED } from "../../prepCoin/prepCoinEvents";

const FRESH_MS = 60_000;
const cache = new Map();

function useCached(key, fetcher, enabled, { reloadOn = null } = {}) {
  const cached = enabled ? cache.get(key) : null;
  const [state, setState] = useState(() => ({ data: cached?.data || null, loading: Boolean(enabled && !cached), error: null }));
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const load = useCallback(({ quiet = false } = {}) => {
    if (!enabled) return;
    const id = ++seq.current;
    if (!quiet) setState((current) => ({ ...current, loading: !current.data, error: null }));
    fetchRef.current()
      .then((data) => { cache.set(key, { data, at: Date.now() }); if (id === seq.current) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (id === seq.current) setState((current) => ({ ...current, loading: false, error })); });
  }, [enabled, key]);
  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null }); return; }
    const hit = cache.get(key);
    if (hit) { setState({ data: hit.data, loading: false, error: null }); if (Date.now() - hit.at > FRESH_MS) load({ quiet: true }); } else load();
  }, [enabled, key, load]);
  useEffect(() => {
    if (!enabled || !reloadOn) return undefined;
    const handler = () => load({ quiet: true });
    window.addEventListener(reloadOn, handler);
    return () => window.removeEventListener(reloadOn, handler);
  }, [enabled, load, reloadOn]);
  return { ...state, reload: load };
}

/** Prep Score history for the analysis period: { data: history, loading, error, reload }. */
export function usePrepScore(range, enabled) {
  const { user } = useAuth();
  const { range: scoreRange, from } = scoreRangeFor(range);
  const key = `score|${user?._id || user?.id || ""}|${scoreRange}|${from}`;
  const result = useCached(key, () => api.getPrepScoreHistory(scoreRange, from).then((payload) => payload?.history || null), enabled);
  return result;
}

/** The wallet (balance + movements) and the live earning amounts. */
export function useWallet(enabled) {
  const { user } = useAuth();
  const key = `wallet|${user?._id || user?.id || ""}`;
  return useCached(key, async () => {
    const [wallet, pricing] = await Promise.all([api.wallet(), api.walletPricing().catch(() => null)]);
    return { balance: Number(wallet?.balance) || 0, movements: wallet?.movements || [], earning: pricing?.earning || null };
  }, enabled, { reloadOn: PREP_COIN_CHANGED });
}

/** Readiness summary (Service-Based / Product-Based) with its 30-day trend. Reloads after a solve. */
export function useReadinessSummary(enabled) {
  const { user } = useAuth();
  const key = `readiness|${user?._id || user?.id || ""}`;
  return useCached(key, () => api.getPrepReadinessSummary(), enabled, { reloadOn: READINESS_EVENT });
}
