import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, clearApiCache } from '../utils/api';
import { clearAllAssessmentDrafts } from '../student/assessment/assessmentDraftStore';
import { SESSION_ENDED_EVENT, afterSessionEndUrl, sessionEndOf } from '../auth/sessionNotice';
import { SessionEndedDialog } from '../auth/SessionDialogs';

export const AuthContext = createContext(null);

// Cache duration: 30 minutes - avoid re-fetching to prevent backend session conflicts
const CACHE_DURATION = 30 * 60 * 1000;
// While a page is visible it asks "is this still my session?" this often, and on focus (throttled).
const SESSION_CHECK_MS = 90 * 1000;
const SESSION_FOCUS_CHECK_MS = 15 * 1000;

/**
 * AuthProvider - Centralized auth state management
 * 
 * WHY: Previously every ProtectedRoute + every Navbar independently called api.me()
 * on every navigation. This caused 2-3 redundant network calls per page load,
 * creating massive white-screen delays.
 * 
 * NOW: Single api.me() call, result cached in context, shared across all components.
 * Protected routes and navbars read from context instantly.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  // { code, session } once this session was ended elsewhere: the page stays until the person presses OK.
  const [sessionEnded, setSessionEnded] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const fetchingRef = useRef(false);
  const fetchingPromiseRef = useRef(null);
  const cacheTimestampRef = useRef(0);

  const fetchUser = useCallback(async (force = false) => {
    // Prevent concurrent fetches. Forced refreshes wait for the current check
    // and then run again, which avoids post-login races with the initial check.
    if (fetchingRef.current) {
      if (!force) return fetchingPromiseRef.current;
      try {
        await fetchingPromiseRef.current;
      } catch {
        // The forced refresh below will decide the final auth state.
      }
    }

    // Skip if cache is still fresh (unless forced)
    const now = Date.now();
    if (!force && authChecked && now - cacheTimestampRef.current < CACHE_DURATION) {
      return;
    }

    fetchingRef.current = true;
    fetchingPromiseRef.current = (async () => {
      try {
        const userData = await api.me(force);
        setUser(userData);
        cacheTimestampRef.current = Date.now();
      } catch (error) {
        clearApiCache();
        // An ended session (also after a refresh) keeps the page and asks; it is not a silent sign-out.
        const ended = sessionEndOf(error?.response?.status, error?.response?.data);
        if (ended) setSessionEnded((current) => current || ended);
        else setUser(null);
        cacheTimestampRef.current = Date.now();
      } finally {
        setLoading(false);
        setAuthChecked(true);
        fetchingRef.current = false;
        fetchingPromiseRef.current = null;
      }
    })();

    return fetchingPromiseRef.current;
  }, [authChecked]);

  // Initial auth check on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Continue local logout even if the network request fails.
    }
    setUser(null);
    setAuthChecked(false);
    cacheTimestampRef.current = 0;
    clearApiCache();
    // Answer and code drafts live in IndexedDB too; the next user of a shared
    // lab machine must not find them.
    await clearAllAssessmentDrafts().catch(() => {});
    localStorage.clear();
  }, []);

  const refreshUser = useCallback(() => {
    return fetchUser(true);
  }, [fetchUser]);

  // Any request that finds this session ended (api clients raise the event) opens the dialog once.
  useEffect(() => {
    const onEnded = (event) => setSessionEnded((current) => current || event.detail || { code: 'SESSION_REPLACED', session: null });
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, []);

  // A page left open finds out without the person doing anything: on focus, when the tab becomes
  // visible, on a timer while visible, and at once when the server pushes "session-check".
  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn || sessionEnded) return undefined;
    let lastCheck = Date.now();
    let checking = false;
    const check = async (force = false) => {
      if (checking || (!force && Date.now() - lastCheck < SESSION_FOCUS_CHECK_MS)) return;
      checking = true;
      lastCheck = Date.now();
      try {
        await api.checkSession();
      } catch (error) {
        // Ended sessions raise SESSION_ENDED_EVENT inside the client. Signed out in another tab of
        // this browser (no cookie any more): re-read who is signed in.
        if (error?.response?.status === 401 && !sessionEndOf(401, error.response.data)) void fetchUser(true);
      } finally {
        checking = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    const onPush = () => { void check(true); };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check(true); }, SESSION_CHECK_MS);
    window.addEventListener('focus', onVisible);
    window.addEventListener('peerprep:session-check', onPush);
    document.addEventListener('visibilitychange', onVisible);
    let socketService;
    let cancelled = false;
    // Students already hold a socket; other roles rely on focus and the timer.
    if (user?.role === 'student') {
      import('../utils/socket').then(({ default: service }) => {
        if (cancelled) return;
        socketService = service;
        socketService.on('session-check', onPush);
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('peerprep:session-check', onPush);
      document.removeEventListener('visibilitychange', onVisible);
      socketService?.off('session-check', onPush);
    };
  }, [fetchUser, sessionEnded, signedIn, user?.role]);

  // OK on "Your session has expired": sign out on this browser (the other session is untouched),
  // then go to the sign-in page, or stay on a public page.
  const confirmSessionEnded = useCallback(async () => {
    setSigningOut(true);
    await logout();
    window.location.replace(afterSessionEndUrl());
  }, [logout]);

  useEffect(() => {
    if (user?.role !== 'student') return undefined;
    let cancelled = false;
    let socketService;
    const handleAccessUpdate = () => { void refreshUser(); };

    // Socket.IO is only needed for an authenticated student. Loading it here
    // keeps the public landing and login paths out of the critical bundle.
    import('../utils/socket').then(({ default: service }) => {
      if (cancelled) return;
      socketService = service;
      socketService.on('student-access-updated', handleAccessUpdate);
    }).catch(() => {
      // Live access updates are optional; the next auth refresh still reconciles state.
    });

    return () => {
      cancelled = true;
      socketService?.off('student-access-updated', handleAccessUpdate);
    };
  }, [user?.role, refreshUser]);

  const value = {
    user,
    loading,
    authChecked,
    logout,
    refreshUser,
    sessionEnded,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isStudent: user?.role === 'student',
    isCoordinator: user?.role === 'coordinator',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {sessionEnded && <SessionEndedDialog ended={sessionEnded} busy={signingOut} onConfirm={confirmSessionEnded} />}
    </AuthContext.Provider>
  );
}

/** Auth state when an AuthProvider is mounted, otherwise null (for components that also render outside the app shell). */
export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
