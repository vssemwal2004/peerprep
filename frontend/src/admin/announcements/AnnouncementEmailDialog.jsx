import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Mail, Send, Users, X } from 'lucide-react';
import { api } from '../../utils/api';
import StudentSelector from '../assessment/components/StudentSelector';

const input = 'block w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100';
const button = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
const secondary = `${button} border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-white/[0.05]`;
const primary = `${button} bg-sky-600 text-white hover:bg-sky-700`;

// Plain-text mode: a simple email (no design). Variables stay as {{…}} and are filled per student.
const DEFAULT_TEXT = 'Hi {{firstName}},\n\n{{announcementText}}\n\nOpen PeerPrep: {{dashboardUrl}}\n\n{{college}}';
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function textEmailToHtml(text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('\n');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#0f172a;max-width:580px;margin:0 auto;padding:16px;">\n${paragraphs}\n</div>`;
}

/**
 * "Also send as email" for an announcement: choose one of your own email templates (a ready-made
 * "Announcement email" is suggested), edit it as HTML or plain text for this send (left), see it as a
 * student will (right), choose the students below with the usual student selector, send a test to
 * yourself, then confirm. The announcement's title, content, name and button fill the template.
 * `announcement`: the form's current values (it need not be saved yet).
 */
export default function AnnouncementEmailDialog({ open, onClose, announcement, announcementId = null, onSent, initialStudents = null }) {
  const titleId = useId();
  const htmlRef = useRef(null);
  const textRef = useRef(null);
  const rolePrefix = typeof window !== 'undefined' && window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const [templates, setTemplates] = useState({ loading: true, list: [], variables: [], error: '' });
  const [templateId, setTemplateId] = useState('');
  const [mode, setMode] = useState('html');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [text, setText] = useState(DEFAULT_TEXT);
  const [students, setStudents] = useState([]);
  const [selectorBusy, setSelectorBusy] = useState(false);
  const [preview, setPreview] = useState({ loading: false, data: null, error: '' });
  const [test, setTest] = useState({ busy: false, note: '', error: '' });
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const chosen = templates.list.find((template) => template.id === templateId);
  const draft = useMemo(() => ({ subject, html: mode === 'text' ? textEmailToHtml(text) : html }), [html, mode, subject, text]);
  const [shownDraft, setShownDraft] = useState(draft);
  const ids = useMemo(() => students.map((student) => String(student._id || student.id)).filter(Boolean), [students]);
  // Only the content matters for the email (the chosen-student list can be long).
  const announcementKey = useMemo(() => {
    const { studentIds, audience, ...content } = announcement || {}; // eslint-disable-line no-unused-vars
    return JSON.stringify(content);
  }, [announcement]);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setResult(null); setError(''); setConfirming(false); setTest({ busy: false, note: '', error: '' });
    api.announcementEmailTemplates()
      .then((data) => {
        if (!live) return;
        const list = data?.templates || [];
        setTemplates({ loading: false, list, variables: data?.variables || [], error: '' });
        setTemplateId((current) => current || list.find((template) => template.suggested)?.id || list[0]?.id || '');
      })
      .catch((cause) => { if (live) setTemplates({ loading: false, list: [], variables: [], error: cause.message }); });
    return () => { live = false; };
  }, [open]);

  // An announcement for selected students starts with the same students to email.
  useEffect(() => {
    if (open && initialStudents?.length) setStudents((current) => (current.length ? current : initialStudents));
  }, [initialStudents, open]);

  const startFrom = useCallback((template) => { setSubject(template.subject || ''); setHtml(template.html || ''); }, []);
  useEffect(() => { if (chosen) startFrom(chosen); }, [chosen, startFrom]);
  useEffect(() => { const timer = setTimeout(() => setShownDraft(draft), 400); return () => clearTimeout(timer); }, [draft]);

  // The preview is rendered by the server exactly as it will be sent (first chosen student, or you).
  const previewStudent = ids[0] || null;
  useEffect(() => {
    if (!open || !templateId || !shownDraft.html.trim() || !shownDraft.subject.trim()) { setPreview({ loading: false, data: null, error: '' }); return undefined; }
    let live = true;
    setPreview((current) => ({ ...current, loading: true, error: '' }));
    api.announcementEmailPreview({ templateId, draft: shownDraft, announcement: JSON.parse(announcementKey), studentId: previewStudent })
      .then((data) => { if (live) setPreview({ loading: false, data, error: '' }); })
      .catch((cause) => { if (live) setPreview((current) => ({ ...current, loading: false, error: cause.message })); });
    return () => { live = false; };
  }, [announcementKey, open, previewStudent, shownDraft, templateId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape' && !sending) { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, open, sending]);

  if (!open) return null;
  const count = ids.length;
  const ready = Boolean(chosen) && Boolean(subject.trim()) && Boolean(draft.html.trim());
  const body = () => ({ templateId, draft, announcement: JSON.parse(announcementKey) });

  const insertVariable = (key) => {
    const token = `{{${key}}}`;
    const field = mode === 'text' ? textRef.current : htmlRef.current;
    const current = mode === 'text' ? text : html;
    const start = field?.selectionStart ?? current.length;
    const end = field?.selectionEnd ?? start;
    const next = current.slice(0, start) + token + current.slice(end);
    if (mode === 'text') setText(next); else setHtml(next);
    if (field) setTimeout(() => { field.focus(); field.setSelectionRange(start + token.length, start + token.length); }, 0);
  };
  const sendTest = async () => {
    if (!ready) return;
    setTest({ busy: true, note: '', error: '' });
    try {
      const sent = await api.announcementEmailTest({ ...body(), studentId: previewStudent });
      setTest({ busy: false, note: `Test sent to ${sent.sentTo} (as ${sent.asStudent} would see it).`, error: '' });
    } catch (cause) { setTest({ busy: false, note: '', error: cause.message || 'The test could not be sent.' }); }
  };
  const send = async () => {
    if (!ready || !count) return;
    setSending(true); setError('');
    try {
      const sent = await api.announcementEmailSend({ ...body(), studentIds: ids, announcementId });
      setResult(sent); setConfirming(false); onSent?.(sent);
    } catch (cause) { setError(cause.message || 'The email could not be sent.'); setConfirming(false); }
    finally { setSending(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-2 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={() => { if (!sending) onClose(); }} />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-950">
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-gray-700">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><Mail className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-bold text-slate-900 dark:text-white">Send this announcement as an email</h2>
            <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">“{announcement?.title || 'Untitled'}” · each email is filled in with that student’s own details</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {result ? (
            <div className="space-y-2 text-[13px]">
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Email queued for {Number(result.queued).toLocaleString()} student{result.queued === 1 ? '' : 's'}.
              </p>
              {result.noEmail > 0 ? <p className="text-slate-600 dark:text-slate-300">{result.noEmail} {result.noEmail === 1 ? 'student has' : 'students have'} no email address and {result.noEmail === 1 ? 'was' : 'were'} skipped.</p> : null}
              {result.notFound > 0 ? <p className="text-slate-600 dark:text-slate-300">{result.notFound} could not be reached (not your students, or removed) and {result.notFound === 1 ? 'was' : 'were'} skipped.</p> : null}
              <p className="text-slate-500 dark:text-slate-400">Emails go out in the background. <Link to={`${rolePrefix}/email-queue`} className="font-semibold text-sky-700 underline dark:text-sky-300">Open Email Queue</Link> to follow them.</p>
            </div>
          ) : templates.loading ? (
            <p className="flex items-center gap-2 py-8 text-[12.5px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading templates…</p>
          ) : templates.error ? (
            <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4" />{templates.error}</p>
          ) : !templates.list.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-[13px] text-slate-600 dark:border-gray-700 dark:text-slate-300">
              <p className="font-semibold text-slate-800 dark:text-white">No email template yet</p>
              <Link to={`${rolePrefix}/settings/email-templates`} className="mt-2 inline-flex font-semibold text-sky-700 underline dark:text-sky-300">Open Email Templates</Link>
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Left: the email (template + edits for this send). */}
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300">Email template
                      <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={sending} className={`mt-1 h-9 ${input}`}>
                        {templates.list.map((template) => <option key={template.id} value={template.id}>{template.name}{template.suggested ? ' (suggested)' : ''}</option>)}
                      </select>
                    </label>
                    <label className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300">Subject
                      <input value={subject} maxLength={300} disabled={sending} onChange={(event) => setSubject(event.target.value)} className={`mt-1 h-9 ${input}`} />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div role="tablist" aria-label="Write the email as" className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]">
                      {[['html', 'Design (HTML)'], ['text', 'Plain text']].map(([value, label]) => (
                        <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={sending} onClick={() => setMode(value)}
                          className={`h-7 rounded-md px-3 text-[12px] font-semibold transition-colors ${mode === value ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>{label}</button>
                      ))}
                    </div>
                    {chosen && (subject !== chosen.subject || html !== chosen.html) && mode === 'html'
                      ? <button type="button" onClick={() => startFrom(chosen)} className="text-[11.5px] font-semibold text-sky-700 hover:underline dark:text-sky-300">Undo my edits</button> : null}
                  </div>
                  <div className="flex flex-wrap gap-1" aria-label="Insert a detail">
                    {templates.variables.map((variable) => (
                      <button key={variable.key} type="button" disabled={sending} onClick={() => insertVariable(variable.key)} title={`Insert ${variable.label}`}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-700 hover:bg-sky-100 hover:text-sky-800 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-sky-500/15">{`{{${variable.key}}}`}</button>
                    ))}
                  </div>
                  {mode === 'text' ? (
                    <>
                      <textarea ref={textRef} value={text} disabled={sending} aria-label="Email text" onChange={(event) => setText(event.target.value)}
                        className={`h-[300px] resize-y px-3 py-2.5 text-[13.5px] leading-[1.7] lg:h-[360px] ${input}`} />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">A simple email without the template’s design. Blank line = new paragraph. <code className="font-mono">{'{{announcementText}}'}</code> is the announcement’s text.</p>
                    </>
                  ) : (
                    <>
                      <textarea ref={htmlRef} value={html} disabled={sending} spellCheck={false} aria-label="Email HTML" onChange={(event) => setHtml(event.target.value)}
                        className={`h-[300px] resize-y py-2 font-mono text-[11.5px] leading-relaxed lg:h-[360px] ${input}`} />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Edits apply to this send only. <code className="font-mono">{'{{announcementContent}}'}</code> puts in your formatted announcement, <code className="font-mono">{'{{buttonBlock}}'}</code> its button. Change the template for good in{' '}
                        <Link to={`${rolePrefix}/settings/email-templates`} className="font-semibold text-sky-700 underline dark:text-sky-300">Email Templates</Link>.
                      </p>
                    </>
                  )}
                </div>

                {/* Right: exactly what a student gets. */}
                <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-gray-700">
                  <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12px] dark:border-gray-700 dark:bg-white/[0.03]">
                    <p className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
                      <span className="truncate">Preview for <span className="font-semibold text-slate-700 dark:text-slate-200">{preview.data?.name || (count ? 'the first student' : 'you')}</span>{preview.data?.to ? ` · ${preview.data.to}` : ''}</span>
                      {preview.loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-label="Updating preview" /> : null}
                    </p>
                    <p className="mt-0.5 truncate font-semibold text-slate-900 dark:text-white">{preview.data?.subject || subject}</p>
                  </div>
                  {preview.error ? <p className="px-3.5 py-6 text-[12.5px] text-rose-600">{preview.error}</p>
                    : !preview.data ? <p className="flex items-center gap-2 px-3.5 py-6 text-[12.5px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Preparing preview…</p>
                      // Sandboxed: the HTML cannot run scripts or reach the page.
                      : <iframe title="Email preview" sandbox="" srcDoc={preview.data.html || ''} className={`h-[360px] w-full flex-1 bg-white lg:h-[430px] ${preview.loading ? 'opacity-70' : ''}`} />}
                </div>
              </div>

              {/* Below: who gets it, with the same student selector as assessments and events. */}
              <section className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-gray-700" aria-labelledby={`${titleId}-students`}>
                <h3 id={`${titleId}-students`} className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900 dark:text-white">
                  <Users className="h-4 w-4 text-sky-600" />Students to email
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11.5px] tabular-nums text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20">{count.toLocaleString()} selected</span>
                </h3>
                <div className="mt-3"><StudentSelector selected={students} onChange={setStudents} onBusyChange={setSelectorBusy} /></div>
              </section>
            </>
          )}
          {!result && error ? <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4" />{error}</p> : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-gray-700">
          {result ? <button type="button" className={`${secondary} ml-auto`} onClick={onClose}>Done</button>
            : confirming ? (
              <>
                <p className="min-w-0 flex-1 text-[12.5px] text-slate-700 dark:text-slate-200"><span className="font-semibold">Send “{subject}” to {count.toLocaleString()} student{count === 1 ? '' : 's'}?</span> <span className="text-slate-500 dark:text-slate-400">It is queued at once; students without an email address are skipped.</span></p>
                <button type="button" className={secondary} onClick={() => setConfirming(false)} disabled={sending}>Back</button>
                <button type="button" className={primary} onClick={send} disabled={sending}>{sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Yes, send to {count.toLocaleString()}</button>
              </>
            ) : templates.list.length ? (
              <>
                <button type="button" className={secondary} onClick={sendTest} disabled={!ready || test.busy || sending} title="Sends it to your own email address">
                  {test.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Send test to me
                </button>
                <p role="status" className={`min-w-0 flex-1 truncate text-[12px] ${test.error ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-300'}`}>{test.error || test.note}</p>
                <button type="button" className={secondary} onClick={onClose} disabled={sending}>Cancel</button>
                <button type="button" className={primary} onClick={() => setConfirming(true)} disabled={!ready || !count || sending || selectorBusy}
                  title={count ? undefined : 'Choose students below first'}>
                  <Send className="h-3.5 w-3.5" />{count ? `Review & send to ${count.toLocaleString()}` : 'Choose students to send'}
                </button>
              </>
            ) : <button type="button" className={`${secondary} ml-auto`} onClick={onClose}>Close</button>}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
