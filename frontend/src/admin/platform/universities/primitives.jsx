import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Copy, KeyRound, X } from 'lucide-react';
import { avatarTone, initials, logoSrc } from './universityModel';
import { dangerButton, focusRing, primaryButton, secondaryButton } from './styles';

/** Locks page scrolling (including the app's own scroll container) while an overlay is open. */
function useOverlay(dialogRef, initialFocusRef) {
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const locks = [document.body, ...document.querySelectorAll('[data-app-scroll-container]')].map((node) => [node, node.style.overflow]);
    locks.forEach(([node]) => { node.style.overflow = 'hidden'; });
    if (dialog?.showModal && !dialog.open) dialog.showModal(); else dialog?.setAttribute('open', '');
    (initialFocusRef?.current || dialog?.querySelector('[data-autofocus]') || dialog)?.focus?.({ preventScroll: true });
    return () => {
      if (dialog?.open) dialog.close?.();
      locks.forEach(([node, overflow]) => { node.style.overflow = overflow; });
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [dialogRef, initialFocusRef]);
}

/**
 * Centered modal on the native <dialog> element: the rest of the page is inert while it is open,
 * Escape closes it unless `dismissible` is false, and focus returns to the opener on close.
 */
export function Modal({ title, description, icon: Icon, tone = 'sky', onClose, dismissible = true, size = 'max-w-lg', children, footer, initialFocusRef }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(dialogRef, initialFocusRef);
  const tones = { sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300', rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300', amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' };
  return createPortal(<dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} data-platform-popup-root
    className={`m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] ${size} overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-zinc-700 dark:bg-[#242424] dark:text-zinc-100`}
    onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }}
    onClick={(event) => { if (dismissible && event.target === event.currentTarget) onClose(); }}>
    <div className="flex max-h-[92dvh] flex-col">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
        {Icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.sky}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold text-slate-950 dark:text-zinc-50">{title}</h2>
          {description && <p id={descriptionId} className="mt-0.5 text-sm text-slate-500 dark:text-zinc-400">{description}</p>}
        </div>
        {dismissible && <button type="button" onClick={onClose} aria-label="Close" className={`shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${focusRing}`}><X className="h-4 w-4" /></button>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">{footer}</footer>}
    </div>
  </dialog>, document.body);
}

/** Right-hand panel (full screen on phones) for working on one record without leaving the list. */
export function Drawer({ labelledBy, onClose, children }) {
  const dialogRef = useRef(null);
  useOverlay(dialogRef);
  return createPortal(<dialog ref={dialogRef} aria-labelledby={labelledBy} data-platform-popup-root
    className="fixed inset-0 m-0 ml-auto h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 dark:bg-[#1a1a1a] dark:text-zinc-100 sm:w-[min(46rem,100vw)] sm:border-l sm:border-slate-200 dark:sm:border-zinc-800"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex h-full flex-col">{children}</div>
  </dialog>, document.body);
}

/**
 * Accessible replacement for window.confirm. With `requireText`, the confirm button stays
 * disabled until that exact text is typed, for irreversible actions.
 */
export function ConfirmDialog({ title, description, children, confirmLabel = 'Confirm', tone = 'primary', requireText = '', busy = false, onConfirm, onClose }) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const cancelRef = useRef(null);
  const blocked = Boolean(requireText) && typed.trim() !== requireText;
  return <Modal title={title} icon={AlertTriangle} tone={tone === 'danger' ? 'rose' : 'amber'} onClose={busy ? () => {} : onClose} dismissible={!busy} initialFocusRef={requireText ? undefined : cancelRef}
    footer={<>
      <button ref={cancelRef} type="button" className={secondaryButton} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={tone === 'danger' ? dangerButton : primaryButton} disabled={busy || blocked} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button>
    </>}>
    <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
      {description && <p>{description}</p>}
      {children}
      {requireText && <form onSubmit={(event) => { event.preventDefault(); if (!blocked && !busy) onConfirm(); }}>
        <label htmlFor={inputId} className="block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">Type <span className="rounded bg-slate-100 px-1 font-mono dark:bg-zinc-800">{requireText}</span> to confirm</label>
        <input id={inputId} data-autofocus autoComplete="off" spellCheck={false} value={typed} onChange={(event) => setTyped(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-rose-500/15" />
      </form>}
    </div>
  </Modal>;
}

/** Labelled on/off switch. `description` is announced with the label. */
export function Switch({ checked, onChange, label, description, disabled = false, busy = false }) {
  const labelId = useId();
  const descriptionId = useId();
  return <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <p id={labelId} className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{label}</p>
      {description && <p id={descriptionId} className="mt-0.5 text-[12.5px] leading-snug text-slate-500 dark:text-zinc-400">{description}</p>}
    </div>
    <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelId} aria-describedby={description ? descriptionId : undefined} aria-busy={busy || undefined}
      disabled={disabled || busy} onClick={() => onChange(!checked)}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-zinc-600'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'} ${busy ? 'animate-pulse' : ''}`} />
    </button>
  </div>;
}

/** WAI-ARIA tabs with arrow-key navigation. Panels are rendered by the caller with `tabPanelProps`. */
export function Tabs({ tabs, value, onChange, label, idBase, size = 'md' }) {
  const refs = useRef({});
  const onKeyDown = (event) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    let next = null;
    if (step) next = tabs[(index + step + tabs.length) % tabs.length];
    if (event.key === 'Home') next = tabs[0];
    if (event.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next.value);
    refs.current[next.value]?.focus();
  };
  return <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
    {tabs.map((tab) => {
      const active = tab.value === value;
      const Icon = tab.icon;
      return <button key={tab.value} ref={(node) => { refs.current[tab.value] = node; }} type="button" role="tab" id={`${idBase}-tab-${tab.value}`} aria-selected={active} aria-controls={`${idBase}-panel-${tab.value}`} tabIndex={active ? 0 : -1}
        onClick={() => onChange(tab.value)}
        className={`inline-flex shrink-0 items-center gap-2 border-b-2 font-semibold transition ${size === 'sm' ? 'px-2.5 py-2.5 text-[13px]' : 'px-3 py-3 text-sm'} ${focusRing} ${active ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100'}`}>
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}{tab.label}
        {tab.count !== undefined && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{tab.count}</span>}
      </button>;
    })}
  </div>;
}

