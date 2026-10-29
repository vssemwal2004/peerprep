import { useCallback, useEffect, useRef, useState } from "react";

// A blur and a hide this close together are one switch away from the interview (counted as tab_hidden).
export const BLUR_MERGE_MS = 1000;
// Blocked actions (right click, copy/paste, shortcuts) are logged at most once per type in this window.
export const BLOCKED_THROTTLE_MS = 3000;
// A tab-switch warning stays up this long unless dismissed.
const WARNING_MS = 12_000;
const TAB_TYPES = new Set(["tab_hidden", "window_blur"]);
// No interview to watch: before the call starts, while this tab is not the one in the interview, and
// once it is ending.
const INACTIVE = new Set(["idle", "ending", "ended", "taken_over"]);
// The server still holds the interview although this tab is back: resend the resume events this soon,
// then with doubling backoff (a lost or rate-limited fullscreen_enter would otherwise leave it silent).
export const RESUME_RETRY_MS = 2000;
const RESUME_RETRY_MAX_MS = 16_000;
// A server hold this room sees no reason for is shown after this grace: every join starts held under the
// pause rule, and the room's own join report normally releases it within a round trip.
export const SERVER_HOLD_GRACE_MS = 1000;
// Marks an event that only re-reports where this tab stands (after a join, or a resume retry), so the
// server can update its pause state without counting the same violation twice.
const RESYNC = Object.freeze({ resync: true });

const AI_OFF = Object.freeze({ enabled: false });
export const PROCTORING_OFF = Object.freeze({
  enabled: false, fullscreen: "off", pauseOutsideFullscreen: false, pauseForCamera: false, tabSwitch: "off", refresh: "off",
  blockRightClick: false, blockCopyPaste: false, blockShortcuts: false, warnings: 0, maxViolations: 0, onLimit: "end", ai: AI_OFF,
});
const isAiType = (type) => String(type || "").startsWith("ai_");

/**
 * Whether `source` carries the attempt's proctoring settings: a stored report (`settings`) or a settings
 * object (with `fullscreen` / `tabSwitch`). The student view of a running attempt is
 * `{ enabled, settings, counts, violations }` and carries them; a counts-only view (a finished attempt, or
 * an older server's `{ enabled: false, counts }`) never decides the settings.
 */
export function hasProctoringSettings(source) {
  if (!source || typeof source !== "object") return false;
  if (source.settings && typeof source.settings === "object") return true;
  return typeof source.fullscreen === "string" || typeof source.tabSwitch === "string";
}

const clampInt = (value, min, max, fallback) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/**
 * The attempt's proctoring settings, from an attempt / list item (`proctoring`), a stored report
 * (`proctoring.settings`) or a raw settings object. Anything not explicitly enabled is off; the other
 * fields fall back to the admin defaults (pause outside fullscreen, blocking on, 3 warnings, end at the limit).
 */
export function proctoringSettingsOf(source) {
  const raw = source?.settings && typeof source.settings === "object" ? source.settings : source;
  if (!raw || typeof raw !== "object" || raw.enabled !== true) return PROCTORING_OFF;
  const fullscreen = raw.fullscreen === "required" ? "required" : "off";
  const aiEnabled = Boolean(raw.ai && typeof raw.ai === "object" && raw.ai.enabled === true);
  const pauseOutsideFullscreen = fullscreen === "required" && raw.pauseOutsideFullscreen !== false;
  return {
    enabled: true,
    fullscreen,
    pauseOutsideFullscreen,
    // As the server (pausesForCamera): a blocked camera pauses only under the pause rule (fullscreen
    // required and pauseOutsideFullscreen) with camera AI on. Otherwise it is a counted violation.
    pauseForCamera: aiEnabled && pauseOutsideFullscreen,
    tabSwitch: raw.tabSwitch === "record" || raw.tabSwitch === "warn" ? raw.tabSwitch : "off",
    refresh: raw.refresh === "record" ? "record" : "off",
    blockRightClick: raw.blockRightClick !== false,
    blockCopyPaste: raw.blockCopyPaste !== false,
    blockShortcuts: raw.blockShortcuts !== false,
    warnings: clampInt(raw.warnings, 0, 10, 3),
    maxViolations: clampInt(raw.maxViolations, 0, 20, 0),
    onLimit: raw.onLimit === "flag" ? "flag" : "end",
    // Camera AI checks (Assessment's ProctoringManager settings); its own normaliser applies the ranges.
    ai: aiEnabled ? { ...raw.ai, enabled: true } : AI_OFF,
  };
}

