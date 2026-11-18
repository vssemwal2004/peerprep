import { useEffect, useId, useMemo, useRef, useState } from "react";
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

const inputClass = "block w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-normal text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100";

/**
 * Email the chosen students: pick one of the admin's own templates (Settings → Email Templates),
 * edit its subject and HTML for this send (left), see it as the first student will (right), send a
 * test to yourself, then confirm and queue it for all of them. The saved template is never changed.
 * `body` is the page's query body (period, scope…).
 */
export function SendEmailDialog({ open, onClose, studentIds, body }) {
  const api = useAnalysisApi();
  const titleId = useId();
  const htmlRef = useRef(null);
  const [templates, setTemplates] = useState({ loading: true, list: [], variables: [], error: "" });
  const [templateId, setTemplateId] = useState("");
  const [draft, setDraft] = useState({ subject: "", html: "" });
  const [shownDraft, setShownDraft] = useState({ subject: "", html: "" });
  const [preview, setPreview] = useState({ loading: false, data: null, error: "" });
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [test, setTest] = useState({ busy: false, note: "", error: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const ids = useMemo(() => [...studentIds], [studentIds]);
  const previewId = ids[0];
  const bodyKey = JSON.stringify(body || {});
  const chosen = templates.list.find((template) => template.id === templateId);
  const edited = Boolean(chosen) && (draft.subject !== chosen.subject || draft.html !== chosen.html);

  useEffect(() => {
    if (!open) return undefined;
    setResult(null); setError(""); setConfirming(false); setTest({ busy: false, note: "", error: "" });
    const controller = new AbortController();
    api.email.templates(controller.signal)
      .then((data) => {
        const list = data.templates || [];
        setTemplates({ loading: false, list, variables: data.variables || [], error: "" });
        // The ready-made "next step reminder" first, when nothing was picked yet.
        setTemplateId((current) => current || list.find((template) => template.suggested)?.id || list[0]?.id || "");
      })
      .catch((cause) => { if (cause.name !== "AbortError") setTemplates({ loading: false, list: [], variables: [], error: cause.message }); });
    return () => controller.abort();
  }, [api, open]);

  // A new template choice starts the editor from that template.
  useEffect(() => {
    if (chosen) setDraft({ subject: chosen.subject || "", html: chosen.html || "" });
  }, [chosen]);

  // The preview follows the editor, a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setShownDraft(draft), 400);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (!open || !templateId || !previewId || !shownDraft.html) { setPreview({ loading: false, data: null, error: "" }); return undefined; }
    const controller = new AbortController();
    setPreview((current) => ({ ...current, loading: true, error: "" }));
    api.email.preview({ ...JSON.parse(bodyKey), templateId, studentId: previewId, draft: shownDraft }, controller.signal)
      .then((data) => setPreview({ loading: false, data, error: "" }))
      .catch((cause) => { if (cause.name !== "AbortError") setPreview((current) => ({ ...current, loading: false, error: cause.message })); });
    return () => controller.abort();
  }, [api, bodyKey, open, previewId, templateId, shownDraft]);

  // Above the chart popup, and Escape closes only this dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !sending) { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, open, sending]);

  if (!open) return null;
  const count = ids.length.toLocaleString();
  const plural = ids.length === 1 ? "" : "s";
  const ready = Boolean(chosen) && Boolean(ids.length) && Boolean(draft.subject.trim()) && Boolean(draft.html.trim());
  const send = async () => {
    if (!ready) return;
    setSending(true); setError("");
    try { setResult(await api.email.send({ ...JSON.parse(bodyKey), templateId, studentIds: ids, draft })); setConfirming(false); }
    catch (cause) { setError(cause.message || "The email could not be sent."); setConfirming(false); }
    finally { setSending(false); }
  };
  const sendTest = async () => {
    if (!ready) return;
    setTest({ busy: true, note: "", error: "" });
    try {
      const sent = await api.email.test({ ...JSON.parse(bodyKey), templateId, studentId: previewId, draft });
      setTest({ busy: false, note: `Test sent to ${sent.sentTo} (as ${sent.asStudent} would see it).`, error: "" });
    } catch (cause) { setTest({ busy: false, note: "", error: cause.message || "The test could not be sent." }); }
  };
  // Clicking a variable puts it where the cursor is in the HTML.
  const insertVariable = (key) => {
    const token = `{{${key}}}`;
    const field = htmlRef.current;
    if (!field) { setDraft((current) => ({ ...current, html: current.html + token })); return; }
    const start = field.selectionStart ?? draft.html.length;
    const end = field.selectionEnd ?? start;
    setDraft((current) => ({ ...current, html: current.html.slice(0, start) + token + current.html.slice(end) }));
    // After React has put the new text in: cursor just after the inserted variable.
    setTimeout(() => { field.focus(); field.setSelectionRange(start + token.length, start + token.length); }, 0);
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-4" data-platform-popup-root>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => { if (!sending) onClose(); }} />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950">
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-gray-700">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><Mail className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-bold text-slate-900 dark:text-white">Send email</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">To {count} student{plural} · each email is filled in with that student’s own details</p>
          </div>
          <IconButton label="Close" onClick={onClose} disabled={sending}><X className="h-4 w-4" /></IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Left: the message (template + edits for this send). */}
              <div className="flex min-w-0 flex-col gap-3">
                <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  Start from template
                  <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={sending} className={`mt-1 h-9 ${inputClass}`}>
                    {templates.list.map((template) => <option key={template.id} value={template.id}>{template.name}{template.suggested ? " (suggested)" : ""}</option>)}
                  </select>
                </label>
                <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  Subject
                  <input value={draft.subject} maxLength={300} disabled={sending} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} className={`mt-1 h-9 ${inputClass}`} />
                </label>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">Email (HTML)</span>
                    {edited && (
                      <button type="button" onClick={() => setDraft({ subject: chosen.subject || "", html: chosen.html || "" })} className={`rounded text-[11.5px] font-semibold text-sky-700 hover:underline dark:text-sky-300 ${focusRing}`}>
                        Undo my edits
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1" aria-label="Insert a student detail">
                    {templates.variables.map((variable) => (
                      <button key={variable.key} type="button" disabled={sending} onClick={() => insertVariable(variable.key)} title={`Insert ${variable.label}`}
                        className={`rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-sky-500/15 ${focusRing}`}>
                        {`{{${variable.key}}}`}
                      </button>
                    ))}
                  </div>
                  <textarea ref={htmlRef} value={draft.html} disabled={sending} spellCheck={false} aria-label="Email HTML"
                    onChange={(event) => setDraft((current) => ({ ...current, html: event.target.value }))}
                    className={`mt-1.5 h-[300px] resize-y py-2 font-mono text-[11.5px] leading-relaxed lg:h-[380px] ${inputClass}`} />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {edited ? "Edited for this send only; the saved template stays as it is." : "Edit freely; the saved template stays as it is."} Change templates for good in{" "}
                    <Link to="/admin/settings/email-templates" className="font-semibold text-sky-700 underline dark:text-sky-300">Email Templates</Link>.
                  </p>
                </div>
              </div>

              {/* Right: exactly what the first student gets. */}
              <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-gray-700">
                <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12px] dark:border-gray-700 dark:bg-white/[0.03]">
                  <p className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
                    <span className="truncate">Preview for <span className="font-semibold text-slate-700 dark:text-slate-200">{preview.data?.name || "the first student"}</span>{preview.data?.to ? ` · ${preview.data.to}` : ""}</span>
                    {preview.loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-label="Updating preview" />}
                  </p>
                  <p className="mt-0.5 truncate font-semibold text-slate-900 dark:text-white">{preview.data?.subject || draft.subject}</p>
                </div>
                {preview.error ? <p className="px-3.5 py-6 text-[12.5px] text-rose-600">{preview.error}</p>
                  : !preview.data ? <p className="flex items-center gap-2 px-3.5 py-6 text-[12.5px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Preparing preview…</p>
                    // Sandboxed: the HTML cannot run scripts or reach the page.
                    : <iframe title="Email preview" sandbox="" srcDoc={preview.data.html || ""} className={`h-[380px] w-full flex-1 bg-white lg:h-[470px] ${preview.loading ? "opacity-70" : ""}`} />}
              </div>
            </div>
          )}
          {!result && error && <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4" />{error}</p>}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-gray-700">
          {result ? (
            <Button className="ml-auto" onClick={onClose}>Done</Button>
          ) : confirming ? (
            <>
              <p className="min-w-0 flex-1 text-[12.5px] text-slate-700 dark:text-slate-200">
                <span className="font-semibold">Send “{draft.subject}” to {count} student{plural}?</span>{" "}
                <span className="text-slate-500 dark:text-slate-400">It is queued at once; students without an email address are skipped.</span>
              </p>
              <Button onClick={() => setConfirming(false)} disabled={sending}>Back</Button>
              <Button tone="primary" onClick={send} disabled={sending}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Yes, send to {count}
              </Button>
            </>
          ) : templates.list.length > 0 ? (
            <>
              <Button onClick={sendTest} disabled={!ready || test.busy || sending} title="Sends the first student's version to your own email address">
                {test.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Send test to me
              </Button>
              <p role="status" className={`min-w-0 flex-1 truncate text-[12px] ${test.error ? "text-rose-600" : "text-emerald-700 dark:text-emerald-300"}`}>{test.error || test.note}</p>
              <Button onClick={onClose} disabled={sending}>Cancel</Button>
              <Button tone="primary" onClick={() => setConfirming(true)} disabled={!ready || sending}>
                <Send className="h-3.5 w-3.5" />Review &amp; send to {count}
              </Button>
            </>
          ) : (
            <Button className="ml-auto" onClick={onClose}>Close</Button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
