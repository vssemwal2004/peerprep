import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, CheckSquare, Loader2, Mail, Send, X } from "lucide-react";
import { useAnalysisApi } from "../analysisScope";
import { Button, IconButton, focusRing } from "./ui";

const boxClass = `h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-900 ${focusRing}`;

/** A row's tick box; clicking it never opens the row. */
export function RowCheckbox({ checked, onChange, label }) {
  return (
    <input type="checkbox" className={boxClass} checked={checked} aria-label={label}
      onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={onChange} />
  );
}

/** The header tick box: ticks or clears every student on this page. */
export function PageCheckbox({ pageIds, selection }) {
  const ticked = pageIds.filter((id) => selection.has(id)).length;
  const all = pageIds.length > 0 && ticked === pageIds.length;
  return (
    <input type="checkbox" className={boxClass} aria-label={all ? "Clear this page" : "Select this page"} disabled={!pageIds.length}
      checked={all} ref={(node) => { if (node) node.indeterminate = ticked > 0 && !all; }}
      onChange={() => selection.setMany(pageIds, !all)} />
  );
}

/**
 * Shown while students are picked: "N selected · Select all M matching · Clear · Send email".
 * `loadAll` resolves to { ids, total, limit } for every matching student.
 */
export function SelectionBar({ selection, total, loadAll, onEmail, className = "" }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!selection.count) return null;
  const selectAll = async () => {
    setBusy(true); setNote("");
    try {
      const result = await loadAll();
      selection.replace(result.ids || []);
      if (result.total > (result.ids || []).length) setNote(`Only the first ${Number(result.limit).toLocaleString()} can be emailed at once.`);
    } catch (error) { setNote(error.message || "Could not select every student."); }
    finally { setBusy(false); }
  };
  return (
    <div role="status" className={`flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100 ${className}`}>
      <span className="font-semibold tabular-nums">{selection.count.toLocaleString()} selected</span>
      {loadAll && selection.count < total && (
        <button type="button" disabled={busy} onClick={selectAll} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-sky-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-sky-300 ${focusRing}`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}Select all {Number(total).toLocaleString()} matching
        </button>
      )}
      <button type="button" onClick={selection.clear} className={`rounded-md px-1.5 py-0.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ${focusRing}`}>Clear</button>
      {note && <span className="text-[12px] text-amber-700 dark:text-amber-300">{note}</span>}
      <Button tone="primary" size="sm" className="ml-auto" onClick={onEmail}><Mail className="h-3.5 w-3.5" />Send email</Button>
    </div>
  );
}

/**
 * Pick one of the admin's own templates (Settings → Email Templates), preview it for one of the
 * students, and queue it for all of them. `body` is the page's query body (period, scope…).
 */
export function SendEmailDialog({ open, onClose, studentIds, body }) {
  const api = useAnalysisApi();
  const titleId = useId();
  const [templates, setTemplates] = useState({ loading: true, list: [], variables: [], error: "" });
  const [templateId, setTemplateId] = useState("");
  const [preview, setPreview] = useState({ loading: false, data: null, error: "" });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const ids = useMemo(() => [...studentIds], [studentIds]);
  const previewId = ids[0];
  const bodyKey = JSON.stringify(body || {});

  useEffect(() => {
    if (!open) return undefined;
    setResult(null); setError("");
    const controller = new AbortController();
    api.email.templates(controller.signal)
      .then((data) => {
        setTemplates({ loading: false, list: data.templates || [], variables: data.variables || [], error: "" });
        setTemplateId((current) => current || data.templates?.[0]?.id || "");
      })
      .catch((cause) => { if (cause.name !== "AbortError") setTemplates({ loading: false, list: [], variables: [], error: cause.message }); });
    return () => controller.abort();
  }, [api, open]);

  useEffect(() => {
    if (!open || !templateId || !previewId) { setPreview({ loading: false, data: null, error: "" }); return undefined; }
    const controller = new AbortController();
    setPreview((current) => ({ ...current, loading: true, error: "" }));
    api.email.preview({ ...JSON.parse(bodyKey), templateId, studentId: previewId }, controller.signal)
      .then((data) => setPreview({ loading: false, data, error: "" }))
      .catch((cause) => { if (cause.name !== "AbortError") setPreview({ loading: false, data: null, error: cause.message }); });
    return () => controller.abort();
  }, [api, bodyKey, open, previewId, templateId]);

  // Above the chart popup, and Escape closes only this dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !sending) { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, open, sending]);

  if (!open) return null;
  const chosen = templates.list.find((template) => template.id === templateId);
  const send = async () => {
    if (!chosen || !ids.length) return;
    if (!window.confirm(`Send “${chosen.name}” to ${ids.length.toLocaleString()} student${ids.length === 1 ? "" : "s"}?`)) return;
    setSending(true); setError("");
    try { setResult(await api.email.send({ ...JSON.parse(bodyKey), templateId, studentIds: ids })); }
    catch (cause) { setError(cause.message || "The email could not be sent."); }
    finally { setSending(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4" data-platform-popup-root>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => { if (!sending) onClose(); }} />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950">
        <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-3 dark:border-gray-700">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><Mail className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-bold text-slate-900 dark:text-white">Send email</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">To {ids.length.toLocaleString()} selected student{ids.length === 1 ? "" : "s"}</p>
          </div>
          <IconButton label="Close" onClick={onClose} disabled={sending}><X className="h-4 w-4" /></IconButton>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {result ? (
            <div className="space-y-2 text-[13px]">
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />“{result.template?.name}” queued for {Number(result.queued).toLocaleString()} student{result.queued === 1 ? "" : "s"}.
              </p>
              {result.noEmail > 0 && <p className="text-slate-600 dark:text-slate-300">{result.noEmail} {result.noEmail === 1 ? "student has" : "students have"} no email address and {result.noEmail === 1 ? "was" : "were"} skipped.</p>}
              {result.notFound > 0 && <p className="text-slate-600 dark:text-slate-300">{result.notFound} could not be found and {result.notFound === 1 ? "was" : "were"} skipped.</p>}
              <p className="text-slate-500 dark:text-slate-400">Emails go out in the background. <Link to="/admin/email-queue" className="font-semibold text-sky-700 underline dark:text-sky-300">Open Email Queue</Link> to follow them.</p>
            </div>
          ) : templates.loading ? (
            <p className="flex items-center gap-2 py-8 text-[12.5px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading templates…</p>
          ) : templates.error ? (
            <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4" />{templates.error}</p>
          ) : !templates.list.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-[13px] text-slate-600 dark:border-gray-700 dark:text-slate-300">
              <p className="font-semibold text-slate-800 dark:text-white">No email template yet</p>
              <p className="mt-1">Create one in Settings → Email Templates, then come back.</p>
              <Link to="/admin/settings/email-templates" className="mt-3 inline-flex font-semibold text-sky-700 underline dark:text-sky-300">Open Email Templates</Link>
            </div>
          ) : (
            <>
              <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                Email template
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={sending}
                  className="mt-1 block h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-normal text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100">
                  {templates.list.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                Filled in for each student: {templates.variables.map((variable) => <code key={variable.key} className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700 dark:bg-white/[0.06] dark:text-slate-200">{`{{${variable.key}}}`}</code>)}
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-gray-700">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[12px] dark:border-gray-700 dark:bg-white/[0.03]">
                  <p className="text-slate-500 dark:text-slate-400">Preview for <span className="font-semibold text-slate-700 dark:text-slate-200">{preview.data?.name || "the first selected student"}</span>{preview.data?.to ? ` · ${preview.data.to}` : ""}</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{preview.data?.subject || chosen?.subject || ""}</p>
                </div>
                {preview.error ? <p className="px-3 py-6 text-[12.5px] text-rose-600">{preview.error}</p>
                  : preview.loading && !preview.data ? <p className="flex items-center gap-2 px-3 py-6 text-[12.5px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Preparing preview…</p>
                    // Sandboxed: the template's HTML cannot run scripts or reach the page.
                    : <iframe title="Email preview" sandbox="" srcDoc={preview.data?.html || ""} className={`h-72 w-full bg-white ${preview.loading ? "opacity-60" : ""}`} />}
              </div>
              {error && <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4" />{error}</p>}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-gray-700">
          <Button onClick={onClose} disabled={sending}>{result ? "Done" : "Cancel"}</Button>
          {!result && templates.list.length > 0 && (
            <Button tone="primary" onClick={send} disabled={sending || !chosen || !ids.length}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Send to {ids.length.toLocaleString()}
            </Button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