/** Violations already counted for this attempt (a rejoin starts from the server's count). */
export function violationsOf(source) {
  const value = Math.floor(Number(source?.violations));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * How the student sees violation `n`: "Warning 2 of 3" for the first `warnings` violations, then the
 * count ("4 of 5" when the interview ends at a limit, otherwise "4 recorded").
 */
export function violationLabel(n, { warnings = 0, maxViolations = 0, onLimit = "end" } = {}) {
  if (!(n > 0)) return "";
  if (warnings > 0 && n <= warnings) return `Warning ${n} of ${warnings}`;
  if (maxViolations > 0 && onLimit === "end") return `Violation ${n} of ${maxViolations}`;
  return `${n} violation${n === 1 ? "" : "s"} recorded`;
}

const fullscreenElementOf = (doc) => doc?.fullscreenElement || doc?.webkitFullscreenElement || null;

/**
 * Watches fullscreen, tab visibility and window focus, and calls `send(type, at)` once per change:
 * - fullscreen_exit / fullscreen_enter when fullscreen is required;
 * - one away event per absence when tab switches are watched. Leaving the tab usually fires blur and
 *   then visibilitychange; a blur is held for BLUR_MERGE_MS so that pair is sent once, as tab_hidden.
 *   A plain blur (another app, a second window) is sent as window_blur. Coming back sends the matching
 *   tab_visible or window_focus. With the pause rule a hidden tab is reported even if tab switches
 *   are not watched, because the server pauses on it.
 * `pause(true)` keeps tracking state but sends nothing; `stop()` removes the listeners.
 */
export function createProctorMonitor({ settings, send, onFullscreen, onHidden, doc = globalThis.document, win = globalThis.window, now = () => Date.now() }) {
  const watchTabs = Boolean(settings?.enabled && settings.tabSwitch !== "off");
  const watchHidden = watchTabs || Boolean(settings?.enabled && settings.pauseOutsideFullscreen);
  const watchFullscreen = Boolean(settings?.enabled && settings.fullscreen === "required");
  const state = {
    hidden: doc?.visibilityState === "hidden",
    blurred: false,
    fullscreen: Boolean(fullscreenElementOf(doc)),
    away: false,
    awayType: null,
    pendingBlur: null,
    paused: false,
    stopped: false,
  };
  const pauseRule = watchFullscreen && Boolean(settings.pauseOutsideFullscreen);
  const emit = (type, detail = null) => {
    if (state.paused || state.stopped) return;
    if (detail) send(type, now(), detail); else send(type, now());
  };
  const clearPending = () => {
    if (state.pendingBlur === null) return false;
    win.clearTimeout(state.pendingBlur);
    state.pendingBlur = null;
    return true;
  };

  const goAway = (kind) => {
    if (kind === "tab_hidden" ? !watchHidden : !watchTabs) return;
    if (state.away) {
      // The blur that started this absence is still held: the hide that follows replaces it.
      if (kind === "tab_hidden" && clearPending()) { state.awayType = "tab_hidden"; emit("tab_hidden"); }
      return;
    }
    state.away = true;
    if (kind === "tab_hidden") { state.awayType = "tab_hidden"; emit("tab_hidden"); return; }
    state.pendingBlur = win.setTimeout(() => {
      state.pendingBlur = null;
      state.awayType = "window_blur";
      emit("window_blur");
    }, BLUR_MERGE_MS);
  };
  const comeBack = () => {
    if (!state.away || state.hidden || state.blurred) return;
    state.away = false;
    // A short trip away (under BLUR_MERGE_MS) is still a switch.
    if (clearPending()) { emit("window_blur"); emit("window_focus"); state.awayType = null; return; }
    if (state.awayType) emit(state.awayType === "tab_hidden" ? "tab_visible" : "window_focus");
    state.awayType = null;
  };

  const onVisibility = () => {
    const hidden = doc.visibilityState === "hidden";
    if (hidden === state.hidden) return;
    state.hidden = hidden;
    onHidden?.(hidden);
    if (hidden) goAway("tab_hidden");
    // Without focus tracking, the tab being visible again is the return.
    else if (!watchTabs) { state.blurred = false; comeBack(); }
    else comeBack();
  };
  const onBlur = (event) => {
    // Only the window losing focus counts, not focus moving between elements on the page.
    if (event?.target && event.target !== win) return;
    if (state.blurred) return;
    state.blurred = true;
    goAway(state.hidden ? "tab_hidden" : "window_blur");
  };
  const onFocus = (event) => {
    if (event?.target && event.target !== win) return;
    if (!state.blurred) return;
    state.blurred = false;
    comeBack();
  };
  const onFullscreenChange = () => {
    const fullscreen = Boolean(fullscreenElementOf(doc));
    if (fullscreen === state.fullscreen) return;
    state.fullscreen = fullscreen;
    onFullscreen?.(fullscreen);
    if (watchFullscreen) emit(fullscreen ? "fullscreen_enter" : "fullscreen_exit");
  };

  doc.addEventListener("visibilitychange", onVisibility);
  doc.addEventListener("fullscreenchange", onFullscreenChange);
  doc.addEventListener("webkitfullscreenchange", onFullscreenChange);
  win.addEventListener("blur", onBlur);
  win.addEventListener("focus", onFocus);

  return {
    pause(value) { state.paused = Boolean(value); },
    /** Reports a tab that is already hidden (the server's pause state does not survive a reload). */
    announceHidden() {
      const hidden = doc.visibilityState === "hidden" || doc.hidden === true;
      if (!hidden || state.away) return;
      state.hidden = true;
      goAway("tab_hidden");
    },
    /**
     * Under the pause rule, re-reports a hidden tab as `tab_hidden` with `{ resync: true }`: the same
     * absence, not a new one. Every join starts the server held, so the room says where it stands.
     */
    resyncHidden() {
      if (!pauseRule || state.paused || state.stopped) return;
      if (!(doc.visibilityState === "hidden" || doc.hidden === true)) return;
      clearPending();
      state.hidden = true;
      state.away = true;
      state.awayType = "tab_hidden";
      emit("tab_hidden", RESYNC);
    },
    /**
     * With fullscreen required, re-reports the screen with `{ resync: true }`: fullscreen_enter when in
     * fullscreen (so a join resumes at once), and under the pause rule fullscreen_exit when not.
     */
    resyncFullscreen() {
      if (!watchFullscreen || state.paused || state.stopped) return;
      state.fullscreen = Boolean(fullscreenElementOf(doc));
      if (state.fullscreen) emit("fullscreen_enter", RESYNC);
      else if (pauseRule) emit("fullscreen_exit", RESYNC);
    },
    stop() {
      if (state.stopped) return;
      state.stopped = true;
      clearPending();
      doc.removeEventListener("visibilitychange", onVisibility);
      doc.removeEventListener("fullscreenchange", onFullscreenChange);
      doc.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      win.removeEventListener("blur", onBlur);
      win.removeEventListener("focus", onFocus);
    },
  };
}

// Ctrl/Cmd + C V X A P S U, Ctrl/Cmd + Shift + I J C, F12, PrintScreen. Esc cannot be blocked.
const MOD_KEYS = new Set(["c", "v", "x", "a", "p", "s", "u"]);
const DEVTOOLS_KEYS = new Set(["i", "j", "c"]);
export function isBlockedShortcut(event) {
  const key = String(event?.key || "").toLowerCase();
  if (key === "f12" || key === "printscreen") return true;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.shiftKey && DEVTOOLS_KEYS.has(key)) return true;
  return !event.altKey && MOD_KEYS.has(key);
}

