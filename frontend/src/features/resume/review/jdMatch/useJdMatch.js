// ANVI JD Match on the review page: price check → charge → live stages → report.
// The server does every check (feature, budget, daily limit, coins); this hook only follows it.
// The run state lives here, not in the popup: closing the popup never loses a running check.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../../utils/api';
import { announcePrepCoinChange } from '../../../../student/prepCoin/prepCoinEvents';
import { JD_MATCH_FEATURE_KEY, describeStartError, jdKey } from './jdMatchModel';

export { JD_MATCH_FEATURE_KEY, JD_MIN_CHARS, JD_MAX_CHARS, describeStartError, jdKey } from './jdMatchModel';
const POLL_MS = 1200;
const MAX_POLL_MS = 6 * 60_000;
const SCORES_KEY = (userId) => `prep-resume-jd-scores:v1:${userId || 'me'}`;
// The report open in this tab, so "Fix in builder" → back brings it straight back.
const OPEN_KEY = (userId) => `prep-resume-jd-open:v1:${userId || 'me'}`;

function readScores(userId) {
  try { return JSON.parse(window.localStorage.getItem(SCORES_KEY(userId)) || '{}') || {}; } catch { return {}; }
}
function writeScore(userId, key, score) {
  try {
    const scores = readScores(userId);
    scores[key] = { score, at: Date.now() };
    const recent = Object.entries(scores).sort((a, b) => b[1].at - a[1].at).slice(0, 30);
    window.localStorage.setItem(SCORES_KEY(userId), JSON.stringify(Object.fromEntries(recent)));
  } catch { /* scores are a convenience only */ }
}
const remember = (userId, id) => { try { if (id) window.sessionStorage.setItem(OPEN_KEY(userId), id); else window.sessionStorage.removeItem(OPEN_KEY(userId)); } catch { /* optional */ } };
const remembered = (userId) => { try { return window.sessionStorage.getItem(OPEN_KEY(userId)); } catch { return null; } };

