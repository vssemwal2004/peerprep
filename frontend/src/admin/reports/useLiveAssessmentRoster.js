import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import socketService from '../../utils/socket';
import { legacyReportRowToRoster, mergeRosterRows, rowViolationCount } from './rosterModel';

export const DEFAULT_REFRESH_INTERVAL_MS = 30000;
const SUBSCRIBE_ACK_TIMEOUT_MS = 5000;
const HIGHLIGHT_MS = 4000;
const LEGACY_PAGE_LIMIT = 100;
const LEGACY_MAX_PAGES = 50;
const ACTIVITY_LIMIT = 40;

const isNotFound = (err) => err?.response?.status === 404;
const isAbort = (err) => err?.name === 'AbortError';

/**
 * Activity entries for rows that changed between two roster snapshots: a
 * student who started, submitted, got graded or picked up new integrity flags.
 */
function describeChanges(previousRows, nextRows, changedKeys, at) {
  if (!changedKeys.length) return [];
  const before = new Map(previousRows.map((row) => [row.key, row]));
  const byStudent = new Map(previousRows.filter((row) => row.studentId).map((row) => [String(row.studentId), row]));
  const next = new Map(nextRows.map((row) => [row.key, row]));
  const events = [];
  for (const key of changedKeys) {
    const row = next.get(key);
    if (!row) continue;
    const old = before.get(key) || (row.studentId ? byStudent.get(String(row.studentId)) : null);
    const name = row.name || 'A candidate';
    const wasStarted = old && old.status && old.status !== 'not_started';
    if (row.status === 'in_progress' && !wasStarted) events.push({ id: `${key}:started:${at}`, key, name, type: 'started', at });
    else if (row.status !== 'in_progress' && row.status !== 'not_started' && (!old || old.status === 'in_progress' || old.status === 'not_started')) {
      events.push({ id: `${key}:submitted:${at}`, key, name, type: 'submitted', at, status: row.status });
    } else if (old && old.evaluationStatus !== 'completed' && row.evaluationStatus === 'completed' && row.score != null) {
      events.push({ id: `${key}:graded:${at}`, key, name, type: 'graded', at });
    }
    const flagsBefore = old ? rowViolationCount(old) : 0;
    const flagsNow = rowViolationCount(row);
    if (flagsNow > flagsBefore) events.push({ id: `${key}:flag:${at}`, key, name, type: 'flagged', at, count: flagsNow - flagsBefore });
  }
  return events;
}

/**
 * Live roster for one assessment report, refreshed in batches.
 *
 * Request discipline: socket hints carry no data and never fetch on their own;
 * they only mark that something changed. Every `intervalMs` (default 30 s) one
 * delta request (`since=cursor`) brings every changed candidate at once, and
 * only when a hint arrived or the socket is not live. An idle exam therefore
 * costs no requests, and a busy one costs one request per interval per open
 * report, however many students are saving. Nothing is fetched while the tab is
 * hidden; returning to it fetches once if changes are waiting. `refresh()` does
 * an immediate full reload. intervalMs 0 turns automatic updates off.
 *
 * If the roster endpoint is missing (404) the hook falls back to paging the
 * legacy reports endpoint and mapping its rows (no not-started students there).
 */
export default function useLiveAssessmentRoster(assessmentId, { fallbackAssessment = null, intervalMs = DEFAULT_REFRESH_INTERVAL_MS } = {}) {
  const [rows, setRows] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(null);
  const [pendingChanges, setPendingChanges] = useState(false);
  const [recentlyChanged, setRecentlyChanged] = useState(() => new Set());
  const [activity, setActivity] = useState([]);
  const [mode, setMode] = useState('roster');

  const rowsRef = useRef([]);
  const cursorRef = useRef(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(null);
  const controllerRef = useRef(null);
  const generationRef = useRef(0);
  const liveRef = useRef(false);
  const modeRef = useRef('roster');
  const changesWaitingRef = useRef(false);
  const highlightTimerRef = useRef(null);
  const fallbackAssessmentRef = useRef(fallbackAssessment);
  const fetchRef = useRef(null);

  useEffect(() => { fallbackAssessmentRef.current = fallbackAssessment; }, [fallbackAssessment]);

  const markLive = useCallback((value) => {
    liveRef.current = value;
    setLive(value);
  }, []);

  const markChangesWaiting = useCallback((value) => {
    changesWaitingRef.current = value;
    setPendingChanges(value);
  }, []);

  const applyRows = useCallback((nextRows, changedKeys, { highlight }) => {
    const previousRows = rowsRef.current;
    rowsRef.current = nextRows;
    setRows(nextRows);
    const now = Date.now();
    setLastUpdatedAt(now);
    if (highlight && changedKeys.length) {
      setRecentlyChanged(new Set(changedKeys));
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => setRecentlyChanged(new Set()), HIGHLIGHT_MS);
      const events = describeChanges(previousRows, nextRows, changedKeys, now);
      if (events.length) setActivity((current) => [...events.reverse(), ...current].slice(0, ACTIVITY_LIMIT));
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
    else setRefreshing(true);
    // Hints that arrive while this request runs are newer than its data and stay waiting.
    markChangesWaiting(false);

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
      // Keep the data shown and retry on the next tick.
      markChangesWaiting(true);
      setError(err?.message || 'Failed to load the candidate roster');
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
        controllerRef.current = null;
        setLoading(false);
        setRefreshing(false);
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) void fetchRef.current?.(pending);
      }
    }
  }, [applyRows, assessmentId, loadLegacy, markChangesWaiting]);

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
    changesWaitingRef.current = false;
    setMode('roster');
    setRows([]);
    setAssessment(null);
    setError('');
    setLastUpdatedAt(null);
    setPendingChanges(false);
    setActivity([]);
    setRecentlyChanged(new Set());
    if (!assessmentId) {
      setLoading(false);
      return undefined;
    }
    void fetchRoster({ full: true });
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [assessmentId, fetchRoster]);

  /* Socket subscription: hints only mark that changes are waiting. */
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

    const handleChanged = (payload) => {
      if (String(payload?.assessmentId || '') !== String(assessmentId)) return;
      markChangesWaiting(true);
    };

    const handleConnect = () => {
      subscribe();
      // Hints sent while disconnected were missed; the next tick catches up.
      if (lostConnection) {
        lostConnection = false;
        markChangesWaiting(true);
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
      socket.off('assessment-report:changed', handleChanged);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (socket.connected) socket.emit('assessment-report:unsubscribe', { assessmentId });
      markLive(false);
    };
  }, [assessmentId, markChangesWaiting, markLive]);

  /* Batched refresh: one delta per interval, only when something changed (or not live). */
  useEffect(() => {
    if (!assessmentId || !intervalMs) {
      setNextRefreshAt(null);
      return undefined;
    }
    const due = () => changesWaitingRef.current || !liveRef.current;
    const schedule = () => setNextRefreshAt(Date.now() + intervalMs);
    schedule();
    const timer = window.setInterval(() => {
      schedule();
      if (document.hidden || !due()) return;
      void fetchRef.current?.({ full: false });
    }, intervalMs);
    const handleVisibility = () => {
      if (!document.hidden && changesWaitingRef.current) void fetchRef.current?.({ full: false });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [assessmentId, intervalMs]);

  useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);

  return {
    rows,
    assessment,
    loading,
    refreshing,
    error,
    live: live && mode === 'roster',
    lastUpdatedAt,
    nextRefreshAt,
    pendingChanges,
    recentlyChanged,
    activity,
    mode,
    refresh,
  };
}