/**
 * Blocks right click, copy / cut / paste / text selection and common shortcuts on `doc` (only the
 * kinds enabled in `settings`), and reports each kind through `send(type, at)` at most once per
 * BLOCKED_THROTTLE_MS. Returns a function that removes the listeners.
 */
export function createActionBlocker({ settings, send, doc = globalThis.document, now = () => Date.now() }) {
  const last = new Map();
  const report = (type) => {
    const at = now();
    if (at - (last.get(type) ?? -Infinity) < BLOCKED_THROTTLE_MS) return;
    last.set(type, at);
    send(type, at);
  };
  const listeners = [];
  const on = (event, handler) => { doc.addEventListener(event, handler, true); listeners.push([event, handler]); };
  if (settings?.blockRightClick) on("contextmenu", (event) => { event.preventDefault(); report("right_click"); });
  if (settings?.blockCopyPaste) {
    ["copy", "cut", "paste"].forEach((name) => on(name, (event) => { event.preventDefault(); report("copy_paste"); }));
    // Selecting is silent (a drag fires it constantly); it is blocked, not logged.
    on("selectstart", (event) => { event.preventDefault(); });
  }
  if (settings?.blockShortcuts) {
    const onKey = (event) => {
      if (!isBlockedShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      report("shortcut");
    };
    on("keydown", onKey);
    // PrintScreen often fires only on key up.
    on("keyup", (event) => { if (String(event.key || "").toLowerCase() === "printscreen") onKey(event); });
  }
  return () => listeners.splice(0).forEach(([event, handler]) => doc.removeEventListener(event, handler, true));
}

function exitFullscreen(doc = globalThis.document) {
  if (!fullscreenElementOf(doc)) return;
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
  try { void Promise.resolve(exit?.call(doc)).catch(() => {}); } catch { /* Already left. */ }
}

/** A server warning (event payload or ack `warning`) in one shape. */
function warningOf(value, fallback = {}) {
  if (!value) return null;
  const base = typeof value === "string" ? { message: value } : value;
  if (typeof base !== "object") return null;
  const number = (field) => (Number.isFinite(Number(base[field])) ? Number(base[field]) : fallback[field]);
  // The server numbers its warnings itself: `warning` N of `warnings` W.
  const n = Math.floor(Number(base.warning));
  const w = Math.floor(Number(base.warnings));
  return {
    type: base.type || fallback.type || "", message: String(base.message || ""), violations: number("violations"), maxViolations: number("maxViolations"),
    label: n > 0 && w > 0 && n <= w ? `Warning ${n} of ${w}` : "", at: Date.now(),
  };
}

/**
 * Proctoring for one live interview, only when `settings.enabled`. Sends `anvi:proctor` events through
 * `live.sendProctor`, follows `anvi:proctor-warning` (`live.proctorWarning`), pauses the microphone while
 * the pause rule applies, blocks the configured actions, and leaves fullscreen when the interview ends.
 * It never blocks the voice pipeline: events are fire-and-forget.
 */
export function useAnviProctoring({ settings = PROCTORING_OFF, live, initialViolations = 0, serverViolations = 0, cameraBlocked = false } = {}) {
  const enabled = Boolean(settings?.enabled);
  const fullscreenRequired = enabled && settings.fullscreen === "required";
  const status = live?.status || "idle";
  const active = enabled && !INACTIVE.has(status);
  const [violations, setViolations] = useState(() => initialViolations);
  const [maxViolations, setMaxViolations] = useState(() => (enabled ? settings.maxViolations : 0));
  const [lastWarning, setLastWarning] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(fullscreenElementOf(globalThis.document)));
  const [isHidden, setIsHidden] = useState(() => globalThis.document?.visibilityState === "hidden");
  const [leftFullscreen, setLeftFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  // The server's own "Warning N of W" for the current count, when it sent one.
  const [serverLabel, setServerLabel] = useState(null);

  const aliveRef = useRef(true);
  const sendRef = useRef(live?.sendProctor);
  const monitorRef = useRef(null);
  const settingsRef = useRef(settings);
  const activeRef = useRef(active);
  const cameraBlockedRef = useRef(cameraBlocked);
  useEffect(() => { sendRef.current = live?.sendProctor; settingsRef.current = settings; activeRef.current = active; cameraBlockedRef.current = cameraBlocked; });
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  useEffect(() => { setMaxViolations(enabled ? settings.maxViolations : 0); }, [enabled, settings.maxViolations]);
  // A count in the live state (for example after the server recorded a rejoin) only ever raises it.
  useEffect(() => { if (serverViolations > 0) setViolations((count) => Math.max(count, serverViolations)); }, [serverViolations]);

  const showWarning = useCallback((warning) => {
    if (!warning || !aliveRef.current) return;
    if (Number.isFinite(warning.violations)) setViolations((count) => Math.max(count, warning.violations));
    if (Number.isFinite(warning.maxViolations) && warning.maxViolations >= 0) setMaxViolations(warning.maxViolations);
    if (warning.label && Number.isFinite(warning.violations)) setServerLabel({ violations: warning.violations, text: warning.label });
    const current = settingsRef.current;
    // "record" logs tab switches without telling the student; the fullscreen banner covers its own case.
    // The camera-blocked banner or pause overlay explains its own case too. A rejoin the server numbers
    // ("Warning 1 of 3") is shown like any other violation, so the count never seems to skip one.
    if (warning.type === "fullscreen_exit" || warning.type === "ai_camera_blocked") return;
    if (TAB_TYPES.has(warning.type) && current?.tabSwitch !== "warn") return;
    setLastWarning(warning);
  }, []);

  const applyAck = useCallback((type, ack) => {
    if (!ack || !aliveRef.current || ack.ok === false) return;
    const count = Number(ack.violations);
    const max = Number(ack.maxViolations);
    if (Number.isFinite(count)) setViolations((value) => Math.max(value, count));
    if (Number.isFinite(max) && max >= 0) setMaxViolations(max);
    if (ack.warning) showWarning(warningOf(ack.warning, { type, violations: Number.isFinite(count) ? count : undefined, maxViolations: Number.isFinite(max) ? max : undefined }));
  }, [showWarning]);

  const send = useCallback((type, at, detail = null) => {
    const sendProctor = sendRef.current;
    if (typeof sendProctor !== "function") return;
    void Promise.resolve(sendProctor(type, at, detail)).then((ack) => {
      applyAck(type, ack);
      // A confirmed camera finding is always shown: the server's warning text when it sends one,
      // otherwise the detector's own message ("Face not visible", "Mobile phone detected").
      if (detail?.message && isAiType(type) && !ack?.warning) {
        showWarning({ type, message: detail.message, violations: Number.isFinite(Number(ack?.violations)) ? Number(ack.violations) : undefined, at: Date.now() });
      }
    }).catch(() => {});
  }, [applyAck, showWarning]);

  /** A confirmed camera AI violation from ProctoringManager: sent as `anvi:proctor` with severity and confidence. */
  const reportAi = useCallback((event) => {
    if (!event?.type || !activeRef.current || !settingsRef.current?.ai?.enabled) return;
    send(event.type, Date.now(), { severity: event.severity, confidence: event.confidence, message: event.message });
  }, [send]);

  // The listeners live for the whole call; settings changes rebuild them.
  const { fullscreen, tabSwitch, pauseOutsideFullscreen, blockRightClick, blockCopyPaste, blockShortcuts } = settings;
  useEffect(() => {
    if (!enabled) return undefined;
    const monitor = createProctorMonitor({
      settings: { enabled, fullscreen, tabSwitch, pauseOutsideFullscreen },
      send,
      onFullscreen: (value) => {
        if (!aliveRef.current) return;
        setIsFullscreen(value);
        if (value) setFullscreenError(""); else setLeftFullscreen(true);
      },
      onHidden: (value) => { if (aliveRef.current) setIsHidden(value); },
    });
    monitorRef.current = monitor;
    return () => { monitor.stop(); if (monitorRef.current === monitor) monitorRef.current = null; };
  }, [enabled, fullscreen, tabSwitch, pauseOutsideFullscreen, send]);

  useEffect(() => { monitorRef.current?.pause(!active); }, [active]);

  // The server's pause state lives in each joined session, and under the pause rule every new holder
  // starts held (a reload, a reconnect, "Continue here", another server). Each time the call (re)joins,
  // say where this tab stands, every report marked `resync` (pause state only, never counted): a hidden
  // tab, a camera that is still blocked (when it pauses), then fullscreen_enter in fullscreen or, under
  // the pause rule, fullscreen_exit. The hold reasons go first, so a fullscreen_enter never releases a
  // hold that the next event takes again. Without the pause rule a tab already hidden at the first join
  // is a tab switch, reported once as usual.
  const joined = status === "live";
  const joinsRef = useRef(0);
  const pauseForCamera = enabled && Boolean(settings.pauseForCamera);
  useEffect(() => {
    if (!joined || !enabled) return;
    joinsRef.current += 1;
    const monitor = monitorRef.current;
    monitor?.resyncHidden();
    if (pauseForCamera && cameraBlockedRef.current) send("ai_camera_blocked", Date.now(), { ...RESYNC, severity: "high", confidence: 1 });
    monitor?.resyncFullscreen();
    if (joinsRef.current === 1) monitor?.announceHidden();
  }, [joined, enabled, pauseForCamera, send]);

  // Blocking applies inside the live room only, until the interview ends.
  const blocking = enabled && status !== "ended" && (blockRightClick || blockCopyPaste || blockShortcuts);
  useEffect(() => {
    if (!blocking) return undefined;
    return createActionBlocker({
      settings: { blockRightClick, blockCopyPaste, blockShortcuts },
      send: (type, at) => { if (activeRef.current) send(type, at); },
    });
  }, [blocking, blockRightClick, blockCopyPaste, blockShortcuts, send]);

  // Server warnings (each has a new seq, so a repeat of the same text still shows).
  const warning = live?.proctorWarning;
  useEffect(() => {
    if (!enabled || !warning) return;
    showWarning(warningOf(warning));
  }, [enabled, warning, showWarning]);

  useEffect(() => {
    if (!lastWarning) return undefined;
    const id = setTimeout(() => setLastWarning(null), WARNING_MS);
    return () => clearTimeout(id);
  }, [lastWarning]);

  // Paused while out of fullscreen or on a hidden tab: the microphone sends silence meanwhile.
  // Under the same rule, with camera AI on, a blocked camera pauses too, as the server does (otherwise
  // it is a counted violation and the room shows a banner).
  const pauseRule = active && fullscreenRequired && Boolean(pauseOutsideFullscreen);
  const screenPaused = pauseRule && (!isFullscreen || isHidden);
  const cameraPaused = active && pauseForCamera && cameraBlocked;
  const paused = screenPaused || cameraPaused;
  // The server's own reasons: fullscreen first, then a hidden tab, then the camera.
  const localReason = screenPaused ? (isFullscreen ? "tab_hidden" : "fullscreen_exit") : cameraPaused ? "camera_blocked" : "";
  const setProctorPaused = live?.setProctorPaused;
  useEffect(() => {
    if (typeof setProctorPaused !== "function") return undefined;
    setProctorPaused(paused);
    return () => setProctorPaused(false);
  }, [paused, setProctorPaused]);

  // The server still holds the interview while this tab is back (its anvi:resumed or our resume event
  // was lost, timed out or rate limited): resend the resume events with backoff, and say so after the
  // first retry. The ack (or anvi:resumed) clears `live.serverPaused`.
  const resumeServer = useCallback(() => {
    const current = settingsRef.current;
    const doc = globalThis.document;
    const now = Date.now();
    if (current?.enabled && current.fullscreen === "required" && current.pauseOutsideFullscreen) {
      if (fullscreenElementOf(doc)) send("fullscreen_enter", now, RESYNC);
      if (doc?.visibilityState !== "hidden") send("tab_visible", now, RESYNC);
    }
    if (current?.enabled && current.pauseForCamera && !cameraBlockedRef.current) send("ai_camera_restored", now, RESYNC);
  }, [send]);
  const stuck = active && Boolean(live?.serverPaused) && !paused;
  const [serverHeld, setServerHeld] = useState(false);
  useEffect(() => {
    if (!stuck) { setServerHeld(false); return undefined; }
    let delay = RESUME_RETRY_MS;
    let timer = null;
    // A hold the room's own join report releases at once (every join starts held) is not shown.
    const shown = setTimeout(() => { if (aliveRef.current) setServerHeld(true); }, SERVER_HOLD_GRACE_MS);
    const retry = () => {
      if (!aliveRef.current) return;
      resumeServer();
      delay = Math.min(delay * 2, RESUME_RETRY_MAX_MS);
      timer = setTimeout(retry, delay);
    };
    timer = setTimeout(retry, delay);
    return () => { clearTimeout(shown); clearTimeout(timer); };
  }, [stuck, resumeServer]);
  // Why the server holds while this room has no pause of its own: the reason it gave (anvi:paused)
  // when the room agrees, else what the room can see is wrong, else "server" (the room is back and
  // the interview is resuming). The room may not pause for it itself, for example with a camera
  // blocked under settings it read differently; the overlay then still says what to fix.
  const told = String(live?.serverPaused?.reason || "");
  const needs = { fullscreen_exit: fullscreenRequired && !isFullscreen, tab_hidden: isHidden, camera_blocked: enabled && Boolean(settings.ai?.enabled) && cameraBlocked };
  const heldReason = !stuck ? "" : Object.hasOwn(needs, told) && needs[told] ? told : needs.fullscreen_exit ? "fullscreen_exit" : needs.camera_blocked ? "camera_blocked" : "server";
  // The blocking overlay: the room's own pause, or whenever the server says it holds (a hold the room
  // cannot see a reason for after a short grace, since a join report usually releases it first).
  const pauseShown = paused || (stuck && (heldReason !== "server" || serverHeld));

  // The interview is over: give the student their screen back.
  useEffect(() => {
    if (!enabled || status !== "ended") return;
    monitorRef.current?.stop();
    exitFullscreen();
  }, [enabled, status]);
  useEffect(() => () => {
    if (!settingsRef.current?.enabled) return;
    monitorRef.current?.stop();
    exitFullscreen();
  }, []);

  // Must run inside the click: browsers allow fullscreen only from a user gesture.
  const requestFullscreen = useCallback(() => {
    const element = globalThis.document?.documentElement;
    const enter = element?.requestFullscreen || element?.webkitRequestFullscreen;
    if (!enter) {
      setFullscreenError("This browser cannot switch to fullscreen here. Use the browser menu (or F11) to go fullscreen.");
      return Promise.resolve(false);
    }
    let pending;
    try { pending = enter.call(element, { navigationUI: "hide" }); } catch (cause) { pending = Promise.reject(cause); }
    return Promise.resolve(pending).then(() => {
      if (aliveRef.current) setFullscreenError("");
      return true;
    }, () => {
      if (aliveRef.current) setFullscreenError("Your browser blocked fullscreen. Press F11 or use the browser menu to go fullscreen.");
      return false;
    });
  }, []);

  const shownSettings = enabled ? settings : PROCTORING_OFF;
  return {
    enabled,
    active,
    settings: shownSettings,
    violations,
    maxViolations,
    label: serverLabel && serverLabel.violations === violations
      ? serverLabel.text
      : violationLabel(violations, { warnings: shownSettings.warnings, maxViolations, onLimit: shownSettings.onLimit }),
    lastWarning,
    dismissWarning: useCallback(() => setLastWarning(null), []),
    isFullscreen,
    isHidden,
    fullscreenRequired,
    // The room's own pause (the microphone sends silence); `pauseShown`: the blocking overlay is up.
    paused,
    pauseShown,
    // Why, in the server's terms: "fullscreen_exit", "tab_hidden", "camera_blocked", or "server" (the
    // server still holds although this room is back; `resumeServer()` asks again).
    pauseReason: !pauseShown ? "" : paused ? localReason : heldReason,
    aiEnabled: enabled && Boolean(settings.ai?.enabled),
    reportAi,
    serverPaused: Boolean(live?.serverPaused),
    // The server still holds the interview although this tab is back; `resumeServer()` asks again.
    serverHeld: stuck && serverHeld,
    resumeServer,
    needsFullscreen: fullscreenRequired && active && !isFullscreen,
    leftFullscreen,
    fullscreenError,
    requestFullscreen,
  };
}
