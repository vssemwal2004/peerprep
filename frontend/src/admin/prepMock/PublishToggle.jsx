import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Globe, Loader2, Pencil, ShieldOff, X } from 'lucide-react';
import { api } from '../../utils/api';
import { DIALOG_BUTTONS as dialogButton, builderPathFor, isLiveMock, isReadyMock } from './mockAccessModel';

// Prep Mock publish switch (All Mocks rows) and its confirmation popup. A mock is "live" when it is
// published and visible; a live mock reaches every university whose PrepMock grant and dates are
// active. Unpublishing turns it back into a draft (past attempts and reports are kept).

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal frame: portal, dimmed backdrop, Esc and backdrop click close (not while busy), focus moves in
 * on open, Tab stays inside, and focus returns to the opener on close.
 */
export function DialogFrame({ title, subtitle, icon: Icon, tone = 'sky', onClose, busy = false, children, footer, size = 'md', initialFocus, closeDisabled = false }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const close = useCallback(() => { if (!busy && !closeDisabled) onClose(); }, [busy, closeDisabled, onClose]);

  useEffect(() => {
    const opener = document.activeElement;
    const frame = window.requestAnimationFrame(() => {
      const target = (initialFocus && panelRef.current?.querySelector(initialFocus)) || panelRef.current?.querySelector(FOCUSABLE);
      (target || panelRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // On document (not window capture), so a dialog opened on top (AudienceDialog) handles Esc first.
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const tones = {
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  };
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-4">
      <button type="button" tabIndex={-1} aria-label="Close" className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[2px]" onClick={close} />
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full ${widths[size] || widths.md} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-gray-700 dark:bg-gray-900`}>
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-gray-800">
          {Icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.sky}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 dark:border-gray-800 dark:bg-gray-950/40">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}

/**
 * The Live / Draft switch on a mock row. It never changes anything itself: `onToggle` opens the
 * confirmation popup. `size="sm"` drops the text label (tight rows).
 */
export function PublishSwitch({ mock, onToggle, disabled = false, size = 'md' }) {
  const live = isLiveMock(mock);
  const hidden = !live && mock?.lifecycleStatus === 'published';
  const ready = !live && !hidden && isReadyMock(mock);
  const label = live ? 'Live' : hidden ? 'Hidden' : ready ? 'Ready' : 'Draft';
  const title = disabled ? 'Shared by PeerPrep: it cannot be published or unpublished here'
    : live ? 'Live: click to unpublish' : ready ? 'Ready to publish: click to publish' : 'Not live: click to publish';
  return (
    <button type="button" role="switch" aria-checked={live} disabled={disabled} title={title}
      aria-label={`Publish ${mock?.title || 'mock'}`}
      onClick={(event) => { event.stopPropagation(); event.preventDefault(); onToggle?.(mock, !live); }}
      className="group/switch inline-flex items-center gap-2 rounded-full py-0.5 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900">
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${live ? 'bg-emerald-500 group-hover/switch:bg-emerald-600' : 'bg-slate-300 group-hover/switch:bg-slate-400 dark:bg-gray-700 dark:group-hover/switch:bg-gray-600'}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${live ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      {size !== 'sm' && <span className={`text-[11px] font-semibold ${live ? 'text-emerald-700 dark:text-emerald-300' : hidden ? 'text-amber-700 dark:text-amber-300' : ready ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 dark:text-gray-400'}`}>{label}</span>}
    </button>
  );
}

/**
 * Confirmation popup for publishing / unpublishing one mock. `target`: { mock, publish } or null.
 * `onDone()` runs after a successful change (refresh the list); `onOpenBuilder(path)` opens the
 * builder from a publish error.
 */
export function PublishConfirmDialog({ target, onClose, onDone, onOpenBuilder, toast }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setBusy(false); setError(''); }, [target]);
  if (!target?.mock) return null;
  const { mock, publish } = target;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const result = publish ? await api.publishMock(mock._id) : await api.unpublishMock(mock._id);
      toast?.success(publish
        ? `${mock.title || 'Mock'} is live for every university with an active Prep Mock package.`
        : `${mock.title || 'Mock'} unpublished. Students cannot open it until you publish it again.`);
      setBusy(false);
      onDone?.(result);
      onClose();
    } catch (cause) {
      setBusy(false);
      setError(cause?.message || (publish ? 'The mock could not be published.' : 'The mock could not be unpublished.'));
    }
  };

  return (
    <DialogFrame
      size="sm"
      icon={publish ? Globe : ShieldOff}
      tone={publish ? 'emerald' : 'amber'}
      title={publish ? 'Publish this mock?' : 'Unpublish this mock?'}
      subtitle={[mock.company, mock.role].filter(Boolean).join(' · ') || undefined}
      onClose={onClose}
      busy={busy}
      initialFocus={publish ? '[data-confirm]' : '[data-cancel]'}
      footer={<>
        <span className="min-w-0 flex-1" />
        <button type="button" data-cancel onClick={onClose} disabled={busy} className={dialogButton.secondary}>Cancel</button>
        <button type="button" data-confirm onClick={confirm} disabled={busy} className={publish ? dialogButton.success : dialogButton.warning}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? (publish ? 'Publishing…' : 'Unpublishing…') : publish ? 'Publish' : 'Unpublish'}
        </button>
      </>}
    >
      <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-slate-600 dark:text-gray-300">
        <p className="truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" title={mock.title}>{mock.title || 'Untitled mock'}</p>
        {publish ? (
          <p>Every university with an active Prep Mock package gets it straight away, for its students uploaded for Prep Mock. Prep Mocks have no dates of their own: it stays open until you unpublish it (or a university&apos;s package ends).</p>
        ) : (
          <p>Students of every university lose access until it is published again. Past attempts and reports are kept.</p>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>
            {publish && onOpenBuilder && !mock.shared && (
              <button type="button" onClick={() => { onClose(); onOpenBuilder(builderPathFor(mock, error)); }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 dark:bg-gray-900 dark:text-rose-300 dark:ring-rose-900">
                <Pencil className="h-3 w-3" />{/pattern/i.test(error) ? 'Open the builder at Pattern' : 'Open the builder'}
              </button>
            )}
          </div>
        )}
      </div>
    </DialogFrame>
  );
}
