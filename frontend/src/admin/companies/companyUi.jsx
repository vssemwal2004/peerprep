import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Users, X } from 'lucide-react';
import { card, inputClass, primaryButton, secondaryButton } from '../quickprep/ui';
import { PAGE_SIZE } from './companyHelpers';

// Small pieces shared by the Suggested companies views.

const STATUS = {
  pending: ['Pending', 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20', 'bg-amber-500'],
  approved: ['Approved', 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20', 'bg-emerald-500'],
  merged: ['Merged', 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20', 'bg-violet-500'],
  rejected: ['Rejected', 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20', 'bg-rose-500'],
};
export function CompanyStatus({ status, mergedInto }) {
  const [label, tone, dot] = STATUS[status] || STATUS.pending;
  return <span className={`inline-flex max-w-[13rem] items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${tone}`}>
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />{label}
    {status === 'merged' && mergedInto?.name && <><ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="sr-only">into</span><span className="truncate" title={mergedInto.name}>{mergedInto.name}</span></>}
  </span>;
}

/** Thin bar for "how close is this to the vote threshold". */
export function MiniMeter({ value, of, label }) {
  const width = of ? Math.min(100, Math.round((value / of) * 100)) : 0;
  return <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100} aria-label={label} title={label}>
    <div className={`h-full rounded-full ${width >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${width}%` }} />
  </div>;
}

export function TableSkeleton({ rows = 5 }) {
  return <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, key) => <div key={key} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />)}</div>;
}

export function EmptyState({ icon: Icon, title, children }) {
  return <div className="px-6 py-14 text-center">
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400"><Icon className="h-6 w-6" aria-hidden="true" /></span>
    <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-zinc-100">{title}</p>
    {children && <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500 dark:text-zinc-400">{children}</p>}
  </div>;
}

export function Pager({ pagination, count, onPage, disabled }) {
  const { page = 1, limit = PAGE_SIZE, total = 0, pages = 1 } = pagination || {};
  const from = count ? (page - 1) * limit + 1 : 0;
  const pagerButton = 'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-[12px] text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
    <span>Showing <span className="font-semibold tabular-nums text-slate-700 dark:text-zinc-200">{from}–{from ? from + count - 1 : 0}</span> of <span className="tabular-nums">{total}</span></span>
    {pages > 1 && <div className="flex items-center gap-1.5">
      <button type="button" className={pagerButton} disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Prev</button>
      <span className="px-1 tabular-nums">Page {page} of {pages}</span>
      <button type="button" className={pagerButton} disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </div>}
  </div>;
}

/** Centered form dialog; Escape or the backdrop closes it and focus returns to where it came from. */
export function Modal({ title, description, submitLabel, disabled, busy, error, onSubmit, onClose, children }) {
  const titleId = useId();
  const panel = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const key = (event) => { if (event.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    panel.current?.querySelector('input, button[type="submit"]')?.focus();
    return () => { document.removeEventListener('keydown', key); previous?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-[2px] sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={(event) => { event.preventDefault(); if (!disabled && !busy) onSubmit(); }}
      className={`${card} w-full max-w-md p-5 shadow-2xl shadow-slate-900/20`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-slate-950 dark:text-zinc-50">{title}</h2>
          {description && <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-zinc-400">{description}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
        <button type="submit" disabled={disabled || busy} className={primaryButton}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  </div>, document.body);
}

/** "Votes needed" stat card with an inline editor for the threshold. */
export function ThresholdCard({ threshold, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const number = Number(value);
  const valid = /^\d+$/.test(value.trim()) && number >= 1 && number <= 1000;
  const save = async (event) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const saved = await onSave(number);
    setSaving(false);
    if (saved) setEditing(false);
  };
  return <div className={`${card} relative overflow-hidden p-4`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">{editing ? <label htmlFor={inputId}>Votes needed per tag</label> : 'Votes needed'}</p>
        {editing ? <form onSubmit={save} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input id={inputId} type="number" min={1} max={1000} step={1} inputMode="numeric" autoFocus value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={!valid}
            className={`${inputClass} w-20 px-2.5 py-1.5 tabular-nums`} />
          <button type="submit" disabled={!valid || saving} className={`${primaryButton} px-3 py-1.5`}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setEditing(false)} aria-label="Cancel threshold change" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X className="h-4 w-4" /></button>
        </form>
          : <div className="mt-1.5 flex items-baseline gap-2.5">
            <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-slate-950 dark:text-zinc-50">{threshold ?? '—'}</p>
            <button type="button" disabled={threshold == null} onClick={() => { setValue(String(threshold)); setEditing(true); }} className="rounded text-[12.5px] font-semibold text-sky-700 hover:underline disabled:opacity-40 dark:text-sky-300">Change</button>
          </div>}
        <p className={`mt-1.5 truncate text-[11.5px] ${editing && !valid ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-zinc-500'}`}>{editing ? 'A whole number from 1 to 1000' : 'Different students per question tag'}</p>
      </div>
      {!editing && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/25"><Users className="h-5 w-5" aria-hidden="true" /></span>}
    </div>
  </div>;
}
