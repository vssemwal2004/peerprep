import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Loader2, LogIn, Monitor, ShieldAlert } from 'lucide-react';

const timeText = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today, ${time}` : `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
};

const agoText = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : timeText(value);
};

function Detail({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="ml-auto truncate font-semibold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

/**
 * A modal that only its buttons close: no backdrop click, and Escape does nothing (the choice has
 * to be made). Focus starts on `initialFocus` and stays inside.
 */
function Modal({ titleId, describedBy, initialFocus, tone, icon: Icon, title, children, actions }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    initialFocus.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll('button:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, [initialFocus]);
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20',
  };
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" data-platform-popup-root>
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" aria-hidden="true" />
      <section ref={panelRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy}
        className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl motion-safe:animate-[dashboard-rise_240ms_cubic-bezier(0.22,1,0.36,1)] dark:border-gray-700 dark:bg-gray-900">
        <div className="px-6 pb-5 pt-6">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full ring-8 ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <h2 id={titleId} className="mt-4 text-[17px] font-bold leading-6 text-slate-900 dark:text-white">{title}</h2>
          {children}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end dark:border-gray-800 dark:bg-white/[0.02]">
          {actions}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

const buttonBase = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-gray-900';

/**
 * Sign-in found the account still signed in elsewhere. `session` = { device, signedInAt, lastActiveAt }.
 * Continue ends that session (it will see "Your session has expired"); Cancel signs in nowhere.
 */
export function SessionConflictDialog({ session, busy = false, onContinue, onCancel }) {
  const titleId = useId();
  const textId = useId();
  const cancelRef = useRef(null);
  return (
    <Modal titleId={titleId} describedBy={textId} initialFocus={cancelRef} tone="sky" icon={Monitor} title="You're already signed in on another device"
      actions={<>
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}
          className={`${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/[0.06]`}>
          Cancel
        </button>
        <button type="button" onClick={onContinue} disabled={busy} className={`${buttonBase} bg-sky-600 text-white shadow-sm hover:bg-sky-700`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Sign out other device &amp; continue
        </button>
      </>}>
      <p id={textId} className="mt-1.5 text-[13.5px] leading-5 text-slate-600 dark:text-slate-300">
        PeerPrep allows one active session per account. Continuing here will sign out the other device, and anything unsaved there will be lost.
      </p>
      <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-gray-700 dark:bg-white/[0.03]">
        <Detail icon={Monitor} label="Device" value={session?.device || 'Unknown device'} />
        <Detail icon={LogIn} label="Signed in" value={timeText(session?.signedInAt)} />
        <Detail icon={Clock} label="Last active" value={agoText(session?.lastActiveAt)} />
      </div>
      <p className="mt-3 text-[12px] leading-4 text-slate-500 dark:text-slate-400">Not you? Continue, then change your password.</p>
    </Modal>
  );
}

/**
 * This session was ended: `ended` = { code: 'SESSION_REPLACED' | 'SESSION_ENDED', session }.
 * Nothing happens until OK, which signs out on this browser.
 */
export function SessionEndedDialog({ ended, busy = false, onConfirm }) {
  const titleId = useId();
  const textId = useId();
  const okRef = useRef(null);
  const replaced = ended?.code === 'SESSION_REPLACED';
  return (
    <Modal titleId={titleId} describedBy={textId} initialFocus={okRef} tone="amber" icon={ShieldAlert} title="Your session has expired"
      actions={
        <button ref={okRef} type="button" onClick={onConfirm} disabled={busy} className={`${buttonBase} min-w-[120px] bg-sky-600 text-white shadow-sm hover:bg-sky-700`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}OK
        </button>
      }>
      <p id={textId} className="mt-1.5 text-[13.5px] leading-5 text-slate-600 dark:text-slate-300">
        {replaced
          ? 'Your account was signed in on another device, so this session was signed out. Sign in again to continue here.'
          : 'This account was signed out. Sign in again to continue.'}
      </p>
      {replaced && (ended.session?.device || ended.session?.signedInAt) && (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-gray-700 dark:bg-white/[0.03]">
          <Detail icon={Monitor} label="New sign-in" value={ended.session?.device || 'Another device'} />
          <Detail icon={Clock} label="At" value={timeText(ended.session?.signedInAt)} />
        </div>
      )}
      <p className="mt-3 text-[12px] leading-4 text-slate-500 dark:text-slate-400">If this wasn't you, sign in and change your password.</p>
    </Modal>
  );
}
