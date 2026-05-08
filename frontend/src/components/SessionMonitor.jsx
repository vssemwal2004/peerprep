import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from './CustomToast';

/**
 * SessionMonitor - Monitors user session and detects when logged in from another device
 * 
 * This component runs in the background and periodically checks if the session is still valid.
 * If the user logs in from another device, this will automatically detect the 401 error
 * and log them out WITHOUT requiring a page refresh.
 * 
 * Features:
 * - Periodic session validation (every 30 seconds)
 * - Only checks when user is logged in and on protected routes
 * - Automatic logout on session expiration
 * - Uses React Router for navigation (no page reload)
 * - Shows toast notification instead of alert
 */
export default function SessionMonitor() {
  // Temporarily disabled to prevent 401 errors from session conflicts
  // The backend's session management is too aggressive with "another device" detection
  return null;

  /* Original implementation below - re-enable when backend session management is fixed
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const intervalRef = useRef(null);
  const isCheckingRef = useRef(false);
  const hasNotifiedRef = useRef(false);

  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

    const isLoggedIn = () => {
      return localStorage.getItem('userId') || 
             localStorage.getItem('isAdmin') || 
             localStorage.getItem('studentEmail') ||
             localStorage.getItem('coordinatorEmail');
    };

    const isProtectedRoute = () => {
      const path = location.pathname;
      const publicPaths = ['/', '/student', '/reset-password', '/privacy', '/terms', '/contact'];
      return !publicPaths.includes(path) && isLoggedIn();
    };

    const checkSession = async () => {
      if (isCheckingRef.current || !isLoggedIn() || !isProtectedRoute()) return;
      isCheckingRef.current = true;
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
          if (response.status === 401 && !hasNotifiedRef.current && isProtectedRoute()) {
            hasNotifiedRef.current = true;
            let errorData = null;
            try { errorData = await response.json(); } catch {}
            localStorage.clear();
            if (errorData && errorData.code === 'SESSION_REPLACED') {
              toast.error('Your account was accessed from another device. Please login again.');
            } else {
              toast.error('Your session has expired. Please login again.');
            }
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            setTimeout(() => navigate('/', { replace: true }), 1000);
          }
        }
      } catch (error) {}
      finally { isCheckingRef.current = false; }
    };

    if (isProtectedRoute()) {
      const initialTimeout = setTimeout(checkSession, 5000);
      intervalRef.current = setInterval(checkSession, 30000);
      return () => {
        clearTimeout(initialTimeout);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      hasNotifiedRef.current = false;
    }
  }, [navigate, toast, location.pathname]);

  return null;
  */
}
