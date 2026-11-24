import { CheckCircle2, Mail } from 'lucide-react';

/**
 * "Also send as email" in the announcement form: ticking it opens the email dialog (template,
 * text/HTML, preview, students, test). The tick shows only while the dialog is the next step;
 * after a send it reports how many were queued.
 */
export function EmailToggle({ onOpen, sent = null }) {
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
      <input type="checkbox" checked={false} onChange={(event) => { if (event.target.checked) onOpen(); }}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-white"><Mail className="h-4 w-4 text-sky-600" />Also send as email</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">Choose an email template, edit it, preview it, pick the students and send a test first.</span>
        {sent ? <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Email queued for {Number(sent.queued).toLocaleString()} student{sent.queued === 1 ? '' : 's'}. Tick again to send to more.</span> : null}
      </span>
    </label>
  );
}
