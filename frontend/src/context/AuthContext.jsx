import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, clearApiCache } from '../utils/api';

const AuthContext = createContext(null);

// Cache duration: 30 minutes - avoid re-fetching to prevent backend session conflicts
const CACHE_DURATION = 30 * 60 * 1000;

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
      } catch {
        setUser(null);
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
    localStorage.clear();
  }, []);

  const refreshUser = useCallback(() => {
    return fetchUser(true);
  }, [fetchUser]);

  const value = {
    user,
    loading,
    authChecked,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isStudent: user?.role === 'student',
    isCoordinator: user?.role === 'coordinator',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
