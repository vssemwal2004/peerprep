import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleX, Layers, LoaderCircle, Plus, TriangleAlert, X } from 'lucide-react';
import { DifficultyPill, primaryButton, secondaryButton } from './ui';
import { plural } from './format';

/**
 * Shown before "Add to QuickPrep" writes anything: every selected question with the server's verdict (from a
 * dry run), why any are blocked (draft, private, no runnable problem...) and the sheet's total after adding.
 * Only the ready questions are sent when the admin confirms.
 */
export default function QuickPrepAddReviewDialog({ quickprepName, review, meta, adding, onClose, onConfirm, onDeselectBlocked }) {
  const dialogRef = useRef(null), closeRef = useRef(null);
  const titleId = useId();
  const { loading, error, plan } = review;
  const items = plan?.items || [];
  const ready = items.filter((item) => item.ok);
  const blocked = items.filter((item) => !item.ok);
  const current = plan?.currentTotal ?? 0;
  const reasons = Object.entries(blocked.reduce((acc, item) => ({ ...acc, [item.message]: (acc[item.message] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const close = () => { if (!adding) onClose(); };

  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    const locks = [document.body, ...document.querySelectorAll('[data-app-scroll-container]')].map((node) => [node, node.style.overflow]);
    locks.forEach(([node]) => { node.style.overflow = 'hidden'; });
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    closeRef.current?.focus();
    return () => {
      dialog.close?.();
      locks.forEach(([node, overflow]) => { node.style.overflow = overflow; });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const tiles = [
    { label: 'Selected', value: items.length || '—', tone: 'text-slate-900 dark:text-zinc-100' },
    { label: 'Ready to add', value: plan ? ready.length : '—', tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Cannot be added', value: plan ? blocked.length : '—', tone: blocked.length ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400' },
    { label: 'Sheet total after adding', value: plan ? current + ready.length : '—', hint: plan ? `${current} now · max ${plan.max}` : '', tone: 'text-sky-700 dark:text-sky-300' },
  ];

  return createPortal(<dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-platform-popup-root
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 open:flex dark:border-zinc-700 dark:bg-[#242424] dark:text-zinc-100"
    onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    onClose={() => {
      // A browser can still close the dialog natively (e.g. a repeated Esc): keep React in step, or reopen it mid-add.
      const dialog = dialogRef.current;
      if (!dialog?.isConnected) return;
      if (adding) dialog.showModal?.(); else onClose();
    }}>
    <header className="flex items-start gap-3 border-b border-slate-100 p-5 dark:border-zinc-800">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25"><Layers className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-lg font-semibold">Add these questions to the QuickPrep?</h2>
        <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-zinc-400">Adding to <span className="font-semibold text-slate-700 dark:text-zinc-200">{quickprepName}</span>. Review every question before confirming.</p>
      </div>
      <button ref={closeRef} type="button" aria-label="Close" onClick={close} disabled={adding} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
    </header>

    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => <div key={tile.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <dt className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{tile.label}</dt>
          <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tile.tone}`}>{tile.value}</dd>
          {tile.hint && <dd className="text-[11px] text-slate-400">{tile.hint}</dd>}
        </div>)}
      </dl>

      {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Checking the selected questions…</div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"><CircleX className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {plan && blocked.length > 0 && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4 shrink-0" />{blocked.length === items.length ? 'None of the selected questions can be added' : `${plural(blocked.length, 'question')} cannot be added`}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">{reasons.map(([message, count]) => <li key={message} className="rounded-lg bg-white/80 px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900">{count} · {message}</li>)}</ul>
        <p className="mt-2 text-[12.5px] text-rose-800/90 dark:text-rose-200/80">Students can only open published, public questions with a runnable problem. Publish or fix these in the library first{ready.length ? `; only the ${plural(ready.length, 'ready question')} will be added now` : ''}.</p>
      </div>}

      {plan && <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-zinc-800 dark:border-zinc-700">
        {items.map((item, index) => {
          const question = meta[item.id] || {};
          return <li key={item.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${item.ok ? '' : 'bg-rose-50/70 dark:bg-rose-950/20'}`}>
            <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-slate-400">{index + 1}</span>
            {item.ok ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Ready" /> : <CircleX className="h-4 w-4 shrink-0 text-rose-500" aria-label="Blocked" />}
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-medium ${item.ok ? '' : 'text-rose-900 dark:text-rose-200'}`}>{item.title}</span>
              {!item.ok && <span className="block truncate text-[12px] text-rose-600 dark:text-rose-300">{item.message}</span>}
            </span>
            <DifficultyPill difficulty={question.difficulty} />
          </li>;
        })}
      </ol>}
    </div>

    <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 p-4 dark:border-zinc-800">
      {plan && blocked.length > 0 && <button type="button" onClick={() => onDeselectBlocked(blocked.map((item) => item.id))} disabled={adding} className={`${secondaryButton} mr-auto`}>Deselect blocked ({blocked.length})</button>}
      <button type="button" onClick={close} disabled={adding} className={secondaryButton}>Cancel</button>
      <button type="button" onClick={() => onConfirm(ready.map((item) => item.id))} disabled={!ready.length || adding || loading} className={primaryButton}>
        {adding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{adding ? 'Adding…' : `Add ${plural(ready.length, 'question')}`}
      </button>
    </footer>
  </dialog>, document.body);
}
