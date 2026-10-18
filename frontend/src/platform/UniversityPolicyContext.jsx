/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { isUniversityDeployment, moduleEnabled, pathAllowed } from './universityPermissions';
import { returnToLogin } from '../auth/sessionNotice';

const UniversityPolicyContext = createContext(null);

export function UniversityPolicyProvider({ children }) {
  const { user, authChecked, logout } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [status, setStatus] = useState(isUniversityDeployment ? 'loading' : 'ready');
  const [serviceMessage, setServiceMessage] = useState('');
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
        setServiceMessage('');
        setStatus('ready');
      } catch (error) {
        if (mounted) {
          if (error.response?.status === 401) {
            mounted = false;
            await logout();
            returnToLogin();
            return;
          }
          if (error.response?.data?.code === 'SERVICE_INACTIVE') {
            setPermissions(null);
            setServiceMessage(error.message);
            setStatus('service-inactive');
            return;
          }
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
  }, [authChecked, user, revision, logout]);

  return <UniversityPolicyContext.Provider value={{ permissions, status, serviceMessage, refresh,
    allowsModule: (name) => !isUniversityDeployment || moduleEnabled(permissions, name),
    allowsPath: (path, role, search) => !isUniversityDeployment || pathAllowed(path, permissions, role, search),
  }}>{children}</UniversityPolicyContext.Provider>;
}

export function useUniversityPolicy() {
  const value = useContext(UniversityPolicyContext);
  if (!value) throw new Error('UniversityPolicyProvider is required');
  return value;
}
