import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

function Toast({ toast, onRemove }) {
  const { id, message, type } = toast;

  const icon = type === 'success'
    ? <CheckCircle className="w-5 h-5 text-green-600" />
    : type === 'error'
      ? <AlertCircle className="w-5 h-5 text-red-600" />
      : <Info className="w-5 h-5 text-blue-600" />;

  const styles = type === 'success'
    ? 'bg-green-50 border-green-200 text-green-800'
    : type === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-blue-50 border-blue-200 text-blue-800';

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.8 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`${styles} pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border min-w-[300px] max-w-[400px]`}
    >
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 text-sm font-medium break-words">{message}</div>
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="flex-shrink-0 p-1 hover:bg-white/50 rounded transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export default function AnimatedToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
