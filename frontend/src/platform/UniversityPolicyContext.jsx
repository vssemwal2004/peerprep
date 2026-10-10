/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { isUniversityDeployment, moduleEnabled, pathAllowed } from './universityPermissions';

const UniversityPolicyContext = createContext(null);

export function UniversityPolicyProvider({ children }) {
  const { user, authChecked } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [status, setStatus] = useState(isUniversityDeployment ? 'loading' : 'ready');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!isUniversityDeployment || !authChecked || !user) {
      setPermissions(null);
      setStatus(isUniversityDeployment ? 'loading' : 'ready');
      return undefined;
    }
    let mounted = true;
    const load = async () => {
      try {
        const policy = await api.universityPolicy();
        if (!mounted) return;
        if (!policy?.active || !policy.permissions) throw new Error('University permissions are unavailable');
        setPermissions((current) => JSON.stringify(current) === JSON.stringify(policy.permissions) ? current : policy.permissions);
        setStatus('ready');
      } catch {
        if (mounted) {
          setPermissions(null);
          setStatus('error');
        }
      }
    };
    setStatus('loading');
    load();
    const timer = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [authChecked, user, revision]);

  return <UniversityPolicyContext.Provider value={{ permissions, status, refresh,
    allowsModule: (name) => !isUniversityDeployment || moduleEnabled(permissions, name),
    allowsPath: (path, role, search) => !isUniversityDeployment || pathAllowed(path, permissions, role, search),
  }}>{children}</UniversityPolicyContext.Provider>;
}

export function useUniversityPolicy() {
  const value = useContext(UniversityPolicyContext);
  if (!value) throw new Error('UniversityPolicyProvider is required');
  return value;
}