export function useJdMatch({ enabled, userId }) {
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState(null);
  // popup: null | { phase: 'quote'|'charging'|'running'|'done'|'failed'|'blocked', hidden, quote, charge, stage, error, cached, refunded, joined }
  const [popup, setPopup] = useState(null);
  const [match, setMatch] = useState(null);
  const [opening, setOpening] = useState(false);
  const [previousScore, setPreviousScore] = useState(null);
  const lastRequest = useRef(null);
  // The running check was started earlier (another tab, or before a refresh): not a new attempt.
  const joinedRun = useRef(false);
  const pollRef = useRef(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; clearTimeout(pollRef.current); }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    try {
      const [data, pricing] = await Promise.all([api.jdMatchOverview(), api.walletPricing().catch(() => null)]);
      const quote = pricing?.features?.find((feature) => feature.featureKey === JD_MATCH_FEATURE_KEY) || null;
      const next = { ...data, price: quote ? quote.price : null, cost: quote ? quote.cost : null, freeLeft: quote?.freeLeft || 0, balance: quote?.balance ?? null };
      if (live.current) { setOverview(next); setOverviewError(null); }
      return next;
    } catch (error) {
      if (live.current) setOverviewError({ status: error?.response?.status || 0, message: error?.message || 'Could not load ANVI JD Match.' });
      return null;
    }
  }, [enabled]);

  const finish = useCallback((result, { cached = false, joined = false } = {}) => {
    setMatch(result);
    remember(userId, result?.status === 'done' ? result.id : null);
    // A cached repeat or a joined earlier check is not a new attempt at this job description.
    if (result?.status === 'done' && lastRequest.current && !cached && !joined) {
      const key = jdKey(lastRequest.current.jobDescription);
      const before = readScores(userId)[key];
      setPreviousScore(before && typeof before.score === 'number' ? before.score : null);
      writeScore(userId, key, result.score);
    } else setPreviousScore(null);
    refresh();
  }, [refresh, userId]);

  const poll = useCallback((id, startedAt = Date.now(), delay = POLL_MS) => {
    clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const { match: next } = await api.getJdMatch(id);
        if (!live.current) return;
        if (next.status === 'done') {
          // Show the popup again (if it was closed) so the student sees the report is ready.
          setPopup((state) => ({ ...(state || {}), phase: 'done', stage: 'done', hidden: false }));
          finish(next, { joined: joinedRun.current });
          return;
        }
        if (next.status === 'failed') {
          if (next.refunded || next.cost) announcePrepCoinChange();
          setPopup((state) => ({ ...(state || {}), phase: 'failed', stage: 'failed', hidden: false, refunded: next.refunded, error: next.error }));
          refresh();
          return;
        }
        setPopup((state) => state && { ...state, stage: next.stage });
        poll(id, startedAt);
      } catch (error) {
        if (!live.current) return;
        const status = error?.response?.status || 0;
        // The check keeps running on the server: keep following it (slower when busy), for a while.
        if ((status === 0 || status === 429 || status >= 500) && Date.now() - startedAt < MAX_POLL_MS) {
          poll(id, startedAt, Math.min(8000, delay * 1.6));
          return;
        }
        setPopup((state) => ({ ...(state || {}), phase: 'lost', hidden: false, error: { message: 'We lost track of this check. It will appear in "Earlier ANVI checks" when it finishes; if it fails, your Prep Coins come back automatically.' } }));
      }
    }, delay);
  }, [finish, refresh]);

  /** Sends the charge and starts the check (after the student confirmed, or for a free check). */
  const charge = useCallback(async (request, quote) => {
    setPopup({ phase: 'charging', quote, stage: 'queued' });
    try {
      const result = await api.startJdMatch(request, quote.cost);
      if (!live.current) return;
      if (result.cached) {
        setPopup({ phase: 'done', quote, cached: true, stage: 'done' });
        finish(result.match, { cached: true });
        return;
      }
      if (result.charge?.cost) announcePrepCoinChange();
      const next = result.match;
      if (next.status === 'done') {
        setPopup({ phase: 'done', quote, charge: result.charge, stage: 'done', joined: Boolean(result.joined) });
        finish(next, { joined: Boolean(result.joined) });
        return;
      }
      joinedRun.current = Boolean(result.joined);
      setPopup({ phase: 'running', quote, charge: result.charge, joined: Boolean(result.joined), stage: next.stage || 'queued' });
      poll(next.id);
    } catch (error) {
      if (!live.current) return;
      setPopup({ phase: 'blocked', quote, error: describeStartError(error) });
    }
  }, [finish, poll]);

  /**
   * Start a paid check. `shownCost` is the price on the button: if the server's price differs the
   * student is asked again, never charged a price they did not see.
   */
  const start = useCallback(async (request, shownCost = null) => {
    lastRequest.current = request;
    joinedRun.current = false;
    setPopup({ phase: 'quote', stage: 'queued' });
    let quote = null;
    try {
      const { features = [] } = await api.walletPricing();
      quote = features.find((feature) => feature.featureKey === JD_MATCH_FEATURE_KEY) || null;
    } catch { quote = null; }
    if (!live.current) return;
    if (!quote) { setPopup({ phase: 'blocked', error: { kind: 'error', message: 'The price of this check could not be loaded. Nothing was charged. Try again.' } }); return; }
    if (shownCost !== null && quote.cost !== shownCost) {
      setPopup({ phase: 'blocked', quote, error: { kind: 'price', cost: quote.cost, balance: quote.balance } });
      refresh();
      return;
    }
    if (quote.cost > quote.balance) {
      setPopup({ phase: 'blocked', quote, error: { kind: 'shortfall', required: quote.cost, balance: quote.balance } });
      return;
    }
    // A paid check waits for the student's "Confirm & pay" (confirm() below); a free one starts now.
    if (quote.cost > 0) { setPopup({ phase: 'confirm', quote, stage: 'queued' }); return; }
    await charge(request, quote);
  }, [charge, refresh]);

  /** The student pressed "Confirm & pay" in the popup. */
  const confirm = useCallback(() => {
    if (popup?.phase !== 'confirm' || !lastRequest.current) return;
    charge(lastRequest.current, popup.quote);
  }, [popup, charge]);

  const retry = useCallback(() => {
    if (lastRequest.current) start(lastRequest.current, overview?.cost ?? null);
  }, [start, overview?.cost]);

  /** Closing never cancels: a running check keeps going and the popup comes back when it ends. */
  const closePopup = useCallback(() => setPopup((state) => {
    // Closing the confirmation is "Cancel": nothing was charged.
    if (state?.phase === 'confirm') return null;
    if (!state || ['quote', 'charging'].includes(state.phase)) return state;
    return state.phase === 'running' ? { ...state, hidden: true } : null;
  }), []);
  const showPopup = useCallback(() => setPopup((state) => state && { ...state, hidden: false }), []);

  /** Open an earlier report from the history list (free). */
  const openReport = useCallback(async (id) => {
    setOpening(true);
    try {
      const { match: next } = await api.getJdMatch(id);
      if (live.current) { setPreviousScore(null); setMatch(next); remember(userId, next.status === 'done' ? next.id : null); }
    } catch (error) {
      if (live.current) setMatch({ status: 'failed', error: { message: error.message || 'This report could not be opened.' } });
    } finally { if (live.current) setOpening(false); }
  }, [userId]);

  const clearReport = useCallback(() => { setMatch(null); remember(userId, null); }, [userId]);

  /** A check left running (e.g. after a refresh) is picked up again, quietly. */
  const resume = useCallback((active) => {
    if (!active?.id) return;
    joinedRun.current = true;
    setPopup({ phase: 'running', stage: active.stage || 'queued', joined: true, hidden: true });
    poll(active.id);
  }, [poll]);

  // First load: price and history; pick up a running check; reopen the report open in this tab.
  const loaded = useRef(false);
  useEffect(() => {
    if (!enabled || loaded.current) return;
    loaded.current = true;
    refresh().then((data) => {
      if (!live.current) return;
      if (data?.active) resume(data.active);
      else if (remembered(userId)) openReport(remembered(userId));
    });
  }, [enabled, refresh, resume, openReport, userId]);

  return { overview, overviewError, popup, match, opening, previousScore, start, confirm, retry, closePopup, showPopup, openReport, resume, clearReport, refresh, lastRequest: lastRequest.current };
}
