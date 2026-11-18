import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, CheckCircle2, Info, Users, X, XCircle } from 'lucide-react';

// Toast buttons. Accept / Decline always use green / red.
const ACTION_VARIANTS = {
  primary: 'bg-sky-600 text-white shadow-sm hover:bg-sky-700 focus-visible:ring-sky-500',
  accept: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500',
  decline: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-500',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-sky-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10',
};

const TONES = {
  success: { Icon: CheckCircle2, label: 'Success', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  error: { Icon: XCircle, label: 'Error', bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
  warning: { Icon: AlertTriangle, label: 'Warning', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' },
  info: { Icon: Info, label: 'Notice', bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
  peer: { Icon: Users, label: 'Prep Mates', bar: 'bg-gradient-to-r from-sky-500 to-indigo-500', chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
};

function initialsOf(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'PP';
}

function ToastAvatar({ avatar }) {
  const [failed, setFailed] = useState(false);
  if (avatar?.url && !failed) {
    return <img src={avatar.url} alt="" onError={() => setFailed(true)} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-white dark:ring-[#242424]" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-xs font-bold text-white ring-2 ring-white dark:ring-[#242424]">
      {initialsOf(avatar?.name)}
    </span>
  );
}

function Toast({ toast, onRemove }) {
  const { id, type, title, message, avatar, actions, duration, onClick } = toast;
  const tone = TONES[type] || TONES.info;
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(null);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  // Auto-dismiss that pauses while the pointer or keyboard focus is on the toast.
  useEffect(() => {
    if (!duration || paused || busy !== null) return undefined;
    startedAt.current = Date.now();
    const timer = setTimeout(() => onRemove(id), Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [duration, paused, busy, id, onRemove]);

  const runAction = async (action, index) => {
    setBusy(index);
    try {
      await action.onClick?.();
    } finally {
      onRemove(id);
    }
  };

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);
  const hasBody = Boolean(onClick);

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-white/10 dark:bg-[#242424]/95 dark:shadow-black/50 sm:w-[23rem]"
    >
      <div className="flex items-start gap-3 p-3.5 pr-10">
        {avatar ? <ToastAvatar avatar={avatar} /> : (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}>
            <tone.Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        )}
        <div
          className={`min-w-0 flex-1 ${hasBody ? 'cursor-pointer' : ''}`}
          onClick={hasBody ? () => { onClick(); onRemove(id); } : undefined}
          onKeyDown={hasBody ? (event) => { if (event.key === 'Enter') { onClick(); onRemove(id); } } : undefined}
          role={hasBody ? 'button' : undefined}
          tabIndex={hasBody ? 0 : undefined}
        >
          {avatar || title ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-gray-500">{tone.label}</p>
          ) : <span className="sr-only">{tone.label}: </span>}
          {title && <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{title}</p>}
          {message && (
            <p className={`break-words text-sm leading-snug ${title ? 'mt-0.5 text-slate-600 dark:text-gray-300' : 'pt-1.5 font-semibold text-slate-800 dark:text-gray-100'}`}>{message}</p>
          )}
          {actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((action, index) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={busy !== null}
                  onClick={(event) => { event.stopPropagation(); runAction(action, index); }}
                  className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 dark:focus-visible:ring-offset-[#242424] ${
                    ACTION_VARIANTS[action.variant] || ACTION_VARIANTS.secondary
                  }`}
                >
                  {busy === index ? 'Working…' : (
                    <>
                      {action.variant === 'accept' && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {action.variant === 'decline' && <X className="h-3.5 w-3.5" aria-hidden="true" />}
                      {action.label}
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/10 dark:hover:text-gray-100"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
      {duration > 0 && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-slate-100 dark:bg-white/5" aria-hidden="true">
          <span
            className={`block h-full origin-left ${tone.bar}`}
            style={{
              animation: `pp-toast-timer ${duration}ms linear forwards`,
              animationPlayState: paused || busy !== null ? 'paused' : 'running',
            }}
          />
        </span>
      )}
    </motion.div>
  );
}

export default function AnimatedToastContainer({ toasts, removeToast }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-[calc(var(--mobile-bar-height,0px)+0.75rem)] z-[9999] flex flex-col items-stretch gap-2.5 sm:inset-x-auto sm:right-4 sm:top-20 sm:items-end"
      aria-label="Notifications"
    >
      <style>{'@keyframes pp-toast-timer{from{transform:scaleX(1)}to{transform:scaleX(0)}}'}</style>
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