const LOGO_SIZES = { sm: ['h-9 w-9 rounded-lg text-xs', 36], md: ['h-11 w-11 rounded-xl text-sm', 44], lg: ['h-16 w-16 rounded-2xl text-lg', 64], xl: ['h-24 w-24 rounded-2xl text-2xl', 96] };

/** University logo, or deterministic coloured initials when there is none or it fails to load. */
export function UniversityLogo({ university, size = 'md', src: overrideSrc }) {
  const [classes, pixels] = LOGO_SIZES[size] || LOGO_SIZES.md;
  const url = overrideSrc || university?.logo?.url;
  const [failedUrl, setFailedUrl] = useState('');
  if (url && failedUrl !== url) {
    return <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 ${classes}`}>
      <img src={overrideSrc ? url : logoSrc(url, pixels * 2)} alt={`${university?.name || 'University'} logo`} width={pixels} height={pixels} loading="lazy" decoding="async"
        onError={() => setFailedUrl(url)} className="h-full w-full object-contain p-0.5" />
    </span>;
  }
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center bg-gradient-to-br font-bold text-white shadow-sm ${avatarTone(university?.universityId || university?.name)} ${classes}`}>{initials(university?.name, university?.universityId)}</span>;
}

const BADGE = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset';
export function StatusBadge({ active }) {
  return active
    ? <span className={`${BADGE} bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Active</span>
    : <span className={`${BADGE} bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700`}><span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />Disabled</span>;
}

const HEALTH = {
  online: ['Online', 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20', 'bg-emerald-500'],
  stale: ['Stale', 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20', 'bg-amber-500'],
  never: ['Never reported', 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700', 'bg-slate-400'],
};
export function HealthBadge({ health, title }) {
  const [label, tone, dot] = HEALTH[health] || HEALTH.never;
  return <span className={`${BADGE} ${tone}`} title={title}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />{label}</span>;
}

/** Form field wrapper: label, control, hint and error wired together for screen readers. */
export function Field({ label, hint, error, required = false, children, id }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return <div className="min-w-0">
    <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{label}{required && <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>}</label>
    {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
    {hint && !error && <p id={hintId} className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">{hint}</p>}
    {error && <p id={errorId} className="mt-1 text-[12px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
  </div>;
}

/** One-time API key display. The key is never stored after this panel is dismissed. */
export function ApiKeyPanel({ universityId, apiKey, reason = 'created' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  };
  return <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
    <div className="flex items-start gap-2.5">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Save this API key now</p>
        <p className="mt-0.5 text-[13px] text-amber-800 dark:text-amber-200">
          Set <code className="rounded bg-white/70 px-1 font-mono text-[12px] dark:bg-black/20">PEERPREP_SHARED_API_KEY</code> on the <strong>{universityId}</strong> deployment. It will not be shown again{reason === 'rotated' ? ', and the previous key has stopped working' : ''}.
        </p>
      </div>
    </div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <code className="block min-w-0 flex-1 select-all break-all rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-[13px] text-slate-900 dark:border-amber-500/20 dark:bg-zinc-950 dark:text-zinc-100">{apiKey}</code>
      <button type="button" onClick={copy} className={secondaryButton}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button>
    </div>
    <p className="sr-only" role="status">{copied ? 'API key copied to clipboard' : ''}</p>
  </div>;
}

/** Blocking dialog for a freshly issued key: it closes only after the admin confirms they saved it. */
export function ApiKeyDialog({ issued, onDone }) {
  const [saved, setSaved] = useState(false);
  const checkboxId = useId();
  return <Modal title={issued.reason === 'rotated' ? 'New API key issued' : 'API key issued'} icon={KeyRound} tone="amber" onClose={onDone} dismissible={false}
    footer={<button type="button" className={primaryButton} disabled={!saved} onClick={onDone}>I saved the key</button>}>
    <ApiKeyPanel universityId={issued.universityId} apiKey={issued.value} reason={issued.reason} />
    <label htmlFor={checkboxId} className="mt-4 flex items-start gap-2.5 text-sm text-slate-700 dark:text-zinc-200">
      <input id={checkboxId} type="checkbox" data-autofocus checked={saved} onChange={(event) => setSaved(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
      I have stored this key somewhere safe and understand it cannot be shown again.
    </label>
  </Modal>;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return <div className="px-6 py-14 text-center">
    {Icon && <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400"><Icon className="h-6 w-6" aria-hidden="true" /></span>}
    <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-zinc-100">{title}</h3>
    {children && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-zinc-400">{children}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>;
}

export function SectionCard({ title, description, actions, children, className = '' }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-[#242424] ${className}`}>
    {(title || actions) && <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-zinc-800 sm:px-5">
      <div className="min-w-0">
        {title && <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-50">{title}</h3>}
        {description && <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>}
    <div className="px-4 py-4 sm:px-5">{children}</div>
  </section>;
}
