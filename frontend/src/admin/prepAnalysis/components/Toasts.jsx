/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

const ToastContext = createContext(null);
const TONES = {
  busy: { Icon: Loader2, icon: "animate-spin text-sky-500" },
  done: { Icon: CheckCircle2, icon: "text-emerald-500" },
  error: { Icon: AlertCircle, icon: "text-rose-500" },
};

/**
 * Small notes in the bottom-right corner (downloads and other background work).
 * show({ tone, title, text }) returns an id; update(id, patch) changes it; a "done" or
 * "error" note closes itself after a few seconds.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const reduced = useReducedMotion();
  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const schedule = useCallback((id, tone) => { if (tone !== "busy") setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000); }, [dismiss]);
  const show = useCallback((toast) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current.slice(-3), { id, tone: "done", ...toast }]);
    schedule(id, toast.tone || "done");
    return id;
  }, [schedule]);
  const update = useCallback((id, patch) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast)));
    schedule(id, patch.tone);
  }, [schedule]);
  const value = useMemo(() => ({ show, update, dismiss }), [dismiss, show, update]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[300] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2" data-platform-popup-root>
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const tone = TONES[toast.tone] || TONES.done;
              const Icon = tone.Icon;
              return (
                <motion.div key={toast.id} layout={!reduced} initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.14)] dark:border-gray-700 dark:bg-gray-900">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{toast.title}</p>
                    {toast.text && <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-slate-400" title={toast.text}>{toast.text}</p>}
                  </div>
                  <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** { show, update, dismiss }; a no-op outside the provider so components work anywhere. */
export function useToasts() {
  return useContext(ToastContext) || { show: () => 0, update: () => {}, dismiss: () => {} };
}
