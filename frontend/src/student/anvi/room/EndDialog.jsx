import { useEffect, useRef } from "react";
import { Loader2, PhoneOff, X } from "lucide-react";

/**
 * Confirms ending the interview. Traps focus, closes on Escape, and returns focus to its opener.
 */
export default function EndDialog({ busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  // Focus moves into the dialog on open and back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement;
    cancelRef.current?.focus();
    return () => { if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) { onCancel(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      // Keep Tab and Shift+Tab inside the modal.
      const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-black/60 sm:items-center" role="presentation" onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="anvi-end-title" aria-describedby="anvi-end-body"
        className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/10 dark:bg-[#1a1e27] dark:text-zinc-100 dark:shadow-black/50 dark:ring-white/10" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"><PhoneOff className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="anvi-end-title" className="text-base font-semibold text-slate-900 dark:text-white">End interview now?</h2>
            <p id="anvi-end-body" className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-zinc-300">ANVI may still have more to discuss. Your answers so far will be saved for your report.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:outline-violet-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}
            className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-900/15 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/10 dark:focus-visible:outline-violet-400">Keep going</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}End interview
          </button>
        </div>
      </div>
    </div>
  );
}
