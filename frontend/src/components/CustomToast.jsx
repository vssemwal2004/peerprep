import { lazy, Suspense, useCallback, useMemo, useState, createContext, useContext } from 'react';

const loadToastRenderer = () => import('./AnimatedToastContainer');
const AnimatedToastContainer = lazy(loadToastRenderer);

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove after 4 seconds
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const toast = useMemo(() => ({
    success: (message) => addToast(message, 'success'),
    error: (message) => addToast(message, 'error'),
    info: (message) => addToast(message, 'info'),
  }), [addToast]);

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
