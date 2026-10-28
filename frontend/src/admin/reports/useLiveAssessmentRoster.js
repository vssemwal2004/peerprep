import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import socketService from '../../utils/socket';
import { legacyReportRowToRoster, mergeRosterRows } from './rosterModel';

const HINT_DEBOUNCE_MS = 1500;
const SAFETY_RESYNC_MS = 60000;
const SUBSCRIBE_ACK_TIMEOUT_MS = 5000;
const HIGHLIGHT_MS = 4000;
const LEGACY_PAGE_LIMIT = 100;
const LEGACY_MAX_PAGES = 50;

const isNotFound = (err) => err?.response?.status === 404;
const isAbort = (err) => err?.name === 'AbortError';

/**
 * Live roster for one assessment report.
 *
 * Request discipline: at most one roster request is in flight; a refresh asked
 * for meanwhile is coalesced into a single follow-up. Socket hints carry no data,
 * they only schedule a debounced delta fetch (`since=cursor`). While the tab is
 * hidden nothing is fetched; becoming visible triggers one delta. The 60 s safety
 * resync runs only when the socket subscription is not live.
 *
 * If the roster endpoint is missing (404) the hook falls back to paging the
 * legacy reports endpoint and mapping its rows (no not-started students there).
 */
export default function useLiveAssessmentRoster(assessmentId, { fallbackAssessment = null } = {}) {
  const [rows, setRows] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [recentlyChanged, setRecentlyChanged] = useState(() => new Set());
  const [mode, setMode] = useState('roster');

  const rowsRef = useRef([]);
  const cursorRef = useRef(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(null);
  const controllerRef = useRef(null);
  const generationRef = useRef(0);
  const liveRef = useRef(false);
  const modeRef = useRef('roster');
  const hintTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const fallbackAssessmentRef = useRef(fallbackAssessment);
  const fetchRef = useRef(null);

  useEffect(() => { fallbackAssessmentRef.current = fallbackAssessment; }, [fallbackAssessment]);

  const markLive = useCallback((value) => {
    liveRef.current = value;
    setLive(value);
  }, []);

  const applyRows = useCallback((nextRows, changedKeys, { highlight }) => {
    rowsRef.current = nextRows;
    setRows(nextRows);
    setLastUpdatedAt(Date.now());
    if (highlight && changedKeys.length) {
      setRecentlyChanged(new Set(changedKeys));
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => setRecentlyChanged(new Set()), HIGHLIGHT_MS);
    }
  }, []);

  const loadLegacy = useCallback(async (id, signal) => {
    const collected = [];
    let total = Infinity;
    for (let page = 1; page <= LEGACY_MAX_PAGES && collected.length < total; page += 1) {
      const data = await api.getAssessmentReports({ assessmentId: id, page, limit: LEGACY_PAGE_LIMIT, sortKey: 'attemptDate', sortDir: 'desc' });
      if (signal.aborted) return null;
      const batch = Array.isArray(data?.students) ? data.students : Array.isArray(data?.reports) ? data.reports : [];
      total = Number(data?.pagination?.total ?? data?.total ?? batch.length) || 0;
      collected.push(...batch);
      if (batch.length < LEGACY_PAGE_LIMIT) break;
    }
    return collected.map((row) => legacyReportRowToRoster(row, fallbackAssessmentRef.current || {}));
  }, []);

  const fetchRoster = useCallback(async ({ full = false } = {}) => {
    const id = assessmentId;
    if (!id) return;
    if (inFlightRef.current) {
      pendingRef.current = { full: Boolean(pendingRef.current?.full || full) };
      return;
    }
    inFlightRef.current = true;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const isInitial = !cursorRef.current && !rowsRef.current.length;
    if (isInitial) setLoading(true);

    try {
      if (modeRef.current === 'legacy') {
        const legacyRows = await loadLegacy(id, controller.signal);
        if (!legacyRows || generation !== generationRef.current) return;
        const merged = mergeRosterRows(rowsRef.current, legacyRows, { full: true });
        applyRows(merged.rows, merged.changedKeys, { highlight: !isInitial });
        setError('');
        return;
      }

      const since = full ? null : cursorRef.current;
      const data = await api.getAssessmentReportRoster(id, { since: since || undefined, signal: controller.signal });
      if (generation !== generationRef.current) return;
      const replace = data?.full !== false || !since;
      const merged = mergeRosterRows(rowsRef.current, data?.rows || [], { full: replace });
      cursorRef.current = data?.cursor || cursorRef.current;
      if (data?.assessment) setAssessment(data.assessment);
      applyRows(merged.rows, merged.changedKeys, { highlight: !isInitial });
      setError('');
    } catch (err) {
      if (isAbort(err) || generation !== generationRef.current) return;
      if (modeRef.current === 'roster' && isNotFound(err)) {
        // Older backend without the roster endpoint: degrade to the reports endpoint.
        modeRef.current = 'legacy';
        setMode('legacy');
        pendingRef.current = { full: true };
        return;
      }
      setError(err?.message || 'Failed to load the candidate roster');
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
        controllerRef.current = null;
        setLoading(false);
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) void fetchRef.current?.(pending);
      }
    }
  }, [applyRows, assessmentId, loadLegacy]);

  useEffect(() => { fetchRef.current = fetchRoster; }, [fetchRoster]);

  const refresh = useCallback(() => fetchRoster({ full: true }), [fetchRoster]);

  /* Reset and full load whenever the assessment changes. */
  useEffect(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    inFlightRef.current = false;
    pendingRef.current = null;
    cursorRef.current = null;
    rowsRef.current = [];
    modeRef.current = 'roster';
    setMode('roster');
    setRows([]);
    setAssessment(null);
    setError('');
    setLastUpdatedAt(null);
    setRecentlyChanged(new Set());
    window.clearTimeout(hintTimerRef.current);
    if (!assessmentId) {
      setLoading(false);
      return undefined;
    }
    void fetchRoster({ full: true });
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
      window.clearTimeout(hintTimerRef.current);
    };
  }, [assessmentId, fetchRoster]);

  /* Socket subscription, hint handling and reconnect resync. */
  useEffect(() => {
    if (!assessmentId) {
      markLive(false);
      return undefined;
    }
    const socket = socketService.connect();
    let disposed = false;
    let lostConnection = false;

    const subscribe = () => {
      if (disposed) return;
      const onAck = (err, ack) => {
        if (disposed) return;
        markLive(!err && Boolean(ack?.ok));
      };
      if (typeof socket.timeout === 'function') {
        socket.timeout(SUBSCRIBE_ACK_TIMEOUT_MS).emit('assessment-report:subscribe', { assessmentId }, onAck);
      } else {
        socket.emit('assessment-report:subscribe', { assessmentId }, (ack) => onAck(null, ack));
      }
    };

    const scheduleDelta = () => {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = window.setTimeout(() => {
        if (document.hidden) return;
        void fetchRef.current?.({ full: false });
      }, HINT_DEBOUNCE_MS);
    };

    const handleChanged = (payload) => {
      if (String(payload?.assessmentId || '') !== String(assessmentId)) return;
      // Hidden tab: the visibility handler performs one delta when the admin returns.
      if (document.hidden) return;
      scheduleDelta();
    };

    const handleConnect = () => {
      subscribe();
      if (lostConnection) {
        lostConnection = false;
        void fetchRef.current?.({ full: true });
      }
    };

    const handleDisconnect = () => {
      lostConnection = true;
      markLive(false);
    };

    socket.on('assessment-report:changed', handleChanged);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) subscribe();
    else markLive(false);

    return () => {
      disposed = true;
      window.clearTimeout(hintTimerRef.current);
      socket.off('assessment-report:changed', handleChanged);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (socket.connected) socket.emit('assessment-report:unsubscribe', { assessmentId });
      markLive(false);
    };
  }, [assessmentId, markLive]);

  /* Pause while hidden; one delta on return. Safety resync only when not live. */
  useEffect(() => {
    if (!assessmentId) return undefined;
    const handleVisibility = () => {
      if (!document.hidden) void fetchRef.current?.({ full: false });
    };
    const timer = window.setInterval(() => {
      if (document.hidden || liveRef.current) return;
      void fetchRef.current?.({ full: false });
    }, SAFETY_RESYNC_MS);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [assessmentId]);

  useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);

  return {
    rows,
    assessment,
    loading,
    error,
    live: live && mode === 'roster',
    lastUpdatedAt,
    recentlyChanged,
    mode,
    refresh,
  };
}
