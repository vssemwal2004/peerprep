import { lazy, Suspense, useCallback, useMemo, useState, createContext, useContext } from 'react';

const loadToastRenderer = () => import('./AnimatedToastContainer');
const AnimatedToastContainer = lazy(loadToastRenderer);

const ToastContext = createContext();
const MAX_TOASTS = 4;
export const DEFAULT_TOAST_DURATION = 4500;
const ACTION_TOAST_DURATION = 9000;

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

/** The toast API when a ToastProvider is present, otherwise null (for components that only sometimes toast). */
export const useOptionalToast = () => useContext(ToastContext) || null;

/**
 * Normalise every call shape into one toast object:
 *   toast.success('Saved')                         (existing calls)
 *   toast.info('Saved', { title, duration })
 *   toast.show({ type, title, message, avatar, actions, duration, id })
 */
export function buildToast(input, type = 'info', options = {}) {
  const base = typeof input === 'object' && input !== null && !Array.isArray(input)
    ? { ...input }
    : { ...options, message: input };
  const actions = Array.isArray(base.actions) ? base.actions.filter((action) => action && action.label).slice(0, 2) : [];
  return {
    id: base.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: ['success', 'error', 'warning', 'info', 'peer'].includes(base.type) ? base.type : type,
    title: base.title ? String(base.title) : '',
    message: base.message === undefined || base.message === null ? '' : String(base.message),
    avatar: base.avatar || null,
    actions,
    onClick: typeof base.onClick === 'function' ? base.onClick : null,
    // 0 keeps the toast until dismissed. Toasts with buttons stay longer so there is time to act.
    duration: Number.isFinite(base.duration) ? Math.max(0, base.duration) : actions.length ? ACTION_TOAST_DURATION : DEFAULT_TOAST_DURATION,
  };
}

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((input, type = 'info', options = {}) => {
    const next = buildToast(input, type, options);
    setToasts((prev) => {
      // Same id replaces in place (e.g. a repeated realtime event); the newest shows on top.
      const rest = prev.filter((toast) => toast.id !== next.id);
      return [next, ...rest].slice(0, MAX_TOASTS);
    });
    return next.id;
  }, []);

  const toast = useMemo(() => ({
    success: (message, options) => addToast(message, 'success', options),
    error: (message, options) => addToast(message, 'error', options),
    warning: (message, options) => addToast(message, 'warning', options),
    info: (message, options) => addToast(message, 'info', options),
    show: (config) => addToast(config, config?.type || 'info'),
    dismiss: removeToast,
  }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toasts.length > 0 && (
        <Suspense fallback={null}>
          <AnimatedToastContainer toasts={toasts} removeToast={removeToast} />
        </Suspense>
      )}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
